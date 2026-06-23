// Bilibili Toolbox - Comic Reader
(function() {
    'use strict';

    // ============ 常量定义 ============
    const COMIC_URL_PATTERNS = [
        'bilibili.com/read/',
        'bilibili.com/opus/',
        't.bilibili.com/'
    ];
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.1;
    const DOUBLE_CLICK_SCALE = 2;
    const MAX_RENDER_SCALE = 2;
    const CONTROLS_HIDE_DELAY = 500;
    const SWIPE_THRESHOLD = 50;
    const TAP_DELAY = 220;
    const DOUBLE_TAP_DELAY = 300;
    const TAP_ZONE_RATIO = 0.28;
    const TOUCH_ZOOM_EPSILON = 0.01;
    const TOUCH_EDGE_EPSILON = 0.5;
    const PAN_EDGE_ALLOWANCE = 72;
    const PRELOAD_COUNT = 4;
    const MOBILE_BREAKPOINT = 768;
    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');
    if (!window.BilibiliToolbox?.readerScreenshot) throw new Error('BilibiliToolbox: reader-screenshot.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const Shared = window.Shared;
    const animations = Toolbox.animations;
    const comicImages = Toolbox.comicImages;
    const readerPreferences = Toolbox.readerPreferences;
    const readerScreenshot = Toolbox.readerScreenshot;
    const VIEW_MODES = readerPreferences.VIEW_MODES;
    const IMAGE_RENDER_MODES = readerPreferences.IMAGE_RENDER_MODES;

    // ============ 漫画模式功能 ============

    class BiliComicReader {
        normalizePreferences(value = {}) {
            return readerPreferences.normalize(value);
        }

        loadPreferences() {
            return readerPreferences.load();
        }

        savePreferences() {
            const preferences = this.normalizePreferences({
                isRightToLeft: this.isRightToLeft,
                viewMode: this.viewMode,
                animationMode: this.animationMode,
                imageRenderMode: this.imageRenderMode,
                tapPageNavigation: this.tapPageNavigation
            });
            void readerPreferences.save(preferences).catch(() => {});
        }

        constructor() {
            const preferences = this.loadPreferences();
            // 状态管理
            this.imgList = [];
            this.currentIndex = 0;
            this.lastStep = 2;
            this.isRightToLeft = preferences.isRightToLeft;
            this.scale = 1;
            this.fitScale = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
            this.viewMode = preferences.viewMode;
            this.animationMode = preferences.animationMode;
            this.imageRenderMode = preferences.imageRenderMode;
            this.tapPageNavigation = preferences.tapPageNavigation;
            this.rotation = 0;
            this.activePageCount = 1;
            this.controlsVisible = true;
            this.isTouchDevice = Shared.isTouchLikeDevice();
            this.isCompactLayout = false;
            this.isSelectingScreenshot = false;
            this.isDraggingSelection = false;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.selectionWasControlsVisible = true;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionHandles = {};
            this.pageFlipToken = 0;
            this.transformTransitionTimer = null;

            // 拖拽状态
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.initX = 0;
            this.initY = 0;

            // 触摸滑动状态
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.touchEndX = 0;
            this.touchEndY = 0;
            this.isTouchSwiping = false;
            this.touchStartTime = 0;
            this.touchStartedOnInteractive = false;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.pendingTapTimer = null;
            this.lastTapTime = 0;
            this.lastTapX = 0;
            this.lastTapY = 0;

            // 双指缩放状态
            this.isTwoFingerGesturing = false;
            this.initialPinchDistance = 0;
            this.initialScale = 1;
            this.initialCenterX = 0;
            this.initialCenterY = 0;
            this.twoFingerTapCandidate = false;
            this.twoFingerTapStartTime = 0;
            this.twoFingerTapCenterX = 0;
            this.twoFingerTapCenterY = 0;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;

            // DOM 元素引用
            this.el = {};
            this.eventBag = null;

            // 绑定全局事件的 this 指向，便于后续解绑
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseUp = this.handleMouseUp.bind(this);
            this.boundHandleTouchStart = this.handleTouchStart.bind(this);
            this.boundHandleTouchMove = this.handleTouchMove.bind(this);
            this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
            this.handleSelectionPointerDown = this.handleSelectionPointerDown.bind(this);
            this.handleSelectionPointerMove = this.handleSelectionPointerMove.bind(this);
            this.handleSelectionPointerUp = this.handleSelectionPointerUp.bind(this);
            this.handleSettingsOutsidePointerDown = this.handleSettingsOutsidePointerDown.bind(this);
            this.handleResize = this.handleResize.bind(this);
        }

        // 1. 初始化入口按钮
        init() {
            const entryBtn = document.createElement('button');
            entryBtn.innerHTML = '&#128214;';
            entryBtn.className = `comic-entry-btn${this.isTouchDevice ? ' comic-entry-btn-touch' : ''}`;
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

        // 2. 启动阅读器
        start() {
            this.imgList = comicImages.collectImages();

            if (this.imgList.length === 0) return alert('\u672a\u627e\u5230\u6f2b\u753b\u56fe\u7247');

            this.currentIndex = 0;
            this.lastStep = 2;
            this.isDragging = false;
            this.animationMode = readerPreferences.normalizeAnimationMode(this.animationMode);

            // 隐藏收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = 'none';

            this.eventBag = Toolbox.createEventBag();
            this.createUI();
            this.bindEvents();
            this.render();
        }

        // 3. 创建 UI
        createUI() {
            const createBtn = (text, title, className = 'comic-btn') => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.title = title;
                btn.className = className;
                return btn;
            };

            this.el.reader = document.createElement('div');
            this.el.reader.id = 'comic-reader-overlay';

            this.el.imgContainer = document.createElement('div');
            this.el.imgContainer.className = 'comic-img-container';

            this.el.controls = document.createElement('div');
            this.el.controls.className = 'comic-controls';

            this.el.settingsControls = document.createElement('div');
            this.el.settingsControls.className = 'comic-settings-controls';

            this.el.settingsPanel = document.createElement('div');
            this.el.settingsPanel.className = 'comic-settings-panel';
            this.el.settingsPanel.setAttribute('aria-hidden', 'true');

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
                ['tapPageBtn', '', '', 'comic-btn comic-btn-alt'],
                ['resetViewBtn', '\u91cd\u7f6e', '\u91cd\u7f6e\u89c6\u56fe', 'comic-btn comic-btn-alt'],
                ['screenshotBtn', '\u622a\u56fe', '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4', 'comic-btn comic-btn-alt'],
                ['fullScreenBtn', '', '', 'comic-btn comic-btn-alt'],
                ['rotateBtn', '', '', 'comic-btn comic-btn-alt'],
                ['settingsBtn', '\u8bbe\u7f6e', '\u6253\u5f00\u9605\u8bfb\u5668\u8bbe\u7f6e', 'comic-btn comic-btn-alt'],
                ['closeBtn', '\u9000\u51fa', '\u9000\u51fa', 'comic-btn']
            ].forEach(([key, text, title, style]) => {
                this.el[key] = createBtn(text, title, style);
            });

            this.el.pageInfo = document.createElement('span');
            this.el.pageInfo.className = 'comic-page-info';
            this.el.pageInfo.title = '\u70b9\u51fb\u8f93\u5165\u9875\u7801';

            this.el.pageDisplay = document.createElement('span');
            this.el.pageDisplay.className = 'comic-page-display';

            this.el.pageInput = document.createElement('input');
            this.el.pageInput.className = 'comic-page-input';
            this.el.pageInput.type = 'text';
            this.el.pageInput.inputMode = 'numeric';
            this.el.pageInput.pattern = '[0-9]*';
            this.el.pageInput.autocomplete = 'off';
            this.el.pageInput.spellcheck = false;
            this.el.pageInput.title = '\u8f93\u5165\u9875\u7801\u540e\u56de\u8f66\u8df3\u8f6c';

            this.el.pageRange = document.createElement('span');
            this.el.pageRange.className = 'comic-page-range';
            this.el.pageInfo.append(this.el.pageDisplay, this.el.pageInput, this.el.pageRange);

            this.el.toast = document.createElement('div');
            this.el.toast.className = 'comic-toast';

            this.el.selectionOverlay = document.createElement('div');
            this.el.selectionOverlay.className = 'comic-selection-overlay';

            this.el.selectionHint = document.createElement('div');
            this.el.selectionHint.className = 'comic-selection-hint';
            this.el.selectionHint.textContent = '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58';

            this.el.selectionToolbar = document.createElement('div');
            this.el.selectionToolbar.className = 'comic-selection-toolbar';

            this.el.selectionCancelBtn = document.createElement('button');
            this.el.selectionCancelBtn.type = 'button';
            this.el.selectionCancelBtn.innerText = '\u53d6\u6d88\u622a\u56fe';
            this.el.selectionCancelBtn.className = 'comic-selection-action comic-selection-cancel';

            this.el.selectionSaveBtn = document.createElement('button');
            this.el.selectionSaveBtn.type = 'button';
            this.el.selectionSaveBtn.innerText = '\u4fdd\u5b58\u622a\u56fe';
            this.el.selectionSaveBtn.className = 'comic-selection-action comic-selection-save';

            this.el.selectionFullBtn = document.createElement('button');
            this.el.selectionFullBtn.type = 'button';
            this.el.selectionFullBtn.innerText = '\u4fdd\u5b58\u5168\u56fe';
            this.el.selectionFullBtn.className = 'comic-selection-action comic-selection-full';

            this.el.selectionBox = document.createElement('div');
            this.el.selectionBox.className = 'comic-selection-box';

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
                this.el.selectionBox.appendChild(h);
                this.selectionHandles[dir] = h;
            }

            this.el.selectionToolbar.append(this.el.selectionFullBtn, this.el.selectionSaveBtn, this.el.selectionCancelBtn);
            this.el.selectionOverlay.append(this.el.selectionHint, this.el.selectionToolbar, this.el.selectionBox);

            const createSettingsRow = (title, desc, control) => {
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
            };

            const settingsHeader = document.createElement('div');
            settingsHeader.className = 'comic-settings-panel-header';
            const settingsTitle = document.createElement('div');
            settingsTitle.className = 'comic-settings-panel-title';
            settingsTitle.textContent = '\u9605\u8bfb\u8bbe\u7f6e';
            const settingsDesc = document.createElement('div');
            settingsDesc.className = 'comic-settings-panel-desc';
            settingsDesc.textContent = '\u8c03\u6574\u663e\u793a\u3001\u7ffb\u9875\u548c\u9605\u8bfb\u4e60\u60ef\uff0c\u66f4\u6539\u4f1a\u81ea\u52a8\u4fdd\u5b58\u3002';
            settingsHeader.append(settingsTitle, settingsDesc);

            row.append(this.el.leftBtn, this.el.offsetIncBtn, this.el.pageInfo, this.el.offsetDecBtn, this.el.rightBtn);
            secondRow.append(this.el.resetViewBtn, this.el.fullScreenBtn);
            this.el.controls.append(row, secondRow);

            // 右上角设置按钮横向排列（退出在最上面）
            this.el.settingsControls.append(this.el.closeBtn, this.el.screenshotBtn, this.el.rotateBtn, this.el.settingsBtn);
            this.el.settingsPanel.append(
                settingsHeader,
                createSettingsRow('\u663e\u793a\u8d28\u91cf', '\u539f\u56fe\u4fdd\u7559\u7ec6\u8282\uff0c\u6d41\u7545\u51cf\u5c11\u7eb9\u7406\u95ea\u70c1\u3002', this.el.imageRenderBtn),
                createSettingsRow('\u7ffb\u9875\u52a8\u753b', '\u5728\u65e0\u52a8\u753b\u3001\u5e73\u6ed1\u548c\u6de1\u5165\u4e4b\u95f4\u5207\u6362\u3002', this.el.animationBtn),
                createSettingsRow('\u663e\u793a\u5f20\u6570', '\u81ea\u52a8\u5224\u65ad\u5355\u56fe\u6216\u53cc\u56fe\uff0c\u4e5f\u53ef\u624b\u52a8\u6307\u5b9a\u3002', this.el.viewModeBtn),
                createSettingsRow('\u70b9\u51fb\u7ffb\u9875\uff08\u4ec5\u79fb\u52a8\u7aef\uff09', '\u63a7\u5236\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u662f\u5426\u7ffb\u9875\u3002', this.el.tapPageBtn),
                createSettingsRow('\u9605\u8bfb\u65b9\u5411', '\u9002\u914d\u4ece\u53f3\u5f80\u5de6\u6216\u4ece\u5de6\u5f80\u53f3\u7684\u9605\u8bfb\u4e60\u60ef\u3002', this.el.directionBtn)
            );

            this.el.reader.append(this.el.imgContainer, this.el.controls, this.el.settingsControls, this.el.settingsPanel, this.el.toast, this.el.selectionOverlay);

            document.body.appendChild(this.el.reader);
            this.updateDirection();
            this.syncDirectionButton();
            animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
            this.syncViewModeButton();
            this.syncImageRenderButton();
            this.syncTapPageButton();
            this.syncRotateButton();
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        // 4. 缁戝畾浜嬩欢
        bindEvents() {
            const on = (...args) => this.eventBag.on(...args);
            const stop = (handler) => (e) => {
                e.stopPropagation();
                handler();
            };

            // Controls visibility 鈥?only the panels trigger show/hide, images don't
            on(this.el.controls, 'mouseenter', () => this.showControls());
            on(this.el.settingsControls, 'mouseenter', () => this.showControls());
            on(this.el.settingsPanel, 'mouseenter', () => this.showControls());
            on(this.el.controls, 'mouseleave', () => this.scheduleHideControls());
            on(this.el.settingsControls, 'mouseleave', () => this.scheduleHideControls());
            on(this.el.settingsPanel, 'mouseleave', () => this.scheduleHideControls());
            on(this.el.reader, 'mouseleave', () => this.scheduleHideControls());

            this.el.leftBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? this.lastStep : -this.lastStep);
            this.el.rightBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? -this.lastStep : this.lastStep);

            this.el.offsetIncBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? 1 : -1);
            this.el.offsetDecBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? -1 : 1);

            this.el.directionBtn.onclick = stop(() => {
                this.isRightToLeft = !this.isRightToLeft;
                this.updateDirection();
                this.syncDirectionButton();
                this.savePreferences();
            });

            this.el.animationBtn.onclick = stop(() => {
                this.animationMode = animations.getNextAnimationMode(this.animationMode);
                animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
                this.savePreferences();
            });

            this.el.viewModeBtn.onclick = stop(() => {
                const currentIdx = VIEW_MODES.indexOf(this.viewMode);
                this.viewMode = VIEW_MODES[(currentIdx + 1) % VIEW_MODES.length];
                this.syncViewModeButton();
                this.savePreferences();
                this.render(false);
            });

            this.el.imageRenderBtn.onclick = stop(() => {
                const currentIdx = IMAGE_RENDER_MODES.indexOf(this.imageRenderMode);
                this.imageRenderMode = IMAGE_RENDER_MODES[(currentIdx + 1) % IMAGE_RENDER_MODES.length];
                this.syncImageRenderButton();
                this.savePreferences();
                this.applyImageRenderMode();
                this.showReaderMessage(this.imageRenderMode === 'sharp' ? '\u539f\u56fe\u6a21\u5f0f' : '\u6d41\u7545\u6a21\u5f0f');
            });

            this.el.tapPageBtn.onclick = stop(() => {
                this.tapPageNavigation = !this.tapPageNavigation;
                this.syncTapPageButton();
                this.savePreferences();
                this.showReaderMessage(this.tapPageNavigation ? '\u70b9\u51fb\u7ffb\u9875\u5df2\u5f00\u542f' : '\u70b9\u51fb\u7ffb\u9875\u5df2\u5173\u95ed');
            });

            this.el.settingsBtn.onclick = stop(() => this.toggleSettingsPanel());

            this.el.resetViewBtn.onclick = stop(() => this.resetTransform());
            this.el.screenshotBtn.onclick = stop(() => this.startScreenshotSelection());

            this.el.fullScreenBtn.onclick = stop(() => this.toggleFullscreen());

            this.el.rotateBtn.onclick = stop(() => {
                this.rotation = (this.rotation + 90) % 360;
                this.syncRotateButton();
                this.render(false);
            });

            this.el.closeBtn.onclick = () => this.close();

            // 椤电爜璺宠浆
            on(this.el.pageInfo, 'click', (e) => {
                e.stopPropagation();
                this.showPageInput();
            });
            on(this.el.pageInput, 'focus', () => this.el.pageInput.select());
            on(this.el.pageInput, 'keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.jumpToPageFromInput();
                    this.el.pageInput.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hidePageInput();
                    this.el.pageInput.blur();
                }
            });
            on(this.el.pageInput, 'blur', () => this.jumpToPageFromInput());
            this.el.selectionCancelBtn.onclick = () => this.cancelScreenshotSelection(true);
            this.el.selectionFullBtn.onclick = () => { void this.saveFullScreenshot(); };
            this.el.selectionSaveBtn.onclick = () => { void this.saveSelectionScreenshot(); };
            on(this.el.selectionOverlay, 'pointerdown', this.handleSelectionPointerDown);
            on(this.el.selectionOverlay, 'pointermove', this.handleSelectionPointerMove);
            on(this.el.selectionOverlay, 'pointerup', this.handleSelectionPointerUp);
            on(this.el.selectionOverlay, 'pointercancel', this.handleSelectionPointerUp);
            on(this.el.reader, 'pointerdown', this.handleSettingsOutsidePointerDown, true);

            // 图片容器事件（翻页与拖拽起冲突）
            on(this.el.imgContainer, 'wheel', (e) => {
                e.preventDefault();
                this.animateTransform();
                this.zoomAt(e.clientX, e.clientY, this.scale + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP));
            }, { passive: false });

            on(this.el.imgContainer, 'dblclick', (e) => {
                e.preventDefault();
                this.animateTransform(220);
                if (Math.abs(this.scale - 1) < 0.05) {
                    this.zoomAt(e.clientX, e.clientY, this.getDoubleClickScale());
                    return;
                }
                this.resetScaleAndPan();
            });

            on(this.el.imgContainer, 'mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                this.setTransformTransition('none');
                this.isDragging = true;
                this.initX = this.translateX;
                this.initY = this.translateY;
                this.startX = e.clientX;
                this.startY = e.clientY;
                this.el.imgContainer.classList.add('is-grabbing');
            });

            on(this.el.imgContainer, 'mouseleave', () => {
                this.isDragging = false;
                this.el.imgContainer.classList.remove('is-grabbing');
            });

            // 注册全局事件（需要在退出时清理）
            on(document, 'mousemove', this.handleMouseMove);
            on(document, 'mouseup', this.handleMouseUp);
            on(document, 'fullscreenchange', this.handleFullscreenChange);
            on(window, 'keydown', this.handleKeyDown);
            on(window, 'resize', this.handleResize);

            // 触摸滑动事件（使用已经绑定的函数引用，便于后续解绑）
            on(this.el.reader, 'touchstart', this.boundHandleTouchStart, { passive: false });
            on(this.el.reader, 'touchmove', this.boundHandleTouchMove, { passive: false });
            on(this.el.reader, 'touchend', this.boundHandleTouchEnd, { passive: false });
            on(this.el.reader, 'touchcancel', this.boundHandleTouchEnd, { passive: false });
            this.showControls();
        }

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '\u4ece\u53f3\u5f80\u5de6 \u2190' : '\u4ece\u5de6\u5f80\u53f3 \u2192';
            this.el.directionBtn.title = dir ? '\u5f53\u524d\uff1a\u4ece\u53f3\u5f80\u5de6' : '\u5f53\u524d\uff1a\u4ece\u5de6\u5f80\u53f3';
        }

        syncViewModeButton() {
            const map = {
                auto: ['\u81ea\u52a8', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u81ea\u52a8'],
                single: ['\u5355\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u5355\u56fe'],
                double: ['\u53cc\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u53cc\u56fe']
            };
            const [text, title] = map[this.viewMode] || map.auto;
            Object.assign(this.el.viewModeBtn, { innerText: text, title });
        }

        syncImageRenderButton() {
            const sharp = this.imageRenderMode === 'sharp';
            this.el.imageRenderBtn.innerText = sharp ? '\u539f\u56fe' : '\u6d41\u7545';
            this.el.imageRenderBtn.title = sharp
                ? '\u663e\u793a\u6a21\u5f0f\uff1a\u539f\u56fe\uff08\u7ec6\u8282\u66f4\u597d\uff0c\u53ef\u80fd\u6709\u6469\u5c14\u7eb9\uff09'
                : '\u663e\u793a\u6a21\u5f0f\uff1a\u6d41\u7545\uff08\u6469\u5c14\u7eb9\u66f4\u5c11\uff0c\u653e\u5927\u540e\u7ec6\u8282\u7a0d\u8f6f\uff09';
            this.el.imageRenderBtn.classList.toggle('active', sharp);
        }

        syncTapPageButton() {
            const enabled = Boolean(this.tapPageNavigation);
            this.el.tapPageBtn.innerText = enabled ? '\u70b9\u51fb\u7ffb\u9875' : '\u70b9\u51fb\u5173\u95ed';
            this.el.tapPageBtn.title = enabled
                ? '\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09'
                : '\u70b9\u51fb\u5c4f\u5e55\u4e0d\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09';
            this.el.tapPageBtn.classList.toggle('active', enabled);
        }

        syncRotateButton() {
            const rot = this.rotation;
            this.el.rotateBtn.innerText = rot === 0 ? '\u65cb\u8f6c' : `${rot}\u5ea6`;
            this.el.rotateBtn.title = rot === 0 ? '\u65cb\u8f6c90\u5ea6' : `\u5f53\u524d\u65cb\u8f6c\uff1a${rot}\u5ea6`;
        }

        syncFullscreenButton() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '\u9000\u51fa\u5168\u5c4f' : '\u5168\u5c4f';
                this.el.fullScreenBtn.title = this.el.fullScreenBtn.innerText;
            }
        }

        isSettingsPanelVisible() {
            return Boolean(this.el.settingsPanel?.classList.contains('show'));
        }

        toggleSettingsPanel() {
            if (this.isSettingsPanelVisible()) {
                this.hideSettingsPanel();
                return;
            }
            this.showControls();
            this.el.settingsPanel.classList.add('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'false');
            this.el.settingsBtn.classList.add('active');
        }

        hideSettingsPanel() {
            if (!this.el.settingsPanel) return;
            this.el.settingsPanel.classList.remove('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'true');
            this.el.settingsBtn?.classList.remove('active');
        }

        handleSettingsOutsidePointerDown(e) {
            if (!this.isSettingsPanelVisible()) return;
            const target = e.target instanceof Element ? e.target : null;
            if (target && (this.el.settingsPanel.contains(target) || this.el.settingsBtn.contains(target))) return;
            this.hideSettingsPanel();
        }

        toggleFullscreen() {
            if (!this.el.reader?.requestFullscreen || document.fullscreenEnabled === false) {
                this.showReaderMessage('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u7f51\u9875\u5168\u5c4f', true, 2600);
                return;
            }
            if (!document.fullscreenElement) {
                this.el.reader.requestFullscreen().catch(() => {
                    this.showReaderMessage('\u5168\u5c4f\u5f00\u542f\u5931\u8d25\uff0c\u53ef\u80fd\u53d7\u6d4f\u89c8\u5668\u9650\u5236', true, 2600);
                });
            } else {
                document.exitFullscreen().catch(() => {
                    this.showReaderMessage('\u9000\u51fa\u5168\u5c4f\u5931\u8d25', true, 2200);
                });
            }
        }

        isCompactViewport() {
            return window.innerWidth < MOBILE_BREAKPOINT || this.isTouchDevice;
        }

        applyResponsiveLayout() {
            this.isCompactLayout = this.isCompactViewport();
            this.el.reader.classList.toggle('reader-compact', this.isCompactLayout);
            this.updateFitScale();
            this.applyTransform();
        }

        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        }

        getReaderPoint(clientX, clientY) {
            const rect = this.el.reader.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, clientY - rect.top))
            };
        }

        normalizeSelectionRect(start = this.selectionStart, end = this.selectionCurrent) {
            if (!start || !end) return null;
            return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        }

        hasValidSelection(rect = this.normalizeSelectionRect()) {
            return Boolean(rect && rect.width >= 8 && rect.height >= 8);
        }

        updateSelectionActions() {
            const hasSelection = this.hasValidSelection();
            this.el.selectionSaveBtn.disabled = !hasSelection;
            this.el.selectionSaveBtn.classList.toggle('is-disabled', !hasSelection);
        }

        updateSelectionBox() {
            const rect = this.normalizeSelectionRect();
            if (!rect) {
                this.el.selectionBox.style.display = 'none';
                this._hideHandles();
                return;
            }
            Object.assign(this.el.selectionBox.style, {
                display: 'block', left: `${rect.x}px`, top: `${rect.y}px`,
                width: `${rect.width}px`, height: `${rect.height}px`
            });
            const valid = this.hasValidSelection(rect);
            const w = rect.width, h = rect.height;
            const pos = { nw: [0,0], n: [w/2,0], ne: [w,0], e: [w,h/2], se: [w,h], s: [w/2,h], sw: [0,h], w: [0,h/2] };
            for (const [dir, [x, y]] of Object.entries(pos)) {
                const el = this.selectionHandles[dir];
                if (!el) continue;
                el.style.display = valid ? 'block' : 'none';
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            }
        }

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this._hideHandles();
            this.updateSelectionActions();
        }

        _hideHandles() {
            for (const h of Object.values(this.selectionHandles)) {
                h.style.display = 'none';
            }
        }

        startScreenshotSelection() {
            if (this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = true;
            this.pageFlipToken += 1;
            this.selectionWasControlsVisible = this.controlsVisible;
            this.clearSelectionBox();
            this.hideSettingsPanel();
            this.el.selectionOverlay.style.display = 'block';
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58');
            this.hideControls();
            if (this.hideTimer) clearTimeout(this.hideTimer);
        }

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58');
            if (restoreControls) { this.selectionWasControlsVisible ? this.showControls() : this.hideControls(); }
            if (showMessage) this.showReaderMessage('\u5df2\u53d6\u6d88\u622a\u56fe');
        }

        handleSelectionPointerDown(e) {
            if (!this.isSelectingScreenshot || e.button === 2 || e.target.closest?.('button')) return;
            e.preventDefault();
            this.selectionPointerId = e.pointerId;

            const handle = e.target.closest?.('.comic-sel-handle');
            if (handle && this.hasValidSelection()) {
                const rect = this.normalizeSelectionRect();
                this.selectionStart = { x: rect.x, y: rect.y };
                this.selectionCurrent = { x: rect.x + rect.width, y: rect.y + rect.height };
                this.resizeDirection = handle.dataset.dir;
                this.isDraggingSelection = true;
                this.setSelectionHint('\u62d6\u52a8\u8fb9\u89d2\u8c03\u6574\u9009\u533a\u8303\u56f4');
                this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
                return;
            }

            if (e.target.closest?.('.comic-sel-handle') || e.target === this.el.selectionBox) return;

            this.isDraggingSelection = true;
            this.resizeDirection = null;
            this.selectionStart = this.getReaderPoint(e.clientX, e.clientY);
            this.selectionCurrent = this.selectionStart;
            this.updateSelectionBox();
            this.updateSelectionActions();
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u62d6\u52a8\u8fb9\u89d2\u5fae\u8c03');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        }

        handleSelectionPointerMove(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();

            const pt = this.getReaderPoint(e.clientX, e.clientY);
            const MIN = 8;

            if (this.resizeDirection) {
                const d = this.resizeDirection;
                if (d.includes('w')) this.selectionStart.x = Math.min(pt.x, this.selectionCurrent.x - MIN);
                if (d.includes('e')) this.selectionCurrent.x = Math.max(pt.x, this.selectionStart.x + MIN);
                if (d.includes('n')) this.selectionStart.y = Math.min(pt.y, this.selectionCurrent.y - MIN);
                if (d.includes('s')) this.selectionCurrent.y = Math.max(pt.y, this.selectionStart.y + MIN);
            } else {
                this.selectionCurrent = pt;
            }

            this.updateSelectionBox();
            this.updateSelectionActions();
        }

        handleSelectionPointerUp(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;

            if (!this.selectionStart && !this.selectionCurrent) return;

            this.el.selectionOverlay.releasePointerCapture?.(e.pointerId);
            this.updateSelectionBox();
            this.updateSelectionActions();

            if (this.hasValidSelection()) {
                this.setSelectionHint('\u9009\u533a\u5df2\u5c31\u7eea\uff0c\u62d6\u52a8\u8fb9\u89d2\u5fae\u8c03\uff0c\u6216\u70b9\u51fb\u4fdd\u5b58');
            } else {
                this.clearSelectionBox();
                this.setSelectionHint('\u9009\u533a\u592a\u5c0f\uff0c\u8bf7\u91cd\u65b0\u62d6\u52a8\u9009\u62e9');
            }
        }

        async saveSelectionScreenshot() {
            if (!this.hasValidSelection()) {
                this.showReaderMessage('\u8bf7\u5148\u62d6\u52a8\u9009\u51fa\u622a\u56fe\u8303\u56f4', true);
                return;
            }

            const success = await this.captureScreenshot(this.normalizeSelectionRect());
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        }

        async saveFullScreenshot() {
            const descriptors = this.getVisibleImageDescriptors();
            const rect = readerScreenshot.getBounds(descriptors);
            if (!rect) {
                this.showReaderMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u622a\u56fe\u7684\u9875\u9762', true);
                return;
            }

            const success = await this.captureScreenshot(rect, descriptors);
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        }

        setControlsOpacity(opacity) {
            const hidden = opacity === '0';
            this.el.controls.classList.toggle('is-hidden', hidden);
            this.el.settingsControls.classList.toggle('is-hidden', hidden);
            if (hidden) this.hideSettingsPanel();
        }

        showControls() {
            if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
            if (!this.controlsVisible) this.setControlsOpacity('1');
            this.controlsVisible = true;
        }

        hideControls() {
            this.controlsVisible = false;
            this.setControlsOpacity('0');
        }

        scheduleHideControls() {
            if (this.isSettingsPanelVisible()) return;
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => this.hideControls(), this.isTouchDevice ? 1000 : 500);
        }

        showReaderMessage(text, isError = false, duration = 2200) {
            if (!this.el.toast) return;
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.el.toast.classList.toggle('is-error', isError);
            this.el.toast.classList.add('is-visible');
            this.el.toast.textContent = text;
            this.messageTimer = setTimeout(() => { this.el.toast.classList.remove('is-visible'); }, duration);
        }

        isInteractiveTouchTarget(target) {
            const el = target instanceof Element ? target : null;
            return el?.closest('button, a, input, textarea, select')
                || this.el.controls.contains(el)
                || this.el.settingsControls.contains(el)
                || this.el.settingsPanel.contains(el);
        }

        handleResize() {
            this.pageFlipToken += 1;
            this.applyResponsiveLayout();
        }

        handleTapNavigation(clientX) {
            if (!this.isTouchDevice || !this.el.reader) {
                this.controlsVisible ? this.hideControls() : this.showControls();
                return;
            }

            const rect = this.el.reader.getBoundingClientRect();
            const x = clientX - rect.left;
            if (this.tapPageNavigation && x < rect.width * TAP_ZONE_RATIO) {
                this.turnPage(null, this.isRightToLeft ? this.lastStep : -this.lastStep);
                return;
            }
            if (this.tapPageNavigation && x > rect.width * (1 - TAP_ZONE_RATIO)) {
                this.turnPage(null, this.isRightToLeft ? -this.lastStep : this.lastStep);
                return;
            }

            this.controlsVisible ? this.hideControls() : this.showControls();
        }

        clearPendingTap() {
            if (!this.pendingTapTimer) return;
            clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        }

        handleSingleFingerTap(clientX, clientY) {
            const now = Date.now();
            const isDoubleTap = now - this.lastTapTime < DOUBLE_TAP_DELAY
                && Math.abs(clientX - this.lastTapX) < 36
                && Math.abs(clientY - this.lastTapY) < 36;

            this.clearPendingTap();
            if (isDoubleTap) {
                this.lastTapTime = 0;
                this.lastTapX = 0;
                this.lastTapY = 0;
                this.animateTransform(220);
                if (Math.abs(this.scale - 1) < 0.05) {
                    this.zoomAt(clientX, clientY, this.getDoubleClickScale());
                    this.touchPanLocked = this.scale > 1 + TOUCH_ZOOM_EPSILON;
                    return;
                }
                this.resetScaleAndPan();
                this.touchPanLocked = false;
                return;
            }

            this.lastTapTime = now;
            this.lastTapX = clientX;
            this.lastTapY = clientY;
            this.pendingTapTimer = setTimeout(() => {
                this.pendingTapTimer = null;
                this.handleTapNavigation(clientX);
            }, TAP_DELAY);
        }

        isTouchPanMode() {
            return this.touchPanLocked && this.scale > 1 + TOUCH_ZOOM_EPSILON;
        }

        setTransformTransition(value) {
            if (!this.el.imgContainer) return;
            this.el.imgContainer.style.transition = value;
        }

        animateTransform(duration = 180) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.setTransformTransition(`transform ${duration}ms ease-out`);
            this.transformTransitionTimer = setTimeout(() => {
                this.transformTransitionTimer = null;
                this.setTransformTransition('none');
            }, duration);
        }

        getImageGap() {
            if (!this.el.imgContainer) return 0;
            const styles = window.getComputedStyle(this.el.imgContainer);
            const gap = parseFloat(styles.columnGap || styles.gap || '0');
            return Number.isFinite(gap) ? gap : 0;
        }

        isSharpRenderMode() {
            return this.imageRenderMode === 'sharp';
        }

        getEffectiveImageSize(img) {
            const naturalWidth = img.naturalWidth || img.width || 0;
            const naturalHeight = img.naturalHeight || img.height || 0;
            const rotated = this.rotation === 90 || this.rotation === 270;
            return {
                width: rotated ? naturalHeight : naturalWidth,
                height: rotated ? naturalWidth : naturalHeight
            };
        }

        getSharpDisplaySizes(images, isFull) {
            const naturalSizes = images.map(img => this.getEffectiveImageSize(img));
            if (isFull || naturalSizes.length < 2) return naturalSizes;

            const targetHeight = Math.max(...naturalSizes.map(size => size.height || 0));
            if (!targetHeight) return naturalSizes;

            return naturalSizes.map(size => {
                if (!size.width || !size.height) return size;
                const ratio = targetHeight / size.height;
                return {
                    width: size.width * ratio,
                    height: targetHeight
                };
            });
        }

        getDisplayedImageSize(img) {
            const displayWidth = Number.parseFloat(img.dataset.displayWidth || '');
            const displayHeight = Number.parseFloat(img.dataset.displayHeight || '');
            if (Number.isFinite(displayWidth) && displayWidth > 0
                && Number.isFinite(displayHeight) && displayHeight > 0) {
                return { width: displayWidth, height: displayHeight };
            }
            return this.getEffectiveImageSize(img);
        }

        updateFitScale(images = Array.from(this.el.imgContainer?.querySelectorAll('img') || [])) {
            if (!this.isSharpRenderMode()) {
                this.fitScale = 1;
                this.contentNaturalWidth = 0;
                this.contentNaturalHeight = 0;
                return;
            }

            const readerRect = this.el.reader?.getBoundingClientRect();
            if (!readerRect || !images.length) {
                this.fitScale = 1;
                this.contentNaturalWidth = 0;
                this.contentNaturalHeight = 0;
                return;
            }

            const sizes = images.map(img => this.getDisplayedImageSize(img));
            const gap = this.getImageGap() * Math.max(0, images.length - 1);
            const width = sizes.reduce((sum, size) => sum + size.width, 0) + gap;
            const height = Math.max(...sizes.map(size => size.height));

            this.contentNaturalWidth = width;
            this.contentNaturalHeight = height;
            if (!width || !height || !readerRect.width || !readerRect.height) {
                this.fitScale = 1;
                return;
            }

            this.fitScale = Math.min(1, readerRect.width / width, readerRect.height / height);
        }

        getRenderScale(scale = this.scale) {
            return Math.max(0.001, this.fitScale * scale);
        }

        getMaxScale() {
            if (!this.fitScale) return MAX_SCALE;
            return Math.max(MAX_SCALE, MAX_RENDER_SCALE / this.fitScale);
        }

        getDoubleClickScale() {
            if (!this.fitScale) return DOUBLE_CLICK_SCALE;
            return Math.min(this.getMaxScale(), Math.max(DOUBLE_CLICK_SCALE, 1 / this.fitScale));
        }

        applyImageRenderMode() {
            const images = Array.from(this.el.imgContainer?.querySelectorAll('img') || []);
            const isFull = images.length === 1;
            const displaySizes = this.isSharpRenderMode()
                ? this.getSharpDisplaySizes(images, isFull)
                : [];
            images.forEach((img, index) => this.setupImg(img, isFull, displaySizes[index]));
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.updateFitScale(images);
            this.applyTransform();
        }

        getImageBounds() {
            if (!this.el.imgContainer) return null;
            const images = Array.from(this.el.imgContainer.querySelectorAll('img'));
            if (!images.length) return null;
            const containerRect = this.el.reader?.getBoundingClientRect()
                || this.el.imgContainer.getBoundingClientRect();
            const imageRects = images.map(img => img.getBoundingClientRect());
            const left = Math.min(...imageRects.map(rect => rect.left));
            const right = Math.max(...imageRects.map(rect => rect.right));
            const top = Math.min(...imageRects.map(rect => rect.top));
            const bottom = Math.max(...imageRects.map(rect => rect.bottom));
            return {
                containerRect,
                left,
                right,
                top,
                bottom,
                width: right - left,
                height: bottom - top
            };
        }

        getPanLimits() {
            const bounds = this.getImageBounds();
            if (!bounds || this.scale <= 1) return { maxX: 0, maxY: 0 };

            const renderScale = this.getRenderScale();
            const allowance = PAN_EDGE_ALLOWANCE / renderScale;
            return {
                maxX: Math.max(0, (bounds.width - bounds.containerRect.width) / (2 * renderScale)) + allowance,
                maxY: Math.max(0, (bounds.height - bounds.containerRect.height) / (2 * renderScale)) + allowance
            };
        }

        clampPanValue(value, limit) {
            return Math.max(-limit, Math.min(limit, value));
        }

        clampTransform() {
            const limits = this.getPanLimits();
            if (!limits.maxX && !limits.maxY) {
                this.translateX = 0;
                this.translateY = 0;
                return;
            }

            this.translateX = this.clampPanValue(this.translateX, limits.maxX);
            this.translateY = this.clampPanValue(this.translateY, limits.maxY);
        }

        zoomAt(clientX, clientY, nextScale) {
            if (!this.el.imgContainer) return;
            const clampedScale = Math.max(MIN_SCALE, Math.min(this.getMaxScale(), nextScale));
            const previousScale = this.scale || 1;
            if (Math.abs(clampedScale - previousScale) < 0.001) return;

            const rect = this.el.reader?.getBoundingClientRect()
                || this.el.imgContainer.getBoundingClientRect();
            const offsetX = clientX - (rect.left + rect.width / 2);
            const offsetY = clientY - (rect.top + rect.height / 2);
            const previousRenderScale = this.getRenderScale(previousScale);

            this.scale = clampedScale;
            const nextRenderScale = this.getRenderScale(clampedScale);
            this.translateX += offsetX * (1 / nextRenderScale - 1 / previousRenderScale);
            this.translateY += offsetY * (1 / nextRenderScale - 1 / previousRenderScale);
            if (this.isTouchDevice) {
                this.touchPanLocked = clampedScale > 1 + TOUCH_ZOOM_EPSILON;
            }
            this.applyTransform();
        }

        resetScaleAndPan() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.applyTransform();
        }

        async loadExportImageSafe(src) {
            try {
                const res = await fetch(src);
                if (!res.ok) return this.loadImage(src);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const img = await new Promise((resolve) => {
                    const el = new Image();
                    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
                    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                    el.src = url;
                });
                return img || this.loadImage(src);
            } catch (_) {
                return this.loadImage(src);
            }
        }

        getVisibleImageDescriptors() {
            const readerRect = this.el.reader.getBoundingClientRect();
            return Array.from(this.el.imgContainer.querySelectorAll('img'))
                .map(img => {
                    const rect = img.getBoundingClientRect();
                    return { src: img.currentSrc || img.src, x: rect.left - readerRect.left, y: rect.top - readerRect.top, width: rect.width, height: rect.height };
                })
                .filter(item => item.src && item.width > 0 && item.height > 0);
        }

        async captureScreenshot(selectionRect, descriptors = this.getVisibleImageDescriptors()) {
            return readerScreenshot.capture(this, selectionRect, descriptors);
        }

        // 触摸事件处理
        handleTouchStart(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2) {
                // 双指缩放开启
                e.preventDefault();
                this.clearPendingTap();
                this.setTransformTransition('none');
                this.isTwoFingerGesturing = true;
                this.touchPanLocked = true;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                this.initialScale = this.scale;
                this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                this.twoFingerTapCandidate = true;
                this.twoFingerTapStartTime = Date.now();
                this.twoFingerTapCenterX = this.initialCenterX;
                this.twoFingerTapCenterY = this.initialCenterY;
                return;
            }

            if (e.touches.length === 1) {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchEndX = this.touchStartX;
                this.touchEndY = this.touchStartY;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                this.touchStartTime = Date.now();
                this.touchStartedOnInteractive = this.isInteractiveTouchTarget(e.target);
                this.initX = this.translateX;
                this.initY = this.translateY;
                if (this.touchStartedOnInteractive) {
                    this.showControls();
                }
            }
        }

        handleTouchMove(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2 && this.isTwoFingerGesturing) {
                // 双指缩放中
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                const scaleFactor = currentDistance / this.initialPinchDistance;
                this.scale = Math.max(MIN_SCALE, Math.min(this.getMaxScale(), this.initialScale * scaleFactor));

                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                if (Math.abs(currentDistance - this.initialPinchDistance) > 8
                    || Math.abs(currentCenterX - this.twoFingerTapCenterX) > 8
                    || Math.abs(currentCenterY - this.twoFingerTapCenterY) > 8) {
                    this.twoFingerTapCandidate = false;
                }
                const renderScale = this.getRenderScale();
                this.translateX += (currentCenterX - this.initialCenterX) / renderScale;
                this.translateY += (currentCenterY - this.initialCenterY) / renderScale;
                this.initialCenterX = currentCenterX;
                this.initialCenterY = currentCenterY;

                this.applyTransform();
                return;
            }

            if (e.touches.length === 1) {
                this.touchEndX = e.touches[0].clientX;
                this.touchEndY = e.touches[0].clientY;

                const moveX = this.touchEndX - this.touchStartX;
                const moveY = this.touchEndY - this.touchStartY;
                const deltaX = Math.abs(moveX);
                const deltaY = Math.abs(moveY);

                if (!this.touchStartedOnInteractive) {
                    if (deltaX > 4 || deltaY > 4) {
                        e.preventDefault();
                        this.setTransformTransition('none');
                        const renderScale = this.getRenderScale();
                        const limits = this.getPanLimits();
                        const nextX = this.initX + moveX / renderScale;
                        const nextY = this.initY + moveY / renderScale;
                        const clampedX = this.clampPanValue(nextX, limits.maxX);
                        const clampedY = this.clampPanValue(nextY, limits.maxY);

                        this.translateX = clampedX;
                        this.translateY = clampedY;
                        this.applyTransform();

                        const movedImage = Math.abs(clampedX - this.initX) > TOUCH_EDGE_EPSILON
                            || Math.abs(clampedY - this.initY) > TOUCH_EDGE_EPSILON;
                        const blockedHorizontally = limits.maxX <= TOUCH_EDGE_EPSILON
                            || Math.abs(nextX - clampedX) > TOUCH_EDGE_EPSILON;

                        this.touchDidMoveImage = movedImage;
                        this.isTouchSwiping = deltaX > 10 || deltaY > 10;
                        this.touchEdgePageStep = 0;
                        if (deltaX > deltaY && deltaX > SWIPE_THRESHOLD && blockedHorizontally) {
                            this.touchEdgePageStep = (moveX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                        }
                    }
                    return;
                }

                if (deltaX > 10 || deltaY > 10) {
                    this.isTouchSwiping = true;
                    if (deltaX > deltaY) {
                        e.preventDefault();
                    }
                }
            }
        }

        handleTouchEnd(e) {
            if (this.isSelectingScreenshot) return;
            if (e.type === 'touchcancel') {
                this.clearPendingTap();
                this.isTwoFingerGesturing = false;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                this.twoFingerTapCandidate = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                const isTwoFingerTap = this.twoFingerTapCandidate
                    && Date.now() - this.twoFingerTapStartTime < 300;
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
                if (this.scale <= 1 + TOUCH_ZOOM_EPSILON) {
                    this.touchPanLocked = false;
                }
                if (isTwoFingerTap) {
                    const now = Date.now();
                    const isDoubleTwoFingerTap = now - this.lastTwoFingerTapTime < 320
                        && Math.abs(this.twoFingerTapCenterX - this.lastTwoFingerTapCenterX) < 40
                        && Math.abs(this.twoFingerTapCenterY - this.lastTwoFingerTapCenterY) < 40;

                    if (isDoubleTwoFingerTap) {
                        this.lastTwoFingerTapTime = 0;
                        this.lastTwoFingerTapCenterX = 0;
                        this.lastTwoFingerTapCenterY = 0;
                        this.resetTransform();
                    } else {
                        this.lastTwoFingerTapTime = now;
                        this.lastTwoFingerTapCenterX = this.twoFingerTapCenterX;
                        this.lastTwoFingerTapCenterY = this.twoFingerTapCenterY;
                    }
                }
                return;
            }

            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const threshold = SWIPE_THRESHOLD;
            const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && Date.now() - this.touchStartTime < 300;

            if (this.touchEdgePageStep && Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
                const step = this.touchEdgePageStep;
                this.touchEdgePageStep = 0;
                this.touchDidMoveImage = false;
                this.isTouchSwiping = false;
                this.turnPage(null, step);
                return;
            }

            if (this.touchDidMoveImage) {
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                return;
            }

            if (isTap) {
                if (!this.touchStartedOnInteractive) {
                    e.preventDefault();
                    this.handleSingleFingerTap(this.touchEndX, this.touchEndY);
                }
                this.isTouchSwiping = false;
                return;
            }

            this.clearPendingTap();
            if (!this.isTouchSwiping || (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold)) {
                return;
            }

            if (Math.abs(deltaX) > threshold) {
                const dir = (deltaX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                this.turnPage(null, dir);
            }

            this.isTouchSwiping = false;
            this.touchEdgePageStep = 0;
        }

        // 5. 核心渲染逻辑（处理动画切换）
        render(animate = true, step = 0) {
            const renderIndex = this.currentIndex;
            const transitionToken = ++this.pageFlipToken;
            animations.runTransition({
                animate,
                imgContainer: this.el.imgContainer,
                animationMode: this.animationMode,
                step,
                isRightToLeft: this.isRightToLeft,
                lastStep: this.lastStep,
                renderIndex,
                getCurrentIndex: () => this.currentIndex,
                transitionToken,
                getTransitionToken: () => this.pageFlipToken,
                getTransform: () => this.getTransformStyle(),
                getShiftedTransform: (screenTranslateX) => this.getTransformStyle(screenTranslateX),
                loadImages: (index, mode, direction) => { void this.loadImages(index, mode, direction); }
            });
        }

        // 6. 智能图片加载逻辑（决定单双页）
        async loadImages(renderIndex, animationMode = 'none', transitionDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            this.scale = 1;
            this.fitScale = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.lastTapTime = 0;
            this.clearPendingTap();

            animations.resetImageContainer(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform(),
                () => this.getTransformStyle(),
                (screenTranslateX) => this.getTransformStyle(screenTranslateX)
            );

            const img1 = await this.loadImage(this.imgList[this.currentIndex]);
            if (!img1 || renderIndex !== this.currentIndex) return;

            const canUseDoubleMode = this.viewMode === 'double' || (this.viewMode === 'auto' && !this.isWideImage(img1));
            if (!canUseDoubleMode || this.currentIndex + 1 >= this.imgList.length) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const img2 = await this.loadImage(this.imgList[this.currentIndex + 1]);
            if (!img2 || renderIndex !== this.currentIndex) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const images = this.viewMode === 'auto' && this.isWideImage(img2) ? [img1] : [img1, img2];
            this.commitImages(images, animationMode, this.currentIndex + 2, transitionDirection);
        }

        loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        isWideImage(img) {
            const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
            const width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
            const height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;
            return width > height * 1.2;
        }

        commitImages(images, animationMode, preloadStart, transitionDirection = 0) {
            const isFull = images.length === 1;
            const displaySizes = this.isSharpRenderMode()
                ? this.getSharpDisplaySizes(images, isFull)
                : [];
            if (animationMode === 'none') {
                this.el.imgContainer.innerHTML = '';
            }
            images.forEach((img, index) => {
                this.setupImg(img, isFull, displaySizes[index]);
                this.el.imgContainer.appendChild(img);
            });
            this.updateFitScale(images);
            this.updatePageInfo(images.length);
            animations.finishRender(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform(),
                () => this.getTransformStyle(),
                (screenTranslateX) => this.getTransformStyle(screenTranslateX)
            );
            this.preloadImages(preloadStart);
        }

        // 辅助：设置图片样式
        setupImg(img, isFull, displaySize = null) {
            const rotated = this.rotation === 90 || this.rotation === 270;
            img.className = isFull ? 'comic-img-full' : 'comic-img-half';
            img.dataset.rotated = rotated ? 'true' : 'false';
            img.style.objectFit = 'contain';
            img.style.transformOrigin = 'center center';
            img.style.imageRendering = 'auto';

            if (this.isSharpRenderMode()) {
                const effectiveSize = displaySize || this.getEffectiveImageSize(img);
                const effectiveWidth = Math.max(1, Math.round(effectiveSize.width || 1));
                const effectiveHeight = Math.max(1, Math.round(effectiveSize.height || 1));
                img.dataset.displayWidth = String(effectiveWidth);
                img.dataset.displayHeight = String(effectiveHeight);
                img.style.width = `${rotated ? effectiveHeight : effectiveWidth}px`;
                img.style.height = `${rotated ? effectiveWidth : effectiveHeight}px`;
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            } else {
                delete img.dataset.displayWidth;
                delete img.dataset.displayHeight;
                img.style.width = '';
                img.style.height = '';
                img.style.maxWidth = rotated ? '100vh' : (isFull ? '100%' : '50%');
                img.style.maxHeight = rotated ? (isFull ? '100vw' : '50vw') : '100%';
            }

            img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
        }

        // 辅助：完成渲染并触发

        // 翻页相关方法

        turnPage(e, step) {
            e?.stopPropagation?.();
            if (!this.canGoForward(step)) step = step > 0 ? 1 : -1;
            if (!this.canGoForward(step)) return;
            this.currentIndex += step;
            this.render(true, step);
        }

        offsetPage(e, step) {
            e?.stopPropagation?.();
            const idx = this.currentIndex + step;
            if (idx >= 0 && idx < this.imgList.length) {
                this.currentIndex = idx;
                this.render(true, step);
            }
        }

        showPageInput() {
            if (!this.el.pageInfo || this.el.pageInfo.classList.contains('is-editing')) return;
            this.el.pageInfo.classList.add('is-editing');
            this.el.pageInput.value = '';
            this.el.pageRange.textContent = ` / ${this.imgList.length}`;
            window.setTimeout(() => this.el.pageInput.focus(), 0);
        }

        hidePageInput() {
            if (!this.el.pageInfo) return;
            this.el.pageInfo.classList.remove('is-editing');
            this.updatePageInfo(this.activePageCount);
        }

        jumpToPageFromInput() {
            if (!this.el.pageInfo?.classList.contains('is-editing')) return;
            const raw = this.el.pageInput?.value?.trim() || '';
            const total = this.imgList.length;
            const page = parseInt(raw, 10);
            if (!raw || !Number.isInteger(page) || String(page) !== raw || page < 1 || page > total) {
                if (raw) this.showReaderMessage(`\u8bf7\u8f93\u5165 1-${total} \u4e4b\u95f4\u7684\u6709\u6548\u6570\u5b57`, true);
                this.hidePageInput();
                return;
            }
            if (page === this.currentIndex + 1) {
                this.hidePageInput();
                return;
            }
            const step = page - 1 - this.currentIndex;
            this.el.pageInfo.classList.remove('is-editing');
            this.currentIndex = page - 1;
            this.render(true, step);
        }

        canGoForward(step) {
            const newIndex = this.currentIndex + step;
            return newIndex >= 0 && newIndex < this.imgList.length;
        }

        updatePageInfo(step) {
            this.activePageCount = step;
            this.lastStep = step;
            const total = this.imgList.length;
            this.el.pageDisplay.textContent = step === 1
                ? `${this.currentIndex + 1} / ${total}`
                : `${this.currentIndex + 1}-${this.currentIndex + step} / ${total}`;
            this.el.pageInput.value = '';
            this.el.pageInput.max = String(total);
            this.el.pageRange.textContent = '';
        }

        preloadImages(start, count = PRELOAD_COUNT) {
            for (let i = start; i < start + count && i < this.imgList.length; i++) {
                new Image().src = this.imgList[i];
            }
        }

        updateDirection() {
            if (this.el.imgContainer) this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
        }

        resetTransform() {
            this.clearPendingTap();
            this.animateTransform(220);
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.rotation = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.lastTapTime = 0;
            this.twoFingerTapCandidate = false;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;
            this.syncRotateButton();
            this.applyImageRenderMode();
        }

        getTransformStyle(screenTranslateX = 0, screenTranslateY = 0) {
            const renderScale = this.getRenderScale();
            return `scale(${renderScale}) translate(${this.translateX + screenTranslateX / renderScale}px,${this.translateY + screenTranslateY / renderScale}px)`;
        }

        writeTransform() {
            if (this.el.imgContainer) this.el.imgContainer.style.transform = this.getTransformStyle();
        }

        applyTransform() {
            this.writeTransform();
            this.clampTransform();
            if (this.isTouchDevice && this.scale <= 1 + TOUCH_ZOOM_EPSILON) {
                this.touchPanLocked = false;
            }
            this.writeTransform();
        }

        // 全局事件处理函数

        handleMouseMove(e) {
            if (!this.isDragging) return;
            const renderScale = this.getRenderScale();
            this.translateX = this.initX + (e.clientX - this.startX) / renderScale;
            this.translateY = this.initY + (e.clientY - this.startY) / renderScale;
            this.applyTransform();
        }

        handleMouseUp() {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.el.imgContainer.classList.remove('is-grabbing');
        }

        handleFullscreenChange() {
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        handleKeyDown(e) {
            if (this.isSelectingScreenshot) {
                if (e.key === 'Escape') this.cancelScreenshotSelection(true);
                if (e.key === 'Enter') void this.saveSelectionScreenshot();
                return;
            }
            if (e.key === 'Escape' && this.isSettingsPanelVisible()) {
                this.hideSettingsPanel();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') this.el.leftBtn.click();
            else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') this.el.rightBtn.click();
            else if (e.key.toLowerCase() === 's') this.startScreenshotSelection();
            else if (e.key === 'Escape') this.close();
        }

        // 清理并关闭
        close() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.clearPendingTap();
            this.pageFlipToken += 1;
            this.cancelScreenshotSelection(false, false);
            this.hideSettingsPanel();

            if (this.eventBag) {
                this.eventBag.cleanup();
                this.eventBag = null;
            }

            if (this.el.reader) {
                this.el.reader.remove();
                this.el = {};
            }

            // 显示收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = '';
        }
    }


    // ============ 入口函数 ============
    // 检查 URL 是否匹配漫画模式
    function shouldInitComicReader() {
        const url = window.location.href;
        return COMIC_URL_PATTERNS.some(pattern => url.includes(pattern));
    }

    Toolbox.reader = {
        BiliComicReader,
        shouldInitComicReader
    };
})();
