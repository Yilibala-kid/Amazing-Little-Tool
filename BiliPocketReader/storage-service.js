// Bilibili Toolbox - shared storage service
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;

    let dataCache = window.Shared.createDefaultData();
    let initialized = false;
    let changeListeners = new Set();
    let storageListener = null;

    function dataSignature(data) {
        return JSON.stringify(window.Shared.normalizeToolboxData(data));
    }

    async function read() {
        const result = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
        dataCache = window.Shared.normalizeToolboxData(result[window.Shared.SHARED_STORAGE_KEY]);
        return dataCache;
    }

    async function write(data) {
        dataCache = window.Shared.normalizeToolboxData(data);
        await chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: dataCache });
        notify(dataCache);
        return dataCache;
    }

    function notify(data) {
        const normalized = window.Shared.normalizeToolboxData(data);
        changeListeners.forEach(listener => listener(normalized));
    }

    async function update(mutator) {
        const current = await read();
        const next = typeof mutator === 'function' ? mutator(current) : mutator;
        return write(next);
    }

    async function setSetting(key, value) {
        return update(current => ({
            ...current,
            settings: { ...current.settings, [key]: value }
        }));
    }

    function getSetting(key, fallback = false) {
        return Object.prototype.hasOwnProperty.call(dataCache.settings, key)
            ? dataCache.settings[key]
            : fallback;
    }

    function onChanged(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
    }

    function handleExtensionStorageChange(changes, areaName) {
        if (areaName !== 'local' || !changes[window.Shared.SHARED_STORAGE_KEY]) return;
        const nextData = window.Shared.normalizeToolboxData(changes[window.Shared.SHARED_STORAGE_KEY].newValue);
        if (dataSignature(nextData) === dataSignature(dataCache)) return;
        dataCache = nextData;
        notify(dataCache);
    }

    async function init() {
        if (!initialized) {
            storageListener = handleExtensionStorageChange;
            chrome.storage.onChanged.addListener(storageListener);
            initialized = true;
        }

        return read();
    }

    function destroy() {
        if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
        storageListener = null;
        initialized = false;
        changeListeners = new Set();
    }

    function parseFavoriteBlockContent(content) {
        if (typeof content !== 'string') return null;

        const parts = content.match(/^\s*<([^<>]*)>\s*<([^<>]*)>\s*<([^<>]*)>\s*$/);
        if (!parts) return null;

        const [, keyRaw, nameRaw, imageRaw] = parts;
        const key = keyRaw.trim();
        const name = nameRaw.replace(/\s+/g, ' ').trim();
        const image = imageRaw.replace(/\s+/g, '').trim();
        const match = key.match(/^(user|opus|readlist):(\d+)$/);
        if (!match) return null;
        if (!name || !image) return null;

        const type = match[1].toLowerCase();
        const isReadlist = type === window.Shared.READLIST_TYPE;
        return {
            type: isReadlist ? window.Shared.READLIST_TYPE : type,
            [isReadlist ? 'id' : 'uid']: match[2],
            [isReadlist ? 'title' : 'uname']: name,
            [isReadlist ? 'cover' : 'face']: image
        };
    }

    function parseFavoriteText(text) {
        const favorites = [];
        const pattern = /\[([\s\S]*?)\]/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const favorite = parseFavoriteBlockContent(match[1]);
            if (favorite) favorites.push(favorite);
        }

        return favorites;
    }

    function normalizeImportedFavorites(data) {
        if (typeof data === 'string') {
            return window.Shared.normalizeFavoriteList(parseFavoriteText(data));
        }

        return window.Shared.normalizeFavoriteList(data);
    }

    function mergeFavorites(existing, imported) {
        const result = [...existing];
        const indexes = new Map(result.map((item, index) => [window.Shared.getFavoriteKey(item), index]));
        let added = 0;
        let updated = 0;

        imported.forEach(item => {
            const key = window.Shared.getFavoriteKey(item);
            if (!key) return;
            const index = indexes.get(key);
            if (index !== undefined) {
                const merged = { ...result[index], ...item };
                if (JSON.stringify(merged) !== JSON.stringify(result[index])) {
                    result[index] = merged;
                    updated += 1;
                }
                return;
            }
            indexes.set(key, result.length);
            result.push(item);
            added += 1;
        });

        return { result, added, updated, skipped: imported.length - added - updated };
    }

    async function addFavorite(item) {
        const current = await read();
        const normalized = window.Shared.normalizeFavorite(item);
        const key = window.Shared.getFavoriteKey(normalized);
        if (!key) return { data: current, added: false, reason: 'invalid' };
        if (current.favorites.some(existing => window.Shared.getFavoriteKey(existing) === key)) {
            return { data: current, added: false, reason: 'duplicate' };
        }

        const data = await write({ ...current, favorites: [...current.favorites, normalized] });
        return { data, added: true, key };
    }

    async function removeFavorite(favoriteKey) {
        const current = await read();
        const favorites = current.favorites.filter(item => window.Shared.getFavoriteKey(item) !== favoriteKey);
        if (favorites.length === current.favorites.length) {
            return { data: current, removed: false };
        }

        const data = await write({ ...current, favorites });
        return { data, removed: true };
    }

    async function importFavorites(imported) {
        const current = await read();
        const normalized = normalizeImportedFavorites(imported);
        const merged = mergeFavorites(current.favorites, normalized);
        const data = merged.added || merged.updated
            ? await write({ ...current, favorites: merged.result })
            : current;
        return { ...merged, data };
    }

    function cleanExportName(value) {
        return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    }

    function cleanExportImage(value) {
        return typeof value === 'string' ? value.replace(/\s+/g, '').trim() : '';
    }

    function createExportText(data = dataCache) {
        return window.Shared.normalizeToolboxData(data).favorites
            .map(item => {
                const key = window.Shared.getFavoriteKey(item);
                if (!key) return '';
                const name = cleanExportName(window.Shared.getFavoriteName(item));
                const image = cleanExportImage(window.Shared.getFavoriteImage(item));
                return name && image ? `[<${key}><${name}><${image}>]` : '';
            })
            .filter(Boolean)
            .join('\n');
    }

    const storageApi = {
        init,
        destroy,
        read,
        write,
        update,
        setSetting,
        getSetting,
        onChanged
    };

    Toolbox.storage = storageApi;
    Toolbox.favorites = {
        addFavorite,
        removeFavorite,
        importFavorites,
        normalizeImportedFavorites,
        createExportText
    };
})();
