// Bilibili Toolbox - popup script

let cachedData = window.Shared.createDefaultData();
let activeBilibiliTabId = null;
let canAddCurrent = false;

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    chrome.storage.onChanged.addListener(handleStorageChange);
    await cleanupObsoleteExtensionStorage();
    await loadData();
});

function applyData(data, options = {}) {
    cachedData = window.Shared.normalizeToolboxData(data);
    activeBilibiliTabId = options.tabId ?? activeBilibiliTabId ?? null;
    canAddCurrent = Boolean(options.canAddCurrent);
    renderFavorites();
    renderStorageState();
}

async function cleanupObsoleteExtensionStorage() {
    await chrome.storage.local.remove(['bilibiliToolboxData', 'bilibiliFavorites', 'bilibiliToolboxMirrorData']);
}

async function getSharedData() {
    const result = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
    return result[window.Shared.SHARED_STORAGE_KEY]
        ? window.Shared.normalizeToolboxData(result[window.Shared.SHARED_STORAGE_KEY])
        : null;
}

async function setSharedData(data) {
    const nextData = window.Shared.stampToolboxData(data);
    await chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: nextData });
    return nextData;
}

async function getActiveBilibiliTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return window.Shared.isBilibiliUrl(tab?.url) ? tab : null;
}

async function loadData() {
    const [sharedData, activeTab] = await Promise.all([
        getSharedData(),
        getActiveBilibiliTab()
    ]);

    const data = sharedData || await setSharedData(window.Shared.createDefaultData());
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
    const favoriteKey = window.Shared.getFavoriteKey(item);
    const name = window.Shared.escapeHtml(window.Shared.getFavoriteName(item));
    const image = window.Shared.escapeHtml(window.Shared.getFavoriteImage(item));
    const link = window.Shared.escapeHtml(window.Shared.getFavoriteLink(item));
    const type = window.Shared.isReadlistFavorite(item) ? '专栏' : '空间';

    return `<div class="user-item">
        <div class="user-info">
            <img src="${image}" alt="${name}" class="user-avatar">
            <span class="user-name">${name}</span>
        </div>
        <div class="user-actions">
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="user-link">${type}</a>
            <button type="button" class="delete-btn" data-key="${window.Shared.escapeHtml(favoriteKey)}">删除</button>
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
    const filtered = cachedData.favorites.filter(item => window.Shared.getFavoriteKey(item) !== favoriteKey);
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

async function addCurrentFavorite() {
    const activeTab = await getActiveBilibiliTab();
    if (!activeTab?.url) {
        alert('请先打开一个 B 站页面');
        return;
    }

    activeBilibiliTabId = activeTab.id;
    canAddCurrent = true;

    let item;
    try {
        item = await chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PAGE_FAVORITE_DATA' });
    } catch (_) {
        item = null;
    }
    if (!item) {
        alert('无法获取当前页面信息');
        return;
    }

    const favoriteKey = window.Shared.getFavoriteKey(item);
    if (cachedData.favorites.some(f => window.Shared.getFavoriteKey(f) === favoriteKey)) {
        alert('已在收藏列表');
        return;
    }

    await persistData({
        ...cachedData,
        favorites: [...cachedData.favorites, item]
    });
    alert(`已添加 ${window.Shared.getFavoriteName(item)} 到收藏列表`);
}

async function handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || !changes[window.Shared.SHARED_STORAGE_KEY]) return;

    const activeTab = await getActiveBilibiliTab();
    applyData(changes[window.Shared.SHARED_STORAGE_KEY].newValue || window.Shared.createDefaultData(), {
        tabId: activeTab?.id ?? null,
        canAddCurrent: Boolean(activeTab?.id)
    });
}
