const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadReaderServices() {
    const writes = [];
    const context = vm.createContext({ console });
    context.window = context;
    context.addEventListener = () => {};
    context.document = { addEventListener() {} };
    const run = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    run('shared.js');
    context.BilibiliToolbox.storage = {
        getSetting(_key, fallback) { return fallback; },
        async setSetting(key, value) { writes.push({ key, value }); }
    };
    for (const name of ['animations.js', 'reader-preferences.js', 'reader-settings.js', 'reader-touch.js', 'comic-reader-interactions.js']) run(name);
    return { toolbox: context.BilibiliToolbox, writes };
}

test('reader controls change settings, persist only preferences, and render only when needed', () => {
    const { toolbox, writes } = loadReaderServices();
    const controls = {};
    const controlNames = ['controls', 'settingsControls', 'settingsPanel', 'reader', 'leftBtn', 'rightBtn',
        'offsetIncBtn', 'offsetDecBtn', 'directionBtn', 'animationBtn', 'viewModeBtn', 'imageRenderBtn',
        'filterSelect', 'backgroundBtn', 'tapPageBtn', 'settingsBtn', 'resetViewBtn', 'screenshotBtn',
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
