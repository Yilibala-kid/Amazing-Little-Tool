// Bilibili Toolbox - reader DOM creation
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;

    function createButton(text, title, className = 'comic-btn') {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.title = title;
        btn.className = className;
        return btn;
    }

    function createSettingsButton(title, preferenceKey) {
        const button = createButton('', '', 'comic-setting-btn');
        button.type = 'button';
        button.dataset.settingLabel = title;
        button.dataset.preferenceKey = preferenceKey;
        const label = document.createElement('span');
        label.className = 'comic-setting-label';
        label.textContent = title;
        const value = document.createElement('span');
        value.className = 'comic-setting-value';
        button.append(label, value);
        return button;
    }

    function createReaderUi(reader) {
        reader.el.reader = document.createElement('div');
        reader.el.reader.id = 'comic-reader-overlay';

        reader.el.imgContainer = document.createElement('div');
        reader.el.imgContainer.className = 'comic-img-container';

        reader.el.controls = document.createElement('div');
        reader.el.controls.className = 'comic-controls';

        reader.el.settingsControls = document.createElement('div');
        reader.el.settingsControls.className = 'comic-settings-controls';

        reader.el.settingsPanel = document.createElement('div');
        reader.el.settingsPanel.className = 'comic-settings-panel';
        reader.el.settingsPanel.setAttribute('aria-hidden', 'true');
        reader.el.settingsPanel.setAttribute('role', 'dialog');
        reader.el.settingsPanel.setAttribute('aria-label', '阅读设置');

        const row = document.createElement('div');
        row.className = 'comic-reader-row';
        const secondRow = document.createElement('div');
        secondRow.className = 'comic-reader-row comic-reader-row-wrap';

        [
            ['rightBtn', '\u2192', '\u5411\u53f3\u7ffb\u9875', 'comic-btn'],
            ['leftBtn', '\u2190', '\u5411\u5de6\u7ffb\u9875', 'comic-btn'],
            ['offsetIncBtn', '<', '\u5de6\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['offsetDecBtn', '>', '\u53f3\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['resetViewBtn', '\u91cd\u7f6e', '\u91cd\u7f6e\u89c6\u56fe', 'comic-btn comic-btn-alt'],
            ['screenshotBtn', '\u622a\u56fe', '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4', 'comic-btn comic-btn-alt'],
            ['fullScreenBtn', '', '', 'comic-btn comic-btn-alt'],
            ['rotateBtn', '', '', 'comic-btn comic-btn-alt'],
            ['settingsBtn', '\u8bbe\u7f6e', '\u6253\u5f00\u9605\u8bfb\u5668\u8bbe\u7f6e', 'comic-btn comic-btn-alt'],
            ['closeBtn', '\u9000\u51fa', '\u9000\u51fa', 'comic-btn']
        ].forEach(([key, text, title, style]) => {
            reader.el[key] = createButton(text, title, style);
        });
        const settingsTitle = document.createElement('h2');
        settingsTitle.className = 'comic-settings-heading';
        settingsTitle.textContent = '阅读设置';
        const settingsHint = document.createElement('p');
        settingsHint.className = 'comic-settings-hint';
        settingsHint.textContent = '点击切换 · 自动保存';
        const settingsGrid = document.createElement('div');
        settingsGrid.className = 'comic-settings-grid';
        [
            ['imageRenderBtn', '显示质量', 'imageRenderMode'],
            ['filterBtn', '图像滤镜', 'filterMode'],
            ['preloadBtn', '漫画预加载', 'preloadPages'],
            ['imageMemoryBtn', '图片内存', 'imageMemoryPolicy'],
            ['backgroundBtn', '背景颜色', 'backgroundMode'],
            ['animationBtn', '翻页动画', 'animationMode'],
            ['viewModeBtn', '显示张数', 'viewMode'],
            ['tapPageBtn', '点击翻页', 'tapPageNavigation'],
            ['directionBtn', '阅读方向', 'isRightToLeft']
        ].forEach(([key, title, preferenceKey]) => {
            reader.el[key] = createSettingsButton(title, preferenceKey);
            settingsGrid.appendChild(reader.el[key]);
        });
        reader.el.settingsPanel.append(settingsTitle, settingsHint, settingsGrid);

        reader.el.pageInfo = document.createElement('span');
        reader.el.pageInfo.className = 'comic-page-info';
        reader.el.pageInfo.title = '\u70b9\u51fb\u8f93\u5165\u9875\u7801';

        reader.el.pageDisplay = document.createElement('span');
        reader.el.pageDisplay.className = 'comic-page-display';

        reader.el.pageInput = document.createElement('input');
        reader.el.pageInput.className = 'comic-page-input';
        reader.el.pageInput.type = 'text';
        reader.el.pageInput.inputMode = 'numeric';
        reader.el.pageInput.pattern = '[0-9]*';
        reader.el.pageInput.autocomplete = 'off';
        reader.el.pageInput.spellcheck = false;
        reader.el.pageInput.title = '\u8f93\u5165\u9875\u7801\u540e\u56de\u8f66\u8df3\u8f6c';

        reader.el.pageRange = document.createElement('span');
        reader.el.pageRange.className = 'comic-page-range';
        reader.el.pageInfo.append(reader.el.pageDisplay, reader.el.pageInput, reader.el.pageRange);

        reader.el.toast = document.createElement('div');
        reader.el.toast.className = 'comic-toast';

        reader.el.selectionOverlay = document.createElement('div');
        reader.el.selectionOverlay.className = 'comic-selection-overlay';

        reader.el.selectionHint = document.createElement('div');
        reader.el.selectionHint.className = 'comic-selection-hint';
        reader.el.selectionHint.textContent = '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58';

        reader.el.selectionToolbar = document.createElement('div');
        reader.el.selectionToolbar.className = 'comic-selection-toolbar';

        reader.el.selectionCancelBtn = document.createElement('button');
        reader.el.selectionCancelBtn.type = 'button';
        reader.el.selectionCancelBtn.innerText = '\u53d6\u6d88\u622a\u56fe';
        reader.el.selectionCancelBtn.className = 'comic-selection-action comic-selection-cancel';

        reader.el.selectionSaveBtn = document.createElement('button');
        reader.el.selectionSaveBtn.type = 'button';
        reader.el.selectionSaveBtn.innerText = '\u4fdd\u5b58\u622a\u56fe';
        reader.el.selectionSaveBtn.className = 'comic-selection-action comic-selection-save';

        reader.el.selectionFullBtn = document.createElement('button');
        reader.el.selectionFullBtn.type = 'button';
        reader.el.selectionFullBtn.innerText = '\u4fdd\u5b58\u5168\u56fe';
        reader.el.selectionFullBtn.className = 'comic-selection-action comic-selection-full';

        reader.el.selectionBox = document.createElement('div');
        reader.el.selectionBox.className = 'comic-selection-box';

        const handleCursors = {
            nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
            e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
            sw: 'nesw-resize', w: 'ew-resize'
        };
        for (const [dir, cursor] of Object.entries(handleCursors)) {
            const h = document.createElement('div');
            h.className = 'comic-sel-handle';
            h.dataset.dir = dir;
            h.style.cursor = cursor;
            reader.el.selectionBox.appendChild(h);
            reader.selectionHandles[dir] = h;
        }

        reader.el.selectionToolbar.append(reader.el.selectionFullBtn, reader.el.selectionSaveBtn, reader.el.selectionCancelBtn);
        reader.el.selectionOverlay.append(reader.el.selectionHint, reader.el.selectionToolbar, reader.el.selectionBox);

        row.append(reader.el.leftBtn, reader.el.offsetIncBtn, reader.el.pageInfo, reader.el.offsetDecBtn, reader.el.rightBtn);
        secondRow.append(reader.el.resetViewBtn, reader.el.fullScreenBtn);
        reader.el.controls.append(row, secondRow);

        reader.el.settingsControls.append(reader.el.closeBtn, reader.el.screenshotBtn, reader.el.rotateBtn, reader.el.settingsBtn);

        reader.el.reader.append(reader.el.imgContainer, reader.el.controls, reader.el.settingsControls, reader.el.settingsPanel, reader.el.toast, reader.el.selectionOverlay);

        document.body.appendChild(reader.el.reader);
        reader.updateDirection();
        reader.syncDirectionButton();
        reader.syncAnimationButton();
        reader.syncViewModeButton();
        reader.syncImageRenderButton();
        reader.syncFilterControl();
        reader.syncPreloadControl();
        reader.syncImageMemoryControl();
        reader.syncBackgroundButton();
        reader.syncTapPageButton();
        reader.syncRotateButton();
        reader.syncFullscreenButton();
        reader.applyReaderBackground();
        reader.applyReaderFilter();
        reader.applyResponsiveLayout();
    }

    function attach(reader) {
        reader.createUI = () => createReaderUi(reader);
        return reader;
    }

    Toolbox.readerDom = {
        attach,
        create: createReaderUi
    };
})();
