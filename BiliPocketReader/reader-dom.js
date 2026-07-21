// Bilibili Toolbox - reader DOM creation
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const animations = Toolbox.animations;

    function createButton(text, title, className = 'comic-btn') {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.title = title;
        btn.className = className;
        return btn;
    }

    function createSettingsRow(title, desc, control) {
        const item = document.createElement('div');
        item.className = 'comic-settings-item';
        const copy = document.createElement('div');
        copy.className = 'comic-settings-copy';
        const titleEl = document.createElement('div');
        titleEl.className = 'comic-settings-title';
        titleEl.textContent = title;
        const descEl = document.createElement('div');
        descEl.className = 'comic-settings-desc';
        descEl.textContent = desc;
        const action = document.createElement('div');
        action.className = 'comic-settings-action';
        copy.append(titleEl, descEl);
        action.append(control);
        item.append(copy, action);
        return item;
    }

    function createCompactSettingsItem(title, control) {
        const item = document.createElement('div');
        item.className = 'comic-settings-inline-item';
        const titleEl = document.createElement('div');
        titleEl.className = 'comic-settings-title';
        titleEl.textContent = title;
        const action = document.createElement('div');
        action.className = 'comic-settings-action';
        action.append(control);
        item.append(titleEl, action);
        return item;
    }

    function createInlineSettingsGroup(items) {
        const group = document.createElement('div');
        group.className = 'comic-settings-inline-group';
        items.forEach(item => group.appendChild(item));
        return group;
    }

    function createFilterSelect() {
        const select = document.createElement('select');
        select.className = 'comic-settings-select';
        select.setAttribute('aria-label', '\u56fe\u50cf\u6ee4\u955c');
        [
            ['original', '\u539f\u56fe'],
            ['soft', '\u67d4\u548c'],
            ['warm', '\u6696\u8272\u62a4\u773c'],
            ['grayscale', '\u9ed1\u767d']
        ].forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        });
        return select;
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

        reader.el.filterSelect = createFilterSelect();

        const row = document.createElement('div');
        row.className = 'comic-reader-row';
        const secondRow = document.createElement('div');
        secondRow.className = 'comic-reader-row comic-reader-row-wrap';

        [
            ['rightBtn', '\u2192', '\u5411\u53f3\u7ffb\u9875', 'comic-btn'],
            ['leftBtn', '\u2190', '\u5411\u5de6\u7ffb\u9875', 'comic-btn'],
            ['offsetIncBtn', '<', '\u5de6\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['offsetDecBtn', '>', '\u53f3\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['directionBtn', '', '', 'comic-btn comic-btn-alt'],
            ['animationBtn', '', '', 'comic-btn comic-btn-alt'],
            ['viewModeBtn', '', '', 'comic-btn comic-btn-alt'],
            ['imageRenderBtn', '', '', 'comic-btn comic-btn-alt'],
            ['backgroundBtn', '', '', 'comic-btn comic-btn-alt'],
            ['tapPageBtn', '', '', 'comic-btn comic-btn-alt'],
            ['resetViewBtn', '\u91cd\u7f6e', '\u91cd\u7f6e\u89c6\u56fe', 'comic-btn comic-btn-alt'],
            ['screenshotBtn', '\u622a\u56fe', '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4', 'comic-btn comic-btn-alt'],
            ['fullScreenBtn', '', '', 'comic-btn comic-btn-alt'],
            ['rotateBtn', '', '', 'comic-btn comic-btn-alt'],
            ['settingsBtn', '\u8bbe\u7f6e', '\u6253\u5f00\u9605\u8bfb\u5668\u8bbe\u7f6e', 'comic-btn comic-btn-alt'],
            ['closeBtn', '\u9000\u51fa', '\u9000\u51fa', 'comic-btn']
        ].forEach(([key, text, title, style]) => {
            reader.el[key] = createButton(text, title, style);
        });

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
        reader.el.settingsPanel.append(
            createSettingsRow('\u663e\u793a\u8d28\u91cf', '\u539f\u56fe\u66f4\u6e05\u6670\uff1b\u6d41\u7545\u6a21\u5f0f\u7f29\u653e\u66f4\u987a\u6ed1\u3002', reader.el.imageRenderBtn),
            createSettingsRow('\u56fe\u50cf\u6ee4\u955c', '\u4ec5\u5f71\u54cd\u663e\u793a\uff0c\u4e0d\u5f71\u54cd\u539f\u56fe\u548c\u622a\u56fe\u3002', reader.el.filterSelect),
            createInlineSettingsGroup([
                createCompactSettingsItem('\u80cc\u666f\u989c\u8272', reader.el.backgroundBtn),
                createCompactSettingsItem('\u7ffb\u9875\u52a8\u753b', reader.el.animationBtn),
                createCompactSettingsItem('\u663e\u793a\u5f20\u6570', reader.el.viewModeBtn)
            ]),
            createSettingsRow('\u70b9\u51fb\u7ffb\u9875\uff08\u4ec5\u79fb\u52a8\u7aef\uff09', '\u5f00\u542f\u540e\uff0c\u70b9\u51fb\u5c4f\u5e55\u4e24\u4fa7\u7ffb\u9875\u3002', reader.el.tapPageBtn),
            createSettingsRow('\u9605\u8bfb\u65b9\u5411', '\u5207\u6362\u4ece\u53f3\u5230\u5de6\u6216\u4ece\u5de6\u5230\u53f3\u3002', reader.el.directionBtn)
        );

        reader.el.reader.append(reader.el.imgContainer, reader.el.controls, reader.el.settingsControls, reader.el.settingsPanel, reader.el.toast, reader.el.selectionOverlay);

        document.body.appendChild(reader.el.reader);
        reader.updateDirection();
        reader.syncDirectionButton();
        animations.syncAnimationButton(reader.el.animationBtn, reader.animationMode);
        reader.syncViewModeButton();
        reader.syncImageRenderButton();
        reader.syncFilterControl();
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
