const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    const images = [];
    class ControlledImage {
        constructor() {
            this.naturalWidth = 2400;
            this.naturalHeight = 3600;
            this.dataset = {};
            this.style = {};
            this.decoded = new Promise(resolve => { this.finishDecode = resolve; });
            images.push(this);
        }
        decode() { return this.decoded; }
        removeAttribute(name) { if (name === 'src') delete this.src; }
    }
    const context = vm.createContext({ console, Image: ControlledImage, setTimeout, clearTimeout,
        document: { getElementById: () => null }, matchMedia: () => ({ matches: true }) });
    context.window = context;
    function run(name) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context, { filename: name });
    }
    run('shared.js');
    Object.assign(context.BilibiliToolbox, {
        storage: { getSetting: (_key, fallback) => fallback, async setSetting() {} },
        bilibiliDom: {}, comicImages: { collectImages: () => [] }
    });
    for (const file of ['animations.js', 'reader-preferences.js', 'reader-screenshot.js',
        'reader-transform.js', 'reader-selection.js', 'reader-dom.js', 'reader-thumbnails.js', 'reader-settings.js',
        'reader-touch.js', 'comic-reader-page-groups.js', 'comic-reader-interactions.js', 'reader-image-loader.js', 'comic-reader.js']) run(file);
    const reader = new context.BilibiliToolbox.reader.BiliComicReader();
    reader.isOpen = true;
    const oldImage = { src: 'old', style: {} };
    const container = {
        style: {}, children: [oldImage], replacements: 0,
        get firstChild() { return this.children[0]; },
        querySelectorAll() { return this.children; },
        replaceChildren(...children) { this.children = children; this.replacements += 1; },
        getBoundingClientRect: () => ({})
    };
    reader.el = { imgContainer: container, reader: { remove() {} } };
    reader.viewMode = 'single';
    reader.animationMode = 'smooth';
    reader.applyTransform = () => {};
    reader.getTransformStyle = () => 'scale(0.2)';
    reader.setupImagesForRenderMode = () => {};
    reader.updateFitScale = () => {};
    reader.updatePageInfo = () => {};
    reader.preloadImages = () => {};
    reader.cancelScreenshotSelection = () => {};
    reader.hideSettingsPanel = () => {};
    reader.showReaderMessage = text => { reader.lastMessage = text; };
    return { reader, container, images, oldImage, context, animations: context.BilibiliToolbox.animations };
}

test('original image remains visible until decoding finishes, then swaps atomically', async () => {
    const { reader, container, images, oldImage } = fixture();
    reader.imgList = ['large-original'];
    const rendering = reader.render(false);
    assert.equal(container.firstChild, oldImage);
    images[0].onload();
    await tick();
    assert.equal(container.firstChild, oldImage, 'network completion is not decode completion');
    assert.equal(container.style.opacity, '1');
    assert.equal(container.replacements, 0);
    images[0].finishDecode();
    await rendering;
    assert.equal(container.firstChild, images[0]);
    assert.equal(container.replacements, 1);
});

test('resize bursts coalesce without reloading images and close cancels pending work', () => {
    const { reader, context } = fixture();
    const frames = new Map();
    context.requestAnimationFrame = fn => { frames.set(1, fn); return 1; };
    context.cancelAnimationFrame = id => frames.delete(id);
    let layouts = 0;
    reader.applyResponsiveLayout = () => layouts++;
    reader.render = () => assert.fail('resize must not reload the page');
    for (let i = 0; i < 20; i++) reader.handleResize();
    assert.equal(frames.size, 1);
    const callback = frames.get(1);
    frames.clear();
    callback();
    assert.equal(layouts, 1);
    reader.handleResize();
    reader.close();
    assert.equal(frames.size, 0);
    assert.equal(layouts, 1);
});

test('cached originals prepare a fresh decoded frame while the visible page stays intact', async () => {
    const { reader, container, images, oldImage } = fixture();
    reader.imgList = ['cached-original'];
    const warmup = reader.loadImage(reader.imgList[0], true);
    images[0].onload(); images[0].finishDecode();
    await warmup;
    let finishFrame, decodes = 0;
    images[0].decode = () => {
        decodes++;
        return new Promise(resolve => { finishFrame = resolve; });
    };
    const rendering = reader.render();
    const concurrent = reader.loadImage(reader.imgList[0]);
    await tick();
    assert.equal(decodes, 1, 'foreground requests share the ongoing frame decode');
    assert.equal(images.length, 1, 'a cached original does not start another image request');
    assert.equal(container.firstChild, oldImage);
    assert.equal(container.replacements, 0);
    finishFrame();
    await Promise.all([rendering, concurrent]);
    assert.equal(container.firstChild, images[0]);
    assert.equal(container.replacements, 1);

    const cancelled = reader.loadImage(reader.imgList[0]);
    await tick();
    reader.imageLoader.releaseCachedImage(reader.imgList[0]);
    assert.equal(await cancelled, null, 'releasing an image unblocks a pending cached decode');
    finishFrame();
    await tick();
});

test('a late render of the same index cannot overwrite a newer render', async () => {
    const { reader, container, images } = fixture();
    reader.imgList = ['old-quality'];
    const first = reader.render(false);
    images[0].onload();
    reader.imgList = ['new-quality'];
    const second = reader.render(false);
    images[1].onload(); images[1].finishDecode();
    await second;
    images[0].finishDecode();
    await first;
    assert.equal(container.firstChild.src, 'new-quality');
    assert.equal(container.replacements, 1);
});

test('closing during image loading prevents later rendering into a removed reader', async () => {
    const { reader, container, images } = fixture();
    reader.imgList = ['pending'];
    const pending = reader.render(false);
    reader.close(true);
    await pending;
    assert.match(images[0].src, /^data:image\/gif/);
    assert.equal(images[0].onload, null);
    assert.equal(reader.preloadActive, null);
    assert.equal(reader.imgList.length, 0);
    assert.equal(await reader.loadImage('after-close'), null);
    assert.equal(container.children.length, 0, 'closing detaches displayed images');
});

test('failed image loading keeps the visible page and restores its navigation index', async () => {
    const { reader, container, images, oldImage } = fixture();
    reader.imgList = ['old', 'broken'];
    reader.currentIndex = 1;
    const pending = reader.render(false);
    images[0].onerror();
    await pending;
    assert.equal(container.firstChild, oldImage);
    assert.equal(reader.currentIndex, 0);
    assert.match(reader.lastMessage, /加载失败/);
    assert.equal(reader.imageCache.has('broken'), false);
});

test('background originals decode serially, foreground requests reuse them, and close cancels the queue', async () => {
    const { reader, images, context } = fixture();
    const timers = new Map();
    let timerId = 0;
    context.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
    context.clearTimeout = id => timers.delete(id);
    const runNext = () => {
        const [id, fn] = timers.entries().next().value;
        timers.delete(id);
        return fn();
    };
    reader.preloadImages = Object.getPrototypeOf(reader).preloadImages.bind(reader);
    reader.preloadPages = '4';
    reader.imgList = Array.from({ length: 10 }, (_, i) => `p${i}`);
    reader.preloadImages(2);
    assert.equal(images.length, 0, 'preloading yields before starting');
    const firstRun = runNext();
    assert.equal(images.length, 1);
    assert.equal(images[0].fetchPriority, 'low');
    const foreground = reader.loadImage('p2');
    assert.equal(images[0].fetchPriority, 'high');
    assert.equal(images.length, 1, 'visible requests reuse in-flight originals');
    reader.currentIndex = 4;
    reader.preloadImages(6);
    const secondRun = runNext();
    assert.equal(images.length, 1, 'navigation does not start another background decode');
    images[0].onload(); images[0].finishDecode();
    await firstRun;
    await foreground;
    await tick();
    assert.equal(images.length, 2);
    assert.equal(images[1].src, 'p6', 'the stale queue must not load p3');
    reader.close();
    await secondRun;
    assert.match(images[1].src, /^data:image\/gif/);
    assert.equal(timers.size, 0);
    assert.deepEqual([...reader.imageCache.keys()], ['p2'], 'closing preserves decoded pages and cancels the pending background image');
});

test('page memory policy retains loaded originals without distance or pixel budget eviction', async () => {
    const { reader, images } = fixture();
    reader.imgList = Array.from({ length: 10 }, (_, i) => `p${i}`);
    for (let i = 0; i < 10; i++) {
        const pending = reader.loadImage(`p${i}`);
        images[i].onload(); images[i].finishDecode();
        await pending;
    }
    reader.currentIndex = reader.displayedIndex = 8;
    reader.pruneImageCache();
    assert.equal(reader.imageCache.size, 10, 'more than 64 million decoded pixels stay cached until the page closes');
    assert.ok(images.every(img => /^p\d+$/.test(img.src)));
    reader.close(true);
});

test('previous memory policy releases pages only after a successful swap and reloads a backward page', async () => {
    const { reader, container, images } = fixture();
    reader.imageMemoryPolicy = 'previous';
    reader.imgList = ['p0', 'p1', 'p2', 'p3'];
    for (const src of ['p0', 'p1']) {
        const pending = reader.loadImage(src);
        const image = images.at(-1);
        image.onload(); image.finishDecode();
        await pending;
    }
    container.children = [images[0]];
    reader.currentIndex = 2;
    reader.pruneImageCache();
    assert.deepEqual([...reader.imageCache.keys()], ['p0', 'p1'], 'requested navigation cannot free pages before the displayed index');
    const forward = reader.render(false);
    assert.equal(container.firstChild.src, 'p0');
    assert.equal(images[0].src, 'p0', 'the visible page remains decoded while the replacement loads');
    images[2].onload(); images[2].finishDecode();
    await forward;
    assert.equal(reader.displayedIndex, 2);
    assert.equal(container.firstChild.src, 'p2');
    assert.deepEqual([...reader.imageCache.keys()], ['p2']);
    assert.match(images[0].src, /^data:image\/gif/);
    assert.match(images[1].src, /^data:image\/gif/);

    reader.currentIndex = 1;
    const backward = reader.render(false);
    assert.equal(images.length, 4, 'a released backward page issues a fresh request');
    assert.equal(images[3].src, 'p1');
    assert.equal(container.firstChild.src, 'p2');
    images[3].onload(); images[3].finishDecode();
    await backward;
    assert.equal(reader.displayedIndex, 1);
    assert.equal(container.firstChild.src, 'p1');
    assert.deepEqual([...reader.imageCache.keys()], ['p2', 'p1'], 'the current page and pages ahead remain cached');
    reader.close();
    assert.deepEqual([...reader.imageCache.keys()], ['p2', 'p1'], 'overlay closure keeps the current and future pages reusable');
    reader.close(true);
    assert.equal(reader.imageCache.size, 0, 'closing the article page clears the remaining decoded images');
});

test('previous memory policy keeps earlier pages when a forward request fails', async () => {
    const { reader, container, images } = fixture();
    reader.imageMemoryPolicy = 'previous';
    reader.imgList = ['p0', 'p1', 'broken'];
    for (const src of ['p0', 'p1']) {
        const pending = reader.loadImage(src);
        const image = images.at(-1);
        image.onload(); image.finishDecode();
        await pending;
    }
    container.children = [images[0]];
    reader.currentIndex = 2;
    const failed = reader.render(false);
    images[2].onerror();
    await failed;
    assert.equal(reader.currentIndex, 0);
    assert.equal(reader.displayedIndex, 0);
    assert.equal(container.firstChild.src, 'p0');
    assert.deepEqual([...reader.imageCache.keys()], ['p0', 'p1'], 'a failed requested index is never treated as the displayed page');
    reader.close(true);
});

test('auto-mode backward probing preserves reloaded image dimensions until page grouping completes', async () => {
    for (const wide of [true, false]) {
        const { reader, container, images } = fixture();
        reader.imageMemoryPolicy = 'previous';
        reader.imgList = ['p0', 'p1', 'p2', 'p3', 'p4'];
        reader.currentIndex = reader.displayedIndex = 4;
        const visible = reader.render(false);
        images[0].onload(); images[0].finishDecode();
        await visible;
        reader.viewMode = 'auto';
        const probing = reader.getPreviousPageGroupIndex();
        const probe = images[1];
        // A released browser image reports the dimensions of its transparent
        // replacement. Model that so an early release changes grouping itself.
        Object.defineProperties(probe, {
            naturalWidth: { get() { return this.src === 'p3' ? (wide ? 4800 : 2400) : 1; } },
            naturalHeight: { get() { return this.src === 'p3' ? (wide ? 2000 : 3600) : 1; } }
        });
        probe.onload(); probe.finishDecode();
        const previousIndex = await probing;
        assert.equal(previousIndex, wide ? 3 : 2);
        assert.equal(probe.src, 'p3', 'width probing cannot discard its own decoded image');
        assert.equal(container.firstChild.src, 'p4', 'probing leaves the visible page intact');
        reader.currentIndex = previousIndex;
        const backward = reader.render(false);
        if (!wide) {
            assert.equal(images[2].src, 'p2');
            images[2].onload(); images[2].finishDecode();
        }
        await backward;
        assert.deepEqual(container.children.map(img => img.src), wide ? ['p3'] : ['p2', 'p3']);
        assert.equal(images.length, wide ? 2 : 3, 'rendering reuses the page already decoded for grouping');
        reader.close(true);
    }
});

test('page memory policy detaches the overlay, retains decoded pages for reopening, and clears on page close or destroy', async () => {
    for (const exit of ['pagehide', 'destroy']) {
        const { reader, container, images } = fixture();
        reader.imgList = ['p0', 'pending'];
        const ready = reader.render(false);
        images[0].onload(); images[0].finishDecode();
        await ready;
        const unfinished = reader.loadImage('pending');
        const lateLoad = images[1].onload;
        reader.close();
        assert.equal(await unfinished, null);
        assert.equal(container.children.length, 0);
        assert.deepEqual([...reader.imageCache.keys()], ['p0']);
        assert.equal(images[0].src, 'p0', 'overlay close does not discard a decoded image');
        lateLoad(); images[1].finishDecode();
        await tick();
        assert.deepEqual([...reader.imageCache.keys()], ['p0'], 'late completion cannot restore cancelled requests');
        reader.isOpen = true;
        assert.equal(await reader.loadImage('p0'), images[0]);
        assert.equal(images.length, 2, 'reopening reuses the decoded image');
        if (exit === 'destroy') reader.destroy();
        else reader.close(true);
        assert.equal(reader.imageCache.size, 0);
        assert.match(images[0].src, /^data:image\/gif/);
    }
});

function entryFixture() {
    const h = fixture();
    const timers = new Map();
    const observers = [];
    let timerId = 0;
    let timerClock = 0;
    h.context.setTimeout = (fn, delay = 0) => {
        timers.set(++timerId, { fn, due: timerClock + delay });
        return timerId;
    };
    h.context.clearTimeout = id => timers.delete(id);
    h.context.MutationObserver = class {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() { this.connected = true; }
        disconnect() { this.connected = false; }
    };
    h.context.document.body = {};
    h.reader.isOpen = false;
    h.reader.preloadImages = Object.getPrototypeOf(h.reader).preloadImages.bind(h.reader);
    const runNext = () => {
        const [id, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        timers.delete(id);
        timerClock = timer.due;
        return timer.fn();
    };
    return { ...h, timers, observers, runNext };
}

test('slow auto-mode backward probing survives background and settings cache pruning', async () => {
    const { reader, container, images, timers, runNext, context } = entryFixture();
    reader.isOpen = true;
    reader.viewMode = 'auto';
    reader.preloadPages = '4';
    reader.imageMemoryPolicy = 'previous';
    reader.imgList = Array.from({ length: 10 }, (_, i) => `p${i}`);
    reader.currentIndex = reader.displayedIndex = 4;
    context.matchMedia = () => ({ matches: true });
    const current = reader.loadImage('p4');
    images[0].onload(); images[0].finishDecode();
    await current;
    container.children = [images[0]];
    reader.preloadImages(5);
    const turning = reader.turnPage(null, -1);
    const probe = images[1];
    Object.defineProperties(probe, {
        naturalWidth: { get() { return this.src === 'p3' ? 4800 : 1; } },
        naturalHeight: { get() { return this.src === 'p3' ? 2000 : 1; } }
    });
    probe.onload();
    const background = runNext();
    assert.equal(images[2].src, 'p5');
    assert.equal(probe.src, 'p3', 'the queued background preload cannot release an undecoded width probe');
    reader.preloadPages = '6';
    reader.syncImageLoadingSettings();
    assert.equal(probe.src, 'p3', 'changing loading settings keeps the active backward probe protected');
    assert.equal(container.firstChild.src, 'p4');
    probe.finishDecode();
    await turning;
    await tick();
    assert.equal(reader.currentIndex, 3, 'wide predecessors navigate back one page after the slow decode');
    assert.equal(container.firstChild.src, 'p3');
    assert.equal(images.length, 3, 'the committed page reuses its width-probe request');
    reader.close(true);
    await background;
    assert.equal(timers.size, 0);
});

test('previous memory policy clears obsolete quality URLs while retaining the visible image until replacement commits', async () => {
    const { reader, container, images } = fixture();
    reader.imageMemoryPolicy = 'previous';
    reader.imgList = ['old0', 'old1', 'old2', 'old3'];
    for (const src of reader.imgList) {
        const pending = reader.loadImage(src);
        const image = images.at(-1);
        image.onload(); image.finishDecode();
        await pending;
    }
    reader.currentIndex = reader.displayedIndex = 1;
    container.children = [images[1]];
    reader.collectReaderImages = () => ['new0', 'new1', 'new2', 'new3'];
    reader.imageRenderMode = 'sharp';
    reader.refreshImagesForRenderMode();
    assert.deepEqual([...reader.imageCache.keys()], ['old1', 'new1'], 'obsolete non-visible URLs are removed even if their old index was ahead');
    for (const index of [0, 2, 3]) assert.match(images[index].src, /^data:image\/gif/);
    assert.equal(container.firstChild.src, 'old1', 'the old quality stays visible while replacement decoding is pending');
    images[4].onload(); images[4].finishDecode();
    await tick();
    assert.equal(container.firstChild.src, 'new1');
    assert.deepEqual([...reader.imageCache.keys()], ['new1'], 'the old visible URL is released after its replacement commits');
    assert.match(images[1].src, /^data:image\/gif/);
    reader.close(true);
});

for (const setting of ['2', '4', '6', 'all']) {
    test(`readable page warms ${setting} configured pages and foreground loading reuses them`, async () => {
        const { reader, images, timers, observers, runNext } = entryFixture();
        const urls = Array.from({ length: 10 }, (_, i) => `p${i}`);
        const count = setting === 'all' ? urls.length : Number(setting);
        reader.preloadPages = setting;
        reader.collectReaderImages = () => urls;
        reader.prepareImages();
        reader.prepareImages();
        assert.equal(observers.length, 1, 'repeated preparation does not duplicate observers');
        assert.equal(observers[0].connected, setting === 'all', 'all mode keeps watching for more article images');
        for (let i = 0; i < count; i++) {
            const loading = runNext();
            assert.equal(images.length, i + 1, 'warmup stays serial');
            assert.equal(images[i].src, `p${i}`);
            images[i].onload(); images[i].finishDecode();
            await loading;
        }
        assert.equal(timers.size, 0);
        assert.equal(reader.isOpen, false, 'warmup does not open the reader');
        assert.equal(reader.imageCache.size, count);
        if (setting === 'all') {
            assert.ok([...reader.imageCache.values()].reduce((sum, entry) => sum + entry.pixels, 0) > 64e6,
                'all loads every page even when decoded pixels exceed the old budget');
        }
        reader.isOpen = true;
        reader.stopPreparingImages();
        assert.equal(await reader.loadImage('p0'), images[0]);
        assert.equal(images.length, count, 'opening does not issue another request');
        reader.close(true);
    });

    test(setting === 'all' ? 'reading preloads all pages from the article beginning' :
        `reading preloads ${setting} pages following the visible group`, async () => {
        const { reader, images, timers, runNext } = entryFixture();
        reader.isOpen = true;
        reader.preloadPages = setting;
        reader.imgList = Array.from({ length: 12 }, (_, i) => `p${i}`);
        reader.currentIndex = reader.displayedIndex = 1;
        reader.activePageCount = 2;
        reader.preloadImages(3);
        const count = setting === 'all' ? 12 : Number(setting);
        for (let i = 0; i < count; i++) {
            const loading = runNext();
            assert.equal(images.length, i + 1);
            assert.equal(images[i].src, `p${i + (setting === 'all' ? 0 : 3)}`);
            images[i].onload(); images[i].finishDecode();
            await loading;
        }
        assert.equal(timers.size, 0, 'preloading stops at the configured boundary or the end of the article');
        assert.equal(reader.imageCache.size, count);
        reader.close(true);
    });
}

test('enabling all in the middle of an article fills the first page and cached-page gaps in order', async () => {
    const { reader, images, timers, runNext } = entryFixture();
    reader.isOpen = true;
    reader.preloadPages = '2';
    reader.imgList = Array.from({ length: 9 }, (_, i) => `p${i}`);
    reader.currentIndex = reader.displayedIndex = 6;
    for (const src of ['p1', 'p3', 'p6']) {
        const cached = reader.loadImage(src);
        const image = images.at(-1);
        image.onload(); image.finishDecode();
        await cached;
    }
    reader.preloadPages = 'all';
    reader.syncImageLoadingSettings();
    const missing = ['p0', 'p2', 'p4', 'p5', 'p7', 'p8'];
    for (let i = 0; i < missing.length; i++) {
        const loading = runNext();
        assert.equal(images.length, i + 4, 'all preloading creates one request at a time');
        const image = images.at(-1);
        assert.equal(image.src, missing[i]);
        image.onload(); image.finishDecode();
        await loading;
    }
    assert.deepEqual(images.slice(3).map(img => img.src), missing, 'all fills every hole from page one instead of starting after the current page');
    assert.equal(reader.imageCache.size, 9);
    assert.equal(timers.size, 0);
    reader.close(true);
});

test('restarting all after navigation continues the earliest missing page instead of jumping past the current page', async () => {
    const { reader, images, timers, runNext } = entryFixture();
    reader.isOpen = true;
    reader.preloadPages = 'all';
    reader.imgList = Array.from({ length: 9 }, (_, i) => `p${i}`);
    reader.currentIndex = reader.displayedIndex = 5;
    reader.preloadImages(6);
    const first = runNext();
    assert.equal(images[0].src, 'p0');
    images[0].onload(); images[0].finishDecode();
    await first;
    reader.currentIndex = reader.displayedIndex = 7;
    reader.preloadImages(8);
    const second = runNext();
    assert.equal(images[1].src, 'p1');
    reader.currentIndex = reader.displayedIndex = 8;
    reader.preloadImages(9);
    const restarted = runNext();
    assert.equal(images.length, 2, 'queue restart waits for the existing background decode');
    images[1].onload(); images[1].finishDecode();
    await second;
    await tick();
    assert.equal(images[2].src, 'p2');
    images[2].onload(); images[2].finishDecode();
    await restarted;
    for (let i = 3; i < 9; i++) {
        const loading = runNext();
        assert.equal(images[i].src, `p${i}`);
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    assert.deepEqual(images.map(img => img.src), reader.imgList);
    assert.equal(timers.size, 0);
    reader.close(true);
});

test('all waits for a cached earlier page to finish decoding before starting the next background request', async () => {
    const { reader, images, timers, runNext } = entryFixture();
    reader.isOpen = true;
    reader.preloadPages = 'all';
    reader.imgList = ['p0', 'p1', 'p2'];
    reader.currentIndex = reader.displayedIndex = 2;
    const foreground = reader.loadImage('p0');
    reader.preloadImages(3);
    const first = runNext();
    assert.equal(images.length, 1, 'an in-flight cache entry is awaited rather than skipped');
    images[0].onload();
    await tick();
    assert.equal(images.length, 1, 'network completion alone cannot start the following background decode');
    images[0].finishDecode();
    assert.equal(await foreground, images[0]);
    await first;
    const next = runNext();
    assert.equal(images.length, 2);
    assert.equal(images[1].src, 'p1');
    images[1].onload(); images[1].finishDecode();
    await next;
    const last = runNext();
    assert.equal(images[2].src, 'p2');
    images[2].onload(); images[2].finishDecode();
    await last;
    assert.equal(timers.size, 0);
    reader.close(true);
});

test('all with previous-page release does not preload discarded pages before the displayed page again', async () => {
    const { reader, container, images, timers, runNext } = entryFixture();
    reader.isOpen = true;
    reader.preloadPages = 'all';
    reader.imageMemoryPolicy = 'previous';
    reader.imgList = Array.from({ length: 8 }, (_, i) => `p${i}`);
    for (let i = 0; i <= 4; i++) {
        const cached = reader.loadImage(`p${i}`);
        images[i].onload(); images[i].finishDecode();
        await cached;
    }
    reader.currentIndex = reader.displayedIndex = 4;
    container.children = [images[4]];
    reader.pruneImageCache();
    assert.deepEqual([...reader.imageCache.keys()], ['p4']);
    reader.preloadImages(5);
    for (let i = 5; i < 8; i++) {
        const loading = runNext();
        assert.equal(images.length, i + 1);
        assert.equal(images[i].src, `p${i}`, 'released predecessors are skipped during all preloading');
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    assert.deepEqual([...reader.imageCache.keys()], ['p4', 'p5', 'p6', 'p7']);
    assert.ok(images.slice(0, 4).every(img => /^data:image\/gif/.test(img.src)));
    assert.equal(timers.size, 0);
    reader.close(true);
});

test('all preloading observes later article images without reloading already decoded pages', async () => {
    const { reader, images, timers, observers, runNext } = entryFixture();
    let urls = ['p0', 'p1'];
    reader.preloadPages = 'all';
    reader.collectReaderImages = () => [...urls];
    reader.prepareImages();
    for (let i = 0; i < 2; i++) {
        const loading = runNext();
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    assert.equal(timers.size, 0);
    assert.equal(observers[0].connected, true);
    urls = ['p0', 'p1', 'p2', 'p3'];
    observers[0].callback();
    observers[0].callback();
    assert.equal(timers.size, 1, 'DOM updates coalesce');
    runNext();
    for (let i = 2; i < 4; i++) {
        const loading = runNext();
        assert.equal(images.length, i + 1);
        assert.equal(images[i].src, `p${i}`);
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    assert.equal(reader.imageCache.size, 4);
    assert.equal(timers.size, 0);
    reader.close(true);
    assert.equal(observers[0].connected, false);
});

test('shrinking an all-preload article cancels removed pages even when the remaining prefix is unchanged', async () => {
    for (const remaining of [2, 0]) {
        const { reader, images, timers, observers, runNext } = entryFixture();
        let urls = ['p0', 'p1', 'p2', 'p3'];
        reader.preloadPages = 'all';
        reader.collectReaderImages = () => [...urls];
        reader.prepareImages();
        const first = runNext();
        images[0].onload(); images[0].finishDecode();
        await first;
        urls = urls.slice(0, remaining);
        observers[0].callback();
        runNext(); // The DOM refresh runs before the queued next page.
        if (remaining) {
            const last = runNext();
            assert.equal(images[1].src, 'p1');
            images[1].onload(); images[1].finishDecode();
            await last;
        }
        assert.equal(timers.size, 0, 'removed pages leave no background queue behind');
        assert.deepEqual(images.map(img => img.src), remaining ? ['p0', 'p1'] : ['p0'], 'the old queue cannot continue beyond the new article list');
        assert.deepEqual(Array.from(reader.imgList), urls);
        reader.close(true);
    }
});

test('increasing entry preload settings loads the additional pages and reuses the earlier ones', async () => {
    const { reader, images, timers, runNext } = entryFixture();
    reader.preloadPages = '2';
    reader.collectReaderImages = () => Array.from({ length: 8 }, (_, i) => `p${i}`);
    reader.prepareImages();
    for (let i = 0; i < 2; i++) {
        const loading = runNext();
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    reader.preloadPages = '6';
    reader.syncImageLoadingSettings();
    for (let i = 2; i < 6; i++) {
        const loading = runNext();
        assert.equal(images.length, i + 1);
        assert.equal(images[i].src, `p${i}`);
        images[i].onload(); images[i].finishDecode();
        await loading;
    }
    assert.equal(timers.size, 0);
    assert.equal(reader.imageCache.size, 6);
    reader.close(true);
});

test('reducing all preloading during decode cancels the stale queue without concurrent background requests', async () => {
    const { reader, images, timers, runNext } = entryFixture();
    reader.preloadPages = 'all';
    reader.collectReaderImages = () => Array.from({ length: 8 }, (_, i) => `p${i}`);
    reader.prepareImages();
    const originalQueue = runNext();
    images[0].onload();
    reader.preloadPages = '2';
    reader.syncImageLoadingSettings();
    const replacementQueue = runNext();
    assert.equal(images.length, 1, 'the replacement queue waits for the active decode');
    images[0].finishDecode();
    await originalQueue;
    await tick();
    assert.equal(images.length, 2);
    assert.equal(images[1].src, 'p1');
    images[1].onload(); images[1].finishDecode();
    await replacementQueue;
    assert.equal(timers.size, 0);
    assert.deepEqual(images.map(img => img.src), ['p0', 'p1'], 'the old all queue cannot continue after the preference changes');
    reader.close(true);
});

test('late article images trigger warmup and leaving the page cancels pending decode and observation', async () => {
    const { reader, images, timers, observers, runNext } = entryFixture();
    let urls = [];
    reader.collectReaderImages = () => [...urls];
    reader.prepareImages();
    assert.equal(images.length, 0);
    assert.equal(timers.size, 0);
    assert.equal(observers[0].connected, true);
    urls = ['late0', 'late1'];
    observers[0].callback();
    observers[0].callback();
    assert.equal(timers.size, 1, 'DOM updates coalesce');
    runNext();
    const loading = runNext();
    assert.equal(images[0].src, 'late0');
    images[0].onload();
    reader.close(true);
    await loading;
    images[0].finishDecode();
    await tick();
    assert.equal(observers[0].connected, false);
    assert.equal(timers.size, 0);
    assert.equal(reader.imageCache.size, 0);
    assert.match(images[0].src, /^data:image\/gif/);
    assert.equal(await reader.loadImage('after-exit'), null);
});

test('explicit double-page loading starts both originals before either finishes', async () => {
    const { context } = fixture();
    const pending = new Map();
    const loading = context.BilibiliToolbox.readerPageGroups.loadVisibleImages({
        currentIndex: 0, imgList: ['a', 'b'], viewMode: 'double',
        loadImage: src => new Promise(resolve => pending.set(src, resolve)),
        isWideImage: () => false
    });
    assert.deepEqual([...pending.keys()], ['a', 'b']);
    pending.get('b')({ src: 'b' });
    pending.get('a')({ src: 'a' });
    assert.deepEqual(Array.from((await loading).images, img => img.src), ['a', 'b']);
});

test('zoom and pan reuse page geometry, clamp correctly, and refresh geometry after resize', () => {
    const { context } = fixture();
    let geometryReads = 0;
    let transformWrites = 0;
    let viewport = { left: 0, top: 0, width: 1200, height: 900 };
    const img = { naturalWidth: 2400, naturalHeight: 3600, dataset: {},
        offsetWidth: 2400, offsetHeight: 3600, offsetLeft: 0, offsetTop: 0 };
    const reader = context.BilibiliToolbox.readerTransform.attach({
        scale: 1, rotation: 0, translateX: 0, translateY: 0,
        el: {
            reader: { getBoundingClientRect: () => viewport },
            imgContainer: {
                querySelectorAll: () => { geometryReads += 1; return [img]; },
                style: { set transform(value) { transformWrites += 1; } }
            }
        }
    });
    context.getComputedStyle = () => ({ gap: '0' });
    reader.updateFitScale([img]);
    reader.scale = 2;
    for (let i = 0; i < 20; i += 1) {
        reader.translateX = 9999;
        reader.translateY = -9999;
        reader.applyTransform();
    }
    assert.equal(geometryReads, 1);
    assert.equal(transformWrites, 20);
    assert.equal(reader.translateX, 144);
    assert.equal(reader.translateY, -1044);
    viewport = { ...viewport, width: 600 };
    reader.updateFitScale([img]);
    reader.applyTransform();
    assert.equal(geometryReads, 2);
    assert.equal(reader.getPanLimits().maxX, 744);
});

test('cancelled fades cannot commit and reduced motion skips animation', () => {
    const { animations, context, container } = fixture();
    context.matchMedia = () => ({ matches: false });
    const timers = new Map();
    context.setTimeout = fn => { timers.set(1, fn); return 1; };
    context.clearTimeout = id => timers.delete(id);
    let commits = 0;
    const options = {
        animate: true, imgContainer: container, animationMode: 'fade', step: 1,
        renderIndex: 1, getCurrentIndex: () => 1, transitionToken: 1, getTransitionToken: () => 1,
        loadImages: () => { commits += 1; }
    };
    animations.runTransition(options);
    assert.equal(timers.size, 1);
    animations.cancel(container);
    assert.equal(timers.size, 0);
    assert.equal(commits, 0);
    animations.runTransition(options);
    animations.cancel(container, true);
    assert.equal(commits, 1, 'user interaction settles a prepared fade before zooming or capturing');
    context.matchMedia = () => ({ matches: true });
    animations.runTransition({ ...options, animationMode: 'smooth' });
    assert.equal(commits, 2);
    assert.equal(container.style.opacity, '1');
});
