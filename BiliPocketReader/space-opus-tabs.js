// Bilibili Toolbox - space opus tab selection
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
    const OPUS_TAB_TEXT = '\u4e13\u680f';
    const BURST_DELAYS = [0, 80, 250, 600, 1200, 2500, 5000];
    const INTENT_TTL_MS = 10000;

    let tabObserver = null;
    let tabTimers = [];
    let urlChangeHandler = null;
    let intentUid = '';
    let intentUntil = 0;
    let selectedForIntent = false;
    let dataProvider = () => Shared.createDefaultData();

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
    }

    function isAutoSelectEnabled() {
        return Boolean(getSettingValue(TOOLBOX_SETTINGS.autoSelectOpusTab, true));
    }

    function isSpaceOpusUploadPage(url = window.location.href) {
        return bilibiliDom.isSpaceOpusUploadPage(url);
    }

    function getSpaceOpusUid(url = window.location.href) {
        return bilibiliDom.getSpaceOpusUid(url);
    }

    function ensureOpusTabIntent() {
        if (!isAutoSelectEnabled()) return false;
        if (!isSpaceOpusUploadPage()) return false;

        const uid = getSpaceOpusUid();
        if (!uid) return false;

        intentUid = uid;
        intentUntil = Date.now() + INTENT_TTL_MS;
        selectedForIntent = false;
        return Boolean(intentUid);
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

    function hasFreshIntentForCurrentUrl() {
        if (!isAutoSelectEnabled()) {
            intentUid = '';
            return false;
        }

        const uid = getSpaceOpusUid();
        const hasFreshIntent = intentUid
            && uid === intentUid
            && Date.now() <= intentUntil;

        if (!hasFreshIntent) {
            if (uid !== intentUid || Date.now() > intentUntil) intentUid = '';
            return false;
        }

        return !selectedForIntent;
    }

    function clickTab(tab) {
        if (!tab) return;
        tab.click();
    }

    function selectOpusTabNow() {
        if (!intentUid) ensureOpusTabIntent();
        if (!hasFreshIntentForCurrentUrl()) return false;

        const tab = findOpusTab();
        if (!tab) return false;

        if (isActiveTab(tab)) {
            selectedForIntent = true;
            return true;
        }

        clickTab(tab);
        if (!isActiveTab(tab)) return false;
        selectedForIntent = true;
        return true;
    }

    function clearTabTimers() {
        tabTimers.forEach(timer => clearTimeout(timer));
        tabTimers = [];
    }

    function scheduleSelect(delay = 80) {
        const timer = window.setTimeout(() => {
            tabTimers = tabTimers.filter(item => item !== timer);
            selectOpusTabNow();
        }, delay);
        tabTimers.push(timer);
    }

    function scheduleSelectBurst() {
        clearTabTimers();
        ensureOpusTabIntent();
        if (!hasFreshIntentForCurrentUrl()) return;
        BURST_DELAYS.forEach(scheduleSelect);
    }

    function syncSpaceOpusTabs() {
        if (!isAutoSelectEnabled()) {
            clearTabTimers();
            intentUid = '';
            intentUntil = 0;
            selectedForIntent = false;
            return;
        }
        scheduleSelectBurst();
    }

    function initSpaceOpusTabs(options = {}) {
        if (tabObserver) return;
        dataProvider = typeof options.getData === 'function' ? options.getData : dataProvider;

        tabObserver = new MutationObserver(() => {
            if (hasFreshIntentForCurrentUrl()) scheduleSelect();
        });
        tabObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        urlChangeHandler = scheduleSelectBurst;
        window.addEventListener(Toolbox.url?.URL_CHANGE_EVENT || 'bilibili-toolbox:urlchange', urlChangeHandler);
        syncSpaceOpusTabs();
    }

    function destroySpaceOpusTabs() {
        if (tabObserver) tabObserver.disconnect();
        if (urlChangeHandler) {
            window.removeEventListener(Toolbox.url?.URL_CHANGE_EVENT || 'bilibili-toolbox:urlchange', urlChangeHandler);
        }
        clearTabTimers();
        tabObserver = null;
        urlChangeHandler = null;
        dataProvider = () => Shared.createDefaultData();
        intentUid = '';
        intentUntil = 0;
        selectedForIntent = false;
    }

    Toolbox.spaceOpusTabs = {
        init: initSpaceOpusTabs,
        destroy: destroySpaceOpusTabs,
        sync: syncSpaceOpusTabs,
        selectNow: selectOpusTabNow,
        isSpaceOpusUploadPage
    };
})();
