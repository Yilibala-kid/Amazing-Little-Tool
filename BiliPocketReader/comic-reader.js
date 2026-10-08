// Bilibili Toolbox - Comic Reader
(function() {
    'use strict';

    // ============ 常量定义 ============
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
    if (!window.BilibiliToolbox?.readerThumbnails) throw new Error('BilibiliToolbox: reader-thumbnails.js not loaded');
    if (!window.BilibiliToolbox?.readerSettings) throw new Error('BilibiliToolbox: reader-settings.js not loaded');
    if (!window.BilibiliToolbox?.readerTouch) throw new Error('BilibiliToolbox: reader-touch.js not loaded');
    if (!window.BilibiliToolbox?.readerPageGroups) throw new Error('BilibiliToolbox: comic-reader-page-groups.js not loaded');
    if (!window.BilibiliToolbox?.ReaderImageLoader) throw new Error('BilibiliToolbox: reader-image-loader.js not loaded');
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
    // ============ 漫画模式功能 ============

    class BiliComicReader {
        constructor() {
            Object.assign(this, readerPreferences.load());
            // 状态管理
            this.imgList = [];
            this.currentIndex = 0;
            this.displayedIndex = 0;
            this.lastStep = 2;
            this.scale = 1;
            this.fitScale = 1;
            this.sharpDisplayFitRatio = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
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
            this.selectionDragMode = null;
            this.selectionMoveStart = null;
            this.selectionMoveRect = null;
            this.selectionHandles = {};
            this.pageFlipToken = 0;
            this.transformTransitionTimer = null;
            this.isOpen = false;
            this.isPreparing = false;
            this.entryImageObserver = null;
            this.entryImageTimer = null;
            this.entryButton = null;
            this.screenshotTask = null;
            this.focusTimer = null;
            this.resizeFrame = null;

            // 拖拽状态
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.initX = 0;
            this.initY = 0;


            // DOM 元素引用
            this.el = {};
            this.imageLoader = new Toolbox.ReaderImageLoader(() => ({
                isOpen: this.isOpen, isPreparing: this.isPreparing, imgList: this.imgList,
                currentIndex: this.currentIndex, activePageCount: this.activePageCount,
                displayedIndex: this.displayedIndex, preloadPages: this.preloadPages,
                imageMemoryPolicy: this.imageMemoryPolicy,
                visibleSources: Array.from(this.el.imgContainer?.querySelectorAll?.('img') || [], img => img.src)
            }));
            this.eventBag = null;

            readerTransform.attach(this);
            readerSelection.attach(this);
            readerDom.attach(this);
            Toolbox.readerThumbnails.attach(this);
            Toolbox.readerSettings.attach(this);
            Toolbox.readerTouch.attach(this);

            // Mixins bind their own methods; only core handlers need binding here.
            ['handleKeyDown', 'handleFullscreenChange', 'handleResize'].forEach(name => {
                this[name] = this[name].bind(this);
            });
        }

        // 1. 初始化入口按钮
        init() {
            if (this.entryButton) return;
            const entryBtn = document.createElement('button');
            this.entryButton = entryBtn;
            entryBtn.innerHTML = '&#128214;';
            entryBtn.className = `comic-entry-btn${this.isTouchDevice ? ' comic-entry-btn-touch' : ''}`;
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
            this.prepareImages();
        }

        // Warm the selected number of images as soon as a readable page is entered.
        prepareImages() {
            if (this.isOpen || this.isPreparing) return;
            this.isPreparing = true;
            this.currentIndex = 0;
            this.displayedIndex = 0;
            const refresh = () => {
                this.entryImageTimer = null;
                if (!this.isPreparing) return;
                const images = this.collectReaderImages();
                const loadAll = this.preloadPages === 'all';
                const count = loadAll ? images.length : this.imageLoader.getPreloadCount();
                const changed = loadAll ? images.join('\n') !== this.imgList.join('\n') :
                    images.slice(0, count).join('\n') !== this.imgList.slice(0, count).join('\n');
                this.imgList = images;
                if (changed) {
                    this.pruneImageCache();
                    this.preloadImages(0, 0);
                }
                if (this.preloadPages !== 'all' && images.length >= count) {
                    this.entryImageObserver?.disconnect();
                    this.entryImageObserver = null;
                }
            };
            this.entryImageObserver = new MutationObserver(() => {
                if (this.entryImageTimer !== null) return;
                this.entryImageTimer = setTimeout(refresh, 50);
            });
            this.entryImageObserver.observe(document.body, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['src', 'data-origin-src', 'data-original', 'data-original-src',
                    'data-large-src', 'data-url', 'data-image', 'data-src']
            });
            refresh();
        }

        stopPreparingImages() {
            this.isPreparing = false;
            this.entryImageObserver?.disconnect();
            this.entryImageObserver = null;
            clearTimeout(this.entryImageTimer);
            this.entryImageTimer = null;
        }

        syncImageLoadingSettings() {
            this.cancelPreload();
            this.pruneImageCache();
            if (this.isOpen) {
                this.preloadImages(this.currentIndex + this.activePageCount, 0);
            } else if (this.isPreparing) {
                this.stopPreparingImages();
                // The URLs can be unchanged while the selected count increases.
                this.imgList = [];
                this.prepareImages();
            }
        }

        // 2. 启动阅读器
        start() {
            if (this.isOpen || !shouldInitComicReader()) return;
            this.imgList = this.collectReaderImages();

            if (this.imgList.length === 0) return alert('\u672a\u627e\u5230\u6f2b\u753b\u56fe\u7247');

            this.isOpen = true;
            this.stopPreparingImages();
            this.currentIndex = 0;
            this.displayedIndex = 0;
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

        getImageCollectionOptions() {
            return { preserveBiliSuffix: this.imageRenderMode === 'smooth' };
        }

        collectReaderImages() {
            return comicImages.collectImages(this.getImageCollectionOptions());
        }

        refreshImagesForRenderMode() {
            if (!this.isOpen) return;
            const images = this.collectReaderImages();
            if (images.length === 0) return;
            this.imgList = images;
            this.cancelPreload();
            // Keep the visible originals until their replacements are decoded.
            this.pruneImageCache();
            this.currentIndex = Math.min(this.currentIndex, this.imgList.length - 1);
            this.render(false);
        }

        // Bind reader controls and input events.
        bindEvents() {
            readerInteractions.bind(this);
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
            if (images.length) this.setupImagesForRenderMode(images);
            this.updateFitScale();
            this.applyTransform();
        }

        setControlsOpacity(opacity) {
            const hidden = opacity === '0';
            this.el.controls.classList.toggle('is-hidden', hidden);
            this.el.settingsControls.classList.toggle('is-hidden', hidden);
            if (hidden) {
                this.hideSettingsPanel();
                this.hideThumbnails();
            }
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
            if (this.isSettingsPanelVisible() || this.isThumbnailsVisible()) return;
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

        handleResize() {
            if (!this.isOpen || this.resizeFrame !== null) return;
            this.resizeFrame = window.requestAnimationFrame(() => {
                this.resizeFrame = null;
                if (!this.isOpen) return;
                animations.cancel(this.el.imgContainer, true);
                this.applyResponsiveLayout();
            });
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

        async captureScreenshot(selectionRect, action = 'download') {
            return readerScreenshot.capture(this, selectionRect, this.getVisibleImageDescriptors(), action);
        }

        // Keep the current page visible until the next group is decoded.
        async render(animate = true, step = 0) {
            const container = this.el.imgContainer;
            if (!container) return;
            const renderIndex = this.currentIndex;
            const transitionToken = ++this.pageFlipToken;
            this.cancelPreload();
            animations.cancel(container);
            this.pruneImageCache();
            this.applyTransform();
            const result = await this.loadImages(renderIndex, transitionToken);
            if (transitionToken !== this.pageFlipToken || container !== this.el.imgContainer) return;
            if (!result) {
                if (container.firstChild) this.currentIndex = this.displayedIndex;
                this.showReaderMessage('图片加载失败，请重试', true);
                return;
            }
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
                loadImages: (_index, mode, direction) => {
                    if (transitionToken !== this.pageFlipToken || container !== this.el.imgContainer) return;
                    this.commitImages(result.images, mode, direction, result.preloadStart);
                    this.displayedIndex = renderIndex;
                    this.syncThumbnailSelection();
                }
            });
        }

        // 6. 智能图片加载逻辑（决定单双页）
        async loadImages(renderIndex, transitionToken = this.pageFlipToken) {
            if (renderIndex !== this.currentIndex) return;
            const result = await readerPageGroups.loadVisibleImages({
                currentIndex: renderIndex,
                imgList: this.imgList,
                viewMode: this.viewMode,
                loadImage: (src) => transitionToken === this.pageFlipToken ? this.loadImage(src) : Promise.resolve(null),
                isWideImage: (img) => this.isWideImage(img)
            });
            if (renderIndex !== this.currentIndex || transitionToken !== this.pageFlipToken) return;
            return result;
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

        get imageCache() { return this.imageLoader.imageCache; }
        get preloadActive() { return this.imageLoader.preloadActive; }
        loadImage(src, preload = false) { return this.imageLoader.loadImage(src, preload); }
        cancelPreload() { this.imageLoader.cancelPreload(); }
        preloadImages(start = 0, delay = 800) { this.imageLoader.preloadImages(start, delay); }
        pruneImageCache() { this.imageLoader.pruneImageCache(); }

        isWideImage(img) {
            return readerPageGroups.isWideImage(img, this.rotation);
        }

        commitImages(images, animationMode, transitionDirection = 0, preloadStart = this.currentIndex + images.length) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.transformTransitionTimer = null;
            this.el.imgContainer.style.transition = 'none';
            this.resetPageInteractionState();
            this.setupImagesForRenderMode(images);
            this.updateFitScale(images);
            animations.resetImageContainer(
                this.el.imgContainer, animationMode, transitionDirection,
                () => this.applyTransform(), () => this.getTransformStyle(),
                (offset) => this.getTransformStyle(offset)
            );
            this.el.imgContainer.replaceChildren(...images);
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
            // Apply the memory policy after the displayed page index is committed.
            Promise.resolve().then(() => {
                if (this.isOpen) this.pruneImageCache();
            });
        }

        // 辅助：设置图片样式
        setupImg(img, isFull, displaySize = null) {
            const rotated = this.rotation === 90 || this.rotation === 270;
            img.className = isFull ? 'comic-img-full' : 'comic-img-half';
            img.dataset.rotated = rotated ? 'true' : 'false';
            img.style.objectFit = 'contain';
            img.style.transformOrigin = 'center center';
            img.style.imageRendering = 'auto';

            const effectiveSize = displaySize || this.getEffectiveImageSize(img);
            const effectiveWidth = Math.max(1, effectiveSize.width || 1);
            const effectiveHeight = Math.max(1, effectiveSize.height || 1);
            img.dataset.displayWidth = String(effectiveWidth);
            img.dataset.displayHeight = String(effectiveHeight);
            img.style.width = `${rotated ? effectiveHeight : effectiveWidth}px`;
            img.style.height = `${rotated ? effectiveWidth : effectiveHeight}px`;
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';

            // A rotated flex item still occupies its unrotated layout box.
            // Compensate so two sideways pages neither overlap nor escape the fit.
            const rotationMargin = rotated ? (effectiveWidth - effectiveHeight) / 2 : 0;
            img.style.margin = `${-rotationMargin}px ${rotationMargin}px`;

            img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
        }

        // 辅助：完成渲染并触发

        // 翻页相关方法

        async turnPage(e, step) {
            e?.stopPropagation?.();
            const direction = Math.sign(step);
            if (!this.canTurnPage(direction)) return;
            const requestIndex = this.currentIndex;
            const token = this.pageFlipToken;
            const nextIndex = direction < 0
                ? await this.getPreviousPageGroupIndex()
                : this.getNextPageGroupIndex(step);
            if (!this.isOpen || token !== this.pageFlipToken || requestIndex !== this.currentIndex) return;
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
            clearTimeout(this.focusTimer);
            this.focusTimer = window.setTimeout(() => {
                this.focusTimer = null;
                this.el.pageInput?.focus();
            }, 0);
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
            this.el.pageInfo.classList.remove('is-editing');
            this.jumpToImage(page - 1);
        }

        jumpToImage(index) {
            if (!this.isOpen || !Number.isInteger(index) || index < 0 || index >= this.imgList.length) return;
            if (index === this.currentIndex && this.el.imgContainer?.firstChild) return;
            const step = index - this.currentIndex;
            this.currentIndex = index;
            return this.render(true, step);
        }

        getNextPageGroupIndex(step) {
            return readerPageGroups.getNextIndex({
                currentIndex: this.currentIndex,
                total: this.imgList.length,
                step
            });
        }

        async getPreviousPageGroupIndex() {
            const index = this.currentIndex;
            const sources = this.imgList;
            // Auto mode probes the predecessor before changing currentIndex.
            // Keep it through width classification even if a preload/settings
            // change prunes the cache while its request or decode is pending.
            const release = this.imageLoader.protectImages(sources.slice(Math.max(0, index - 2), index));
            try {
                return await readerPageGroups.getPreviousIndex({
                    currentIndex: index,
                    viewMode: this.viewMode,
                    loadImage: (imageIndex) => this.loadImage(sources[imageIndex]),
                    isWideImage: (img) => this.isWideImage(img)
                });
            } finally {
                release();
            }
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

        updateDirection() {
            this.panGeometry = null;
            if (this.el.imgContainer) this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
        }

        // 全局事件处理函数

        handleFullscreenChange() {
            this.syncFullscreenButton();
            this.handleResize();
        }

        handleKeyDown(e) {
            if (this.isThumbnailsVisible()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideThumbnails(true);
                }
                return;
            }
            if (this.isSelectingScreenshot) {
                if (e.key === 'Escape') this.cancelScreenshotSelection(true);
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void this.saveSelectionScreenshot('download');
                }
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
        close(forceRelease = false) {
            this.isOpen = false;
            this.stopPreparingImages();
            if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = null;
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.messageTimer) clearTimeout(this.messageTimer);
            clearTimeout(this.focusTimer);
            this.hideTimer = this.messageTimer = this.focusTimer = null;
            this.clearPendingTap();
            this.pageFlipToken += 1;
            this.cancelPreload();
            animations.cancel(this.el.imgContainer);
            this.screenshotTask?.cancel();
            this.screenshotTask = null;
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.transformTransitionTimer = null;
            this.cancelScreenshotSelection(false, false);
            this.hideSettingsPanel();
            this.hideThumbnails();

            if (this.eventBag) {
                this.eventBag.cleanup();
                this.eventBag = null;
            }

            if (this.el.reader) {
                for (const element of Object.values(this.el)) element.onclick = null;
                this.el.imgContainer?.replaceChildren();
                this.el.reader.remove();
                this.el = {};
            }
            if (forceRelease) this.imageLoader.clear();
            else this.imageLoader.pause();
            this.imgList = [];
            this.selectionHandles = {};
            this.selectionStart = this.selectionCurrent = null;
            this.selectionMoveStart = this.selectionMoveRect = null;
            this.panGeometry = this.viewportRect = null;
            this.isDragging = false;

            // 显示收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = '';
        }

        destroy() {
            this.close(true);
            if (this.entryButton) {
                this.entryButton.onclick = null;
                this.entryButton.remove();
                this.entryButton = null;
            }
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
