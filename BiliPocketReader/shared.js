// Bilibili Toolbox - shared utilities
(function() {
    'use strict';

    const SHARED_STORAGE_KEY = 'bilibiliToolboxSharedData.v1';
    const USER_TYPE = 'user';
    const READLIST_TYPE = 'readlist';
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';
    const BILIBILI_DOMAIN = 'bilibili.com';
    const BILIBILI_SPACE_URL = 'https://space.bilibili.com/';
    const BILIBILI_READLIST_URL = 'https://www.bilibili.com/read/readlist/rl';
    const TOOLBOX_SETTINGS = Object.freeze({
        hideForwardDynamics: 'hideForwardDynamics',
        readerPreferences: 'readerPreferences'
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
            settings: {}
        };
    }

    function normalizeFavoriteList(favorites) {
        return Array.isArray(favorites)
            ? favorites.filter(item => item && typeof item === 'object')
            : [];
    }

    function normalizeToolboxData(data) {
        const next = normalizeObject(data);
        return {
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeObject(next.settings)
        };
    }

    function isBilibiliUrl(url) {
        return typeof url === 'string' && url.includes(BILIBILI_DOMAIN);
    }

    function getFavoriteType(item) {
        return item?.type || USER_TYPE;
    }

    function isReadlistFavorite(item) {
        return getFavoriteType(item) === READLIST_TYPE;
    }

    function getFavoriteKey(item) {
        if (!item) return '';
        const type = isReadlistFavorite(item) ? READLIST_TYPE : USER_TYPE;
        const value = isReadlistFavorite(item) ? item.id : item.uid;
        return value ? `${type}:${value}` : '';
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
        if (!item) return '#';
        return isReadlistFavorite(item)
            ? `${BILIBILI_READLIST_URL}${item.id}`
            : `${BILIBILI_SPACE_URL}${item.uid}/dynamic`;
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

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    const Toolbox = window.BilibiliToolbox || {};

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
        READLIST_TYPE,
        FALLBACK_IMAGE,
        BILIBILI_DOMAIN,
        BILIBILI_SPACE_URL,
        BILIBILI_READLIST_URL,
        TOOLBOX_SETTINGS,
        normalizeObject,
        createDefaultData,
        normalizeFavoriteList,
        normalizeToolboxData,
        isBilibiliUrl,
        getFavoriteType,
        isReadlistFavorite,
        getFavoriteKey,
        getFavoriteName,
        getFavoriteImage,
        getFavoriteLink,
        escapeHtml,
        extractUidFromUrl,
        $,
        $src
    };
})();
