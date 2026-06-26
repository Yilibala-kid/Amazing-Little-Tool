// Bilibili Toolbox - reader transform and image sizing helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const DOUBLE_CLICK_SCALE = 2;
    const MAX_RENDER_SCALE = 2;
    const TOUCH_ZOOM_EPSILON = 0.01;
    const PAN_EDGE_ALLOWANCE = 72;

    const methods = {
        setTransformTransition(value) {
            if (!this.el.imgContainer) return;
            this.el.imgContainer.style.transition = value;
        },

        animateTransform(duration = 180) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.setTransformTransition(`transform ${duration}ms ease-out`);
            this.transformTransitionTimer = setTimeout(() => {
                this.transformTransitionTimer = null;
                this.setTransformTransition('none');
            }, duration);
        },

        getImageGap() {
            if (!this.el.imgContainer) return 0;
            const styles = window.getComputedStyle(this.el.imgContainer);
            const gap = parseFloat(styles.columnGap || styles.gap || '0');
            return Number.isFinite(gap) ? gap : 0;
        },

        isSharpRenderMode() {
            return this.imageRenderMode === 'sharp';
        },

        getEffectiveImageSize(img) {
            const naturalWidth = img.naturalWidth || img.width || 0;
            const naturalHeight = img.naturalHeight || img.height || 0;
            const rotated = this.rotation === 90 || this.rotation === 270;
            return {
                width: rotated ? naturalHeight : naturalWidth,
                height: rotated ? naturalWidth : naturalHeight
            };
        },

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
        },

        getDisplayedImageSize(img) {
            const displayWidth = Number.parseFloat(img.dataset.displayWidth || '');
            const displayHeight = Number.parseFloat(img.dataset.displayHeight || '');
            if (Number.isFinite(displayWidth) && displayWidth > 0
                && Number.isFinite(displayHeight) && displayHeight > 0) {
                return { width: displayWidth, height: displayHeight };
            }
            return this.getEffectiveImageSize(img);
        },

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
        },

        getRenderScale(scale = this.scale) {
            return Math.max(0.001, this.fitScale * scale);
        },

        getMaxScale() {
            if (!this.fitScale) return MAX_SCALE;
            return Math.max(MAX_SCALE, MAX_RENDER_SCALE / this.fitScale);
        },

        getDoubleClickScale() {
            if (!this.fitScale) return DOUBLE_CLICK_SCALE;
            return Math.min(this.getMaxScale(), Math.max(DOUBLE_CLICK_SCALE, 1 / this.fitScale));
        },

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
        },

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
        },

        getPanLimits() {
            const bounds = this.getImageBounds();
            if (!bounds || this.scale <= 1) return { maxX: 0, maxY: 0 };

            const renderScale = this.getRenderScale();
            const allowance = PAN_EDGE_ALLOWANCE / renderScale;
            return {
                maxX: Math.max(0, (bounds.width - bounds.containerRect.width) / (2 * renderScale)) + allowance,
                maxY: Math.max(0, (bounds.height - bounds.containerRect.height) / (2 * renderScale)) + allowance
            };
        },

        clampPanValue(value, limit) {
            return Math.max(-limit, Math.min(limit, value));
        },

        clampTransform() {
            const limits = this.getPanLimits();
            if (!limits.maxX && !limits.maxY) {
                this.translateX = 0;
                this.translateY = 0;
                return;
            }

            this.translateX = this.clampPanValue(this.translateX, limits.maxX);
            this.translateY = this.clampPanValue(this.translateY, limits.maxY);
        },

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
        },

        resetScaleAndPan() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.applyTransform();
        },

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
        },

        getTransformStyle(screenTranslateX = 0, screenTranslateY = 0) {
            const renderScale = this.getRenderScale();
            return `scale(${renderScale}) translate(${this.translateX + screenTranslateX / renderScale}px,${this.translateY + screenTranslateY / renderScale}px)`;
        },

        writeTransform() {
            if (this.el.imgContainer) this.el.imgContainer.style.transform = this.getTransformStyle();
        },

        applyTransform() {
            this.writeTransform();
            this.clampTransform();
            if (this.isTouchDevice && this.scale <= 1 + TOUCH_ZOOM_EPSILON) {
                this.touchPanLocked = false;
            }
            this.writeTransform();
        },

        handleMouseMove(e) {
            if (!this.isDragging) return;
            const renderScale = this.getRenderScale();
            this.translateX = this.initX + (e.clientX - this.startX) / renderScale;
            this.translateY = this.initY + (e.clientY - this.startY) / renderScale;
            this.applyTransform();
        },

        handleMouseUp() {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.el.imgContainer.classList.remove('is-grabbing');
        }
    };

    function attach(reader) {
        Object.entries(methods).forEach(([name, method]) => {
            reader[name] = method.bind(reader);
        });
        return reader;
    }

    Toolbox.readerTransform = {
        attach,
        methods
    };
})();
