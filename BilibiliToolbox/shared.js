// Bilibili Toolbox - shared utilities
(function() {
    'use strict';

    const SHARED_STORAGE_KEY = 'bilibiliToolboxSharedData.v1';
    const STORAGE_VERSION = 1;
    const SHARED_STORAGE_UPDATE_EVENT = 'bilibili-toolbox:shared-storage-updated';
    const USER_TYPE = 'user';
    const READLIST_TYPE = 'readlist';
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';
    const BILIBILI_DOMAIN = 'bilibili.com';
    const BILIBILI_SPACE_URL = 'https://space.bilibili.com/';
    const BILIBILI_READLIST_URL = 'https://www.bilibili.com/read/readlist/rl';
    const UID_URL_PATTERNS = [
        [/space\.bilibili\.com\/(\d+)/, () => true],
        [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
    ];

    function normalizeObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function createDefaultData() {
        return {
            version: STORAGE_VERSION,
            updatedAt: 0,
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
            version: STORAGE_VERSION,
            updatedAt: typeof next.updatedAt === 'number' ? next.updatedAt : 0,
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeObject(next.settings)
        };
    }

    function stampToolboxData(data, updatedAt = Date.now()) {
        return normalizeToolboxData({
            ...normalizeToolboxData(data),
            version: STORAGE_VERSION,
            updatedAt
        });
    }

    function parseToolboxDataFromRaw(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try {
            return normalizeToolboxData(JSON.parse(raw));
        } catch (_) {
            return null;
        }
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

    function validateFavoritesData(data) {
        const errors = [];
        if (!data || typeof data !== 'object') {
            return { valid: false, items: [], errors: ['数据格式无效：不是有效的JSON对象'] };
        }
        const favorites = data.favorites;
        if (!Array.isArray(favorites)) {
            return { valid: false, items: [], errors: ['数据缺少favorites数组'] };
        }
        const validItems = [];
        for (let i = 0; i < favorites.length; i++) {
            const item = favorites[i];
            if (!item || typeof item !== 'object') {
                errors.push(`第${i + 1}条：不是有效对象`);
                continue;
            }
            const type = item.type;
            if (type !== USER_TYPE && type !== READLIST_TYPE) {
                errors.push(`第${i + 1}条：type字段无效 "${type}"`);
                continue;
            }
            if (type === USER_TYPE) {
                if (!item.uid) {
                    errors.push(`第${i + 1}条：缺少uid`);
                    continue;
                }
                validItems.push({
                    type: USER_TYPE,
                    uid: String(item.uid),
                    uname: String(item.uname || ''),
                    face: String(item.face || '')
                });
            } else {
                if (!item.id) {
                    errors.push(`第${i + 1}条：缺少id`);
                    continue;
                }
                validItems.push({
                    type: READLIST_TYPE,
                    id: String(item.id),
                    title: String(item.title || ''),
                    cover: String(item.cover || '')
                });
            }
        }
        return { valid: true, items: validItems, errors };
    }

    function mergeFavorites(existing, imported) {
        const keySet = new Set();
        for (const item of existing) {
            const key = getFavoriteKey(item);
            if (key) keySet.add(key);
        }
        let added = 0;
        let skipped = 0;
        const result = [...existing];
        for (const item of imported) {
            const key = getFavoriteKey(item);
            if (!key) { skipped++; continue; }
            if (keySet.has(key)) { skipped++; continue; }
            keySet.add(key);
            result.push(item);
            added++;
        }
        return { result, added, skipped };
    }

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    // Expose API for use by other scripts (extension content scripts, userscripts)
    window.Shared = {
        SHARED_STORAGE_KEY,
        STORAGE_VERSION,
        SHARED_STORAGE_UPDATE_EVENT,
        USER_TYPE,
        READLIST_TYPE,
        FALLBACK_IMAGE,
        BILIBILI_DOMAIN,
        BILIBILI_SPACE_URL,
        BILIBILI_READLIST_URL,
        normalizeObject,
        createDefaultData,
        normalizeFavoriteList,
        normalizeToolboxData,
        stampToolboxData,
        isBilibiliUrl,
        getFavoriteType,
        isReadlistFavorite,
        getFavoriteKey,
        getFavoriteName,
        getFavoriteImage,
        getFavoriteLink,
        validateFavoritesData,
        mergeFavorites,
        escapeHtml,
        extractUidFromUrl,
        $,
        $src
    };
})();
