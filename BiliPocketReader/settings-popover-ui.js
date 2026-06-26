// Bilibili Toolbox - settings popover UI
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

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
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

    function createSettingsPopoverPanel() {
        if (document.getElementById('bilibili-toolbox-settings-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-toolbox-settings-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>\u5de5\u5177\u7bb1\u8bbe\u7f6e</span></div>
            <div class="bilibili-toolbox-control-content">
                <section class="bilibili-toolbox-control-section">
                    <div class="bilibili-toolbox-section-title">\u6536\u85cf\u663e\u793a</div>
                    <div class="bilibili-toolbox-control-row bilibili-toolbox-control-row-stack">
                        <span class="bilibili-toolbox-control-copy">
                            <span class="bilibili-toolbox-control-title">\u6bcf\u884c\u6536\u85cf\u4e2a\u6570</span>
                            <span class="bilibili-toolbox-control-desc">\u8c03\u6574\u6536\u85cf\u9762\u677f\u7684\u6392\u5217\u5bc6\u5ea6</span>
                        </span>
                        <span class="bilibili-toolbox-segmented bilibili-toolbox-favorite-columns" role="group" aria-label="\u6bcf\u884c\u6536\u85cf\u4e2a\u6570">
                            ${Shared.FAVORITE_COLUMN_OPTIONS.map(columns => `<button type="button" data-columns="${columns}">${columns}</button>`).join('')}
                        </span>
                    </div>
                </section>
                <section class="bilibili-toolbox-control-section">
                    <div class="bilibili-toolbox-section-title">\u52a8\u6001\u8fc7\u6ee4</div>
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
                </section>
            </div>
            <div class="bilibili-toolbox-control-actions">
                <button class="bilibili-toolbox-export-btn">\u5bfc\u51fa\u6536\u85cf</button>
                <button class="bilibili-toolbox-import-btn">\u5bfc\u5165\u6536\u85cf</button>
            </div>
        `;
        document.body.appendChild(panel);

        eventBag.on(panel.querySelector('.bilibili-toolbox-forward-toggle'), 'change', async (event) => {
            await storage.setSetting(TOOLBOX_SETTINGS.hideForwardDynamics, Boolean(event.target.checked));
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-toggle'), 'change', (event) => {
            const enabled = Boolean(event.target.checked);
            dynamicFilter.setKeywordFilterState({ enabled });
            renderSettingsPopoverPanel();
            if (enabled) {
                window.setTimeout(() => panel.querySelector('.bilibili-toolbox-keyword-input')?.focus(), 0);
            }
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-input'), 'input', (event) => {
            dynamicFilter.setKeywordFilterState({ text: event.target.value });
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-favorite-columns'), 'click', async (event) => {
            const button = event.target.closest('button[data-columns]');
            if (!button) return;
            const columns = Shared.normalizeFavoriteColumns(button.dataset.columns);
            await storage.setSetting(TOOLBOX_SETTINGS.favoriteColumns, columns);
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-export-btn'), 'click', exportFavorites);
        eventBag.on(panel.querySelector('.bilibili-toolbox-import-btn'), 'click', importFavorites);

        renderSettingsPopoverPanel();
    }

    function isSettingsPopoverPanelVisible() {
        return document.getElementById('bilibili-toolbox-settings-panel')?.classList.contains('show');
    }

    function renderSettingsPopoverPanel() {
        const panel = document.getElementById('bilibili-toolbox-settings-panel');
        if (!panel || !dynamicFilter) return;

        const forwardEnabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics));
        const favoriteColumns = getSettingValue(
            TOOLBOX_SETTINGS.favoriteColumns,
            Shared.DEFAULT_FAVORITE_COLUMNS
        );
        const keywordState = dynamicFilter.getKeywordFilterState();
        const keywordInput = panel.querySelector('.bilibili-toolbox-keyword-input');
        panel.querySelector('.bilibili-toolbox-forward-toggle').checked = forwardEnabled;
        panel.querySelector('.bilibili-toolbox-keyword-toggle').checked = keywordState.enabled;
        panel.querySelectorAll('.bilibili-toolbox-favorite-columns button').forEach(button => {
            const active = Number(button.dataset.columns) === favoriteColumns;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        if (keywordInput.value !== keywordState.text) keywordInput.value = keywordState.text;
        panel.querySelector('.bilibili-toolbox-control-status').textContent = getDynamicControlsStatus(forwardEnabled, keywordState);
    }

    function showSettingsPopoverPanel() {
        createSettingsPopoverPanel();
        hidePanel('bilibili-fav-panel');
        document.getElementById('bilibili-toolbox-settings-panel')?.classList.add('show');
        renderSettingsPopoverPanel();
    }

    function toggleSettingsPopoverPanel() {
        if (isSettingsPopoverPanelVisible()) {
            hidePanel('bilibili-toolbox-settings-panel');
            return;
        }
        showSettingsPopoverPanel();
    }

    function initSettingsPopoverUi(options) {
        storage = options.storage;
        favoritesService = options.favoritesService;
        dynamicFilter = options.dynamicFilter;
        eventBag = options.eventBag;
        showMessage = options.showMessage || showMessage;
        dataProvider = typeof options.getData === 'function' ? options.getData : dataProvider;
        createSettingsPopoverPanel();
    }

    function destroySettingsPopoverUi() {
        Toolbox.favoritesTextDialog.close();
        document.getElementById('bilibili-toolbox-settings-panel')?.remove();
        storage = null;
        favoritesService = null;
        dynamicFilter = null;
        eventBag = null;
        showMessage = () => {};
        dataProvider = () => Shared.createDefaultData();
    }

    Toolbox.settingsPopoverUi = {
        init: initSettingsPopoverUi,
        render: renderSettingsPopoverPanel,
        toggle: toggleSettingsPopoverPanel,
        destroy: destroySettingsPopoverUi,
        getStatus: getDynamicControlsStatus
    };
})();
