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
    if (!window.BilibiliToolbox?.favoritesUi) throw new Error('BilibiliToolbox: favorites-ui.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const storage = Toolbox.storage;
    let toolboxData = window.Shared.createDefaultData();
    let unsubscribeStorage = null;

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
        Toolbox.favoritesUi.init({
            storage,
            favoritesService: Toolbox.favorites,
            getData: () => toolboxData,
            pageInfo: Toolbox.pageInfo,
            dynamicFilter: Toolbox.dynamicFilter
        });
        setupMessageBridge();

        if (Toolbox.reader.shouldInitComicReader()) {
            new Toolbox.reader.BiliComicReader().init();
        }
    }

    function destroy() {
        if (unsubscribeStorage) unsubscribeStorage();
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
