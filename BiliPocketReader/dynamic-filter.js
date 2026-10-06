// Bilibili Toolbox - dynamic feed filtering
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
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
    let onRenderSettings = () => {};
    let onSyncFloatButton = () => {};
    let dynamicFilterObserver = null;
    let debounceFilterTimer = 0;
    let active = false;
    let fullScanPending = false;
    const pendingCards = new Set();
    let keywordFilterEnabled = false;
    let keywordFilterText = '';

    function setDataProvider(provider) {
        if (typeof provider === 'function') dataProvider = provider;
    }

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return bilibiliDom.isSpaceDynamicPage(url);
    }

    function getDynamicCardElements() {
        const candidates = bilibiliDom.getDynamicCards();
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
        // textContent also works for previously hidden cards without forcing layout.
        return normalizeDynamicText(card.textContent || '');
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
        syncDynamicFilter();
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
        card.querySelectorAll(bilibiliDom.DYNAMIC_CARD_SELECTOR).forEach(child => child.classList.add(FILTER_READY_CLASS));
    }

    function applyDynamicFilter(cards = getDynamicCardElements()) {
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
        cards.filter(card => card.isConnected !== false).forEach(card => {
            const hideForward = shouldHideForward && isForwardDynamic(card);
            const hideKeyword = shouldFilterKeyword && !getDynamicCardText(card).includes(keywordState.normalizedText);
            card.classList.toggle(HIDDEN_FORWARD_CLASS, hideForward || hideKeyword);
            markDynamicCardReady(card);
        });
    }

    function runDynamicFilterNow() {
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = 0;
        if (!active) return;
        const cards = fullScanPending ? getDynamicCardElements() : [...pendingCards];
        fullScanPending = false;
        pendingCards.clear();
        applyDynamicFilter(cards);
    }

    function schedulePending(delay = 80) {
        if (!active) return;
        if (delay <= 0) {
            runDynamicFilterNow();
            return;
        }

        if (!debounceFilterTimer) debounceFilterTimer = window.setTimeout(runDynamicFilterNow, delay);
    }

    function scheduleDynamicFilterApply(delay = 80) {
        fullScanPending = true;
        schedulePending(delay);
    }

    function queueCard(node) {
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        let card = element?.closest?.(bilibiliDom.DYNAMIC_CARD_SELECTOR);
        if (!card) return;
        for (let parent = card.parentElement?.closest(bilibiliDom.DYNAMIC_CARD_SELECTOR); parent;
            parent = card.parentElement?.closest(bilibiliDom.DYNAMIC_CARD_SELECTOR)) card = parent;
        pendingCards.add(card);
    }

    function handleMutations(mutations) {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const relevantClasses = value => String(value || '').split(/\s+/)
                    .filter(name => name && name !== FILTER_READY_CLASS && name !== HIDDEN_FORWARD_CLASS).sort().join(' ');
                if (relevantClasses(mutation.oldValue) === relevantClasses(mutation.target.className)) continue;
            }
            queueCard(mutation.target);
            for (const node of mutation.addedNodes || []) {
                queueCard(node);
                node.querySelectorAll?.(bilibiliDom.DYNAMIC_CARD_SELECTOR).forEach(queueCard);
            }
        }
        if (pendingCards.size) schedulePending();
    }

    function stopObserving() {
        dynamicFilterObserver?.disconnect();
        dynamicFilterObserver = null;
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = 0;
        fullScanPending = false;
        pendingCards.clear();
    }

    function syncDynamicFilter() {
        onRenderSettings();
        onSyncFloatButton();
        const enabled = isSpaceDynamicPage() &&
            (Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false)) || getKeywordFilterState().isActive);
        if (!enabled) {
            stopObserving();
            if (active) { setDynamicFilterActive(false); clearDynamicFilterCardClasses(); }
            active = false;
            return;
        }
        active = true;
        if (!dynamicFilterObserver && document.body) {
            dynamicFilterObserver = new MutationObserver(handleMutations);
            dynamicFilterObserver.observe(document.body, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-type', 'data-dyn-type']
            });
        }
        scheduleDynamicFilterApply(0);
    }

    function initDynamicFilter(options = {}) {
        setDataProvider(options.getData);
        onRenderSettings = options.renderSettings || onRenderSettings;
        onSyncFloatButton = options.syncFloatButton || onSyncFloatButton;

        syncDynamicFilter();
    }

    function destroyDynamicFilter() {
        stopObserving();
        if (active) { setDynamicFilterActive(false); clearDynamicFilterCardClasses(); }
        active = false;
        keywordFilterEnabled = false;
        keywordFilterText = '';
        onRenderSettings = () => {};
        onSyncFloatButton = () => {};
        dataProvider = () => Shared.createDefaultData();
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
