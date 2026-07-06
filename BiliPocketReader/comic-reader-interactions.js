// Bilibili Toolbox - reader interaction bindings
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const animations = Toolbox.animations;
    const readerPreferences = Toolbox.readerPreferences;
    const VIEW_MODES = readerPreferences.VIEW_MODES;
    const IMAGE_RENDER_MODES = readerPreferences.IMAGE_RENDER_MODES;
    const BACKGROUND_MODES = readerPreferences.BACKGROUND_MODES;
    const SCALE_STEP = 0.1;

    function stop(handler) {
        return (event) => {
            event.stopPropagation();
            handler(event);
        };
    }

    function bindReaderInteractions(reader) {
        const on = (...args) => reader.eventBag.on(...args);
        const el = reader.el;

        on(el.controls, 'mouseenter', () => reader.showControls());
        on(el.settingsControls, 'mouseenter', () => reader.showControls());
        on(el.settingsPanel, 'mouseenter', () => reader.showControls());
        on(el.controls, 'mouseleave', () => reader.scheduleHideControls());
        on(el.settingsControls, 'mouseleave', () => reader.scheduleHideControls());
        on(el.settingsPanel, 'mouseleave', () => reader.scheduleHideControls());
        on(el.reader, 'mouseleave', () => reader.scheduleHideControls());

        el.leftBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? reader.lastStep : -reader.lastStep);
        el.rightBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? -reader.lastStep : reader.lastStep);

        el.offsetIncBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? 1 : -1);
        el.offsetDecBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? -1 : 1);

        el.directionBtn.onclick = stop(() => {
            reader.isRightToLeft = !reader.isRightToLeft;
            reader.updateDirection();
            reader.syncDirectionButton();
            reader.savePreferences();
        });

        el.animationBtn.onclick = stop(() => {
            reader.animationMode = animations.getNextAnimationMode(reader.animationMode);
            animations.syncAnimationButton(el.animationBtn, reader.animationMode);
            reader.savePreferences();
        });

        el.viewModeBtn.onclick = stop(() => {
            const currentIdx = VIEW_MODES.indexOf(reader.viewMode);
            reader.viewMode = VIEW_MODES[(currentIdx + 1) % VIEW_MODES.length];
            reader.syncViewModeButton();
            reader.savePreferences();
            reader.render(false);
        });

        el.imageRenderBtn.onclick = stop(() => {
            const currentIdx = IMAGE_RENDER_MODES.indexOf(reader.imageRenderMode);
            reader.imageRenderMode = IMAGE_RENDER_MODES[(currentIdx + 1) % IMAGE_RENDER_MODES.length];
            reader.syncImageRenderButton();
            reader.savePreferences();
            reader.refreshImagesForRenderMode();
            reader.showReaderMessage(reader.imageRenderMode === 'sharp' ? '\u539f\u56fe\u6a21\u5f0f' : '\u6d41\u7545\u6a21\u5f0f');
        });

        el.backgroundBtn.onclick = stop(() => {
            const currentIdx = BACKGROUND_MODES.indexOf(reader.backgroundMode);
            reader.backgroundMode = BACKGROUND_MODES[(currentIdx + 1) % BACKGROUND_MODES.length];
            reader.syncBackgroundButton();
            reader.applyReaderBackground();
            reader.savePreferences();
            reader.showReaderMessage(`\u80cc\u666f\uff1a${reader.getReaderBackgroundLabel()}`);
        });

        el.tapPageBtn.onclick = stop(() => {
            reader.tapPageNavigation = !reader.tapPageNavigation;
            reader.syncTapPageButton();
            reader.savePreferences();
            reader.showReaderMessage(reader.tapPageNavigation ? '\u70b9\u51fb\u7ffb\u9875\u5df2\u5f00\u542f' : '\u70b9\u51fb\u7ffb\u9875\u5df2\u5173\u95ed');
        });

        el.settingsBtn.onclick = stop(() => reader.toggleSettingsPanel());

        el.resetViewBtn.onclick = stop(() => reader.resetTransform());
        el.screenshotBtn.onclick = stop(() => reader.startScreenshotSelection());
        el.fullScreenBtn.onclick = stop(() => reader.toggleFullscreen());

        el.rotateBtn.onclick = stop(() => {
            reader.rotation = (reader.rotation + 90) % 360;
            reader.syncRotateButton();
            reader.render(false);
        });

        el.closeBtn.onclick = () => reader.close();

        on(el.pageInfo, 'click', (event) => {
            event.stopPropagation();
            reader.showPageInput();
        });
        on(el.pageInput, 'focus', () => el.pageInput.select());
        on(el.pageInput, 'keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                reader.jumpToPageFromInput();
                el.pageInput.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                reader.hidePageInput();
                el.pageInput.blur();
            }
        });
        on(el.pageInput, 'blur', () => reader.jumpToPageFromInput());

        el.selectionCancelBtn.onclick = () => reader.cancelScreenshotSelection(true);
        el.selectionFullBtn.onclick = () => { void reader.saveFullScreenshot(); };
        el.selectionSaveBtn.onclick = () => { void reader.saveSelectionScreenshot(); };
        on(el.selectionOverlay, 'pointerdown', reader.handleSelectionPointerDown);
        on(el.selectionOverlay, 'pointermove', reader.handleSelectionPointerMove);
        on(el.selectionOverlay, 'pointerup', reader.handleSelectionPointerUp);
        on(el.selectionOverlay, 'pointercancel', reader.handleSelectionPointerUp);
        on(el.reader, 'pointerdown', reader.handleSettingsOutsidePointerDown, true);

        on(el.imgContainer, 'wheel', (event) => {
            event.preventDefault();
            reader.animateTransform();
            reader.zoomAt(event.clientX, event.clientY, reader.scale + (event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP));
        }, { passive: false });

        on(el.imgContainer, 'dblclick', (event) => {
            event.preventDefault();
            reader.animateTransform(220);
            if (Math.abs(reader.scale - 1) < 0.05) {
                reader.zoomAt(event.clientX, event.clientY, reader.getDoubleClickScale());
                return;
            }
            reader.resetScaleAndPan();
        });

        on(el.imgContainer, 'mousedown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            reader.setTransformTransition('none');
            reader.isDragging = true;
            reader.initX = reader.translateX;
            reader.initY = reader.translateY;
            reader.startX = event.clientX;
            reader.startY = event.clientY;
            el.imgContainer.classList.add('is-grabbing');
        });

        on(el.imgContainer, 'mouseleave', () => {
            reader.isDragging = false;
            el.imgContainer.classList.remove('is-grabbing');
        });

        on(document, 'mousemove', reader.handleMouseMove);
        on(document, 'mouseup', reader.handleMouseUp);
        on(document, 'fullscreenchange', reader.handleFullscreenChange);
        on(window, 'keydown', reader.handleKeyDown);
        on(window, 'resize', reader.handleResize);

        on(el.reader, 'touchstart', reader.boundHandleTouchStart, { passive: false });
        on(el.reader, 'touchmove', reader.boundHandleTouchMove, { passive: false });
        on(el.reader, 'touchend', reader.boundHandleTouchEnd, { passive: false });
        on(el.reader, 'touchcancel', reader.boundHandleTouchEnd, { passive: false });
        reader.showControls();
    }

    Toolbox.readerInteractions = {
        bind: bindReaderInteractions
    };
})();
