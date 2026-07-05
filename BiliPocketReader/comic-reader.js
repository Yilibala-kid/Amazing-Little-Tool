// Bilibili Toolbox - Comic Reader
(function() {
    'use strict';

    // ============ 常量定义 ============
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
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
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');
    if (!window.BilibiliToolbox?.readerScreenshot) throw new Error('BilibiliToolbox: reader-screenshot.js not loaded');
    if (!window.BilibiliToolbox?.readerTransform) throw new Error('BilibiliToolbox: reader-transform.js not loaded');
    if (!window.BilibiliToolbox?.readerSelection) throw new Error('BilibiliToolbox: reader-selection.js not loaded');
    if (!window.BilibiliToolbox?.readerDom) throw new Error('BilibiliToolbox: reader-dom.js not loaded');
    if (!window.BilibiliToolbox?.readerPageGroups) throw new Error('BilibiliToolbox: comic-reader-page-groups.js not loaded');
    if (!window.BilibiliToolbox?.readerInteractions) throw new Error('BilibiliToolbox: comic-reader-interactions.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const Shared = window.Shared;
    const bilibiliDom = Toolbox.bilibiliDom;
    const animations = Toolbox.animations;
    const comicImages = Toolbox.comicImages;
    const readerPreferences = Toolbox.readerPreferences;
    const readerScreenshot = Toolbox.readerScreenshot;
    const readerTransform = Toolbox.readerTransform;
    const readerSelection = Toolbox.readerSelection;
    const readerDom = Toolbox.readerDom;
    const readerPageGroups = Toolbox.readerPageGroups;
    const readerInteractions = Toolbox.readerInteractions;
    const READER_BACKGROUND_COLORS = Object.freeze({
        black: '#0a0a0a',
        darkGray: '#1f1f1f',
        lightGray: '#d8d8d8',
        white: '#ffffff'
    });
    const READER_BACKGROUND_LABELS = Object.freeze({
        black: '\u9ed1\u8272',
        darkGray: '\u6df1\u7070',
        lightGray: '\u6d45\u7070',
        white: '\u767d\u8272'
    });

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
                backgroundMode: this.backgroundMode,
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
            this.sharpDisplayFitRatio = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
            this.viewMode = preferences.viewMode;
            this.animationMode = preferences.animationMode;
            this.imageRenderMode = preferences.imageRenderMode;
            this.backgroundMode = preferences.backgroundMode;
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

            readerTransform.attach(this);
            readerSelection.attach(this);
            readerDom.attach(this);

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
        // 4. 缁戝畾浜嬩欢
        bindEvents() {
            readerInteractions.bind(this);
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
            this.el.imageRenderBtn.classList.remove('active');
        }

        syncBackgroundButton() {
            const label = this.getReaderBackgroundLabel();
            this.el.backgroundBtn.innerText = label;
            this.el.backgroundBtn.title = `\u80cc\u666f\u989c\u8272\uff1a${label}`;
            this.el.backgroundBtn.classList.remove('active');
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
            const images = Array.from(this.el.imgContainer?.querySelectorAll('img') || []);
            if (this.isSharpRenderMode() && images.length) this.setupImagesForRenderMode(images);
            this.updateFitScale();
            this.applyTransform();
        }

        getReaderBackgroundColor() {
            return READER_BACKGROUND_COLORS[this.backgroundMode] || READER_BACKGROUND_COLORS.black;
        }

        getReaderBackgroundLabel() {
            return READER_BACKGROUND_LABELS[this.backgroundMode] || READER_BACKGROUND_LABELS.black;
        }

        applyReaderBackground() {
            if (this.el.reader) this.el.reader.style.background = this.getReaderBackgroundColor();
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
        async loadImages(renderIndex, animationMode = animations.IMMEDIATE_RENDER_MODE, transitionDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            this.resetPageInteractionState();

            animations.resetImageContainer(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform(),
                () => this.getTransformStyle(),
                (screenTranslateX) => this.getTransformStyle(screenTranslateX)
            );

            const result = await readerPageGroups.loadVisibleImages({
                currentIndex: this.currentIndex,
                imgList: this.imgList,
                viewMode: this.viewMode,
                loadImage: (src) => this.loadImage(src),
                isWideImage: (img) => this.isWideImage(img)
            });
            if (!result || renderIndex !== this.currentIndex) return;

            this.commitImages(result.images, animationMode, result.preloadStart, transitionDirection);
        }

        resetPageInteractionState() {
            this.scale = 1;
            this.fitScale = 1;
            this.sharpDisplayFitRatio = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.lastTapTime = 0;
            this.clearPendingTap();
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
            return readerPageGroups.isWideImage(img, this.rotation);
        }

        commitImages(images, animationMode, preloadStart, transitionDirection = 0) {
            images.forEach(img => {
                this.el.imgContainer.appendChild(img);
            });
            this.setupImagesForRenderMode(images);
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

        async turnPage(e, step) {
            e?.stopPropagation?.();
            const direction = Math.sign(step);
            if (!this.canTurnPage(direction)) return;
            const requestIndex = this.currentIndex;
            const nextIndex = direction < 0
                ? await this.getPreviousPageGroupIndex()
                : this.getNextPageGroupIndex(step);
            if (requestIndex !== this.currentIndex) return;
            if (nextIndex < 0 || nextIndex >= this.imgList.length || nextIndex === this.currentIndex) return;
            const actualStep = nextIndex - this.currentIndex;
            this.currentIndex = nextIndex;
            this.render(true, actualStep);
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

        getNextPageGroupIndex(step) {
            return readerPageGroups.getNextIndex({
                currentIndex: this.currentIndex,
                total: this.imgList.length,
                step
            });
        }

        async getPreviousPageGroupIndex() {
            return readerPageGroups.getPreviousIndex({
                currentIndex: this.currentIndex,
                viewMode: this.viewMode,
                loadImage: (index) => this.loadImage(this.imgList[index]),
                isWideImage: (img) => this.isWideImage(img)
            });
        }

        canTurnPage(direction) {
            if (direction > 0) return this.currentIndex + this.activePageCount < this.imgList.length;
            if (direction < 0) return this.currentIndex > 0;
            return false;
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

        // 全局事件处理函数

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
        return bilibiliDom.isComicReaderPage();
    }

    Toolbox.reader = {
        BiliComicReader,
        shouldInitComicReader
    };
})();
