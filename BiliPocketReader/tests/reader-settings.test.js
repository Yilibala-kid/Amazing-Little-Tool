const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadReaderServices({ storedPreferences, document } = {}) {
    const writes = [];
    const context = vm.createContext({ console });
    context.window = context;
    context.addEventListener = () => {};
    context.document = document || { addEventListener() {} };
    const run = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    run('shared.js');
    context.BilibiliToolbox.storage = {
        getSetting(_key, fallback) { return storedPreferences ?? fallback; },
        async setSetting(key, value) { writes.push({ key, value }); }
    };
    for (const name of ['animations.js', 'reader-preferences.js', 'reader-settings.js', 'reader-touch.js', 'comic-reader-interactions.js']) run(name);
    return { toolbox: context.BilibiliToolbox, writes, run };
}

test('preloading preferences preserve older settings and reject unsupported values', async () => {
    const { toolbox, writes } = loadReaderServices({ storedPreferences: {
        viewMode: 'single', imageRenderMode: 'sharp', tapPageNavigation: true
    } });
    const preferences = toolbox.readerPreferences;
    const oldPreferences = preferences.load();
    assert.equal(oldPreferences.viewMode, 'single');
    assert.equal(oldPreferences.imageRenderMode, 'sharp');
    assert.equal(oldPreferences.tapPageNavigation, true);
    assert.equal(oldPreferences.preloadPages, '4');
    assert.equal(oldPreferences.imageMemoryPolicy, 'page');
    for (const preloadPages of ['2', '4', '6', 'all']) {
        assert.equal(preferences.normalize({ preloadPages }).preloadPages, preloadPages);
    }
    for (const imageMemoryPolicy of ['page', 'previous']) {
        assert.equal(preferences.normalize({ imageMemoryPolicy }).imageMemoryPolicy, imageMemoryPolicy);
    }
    for (const invalid of [null, 4, '0', '8', 'unknown']) {
        const result = preferences.normalize({ preloadPages: invalid, imageMemoryPolicy: invalid });
        assert.equal(result.preloadPages, '4');
        assert.equal(result.imageMemoryPolicy, 'page');
    }
    await preferences.save({ ...oldPreferences, preloadPages: 'all', imageMemoryPolicy: 'previous' });
    assert.equal(writes[0].value.preloadPages, 'all');
    assert.equal(writes[0].value.imageMemoryPolicy, 'previous');
});

test('reader controls change settings, persist only preferences, and render only when needed', () => {
    const { toolbox, writes } = loadReaderServices();
    const controls = {};
    const controlNames = ['controls', 'settingsControls', 'settingsPanel', 'reader', 'leftBtn', 'rightBtn',
        'offsetIncBtn', 'offsetDecBtn', 'directionBtn', 'animationBtn', 'viewModeBtn', 'imageRenderBtn',
        'filterSelect', 'preloadSelect', 'imageMemorySelect', 'backgroundBtn', 'tapPageBtn', 'settingsBtn', 'resetViewBtn', 'screenshotBtn',
        'fullScreenBtn', 'rotateBtn', 'closeBtn', 'pageInfo', 'pageInput', 'selectionCancelBtn',
        'selectionFullBtn', 'selectionSaveBtn', 'selectionOverlay', 'imgContainer'];
    for (const name of controlNames) controls[name] = {
        classList: { remove() {}, toggle() {} },
        addEventListener(type, handler) { this[type] = handler; },
        style: { setProperty(key, value) { this[key] = value; } }
    };
    const effects = [];
    const reader = {
        ...toolbox.readerPreferences.load(), el: controls,
        imgList: ['image.jpg'], currentIndex: 0,
        eventBag: toolbox.createEventBag(),
        updateDirection() { effects.push('direction'); },
        render(animated) { effects.push(['render', animated]); },
        refreshImagesForRenderMode() { effects.push('images'); },
        syncImageLoadingSettings() { effects.push('loading settings'); },
        showControls() {}
    };
    toolbox.readerSettings.attach(reader);
    toolbox.readerInteractions.bind(reader);
    const event = { stopPropagation() {} };
    controls.viewModeBtn.onclick(event);
    assert.equal(reader.viewMode, 'single');
    assert.deepEqual(effects, [['render', false]]);
    effects.length = 0;
    controls.animationBtn.onclick(event);
    assert.equal(reader.animationMode, 'fade');
    assert.deepEqual(effects, []);
    controls.filterSelect.value = 'warm';
    controls.filterSelect.change(event);
    assert.equal(controls.reader.style['--comic-image-filter'], 'sepia(.18) saturate(.9) brightness(.96)');
    assert.deepEqual(effects, []);
    controls.imageRenderBtn.onclick(event);
    assert.equal(reader.imageRenderMode, 'sharp');
    assert.deepEqual(effects, ['images']);
    controls.directionBtn.onclick(event);
    assert.equal(reader.isRightToLeft, false);
    assert.equal(writes.length, 5, 'each setting writes once');
    assert.deepEqual(Object.keys(writes.at(-1).value).sort(), Object.keys(toolbox.readerPreferences.DEFAULT_READER_PREFERENCES).sort());
    assert.equal(writes.at(-1).value.imgList, undefined);
    reader.setPreference('filterMode', 'invalid');
    assert.equal(reader.filterMode, 'original');
    assert.throws(() => reader.setPreference('currentIndex', 10), /Unknown reader preference/);
    controls.animationBtn.onclick(event);
    assert.equal(reader.animationMode, 'paper');
    assert.equal(controls.animationBtn.innerText, '类纸');
    assert.equal(writes.at(-1).value.animationMode, 'paper');
    effects.length = 0;
    const previousWrites = writes.length;
    controls.preloadSelect.value = 'all';
    controls.preloadSelect.change(event);
    assert.equal(reader.preloadPages, 'all');
    assert.equal(controls.preloadSelect.value, 'all');
    assert.equal(writes.at(-1).value.preloadPages, 'all');
    controls.imageMemorySelect.value = 'previous';
    controls.imageMemorySelect.change(event);
    assert.equal(reader.imageMemoryPolicy, 'previous');
    assert.equal(controls.imageMemorySelect.value, 'previous');
    assert.equal(writes.at(-1).value.imageMemoryPolicy, 'previous');
    assert.deepEqual(effects, ['loading settings', 'loading settings'], 'loading settings change without rerendering or reloading current images');
    assert.equal(writes.length, previousWrites + 2, 'each select change writes once');
});

test('reader UI presents preloading options and restores both saved selections', () => {
    const document = {
        addEventListener() {},
        createElement(tagName) {
            return {
                tagName, children: [], dataset: {},
                style: { setProperty(key, value) { this[key] = value; } },
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute(key, value) { this[key] = value; },
                append(...children) { this.children.push(...children); },
                appendChild(child) { this.children.push(child); }
            };
        }
    };
    document.body = document.createElement('body');
    const { toolbox, run } = loadReaderServices({
        document, storedPreferences: { preloadPages: '6', imageMemoryPolicy: 'previous' }
    });
    run('reader-dom.js');
    const reader = {
        ...toolbox.readerPreferences.load(), el: {}, selectionHandles: {}, rotation: 0,
        updateDirection() {}, applyResponsiveLayout() {}
    };
    toolbox.readerSettings.attach(reader);
    toolbox.readerDom.create(reader);
    const options = select => select.children.map(option => [option.value, option.textContent]);
    assert.equal(reader.el.preloadSelect['aria-label'], '漫画预加载');
    assert.deepEqual(options(reader.el.preloadSelect), [['2', '2页'], ['4', '4页'], ['6', '6页'], ['all', '全部']]);
    assert.equal(reader.el.preloadSelect.value, '6');
    assert.equal(reader.el.imageMemorySelect['aria-label'], '图片内存');
    assert.deepEqual(options(reader.el.imageMemorySelect), [
        ['page', '关闭页面时释放'], ['previous', '释放当前图片之前的图片']
    ]);
    assert.equal(reader.el.imageMemorySelect.value, 'previous');
    assert.match(reader.el.imageMemorySelect.title, /返回时会重新加载/);
    assert.equal(document.body.children[0], reader.el.reader);
});

test('touch state belongs to each reader and swipes preserve reading direction', () => {
    const { toolbox } = loadReaderServices();
    const first = toolbox.readerTouch.attach({});
    const second = toolbox.readerTouch.attach({});
    first.lastTapTime = 100;
    assert.equal(second.lastTapTime, 0);
    const turns = [];
    Object.assign(first, {
        el: { reader: {} }, isTouchDevice: true, isSelectingScreenshot: false,
        touchStartedOnInteractive: false, isTwoFingerGesturing: false,
        touchPanLocked: false, touchStartX: 100, touchStartY: 100,
        touchEndX: 200, touchEndY: 105, touchStartTime: Date.now() - 500,
        isTouchSwiping: true, isRightToLeft: true, lastStep: 2,
        turnPage(_event, step) { turns.push(step); }
    });
    first.handleTouchEnd({ touches: [], changedTouches: [] });
    assert.deepEqual(turns, [2]);
    first.isTouchSwiping = true;
    first.isRightToLeft = false;
    first.handleTouchEnd({ touches: [], changedTouches: [] });
    assert.deepEqual(turns, [2, -2]);
});
