const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    let saved = {}, writes = 0, fail = false;
    const listeners = new Set();
    const context = vm.createContext({ console, chrome: { storage: {
        local: {
            async get() { return structuredClone(saved); },
            async set(value) {
                writes++;
                await new Promise(resolve => setImmediate(resolve));
                if (fail) { fail = false; throw new Error('write failed'); }
                saved = structuredClone(value);
                for (const listener of listeners) listener(Object.fromEntries(
                    Object.entries(value).map(([key, newValue]) => [key, { newValue }])), 'local');
            }
        },
        onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    } } });
    context.window = context;
    for (const file of ['shared.js', 'storage-service.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    return { ...context.BilibiliToolbox, writes: () => writes, fail: () => { fail = true; } };
}
const favorite = uid => ({ type: 'user', uid, uname: uid, face: 'https://example.com/a.jpg' });

test('simultaneous settings, additions, removals and imports retain each queued change', async () => {
    const { storage, favorites } = fixture();
    await storage.init();
    await Promise.all([
        storage.setSetting('favoriteColumns', 5),
        favorites.addFavorite(favorite('1')),
        storage.setSetting('hideForwardDynamics', true),
        favorites.addFavorite(favorite('2')),
        favorites.removeFavorite('user:1'),
        favorites.importFavorites([favorite('3')]),
        storage.setSetting('readerPreferences', { viewMode: 'single' })
    ]);
    const data = await storage.read();
    assert.equal(data.settings.favoriteColumns, 5);
    assert.equal(data.settings.hideForwardDynamics, true);
    assert.equal(data.settings.readerPreferences.viewMode, 'single');
    assert.deepEqual(Array.from(data.favorites, item => item.uid), ['2', '3']);
});

test('native change and write completion notify once; no-op writes are skipped', async () => {
    const { storage, writes } = fixture();
    await storage.init();
    let notifications = 0;
    storage.onChanged(() => notifications++);
    await storage.setSetting('favoriteColumns', 5);
    await storage.setSetting('favoriteColumns', 5);
    assert.equal(notifications, 1);
    assert.equal(writes(), 1);
});

test('a failed save does not publish speculative state or block the next queued save', async () => {
    const { storage, fail } = fixture();
    await storage.init();
    const changes = [];
    storage.onChanged(data => changes.push(data));
    fail();
    const broken = storage.setSetting('hideForwardDynamics', true);
    const next = storage.setSetting('favoriteColumns', 5);
    await assert.rejects(broken, /write failed/);
    await next;
    assert.equal(storage.getSetting('hideForwardDynamics'), false);
    assert.equal(storage.getSetting('favoriteColumns'), 5);
    assert.equal(changes.length, 1);
});
