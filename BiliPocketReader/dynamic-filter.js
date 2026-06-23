// Bilibili Toolbox - dynamic feed filtering
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
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
    let onRenderControls = () => {};
    let onSyncFloatButton = () => {};
    let dynamicFilterObserver = null;
    let debounceFilterTimer = 0;
    let dynamicFilterBurstTimers = [];
    let keywordFilterEnabled = false;
    let keywordFilterText = '';

    function setDataProvider(provider) {
        if (typeof provider === 'function') dataProvider = provider;
    }

    function getSettingValue(key, fallback = false) {
        const data = Shared.normalizeToolboxData(dataProvider());
        return Object.prototype.hasOwnProperty.call(data.settings, key)
            ? data.settings[key]
            : fallback;
    }

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
        normalizeDynamicText,
        isForwardDynamic,
        FILTER_ACTIVE_CLASS,
        FILTER_READY_CLASS,
        HIDDEN_FORWARD_CLASS
    };
})();
