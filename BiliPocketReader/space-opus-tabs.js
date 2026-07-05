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
    const BURST_DELAYS = [300, 800, 1500, 2500, 4000, 6500, 9000];
    const OBSERVER_RETRY_DELAY = 300;
    const CLICK_VERIFY_DELAY = 700;
    const CLICK_RETRY_DELAY = 1000;

    let tabObserver = null;
    let tabTimers = [];
    let clickVerifyTimer = null;
    let intentUid = '';
    let selectedForIntent = false;
    let clickPending = false;

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

    function findOpusTab() {
        return getContentTabs().find(tab => normalizeTabText(tab) === OPUS_TAB_TEXT) || null;
    }

    function hasCompleteTabGroup() {
        const tabTexts = new Set(getContentTabs().map(normalizeTabText));
        return REQUIRED_TAB_TEXTS.every(text => tabTexts.has(text));
    }

    function isTabReady(tab) {
        if (!tab || typeof tab.click !== 'function' || !hasCompleteTabGroup()) return false;
        if (typeof tab.getBoundingClientRect !== 'function') return true;

        const rect = tab.getBoundingClientRect();
        return !rect || rect.width !== 0 || rect.height !== 0;
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
        tabObserver = new MutationObserver(() => {
            if (intentUid && !selectedForIntent) scheduleSelect(OBSERVER_RETRY_DELAY);
        });
        tabObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function verifyClickedTab() {
        clickVerifyTimer = null;
        clickPending = false;

        if (!intentUid || selectedForIntent || !isSpaceOpusUploadPage()) return false;

        const tab = findOpusTab();
        if (tab && isActiveTab(tab)) {
            markSelectionComplete();
            return true;
        }

        scheduleSelect(CLICK_RETRY_DELAY);
        return false;
    }

    function scheduleClickVerify() {
        if (clickVerifyTimer) clearTimeout(clickVerifyTimer);
        clickVerifyTimer = window.setTimeout(verifyClickedTab, CLICK_VERIFY_DELAY);
    }

    function selectOpusTabNow() {
        if (!intentUid || selectedForIntent || clickPending || !isSpaceOpusUploadPage()) return false;

        const tab = findOpusTab();
        if (!isTabReady(tab)) return false;

        if (isActiveTab(tab)) {
            markSelectionComplete();
            return true;
        }

        clickPending = true;
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
        } else {
            clearTabTimers();
            clearClickVerifyTimer();
        }

        intentUid = uid;
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
