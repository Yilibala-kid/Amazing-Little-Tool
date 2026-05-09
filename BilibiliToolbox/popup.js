// Bilibili Toolbox - popup script

let cachedData = createDefaultData();
let activeBilibiliTabId = null;
let canAddCurrent = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    chrome.storage.onChanged.addListener(handleStorageChange);
    await cleanupObsoleteExtensionStorage();
    await loadData();
});

function applyData(data, options = {}) {
    cachedData = normalizeToolboxData(data);
    activeBilibiliTabId = options.tabId ?? activeBilibiliTabId ?? null;
    canAddCurrent = Boolean(options.canAddCurrent);
    renderFavorites();
    renderStorageState();
}

async function cleanupObsoleteExtensionStorage() {
    await chrome.storage.local.remove(['bilibiliToolboxData', 'bilibiliFavorites', 'bilibiliToolboxMirrorData']);
}

async function getSharedData() {
    const result = await chrome.storage.local.get([SHARED_STORAGE_KEY]);
    return result[SHARED_STORAGE_KEY]
        ? normalizeToolboxData(result[SHARED_STORAGE_KEY])
        : null;
}

async function setSharedData(data) {
    const nextData = stampToolboxData(data);
    await chrome.storage.local.set({ [SHARED_STORAGE_KEY]: nextData });
    return nextData;
}

async function getActiveBilibiliTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return isBilibiliUrl(tab?.url) ? tab : null;
}

async function loadData() {
    const [sharedData, activeTab] = await Promise.all([
        getSharedData(),
        getActiveBilibiliTab()
    ]);

    const data = sharedData || await setSharedData(createDefaultData());
    applyData(data, {
        tabId: activeTab?.id ?? null,
        canAddCurrent: Boolean(activeTab?.id)
    });
}

async function persistData(nextData) {
    cachedData = await setSharedData(nextData);
    renderFavorites();
    renderStorageState();
    return true;
}

function renderStorageState() {
    const note = document.getElementById('storageNote');
    const addBtn = document.getElementById('addCurrentBtn');
    if (!note || !addBtn) return;

    note.classList.toggle('readonly', !canAddCurrent);
    note.textContent = canAddCurrent
        ? '当前显示的是跨页面共享收藏，用户页和专栏页会看到同一份列表。'
        : '当前显示的是跨页面共享收藏。若要添加当前页面内容，请先切到一个活动中的 B 站页面。';
    addBtn.disabled = !canAddCurrent;
    addBtn.title = canAddCurrent ? '' : '打开任意 B 站页面后可添加当前内容';
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
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="user-link">${type}</a>
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

async function deleteFavorite(favoriteKey) {
    const filtered = cachedData.favorites.filter(item => getFavoriteKey(item) !== favoriteKey);
    if (filtered.length === cachedData.favorites.length) return;

    await persistData({
        ...cachedData,
        favorites: filtered
    });
}

function setupEventListeners() {
    document.getElementById('userList')?.addEventListener('click', async (event) => {
        const button = event.target.closest('.delete-btn');
        if (!button || button.disabled) return;
        const { key } = button.dataset;
        if (key) await deleteFavorite(key);
    });

    document.getElementById('addCurrentBtn')?.addEventListener('click', addCurrentFavorite);
}

async function getPageReadlistData(tabId, readlistId) {
    let pageData = {};

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const title = document.querySelector('.read-list-title, .title, h1')?.textContent?.trim() || '专栏';
                const cover = document.querySelector('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img')?.src || '';
                return { title, cover };
            }
        });
        pageData = results?.[0]?.result || {};
    } catch (_) {}

    return {
        type: READLIST_TYPE,
        id: readlistId,
        title: pageData.title || '专栏',
        cover: pageData.cover || ''
    };
}

async function getPageFavoriteData(tabId, uid) {
    let pageData = {};

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const extractUserNameFromMeta = () => {
                    const title = document.title || '';
                    const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
                    const description = document.querySelector('meta[name="description"]')?.content || '';
                    const profileSuffixPattern = '(?:\\u7684)?\\u4e2a\\u4eba(?:\\u52a8\\u6001|\\u7a7a\\u95f4|\\u4e3b\\u9875)';

                    return (
                        title.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
                        || keywords.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
                        || description.match(/\u54d4\u54e9\u54d4\u54e9(.+?)\u7684\u4e2a\u4eba(?:\u52a8\u6001|\u7a7a\u95f4)/)?.[1]
                        || description.match(/\u5173\u6ce8(.+?)\u8d26\u53f7/)?.[1]
                        || ''
                    ).trim();
                };

                const nameEl = document.querySelector('.user-name, .user-name-shadow, .name, [data-uname]');
                const faceEl = document.querySelector('.user-face img, .avatar img, [class*="face"] img, [data-face]');
                return {
                    uname: nameEl?.textContent?.trim() || nameEl?.getAttribute('data-uname') || extractUserNameFromMeta() || '',
                    face: faceEl?.src || faceEl?.getAttribute('data-face') || ''
                };
            }
        });

        pageData = results?.[0]?.result || {};
    } catch (_) {}

    return {
        type: USER_TYPE,
        uid,
        uname: pageData.uname || `用户 ${uid}`,
        face: pageData.face || ''
    };
}

async function addCurrentFavorite() {
    const activeTab = await getActiveBilibiliTab();
    if (!activeTab?.url) {
        alert('请先打开一个 B 站页面');
        return;
    }

    activeBilibiliTabId = activeTab.id;
    canAddCurrent = true;

    const url = activeTab.url;
    const readlistMatch = url.match(/readlist\/rl(\d+)/);
    if (readlistMatch) {
        const pageData = await getPageReadlistData(activeTab.id, readlistMatch[1]);
        const favoriteKey = getFavoriteKey(pageData);
        if (cachedData.favorites.some(item => getFavoriteKey(item) === favoriteKey)) {
            alert('已在收藏列表');
            return;
        }

        await persistData({
            ...cachedData,
            favorites: [...cachedData.favorites, pageData]
        });
        alert(`已添加 ${pageData.title} 到收藏列表`);
        return;
    }

    const uid = extractUidFromUrl(url);
    if (!uid) {
        alert('无法获取当前页面用户信息');
        return;
    }

    const favoriteKey = `${USER_TYPE}:${uid}`;
    if (cachedData.favorites.some(item => getFavoriteKey(item) === favoriteKey)) {
        alert('已在收藏列表');
        return;
    }

    const newFavorite = await getPageFavoriteData(activeTab.id, uid);
    await persistData({
        ...cachedData,
        favorites: [...cachedData.favorites, newFavorite]
    });
    alert(`已添加 ${newFavorite.uname} 到收藏列表`);
}

async function handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || !changes[SHARED_STORAGE_KEY]) return;

    const activeTab = await getActiveBilibiliTab();
    applyData(changes[SHARED_STORAGE_KEY].newValue || createDefaultData(), {
        tabId: activeTab?.id ?? null,
        canAddCurrent: Boolean(activeTab?.id)
    });
}
