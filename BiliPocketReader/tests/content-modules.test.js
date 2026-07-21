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

    getAttribute(name) {
        return this[name] || null;
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
    runFile(context, 'bilibili-dom-adapter.js');
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
    runFile(context, 'bilibili-dom-adapter.js');
    runFile(context, 'dynamic-filter.js');
    return { context, getObservedOptions: () => observedOptions };
}

function loadReaderPageGroupsContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'comic-reader-page-groups.js');
    return context;
}

function loadComicImagesContext(initialState = null) {
    const context = createBaseContext({
        __INITIAL_STATE__: initialState,
        document: {
            querySelectorAll() { return []; },
            querySelector() { return null; }
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'bilibili-dom-adapter.js');
    runFile(context, 'comic-reader-images.js');
    return context;
}

function createFakeImageNode({ attrs = {} } = {}) {
    return {
        classList: { contains() { return false; } },
        getAttribute(name) {
            return attrs[name] || null;
        },
        closest(selector) {
            return null;
        }
    };
}

function loadUrlBridgeContext() {
    const listeners = {};
    const history = {
        pushCalls: 0,
        replaceCalls: 0,
        pushState() { this.pushCalls += 1; },
        replaceState() { this.replaceCalls += 1; }
    };
    const context = createBaseContext({
        history,
        Event: class {
            constructor(type) {
                this.type = type;
            }
        },
        dispatchEvent(event) {
            (listeners[event.type] || []).forEach(listener => listener(event));
        },
        addEventListener(type, listener) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(listener);
        },
        removeEventListener(type, listener) {
            listeners[type] = (listeners[type] || []).filter(item => item !== listener);
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'content-url.js');
    return { context, history, listeners };
}

function createFakeSpaceTab(text, active = false) {
    const classList = new FakeClassList();
    if (active) classList.add('active');

    const tab = {
        textContent: text,
        className: active ? 'content-tab active' : 'content-tab',
        classList,
        clickCount: 0,
        setActive(enabled) {
            this.className = enabled ? 'content-tab active' : 'content-tab';
            this.classList.toggle('active', enabled);
        },
        getBoundingClientRect() {
            return { width: 80, height: 32 };
        },
        click() {
            this.clickCount += 1;
            this.setActive(true);
        }
    };
    return tab;
}

function loadSpaceOpusTabsContext(href, tabs, options = {}) {
    let nextTimerId = 1;
    let currentTime = options.now || 0;
    const timers = [];
    const clearedTimers = [];
    const clearedTimerIds = new Set();
    let observer = null;
    const opusBody = options.hasBody === false ? null : { className: 'opus-body' };
    const opusFeed = options.hasFeed === false ? null : { className: 'opus-feed' };
    const contentFilter = { className: 'content-filter' };
    const document = {
        body: {},
        querySelector(selector) {
            if (selector === '.opus .opus-header__top .content-filter, .content-filter') return contentFilter;
            if (selector === '.opus .opus-body') return opusBody;
            if (selector === '.opus .opus-feed, .opus .opus-collection') return opusFeed;
            return null;
        },
        querySelectorAll(selector) {
            return selector === '.content-filter .content-tab' ? tabs : [];
        }
    };
    const context = createBaseContext({
        document,
        location: { href },
        Date: {
            now() {
                return currentTime;
            }
        },
        setTimeout(callback, delay) {
            const id = nextTimerId;
            nextTimerId += 1;
            timers.push({ id, callback, delay, dueAt: currentTime + delay });
            return id;
        },
        clearTimeout(id) {
            clearedTimers.push(id);
            clearedTimerIds.add(id);
        },
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
                this.disconnected = false;
                observer = this;
            }

            observe(target, options) {
                this.target = target;
                this.options = options;
            }

            disconnect() {
                this.disconnected = true;
            }
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'bilibili-dom-adapter.js');
    runFile(context, 'space-opus-tabs.js');
    return {
        context,
        timers,
        clearedTimers,
        getObserver: () => observer,
        advance(ms) {
            currentTime += ms;
        },
        runDueTimers() {
            timers
                .filter(timer => !clearedTimerIds.has(timer.id) && timer.dueAt <= currentTime && !timer.ran)
                .forEach(timer => {
                    timer.ran = true;
                    timer.callback();
                });
        },
        triggerMutation() {
            observer?.callback?.();
        }
    };
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
    runFile(context, 'bilibili-dom-adapter.js');
    runFile(context, 'content-page-info.js');
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
    const { context, history } = loadUrlBridgeContext();
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    let changes = 0;
    context.addEventListener(context.BilibiliToolbox.url.URL_CHANGE_EVENT, () => { changes += 1; });

    context.BilibiliToolbox.url.init();
    history.pushState({}, '', '/a');
    history.replaceState({}, '', '/b');
    assert.equal(changes, 2);
    assert.notEqual(history.pushState, originalPush);
    assert.notEqual(history.replaceState, originalReplace);

    context.BilibiliToolbox.url.destroy();
    assert.equal(history.pushState, originalPush);
    assert.equal(history.replaceState, originalReplace);
}

{
    const { BilibiliToolbox } = loadComicImagesContext();
    const images = BilibiliToolbox.comicImages;
    const img = createFakeImageNode({
        attrs: {
            'data-original': '//i0.hdslb.com/bfs/new_dyn/original.png@1000w_1000h.webp',
            src: '//i0.hdslb.com/bfs/new_dyn/regular.png@4000w_4000h.webp'
        }
    });

    assert.equal(
        images.normalizeImageUrl('//i0.hdslb.com/bfs/new_dyn/page.png@1110w_1570h.webp'),
        'https://i0.hdslb.com/bfs/new_dyn/page.png'
    );
    assert.equal(
        images.normalizeImageUrl('//i0.hdslb.com/bfs/new_dyn/page.png@1110w_1570h.webp', { preserveBiliSuffix: true }),
        'https://i0.hdslb.com/bfs/new_dyn/page.png@1110w_1570h.webp'
    );
    assert.equal(
        images.getImageSource(img),
        'https://i0.hdslb.com/bfs/new_dyn/original.png'
    );
    assert.equal(
        images.getImageSource(img, { preserveBiliSuffix: true }),
        'https://i0.hdslb.com/bfs/new_dyn/original.png@1000w_1000h.webp'
    );
}

{
    const { BilibiliToolbox } = loadComicImagesContext();
    const images = BilibiliToolbox.comicImages;
    const img = createFakeImageNode({
        attrs: {
            srcset: '//i0.hdslb.com/bfs/new_dyn/source-large.png@1600w_1600h.webp 2x',
            currentSrc: '//i0.hdslb.com/bfs/new_dyn/current-medium.png@1200w_1200h.webp',
            src: '//i0.hdslb.com/bfs/new_dyn/regular.png@800w_800h.webp'
        }
    });

    assert.equal(
        images.getImageSource(img),
        'https://i0.hdslb.com/bfs/new_dyn/regular.png'
    );
}

{
    const state = {
        detail: {
            modules: [{
                module_top: {
                    display: {
                        album: {
                            pics: [
                                { url: '//i0.hdslb.com/bfs/new_dyn/page-one.png@400w_400h.webp' },
                                { url: '//i0.hdslb.com/bfs/new_dyn/page-two.png@2000w_2000h.webp' }
                            ]
                        }
                    }
                }
            }]
        }
    };
    const { BilibiliToolbox } = loadComicImagesContext(state);

    assert.deepEqual(plain(BilibiliToolbox.comicImages.collectDynamicImagesFromState()), [
        'https://i0.hdslb.com/bfs/new_dyn/page-one.png',
        'https://i0.hdslb.com/bfs/new_dyn/page-two.png'
    ]);
    assert.deepEqual(plain(BilibiliToolbox.comicImages.collectDynamicImagesFromState({ preserveBiliSuffix: true })), [
        'https://i0.hdslb.com/bfs/new_dyn/page-one.png@400w_400h.webp',
        'https://i0.hdslb.com/bfs/new_dyn/page-two.png@2000w_2000h.webp'
    ]);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f'),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context } = loadSpaceOpusTabsContext(
        'https://space.bilibili.com/16290759/upload/opus',
        tabs,
        { hasBody: false }
    );

    context.BilibiliToolbox.spaceOpusTabs.init();

    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(tabs[1].clickCount, 0);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f'),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context, advance } = loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/upload/opus', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();

    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(tabs[1].clickCount, 0);

    advance(500);
    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), true);
    assert.equal(tabs[1].clickCount, 1);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f'),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context } = loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/dynamic', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();

    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(tabs[1].clickCount, 0);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f')
    ];
    const { context, advance } = loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/upload/opus', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();
    advance(500);

    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(tabs[1].clickCount, 0);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587'),
        createFakeSpaceTab('\u4e13\u680f', true),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context, advance, getObserver } =
        loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/upload/opus', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();
    advance(500);

    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(getObserver().disconnected, false);
    advance(1199);
    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), false);
    assert.equal(getObserver().disconnected, false);
    advance(1);
    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), true);
    assert.equal(getObserver().disconnected, true);
    assert.equal(tabs[1].clickCount, 0);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f'),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context, advance, runDueTimers, triggerMutation, getObserver } =
        loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/upload/opus', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();
    advance(500);
    assert.equal(context.BilibiliToolbox.spaceOpusTabs.selectNow(), true);
    assert.equal(tabs[1].clickCount, 1);

    advance(800);
    runDueTimers();
    tabs[1].setActive(false);
    tabs[0].setActive(true);
    triggerMutation();
    advance(500);
    runDueTimers();

    assert.equal(tabs[1].clickCount, 2);
    assert.equal(getObserver().disconnected, false);
}

{
    const tabs = [
        createFakeSpaceTab('\u5168\u90e8\u56fe\u6587', true),
        createFakeSpaceTab('\u4e13\u680f'),
        createFakeSpaceTab('\u52a8\u6001')
    ];
    const { context, timers, clearedTimers, getObserver } =
        loadSpaceOpusTabsContext('https://space.bilibili.com/16290759/upload/opus', tabs);

    context.BilibiliToolbox.spaceOpusTabs.init();
    assert.equal(timers.length, 7);
    assert.deepEqual(timers.map(timer => timer.delay), [600, 1200, 2200, 3500, 5500, 8000, 12000]);
    assert.deepEqual(
        plain(getObserver().options),
        { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }
    );

    context.BilibiliToolbox.spaceOpusTabs.destroy();

    assert.deepEqual(clearedTimers, timers.map(timer => timer.id));
    assert.equal(getObserver().disconnected, true);
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

function loadFavoritesUiContext(data, keywordState = { enabled: false, isActive: false }) {
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
            getKeywordFilterState() { return keywordState; }
        },
        getData: () => data
    });
    return { context, document };
}

{
    const data = {
        ...loadDynamicFilterContext().Shared.createDefaultData(),
        settings: { favoriteColumns: 4 }
    };
    const { document } = loadSettingsPopoverDomContext(data);
    const panel = document.getElementById('bilibili-toolbox-settings-panel');
    const buttons = panel.querySelectorAll('.bilibili-toolbox-favorite-columns button');

    assert.equal(panel.innerHTML.includes('\u52a8\u6001\u8fc7\u6ee4\uff08\u5728\u52a8\u6001\u9875\u751f\u6548\uff09'), true);
    assert.equal(panel.innerHTML.includes('\u81ea\u52a8\u5207\u5230\u4e13\u680f'), false);
    assert.equal(panel.innerHTML.includes('bilibili-toolbox-opus-tab-toggle'), false);
    assert.equal(panel.innerHTML.includes('bilibili-toolbox-control-status'), false);
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
    const baseData = loadDynamicFilterContext().Shared.createDefaultData();
    const data = {
        ...baseData,
        favorites: [
            { type: 'readlist', id: '3001', title: 'First Readlist', cover: 'readlist.jpg' },
            { type: 'user', uid: '1001', uname: 'Second User', face: 'user.jpg' },
            { type: 'opus', uid: '2001', uname: 'Third Opus', face: 'opus.jpg' }
        ]
    };
    const { document } = loadFavoritesUiContext(data);
    document.getElementById('bilibili-fav-float-btn').dispatch('mouseenter');

    const html = document.querySelector('.bilibili-fav-list').innerHTML;
    assert.ok(html.indexOf('First Readlist') < html.indexOf('Second User'));
    assert.ok(html.indexOf('Second User') < html.indexOf('Third Opus'));
}

{
    const baseData = loadDynamicFilterContext().Shared.createDefaultData();
    const inactive = loadFavoritesUiContext({
        ...baseData,
        settings: { ...baseData.settings, hideForwardDynamics: false }
    });
    assert.equal(
        inactive.document.getElementById('bilibili-fav-float-btn').classList.contains('dynamic-filter-active'),
        false
    );

    const forwardEnabled = loadFavoritesUiContext({
        ...baseData,
        settings: { ...baseData.settings, hideForwardDynamics: true }
    });
    assert.equal(
        forwardEnabled.document.getElementById('bilibili-fav-float-btn').classList.contains('dynamic-filter-active'),
        true
    );

    const keywordEnabled = loadFavoritesUiContext({
        ...baseData,
        settings: { ...baseData.settings, hideForwardDynamics: false }
    }, { enabled: true, isActive: false });
    assert.equal(
        keywordEnabled.document.getElementById('bilibili-fav-float-btn').classList.contains('dynamic-filter-active'),
        true
    );
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

function loadReaderSelectionContext(readerRect = { width: 1000, height: 800 }) {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    Object.assign(context.BilibiliToolbox, {
        readerScreenshot: {
            getBounds() {
                return null;
            }
        }
    });
    runFile(context, 'reader-selection.js');

    const selectionBox = {
        style: {},
        closest(selector) {
            return selector === '.comic-sel-handle' ? null : null;
        }
    };
    const selectionSaveBtn = {
        disabled: false,
        classList: new FakeClassList()
    };
    const reader = {
        isSelectingScreenshot: true,
        isDraggingSelection: false,
        selectionPointerId: null,
        resizeDirection: null,
        selectionDragMode: null,
        selectionMoveStart: null,
        selectionMoveRect: null,
        selectionStart: { x: 100, y: 120 },
        selectionCurrent: { x: 300, y: 420 },
        selectionHandles: {},
        el: {
            reader: {
                getBoundingClientRect() {
                    return { left: 0, top: 0, ...readerRect };
                }
            },
            selectionBox,
            selectionOverlay: {
                style: {},
                setPointerCapture() {},
                releasePointerCapture() {}
            },
            selectionSaveBtn,
            selectionHint: { textContent: '' }
        },
        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        },
        showReaderMessage(message, isError) {
            this.lastMessage = { message, isError };
        },
        hideSettingsPanel() {},
        hideControls() {},
        showControls() {},
        captureScreenshot: async () => true
    };
    context.BilibiliToolbox.readerSelection.attach(reader);
    return { context, reader, selectionBox };
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

{
    const { reader, selectionBox } = loadReaderSelectionContext();
    const eventBase = {
        button: 0,
        pointerId: 1,
        target: selectionBox,
        preventDefault() {}
    };

    reader.handleSelectionPointerDown({ ...eventBase, clientX: 150, clientY: 180 });
    reader.handleSelectionPointerMove({ ...eventBase, clientX: 250, clientY: 280 });
    reader.handleSelectionPointerUp({ ...eventBase, clientX: 250, clientY: 280 });

    assert.deepEqual(plain(reader.normalizeSelectionRect()), {
        x: 200,
        y: 220,
        width: 200,
        height: 300
    });
}

function loadAnimationsContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'animations.js');
    return context;
}

function loadReaderTransformContext(readerRect = { width: 1200, height: 900 }, gap = 0) {
    const context = createBaseContext({
        getComputedStyle() {
            return { columnGap: String(gap), gap: String(gap) };
        }
    });
    runFile(context, 'shared.js');
    runFile(context, 'reader-transform.js');
    const reader = {
        imageRenderMode: 'sharp',
        rotation: 0,
        scale: 1,
        fitScale: 1,
        sharpDisplayFitRatio: 1,
        translateX: 0,
        translateY: 0,
        isTouchDevice: false,
        touchPanLocked: false,
        el: {
            reader: {
                getBoundingClientRect() {
                    return readerRect;
                }
            },
            imgContainer: {}
        },
        setupImg(img, isFull, displaySize) {
            img.appliedIsFull = isFull;
            img.appliedDisplaySize = displaySize;
            img.dataset = img.dataset || {};
            if (displaySize) {
                img.dataset.displayWidth = String(displaySize.width);
                img.dataset.displayHeight = String(displaySize.height);
            }
        },
        clearPendingTap() {},
        syncRotateButton() {}
    };
    context.BilibiliToolbox.readerTransform.attach(reader);
    return { context, reader };
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

    assert.deepEqual(plain(animations.ANIMATION_MODES), ['smooth', 'fade']);

    const immediateContainer = createAnimationContainer();
    animations.resetImageContainer(immediateContainer, animations.IMMEDIATE_RENDER_MODE, 0, noop, getTransform, null);
    assert.equal(immediateContainer.children.length, 0);
    assert.equal(immediateContainer.style.opacity, '1');

    const fadeContainer = createAnimationContainer();
    animations.resetImageContainer(fadeContainer, 'fade', 0, noop, getTransform, null);
    assert.equal(fadeContainer.children.length, 0);
    assert.equal(fadeContainer.style.opacity, '0');
}

{
    const { reader } = loadReaderTransformContext();
    const [small] = reader.getSharpDisplaySizes([{ naturalWidth: 400, naturalHeight: 300 }], true);
    assert.deepEqual(plain(small), { width: 400, height: 300 });
    assert.equal(reader.sharpDisplayFitRatio, 3);
    reader.updateFitScale([{ naturalWidth: 400, naturalHeight: 300, dataset: {} }]);
    assert.equal(reader.getRenderScale(), 3);
    assert.equal(reader.getMaxScale(), 3);
}

{
    const { reader } = loadReaderTransformContext();
    const largeImage = { naturalWidth: 2400, naturalHeight: 1800, dataset: {} };
    const [large] = reader.getSharpDisplaySizes([largeImage], true);
    assert.deepEqual(plain(large), { width: 2400, height: 1800 });
    assert.equal(reader.sharpDisplayFitRatio, 0.5);
    reader.updateFitScale([largeImage]);
    assert.equal(reader.getRenderScale(), 0.5);
    assert.equal(reader.getTransformStyle(), 'scale(0.5) translate(0px,0px)');
    assert.equal(reader.getMaxScale(), 4);
    assert.equal(reader.getDoubleClickScale(), 2);
    assert.equal(reader.getRenderScale(reader.getDoubleClickScale()), 1);
}

{
    const { reader } = loadReaderTransformContext();
    const images = [
        { naturalWidth: 1000, naturalHeight: 1000 },
        { naturalWidth: 500, naturalHeight: 500 }
    ];
    const sizes = reader.getSharpDisplaySizes(images, false);
    assert.deepEqual(plain(sizes), [
        { width: 1000, height: 1000 },
        { width: 1000, height: 1000 }
    ]);
    reader.setupImagesForRenderMode(images);
    assert.deepEqual(plain(images.map(img => img.appliedDisplaySize)), [
        { width: 1000, height: 1000 },
        { width: 1000, height: 1000 }
    ]);
}

{
    const { reader } = loadReaderTransformContext();
    reader.imageRenderMode = 'smooth';
    const images = [
        { naturalWidth: 1000, naturalHeight: 1000 },
        { naturalWidth: 500, naturalHeight: 500 }
    ];
    reader.setupImagesForRenderMode(images);
    assert.deepEqual(plain(images.map(img => img.appliedDisplaySize)), [
        { width: 1000, height: 1000 },
        { width: 1000, height: 1000 }
    ]);
    reader.updateFitScale(images);
    assert.equal(reader.getRenderScale(), 0.6);
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

function createFakeImageClass({ failLoad = false } = {}) {
    const created = [];
    class FakeImage {
        constructor() {
            created.push(this);
        }

        set src(value) {
            this._src = value;
            if (failLoad) this.onerror?.();
            else this.onload?.();
        }

        get src() {
            return this._src;
        }
    }

    return { Image: FakeImage, created };
}

function loadComicReaderCoreContext(ImageClass, overrides = {}) {
    const context = createBaseContext({
        Image: ImageClass,
        document: createFakeDocument(),
        clearTimeout() {},
        setTimeout() { return 1; }
    });
    runFile(context, 'shared.js');
    Object.assign(context.BilibiliToolbox, {
        bilibiliDom: { isComicReaderPage() { return true; } },
        storage: {},
        comicImages: overrides.comicImages || { collectImages() { return []; } },
        animations: { IMMEDIATE_RENDER_MODE: 'immediate' },
        readerPreferences: {
            normalize(value) { return value; },
            load() {
                return {
                    isRightToLeft: false,
                    viewMode: 'auto',
                    animationMode: 'smooth',
                    imageRenderMode: 'sharp',
                    backgroundMode: 'black',
                    filterMode: 'original',
                    tapPageNavigation: true
                };
            },
            normalizeFilterMode(mode) {
                return ['original', 'soft', 'warm', 'grayscale'].includes(mode) ? mode : 'original';
            }
        },
        readerScreenshot: {},
        readerTransform: {
            attach(reader) {
                reader.handleMouseMove = function() {};
                reader.handleMouseUp = function() {};
                return reader;
            }
        },
        readerSelection: {
            attach(reader) {
                reader.handleSelectionPointerDown = function() {};
                reader.handleSelectionPointerMove = function() {};
                reader.handleSelectionPointerUp = function() {};
                reader.handleSettingsOutsidePointerDown = function() {};
                return reader;
            }
        },
        readerDom: { attach(reader) { return reader; } },
        readerPageGroups: {},
        readerInteractions: {}
    });
    runFile(context, 'comic-reader.js');
    return new context.BilibiliToolbox.reader.BiliComicReader();
}

(async () => {
    {
        const { reader } = loadReaderSelectionContext();

        await reader.saveSelectionScreenshot();

        assert.equal(reader.isSelectingScreenshot, true);
        assert.deepEqual(plain(reader.normalizeSelectionRect()), {
            x: 100,
            y: 120,
            width: 200,
            height: 300
        });
        assert.equal(reader.el.selectionBox.style.display, 'block');
    }
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
    {
        const { Image, created } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image);
        const img = await reader.loadImage('https://i0.hdslb.com/bfs/new_dyn/page.png');

        assert.equal(img, created[0]);
        assert.equal(created[0].src, 'https://i0.hdslb.com/bfs/new_dyn/page.png');
    }
    {
        const { Image, created } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image);
        const first = reader.loadImage('https://i0.hdslb.com/bfs/new_dyn/cached.png');
        const second = reader.loadImage('https://i0.hdslb.com/bfs/new_dyn/cached.png');

        assert.equal(await first, await second);
        assert.equal(created.length, 1);
    }
    {
        const { Image, created } = createFakeImageClass({ failLoad: true });
        const reader = loadComicReaderCoreContext(Image);
        const img = await reader.loadImage('https://i0.hdslb.com/bfs/new_dyn/missing.png');

        assert.equal(img, null);
        assert.equal(created[0].src, 'https://i0.hdslb.com/bfs/new_dyn/missing.png');
        assert.equal(reader.imageCache.has('https://i0.hdslb.com/bfs/new_dyn/missing.png'), false);
    }
    {
        const urls = ['p0', 'p1', 'p2', 'p3', 'p4'];
        const { Image, created } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image, {
            comicImages: { collectImages() { return urls; } }
        });

        reader.init();

        assert.deepEqual(created.map(img => img.src), ['p0', 'p1', 'p2', 'p3']);
        assert.deepEqual(reader.imgList, urls);
    }
    {
        const { Image, created } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image);
        reader.imgList = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
        reader.currentIndex = 1;
        reader.activePageCount = 1;

        reader.preloadImages(2);

        assert.deepEqual(created.map(img => img.src), ['p2', 'p3', 'p4', 'p5']);
        assert.deepEqual(Array.from(reader.imageCache.keys()), ['p2', 'p3', 'p4', 'p5']);
    }
    {
        let receivedOptions = null;
        const { Image } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image, {
            comicImages: {
                collectImages(options) {
                    receivedOptions = options;
                    return ['p0'];
                }
            }
        });

        reader.imageRenderMode = 'smooth';
        assert.deepEqual(reader.collectReaderImages(), ['p0']);
        assert.deepEqual(plain(receivedOptions), { preserveBiliSuffix: true });
    }
    {
        const { Image } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image);
        const img = { style: {}, dataset: {} };

        reader.imageRenderMode = 'smooth';
        reader.isSharpRenderMode = function() { return this.imageRenderMode === 'sharp'; };
        reader.rotation = 0;
        reader.setupImg(img, true, { width: 900, height: 1200 });

        assert.equal(img.style.width, '900px');
        assert.equal(img.style.height, '1200px');
        assert.equal(img.style.maxWidth, 'none');
        assert.equal(img.style.maxHeight, 'none');
        assert.equal(img.style.objectFit, 'contain');
    }
    {
        const { Image } = createFakeImageClass();
        const reader = loadComicReaderCoreContext(Image);
        const style = {
            setProperty(name, value) {
                this[name] = value;
            }
        };
        reader.el.reader = { style };

        reader.filterMode = 'grayscale';
        reader.applyReaderFilter();
        assert.equal(style['--comic-image-filter'], 'grayscale(1)');

        reader.filterMode = 'unknown';
        reader.applyReaderFilter();
        assert.equal(style['--comic-image-filter'], 'none');
    }

    const { BilibiliToolbox } = loadReaderPreferencesContext();
    const preferences = BilibiliToolbox.readerPreferences;
    const storage = BilibiliToolbox.storage;

    await storage.init();
    assert.deepEqual(plain(preferences.FILTER_MODES), ['original', 'soft', 'warm', 'grayscale']);
    assert.deepEqual(plain(preferences.load()), plain(preferences.DEFAULT_READER_PREFERENCES));

    const custom = {
        isRightToLeft: false,
        viewMode: 'double',
        animationMode: 'fade',
        imageRenderMode: 'sharp',
        backgroundMode: 'white',
        filterMode: 'warm',
        tapPageNavigation: true
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
            filterMode: 'unknown',
            tapPageNavigation: 'yes'
        })),
        plain(preferences.DEFAULT_READER_PREFERENCES)
    );

    console.log('content module tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
