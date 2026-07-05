// Bilibili Toolbox - space opus tab selection
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const ALL_OPUS_TAB_TEXT = '\u5168\u90e8\u56fe\u6587';
    const OPUS_TAB_TEXT = '\u4e13\u680f';
    const DYNAMIC_TAB_TEXT = '\u52a8\u6001';
    const REQUIRED_TAB_TEXTS = [ALL_OPUS_TAB_TEXT, OPUS_TAB_TEXT, DYNAMIC_TAB_TEXT];
    const BURST_DELAYS = [600, 1200, 2200, 3500, 5500, 8000, 12000];
    const DOM_STABLE_DELAY = 500;
    const OBSERVER_RETRY_DELAY = 500;
    const ACTIVE_STABLE_DELAY = 1200;
    const CLICK_VERIFY_DELAY = 800;
    const CLICK_RETRY_DELAY = 800;
    const MAX_INTENT_DURATION = 15000;

    let tabObserver = null;
    let tabTimers = [];
    let clickVerifyTimer = null;
    let intentUid = '';
    let intentStartedAt = 0;
    let lastMutationAt = 0;
    let activeSince = 0;
    let selectedForIntent = false;
    let clickPending = false;

    function now() {
        return Date.now();
    }

    function isSpaceOpusUploadPage(url = window.location.href) {
        return bilibiliDom.isSpaceOpusUploadPage(url);
    }

    function getSpaceOpusUid(url = window.location.href) {
        return bilibiliDom.getSpaceOpusUid(url);
    }

    function normalizeTabText(tab) {
        return String(tab?.textContent || '').replace(/\s+/g, '').trim();
    }

    function isActiveTab(tab) {
        return Boolean(tab?.classList?.contains?.('active') || /\bactive\b/.test(tab?.className || ''));
    }

    function getContentTabs() {
        return bilibiliDom.getContentTabs();
    }

    function getContentFilter() {
        return bilibiliDom.getContentFilter?.() || null;
    }

    function getSpaceOpusBody() {
        return bilibiliDom.getSpaceOpusBody?.() || null;
    }

    function findOpusTab() {
        return getContentTabs().find(tab => normalizeTabText(tab) === OPUS_TAB_TEXT) || null;
    }

    function hasCompleteTabGroup() {
        const tabTexts = new Set(getContentTabs().map(normalizeTabText));
        return REQUIRED_TAB_TEXTS.every(text => tabTexts.has(text));
    }

    function isVisibleElement(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') return Boolean(element);
        const rect = element.getBoundingClientRect();
        return Boolean(rect && (Number(rect.width) > 0 || Number(rect.height) > 0));
    }

    function isDomStable() {
        return now() - lastMutationAt >= DOM_STABLE_DELAY;
    }

    function isIntentExpired() {
        return intentStartedAt > 0 && now() - intentStartedAt > MAX_INTENT_DURATION;
    }

    function isContentFilterNode(node) {
        return Boolean(
            node?.classList?.contains?.('content-filter')
            || node?.classList?.contains?.('content-tab')
            || node?.querySelector?.('.content-filter, .content-tab')
        );
    }

    function isContentFilterMutation(mutation) {
        const filter = getContentFilter();
        if (!filter) return true;

        const target = mutation?.target || null;
        if (target === filter || filter.contains?.(target) || isContentFilterNode(target)) return true;

        return [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])].some(isContentFilterNode);
    }

    function hasContentFilterMutation(mutations) {
        if (!Array.isArray(mutations) || mutations.length === 0) return true;
        return mutations.some(isContentFilterMutation);
    }

    function isTabReady(tab) {
        if (!tab || typeof tab.click !== 'function' || !hasCompleteTabGroup()) return false;
        if (!getSpaceOpusBody()) return false;
        if (!isDomStable()) return false;
        if (typeof tab.getBoundingClientRect !== 'function') return true;

        return isVisibleElement(tab);
    }

    function clearTabTimers() {
        tabTimers.forEach(timer => clearTimeout(timer));
        tabTimers = [];
    }

    function clearClickVerifyTimer() {
        if (clickVerifyTimer) clearTimeout(clickVerifyTimer);
        clickVerifyTimer = null;
        clickPending = false;
    }

    function stopTabObserver() {
        if (tabObserver) tabObserver.disconnect();
        tabObserver = null;
    }

    function clearIntent() {
        clearTabTimers();
        clearClickVerifyTimer();
        stopTabObserver();
        intentUid = '';
        intentStartedAt = 0;
        lastMutationAt = 0;
        activeSince = 0;
        selectedForIntent = false;
    }

    function markSelectionComplete() {
        selectedForIntent = true;
        clearTabTimers();
        clearClickVerifyTimer();
        stopTabObserver();
    }

    function ensureTabObserver() {
        if (tabObserver || !document.body || typeof MutationObserver !== 'function') return;
        tabObserver = new MutationObserver((mutations) => {
            if (hasContentFilterMutation(mutations)) {
                lastMutationAt = now();
                activeSince = 0;
            }
            if (intentUid && !selectedForIntent) scheduleSelect(OBSERVER_RETRY_DELAY);
        });
        tabObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function stopExpiredIntent() {
        clearTabTimers();
        clearClickVerifyTimer();
        stopTabObserver();
        selectedForIntent = true;
    }

    function confirmStableActive(tab) {
        if (!isActiveTab(tab)) {
            activeSince = 0;
            scheduleSelect(CLICK_RETRY_DELAY);
            return false;
        }

        if (!activeSince) activeSince = now();
        if (now() - activeSince >= ACTIVE_STABLE_DELAY) {
            markSelectionComplete();
            return true;
        }

        scheduleClickVerify();
        return false;
    }

    function verifyClickedTab() {
        clickVerifyTimer = null;
        clickPending = false;

        if (!intentUid || selectedForIntent || !isSpaceOpusUploadPage()) return false;
        if (isIntentExpired()) {
            stopExpiredIntent();
            return false;
        }

        const tab = findOpusTab();
        if (tab) return confirmStableActive(tab);

        scheduleSelect(CLICK_RETRY_DELAY);
        return false;
    }

    function scheduleClickVerify() {
        if (clickVerifyTimer) clearTimeout(clickVerifyTimer);
        clickVerifyTimer = window.setTimeout(verifyClickedTab, CLICK_VERIFY_DELAY);
    }

    function selectOpusTabNow() {
        if (!intentUid || selectedForIntent || clickPending || !isSpaceOpusUploadPage()) return false;
        if (isIntentExpired()) {
            stopExpiredIntent();
            return false;
        }

        const tab = findOpusTab();
        if (!isTabReady(tab)) return false;

        if (isActiveTab(tab)) return confirmStableActive(tab);

        clickPending = true;
        activeSince = 0;
        tab.click();
        scheduleClickVerify();
        return true;
    }

    function scheduleSelect(delay = 80) {
        if (!intentUid || selectedForIntent) return;
        const timer = window.setTimeout(() => {
            tabTimers = tabTimers.filter(item => item !== timer);
            selectOpusTabNow();
        }, delay);
        tabTimers.push(timer);
    }

    function scheduleSelectBurst() {
        clearTabTimers();
        BURST_DELAYS.forEach(scheduleSelect);
    }

    function syncSpaceOpusTabs() {
        if (!isSpaceOpusUploadPage()) {
            clearIntent();
            return;
        }

        const uid = getSpaceOpusUid();
        if (!uid) {
            clearIntent();
            return;
        }

        if (intentUid === uid && selectedForIntent) return;
        if (intentUid !== uid) {
            clearTabTimers();
            clearClickVerifyTimer();
            stopTabObserver();
            selectedForIntent = false;
            activeSince = 0;
        } else {
            clearTabTimers();
            clearClickVerifyTimer();
        }

        intentUid = uid;
        intentStartedAt = now();
        lastMutationAt = now();
        ensureTabObserver();
        scheduleSelectBurst();
    }

    function initSpaceOpusTabs() {
        syncSpaceOpusTabs();
    }

    function destroySpaceOpusTabs() {
        clearIntent();
    }

    Toolbox.spaceOpusTabs = {
        init: initSpaceOpusTabs,
        destroy: destroySpaceOpusTabs,
        sync: syncSpaceOpusTabs,
        selectNow: selectOpusTabNow,
        isSpaceOpusUploadPage
    };
})();
