// Bilibili Toolbox - popup script（本地版 - 无外部API调用）

const STORAGE_KEY = 'bilibiliToolboxData';
const USER_TYPE = 'user';
const READLIST_TYPE = 'readlist';
const BILIBILI_DOMAIN = 'bilibili.com';
const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';

const UID_URL_PATTERNS = [
    [/space\.bilibili\.com\/(\d+)/, () => true],
    [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
];

function normalizeObject(value) {
    return value && typeof value === 'object' ? value : {};
}

function createDefaultData() {
    return { favorites: [], settings: {} };
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
        ? (item?.title || '专栏')
        : (item?.uname || '用户');
}

function getFavoriteImage(item) {
    return isReadlistFavorite(item)
        ? (item?.cover || FALLBACK_IMAGE)
        : (item?.face || FALLBACK_IMAGE);
}

function getFavoriteLink(item) {
    if (!item) return '#';
    return isReadlistFavorite(item)
        ? `https://www.bilibili.com/read/readlist/rl${item.id}`
        : `https://space.bilibili.com/${item.uid}/dynamic`;
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

let cachedData = createDefaultData();

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadData();
    chrome.storage.onChanged.addListener(handleStorageChange);
});

function applyData(data) {
    cachedData = normalizeToolboxData(data);
    renderFavorites();
}

function loadData() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        applyData(result[STORAGE_KEY]);
    });
}

function saveFavorites(callback) {
    chrome.storage.local.set({ [STORAGE_KEY]: cachedData }, callback);
}

function handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
    applyData(changes[STORAGE_KEY].newValue);
}

function renderFavoriteItem(item) {
    const favoriteKey = getFavoriteKey(item);
    const name = escapeHtml(getFavoriteName(item));
    const image = escapeHtml(getFavoriteImage(item));
    const link = escapeHtml(getFavoriteLink(item));
    const type = isReadlistFavorite(item) ? '专栏' : '空间';

    return `<div class="user-item">
        <div class="user-info">
            <img src="${image}" alt="${name}" class="user-avatar">
            <span class="user-name">${name}</span>
        </div>
        <div class="user-actions">
            <a href="${link}" target="_blank" class="user-link">${type}</a>
            <button type="button" class="delete-btn" data-key="${escapeHtml(favoriteKey)}">删除</button>
        </div>
    </div>`;
}

function renderFavorites() {
    const userList = document.getElementById('userList');
    if (!userList) return;

    const favorites = cachedData.favorites || [];
    userList.innerHTML = favorites.length === 0
        ? '<div class="empty-tip">暂无收藏</div>'
        : favorites.map(renderFavoriteItem).join('');
}

function deleteFavorite(favoriteKey) {
    const filtered = cachedData.favorites.filter(item => getFavoriteKey(item) !== favoriteKey);
    if (filtered.length === cachedData.favorites.length) return;

    cachedData.favorites = filtered;
    saveFavorites(renderFavorites);
}

function setupEventListeners() {
    document.getElementById('userList')?.addEventListener('click', (event) => {
        const key = event.target.closest('.delete-btn')?.dataset.key;
        if (key) deleteFavorite(key);
    });

    document.getElementById('addCurrentBtn')?.addEventListener('addCurrentFavorite');
}

// 纯本地版本的添加收藏（不调用任何API）
function addCurrentFavorite() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        const url = tab?.url;
        if (!url?.includes(BILIBILI_DOMAIN)) {
            alert('请在 B 站页面使用此功能');
            return;
        }

        const uid = extractUidFromUrl(url);
        if (!uid) {
            alert('无法获取当前页面用户信息');
            return;
        }

        const favoriteKey = `${USER_TYPE}:${uid}`;
        if (cachedData.favorites.some(item => getFavoriteKey(item) === favoriteKey)) {
            alert('该用户已在收藏列表中');
            return;
        }

        // 从当前页面提取用户名和头像
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // 尝试从页面DOM提取用户名
                const nameEl = document.querySelector('.user-name, .user-name-shadow, .name, [data-uname]');
                const faceEl = document.querySelector('.user-face img, .avatar img, [class*="face"] img, [data-face]');
                return {
                    uname: nameEl?.textContent?.trim() || nameEl?.getAttribute('data-uname') || '',
                    face: faceEl?.src || faceEl?.getAttribute('data-face') || ''
                };
            }
        }).then((results) => {
            const pageData = results?.[0]?.result || {};
            const newFavorite = {
                type: USER_TYPE,
                uid: uid,
                uname: pageData.uname || '用户 ' + uid,
                face: pageData.face || ''
            };

            cachedData.favorites = [...cachedData.favorites, newFavorite];
            saveFavorites(() => {
                alert(`已添加 ${newFavorite.uname} 到收藏列表`);
                renderFavorites();
            });
        }).catch(() => {
            // 注入失败时只保存UID
            const newFavorite = {
                type: USER_TYPE,
                uid: uid,
                uname: '用户 ' + uid,
                face: ''
            };
            cachedData.favorites = [...cachedData.favorites, newFavorite];
            saveFavorites(() => {
                alert(`已添加用户 ${uid} 到收藏列表`);
                renderFavorites();
            });
        });
    });
}

// 绑定按钮事件
document.getElementById('addCurrentBtn')?.addEventListener('click', addCurrentFavorite);
