// Bilibili Toolbox - shared storage service
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox || (window.BilibiliToolbox = {});

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

    async function setFavorites(favorites) {
        return update(current => ({ ...current, favorites }));
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

    function normalizeImportedFavorites(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.favorites)) return [];
        return data.favorites.filter(item => window.Shared.getFavoriteKey(item));
    }

    function mergeFavorites(existing, imported) {
        const keys = new Set(existing.map(item => window.Shared.getFavoriteKey(item)));
        const result = [...existing];
        let added = 0;

        imported.forEach(item => {
            const key = window.Shared.getFavoriteKey(item);
            if (!key || keys.has(key)) return;
            keys.add(key);
            result.push(item);
            added += 1;
        });

        return { result, added, skipped: imported.length - added };
    }

    async function addFavorite(item) {
        const current = await read();
        const key = window.Shared.getFavoriteKey(item);
        if (!key) return { data: current, added: false, reason: 'invalid' };
        if (current.favorites.some(existing => window.Shared.getFavoriteKey(existing) === key)) {
            return { data: current, added: false, reason: 'duplicate' };
        }

        const data = await write({ ...current, favorites: [...current.favorites, item] });
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
        const normalized = Array.isArray(imported) ? imported : normalizeImportedFavorites(imported);
        const merged = mergeFavorites(current.favorites, normalized);
        const data = merged.added
            ? await write({ ...current, favorites: merged.result })
            : current;
        return { ...merged, data };
    }

    function getExportFileName(now = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `bilibili-favorites-${ts}.json`;
    }

    function createExportBlob(data = dataCache) {
        return new Blob([JSON.stringify(window.Shared.normalizeToolboxData(data), null, 2)], { type: 'application/json' });
    }

    const storageApi = {
        init,
        destroy,
        read,
        write,
        update,
        setFavorites,
        setSetting,
        getSetting,
        onChanged,
        getSnapshot: () => window.Shared.normalizeToolboxData(dataCache)
    };

    Toolbox.storage = storageApi;
    Toolbox.favorites = {
        addFavorite,
        removeFavorite,
        importFavorites,
        mergeFavorites,
        normalizeImportedFavorites,
        getExportFileName,
        createExportBlob
    };
})();
