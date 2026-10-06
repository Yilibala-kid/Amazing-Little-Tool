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
                constructor() { readers.push(this); this.closed = 0; this.destroyed = 0; }
                init() { this.initialized = true; }
                close() { this.closed++; }
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
