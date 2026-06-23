// Bilibili Toolbox - content page features
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';
    const SPACE_DYNAMIC_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/\d+\/dynamic(?:[/?#]|$)/i;
    const ARTICLE_URL_PATTERN = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/read\/(?:cv\d+|mobile|native)(?:[/?#]|$)/i;
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
    const FILTER_ACTIVE_CLASS = 'bilibili-toolbox-dynamic-filter-active';
    const FILTER_READY_CLASS = 'bilibili-toolbox-dynamic-filter-ready';
    const HIDDEN_FORWARD_CLASS = 'bilibili-toolbox-hide-forward-dynamic';
    const FORWARD_TYPE_PATTERN = /(^|[\s:_-])(forward|repost)([\s:_-]|$)/i;
    const FORWARD_TEXT_MARKERS = [
        '\u8f6c\u53d1\u4e86\u52a8\u6001',
        '\u8f6c\u53d1\u4e86\u89c6\u9891',
        '\u8f6c\u53d1\u4e86\u4e13\u680f',
        '\u8f6c\u53d1\u4e86'
    ];

    let dataProvider = () => Shared.createDefaultData();

    function setDataProvider(provider) {
        if (typeof provider === 'function') dataProvider = provider;
    }

    function getSettingValue(key, fallback = false) {
        const data = Shared.normalizeToolboxData(dataProvider());
        return Object.prototype.hasOwnProperty.call(data.settings, key)
            ? data.settings[key]
            : fallback;
    }

    function hidePanel(id) {
        document.getElementById(id)?.classList.remove('show');
    }

    function sortFavorites(favorites) {
        return [...favorites].sort((a, b) => Shared.isReadlistFavorite(a) - Shared.isReadlistFavorite(b));
    }

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

    function normalizeImageUrl(src) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('//')) return `https:${src}`;
        return src;
    }

    function extractUidFromAuthorLink(link) {
        const href = link?.getAttribute?.('href') || link?.href || '';
        return href.match(/space\.bilibili\.com\/(\d+)/)?.[1]
            || href.match(/\/space\/(\d+)/)?.[1]
            || null;
    }

    function getArticleAuthorLink() {
        const selectors = [
            '.article-author a[href*="space"]',
            '.article-info a[href*="space"]',
            '.author-info a[href*="space"]',
            '.up-info a[href*="space"]',
            '.opus-module-author a[href*="space"]',
            '[class*="author"] a[href*="space"]',
            '[class*="up"] a[href*="space"]',
            'a[href*="space.bilibili.com/"]',
            'a[href*="/space/"]'
        ];

        return selectors
            .flatMap(selector => Array.from(document.querySelectorAll(selector)))
            .find(link => extractUidFromAuthorLink(link));
    }

    function getArticleAuthorInfo(url = window.location.href) {
        if (!ARTICLE_URL_PATTERN.test(url)) return null;

        const link = getArticleAuthorLink();
        const uid = extractUidFromAuthorLink(link)
            || document.querySelector('[data-mid]')?.getAttribute('data-mid');
        if (!uid) return null;

        const scope = link?.closest?.('.article-author, .article-info, .author-info, .up-info, [class*="author"], [class*="up"]')
            || document;
        const uname = link?.textContent?.trim()
            || scope.querySelector('.user-name, .name, [class*="name"]')?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = normalizeImageUrl(
            scope.querySelector('img')?.getAttribute('data-src')
            || scope.querySelector('img')?.getAttribute('src')
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || ''
        );

        return { type: Shared.USER_TYPE, uid, uname, face };
    }

    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = Shared.$('.read-list-title, .title, h1', '\u4e13\u680f');
            const cover = Shared.$src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: Shared.READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const uid = Shared.extractUidFromUrl(url);
        if (uid) return { type: Shared.USER_TYPE, uid };

        const articleAuthor = getArticleAuthorInfo(url);
        if (articleAuthor) return articleAuthor;

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector('.user-name, .user-name-shadow, .name')?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: Shared.USER_TYPE, uid: pageUid } : null;
    }

    function extractPageInfoForFavorite(pageInfo) {
        if (!pageInfo) return null;

        if (Shared.isReadlistFavorite(pageInfo)) {
            return {
                type: Shared.READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '\u4e13\u680f',
                cover: pageInfo.cover || Shared.FALLBACK_IMAGE
            };
        }

        const uname = pageInfo.uname
            || document.querySelector('.user-name, .user-name-shadow, .name')?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = pageInfo.face
            || document.querySelector('.user-face img, .avatar img, [class*="face"] img')?.src
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || '';

        return {
            type: Shared.USER_TYPE,
            uid: pageInfo.uid,
            uname,
            face
        };
    }

    function notifyUrlChange() {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function initUrlBridge() {
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

    let onRenderControls = () => {};
    let onSyncFloatButton = () => {};
    let dynamicFilterObserver = null;
    let debounceFilterTimer = 0;
    let dynamicFilterBurstTimers = [];
    let keywordFilterEnabled = false;
    let keywordFilterText = '';

    function isSpaceDynamicPage(url = window.location.href) {
        return SPACE_DYNAMIC_URL_PATTERN.test(url);
    }

    function getDynamicCardElements() {
        const candidates = Array.from(document.querySelectorAll(DYNAMIC_CARD_SELECTOR));
        const set = new Set(candidates);
        return candidates.filter(card => {
            for (let parent = card.parentElement; parent; parent = parent.parentElement) {
                if (set.has(parent)) return false;
            }
            return true;
        });
    }

    function hasForwardActionText(card) {
        return FORWARD_ACTION_SELECTORS.some(selector => {
            const text = card.querySelector(selector)?.textContent?.replace(/\s+/g, '') || '';
            return FORWARD_TEXT_MARKERS.some(marker => text.includes(marker));
        });
    }

    function isForwardDynamic(card) {
        const attrText = [
            card.dataset.type,
            card.dataset.dynType,
            card.getAttribute('data-type'),
            card.getAttribute('data-dyn-type')
        ].filter(Boolean).join(' ');

        return FORWARD_TYPE_PATTERN.test(attrText)
            || hasForwardActionText(card)
            || Boolean(card.querySelector(FORWARD_DYNAMIC_SELECTOR));
    }

    function normalizeDynamicText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getDynamicCardText(card) {
        return normalizeDynamicText(card.innerText || card.textContent || '');
    }

    function getKeywordFilterState() {
        const displayText = String(keywordFilterText || '').replace(/\s+/g, ' ').trim();
        const normalizedText = normalizeDynamicText(keywordFilterText);
        return {
            enabled: keywordFilterEnabled,
            text: keywordFilterText,
            displayText,
            normalizedText,
            hasKeyword: Boolean(normalizedText),
            isActive: keywordFilterEnabled && Boolean(normalizedText)
        };
    }

    function setKeywordFilterState(state = {}) {
        if (Object.prototype.hasOwnProperty.call(state, 'enabled')) {
            keywordFilterEnabled = Boolean(state.enabled);
        }
        if (typeof state.text === 'string') {
            keywordFilterText = state.text;
        }
        onSyncFloatButton();
        scheduleDynamicFilterApply(0);
    }

    function setDynamicFilterActive(active) {
        document.documentElement?.classList.toggle(FILTER_ACTIVE_CLASS, Boolean(active));
    }

    function clearDynamicFilterCardClasses() {
        document.querySelectorAll(`.${HIDDEN_FORWARD_CLASS}, .${FILTER_READY_CLASS}`).forEach(card => {
            card.classList.remove(HIDDEN_FORWARD_CLASS, FILTER_READY_CLASS);
        });
    }

    function markDynamicCardReady(card) {
        card.classList.add(FILTER_READY_CLASS);
        card.querySelectorAll(DYNAMIC_CARD_SELECTOR).forEach(child => child.classList.add(FILTER_READY_CLASS));
    }

    function applyDynamicFilter() {
        onRenderControls();

        const dynamicPage = isSpaceDynamicPage();
        const shouldHideForward = dynamicPage
            && Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));
        const keywordState = getKeywordFilterState();
        const shouldFilterKeyword = dynamicPage && keywordState.isActive;

        if (!shouldHideForward && !shouldFilterKeyword) {
            setDynamicFilterActive(false);
            clearDynamicFilterCardClasses();
            return;
        }

        setDynamicFilterActive(true);
        getDynamicCardElements().forEach(card => {
            const hideForward = shouldHideForward && isForwardDynamic(card);
            const hideKeyword = shouldFilterKeyword && !getDynamicCardText(card).includes(keywordState.normalizedText);
            card.classList.toggle(HIDDEN_FORWARD_CLASS, hideForward || hideKeyword);
            markDynamicCardReady(card);
        });
    }

    function runDynamicFilterNow() {
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = 0;
        applyDynamicFilter();
    }

    function scheduleDynamicFilterApply(delay = 80) {
        if (delay <= 0) {
            runDynamicFilterNow();
            return;
        }

        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = window.setTimeout(() => {
            debounceFilterTimer = 0;
            applyDynamicFilter();
        }, delay);
    }

    function clearDynamicFilterBurstTimers() {
        dynamicFilterBurstTimers.forEach(timer => clearTimeout(timer));
        dynamicFilterBurstTimers = [];
    }

    function scheduleDynamicFilterBurst() {
        clearDynamicFilterBurstTimers();
        [0, 80, 250, 600, 1200, 2500].forEach(delay => {
            const timer = window.setTimeout(() => {
                dynamicFilterBurstTimers = dynamicFilterBurstTimers.filter(item => item !== timer);
                runDynamicFilterNow();
            }, delay);
            dynamicFilterBurstTimers.push(timer);
        });
    }

    function syncDynamicFilter() {
        onRenderControls();
        onSyncFloatButton();
        scheduleDynamicFilterBurst();
    }

    function initDynamicFilter(options = {}) {
        setDataProvider(options.getData);
        onRenderControls = options.renderControls || onRenderControls;
        onSyncFloatButton = options.syncFloatButton || onSyncFloatButton;

        if (!dynamicFilterObserver && document.body) {
            dynamicFilterObserver = new MutationObserver((mutations) => {
                if (mutations.some(mutation => mutation.addedNodes.length
                    || mutation.removedNodes.length
                    || mutation.type === 'attributes'
                    || mutation.type === 'characterData')) {
                    scheduleDynamicFilterApply();
                }
            });
            dynamicFilterObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'data-type', 'data-dyn-type'],
                characterData: true
            });
        }

        scheduleDynamicFilterBurst();
    }

    function destroyDynamicFilter() {
        if (dynamicFilterObserver) dynamicFilterObserver.disconnect();
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        clearDynamicFilterBurstTimers();
        dynamicFilterObserver = null;
        debounceFilterTimer = 0;
        keywordFilterEnabled = false;
        keywordFilterText = '';
        setDynamicFilterActive(false);
        clearDynamicFilterCardClasses();
    }

    let storage = null;
    let favoritesService = null;
    let pageInfo = null;
    let dynamicFilter = null;
    let eventBag = null;
    let isHoveringFavBtn = false;
    let isTouchDevice = false;
    let messageTimer = 0;

    function syncFloatBtnHideState() {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn) return;
        const keywordActive = Boolean(dynamicFilter?.getKeywordFilterState?.().isActive);
        btn.classList.toggle(
            'hide-forward-active',
            Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics)) || keywordActive
        );
    }

    function showMessage(text, isError = false, duration = 2200) {
        const msgEl = document.querySelector('.bilibili-fav-msg');
        if (!msgEl) return;
        if (messageTimer) clearTimeout(messageTimer);
        Object.assign(msgEl.style, { color: isError ? '#ff4757' : '#4cd964', display: 'block' });
        msgEl.textContent = text;
        messageTimer = setTimeout(() => { msgEl.style.display = 'none'; messageTimer = 0; }, duration);
    }

    function createFloatingButton() {
        if (document.getElementById('bilibili-fav-float-btn')) return;

        const isVideoPage = window.location.href.includes('bilibili.com/video/')
            || window.location.href.includes('bilibili.com/bangumi/');
        const btn = document.createElement('div');
        btn.id = 'bilibili-fav-float-btn';
        btn.innerHTML = '&#11088;';
        btn.title = isTouchDevice
            ? '\u70b9\u51fb\u6253\u5f00\u6536\u85cf\uff0c\u957f\u6309\u6253\u5f00\u52a8\u6001\u63a7\u5236'
            : '\u60ac\u505c\u67e5\u770b\u6536\u85cf\uff0c\u53f3\u952e\u6253\u5f00\u52a8\u6001\u8fc7\u6ee4';
        if (isTouchDevice) btn.classList.add('bilibili-fav-touch');
        if (isVideoPage && !isTouchDevice) btn.style.opacity = '0';
        document.body.appendChild(btn);

        let hideTimer = 0;
        let touchLongPressHandled = false;
        if (isVideoPage && !isTouchDevice) {
            const show = () => {
                btn.style.opacity = '1';
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = 0;
            };
            const hide = () => {
                hideTimer = setTimeout(() => {
                    btn.style.opacity = '0';
                    hidePanel('bilibili-fav-panel');
                }, 300);
            };
            eventBag.on(btn, 'mouseenter', show);
            eventBag.on(btn, 'mouseleave', hide);
            eventBag.add(() => { if (hideTimer) clearTimeout(hideTimer); });
        }

        if (isTouchDevice) {
            let longPressTimer = 0;
            const clearLongPress = () => {
                if (longPressTimer) clearTimeout(longPressTimer);
                longPressTimer = 0;
            };
            eventBag.on(btn, 'touchstart', (event) => {
                touchLongPressHandled = false;
                clearLongPress();
                longPressTimer = setTimeout(() => {
                    touchLongPressHandled = true;
                    hidePanel('bilibili-fav-panel');
                    toggleDynamicControlsPanel();
                }, 520);
            }, { passive: true });
            eventBag.on(btn, 'touchmove', clearLongPress, { passive: true });
            eventBag.on(btn, 'touchend', clearLongPress, { passive: true });
            eventBag.on(btn, 'touchcancel', clearLongPress, { passive: true });
            eventBag.on(btn, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (touchLongPressHandled) {
                    touchLongPressHandled = false;
                    return;
                }
                if (document.getElementById('bilibili-fav-panel')?.classList.contains('show')) {
                    hidePanel('bilibili-fav-panel');
                } else {
                    showFavoritesPanel();
                }
            });
            eventBag.add(clearLongPress);
        } else {
            eventBag.on(btn, 'mouseenter', () => {
                isHoveringFavBtn = true;
                showFavoritesPanel();
            });
            eventBag.on(btn, 'mouseleave', () => {
                isHoveringFavBtn = false;
                setTimeout(() => { if (!isHoveringFavBtn) hidePanel('bilibili-fav-panel'); }, 200);
            });
        }
        eventBag.on(btn, 'contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (touchLongPressHandled) {
                touchLongPressHandled = false;
                return;
            }
            isHoveringFavBtn = false;
            hidePanel('bilibili-fav-panel');
            toggleDynamicControlsPanel();
        });

        syncFloatBtnHideState();
    }

    function createFavoritesPanel() {
        if (document.getElementById('bilibili-fav-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header">
                <span>\u6211\u7684\u6536\u85cf</span>
                <span class="bilibili-fav-header-actions">
                    <button class="bilibili-fav-control-btn">\u63a7\u5236</button>
                    <button class="bilibili-fav-add-btn">+ \u6dfb\u52a0\u5f53\u524d</button>
                </span>
            </div>
            <div class="bilibili-fav-content"><div class="bilibili-fav-list"></div></div>
            <div class="bilibili-fav-msg"></div>
        `;
        document.body.appendChild(panel);

        if (!isTouchDevice) {
            eventBag.on(panel, 'mouseenter', () => { isHoveringFavBtn = true; });
            eventBag.on(panel, 'mouseleave', () => {
                isHoveringFavBtn = false;
                hidePanel('bilibili-fav-panel');
            });
        }
        eventBag.on(panel, 'click', (event) => {
            const del = event.target.closest('.bilibili-fav-delete');
            if (!del) return;
            event.preventDefault();
            event.stopPropagation();
            deleteFavorite(del.dataset.key);
        });
        eventBag.on(panel.querySelector('.bilibili-fav-add-btn'), 'click', addCurrent);
        eventBag.on(panel.querySelector('.bilibili-fav-control-btn'), 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleDynamicControlsPanel();
        });
    }

    function showPanel(panelId, hideOtherId, createFn, renderFn) {
        let panel = document.getElementById(panelId);
        if (!panel) {
            createFn();
            panel = document.getElementById(panelId);
        }
        hidePanel(hideOtherId);
        panel.classList.add('show');
        renderFn();
    }

    function showFavoritesPanel() {
        showPanel('bilibili-fav-panel', 'bilibili-fav-controls-panel', createFavoritesPanel, renderFavoriteList);
    }

    function createDynamicControlsPanel() {
        if (document.getElementById('bilibili-fav-controls-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-controls-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>\u52a8\u6001\u63a7\u5236</span></div>
            <div class="bilibili-toolbox-control-content">
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">\u9690\u85cf\u8f6c\u53d1\u52a8\u6001</span>
                        <span class="bilibili-toolbox-control-desc">\u4ec5\u5728\u7528\u6237\u52a8\u6001\u9875\u751f\u6548</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-forward-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">\u5173\u952e\u8bcd\u7b5b\u9009\u52a8\u6001</span>
                        <span class="bilibili-toolbox-control-desc">\u4ec5\u663e\u793a\u5305\u542b\u8f93\u5165\u5185\u5bb9\u7684\u52a8\u6001</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-keyword-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <input type="text" class="bilibili-toolbox-keyword-input" placeholder="\u8f93\u5165\u8981\u5305\u542b\u7684\u5185\u5bb9" autocomplete="off" spellcheck="false">
                <div class="bilibili-toolbox-control-status"></div>
            </div>
            <div class="bilibili-toolbox-control-actions">
                <button class="bilibili-toolbox-export-btn">\u5bfc\u51fa\u6536\u85cf</button>
                <button class="bilibili-toolbox-import-btn">\u5bfc\u5165\u6536\u85cf</button>
            </div>
        `;
        document.body.appendChild(panel);

        eventBag.on(panel.querySelector('.bilibili-toolbox-forward-toggle'), 'change', async (event) => {
            await storage.setSetting(TOOLBOX_SETTINGS.hideForwardDynamics, Boolean(event.target.checked));
            syncFloatBtnHideState();
            dynamicFilter.sync();
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-toggle'), 'change', (event) => {
            const enabled = Boolean(event.target.checked);
            dynamicFilter.setKeywordFilterState({ enabled });
            renderDynamicControlsPanel();
            if (enabled) {
                window.setTimeout(() => panel.querySelector('.bilibili-toolbox-keyword-input')?.focus(), 0);
            }
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-input'), 'input', (event) => {
            dynamicFilter.setKeywordFilterState({ text: event.target.value });
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-export-btn'), 'click', exportFavorites);
        eventBag.on(panel.querySelector('.bilibili-toolbox-import-btn'), 'click', importFavorites);

        renderDynamicControlsPanel();
    }

    function isDynamicControlsPanelVisible() {
        return document.getElementById('bilibili-fav-controls-panel')?.classList.contains('show');
    }

    function getDynamicControlsStatus(forwardEnabled, keywordState) {
        if (!dynamicFilter.isSpaceDynamicPage()) return '\u5728\u7528\u6237\u52a8\u6001\u9875\u751f\u6548';

        const states = [];
        if (forwardEnabled) states.push('\u5df2\u9690\u85cf\u8f6c\u53d1\u52a8\u6001');
        if (keywordState.enabled && !keywordState.hasKeyword) states.push('\u8bf7\u8f93\u5165\u5173\u952e\u8bcd\u540e\u5f00\u59cb\u7b5b\u9009');
        if (keywordState.isActive) states.push(`\u4ec5\u663e\u793a\u5305\u542b\u201c${keywordState.displayText}\u201d\u7684\u52a8\u6001`);
        return states.length ? states.join('\uff1b') : '\u5df2\u663e\u793a\u5168\u90e8\u52a8\u6001';
    }

    function renderDynamicControlsPanel() {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        if (!panel) return;

        const forwardEnabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics));
        const keywordState = dynamicFilter.getKeywordFilterState();
        const keywordInput = panel.querySelector('.bilibili-toolbox-keyword-input');
        panel.querySelector('.bilibili-toolbox-forward-toggle').checked = forwardEnabled;
        panel.querySelector('.bilibili-toolbox-keyword-toggle').checked = keywordState.enabled;
        if (keywordInput.value !== keywordState.text) keywordInput.value = keywordState.text;
        panel.querySelector('.bilibili-toolbox-control-status').textContent = getDynamicControlsStatus(forwardEnabled, keywordState);
        syncFloatBtnHideState();
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

    function closeFavoritesTextDialog() {
        document.querySelector('#bilibili-toolbox-export-dialog .bilibili-toolbox-export-close')?.click();
    }

    function showFavoritesTextDialog({ title, text = '', readOnly = false, clipboardAction = '', confirmText = '', onConfirm = null }) {
        closeFavoritesTextDialog();
        const dialog = document.createElement('div');
        dialog.id = 'bilibili-toolbox-export-dialog';
        dialog.className = 'bilibili-toolbox-export-dialog';
        dialog.innerHTML = `
            <div class="bilibili-toolbox-export-document" role="dialog" aria-modal="true" aria-labelledby="bilibili-toolbox-export-title">
                <div class="bilibili-toolbox-export-header">
                    <span id="bilibili-toolbox-export-title"></span>
                    <button class="bilibili-toolbox-export-close" type="button" aria-label="\u5173\u95ed">&times;</button>
                </div>
                <textarea class="bilibili-toolbox-export-text" aria-label="\u6536\u85cf\u6587\u672c" spellcheck="false"></textarea>
                ${clipboardAction || onConfirm ? `
                    <div class="bilibili-toolbox-export-footer">
                        <span class="bilibili-toolbox-export-status" role="status"></span>
                        <div class="bilibili-toolbox-export-actions">
                            ${clipboardAction ? '<button class="bilibili-toolbox-export-clipboard" type="button"></button>' : ''}
                            ${onConfirm ? '<button class="bilibili-toolbox-export-confirm" type="button"></button>' : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        const close = () => {
            document.removeEventListener('keydown', handleKeyDown);
            dialog.remove();
        };
        const handleKeyDown = event => {
            if (event.key === 'Escape') close();
        };

        dialog.querySelector('.bilibili-toolbox-export-close').addEventListener('click', close);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) close();
        });
        document.addEventListener('keydown', handleKeyDown);
        document.body.appendChild(dialog);

        dialog.querySelector('#bilibili-toolbox-export-title').textContent = title;
        const textarea = dialog.querySelector('.bilibili-toolbox-export-text');
        textarea.value = text;
        textarea.readOnly = readOnly;
        const status = dialog.querySelector('.bilibili-toolbox-export-status');
        const setStatus = (message, isError = false) => {
            if (!status) return;
            status.textContent = message;
            status.classList.toggle('is-error', isError);
        };

        if (clipboardAction) {
            const clipboard = dialog.querySelector('.bilibili-toolbox-export-clipboard');
            clipboard.textContent = clipboardAction === 'copy' ? '\u4e00\u952e\u590d\u5236' : '\u4e00\u952e\u7c98\u8d34';
            clipboard.addEventListener('click', async () => {
                try {
                    if (clipboardAction === 'copy') {
                        await navigator.clipboard.writeText(textarea.value);
                        setStatus('\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
                    } else {
                        textarea.value = await navigator.clipboard.readText();
                        textarea.focus();
                        setStatus('\u5df2\u7c98\u8d34\u526a\u8d34\u677f\u5185\u5bb9');
                    }
                } catch (_) {
                    textarea.focus();
                    if (clipboardAction === 'copy') textarea.select();
                    setStatus(
                        clipboardAction === 'copy'
                            ? '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+C \u624b\u52a8\u590d\u5236'
                            : '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+V \u624b\u52a8\u7c98\u8d34',
                        true
                    );
                }
            });
        }

        if (onConfirm) {
            const confirm = dialog.querySelector('.bilibili-toolbox-export-confirm');
            confirm.textContent = confirmText;
            confirm.addEventListener('click', () => onConfirm({ text: textarea.value, close, setStatus }));
        }

        textarea.focus();
        if (readOnly) textarea.select();
    }

    function showExportTextDialog(text) {
        showFavoritesTextDialog({
            title: '\u5bfc\u51fa\u6536\u85cf\u6587\u672c',
            text,
            readOnly: true,
            clipboardAction: 'copy'
        });
    }

    function exportFavorites() {
        const data = Shared.normalizeToolboxData(dataProvider());
        if (!data.favorites.length) {
            showMessage('\u6682\u65e0\u53ef\u5bfc\u51fa\u7684\u6536\u85cf', true);
            return;
        }

        showExportTextDialog(favoritesService.createExportText(data));
    }

    function importFavorites() {
        showFavoritesTextDialog({
            title: '\u5bfc\u5165\u6536\u85cf\u6587\u672c',
            clipboardAction: 'paste',
            confirmText: '\u5bfc\u5165',
            onConfirm: async ({ text, close, setStatus }) => {
                const imported = favoritesService.normalizeImportedFavorites(text);

                if (!imported?.length) {
                    setStatus('\u672a\u8bfb\u53d6\u5230\u6709\u6548\u6536\u85cf', true);
                    return;
                }

                try {
                    const result = await favoritesService.importFavorites(imported);
                    renderFavoriteList();
                    close();
                    showMessage(`\u5bfc\u5165 ${result.added} \u6761\uff0c\u66f4\u65b0 ${result.updated} \u6761\uff0c\u8df3\u8fc7 ${result.skipped} \u6761`);
                } catch (_) {
                    setStatus('\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', true);
                }
            }
        });
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = Shared.isReadlistFavorite(item);
        return {
            isReadlist,
            key: Shared.escapeHtml(Shared.getFavoriteKey(item)),
            link: Shared.escapeHtml(Shared.getFavoriteLink(item)),
            img: Shared.escapeHtml(Shared.getFavoriteImage(item)) || Shared.FALLBACK_IMAGE,
            imgClass: isReadlist ? 'bilibili-fav-avatar cover' : 'bilibili-fav-avatar',
            name: Shared.escapeHtml(Shared.getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;

        const favorites = dataProvider().favorites || [];
        if (favorites.length === 0) {
            listEl.innerHTML = '<div class="bilibili-fav-empty">\u6682\u65e0\u6536\u85cf<br>\u70b9\u51fb\u4e0b\u65b9\u6309\u94ae\u6dfb\u52a0</div>';
            return;
        }

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

    async function addCurrent() {
        const item = pageInfo.getCurrentFavoriteData();
        if (!item) return showMessage('\u65e0\u6cd5\u83b7\u53d6\u5f53\u524d\u9875\u9762\u4fe1\u606f', true);

        const result = await favoritesService.addFavorite(item);
        if (!result.added) {
            return showMessage(
                result.reason === 'duplicate' ? '\u5df2\u5728\u6536\u85cf\u5217\u8868' : '\u65e0\u6cd5\u83b7\u53d6\u5f53\u524d\u9875\u9762\u4fe1\u606f',
                true
            );
        }

        showMessage('\u6dfb\u52a0\u6210\u529f');
    }

    async function deleteFavorite(favoriteKey) {
        await favoritesService.removeFavorite(favoriteKey);
    }

    function handleDocumentPointerDown(event) {
        const favoritesPanel = document.getElementById('bilibili-fav-panel');
        const controlsPanel = document.getElementById('bilibili-fav-controls-panel');
        const button = document.getElementById('bilibili-fav-float-btn');
        const favoritesVisible = favoritesPanel?.classList.contains('show');
        const controlsVisible = controlsPanel?.classList.contains('show');
        if (!favoritesVisible && !controlsVisible) return;
        if (favoritesPanel?.contains(event.target) || controlsPanel?.contains(event.target) || button?.contains(event.target)) return;
        if (isTouchDevice) hidePanel('bilibili-fav-panel');
        hidePanel('bilibili-fav-controls-panel');
    }

    function handleDocumentKeyDown(event) {
        if (event.key === 'Escape') hidePanel('bilibili-fav-controls-panel');
    }

    function syncFavoritesUi() {
        renderFavoriteList();
        renderDynamicControlsPanel();
        syncFloatBtnHideState();
    }

    function initFavoritesUi(options) {
        storage = options.storage;
        favoritesService = options.favoritesService;
        pageInfo = options.pageInfo;
        dynamicFilter = options.dynamicFilter;
        setDataProvider(options.getData);
        eventBag = Toolbox.createEventBag();
        isTouchDevice = Shared.isTouchLikeDevice();

        createFloatingButton();
        createDynamicControlsPanel();
        eventBag.on(document, 'mousedown', handleDocumentPointerDown, true);
        eventBag.on(document, 'pointerdown', handleDocumentPointerDown, true);
        eventBag.on(document, 'touchstart', handleDocumentPointerDown, true);
        eventBag.on(document, 'keydown', handleDocumentKeyDown);
        eventBag.on(window, URL_CHANGE_EVENT, () => dynamicFilter.sync());
        syncFavoritesUi();
    }

    function destroyFavoritesUi() {
        if (messageTimer) clearTimeout(messageTimer);
        if (eventBag) eventBag.cleanup();
        eventBag = null;
        messageTimer = 0;
        document.getElementById('bilibili-fav-panel')?.remove();
        document.getElementById('bilibili-fav-controls-panel')?.remove();
        document.getElementById('bilibili-fav-float-btn')?.remove();
        document.getElementById('bilibili-fav-hover-zone')?.remove();
        closeFavoritesTextDialog();
    }

    Toolbox.pageInfo = {
        getCurrentPageInfo,
        extractPageInfoForFavorite,
        getCurrentFavoriteData: () => extractPageInfoForFavorite(getCurrentPageInfo())
    };

    Toolbox.url = {
        URL_CHANGE_EVENT,
        init: initUrlBridge,
        notifyUrlChange
    };

    Toolbox.dynamicFilter = {
        init: initDynamicFilter,
        destroy: destroyDynamicFilter,
        sync: syncDynamicFilter,
        apply: applyDynamicFilter,
        scheduleApply: scheduleDynamicFilterApply,
        isSpaceDynamicPage,
        getSettingValue,
        setKeywordFilterState,
        getKeywordFilterState,
        FILTER_ACTIVE_CLASS,
        FILTER_READY_CLASS,
        HIDDEN_FORWARD_CLASS
    };

    Toolbox.favoritesUi = {
        init: initFavoritesUi,
        destroy: destroyFavoritesUi,
        sync: syncFavoritesUi,
        renderFavoriteList,
        renderDynamicControlsPanel,
        syncFloatBtnHideState,
        isDynamicControlsPanelVisible
    };

    Toolbox.contentFeatures = {
        pageInfo: Toolbox.pageInfo,
        url: Toolbox.url,
        dynamicFilter: Toolbox.dynamicFilter,
        favoritesUi: Toolbox.favoritesUi
    };
})();
