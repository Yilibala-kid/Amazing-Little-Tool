// Bilibili Toolbox - content entrypoint
(function() {
    'use strict';

    const Toolbox = window.BilibiliToolbox;
    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    for (const service of ['storage', 'favorites', 'comicImages', 'animations', 'reader',
        'pageInfo', 'url', 'spaceOpusTabs', 'dynamicFilter', 'settingsPopoverUi', 'favoritesUi']) {
        if (!Toolbox?.[service]) throw new Error(`BilibiliToolbox: ${service} service not loaded`);
    }
    const storage = Toolbox.storage;
    let toolboxData = window.Shared.createDefaultData();
    let unsubscribeStorage = null;
    let settingsEventBag = null;
    let initialized = false;
    let messageHandler = null;
    let readerInstance = null;
    let readerPage = null;
    let lifecycleToken = 0;

    function syncAll(data) {
        const previous = toolboxData;
        toolboxData = window.Shared.normalizeToolboxData(data);
        const columnsChanged = previous.settings.favoriteColumns !== toolboxData.settings.favoriteColumns;
        if (columnsChanged || JSON.stringify(previous.favorites) !== JSON.stringify(toolboxData.favorites)) {
            Toolbox.favoritesUi.sync();
        }
        if (previous.settings.hideForwardDynamics !== toolboxData.settings.hideForwardDynamics) {
            Toolbox.dynamicFilter.sync();
        } else if (columnsChanged) {
            Toolbox.settingsPopoverUi.render();
        }
    }

    function setupMessageBridge() {
        if (messageHandler) return;
        messageHandler = (request, sender, sendResponse) => {
            if (request.type === 'GET_PAGE_FAVORITE_DATA') {
                sendResponse(Toolbox.pageInfo.getCurrentFavoriteData());
            }
        };
        chrome.runtime.onMessage.addListener(messageHandler);
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        const token = ++lifecycleToken;
        toolboxData = await storage.init();
        if (!initialized || token !== lifecycleToken) return;
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
            dynamicFilter: Toolbox.dynamicFilter,
            settingsUi: Toolbox.settingsPopoverUi
        });
        window.addEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        window.addEventListener('pagehide', handlePageHide);
        setupMessageBridge();

        syncReaderPage();
    }

    function syncReaderPage() {
        const url = new URL(window.location.href);
        const page = Toolbox.reader.shouldInitComicReader() ? url.origin + url.pathname : null;
        if (page === readerPage) return;
        readerInstance?.destroy();
        readerInstance = null;
        readerPage = page;
        if (page) {
            readerInstance = new Toolbox.reader.BiliComicReader();
            readerInstance.init();
        }
    }

    function handlePageHide() {
        readerInstance?.close();
    }

    function handleUrlChange() {
        syncReaderPage();
        Toolbox.spaceOpusTabs.sync();
        Toolbox.dynamicFilter.sync();
        Toolbox.favoritesUi.syncPageMode();
    }

    function destroy() {
        lifecycleToken += 1;
        if (unsubscribeStorage) unsubscribeStorage();
        unsubscribeStorage = null;
        if (messageHandler) chrome.runtime.onMessage.removeListener(messageHandler);
        messageHandler = null;
        window.removeEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        window.removeEventListener('pagehide', handlePageHide);
        readerInstance?.destroy();
        readerInstance = null;
        readerPage = null;
        Toolbox.spaceOpusTabs.destroy();
        Toolbox.settingsPopoverUi.destroy();
        if (settingsEventBag) settingsEventBag.cleanup();
        settingsEventBag = null;
        Toolbox.favoritesUi.destroy();
        Toolbox.dynamicFilter.destroy();
        Toolbox.url.destroy();
        storage.destroy();
        initialized = false;
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
