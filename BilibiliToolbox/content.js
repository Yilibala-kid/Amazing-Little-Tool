// Bilibili Toolbox - Content Script
// 整合了极光漫画+ 收藏夹功能（本地版 - 无外部API调用）
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js 未加载');
    if (!window.BiliAnimations) console.warn('BilibiliToolbox: animations.js 未加载，动画功能将被禁用');

    // 扩展独有设置键
    const TOOLBOX_SETTINGS = {
        hideForwardDynamics: 'hideForwardDynamics'
    };
    const SPACE_DYNAMIC_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/\d+\/dynamic(?:[/?#]|$)/i;
    const DYNAMIC_CARD_SELECTOR = '.bili-dyn-list__item, .bili-dyn-item, .bili-opus-view';
    const FORWARD_DYNAMIC_SELECTOR = [
        '.bili-dyn-content__forw__desc',
        '.bili-dyn-content__orig.reference',
        '.bili-dyn-content__orig__author',
        '.dyn-orig-author',
        '[class*="opus-module-top__forward"]',
        '[class*="module-top-forward"]'
    ].join(', ');
    const FORWARD_ACTION_SELECTORS = [
        '.module-author__action',
        '.bili-dyn-item__action',
        '.bili-dyn-title__action',
        '.bili-dyn-author__action',
        '.opus-module-author__action'
    ];
    const HIDDEN_FORWARD_CLASS = 'bilibili-toolbox-hide-forward-dynamic';
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';
    const FORWARD_TYPE_PATTERN = /(^|[\s:_-])(forward|repost)([\s:_-]|$)/i;
    const FORWARD_TEXT_MARKERS = ['转发了动态', '转发了视频', '转发了专栏', '转发了'];

    // 存储收藏列表（支持用户和专栏）
    let toolboxData = window.Shared.createDefaultData();

    function extractUserNameFromMeta() {
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
    }

    function sortFavorites(favorites) {
        return [...favorites].sort((a, b) => window.Shared.isReadlistFavorite(a) - window.Shared.isReadlistFavorite(b));
    }

    function mergeToolboxDataSources(sources) {
        const normalizedSources = (Array.isArray(sources) ? sources : [])
            .filter(Boolean)
            .map(source => window.Shared.normalizeToolboxData(source));
        const mergedFavorites = [];
        const favoriteKeys = new Set();

        normalizedSources.forEach(source => {
            source.favorites.forEach(item => {
                const key = window.Shared.getFavoriteKey(item);
                if (!key || favoriteKeys.has(key)) return;
                favoriteKeys.add(key);
                mergedFavorites.push(item);
            });
        });

        const mergedSettings = {};
        for (let index = normalizedSources.length - 1; index >= 0; index -= 1) {
            Object.assign(mergedSettings, normalizedSources[index].settings);
        }

        const updatedAt = normalizedSources.reduce(
            (maxUpdatedAt, source) => Math.max(maxUpdatedAt, source.updatedAt || 0),
            0
        );

        return window.Shared.stampToolboxData({
            favorites: mergedFavorites,
            settings: mergedSettings
        }, updatedAt || Date.now());
    }

    function isSameToolboxData(a, b) {
        const left = window.Shared.normalizeToolboxData(a);
        const right = window.Shared.normalizeToolboxData(b);
        return JSON.stringify({
            favorites: left.favorites,
            settings: left.settings
        }) === JSON.stringify({
            favorites: right.favorites,
            settings: right.settings
        });
    }

    function parseSharedToolboxData(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try {
            return window.Shared.normalizeToolboxData(JSON.parse(raw));
        } catch (_) {
            return null;
        }
    }

    function readSharedToolboxData() {
        try {
            return parseSharedToolboxData(window.localStorage.getItem(window.Shared.SHARED_STORAGE_KEY));
        } catch (_) {
            return null;
        }
    }

    function mirrorSharedToolboxData(data, shouldDispatchEvent = true, source = 'extension') {
        const nextData = window.Shared.normalizeToolboxData(data);
        try {
            window.localStorage.setItem(window.Shared.SHARED_STORAGE_KEY, JSON.stringify(nextData));
        } catch (_) {}

        if (shouldDispatchEvent) {
            window.dispatchEvent(new CustomEvent(window.Shared.SHARED_STORAGE_UPDATE_EVENT, {
                detail: { updatedAt: nextData.updatedAt, source }
            }));
        }

        return nextData;
    }

    async function readExtensionSharedToolboxData() {
        const result = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
        const data = result[window.Shared.SHARED_STORAGE_KEY];
        return data ? window.Shared.normalizeToolboxData(data) : null;
    }

    async function writeSharedToolboxData(data, shouldDispatchEvent = true) {
        const nextData = window.Shared.stampToolboxData(data, Date.now());
        await chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: nextData });
        toolboxData = nextData;
        mirrorSharedToolboxData(nextData, shouldDispatchEvent);
        return nextData;
    }

    async function cleanupObsoleteStorage() {
        const keys = ['bilibiliToolboxData', 'bilibiliFavorites', 'bilibiliToolboxMirrorData'];
        keys.forEach(k => { try { window.localStorage.removeItem(`tm.bilibili-toolbox.${k}`); } catch (_) {} });
        await chrome.storage.local.remove(keys);
    }

    // ============ 数据迁移函数 - 从旧版本迁移数据 ============
    async function initializeToolboxData() {
        await loadToolboxData();
        await cleanupObsoleteStorage();
    }

    function saveData(data) { return writeSharedToolboxData(data, true); }

    async function loadToolboxData() {
        const extensionData = await readExtensionSharedToolboxData();
        const pageData = readSharedToolboxData();
        const sources = [extensionData, pageData].filter(Boolean);
        const mergedData = mergeToolboxDataSources(
            sources.length > 0 ? sources : [window.Shared.createDefaultData()]
        );

        if (!extensionData || !isSameToolboxData(mergedData, extensionData)) {
            await writeSharedToolboxData(mergedData, false);
            mirrorSharedToolboxData(toolboxData, false);
            return;
        }

        toolboxData = extensionData;
        if (!pageData || !isSameToolboxData(pageData, extensionData) || pageData.updatedAt !== extensionData.updatedAt) {
            mirrorSharedToolboxData(extensionData, false);
        }
    }

    function setFavorites(favorites) {
        saveData({ ...toolboxData, favorites });
    }

    function getSettingValue(key, fallback = false) {
        return Object.prototype.hasOwnProperty.call(toolboxData.settings, key)
            ? toolboxData.settings[key]
            : fallback;
    }

    async function setSettingValue(key, value) {
        await saveData({
            ...toolboxData,
            settings: { ...toolboxData.settings, [key]: value }
        });
    }

    // ============ 收藏夹功能 ============
    function handleSharedToolboxUpdate() {
        loadToolboxData().then(() => {
            renderFavoriteList();
            syncFilterUI();
        });
    }

    function handleSharedStorageEvent(event) {
        if (event?.type === 'storage' && event.key !== window.Shared.SHARED_STORAGE_KEY) return;
        if (event?.type === window.Shared.SHARED_STORAGE_UPDATE_EVENT && String(event.detail?.source || '').startsWith('extension')) return;
        handleSharedToolboxUpdate();
    }

    function handleExtensionStorageChange(changes, areaName) {
        if (areaName !== 'local' || !changes[window.Shared.SHARED_STORAGE_KEY]?.newValue) return;
        toolboxData = window.Shared.normalizeToolboxData(changes[window.Shared.SHARED_STORAGE_KEY].newValue);
        mirrorSharedToolboxData(toolboxData, true, 'extension-sync');
        renderFavoriteList();
        syncFilterUI();
    }

    function setupSharedStorageListeners() {
        window.addEventListener('storage', handleSharedStorageEvent);
        window.addEventListener(window.Shared.SHARED_STORAGE_UPDATE_EVENT, handleSharedStorageEvent);
        chrome.storage.onChanged.addListener(handleExtensionStorageChange);
    }

    let isHoveringFavBtn = false;
    let dynamicFilterObserver = null;
    let debounceFilterTimer = 0;
    let filterPollTimer = 0;
    let messageTimer = 0;

    // 创建悬浮按钮
    function syncFloatBtnHideState() {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn) return;
        const hideForward = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));
        btn.classList.toggle('hide-forward-active', hideForward);
    }

    function createFloatingButton() {
        if (document.getElementById('bilibili-fav-float-btn')) return;

        const url = window.location.href;
        const isVideoPage = url.includes('bilibili.com/video/') || url.includes('bilibili.com/bangumi/');

        const btn = document.createElement('div');
        btn.id = 'bilibili-fav-float-btn';
        btn.innerHTML = '&#11088;';
        btn.title = '悬停查看收藏，右键打开动态过滤';
        if (isVideoPage) btn.style.opacity = '0';
        document.body.appendChild(btn);

        let hoverZone, hideTimer;
        if (isVideoPage) {
            hoverZone = document.createElement('div');
            hoverZone.id = 'bilibili-fav-hover-zone';
            hoverZone.style.cssText = 'position:fixed;bottom:0;right:0;width:240px;height:240px;z-index:999998;cursor:default';
            document.body.appendChild(hoverZone);
            const show = () => { btn.style.opacity = '1'; if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
            const hide = () => { hideTimer = setTimeout(() => { btn.style.opacity = '0'; hidePanel('bilibili-fav-panel'); }, 300); };
            hoverZone.addEventListener('mouseenter', show);
            hoverZone.addEventListener('mouseleave', hide);
            btn.addEventListener('mouseenter', show);
            btn.addEventListener('mouseleave', hide);
        }

        btn.addEventListener('mouseenter', () => { isHoveringFavBtn = true; showFavoritesPanel(); });
        btn.addEventListener('mouseleave', () => { isHoveringFavBtn = false; setTimeout(() => { if (!isHoveringFavBtn) hidePanel('bilibili-fav-panel'); }, 200); });
        btn.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            isHoveringFavBtn = false;
            hidePanel('bilibili-fav-panel');
            toggleDynamicControlsPanel();
        });

        syncFloatBtnHideState();
    }

    // 创建收藏夹面板
    function createFavoritesPanel() {
        if (document.getElementById('bilibili-fav-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>我的收藏</span><button class="bilibili-fav-add-btn">+ 添加当前</button></div>
            <div class="bilibili-fav-content"><div class="bilibili-fav-list"></div></div>
            <div class="bilibili-fav-msg"></div>
        `;

        document.body.appendChild(panel);

        panel.addEventListener('mouseenter', () => { isHoveringFavBtn = true; });
        panel.addEventListener('mouseleave', () => { isHoveringFavBtn = false; hidePanel('bilibili-fav-panel'); });
        panel.addEventListener('click', (e) => {
            const del = e.target.closest('.bilibili-fav-delete');
            if (del) { e.preventDefault(); e.stopPropagation(); deleteFavorite(del.dataset.key); }
        });

        panel.querySelector('.bilibili-fav-add-btn').onclick = addCurrent;
    }

    function showPanel(panelId, hideOtherId, createFn, loadFn) {
        let panel = document.getElementById(panelId);
        if (!panel) { createFn(); panel = document.getElementById(panelId); }
        hidePanel(hideOtherId);
        panel?.classList.add('show');
        loadToolboxData().then(loadFn);
    }

    function showFavoritesPanel() {
        showPanel('bilibili-fav-panel', 'bilibili-fav-controls-panel', createFavoritesPanel, renderFavoriteList);
    }

    function hidePanel(id) { document.getElementById(id)?.classList.remove('show'); }

    function syncFilterUI() {
        renderDynamicControlsPanel();
        scheduleApplyDynamicFilters();
        scheduleDynamicFilterRetries();
    }

    function showMessage(text, isError = false, duration = 2200) {
        const msgEl = document.querySelector('.bilibili-fav-msg');
        if (!msgEl) return;
        if (messageTimer) clearTimeout(messageTimer);
        Object.assign(msgEl.style, { color: isError ? '#ff4757' : '#4cd964', display: 'block' });
        msgEl.textContent = text;
        messageTimer = setTimeout(() => { msgEl.style.display = 'none'; messageTimer = 0; }, duration);
    }

    function createDynamicControlsPanel() {
        if (document.getElementById('bilibili-fav-controls-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-controls-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>动态控制</span></div>
            <div class="bilibili-toolbox-control-content">
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">隐藏转发动态</span>
                        <span class="bilibili-toolbox-control-desc">隐藏转发</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-forward-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <div class="bilibili-toolbox-control-status"></div>
            </div>
            <div class="bilibili-toolbox-control-actions">
                <button class="bilibili-toolbox-export-btn">导出收藏</button>
                <button class="bilibili-toolbox-import-btn">导入收藏</button>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.bilibili-toolbox-forward-toggle').addEventListener('change', async (event) => {
            const enabled = Boolean(event.target.checked);
            await setSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, enabled);
            syncFloatBtnHideState();
            syncFilterUI();
        });

        panel.querySelector('.bilibili-toolbox-export-btn').addEventListener('click', exportFavorites);
        panel.querySelector('.bilibili-toolbox-import-btn').addEventListener('click', importFavorites);

        renderDynamicControlsPanel();
    }

    function isDynamicControlsPanelVisible() {
        return document.getElementById('bilibili-fav-controls-panel')?.classList.contains('show');
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return SPACE_DYNAMIC_URL_PATTERN.test(url);
    }

    function renderDynamicControlsPanel() {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        if (!panel) return;

        const toggle = panel.querySelector('.bilibili-toolbox-forward-toggle');
        const status = panel.querySelector('.bilibili-toolbox-control-status');
        const enabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));

        if (toggle) toggle.checked = enabled;
        if (!status) return;

        if (!isSpaceDynamicPage()) {
            status.textContent = '在用户动态页生效';
            return;
        }

        status.textContent = enabled
            ? '已隐藏转发动态'
            : '已显示全部动态';
        syncFloatBtnHideState();
    }

    async function exportFavorites() {
        const result = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
        const raw = result[window.Shared.SHARED_STORAGE_KEY];
        if (!raw || !raw.favorites || !raw.favorites.length) {
            showMessage('暂无可导出的收藏', true);
            return;
        }
        const json = JSON.stringify(raw, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        a.href = url;
        a.download = `bilibili-favorites-${ts}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage(`已导出 ${raw.favorites.length} 条收藏`);
    }

    function parseImportFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                let data;
                try { data = JSON.parse(reader.result); } catch (_) { return resolve('JSON解析失败，请检查文件格式'); }
                const v = window.Shared.validateFavoritesData(data);
                if (!v.valid || !v.items.length) return resolve(v.errors[0] || '文件中没有有效的收藏数据');
                resolve({ items: v.items, errors: v.errors });
            };
            reader.onerror = () => resolve('文件读取失败');
            reader.readAsText(file);
        });
    }

    function importFavorites() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', async () => {
            const file = input.files[0];
            input.remove();
            if (!file) return;

            const result = await parseImportFile(file);
            if (typeof result === 'string') { showMessage(result, true); return; }

            const res = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
            const existing = window.Shared.normalizeToolboxData(res[window.Shared.SHARED_STORAGE_KEY]);
            const merged = window.Shared.mergeFavorites(existing.favorites, result.items);
            const nextData = window.Shared.stampToolboxData({ ...existing, favorites: merged.result }, Date.now());
            await chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: nextData });
            mirrorSharedToolboxData(nextData);
            renderFavoriteList();
            let msg = `导入 ${merged.added} 条，跳过 ${merged.skipped} 条重复`;
            if (result.errors.length) msg += `，${result.errors.length} 条格式错误`;
            showMessage(msg);
        });

        window.addEventListener('focus', function cleanup() {
            window.removeEventListener('focus', cleanup);
            setTimeout(() => { if (input.parentNode && !input.files.length) input.remove(); }, 300);
        });

        input.click();
    }

    function showDynamicControlsPanel() {
        showPanel('bilibili-fav-controls-panel', 'bilibili-fav-panel', createDynamicControlsPanel, renderDynamicControlsPanel);
    }

    function toggleDynamicControlsPanel() {
        if (isDynamicControlsPanelVisible()) {
            hidePanel('bilibili-fav-controls-panel');
            return;
        }

        showDynamicControlsPanel();
    }

    function getDynamicCardElements() {
        const candidates = Array.from(document.querySelectorAll(DYNAMIC_CARD_SELECTOR))
            .filter(element => element instanceof HTMLElement);

        const set = new Set(candidates);
        return candidates.filter(card => {
            let parent = card.parentElement;
            while (parent) { if (set.has(parent)) return false; parent = parent.parentElement; }
            return true;
        });
    }

    function hasForwardActionText(card) {
        return FORWARD_ACTION_SELECTORS.some((selector) => {
            const text = card.querySelector(selector)?.textContent?.replace(/\s+/g, '') || '';
            return FORWARD_TEXT_MARKERS.some(marker => text.includes(marker));
        });
    }

    function getForwardDynamicSignals(card) {
        if (!(card instanceof HTMLElement)) {
            return {
                hasForwardType: false,
                hasForwardAction: false,
                hasForwardModule: false
            };
        }

        const attrText = [
            card.dataset.type,
            card.dataset.dynType,
            card.getAttribute('data-type'),
            card.getAttribute('data-dyn-type')
        ].filter(Boolean).join(' ');

        return {
            hasForwardType: FORWARD_TYPE_PATTERN.test(attrText),
            hasForwardAction: hasForwardActionText(card),
            hasForwardModule: Boolean(card.querySelector(FORWARD_DYNAMIC_SELECTOR))
        };
    }

    function applyDynamicFilters() {
        renderDynamicControlsPanel();

        const shouldHideForwardDynamics = isSpaceDynamicPage()
            && Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));

        if (!shouldHideForwardDynamics) {
            document.querySelectorAll(`.${HIDDEN_FORWARD_CLASS}`).forEach((card) => {
                card.classList.remove(HIDDEN_FORWARD_CLASS);
            });
            return;
        }

        const evaluations = getDynamicCardElements().map((card) => ({
            card,
            ...getForwardDynamicSignals(card)
        }));

        const shouldIgnoreModuleOnlyMatches = evaluations.length > 0
            && evaluations.every(({ hasForwardType, hasForwardAction, hasForwardModule }) => hasForwardModule && !hasForwardType && !hasForwardAction);

        evaluations.forEach(({ card, hasForwardType, hasForwardAction, hasForwardModule }) => {
            const shouldHide = hasForwardType || hasForwardAction || (!shouldIgnoreModuleOnlyMatches && hasForwardModule);
            card.classList.toggle(HIDDEN_FORWARD_CLASS, shouldHide);
        });
    }

    function scheduleApplyDynamicFilters() {
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = window.setTimeout(() => {
            debounceFilterTimer = 0;
            applyDynamicFilters();
        }, 80);
    }

    function scheduleDynamicFilterRetries() {
        if (filterPollTimer) {
            clearTimeout(filterPollTimer);
            filterPollTimer = 0;
        }

        if (!isSpaceDynamicPage() || !getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false)) {
            return;
        }

        let retriesLeft = 12;
        const retry = () => {
            scheduleApplyDynamicFilters();
            retriesLeft -= 1;
            if (retriesLeft <= 0) {
                filterPollTimer = 0;
                return;
            }

            filterPollTimer = window.setTimeout(retry, 350);
        };

        retry();
    }

    function notifyUrlChange() {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function installUrlChangeListener() {
        if (window.__bilibiliToolboxUrlChangePatched) return;
        window.__bilibiliToolboxUrlChangePatched = true;

        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') return;

            history[methodName] = function(...args) {
                const result = original.apply(this, args);
                notifyUrlChange();
                return result;
            };
        });

        window.addEventListener('popstate', notifyUrlChange);
        window.addEventListener('hashchange', notifyUrlChange);
    }

    function initDynamicFilterObserver() {
        if (dynamicFilterObserver || !document.body) return;

        dynamicFilterObserver = new MutationObserver((mutations) => {
            const hasChildMutation = mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length);
            if (!hasChildMutation) return;
            if (!getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false) && !isSpaceDynamicPage() && !isDynamicControlsPanelVisible()) return;
            scheduleApplyDynamicFilters();
        });

        dynamicFilterObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function handleDocumentPointerDown(event) {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        const button = document.getElementById('bilibili-fav-float-btn');
        if (!panel?.classList.contains('show')) return;
        if (panel.contains(event.target) || button?.contains(event.target)) return;
        hidePanel('bilibili-fav-controls-panel');
    }

    function handleDocumentKeyDown(event) {
        if (event.key === 'Escape') hidePanel('bilibili-fav-controls-panel');
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = window.Shared.isReadlistFavorite(item);
        return {
            isReadlist,
            key: window.Shared.escapeHtml(window.Shared.getFavoriteKey(item)),
            link: window.Shared.escapeHtml(window.Shared.getFavoriteLink(item)),
            img: window.Shared.escapeHtml(window.Shared.getFavoriteImage(item)) || window.Shared.FALLBACK_IMAGE,
            imgClass: isReadlist ? 'bilibili-fav-avatar cover' : 'bilibili-fav-avatar',
            name: window.Shared.escapeHtml(window.Shared.getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;
        const favorites = toolboxData.favorites || [];
        if (favorites.length === 0) listEl.innerHTML = '<div class="bilibili-fav-empty">暂无收藏<br>点击下方按钮添加</div>';

        listEl.innerHTML = sortFavorites(favorites).map(item => {
            const { isReadlist, key, link, img, imgClass, name } = getFavoriteDisplayData(item);
            return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="bilibili-fav-item-link">
                <div class="bilibili-fav-item"${isReadlist ? ' data-readlist="true"' : ''}>
                    <div class="bilibili-fav-item-info"><img src="${img}" alt="${name}" class="${imgClass}"><span class="bilibili-fav-name">${name}</span></div>
                    <button class="bilibili-fav-delete" data-key="${key}">&times;</button>
                </div>
            </a>`;
        }).join('');
    }

    // 添加当前页面内容（用户或专栏）- 纯本地版本
    function addCurrent() {
        const pageInfo = getCurrentPageInfo();
        if (!pageInfo) return showMessage('无法获取当前页面信息', true);

        const favorites = toolboxData.favorites;
        const favoriteKey = window.Shared.getFavoriteKey(pageInfo);
        if (favorites.some(item => window.Shared.getFavoriteKey(item) === favoriteKey)) {
            return showMessage('已在收藏列表', true);
        }

        // 从页面DOM提取信息（不上传，不调用API）
        const item = extractPageInfoForFavorite(pageInfo);
        setFavorites([...favorites, item]);
        showMessage('添加成功');
    }

    // 从页面提取收藏所需信息（纯本地，不请求API）
    function extractPageInfoForFavorite(pageInfo) {
        if (window.Shared.isReadlistFavorite(pageInfo)) {
            // 专栏：从页面提取标题和封面
            return {
                type: window.Shared.READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '专栏',
                cover: pageInfo.cover || window.Shared.FALLBACK_IMAGE
            };
        } else {
            // 用户：提取用户名和头像
            const uname = document.querySelector('.user-name, .user-name-shadow, .name')?.textContent?.trim()
                || document.querySelector('[data-mid]')?.getAttribute('data-uname')
                || extractUserNameFromMeta()
                || '用户';
            const face = document.querySelector('.user-face img, .avatar img, [class*="face"] img')?.src
                || document.querySelector('[data-mid]')?.getAttribute('data-face')
                || '';

            return {
                type: window.Shared.USER_TYPE,
                uid: pageInfo.uid,
                uname: uname,
                face: face
            };
        }
    }

    // 获取当前页面信息
    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = window.Shared.$('.read-list-title, .title, h1', '专栏');
            const cover = window.Shared.$src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: window.Shared.READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const uid = window.Shared.extractUidFromUrl(url);
        if (uid) return { type: window.Shared.USER_TYPE, uid };

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector('.user-name, .user-name-shadow, .name')?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: window.Shared.USER_TYPE, uid: pageUid } : null;
    }

    function deleteFavorite(favoriteKey) {
        const favorites = toolboxData.favorites;
        const filtered = favorites.filter(item => window.Shared.getFavoriteKey(item) !== favoriteKey);
        if (filtered.length !== favorites.length) setFavorites(filtered);
    }

    function initFavorites() {
        setupSharedStorageListeners();
        createFloatingButton();
        createDynamicControlsPanel();
        installUrlChangeListener();
        initDynamicFilterObserver();
        document.addEventListener('mousedown', handleDocumentPointerDown, true);
        document.addEventListener('keydown', handleDocumentKeyDown);
        window.addEventListener(URL_CHANGE_EVENT, syncFilterUI);

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'GET_PAGE_FAVORITE_DATA') {
                const info = getCurrentPageInfo();
                sendResponse(info ? extractPageInfoForFavorite(info) : null);
            }
        });

        scheduleApplyDynamicFilters();
        scheduleDynamicFilterRetries();
    }

    // 初始化
    async function init() {
        await initializeToolboxData();
        initFavorites();
        if (window.shouldInitComicReader()) {
            new window.BiliComicReader().init();
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
