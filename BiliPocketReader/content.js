// Bilibili Toolbox - content entrypoint
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.favorites) throw new Error('BilibiliToolbox: favorites service not loaded');
    if (!window.BilibiliToolbox?.contentFeatures) throw new Error('BilibiliToolbox: content-features.js not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BiliAnimations) console.warn('BilibiliToolbox: animations.js not loaded; comic reader animations are disabled');

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
        Toolbox.dynamicFilter.init({
            getData: () => toolboxData,
            renderControls: () => Toolbox.favoritesUi.renderDynamicControlsPanel(),
            syncFloatButton: () => Toolbox.favoritesUi.syncFloatBtnHideState()
        });
        Toolbox.favoritesUi.init({
            storage,
            favoritesService: Toolbox.favorites,
            getData: () => toolboxData,
            pageInfo: Toolbox.pageInfo,
            dynamicFilter: Toolbox.dynamicFilter
        });
        setupMessageBridge();

        if (window.shouldInitComicReader()) {
            new window.BiliComicReader().init();
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
