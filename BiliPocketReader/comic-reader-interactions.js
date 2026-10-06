// Bilibili Toolbox - reader interaction bindings
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');

    const Toolbox = window.BilibiliToolbox;
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

        [el.controls, el.settingsControls, el.settingsPanel].forEach(control => {
            on(control, 'mouseenter', () => reader.showControls());
            on(control, 'mouseleave', () => reader.scheduleHideControls());
        });
        on(el.reader, 'mouseleave', () => reader.scheduleHideControls());
        on(el.settingsPanel, 'keydown', event => {
            if (event.key !== 'Escape') event.stopPropagation();
        });

        el.leftBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? reader.lastStep : -reader.lastStep);
        el.rightBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? -reader.lastStep : reader.lastStep);

        el.offsetIncBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? 1 : -1);
        el.offsetDecBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? -1 : 1);

        const preferenceButtons = [
            [el.directionBtn, 'isRightToLeft'],
            [el.animationBtn, 'animationMode', readerPreferences.ANIMATION_MODES],
            [el.viewModeBtn, 'viewMode', VIEW_MODES],
            [el.imageRenderBtn, 'imageRenderMode', IMAGE_RENDER_MODES],
            [el.filterBtn, 'filterMode', readerPreferences.FILTER_MODES],
            [el.preloadBtn, 'preloadPages', readerPreferences.PRELOAD_PAGES],
            [el.imageMemoryBtn, 'imageMemoryPolicy', readerPreferences.IMAGE_MEMORY_POLICIES],
            [el.backgroundBtn, 'backgroundMode', BACKGROUND_MODES],
            [el.tapPageBtn, 'tapPageNavigation']
        ];
        preferenceButtons.forEach(([button, key, modes]) => {
            button.onclick = stop(() => {
                if (modes) reader.cyclePreference(key, modes);
                else reader.setPreference(key, !reader[key]);
            });
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
        el.selectionFullBtn.onclick = () => reader.selectFullScreenshot();
        el.selectionCopyBtn.onclick = () => { void reader.saveSelectionScreenshot('copy'); };
        el.selectionDownloadBtn.onclick = () => { void reader.saveSelectionScreenshot('download'); };
        on(el.selectionToolbar, 'keydown', event => {
            if (event.key !== 'Escape') event.stopPropagation();
        });
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

        on(el.reader, 'touchstart', reader.handleTouchStart, { passive: false });
        on(el.reader, 'touchmove', reader.handleTouchMove, { passive: false });
        on(el.reader, 'touchend', reader.handleTouchEnd, { passive: false });
        on(el.reader, 'touchcancel', reader.handleTouchEnd, { passive: false });
        reader.showControls();
    }

    Toolbox.readerInteractions = {
        bind: bindReaderInteractions
    };
})();
