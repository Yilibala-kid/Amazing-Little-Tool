const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load(storage) {
    const listeners = new Map(), events = [], messages = [];
    let managerOptions;
    const service = name => ({
        start() { events.push(`${name}:start`); },
        destroy() { events.push(`${name}:destroy`); },
        render() {}, refresh() {}, scan() {}, applySettings() {}, getCurrentStatusArticle() {},
        showMessage(text) { messages.push(text); }
    });
    const BetterX = {
        createTimeline: () => service('timeline'),
        createDownloads: () => service('downloads'),
        createManager(options) { managerOptions = options; return service('manager'); }
    };
    const window = {
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: type => listeners.delete(type)
    };
    const context = vm.createContext({ BetterX, window,
        document: { readyState: 'loading', addEventListener() {}, removeEventListener() {} },
        chrome: { storage: { local: storage } }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8'), context);
    return { app: BetterX.contentApp, events, messages, listeners, manager: managerOptions };
}

test('entrypoint uses defaults on read failure and cleans services on final page exit', async () => {
    const h = load({ async get() { throw new Error('Unavailable'); }, async set() {} });
    await h.app.init();
    await h.app.init();
    assert.equal(h.events.length, 3, 'init is idempotent');
    assert.equal(h.manager.getSettings().hideVideos, true);
    assert.match(h.messages[0], /Unavailable/);
    h.listeners.get('pagehide')({ persisted: true });
    assert.equal(h.events.length, 3, 'cached pages keep their services');
    h.listeners.get('pagehide')({ persisted: false });
    assert.deepEqual(h.events.slice(3), ['timeline:destroy', 'downloads:destroy', 'manager:destroy']);
    assert.equal(h.listeners.size, 0);
});

test('settings saves stay ordered, recover from rejection, and roll back to persisted state', async () => {
    const writes = [];
    let finish;
    const h = load({ async get() { return {}; }, set(value) {
        writes.push(value['betterX.settings.v1']);
        if (writes.length === 1) return new Promise(resolve => { finish = resolve; });
        if (writes.length === 2) return Promise.reject(new Error('Quota exceeded'));
        return Promise.resolve();
    } });
    await h.app.init();
    const first = h.manager.saveSettings({ hideVideos: false });
    const second = h.manager.saveSettings({ hideVideos: true, revealHidden: true });
    await Promise.resolve();
    assert.equal(writes.length, 1);
    finish();
    await Promise.all([first, second]);
    assert.equal(h.manager.getSettings().hideVideos, false);
    assert.equal(h.manager.getSettings().revealHidden, false);
    assert.match(h.messages[0], /Quota exceeded/);
    await h.manager.saveSettings({ hideVideos: true });
    assert.equal(writes.length, 3, 'a failed write must not block later saves');
    h.app.destroy();
});

test('destroy while storage is loading prevents a late initialization', async () => {
    let finish;
    const h = load({ get: () => new Promise(resolve => { finish = resolve; }) });
    const loading = h.app.init();
    h.app.destroy();
    finish({});
    await loading;
    assert.equal(h.events.some(event => event.endsWith(':start')), false);
});
