const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadReaderServices({ storedPreferences, document, runtime = {} } = {}) {
    const writes = [];
    const context = vm.createContext({ console, ...runtime });
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

const settingCases = [
    ['imageRenderBtn', 'imageRenderMode', ['sharp', 'smooth'], ['原图', '流畅']],
    ['filterBtn', 'filterMode', ['soft', 'warm', 'grayscale', 'original'], ['柔和', '暖色护眼', '黑白', '原图']],
    ['clarityBtn', 'clarityStrength', [0, 40, 100], ['关闭', '轻度', '较强']],
    ['preloadBtn', 'preloadPages', ['2', '4', '6', 'all'], ['2页', '4页', '6页', '全部']],
    ['imageMemoryBtn', 'imageMemoryPolicy', ['previous', 'page'], ['释放前页', '关闭页释放']],
    ['backgroundBtn', 'backgroundMode', ['lightGray', 'white', 'black', 'darkGray'], ['浅灰', '白色', '黑色', '深灰']],
    ['animationBtn', 'animationMode', ['fade', 'parallel', 'smooth'], ['淡入', '平行', '平滑']],
    ['viewModeBtn', 'viewMode', ['single', 'double', 'auto'], ['单图', '双图', '自动']],
    ['tapPageBtn', 'tapPageNavigation', [true, false], ['开启', '关闭']],
    ['directionBtn', 'isRightToLeft', [false, true], ['从左往右', '从右往左']]
];

function createReaderDocument() {
    const document = {
        addEventListener() {},
        createElementNS(namespaceURI, tagName) {
            const element = this.createElement(tagName);
            element.namespaceURI = namespaceURI;
            return element;
        },
        createElement(tagName) {
            const element = {
                tagName: tagName.toUpperCase(), children: [], dataset: {}, className: '',
                style: { setProperty(key, value) { this[key] = value; } },
                setAttribute(key, value) { this[key] = String(value); },
                getAttribute(key) { return this[key] ?? null; },
                append(...children) { this.children.push(...children); },
                appendChild(child) { this.children.push(child); },
                addEventListener(type, handler) { this[type] = handler; },
                removeEventListener(type) { delete this[type]; },
                querySelectorAll(selector) {
                    const matches = node => selector.startsWith('.')
                        ? node.classList.contains(selector.slice(1))
                        : node.tagName === selector.toUpperCase();
                    const visit = node => node.children.flatMap(child => [
                        ...(matches(child) ? [child] : []), ...visit(child)
                    ]);
                    return visit(this);
                },
                querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
                click() { this.onclick?.({ stopPropagation() {} }); }
            };
            element.classList = {
                contains(name) { return element.className.split(/\s+/).includes(name); },
                add(...names) { element.className = [...new Set([...element.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
                remove(...names) { element.className = element.className.split(/\s+/).filter(name => name && !names.includes(name)).join(' '); },
                toggle(name, force) {
                    const enabled = force ?? !this.contains(name);
                    if (enabled) this.add(name); else this.remove(name);
                    return enabled;
                }
            };
            return element;
        }
    };
    document.body = document.createElement('body');
    return document;
}

function settingFixture(storedPreferences) {
    const document = createReaderDocument();
    const { toolbox, writes, run } = loadReaderServices({ document, storedPreferences });
    run('reader-dom.js');
    const effects = [];
    const reader = {
        ...toolbox.readerPreferences.load(), el: {}, selectionHandles: {}, rotation: 0,
        imgList: ['image.jpg'], currentIndex: 0, eventBag: toolbox.createEventBag(),
        updateDirection() { effects.push('direction'); },
        render(animated) { effects.push(['render', animated]); },
        refreshImagesForRenderMode() { effects.push('images'); },
        syncImageLoadingSettings() { effects.push('loading settings'); },
        applyResponsiveLayout() {}, showControls() {}
    };
    toolbox.readerSettings.attach(reader);
    toolbox.readerDom.create(reader);
    toolbox.readerInteractions.bind(reader);
    effects.length = 0;
    return { toolbox, writes, document, reader, effects };
}

test('transition switch saves independently and restores without losing the animation mode', () => {
    const { reader, writes, toolbox } = settingFixture({ animationMode: 'fade' });
    assert.equal(reader.transitionEnabled, true, 'existing users keep animations enabled');
    const toggle = reader.el.transitionBtn;
    assert.equal(toggle.getAttribute('role'), 'switch');
    toggle.click();
    assert.equal(reader.transitionEnabled, false);
    assert.equal(toggle.getAttribute('aria-checked'), 'false');
    assert.equal(reader.animationMode, 'fade');
    assert.equal(writes.length, 1);
    const restored = settingFixture(writes[0].value).reader;
    assert.equal(restored.transitionEnabled, false);
    assert.equal(restored.animationMode, 'fade');
    restored.el.transitionBtn.click();
    assert.equal(restored.transitionEnabled, true);
    assert.equal(restored.animationMode, 'fade');
    assert.equal(toolbox.readerPreferences.normalize({ transitionEnabled: 'false' }).transitionEnabled, true);
});

test('preloading preferences preserve older settings and reject unsupported values', async () => {
    const { toolbox, writes } = loadReaderServices({ storedPreferences: {
        viewMode: 'single', imageRenderMode: 'sharp', tapPageNavigation: true
    } });
    const preferences = toolbox.readerPreferences;
    const oldPreferences = preferences.load();
    assert.equal(oldPreferences.viewMode, 'single');
    assert.equal(oldPreferences.imageRenderMode, 'sharp');
    assert.equal(oldPreferences.tapPageNavigation, true);
    assert.equal(oldPreferences.preloadPages, 'all');
    assert.equal(oldPreferences.imageMemoryPolicy, 'page');
    for (const preloadPages of ['2', '4', '6', 'all']) {
        assert.equal(preferences.normalize({ preloadPages }).preloadPages, preloadPages);
        const saved = loadReaderServices({ storedPreferences: { preloadPages } }).toolbox.readerPreferences.load();
        assert.equal(saved.preloadPages, preloadPages, 'changing the default preserves existing saved page counts');
    }
    for (const imageMemoryPolicy of ['page', 'previous']) {
        assert.equal(preferences.normalize({ imageMemoryPolicy }).imageMemoryPolicy, imageMemoryPolicy);
    }
    for (const invalid of [null, 4, '0', '8', 'unknown']) {
        const result = preferences.normalize({ preloadPages: invalid, imageMemoryPolicy: invalid });
        assert.equal(result.preloadPages, 'all');
        assert.equal(result.imageMemoryPolicy, 'page');
    }
    await preferences.save({ ...oldPreferences, preloadPages: 'all', imageMemoryPolicy: 'previous' });
    assert.equal(writes[0].value.preloadPages, 'all');
    assert.equal(writes[0].value.imageMemoryPolicy, 'previous');
});

test('each setting card reaches every option, wraps, and saves exactly once per click', () => {
    for (const [ref, key, values, labels] of settingCases) {
        const { reader, toolbox, writes } = settingFixture();
        const button = reader.el[ref];
        const label = button.querySelector('.comic-setting-label');
        const value = button.querySelector('.comic-setting-value');
        const originalLabel = label.textContent;
        const startIndex = values.indexOf(reader[key]);
        for (let index = 0; index < values.length; index++) {
            const expectedIndex = (startIndex + index + 1) % values.length;
            const expectedValue = values[expectedIndex];
            button.click();
            assert.equal(reader[key], expectedValue, `${key} reaches ${expectedValue}`);
            assert.equal(value.textContent, labels[expectedIndex]);
            assert.equal(label.textContent, originalLabel, 'cycling updates the value without replacing its fixed title');
            assert.equal(button.dataset.value, String(expectedValue));
            assert.equal(button.getAttribute('aria-label'), `${originalLabel}：${labels[expectedIndex]}`);
            if (typeof expectedValue === 'boolean') assert.equal(button.getAttribute('aria-pressed'), String(expectedValue));
            if (key === 'backgroundMode') {
                assert.match(button.title, new RegExp(labels[expectedIndex]));
            }
            assert.equal(writes.length, index + 1, 'one click writes one preference object');
            assert.equal(writes.at(-1).value[key], expectedValue);
        }
        assert.equal(reader[key], toolbox.readerPreferences.DEFAULT_READER_PREFERENCES[key], 'the final click wraps to the initial default');
        assert.deepEqual(Object.keys(writes.at(-1).value).sort(), Object.keys(toolbox.readerPreferences.DEFAULT_READER_PREFERENCES).sort());
        assert.equal(writes.at(-1).value.imgList, undefined, 'transient reading state is not persisted');
    }
});

test('setting cards apply only their own effects and do not reload current images unnecessarily', () => {
    const { reader, effects } = settingFixture();
    const expectedEffects = {
        directionBtn: ['direction'], animationBtn: [], viewModeBtn: [['render', false]],
        imageRenderBtn: ['images'], filterBtn: [], clarityBtn: [], preloadBtn: ['loading settings'],
        imageMemoryBtn: ['loading settings'], backgroundBtn: [], tapPageBtn: []
    };
    for (const [ref] of settingCases) {
        effects.length = 0;
        reader.el[ref].click();
        assert.deepEqual(effects, expectedEffects[ref], `${ref} affects only the required reader behavior`);
    }
    assert.equal(reader.el.reader.style['--comic-image-filter'], reader.getReaderClarityFilterCss() + ' brightness(.94) contrast(.92) saturate(.92)');
    assert.equal(reader.el.reader.style.background, '#0a0a0a');
    reader.setPreference('filterMode', 'invalid');
    assert.equal(reader.filterMode, 'original');
    assert.equal(reader.el.filterBtn.dataset.value, 'original');
    assert.throws(() => reader.setPreference('currentIndex', 10), /Unknown reader preference/);
});

test('unchanged preferences skip persistence, rendering and preview scheduling', () => {
    const { reader, writes, effects, toolbox } = settingFixture();
    let previews = 0;
    reader.swipe = { reset() { previews++; }, schedule() { previews++; } };
    for (const key of Object.keys(toolbox.readerPreferences.DEFAULT_READER_PREFERENCES)) {
        reader.setPreference(key, reader[key]);
    }
    reader.setPreference('clarityStrength', 20); // Normalizes to the current off state.
    assert.equal(writes.length, 0);
    assert.deepEqual(effects, []);
    assert.equal(previews, 0);
    reader.isOpen = true;
    reader.displayedIndex = -1;
    reader.setPreference('transitionEnabled', false);
    assert.deepEqual(effects, [['render', false]], 'pending navigation owns its reset and preview schedule');
    assert.equal(previews, 0);
    assert.equal(writes.length, 1);
});

test('retired animation preferences fall back to smooth and save a supported mode', async () => {
    const { toolbox, reader, writes } = settingFixture({ animationMode: 'paper' });
    assert.equal(reader.animationMode, 'smooth');
    assert.equal(reader.el.animationBtn.dataset.value, 'smooth');
    assert.equal(reader.el.animationBtn.querySelector('.comic-setting-value').textContent, '平滑');
    assert.deepEqual(Array.from(toolbox.readerPreferences.ANIMATION_MODES), ['smooth', 'fade', 'parallel']);
    await toolbox.readerPreferences.save(reader);
    assert.equal(writes.at(-1).value.animationMode, 'smooth');
});

test('reader UI restores saved settings without rewriting them and displays defaults for new readers', () => {
    const storedPreferences = {
        clarityStrength: 40,
        isRightToLeft: false, viewMode: 'single', animationMode: 'fade', imageRenderMode: 'smooth',
        backgroundMode: 'darkGray', filterMode: 'warm', preloadPages: '6', imageMemoryPolicy: 'previous', tapPageNavigation: false
    };
    const { reader, writes } = settingFixture(storedPreferences);
    const labels = {
        clarityBtn: '轻度',
        directionBtn: '从左往右', animationBtn: '淡入', viewModeBtn: '单图', imageRenderBtn: '流畅',
        filterBtn: '暖色护眼', preloadBtn: '6页', imageMemoryBtn: '释放前页', backgroundBtn: '深灰', tapPageBtn: '关闭'
    };
    for (const [ref, key] of settingCases) {
        const button = reader.el[ref];
        const label = button.querySelector('.comic-setting-label').textContent;
        assert.ok(label.length > 0);
        assert.equal(reader[key], storedPreferences[key]);
        assert.equal(button.querySelector('.comic-setting-value').textContent, labels[ref]);
        assert.equal(button.dataset.value, String(storedPreferences[key]));
        assert.equal(button.getAttribute('aria-label'), `${label}：${labels[ref]}`);
        if (typeof storedPreferences[key] === 'boolean') assert.equal(button.getAttribute('aria-pressed'), String(storedPreferences[key]));
    }
    assert.match(reader.el.imageMemoryBtn.title, /返回时会重新加载/);
    assert.equal(writes.length, 0, 'restoring saved values does not rewrite preferences');
    assert.equal(reader.clarityStrength, 40, 'legacy mild preserves its original sharpening strength');
    assert.equal(reader.el.clarityBtn.dataset.value, '40');
    const defaults = settingFixture().reader;
    const expectedDefaults = {
        clarityStrength: 0,
        imageRenderMode: 'sharp', filterMode: 'original', preloadPages: 'all', imageMemoryPolicy: 'page',
        backgroundMode: 'white', animationMode: 'smooth', viewMode: 'double', tapPageNavigation: true, isRightToLeft: true
    };
    for (const [ref, key, values, labels] of settingCases) {
        assert.equal(defaults[key], expectedDefaults[key], `${key} uses the requested default`);
        assert.equal(defaults.el[ref].dataset.value, String(expectedDefaults[key]));
        assert.equal(defaults.el[ref].querySelector('.comic-setting-value').textContent, labels[values.indexOf(expectedDefaults[key])]);
    }
});

test('clarity strength preserves view and combines with other filters', () => {
    const { reader, writes, effects, toolbox } = settingFixture();
    assert.equal(toolbox.readerPreferences.normalize({ clarityMode: 'ai' }).clarityStrength, 0);
    assert.equal(reader.clarityStrength, 0);
    reader.scale = 2.3; reader.translateX = 71; reader.translateY = -36; reader.rotation = 90;
    reader.setPreference('filterMode', 'warm');
    reader.setPreference('clarityStrength', 40);
    assert.equal(reader.el.clarityConvolution.getAttribute('kernelMatrix'), '0 -0.12 0 -0.12 1.48 -0.12 0 -0.12 0');
    const enhancedFilter = reader.el.reader.style['--comic-image-filter'];
    assert.match(enhancedFilter, /^url\(/);
    const savedCount = writes.length;
    reader.setPreference('clarityStrength', 0);
    assert.equal(reader.el.reader.style['--comic-image-filter'], reader.getReaderFilterCss());
    reader.setPreference('clarityStrength', 40);
    assert.equal(reader.el.reader.style['--comic-image-filter'], enhancedFilter);
    assert.equal(writes.length, savedCount + 2, 'each strength change is saved');
    assert.deepEqual([reader.scale, reader.translateX, reader.translateY, reader.rotation], [2.3, 71, -36, 90]);
    assert.deepEqual(effects, [], 'clarity never reloads images or changes page layout');
    reader.setPreference('clarityStrength', 0);
    assert.equal(reader.getReaderClarityFilterCss(), 'none');
});

test('clarity strength migrates legacy slider values to three levels and rejects malformed settings', () => {
    const { toolbox } = loadReaderServices();
    const normalize = toolbox.readerPreferences.normalize;
    assert.equal(normalize({ clarityMode: 'mild' }).clarityStrength, 40);
    assert.equal(normalize({ clarityMode: 'off' }).clarityStrength, 0);
    assert.equal(normalize({ clarityMode: 'mild', clarityStrength: 0 }).clarityStrength, 0);
    for (const [value, expected] of [[-5, 0], [120, 100], [0, 0], [20, 0], [20.1, 40], [25.6, 40], [40, 40], [70, 40], [70.1, 100], [77, 100], [100, 100], [NaN, 0], [Infinity, 0], ['40', 0], [null, 0]]) {
        assert.equal(normalize({ clarityStrength: value }).clarityStrength, expected);
    }
    assert.equal(Object.hasOwn(normalize({ clarityMode: 'mild' }), 'clarityMode'), false);
});

test('screenshot toolbar separates cancel, copy, download, and full-image selection actions', () => {
    const { reader } = settingFixture();
    const actions = [];
    reader.cancelScreenshotSelection = showMessage => actions.push(['cancel', showMessage]);
    reader.saveSelectionScreenshot = action => actions.push(['output', action]);
    reader.selectFullScreenshot = () => actions.push(['select full']);
    const buttons = [reader.el.selectionCancelBtn, reader.el.selectionCopyBtn,
        reader.el.selectionDownloadBtn, reader.el.selectionFullBtn];
    assert.deepEqual(reader.el.selectionToolbar.children, buttons, 'toolbar follows the user-facing action order');
    buttons.forEach(button => button.click());
    assert.deepEqual(actions, [['cancel', true], ['output', 'copy'], ['output', 'download'], ['select full']]);
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
        touchStartX: 100, touchStartY: 100,
        touchEndX: 200, touchEndY: 105, touchStartTime: Date.now() - 500,
        isRightToLeft: true, lastStep: 2,
        turnPage(_event, step) { turns.push(step); }
    });
    first.handleTouchEnd({ touches: [], changedTouches: [] });
    assert.deepEqual(turns, [2]);
    first.isRightToLeft = false;
    first.handleTouchEnd({ touches: [], changedTouches: [] });
    assert.deepEqual(turns, [2, -2]);
});

test('remaining pinch contacts cannot restart a gesture and screenshot release clears suppression', () => {
    const { toolbox } = loadReaderServices();
    const reader = toolbox.readerTouch.attach({});
    reader.suppressRemainingTouch = true;
    reader.isTwoFingerGesturing = false;
    reader.handleTouchStart({ touches: [{}, {}] });
    assert.equal(reader.isTwoFingerGesturing, false, 'a new contact while waiting for all fingers to lift is ignored');
    reader.isTwoFingerGesturing = true;
    reader.handleTouchEnd({ touches: [] });
    assert.equal(reader.suppressRemainingTouch, false);
    assert.equal(reader.isTwoFingerGesturing, false);
    reader.isSelectingScreenshot = true;
    reader.suppressRemainingTouch = true;
    reader.handleTouchEnd({ touches: [] });
    assert.equal(reader.suppressRemainingTouch, false, 'ending a cancelled swipe inside screenshot selection never blocks the next reading gesture');
});

test('horizontal swipes on a setting value or panel space leave the page unchanged and cancel delayed taps', () => {
    class TouchElement {
        constructor(tagName, parentElement = null) { this.tagName = tagName; this.parentElement = parentElement; }
        contains(target) {
            for (let node = target; node; node = node.parentElement) if (node === this) return true;
            return false;
        }
        closest() {
            for (let node = this; node; node = node.parentElement) {
                if (['button', 'a', 'input', 'textarea', 'select'].includes(node.tagName)) return node;
            }
            return null;
        }
    }
    for (const targetType of ['setting value', 'panel space']) {
        const timers = new Map();
        let timerId = 0;
        const { toolbox } = loadReaderServices({ runtime: {
            Element: TouchElement,
            setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
            clearTimeout(id) { timers.delete(id); }
        } });
        const overlay = new TouchElement('div');
        const panel = new TouchElement('div', overlay);
        const settingValue = new TouchElement('span', new TouchElement('button', panel));
        const image = new TouchElement('img', overlay);
        const turns = [];
        const reader = toolbox.readerTouch.attach({
            el: { reader: overlay, controls: new TouchElement('div', overlay),
                settingsControls: new TouchElement('div', overlay), settingsPanel: panel },
            isTouchDevice: true, isRightToLeft: true, lastStep: 2,
            scale: 1, translateX: 0, translateY: 0,
            showControls() {}, setTransformTransition() {}, applyTransform() {},
            getRenderScale: () => 1, getPanLimits: () => ({ maxX: 0, maxY: 0 }),
            clampPanValue: (value, limit) => Math.max(-limit, Math.min(limit, value)),
            turnPage(_event, step) { turns.push(step); }
        });
        reader.handleSingleFingerTap(20, 100);
        assert.equal(timers.size, 1, 'a prior image tap can still have delayed navigation pending');
        const swipe = target => {
            reader.handleTouchStart({ target, touches: [{ clientX: 80, clientY: 100 }], preventDefault() {} });
            reader.handleTouchMove({ target, touches: [{ clientX: 220, clientY: 105 }], preventDefault() {} });
            reader.handleTouchEnd({ type: 'touchend', target, touches: [], changedTouches: [{ clientX: 220, clientY: 105 }], preventDefault() {} });
        };
        swipe(targetType === 'setting value' ? settingValue : panel);
        assert.deepEqual(turns, [], `${targetType} must not turn the comic page`);
        assert.equal(timers.size, 0, 'finishing an interactive gesture cancels earlier delayed navigation');
        assert.equal(reader.pendingTapTimer, null);
        swipe(image);
        assert.deepEqual(turns, [2], 'the same horizontal gesture on the image still turns a page');
    }
});
