const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function runFile(context, file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

function createBaseContext(extra = {}) {
    const context = { console, ...extra };
    context.window = context;
    vm.createContext(context);
    return context;
}

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...names) {
        names.forEach(name => this.values.add(name));
    }

    remove(...names) {
        names.forEach(name => this.values.delete(name));
    }

    contains(name) {
        return this.values.has(name);
    }

    toggle(name, force) {
        const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
        if (enabled) this.values.add(name);
        else this.values.delete(name);
        return enabled;
    }
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName;
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.listeners = {};
        this.selectorCache = {};
        this.style = {
            setProperty(name, value) {
                this[name] = String(value);
            }
        };
        this.classList = new FakeClassList();
        this.dataset = {};
        this.textContent = '';
        this.value = '';
        this.readOnly = false;
        this.id = '';
        this.className = '';
    }

    set innerHTML(value) {
        this._innerHTML = value;
        if (String(value).includes('bilibili-fav-list')) {
            this.selectorCache['.bilibili-fav-list'] = new FakeElement('div', this.ownerDocument);
        }
        if (String(value).includes('data-columns=')) {
            this.selectorCache['.bilibili-toolbox-favorite-columns button'] =
                [2, 3, 4, 5].map(columns => {
                    const button = new FakeElement('button', this.ownerDocument);
                    button.dataset.columns = String(columns);
                    return button;
                });
        }
    }

    get innerHTML() {
        return this._innerHTML || '';
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (child.id) this.ownerDocument.elementsById[child.id] = child;
        return child;
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        if (this.id) delete this.ownerDocument.elementsById[this.id];
        this.parentNode = null;
    }

    addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
    }

    removeEventListener(type, handler) {
        this.listeners[type] = (this.listeners[type] || []).filter(item => item !== handler);
    }

    dispatch(type, event = {}) {
        (this.listeners[type] || []).forEach(handler => handler({ target: this, ...event }));
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        this.focused = true;
    }

    blur() {
        this.focused = false;
    }

    select() {
        this.selected = true;
    }

    contains(target) {
        if (target === this) return true;
        return this.children.some(child => child.contains?.(target));
    }

    setAttribute(name, value) {
        this[name] = String(value);
    }

    getBoundingClientRect() {
        return {};
    }

    closest(selector) {
        if (selector === 'button[data-columns]' && this.tagName === 'button' && this.dataset.columns) {
            return this;
        }
        return null;
    }

    querySelector(selector) {
        if (!this.selectorCache[selector]) {
            this.selectorCache[selector] = new FakeElement(selector, this.ownerDocument);
        }
        return this.selectorCache[selector];
    }

    querySelectorAll(selector) {
        const cached = this.selectorCache[selector];
        return Array.isArray(cached) ? cached : [];
    }
}

function createFakeDocument() {
    const document = {
        elementsById: {},
        listeners: {},
        body: null,
        createElement(tagName) {
            return new FakeElement(tagName, document);
        },
        getElementById(id) {
            return document.elementsById[id] || null;
        },
        querySelector(selector) {
            if (selector.startsWith('#bilibili-toolbox-export-dialog')) {
                const dialog = document.getElementById('bilibili-toolbox-export-dialog');
                if (!dialog) return null;
                const [, childSelector] = selector.split(/\s+/, 2);
                return childSelector ? dialog.querySelector(childSelector) : dialog;
            }
            if (selector === '.bilibili-fav-list') {
                for (const element of Object.values(document.elementsById)) {
                    if (element.selectorCache[selector]) return element.selectorCache[selector];
                }
            }
            return null;
        },
        addEventListener(type, handler) {
            document.listeners[type] = document.listeners[type] || [];
            document.listeners[type].push(handler);
        },
        removeEventListener(type, handler) {
            document.listeners[type] = (document.listeners[type] || []).filter(item => item !== handler);
        }
    };
    document.body = new FakeElement('body', document);
    return document;
}

function loadDynamicFilterContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'dynamic-filter.js');
    return context;
}

function loadDynamicFilterObserverContext() {
    let observedOptions = null;
    const context = createBaseContext({
        document: {
            body: {},
            documentElement: { classList: new FakeClassList() },
            querySelectorAll() { return []; }
        },
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
            }

            observe(target, options) {
                observedOptions = options;
            }

            disconnect() {}
        },
        setTimeout() { return 1; },
        clearTimeout() {}
    });
    runFile(context, 'shared.js');
    runFile(context, 'dynamic-filter.js');
    return { context, getObservedOptions: () => observedOptions };
}

function loadReaderPageGroupsContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'comic-reader-page-groups.js');
    return context;
}

function loadPageInfoContext(href) {
    const document = {
        title: 'Ottergeist\u7684\u4e2a\u4eba\u7a7a\u95f4',
        querySelector(selector) {
            if (selector === '.user-name, .user-name-shadow, .name') {
                return { textContent: 'Ottergeist' };
            }
            if (selector === '.user-face img, .avatar img, [class*="face"] img') {
                return { src: 'https://i.example/otter.jpg' };
            }
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
    const context = createBaseContext({
        document,
        location: { href }
    });
    runFile(context, 'shared.js');
    runFile(context, 'content-page-info.js');
    return context;
}

function loadSpaceOpusTabsContext(tabs = [], href = 'https://space.bilibili.com/41700837/upload/opus', clock = { now: 1000 }) {
    const location = { href };
    const context = createBaseContext({
        Date: { now: () => clock.now },
        URL,
        location,
        history: {
            state: null,
            replaceState(state, title, url) {
                location.href = url;
            }
        },
        document: {
            title: '',
            querySelectorAll(selector) {
                return selector === '.content-filter .content-tab' ? tabs : [];
            }
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'space-opus-tabs.js');
    return context;
}

function createFakeCard({ dataset = {}, attrs = {}, actionText = '', hasForwardContent = false } = {}) {
    return {
        dataset,
        getAttribute(name) {
            return attrs[name] || null;
        },
        querySelector(selector) {
            if (selector === '.module-author__action' && actionText) {
                return { textContent: actionText };
            }
            if (selector.includes('bili-dyn-content__forw') && hasForwardContent) {
                return {};
            }
            return null;
        }
    };
}

{
    const { BilibiliToolbox } = loadDynamicFilterContext();
    const filter = BilibiliToolbox.dynamicFilter;

    assert.equal(filter.isSpaceDynamicPage('https://space.bilibili.com/123/dynamic'), true);
    assert.equal(filter.isSpaceDynamicPage('https://www.bilibili.com/video/BV1xx'), false);
    assert.equal(filter.normalizeDynamicText('  Hello\nWorld  '), 'hello world');
    assert.equal(filter.isForwardDynamic(createFakeCard({ dataset: { type: 'forward' } })), true);
    assert.equal(filter.isForwardDynamic(createFakeCard({ attrs: { 'data-dyn-type': 'repost' } })), true);
    assert.equal(filter.isForwardDynamic(createFakeCard({ actionText: '\u8f6c\u53d1\u4e86\u52a8\u6001' })), true);
    assert.equal(filter.isForwardDynamic(createFakeCard({ hasForwardContent: true })), true);
    assert.equal(filter.isForwardDynamic(createFakeCard()), false);
}

{
    const { context, getObservedOptions } = loadDynamicFilterObserverContext();
    context.BilibiliToolbox.dynamicFilter.init();

    assert.deepEqual(plain(getObservedOptions()), { childList: true, subtree: true });
}

{
    const { Shared } = loadDynamicFilterContext();

    assert.deepEqual(plain(Shared.FAVORITE_COLUMN_OPTIONS), [2, 3, 4, 5]);
    assert.equal(Shared.DEFAULT_FAVORITE_COLUMNS, 2);
    assert.equal(Shared.normalizeFavoriteColumns(2), 2);
    assert.equal(Shared.normalizeFavoriteColumns('3'), 3);
    assert.equal(Shared.normalizeFavoriteColumns(4), 4);
    assert.equal(Shared.normalizeFavoriteColumns(5), 5);
    assert.equal(Shared.normalizeFavoriteColumns(1), 2);
    assert.equal(Shared.normalizeFavoriteColumns(6), 2);
    assert.equal(Shared.normalizeFavoriteColumns('bad'), 2);
}

{
    const { BilibiliToolbox } = loadPageInfoContext('https://space.bilibili.com/41700837/upload/opus');
    assert.deepEqual(
        plain(BilibiliToolbox.pageInfo.getCurrentFavoriteData()),
        {
            type: 'opus',
            uid: '41700837',
            uname: 'Ottergeist',
            face: 'https://i.example/otter.jpg'
        }
    );
}

{
    let clicked = 0;
    const tabs = [
        { textContent: '\u5168\u90e8\u56fe\u6587', className: 'content-tab', click() {} },
        {
            textContent: '\u4e13\u680f',
            className: 'content-tab',
            click() {
                clicked += 1;
                this.className = 'content-tab active';
            }
        },
        { textContent: '\u52a8\u6001', className: 'content-tab', click() {} }
    ];
    const { BilibiliToolbox } = loadSpaceOpusTabsContext(tabs);
    const opusTabs = BilibiliToolbox.spaceOpusTabs;

    assert.equal(opusTabs.isSpaceOpusUploadPage('https://space.bilibili.com/41700837/upload/opus'), true);
    assert.equal(opusTabs.isSpaceOpusUploadPage('https://space.bilibili.com/41700837/dynamic'), false);
    assert.equal(opusTabs.selectNow(), false);
    assert.equal(clicked, 0);

    const clock = { now: 1000 };
    const delayedTabs = [];
    const marked = loadSpaceOpusTabsContext(delayedTabs, 'https://space.bilibili.com/41700837/upload/opus?bilibili_toolbox_opus_tab=1', clock);
    const markedOpusTabs = marked.BilibiliToolbox.spaceOpusTabs;
    assert.equal(markedOpusTabs.selectNow(), false);
    assert.equal(marked.location.href, 'https://space.bilibili.com/41700837/upload/opus');

    marked.location.href = 'https://space.bilibili.com/41700837/upload/opus?spm_id_from=333.1387.0.0';
    delayedTabs.push(...tabs);
    clock.now += 400;
    assert.equal(markedOpusTabs.selectNow(), true);
    assert.equal(clicked, 1);
    assert.equal(markedOpusTabs.selectNow(), false);
    assert.equal(clicked, 1);

    let activeClicks = 0;
    let fallbackClicks = 0;
    const activeTabs = [
        {
            textContent: '\u5168\u90e8\u56fe\u6587',
            className: 'content-tab',
            click() { fallbackClicks += 1; }
        },
        {
            textContent: '\u4e13\u680f',
            className: 'content-tab active',
            click() { activeClicks += 1; }
        }
    ];
    const activeMarked = loadSpaceOpusTabsContext(activeTabs, 'https://space.bilibili.com/41700837/upload/opus?bilibili_toolbox_opus_tab=1');
    assert.equal(activeMarked.BilibiliToolbox.spaceOpusTabs.selectNow(), true);
    assert.equal(activeClicks, 0);
    assert.equal(fallbackClicks, 0);
}

function loadSettingsPopoverContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'favorites-text-dialog.js');
    runFile(context, 'settings-popover-ui.js');
    return context;
}

function loadSettingsPopoverDomContext(data) {
    const document = createFakeDocument();
    const context = createBaseContext({
        document,
        setTimeout() { return 1; },
        clearTimeout() {}
    });
    runFile(context, 'shared.js');
    runFile(context, 'favorites-text-dialog.js');
    runFile(context, 'settings-popover-ui.js');
    context.BilibiliToolbox.settingsPopoverUi.init({
        storage: { async setSetting() {} },
        favoritesService: {
            createExportText() { return ''; },
            normalizeImportedFavorites() { return []; },
            async importFavorites() { return { added: 0, updated: 0, skipped: 0 }; }
        },
        dynamicFilter: {
            isSpaceDynamicPage() { return true; },
            getKeywordFilterState() {
                return { enabled: false, text: '', hasKeyword: false, isActive: false, displayText: '' };
            },
            setKeywordFilterState() {}
        },
        getData: () => data,
        showMessage() {},
        eventBag: context.BilibiliToolbox.createEventBag()
    });
    return { context, document };
}

function loadFavoritesUiContext(data) {
    const document = createFakeDocument();
    const context = createBaseContext({
        document,
        location: { href: 'https://space.bilibili.com/123/dynamic' },
        navigator: {},
        matchMedia() { return { matches: true }; },
        setTimeout() { return 1; },
        clearTimeout() {},
        addEventListener() {},
        removeEventListener() {}
    });
    runFile(context, 'shared.js');
    context.BilibiliToolbox.url = { URL_CHANGE_EVENT: 'bilibili-toolbox-url-change' };
    context.BilibiliToolbox.settingsPopoverUi = {
        init() {},
        render() {},
        toggle() {},
        destroy() {}
    };
    runFile(context, 'favorites-ui.js');
    context.BilibiliToolbox.favoritesUi.init({
        storage: {},
        favoritesService: {},
        pageInfo: {},
        dynamicFilter: {
            init() {},
            sync() {},
            getKeywordFilterState() { return { isActive: false }; }
        },
        getData: () => data
    });
    return { context, document };
}

{
    const { BilibiliToolbox } = loadSettingsPopoverContext();
    const controls = BilibiliToolbox.settingsPopoverUi;
    const emptyKeyword = { enabled: false, hasKeyword: false, isActive: false, displayText: '' };
    const waitingKeyword = { enabled: true, hasKeyword: false, isActive: false, displayText: '' };
    const activeKeyword = { enabled: true, hasKeyword: true, isActive: true, displayText: 'abc' };

    assert.equal(controls.getStatus(false, emptyKeyword, false), '\u5728\u7528\u6237\u52a8\u6001\u9875\u751f\u6548');
    assert.equal(controls.getStatus(false, emptyKeyword, true), '\u5df2\u663e\u793a\u5168\u90e8\u52a8\u6001');
    assert.equal(controls.getStatus(true, emptyKeyword, true), '\u5df2\u9690\u85cf\u8f6c\u53d1\u52a8\u6001');
    assert.equal(controls.getStatus(false, waitingKeyword, true), '\u8bf7\u8f93\u5165\u5173\u952e\u8bcd\u540e\u5f00\u59cb\u7b5b\u9009');
    assert.equal(controls.getStatus(true, activeKeyword, true), '\u5df2\u9690\u85cf\u8f6c\u53d1\u52a8\u6001\uff1b\u4ec5\u663e\u793a\u5305\u542b\u201cabc\u201d\u7684\u52a8\u6001');
}

{
    const data = {
        ...loadDynamicFilterContext().Shared.createDefaultData(),
        settings: { favoriteColumns: 4 }
    };
    const { document } = loadSettingsPopoverDomContext(data);
    const panel = document.getElementById('bilibili-toolbox-settings-panel');
    const buttons = panel.querySelectorAll('.bilibili-toolbox-favorite-columns button');

    assert.equal(buttons.find(button => button.dataset.columns === '4').classList.contains('active'), true);
    assert.equal(buttons.find(button => button.dataset.columns === '4')['aria-pressed'], 'true');
    assert.equal(buttons.find(button => button.dataset.columns === '2').classList.contains('active'), false);
}

{
    const data = {
        ...loadDynamicFilterContext().Shared.createDefaultData(),
        settings: { favoriteColumns: 3 }
    };
    const { context, document } = loadFavoritesUiContext(data);
    const button = document.getElementById('bilibili-fav-float-btn');
    button.dispatch('mouseenter');

    const panel = document.getElementById('bilibili-fav-panel');
    assert.equal(panel.style['--bilibili-fav-columns'], '3');

    data.settings.favoriteColumns = 5;
    context.BilibiliToolbox.favoritesUi.sync();
    assert.equal(panel.style['--bilibili-fav-columns'], '5');
}

{
    const document = createFakeDocument();
    const context = createBaseContext({
        document,
        navigator: {
            clipboard: {
                async writeText() {},
                async readText() { return 'pasted'; }
            }
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'favorites-text-dialog.js');

    let confirmed = '';
    const dialog = context.BilibiliToolbox.favoritesTextDialog.show({
        title: 'Import',
        text: 'initial',
        confirmText: 'OK',
        onConfirm: ({ text, close }) => {
            confirmed = text;
            close();
        }
    });
    const textarea = dialog.querySelector('.bilibili-toolbox-export-text');
    textarea.value = 'changed';
    dialog.querySelector('.bilibili-toolbox-export-confirm').click();

    assert.equal(confirmed, 'changed');
    assert.equal(document.body.children.length, 0);
}

function loadReaderScreenshotContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'reader-screenshot.js');
    return context;
}

{
    const { BilibiliToolbox } = loadReaderScreenshotContext();
    const screenshot = BilibiliToolbox.readerScreenshot;

    assert.deepEqual(
        plain(screenshot.getBounds([
            { x: 10, y: 20, width: 100, height: 50 },
            { x: 90, y: 5, width: 40, height: 80 }
        ])),
        { x: 10, y: 5, width: 120, height: 80 }
    );
    assert.equal(screenshot.getBounds([]), null);
}

function loadAnimationsContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'animations.js');
    return context;
}

function createAnimationContainer() {
    return {
        children: [{}],
        style: {},
        get firstChild() {
            return this.children[0] || null;
        },
        set innerHTML(value) {
            this._innerHTML = value;
            if (value === '') this.children = [];
        },
        get innerHTML() {
            return this._innerHTML || '';
        },
        getBoundingClientRect() {
            return {};
        }
    };
}

{
    const { BilibiliToolbox } = loadAnimationsContext();
    const animations = BilibiliToolbox.animations;
    const noop = () => {};
    const getTransform = () => 'scale(1) translate(0px,0px)';

    const noneContainer = createAnimationContainer();
    animations.resetImageContainer(noneContainer, 'none', 0, noop, getTransform, null);
    assert.equal(noneContainer.children.length, 1);
    assert.equal(noneContainer.style.opacity, '1');

    const fadeContainer = createAnimationContainer();
    animations.resetImageContainer(fadeContainer, 'fade', 0, noop, getTransform, null);
    assert.equal(fadeContainer.children.length, 0);
    assert.equal(fadeContainer.style.opacity, '0');
}

function loadReaderPreferencesContext() {
    const values = {};
    const storageListeners = new Set();
    const context = createBaseContext({
        chrome: {
            storage: {
                local: {
                    async get(keys) {
                        return Object.fromEntries(keys.map(key => [key, values[key]]));
                    },
                    async set(items) {
                        Object.assign(values, items);
                    }
                },
                onChanged: {
                    addListener(listener) {
                        storageListeners.add(listener);
                    },
                    removeListener(listener) {
                        storageListeners.delete(listener);
                    }
                }
            }
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'storage-service.js');
    runFile(context, 'animations.js');
    runFile(context, 'reader-preferences.js');
    return context;
}

(async () => {
    {
        const { BilibiliToolbox } = loadReaderPageGroupsContext();
        const pageGroups = BilibiliToolbox.readerPageGroups;
        const tall = { naturalWidth: 800, naturalHeight: 1300 };
        const wide = { naturalWidth: 1300, naturalHeight: 800 };
        const imgList = ['tall-a', 'tall-b', 'wide-c'];
        const images = {
            'tall-a': tall,
            'tall-b': { naturalWidth: 900, naturalHeight: 1200 },
            'wide-c': wide
        };
        const loadImage = async (src) => images[src] || null;

        assert.equal(pageGroups.isWideImage(wide, 0), true);
        assert.equal(pageGroups.isWideImage(tall, 0), false);
        assert.equal(pageGroups.isWideImage(tall, 90), true);
        assert.equal(pageGroups.getNextIndex({ currentIndex: 0, total: 3, step: 2 }), 2);
        assert.equal(pageGroups.getNextIndex({ currentIndex: 2, total: 3, step: 2 }), 3);

        assert.deepEqual(
            plain(await pageGroups.loadVisibleImages({
                currentIndex: 0,
                imgList,
                viewMode: 'single',
                loadImage,
                isWideImage: pageGroups.isWideImage
            })),
            { images: [tall], preloadStart: 1 }
        );
        assert.deepEqual(
            plain(await pageGroups.loadVisibleImages({
                currentIndex: 0,
                imgList,
                viewMode: 'double',
                loadImage,
                isWideImage: pageGroups.isWideImage
            })),
            { images: [tall, images['tall-b']], preloadStart: 2 }
        );
        assert.deepEqual(
            plain(await pageGroups.loadVisibleImages({
                currentIndex: 2,
                imgList,
                viewMode: 'auto',
                loadImage,
                isWideImage: pageGroups.isWideImage
            })),
            { images: [wide], preloadStart: 3 }
        );
        assert.deepEqual(
            plain(await pageGroups.loadVisibleImages({
                currentIndex: 1,
                imgList,
                viewMode: 'auto',
                loadImage,
                isWideImage: pageGroups.isWideImage
            })),
            { images: [images['tall-b']], preloadStart: 2 }
        );

        assert.equal(await pageGroups.getPreviousIndex({
            currentIndex: 1,
            viewMode: 'auto',
            loadImage: async (index) => images[imgList[index]],
            isWideImage: pageGroups.isWideImage
        }), 0);
        assert.equal(await pageGroups.getPreviousIndex({
            currentIndex: 4,
            viewMode: 'single',
            loadImage: async () => null,
            isWideImage: pageGroups.isWideImage
        }), 3);
        assert.equal(await pageGroups.getPreviousIndex({
            currentIndex: 4,
            viewMode: 'double',
            loadImage: async () => null,
            isWideImage: pageGroups.isWideImage
        }), 2);
        assert.equal(await pageGroups.getPreviousIndex({
            currentIndex: 2,
            viewMode: 'auto',
            loadImage: async () => wide,
            isWideImage: pageGroups.isWideImage
        }), 1);
        assert.equal(await pageGroups.getPreviousIndex({
            currentIndex: 2,
            viewMode: 'auto',
            loadImage: async () => tall,
            isWideImage: pageGroups.isWideImage
        }), 0);
    }

    const { BilibiliToolbox } = loadReaderPreferencesContext();
    const preferences = BilibiliToolbox.readerPreferences;
    const storage = BilibiliToolbox.storage;

    await storage.init();
    assert.deepEqual(plain(preferences.load()), plain(preferences.DEFAULT_READER_PREFERENCES));

    const custom = {
        isRightToLeft: false,
        viewMode: 'double',
        animationMode: 'fade',
        imageRenderMode: 'sharp',
        backgroundMode: 'darkGray',
        tapPageNavigation: false
    };
    await preferences.save(custom);
    assert.deepEqual(plain(preferences.load()), custom);

    assert.deepEqual(
        plain(preferences.normalize({
            isRightToLeft: 'no',
            viewMode: 'unknown',
            animationMode: 'book',
            imageRenderMode: 'raw',
            backgroundMode: 'purple',
            tapPageNavigation: 'yes'
        })),
        plain(preferences.DEFAULT_READER_PREFERENCES)
    );

    console.log('content module tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
