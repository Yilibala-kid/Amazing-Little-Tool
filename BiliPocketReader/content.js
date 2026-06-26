// Bilibili Toolbox - content entrypoint
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.favorites) throw new Error('BilibiliToolbox: favorites service not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.reader) throw new Error('BilibiliToolbox: comic-reader.js not loaded');
    if (!window.BilibiliToolbox?.pageInfo) throw new Error('BilibiliToolbox: content-page-info.js not loaded');
    if (!window.BilibiliToolbox?.url) throw new Error('BilibiliToolbox: content-url.js not loaded');
    if (!window.BilibiliToolbox?.dynamicFilter) throw new Error('BilibiliToolbox: dynamic-filter.js not loaded');
    if (!window.BilibiliToolbox?.spaceOpusTabs) throw new Error('BilibiliToolbox: space-opus-tabs.js not loaded');
    if (!window.BilibiliToolbox?.settingsPopoverUi) throw new Error('BilibiliToolbox: settings-popover-ui.js not loaded');
    if (!window.BilibiliToolbox?.favoritesUi) throw new Error('BilibiliToolbox: favorites-ui.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const storage = Toolbox.storage;
    let toolboxData = window.Shared.createDefaultData();
    let unsubscribeStorage = null;
    let settingsEventBag = null;

    function syncAll(data) {
        toolboxData = window.Shared.normalizeToolboxData(data);
        Toolbox.favoritesUi.sync();
        Toolbox.dynamicFilter.sync();
    }

    function setupMessageBridge() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'GET_PAGE_FAVORITE_DATA') {
                sendResponse(Toolbox.pageInfo.getCurrentFavoriteData());
            }
        });
    }

    async function init() {
        toolboxData = await storage.init();
        unsubscribeStorage = storage.onChanged(syncAll);

        Toolbox.url.init();
        Toolbox.spaceOpusTabs.init();
        settingsEventBag = Toolbox.createEventBag();
        Toolbox.dynamicFilter.init({
            getData: () => toolboxData,
            renderSettings: () => Toolbox.settingsPopoverUi.render(),
            syncFloatButton: () => Toolbox.favoritesUi.syncFloatButton()
        });
        Toolbox.settingsPopoverUi.init({
            storage,
            favoritesService: Toolbox.favorites,
            dynamicFilter: Toolbox.dynamicFilter,
            getData: () => toolboxData,
            showMessage: (...args) => Toolbox.favoritesUi.showMessage(...args),
            eventBag: settingsEventBag
        });
        Toolbox.favoritesUi.init({
            favoritesService: Toolbox.favorites,
            getData: () => toolboxData,
            pageInfo: Toolbox.pageInfo,
            dynamicFilter: Toolbox.dynamicFilter
        });
        window.addEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        setupMessageBridge();

        if (Toolbox.reader.shouldInitComicReader()) {
            new Toolbox.reader.BiliComicReader().init();
        }
    }

    function handleUrlChange() {
        Toolbox.dynamicFilter.sync();
        Toolbox.favoritesUi.syncPageMode();
    }

    function destroy() {
        if (unsubscribeStorage) unsubscribeStorage();
        window.removeEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        Toolbox.spaceOpusTabs.destroy();
        Toolbox.settingsPopoverUi.destroy();
        if (settingsEventBag) settingsEventBag.cleanup();
        settingsEventBag = null;
        Toolbox.favoritesUi.destroy();
        Toolbox.dynamicFilter.destroy();
        storage.destroy();
    }

    Toolbox.contentApp = {
        init,
        destroy,
        getData: () => toolboxData
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
