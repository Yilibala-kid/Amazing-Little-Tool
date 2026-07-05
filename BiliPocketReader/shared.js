// Bilibili Toolbox - shared utilities
(function() {
    'use strict';

    const SHARED_STORAGE_KEY = 'bilibiliToolboxSharedData.v1';
    const USER_TYPE = 'user';
    const OPUS_TYPE = 'opus';
    const READLIST_TYPE = 'readlist';
    const FAVORITE_COLUMN_OPTIONS = Object.freeze([2, 3, 4, 5]);
    const DEFAULT_FAVORITE_COLUMNS = 2;
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';
    const BILIBILI_SPACE_URL = 'https://space.bilibili.com/';
    const BILIBILI_READLIST_URL = 'https://www.bilibili.com/read/readlist/rl';
    const TOOLBOX_SETTINGS = Object.freeze({
        hideForwardDynamics: 'hideForwardDynamics',
        readerPreferences: 'readerPreferences',
        favoriteColumns: 'favoriteColumns'
    });
    const DEFAULT_SETTINGS = Object.freeze({
        hideForwardDynamics: false,
        favoriteColumns: DEFAULT_FAVORITE_COLUMNS,
        readerPreferences: {}
    });
    const UID_URL_PATTERNS = [
        [/space\.bilibili\.com\/(\d+)/, () => true],
        [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
    ];

    function normalizeObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function createDefaultData() {
        return {
            favorites: [],
            settings: createDefaultSettings()
        };
    }

    function createDefaultSettings() {
        return {
            hideForwardDynamics: DEFAULT_SETTINGS.hideForwardDynamics,
            favoriteColumns: DEFAULT_SETTINGS.favoriteColumns,
            readerPreferences: { ...DEFAULT_SETTINGS.readerPreferences }
        };
    }

    function normalizeFavoriteId(value) {
        return typeof value === 'string' && /^\d+$/.test(value) ? value : '';
    }

    function normalizeFavorite(item) {
        const identity = getFavoriteIdentity(item);
        if (!identity) return null;

        if (identity.type === READLIST_TYPE) {
            return {
                type: READLIST_TYPE,
                id: identity.id,
                title: typeof item.title === 'string' ? item.title : '',
                cover: typeof item.cover === 'string' ? item.cover : ''
            };
        }

        return {
            type: identity.type,
            uid: identity.id,
            uname: typeof item.uname === 'string' ? item.uname : '',
            face: typeof item.face === 'string' ? item.face : ''
        };
    }

    function normalizeFavoriteList(favorites) {
        return Array.isArray(favorites)
            ? favorites.map(normalizeFavorite).filter(Boolean)
            : [];
    }

    function normalizeToolboxData(data) {
        const next = normalizeObject(data);
        return {
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeSettings(next.settings)
        };
    }

    function normalizeFavoriteColumns(value) {
        const columns = Number(value);
        return FAVORITE_COLUMN_OPTIONS.includes(columns) ? columns : DEFAULT_FAVORITE_COLUMNS;
    }

    function normalizeSettings(settings) {
        const input = normalizeObject(settings);
        return {
            hideForwardDynamics: typeof input.hideForwardDynamics === 'boolean'
                ? input.hideForwardDynamics
                : DEFAULT_SETTINGS.hideForwardDynamics,
            favoriteColumns: normalizeFavoriteColumns(input.favoriteColumns),
            readerPreferences: normalizeObject(input.readerPreferences)
        };
    }

    function getSettingValue(data, key, fallback = false) {
        const settings = normalizeToolboxData(data).settings;
        return Object.prototype.hasOwnProperty.call(settings, key)
            ? settings[key]
            : fallback;
    }

    function isReadlistFavorite(item) {
        return item?.type === READLIST_TYPE;
    }

    function isOpusFavorite(item) {
        return item?.type === OPUS_TYPE;
    }

    function getFavoriteIdentity(item) {
        if (!item || typeof item !== 'object') return null;
        if (item.type !== USER_TYPE && item.type !== OPUS_TYPE && item.type !== READLIST_TYPE) return null;
        const type = item.type;
        const id = normalizeFavoriteId(type === READLIST_TYPE ? item.id : item.uid);
        return id ? { type, id } : null;
    }

    function getFavoriteKey(item) {
        const identity = getFavoriteIdentity(item);
        return identity ? `${identity.type}:${identity.id}` : '';
    }

    function getFavoriteName(item) {
        return isReadlistFavorite(item)
            ? (item?.title || '\u4e13\u680f')
            : (item?.uname || '\u7528\u6237');
    }

    function getFavoriteImage(item) {
        return isReadlistFavorite(item)
            ? (item?.cover || FALLBACK_IMAGE)
            : (item?.face || FALLBACK_IMAGE);
    }

    function getFavoriteLink(item) {
        const identity = getFavoriteIdentity(item);
        if (!identity) return '#';
        if (identity.type === READLIST_TYPE) return `${BILIBILI_READLIST_URL}${identity.id}`;
        if (identity.type === OPUS_TYPE) return `${BILIBILI_SPACE_URL}${identity.id}/upload/opus`;
        return `${BILIBILI_SPACE_URL}${identity.id}/dynamic`;
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function extractUidFromUrl(url) {
        if (typeof url !== 'string') return null;
        for (const [pattern, isValid] of UID_URL_PATTERNS) {
            const match = url.match(pattern);
            if (match && isValid(match[1])) return match[1];
        }
        return null;
    }

    function isTouchLikeDevice() {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
        const noHover = window.matchMedia?.('(hover: none)').matches;
        const nav = window.navigator || {};
        return Boolean(coarsePointer || noHover || nav.maxTouchPoints > 0);
    }

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    const Toolbox = {};

    function createEventBag() {
        const cleanupFns = [];
        return {
            on(target, type, handler, options) {
                target.addEventListener(type, handler, options);
                cleanupFns.push(() => target.removeEventListener(type, handler, options));
                return handler;
            },
            timer(timerId, clearFn = clearTimeout) {
                if (timerId) cleanupFns.push(() => clearFn(timerId));
                return timerId;
            },
            add(cleanup) {
                if (typeof cleanup === 'function') cleanupFns.push(cleanup);
                return cleanup;
            },
            cleanup() {
                while (cleanupFns.length) {
                    const cleanup = cleanupFns.pop();
                    try { cleanup(); } catch (_) {}
                }
            }
        };
    }

    window.BilibiliToolbox = Toolbox;
    Toolbox.settings = TOOLBOX_SETTINGS;
    Toolbox.createEventBag = createEventBag;

    // Expose API for extension scripts.
    window.Shared = {
        SHARED_STORAGE_KEY,
        USER_TYPE,
        OPUS_TYPE,
        READLIST_TYPE,
        FAVORITE_COLUMN_OPTIONS,
        DEFAULT_FAVORITE_COLUMNS,
        FALLBACK_IMAGE,
        TOOLBOX_SETTINGS,
        DEFAULT_SETTINGS,
        createDefaultData,
        createDefaultSettings,
        normalizeFavorite,
        normalizeFavoriteList,
        normalizeToolboxData,
        normalizeFavoriteColumns,
        normalizeSettings,
        getSettingValue,
        isReadlistFavorite,
        isOpusFavorite,
        getFavoriteKey,
        getFavoriteName,
        getFavoriteImage,
        getFavoriteLink,
        escapeHtml,
        extractUidFromUrl,
        isTouchLikeDevice,
        $,
        $src
    };
})();
