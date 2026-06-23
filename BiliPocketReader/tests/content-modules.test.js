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
        this.style = {};
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

    dispatch(type, event = {}) {
        (this.listeners[type] || []).forEach(handler => handler({ target: this, ...event }));
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        this.focused = true;
    }

    select() {
        this.selected = true;
    }

    querySelector(selector) {
        if (!this.selectorCache[selector]) {
            this.selectorCache[selector] = new FakeElement(selector, this.ownerDocument);
        }
        return this.selectorCache[selector];
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

function loadDynamicControlsContext() {
    const context = createBaseContext();
    runFile(context, 'shared.js');
    runFile(context, 'favorites-text-dialog.js');
    runFile(context, 'dynamic-controls-ui.js');
    return context;
}

{
    const { BilibiliToolbox } = loadDynamicControlsContext();
    const controls = BilibiliToolbox.dynamicControlsUi;
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
