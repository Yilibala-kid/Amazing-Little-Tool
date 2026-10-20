// Bilibili Toolbox - readerTouch
(function() {
    'use strict';

    const Toolbox = window.BilibiliToolbox;
    const MIN_SCALE = 0.5;
    const SWIPE_THRESHOLD = 50;
    const TAP_DELAY = 220;
    const DOUBLE_TAP_DELAY = 300;
    const TAP_ZONE_RATIO = 0.28;

    const INITIAL_TOUCH_STATE = Object.freeze({
        touchStartX: 0,
        touchStartY: 0,
        touchEndX: 0,
        touchEndY: 0,
        touchStartTime: 0,
        touchStartedOnInteractive: false,
        pendingTapTimer: null,
        lastTapTime: 0,
        lastTapX: 0,
        lastTapY: 0,
        suppressRemainingTouch: false,
        isTwoFingerGesturing: false,
        initialPinchDistance: 0,
        initialScale: 1,
        initialCenterX: 0,
        initialCenterY: 0,
        twoFingerTapCandidate: false,
        twoFingerTapStartTime: 0,
        twoFingerTapCenterX: 0,
        twoFingerTapCenterY: 0,
        lastTwoFingerTapTime: 0,
        lastTwoFingerTapCenterX: 0,
        lastTwoFingerTapCenterY: 0
    });

    const methods = {
        isInteractiveTouchTarget(target) {
            const el = target instanceof Element ? target : null;
            return el?.closest('button, a, input, textarea, select')
                || this.el.controls.contains(el)
                || this.el.settingsControls.contains(el)
                || this.el.settingsPanel.contains(el)
                || this.el.thumbnailPanel?.contains(el);
        },

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
        },

        clearPendingTap() {
            if (!this.pendingTapTimer) return;
            clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        },

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
                    return;
                }
                this.resetScaleAndPan();
                return;
            }

            this.lastTapTime = now;
            this.lastTapX = clientX;
            this.lastTapY = clientY;
            this.pendingTapTimer = setTimeout(() => {
                this.pendingTapTimer = null;
                this.handleTapNavigation(clientX);
            }, TAP_DELAY);
        },

        handleTouchStart(e) {
            if (this.isSelectingScreenshot || this.suppressRemainingTouch) return;
            if (e.touches.length > 2) {
                this.swipe?.reset();
                this.clearPendingTap();
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
                this.suppressRemainingTouch = true;
                return;
            }
            if (e.touches.length === 2) {
                this.swipe?.reset(false);
                if (this.isInteractiveTouchTarget(e.target)) {
                    this.suppressRemainingTouch = true;
                    return;
                }
                // 双指缩放开启
                e.preventDefault();
                this.clearPendingTap();
                this.setTransformTransition('none');
                this.isTwoFingerGesturing = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.hypot(dx, dy);
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
                this.touchStartTime = Date.now();
                this.touchStartedOnInteractive = this.isInteractiveTouchTarget(e.target);
                this.initX = this.translateX;
                this.initY = this.translateY;
                if (this.touchStartedOnInteractive) {
                    this.showControls();
                } else {
                    this.swipe?.start(e);
                }
            }
        },

        handleTouchMove(e) {
            if (this.isSelectingScreenshot || this.suppressRemainingTouch) return;
            if (e.touches.length === 2 && this.isTwoFingerGesturing) {
                // 双指缩放中
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.hypot(dx, dy);

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
                    if (this.swipe?.move(e)) return;
                    if (deltaX > 4 || deltaY > 4) {
                        e.preventDefault();
                        this.setTransformTransition('none');
                        const renderScale = this.getRenderScale();
                        const limits = this.getPanLimits();
                        this.translateX = this.clampPanValue(this.initX + moveX / renderScale, limits.maxX);
                        this.translateY = this.clampPanValue(this.initY + moveY / renderScale, limits.maxY);
                        this.applyTransform();
                    }
                    return;
                }

                if (deltaX > 10 && deltaX > deltaY) e.preventDefault();
            }
        },

        handleTouchEnd(e) {
            if (this.isSelectingScreenshot || this.suppressRemainingTouch) {
                if (!e.touches.length) {
                    this.suppressRemainingTouch = false;
                    this.isTwoFingerGesturing = false;
                    this.twoFingerTapCandidate = false;
                }
                return;
            }
            if (e.type === 'touchcancel') {
                this.swipe?.end(e);
                this.clearPendingTap();
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                this.suppressRemainingTouch = e.touches.length > 0;
                const isTwoFingerTap = this.twoFingerTapCandidate
                    && Date.now() - this.twoFingerTapStartTime < 300;
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
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

            if (this.swipe?.end(e)) return;

            if (this.touchStartedOnInteractive) {
                this.clearPendingTap();
                return;
            }

            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && Date.now() - this.touchStartTime < 300;
            if (Math.abs(this.translateX - this.initX) > 0.5 || Math.abs(this.translateY - this.initY) > 0.5) return;

            if (isTap) {
                e.preventDefault();
                this.handleSingleFingerTap(this.touchEndX, this.touchEndY);
                return;
            }

            this.clearPendingTap();
            // A pending foreground render can temporarily prevent the swipe
            // engine from starting. Preserve navigation in that case only.
            if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
                const dir = (deltaX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                this.turnPage(null, dir);
            }
        }
    };

    function attach(reader) {
        Object.assign(reader, INITIAL_TOUCH_STATE);
        return Toolbox.attachMethods(reader, methods);
    }

    Toolbox.readerTouch = { attach, methods };
})();
