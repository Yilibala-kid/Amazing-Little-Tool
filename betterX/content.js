// betterX - compose the page services and start the extension.
(function() {
    'use strict';

    const BetterX = globalThis.BetterX;
    BetterX.contentApp?.destroy();
    const STORAGE_KEY = 'betterX.settings.v1';
    const DEFAULT_SETTINGS = Object.freeze({ hideVideos: true, revealHidden: false });
    let settings = { ...DEFAULT_SETTINGS };
    let persistedSettings = settings;
    let saveQueue = Promise.resolve();
    let initialized = false;
    let lifecycleToken = 0;

    function normalizeSettings(input) {
        const source = input && typeof input === 'object' ? input : {};
        return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [
            key, typeof source[key] === 'boolean' ? source[key] : fallback
        ]));
    }

    const timeline = BetterX.createTimeline({
        getSettings: () => settings,
        onScan() {
            manager.render();
            downloads.refresh();
        }
    });
    const downloads = BetterX.createDownloads({
        getCurrentStatusArticle: timeline.getCurrentStatusArticle,
        showMessage: text => manager.showMessage(text)
    });
    const manager = BetterX.createManager({
        getSettings: () => settings,
        saveSettings(value) {
            const next = settings = normalizeSettings(value);
            const token = lifecycleToken;
            timeline.applySettings();
            saveQueue = saveQueue.then(async () => {
                if (!initialized || token !== lifecycleToken) return;
                try {
                    await chrome.storage.local.set({ [STORAGE_KEY]: next });
                    if (initialized && token === lifecycleToken) persistedSettings = next;
                } catch (error) {
                    if (!initialized || token !== lifecycleToken) return;
                    if (settings === next) {
                        settings = persistedSettings;
                        timeline.applySettings();
                    }
                    manager.showMessage(`设置保存失败：${error.message}`);
                }
            });
            return saveQueue;
        },
        timeline, downloads
    });

    async function init() {
        if (initialized) return;
        initialized = true;
        const token = ++lifecycleToken;
        let result;
        let loadError;
        try { result = await chrome.storage.local.get([STORAGE_KEY]); }
        catch (error) { loadError = error; }
        if (!initialized || token !== lifecycleToken) return;
        settings = normalizeSettings(result?.[STORAGE_KEY]);
        persistedSettings = settings;
        manager.start();
        downloads.start();
        timeline.start();
        timeline.scan();
        window.addEventListener('pagehide', handlePageHide);
        if (loadError) manager.showMessage(`设置读取失败，暂用默认设置：${loadError.message}`);
    }

    function handlePageHide(event) {
        // The browser resumes cached pages with their existing services.
        if (!event.persisted) destroy();
    }

    function destroy() {
        initialized = false;
        lifecycleToken++;
        document.removeEventListener('DOMContentLoaded', init);
        window.removeEventListener('pagehide', handlePageHide);
        timeline.destroy();
        downloads.destroy();
        manager.destroy();
    }

    BetterX.contentApp = { init, destroy };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
