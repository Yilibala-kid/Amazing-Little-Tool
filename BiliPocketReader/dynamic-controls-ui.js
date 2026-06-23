// Bilibili Toolbox - dynamic filtering controls UI
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.favoritesTextDialog) throw new Error('BilibiliToolbox: favorites-text-dialog.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;

    let dataProvider = () => Shared.createDefaultData();
    let storage = null;
    let favoritesService = null;
    let dynamicFilter = null;
    let eventBag = null;
    let showMessage = () => {};
    let renderFavoriteList = () => {};
    let syncFloatButton = () => {};

    function getSettingValue(key, fallback = false) {
        const data = Shared.normalizeToolboxData(dataProvider());
        return Object.prototype.hasOwnProperty.call(data.settings, key)
            ? data.settings[key]
            : fallback;
    }

    function hidePanel(id) {
        document.getElementById(id)?.classList.remove('show');
    }

    function exportFavorites() {
        const data = Shared.normalizeToolboxData(dataProvider());
        if (!data.favorites.length) {
            showMessage('\u6682\u65e0\u53ef\u5bfc\u51fa\u7684\u6536\u85cf', true);
            return;
        }

        Toolbox.favoritesTextDialog.show({
            title: '\u5bfc\u51fa\u6536\u85cf\u6587\u672c',
            text: favoritesService.createExportText(data),
            readOnly: true,
            clipboardAction: 'copy'
        });
    }

    function importFavorites() {
        Toolbox.favoritesTextDialog.show({
            title: '\u5bfc\u5165\u6536\u85cf\u6587\u672c',
            clipboardAction: 'paste',
            confirmText: '\u5bfc\u5165',
            onConfirm: async ({ text, close, setStatus }) => {
                const imported = favoritesService.normalizeImportedFavorites(text);

                if (!imported?.length) {
                    setStatus('\u672a\u8bfb\u53d6\u5230\u6709\u6548\u6536\u85cf', true);
                    return;
                }

                try {
                    const result = await favoritesService.importFavorites(imported);
                    renderFavoriteList();
                    close();
                    showMessage(`\u5bfc\u5165 ${result.added} \u6761\uff0c\u66f4\u65b0 ${result.updated} \u6761\uff0c\u8df3\u8fc7 ${result.skipped} \u6761`);
                } catch (_) {
                    setStatus('\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', true);
                }
            }
        });
    }

    function getDynamicControlsStatus(forwardEnabled, keywordState, isDynamicPage = dynamicFilter?.isSpaceDynamicPage?.()) {
        if (!isDynamicPage) return '\u5728\u7528\u6237\u52a8\u6001\u9875\u751f\u6548';

        const states = [];
        if (forwardEnabled) states.push('\u5df2\u9690\u85cf\u8f6c\u53d1\u52a8\u6001');
        if (keywordState.enabled && !keywordState.hasKeyword) states.push('\u8bf7\u8f93\u5165\u5173\u952e\u8bcd\u540e\u5f00\u59cb\u7b5b\u9009');
        if (keywordState.isActive) states.push(`\u4ec5\u663e\u793a\u5305\u542b\u201c${keywordState.displayText}\u201d\u7684\u52a8\u6001`);
        return states.length ? states.join('\uff1b') : '\u5df2\u663e\u793a\u5168\u90e8\u52a8\u6001';
    }

    function createDynamicControlsPanel() {
        if (document.getElementById('bilibili-fav-controls-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-controls-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>\u52a8\u6001\u63a7\u5236</span></div>
            <div class="bilibili-toolbox-control-content">
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">\u9690\u85cf\u8f6c\u53d1\u52a8\u6001</span>
                        <span class="bilibili-toolbox-control-desc">\u4ec5\u5728\u7528\u6237\u52a8\u6001\u9875\u751f\u6548</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-forward-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <label class="bilibili-toolbox-control-row">
                    <span class="bilibili-toolbox-control-copy">
                        <span class="bilibili-toolbox-control-title">\u5173\u952e\u8bcd\u7b5b\u9009\u52a8\u6001</span>
                        <span class="bilibili-toolbox-control-desc">\u4ec5\u663e\u793a\u5305\u542b\u8f93\u5165\u5185\u5bb9\u7684\u52a8\u6001</span>
                    </span>
                    <span class="bilibili-toolbox-switch">
                        <input type="checkbox" class="bilibili-toolbox-keyword-toggle">
                        <span class="bilibili-toolbox-switch-slider"></span>
                    </span>
                </label>
                <input type="text" class="bilibili-toolbox-keyword-input" placeholder="\u8f93\u5165\u8981\u5305\u542b\u7684\u5185\u5bb9" autocomplete="off" spellcheck="false">
                <div class="bilibili-toolbox-control-status"></div>
            </div>
            <div class="bilibili-toolbox-control-actions">
                <button class="bilibili-toolbox-export-btn">\u5bfc\u51fa\u6536\u85cf</button>
                <button class="bilibili-toolbox-import-btn">\u5bfc\u5165\u6536\u85cf</button>
            </div>
        `;
        document.body.appendChild(panel);

        eventBag.on(panel.querySelector('.bilibili-toolbox-forward-toggle'), 'change', async (event) => {
            await storage.setSetting(TOOLBOX_SETTINGS.hideForwardDynamics, Boolean(event.target.checked));
            syncFloatButton();
            dynamicFilter.sync();
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-toggle'), 'change', (event) => {
            const enabled = Boolean(event.target.checked);
            dynamicFilter.setKeywordFilterState({ enabled });
            renderDynamicControlsPanel();
            if (enabled) {
                window.setTimeout(() => panel.querySelector('.bilibili-toolbox-keyword-input')?.focus(), 0);
            }
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-input'), 'input', (event) => {
            dynamicFilter.setKeywordFilterState({ text: event.target.value });
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-export-btn'), 'click', exportFavorites);
        eventBag.on(panel.querySelector('.bilibili-toolbox-import-btn'), 'click', importFavorites);

        renderDynamicControlsPanel();
    }

    function isDynamicControlsPanelVisible() {
        return document.getElementById('bilibili-fav-controls-panel')?.classList.contains('show');
    }

    function renderDynamicControlsPanel() {
        const panel = document.getElementById('bilibili-fav-controls-panel');
        if (!panel || !dynamicFilter) return;

        const forwardEnabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics));
        const keywordState = dynamicFilter.getKeywordFilterState();
        const keywordInput = panel.querySelector('.bilibili-toolbox-keyword-input');
        panel.querySelector('.bilibili-toolbox-forward-toggle').checked = forwardEnabled;
        panel.querySelector('.bilibili-toolbox-keyword-toggle').checked = keywordState.enabled;
        if (keywordInput.value !== keywordState.text) keywordInput.value = keywordState.text;
        panel.querySelector('.bilibili-toolbox-control-status').textContent = getDynamicControlsStatus(forwardEnabled, keywordState);
        syncFloatButton();
    }

    function showDynamicControlsPanel() {
        createDynamicControlsPanel();
        hidePanel('bilibili-fav-panel');
        document.getElementById('bilibili-fav-controls-panel')?.classList.add('show');
        renderDynamicControlsPanel();
    }

    function toggleDynamicControlsPanel() {
        if (isDynamicControlsPanelVisible()) {
            hidePanel('bilibili-fav-controls-panel');
            return;
        }
        showDynamicControlsPanel();
    }

    function initDynamicControlsUi(options) {
        storage = options.storage;
        favoritesService = options.favoritesService;
        dynamicFilter = options.dynamicFilter;
        eventBag = options.eventBag;
        showMessage = options.showMessage || showMessage;
        renderFavoriteList = options.renderFavoriteList || renderFavoriteList;
        syncFloatButton = options.syncFloatButton || syncFloatButton;
        dataProvider = typeof options.getData === 'function' ? options.getData : dataProvider;
        createDynamicControlsPanel();
    }

    function destroyDynamicControlsUi() {
        Toolbox.favoritesTextDialog.close();
        document.getElementById('bilibili-fav-controls-panel')?.remove();
        storage = null;
        favoritesService = null;
        dynamicFilter = null;
        eventBag = null;
        showMessage = () => {};
        renderFavoriteList = () => {};
        syncFloatButton = () => {};
        dataProvider = () => Shared.createDefaultData();
    }

    Toolbox.dynamicControlsUi = {
        init: initDynamicControlsUi,
        render: renderDynamicControlsPanel,
        toggle: toggleDynamicControlsPanel,
        destroy: destroyDynamicControlsUi,
        getStatus: getDynamicControlsStatus
    };
})();
