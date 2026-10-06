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
        document: { getElementById: () => null }, matchMedia: () => ({ matches: false }) });
    context.window = context;
    function run(name) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context, { filename: name });
    }
    run('shared.js');
    Object.assign(context.BilibiliToolbox, {
        storage: { getSetting: (_key, fallback) => fallback, async setSetting() {} },
        bilibiliDom: {}, comicImages: { collectImages: () => [] }
    });
    for (const file of ['paper-turn.js', 'animations.js', 'reader-preferences.js', 'reader-screenshot.js',
        'reader-transform.js', 'reader-selection.js', 'reader-dom.js', 'reader-settings.js',
        'reader-touch.js', 'comic-reader-page-groups.js', 'comic-reader-interactions.js', 'reader-image-loader.js', 'comic-reader.js']) run(file);
    const reader = new context.BilibiliToolbox.reader.BiliComicReader();
    reader.isOpen = true;
    const oldImage = { src: 'old', style: {} };
    const container = {
        style: {}, children: [oldImage], replacements: 0,
        get firstChild() { return this.children[0]; },
        replaceChildren(...children) { this.children = children; this.replacements += 1; },
        getBoundingClientRect: () => ({})
    };
    reader.el = { imgContainer: container, reader: { remove() {} } };
    reader.viewMode = 'single';
    reader.animationMode = 'paper';
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
    reader.close();
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
    assert.equal(reader.imageCache.size, 0, 'late completion cannot repopulate a closed reader');
});

test('pixel budget evicts distant originals but protects incoming and currently visible pages', () => {
    const { reader, container } = fixture();
    reader.imgList = Array.from({ length: 10 }, (_, i) => `p${i}`);
    reader.currentIndex = 4;
    reader.activePageCount = 2;
    container.querySelectorAll = () => [{ src: 'p0' }];
    for (const src of ['p0', 'p1', 'p4', 'p5', 'p6']) {
        reader.imageCache.set(src, { pixels: 12e6, settled: true, release() {} });
    }
    reader.pruneImageCache();
    assert.deepEqual([...reader.imageCache.keys()], ['p0', 'p4', 'p5'], 'visible pages are protected even above the soft budget');
    container.querySelectorAll = () => [{ src: 'p4' }, { src: 'p5' }];
    reader.pruneImageCache();
    assert.deepEqual([...reader.imageCache.keys()], ['p4', 'p5']);
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

test('cancelled fades cannot commit and reduced motion skips paper animation', () => {
    const { animations, context, container } = fixture();
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
    animations.runTransition({ ...options, animationMode: 'paper' });
    assert.equal(commits, 2);
    assert.equal(container.style.opacity, '1');
});

test('paper mesh has curved depth, mirrored directions, and exact flat endpoints', () => {
    const { context } = fixture();
    const { createMesh } = context.BilibiliToolbox.paperTurn;
    const page = { hinge: 600, centerY: 400, width: 400, height: 600 };
    const start = createMesh(0, page, page, 1);
    const finish = createMesh(1, page, page, 1);
    assert.ok(Math.abs(start.at(-1).x - 1000) < 1e-8);
    assert.ok(Math.abs(finish.at(-1).x - 200) < 1e-8);
    const middle = createMesh(0.5, page, page, 1);
    const mirrored = createMesh(0.5, page, page, -1);
    assert.ok(middle.at(-1).z > 100);
    assert.ok(Math.abs(middle[0].angle - middle[22].angle) > 0.5, 'a bent sheet has varying tangents');
    middle.forEach((point, index) => {
        assert.ok(Number.isFinite(point.x) && point.top < point.bottom);
        assert.ok(Math.abs(point.x + mirrored[index].x - 1200) < 1e-8);
    });
});

test('paper animation retains device pixels and builds page textures from original images', () => {
    const { context } = fixture();
    const canvases = [];
    context.document.createElement = () => {
        const draws = [];
        const drawing = new Proxy({
            drawImage: (...args) => draws.push(args),
            createLinearGradient: () => ({ addColorStop() {} })
        }, { get: (target, key) => key in target ? target[key] : () => {} });
        const canvas = { draws, getContext: () => drawing, setAttribute() {}, remove() {} };
        canvases.push(canvas);
        return canvas;
    };
    context.devicePixelRatio = 2;
    context.getComputedStyle = () => ({ backgroundColor: '#fff', filter: 'none' });
    context.requestAnimationFrame = () => 1;
    context.cancelAnimationFrame = () => {};
    context.performance = { now: () => 0 };
    const bounds = { left: 0, top: 0, width: 1360, height: 900 };
    const oldImage = { getBoundingClientRect: () => ({ left: 400, top: 50, width: 560, height: 800 }) };
    const newImage = { getBoundingClientRect: oldImage.getBoundingClientRect };
    let currentImage = oldImage;
    let overlay;
    const parent = { getBoundingClientRect: () => bounds, appendChild: canvas => { overlay = canvas; } };
    const container = { parentElement: parent, style: {}, querySelectorAll: () => [currentImage] };
    const { play, DURATION } = context.BilibiliToolbox.paperTurn;
    const cancel = play({ container, rotation: 90, direction: -1,
        commit: () => { currentImage = newImage; }, isCurrent: () => true, onFinish() {} });
    assert.equal(DURATION, 720);
    assert.equal(overlay.width, 2720);
    assert.equal(overlay.height, 1800);
    const originalTextures = canvases.filter(canvas => canvas.draws.some(([source]) => source === oldImage));
    assert.equal(originalTextures.length, 2, 'both paper faces draw directly from the original');
    assert.equal(canvases.length, 4, 'one overlay, two faces and one shared lighting texture');
    const faces = originalTextures.filter(canvas => canvas.width !== overlay.width);
    assert.equal(faces.length, 2);
    for (const face of faces) {
        assert.ok(face.height > 800 * context.devicePixelRatio, 'texture retains headroom for perspective');
        assert.ok(face.draws.every(([source]) => source === oldImage), 'faces must not resample a viewport snapshot');
    }
    cancel();
    assert.equal(container.style.visibility, '');
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0), 'cancel releases all canvas backing stores');

    bounds.width = 7680;
    bounds.height = 4320;
    const cancelLarge = play({ container, rotation: 0, direction: 1,
        commit() {}, isCurrent: () => true, onFinish() {} });
    assert.ok(overlay.width * overlay.height < 12.01e6, 'very large displays stay within the canvas memory budget');
    assert.ok(overlay.width <= 8192 && overlay.height <= 8192);
    assert.ok(canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0) <= 40e6);
    cancelLarge();
    oldImage.getBoundingClientRect = () => ({ left: 40, top: 10, width: 3800, height: 4300 });
    newImage.getBoundingClientRect = () => ({ left: 3840, top: 10, width: 3800, height: 4300 });
    container.querySelectorAll = () => [oldImage, newImage];
    parent.isConnected = true;
    let nextFrame, finishes = 0;
    context.requestAnimationFrame = fn => { nextFrame = fn; return 1; };
    play({ container, rotation: 0, direction: 1,
        commit() {}, isCurrent: () => true, onFinish() { finishes++; } });
    const active = canvases.filter(canvas => canvas.width);
    assert.equal(active.length, 5, 'double spread adds only a stationary half-page');
    assert.ok(active.reduce((sum, canvas) => sum + canvas.width * canvas.height, 0) <= 40e6,
        'even large spreads share one aggregate budget');
    nextFrame(DURATION);
    assert.equal(finishes, 1);
    assert.ok(canvases.every(canvas => !canvas.width && !canvas.height), 'natural completion also releases every canvas');
});
