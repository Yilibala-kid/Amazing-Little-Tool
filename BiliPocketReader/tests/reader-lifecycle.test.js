const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const run = (context, name) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);

test('native navigation notifies the reader when site history calls bypass the isolated-world patch', () => {
    const handlers = new Map();
    let changes = 0;
    const context = vm.createContext({ console, Event, location: { href: 'https://www.bilibili.com/' },
        history: { pushState() {}, replaceState() {} },
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { changes++; },
        navigation: { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) }
    });
    context.window = context;
    run(context, 'shared.js'); run(context, 'content-url.js');
    context.BilibiliToolbox.url.init();
    context.location.href += 'read/cv123';
    handlers.get('currententrychange')();
    handlers.get('currententrychange')();
    assert.equal(changes, 1);
    context.BilibiliToolbox.url.destroy();
    assert.equal(handlers.size, 0);
});

test('storage updates refresh only affected UI services', async () => {
    let changed;
    const counts = { favorites: 0, filter: 0, settings: 0 };
    const noop = () => {};
    const service = () => new Proxy({}, { get: () => noop });
    const context = vm.createContext({ console, URL, location: { href: 'https://www.bilibili.com/' },
        document: { readyState: 'loading', addEventListener() {} },
        chrome: { runtime: { onMessage: { addListener() {}, removeListener() {} } } },
        addEventListener() {}, removeEventListener() {} });
    context.window = context;
    run(context, 'shared.js');
    Object.assign(context.BilibiliToolbox, {
        storage: { async init() { return context.Shared.createDefaultData(); },
            onChanged(fn) { changed = fn; return noop; }, destroy() {} },
        favorites: {}, comicImages: {}, animations: {}, pageInfo: {},
        url: { init() {}, destroy() {}, URL_CHANGE_EVENT: 'urlchange' },
        spaceOpusTabs: service(),
        dynamicFilter: { init() {}, sync() { counts.filter++; }, destroy() {} },
        settingsPopoverUi: { init() {}, render() { counts.settings++; }, destroy() {} },
        favoritesUi: { init() {}, sync() { counts.favorites++; }, destroy() {} },
        reader: { shouldInitComicReader: () => false }
    });
    run(context, 'content.js');
    const app = context.BilibiliToolbox.contentApp;
    await app.init();
    const update = (settings, favorites = app.getData().favorites) => changed({
        favorites, settings: { ...app.getData().settings, ...settings }
    });
    update({ readerPreferences: { viewMode: 'single' } });
    assert.deepEqual(counts, { favorites: 0, filter: 0, settings: 0 });
    update({ favoriteColumns: 5 });
    assert.deepEqual(counts, { favorites: 1, filter: 0, settings: 1 });
    update({ hideForwardDynamics: true });
    assert.deepEqual(counts, { favorites: 1, filter: 1, settings: 1 });
    update({}, [{ type: 'user', uid: '1', uname: 'One', face: 'https://example.com/a.jpg' }]);
    assert.deepEqual(counts, { favorites: 2, filter: 1, settings: 1 });
    app.destroy();
});

test('reader follows article navigation, closes on pagehide, and destroys entry points', async () => {
    const listeners = new Map();
    const readers = [];
    const noop = () => {};
    const service = () => new Proxy({}, { get: () => noop });
    const context = vm.createContext({ console, URL, location: { href: 'https://www.bilibili.com/video/BV123' },
        document: { readyState: 'loading', addEventListener() {} },
        chrome: { runtime: { onMessage: { addListener() {}, removeListener() {} } } },
        addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) });
    context.window = context;
    run(context, 'shared.js');
    Object.assign(context.BilibiliToolbox, {
        storage: { async init() { return {}; }, onChanged: () => noop, destroy() {} },
        favorites: {}, comicImages: {}, animations: {}, pageInfo: {},
        url: { init() {}, destroy() {}, URL_CHANGE_EVENT: 'urlchange' },
        spaceOpusTabs: service(), dynamicFilter: service(), settingsPopoverUi: service(), favoritesUi: service(),
        reader: {
            shouldInitComicReader: () => context.location.href.includes('/read/'),
            BiliComicReader: class {
                constructor() { readers.push(this); this.closed = 0; this.destroyed = 0; this.closeArguments = []; }
                init() { this.initialized = true; }
                close(forceRelease) { this.closed++; this.closeArguments.push(forceRelease); }
                prepareImages() { this.prepared = (this.prepared || 0) + 1; }
                destroy() { this.destroyed++; this.close(); }
            }
        }
    });
    run(context, 'content.js');
    const app = context.BilibiliToolbox.contentApp;
    await app.init();
    assert.equal(readers.length, 0);
    const navigate = path => { context.location.href = 'https://www.bilibili.com' + path; listeners.get('urlchange')(); };
    navigate('/read/cv1');
    assert.equal(readers.length, 1);
    navigate('/read/cv1?from=feed#comments');
    assert.equal(readers.length, 1, 'query/hash changes retain the same article');
    listeners.get('pagehide')();
    assert.equal(readers[0].closed, 1);
    assert.deepEqual(readers[0].closeArguments, [true], 'pagehide explicitly releases cached originals rather than merely closing the overlay');
    listeners.get('pageshow')({ persisted: true });
    assert.equal(readers[0].prepared, 1, 'restored readable pages warm their images again');
    navigate('/read/cv2');
    assert.equal(readers[0].destroyed, 1);
    assert.equal(readers.length, 2);
    navigate('/video/BV123');
    assert.equal(readers[1].destroyed, 1);
    navigate('/read/cv3');
    app.destroy();
    assert.equal(readers[2].destroyed, 1);
    assert.equal(listeners.size, 0);
});

function screenshotFixture() {
    const canvases = [];
    let pendingSignal;
    const context = vm.createContext({ console, AbortController, setTimeout, URL,
        devicePixelRatio: 3,
        fetch(_url, { signal }) {
            pendingSignal = signal;
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
        },
        document: { createElement(type) {
            assert.equal(type, 'canvas');
            const drawing = { scale() {}, fillRect() {} };
            const canvas = { getContext: () => drawing };
            canvases.push(canvas);
            return canvas;
        } }
    });
    context.window = context;
    run(context, 'shared.js'); run(context, 'reader-screenshot.js');
    const reader = { isOpen: true, rotation: 0, currentIndex: 0, activePageCount: 1, showReaderMessage() {} };
    return { reader, capture: context.BilibiliToolbox.readerScreenshot.capture, canvases, getSignal: () => pendingSignal };
}

test('screenshot limits very large canvases, prevents overlap, and aborts on close', async () => {
    const { reader, capture, canvases, getSignal } = screenshotFixture();
    const rect = { x: 0, y: 0, width: 100000, height: 100000 };
    const descriptors = [{ src: 'original', ...rect }];
    const pending = capture(reader, rect, descriptors);
    assert.ok(canvases[0].width * canvases[0].height <= 16e6);
    assert.ok(canvases[0].width <= 8192 && canvases[0].height <= 8192);
    assert.equal(await capture(reader, rect, descriptors), false);
    assert.equal(canvases.length, 1);
    reader.isOpen = false;
    reader.screenshotTask.cancel();
    assert.equal(getSignal().aborted, true);
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
    assert.equal(await pending, false);
    assert.equal(reader.screenshotTask, null);
});

const tick = () => new Promise(resolve => setImmediate(resolve));

function screenshotOutputFixture({ mobile = false, copyFailure = false, clipboardAvailable = true,
    holdDecode = false, holdBlob = false } = {}) {
    const canvases = [], images = [], downloads = [], clipboardWrites = [], messages = [];
    const activeUrls = new Set(), timers = [];
    let urlId = 0, shares = 0;
    class ExportImage {
        constructor() {
            this.naturalWidth = 120;
            this.naturalHeight = 160;
            this.decoded = holdDecode ? new Promise(resolve => { this.finishDecode = resolve; }) : Promise.resolve();
            images.push(this);
        }
        set src(value) {
            this.source = value;
            if (value.startsWith('blob:')) queueMicrotask(() => this.onload?.());
        }
        get src() { return this.source; }
        removeAttribute(name) { if (name === 'src') this.source = ''; }
        decode() { return this.decoded; }
    }
    const context = vm.createContext({ console, Blob, AbortController, Image: ExportImage,
        devicePixelRatio: 2, matchMedia: () => ({ matches: !mobile }),
        setTimeout: fn => timers.push(fn),
        URL: {
            createObjectURL() { const url = `blob:export-${++urlId}`; activeUrls.add(url); return url; },
            revokeObjectURL: url => activeUrls.delete(url)
        },
        ClipboardItem: class { constructor(data) { this.data = data; } },
        navigator: {
            clipboard: clipboardAvailable ? { async write(items) {
                clipboardWrites.push(items);
                const blob = await items[0].data['image/png'];
                assert.equal(blob.type, 'image/png');
                if (copyFailure) throw new Error('Clipboard permission denied');
            } } : undefined,
            async share() { shares++; }, canShare: () => true
        },
        async fetch(_src, { signal }) {
            if (signal.aborted) throw new Error('aborted');
            return { ok: true, async blob() { return new Blob(['export source'], { type: 'image/png' }); } };
        },
        document: {
            body: { appendChild() {} },
            createElement(type) {
                if (type === 'a') return {
                    click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {}
                };
                assert.equal(type, 'canvas');
                const drawing = { scale() {}, fillRect() {}, save() {}, translate() {}, rotate() {}, drawImage() {}, restore() {} };
                const canvas = {
                    getContext: () => drawing,
                    toBlob(callback) {
                        const complete = () => callback(new Blob(['encoded PNG'], { type: 'image/png' }));
                        if (holdBlob) this.finishBlob = complete; else complete();
                    }
                };
                canvases.push(canvas);
                return canvas;
            }
        }
    });
    context.window = context;
    run(context, 'shared.js'); run(context, 'reader-screenshot.js'); run(context, 'reader-selection.js');
    const actionButton = () => ({ disabled: false, classList: { toggle() {} } });
    const rect = { x: 10, y: 20, width: 60, height: 80 };
    const descriptors = [{ src: 'original', ...rect }];
    const reader = {
        isOpen: true, isSelectingScreenshot: true, isTouchDevice: mobile,
        rotation: 0, currentIndex: 0, activePageCount: 1, selectionHandles: {},
        selectionStart: { x: rect.x, y: rect.y }, selectionCurrent: { x: rect.x + rect.width, y: rect.y + rect.height },
        el: { selectionCopyBtn: actionButton(), selectionDownloadBtn: actionButton(), selectionFullBtn: actionButton(),
            selectionBox: { style: {} }, selectionOverlay: { style: {} }, selectionHint: { textContent: '' } },
        getVisibleImageDescriptors: () => descriptors,
        showReaderMessage(text, isError) { messages.push({ text, isError }); },
        showControls() {}, hideControls() {},
        loadImage() { assert.fail('successful export fetches must not fall back to the reader cache'); }
    };
    context.BilibiliToolbox.readerSelection.attach(reader);
    const capture = context.BilibiliToolbox.readerScreenshot.capture;
    reader.captureScreenshot = (selectionRect, action) => capture(reader, selectionRect, reader.getVisibleImageDescriptors(), action);
    return { reader, capture, rect, descriptors, canvases, images, downloads, clipboardWrites, messages, activeUrls,
        flushTimers() { timers.splice(0).forEach(fn => fn()); }, getShares: () => shares };
}

test('copy and download export only the explicitly chosen destination on desktop and touch devices', async () => {
    for (const mobile of [false, true]) for (const action of ['copy', 'download']) {
        const h = screenshotOutputFixture({ mobile });
        const output = h.capture(h.reader, h.rect, h.descriptors, action);
        if (action === 'copy') {
            assert.equal(h.clipboardWrites.length, 1, 'clipboard.write runs in the original call before asynchronous rendering');
            assert.equal(typeof h.clipboardWrites[0][0].data['image/png'].then, 'function', 'ClipboardItem receives the pending PNG promise');
        }
        assert.equal(await output, true);
        assert.equal(h.downloads.length, action === 'download' ? 1 : 0);
        assert.equal(h.clipboardWrites.length, action === 'copy' ? 1 : 0);
        assert.equal(h.getShares(), 0, 'device capabilities cannot switch the requested destination to sharing');
        if (action === 'download') assert.match(h.downloads[0].filename, /^bilibili-reader-1-.*\.png$/);
        assert.equal(h.reader.screenshotTask, null);
        assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
        h.flushTimers();
        assert.equal(h.activeUrls.size, 0, 'temporary source and download URLs are released');
    }
});

test('unavailable or rejected clipboard output preserves the selection and never downloads instead', async () => {
    for (const options of [{ clipboardAvailable: false }, { copyFailure: true }]) {
        const h = screenshotOutputFixture(options);
        const before = h.reader.normalizeSelectionRect();
        assert.equal(await h.capture(h.reader, h.rect, h.descriptors, 'copy'), false);
        await tick();
        assert.equal(h.downloads.length, 0);
        assert.equal(h.getShares(), 0);
        assert.equal(h.reader.screenshotTask, null);
        assert.deepEqual(h.reader.normalizeSelectionRect(), before);
        assert.equal(h.reader.isSelectingScreenshot, true);
        assert.equal(h.reader.el.selectionCopyBtn.disabled, false, 'failure re-enables retrying the valid selection');
        assert.equal(h.reader.el.selectionDownloadBtn.disabled, false);
        assert.equal(h.messages.at(-1).isError, true);
        assert.match(h.messages.at(-1).text, /复制|剪贴板/);
        assert.ok(h.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
        assert.equal(h.activeUrls.size, 0);
    }
});

test('full-image action selects the union of displayed images without producing output', async () => {
    const h = screenshotOutputFixture();
    h.reader.getVisibleImageDescriptors = () => [
        { src: 'first', x: 25, y: 40, width: 80, height: 150 },
        { src: 'second', x: 120, y: 10, width: 60, height: 210 }
    ];
    h.reader.selectFullScreenshot();
    assert.deepEqual(JSON.parse(JSON.stringify(h.reader.normalizeSelectionRect())), { x: 25, y: 10, width: 155, height: 210 });
    assert.equal(h.reader.el.selectionBox.style.display, 'block');
    assert.equal(h.reader.el.selectionCopyBtn.disabled, false);
    assert.equal(h.reader.el.selectionDownloadBtn.disabled, false);
    assert.equal(h.canvases.length, 0);
    assert.equal(h.downloads.length, 0);
    assert.equal(h.clipboardWrites.length, 0);
    await h.reader.saveSelectionScreenshot();
    assert.equal(h.downloads.length, 1, 'only the later default download action exports the selected whole image');
    assert.equal(h.clipboardWrites.length, 0);
    assert.equal(h.reader.isSelectingScreenshot, true, 'successful output leaves the selection available for adjustment');
    h.flushTimers();
});

test('cancelling export disables both actions, prevents late output, and releases image and canvas resources', async () => {
    for (const stage of ['decode', 'encode']) {
        const h = screenshotOutputFixture({ holdDecode: stage === 'decode', holdBlob: stage === 'encode' });
        const output = h.reader.saveSelectionScreenshot('download');
        assert.equal(h.reader.el.selectionCopyBtn.disabled, true);
        assert.equal(h.reader.el.selectionDownloadBtn.disabled, true);
        assert.equal(await h.capture(h.reader, h.rect, h.descriptors, 'copy'), false, 'busy export cannot start a second output');
        await tick();
        const task = h.reader.screenshotTask;
        h.reader.cancelScreenshotSelection();
        assert.equal(task.controller.signal.aborted, true);
        assert.equal(h.canvases[0].width, 0);
        assert.equal(h.canvases[0].height, 0);
        assert.equal(h.activeUrls.size, 0);
        if (stage === 'decode') h.images[0].finishDecode();
        else h.canvases[0].finishBlob();
        await output;
        await tick();
        assert.equal(h.reader.screenshotTask, null);
        assert.equal(h.reader.isSelectingScreenshot, false);
        assert.equal(h.reader.normalizeSelectionRect(), null);
        assert.equal(h.reader.el.selectionCopyBtn.disabled, true);
        assert.equal(h.reader.el.selectionDownloadBtn.disabled, true);
        assert.equal(h.downloads.length, 0);
        assert.equal(h.clipboardWrites.length, 0);
        assert.match(h.images[0].src, /^data:image\/gif/);
    }
});
