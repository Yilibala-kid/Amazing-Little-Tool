const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const values = {};
const storageListeners = new Set();
const context = {
    console,
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
};
context.window = context;
vm.createContext(context);

for (const file of ['shared.js', 'storage-service.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const { Shared, BilibiliToolbox } = context;
const favorites = BilibiliToolbox.favorites;
const storage = BilibiliToolbox.storage;
const plain = value => JSON.parse(JSON.stringify(value));
const alice = { type: 'user', uid: '1', uname: 'Alice', face: 'https://i.example/alice.jpg' };
const otter = { type: 'opus', uid: '41700837', uname: 'Ottergeist', face: 'https://i.example/otter.jpg' };
const column = { type: 'readlist', id: '2', title: 'Column', cover: 'https://i.example/column.jpg' };

function isTouchLikeDeviceFor({ coarse = false, noHover = false, maxTouchPoints = 0 } = {}) {
    context.matchMedia = query => ({
        matches: query === '(pointer: coarse)' ? coarse : query === '(hover: none)' ? noHover : false
    });
    context.navigator = { maxTouchPoints };
    return Shared.isTouchLikeDevice();
}

delete context.matchMedia;
delete context.navigator;
assert.equal(Shared.isTouchLikeDevice(), false);
assert.equal(isTouchLikeDeviceFor({ coarse: true }), true);
assert.equal(isTouchLikeDeviceFor({ noHover: true }), true);
assert.equal(isTouchLikeDeviceFor({ maxTouchPoints: 1 }), true);
assert.equal(isTouchLikeDeviceFor(), false);

assert.deepEqual(plain(favorites.normalizeImportedFavorites([alice, null, {}])), [alice]);
assert.deepEqual(plain(favorites.normalizeImportedFavorites([{ ...alice, link: 'https://old.example' }])), [alice]);
assert.deepEqual(
    plain(favorites.normalizeImportedFavorites('[<user:1><Alice><https://i.example/alice.jpg>]\n[<opus:41700837><Ottergeist><https://i.example/otter.jpg>]\n[<readlist:2><Column><https://i.example/column.jpg>]')),
    [alice, otter, column]
);
assert.deepEqual(
    plain(favorites.normalizeImportedFavorites('[\n  <user:1>\n  <\n  Alice Cooper\n  >\n  <\n  https://i.example/\n  alice.jpg\n  >\n]')),
    [{ ...alice, uname: 'Alice Cooper', face: 'https://i.example/alice.jpg' }]
);
assert.deepEqual(
    plain(favorites.normalizeImportedFavorites('[<user:1><Alice><https://i.example/a==b.jpg>]')),
    [{ ...alice, face: 'https://i.example/a==b.jpg' }]
);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('user:1\tAlice\thttps://i.example/alice.jpg')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('3')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('user:1')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('[<user:1>< ><https://i.example/alice.jpg>]')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('[<user:1><Alice><>]')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('[<USER:1><Alice><https://i.example/alice.jpg>]')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('[<user : 1><Alice><https://i.example/alice.jpg>]')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('[user:1==Alice==https://i.example/alice.jpg]')), []);
assert.deepEqual(plain(favorites.normalizeImportedFavorites('user:1==Alice==https://i.example/alice.jpg')), []);
assert.equal(Shared.getFavoriteLink({ uid: '42' }), '#');
assert.equal(Shared.getFavoriteLink({ type: 'user', uid: 42 }), '#');
assert.equal(Shared.getFavoriteLink({ type: 'user', uid: 'https://space.bilibili.com/42/dynamic' }), '#');
assert.equal(Shared.getFavoriteLink({ type: 'user', uid: '42' }), 'https://space.bilibili.com/42/dynamic');
assert.equal(Shared.getFavoriteLink({ type: 'opus', uid: '42' }), 'https://space.bilibili.com/42/upload/opus?bilibili_toolbox_opus_tab=1');
assert.equal(Shared.getFavoriteLink({ type: 'readlist', id: '9' }), 'https://www.bilibili.com/read/readlist/rl9');
assert.deepEqual(
    plain(Shared.normalizeSettings({ hideForwardDynamics: true, favoriteColumns: 5, readerPreferences: { viewMode: 'single' } })),
    { hideForwardDynamics: true, favoriteColumns: 5, readerPreferences: { viewMode: 'single' } }
);
assert.deepEqual(
    plain(Shared.normalizeSettings({ hideForwardDynamics: 'yes', favoriteColumns: 9, readerPreferences: 'bad' })),
    plain(Shared.DEFAULT_SETTINGS)
);

(async () => {
    await storage.init();
    await storage.write({ favorites: [alice], settings: { hideForwardDynamics: true } });

    const result = await favorites.importFavorites([alice, otter, column, {}]);
    assert.equal(result.added, 2);
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(plain(result.data.favorites), [alice, otter, column]);
    assert.deepEqual(
        plain(result.data.settings),
        { ...plain(Shared.DEFAULT_SETTINGS), hideForwardDynamics: true }
    );

    const exportedText = favorites.createExportText(result.data);
    assert.equal(exportedText, '[<user:1><Alice><https://i.example/alice.jpg>]\n[<opus:41700837><Ottergeist><https://i.example/otter.jpg>]\n[<readlist:2><Column><https://i.example/column.jpg>]');
    assert.deepEqual(
        plain(favorites.normalizeImportedFavorites(exportedText)),
        [alice, otter, column]
    );

    await storage.write({ favorites: [{ type: 'user', uid: '1', uname: '\u7528\u6237', face: 'https://www.bilibili.com/favicon.ico' }], settings: {} });
    const enriched = await favorites.importFavorites(exportedText);
    assert.equal(enriched.added, 2);
    assert.equal(enriched.updated, 1);
    assert.deepEqual(plain(enriched.data.favorites), [alice, otter, column]);
    console.log('storage-service tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
