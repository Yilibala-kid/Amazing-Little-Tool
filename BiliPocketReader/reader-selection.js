// Bilibili Toolbox - reader screenshot selection helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const readerScreenshot = Toolbox.readerScreenshot;

    const methods = {
        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        },

        getReaderPoint(clientX, clientY) {
            const rect = this.el.reader.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, clientY - rect.top))
            };
        },

        normalizeSelectionRect(start = this.selectionStart, end = this.selectionCurrent) {
            if (!start || !end) return null;
            return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        },

        hasValidSelection(rect = this.normalizeSelectionRect()) {
            return Boolean(rect && rect.width >= 8 && rect.height >= 8);
        },

        updateSelectionActions() {
            const hasSelection = this.hasValidSelection();
            this.el.selectionSaveBtn.disabled = !hasSelection;
            this.el.selectionSaveBtn.classList.toggle('is-disabled', !hasSelection);
        },

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
        },

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionDragMode = null;
            this.selectionMoveStart = null;
            this.selectionMoveRect = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this._hideHandles();
            this.updateSelectionActions();
        },

        _hideHandles() {
            for (const h of Object.values(this.selectionHandles)) {
                h.style.display = 'none';
            }
        },

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
        },

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58');
            if (restoreControls) { this.selectionWasControlsVisible ? this.showControls() : this.hideControls(); }
            if (showMessage) this.showReaderMessage('\u5df2\u53d6\u6d88\u622a\u56fe');
        },

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

            if (e.target === this.el.selectionBox && this.hasValidSelection()) {
                const rect = this.normalizeSelectionRect();
                this.selectionStart = { x: rect.x, y: rect.y };
                this.selectionCurrent = { x: rect.x + rect.width, y: rect.y + rect.height };
                this.resizeDirection = null;
                this.selectionDragMode = 'move';
                this.selectionMoveStart = this.getReaderPoint(e.clientX, e.clientY);
                this.selectionMoveRect = rect;
                this.isDraggingSelection = true;
                this.setSelectionHint('\u62d6\u52a8\u9009\u533a\u79fb\u52a8\u622a\u56fe\u8303\u56f4');
                this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
                return;
            }

            if (e.target.closest?.('.comic-sel-handle')) return;

            this.isDraggingSelection = true;
            this.resizeDirection = null;
            this.selectionDragMode = 'create';
            this.selectionMoveStart = null;
            this.selectionMoveRect = null;
            this.selectionStart = this.getReaderPoint(e.clientX, e.clientY);
            this.selectionCurrent = this.selectionStart;
            this.updateSelectionBox();
            this.updateSelectionActions();
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u62d6\u52a8\u8fb9\u89d2\u5fae\u8c03');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        },

        handleSelectionPointerMove(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();

            const pt = this.getReaderPoint(e.clientX, e.clientY);
            const MIN = 8;

            if (this.selectionDragMode === 'move' && this.selectionMoveStart && this.selectionMoveRect) {
                const readerRect = this.el.reader.getBoundingClientRect();
                const dx = pt.x - this.selectionMoveStart.x;
                const dy = pt.y - this.selectionMoveStart.y;
                const rect = this.selectionMoveRect;
                const x = Math.max(0, Math.min(readerRect.width - rect.width, rect.x + dx));
                const y = Math.max(0, Math.min(readerRect.height - rect.height, rect.y + dy));
                this.selectionStart = { x, y };
                this.selectionCurrent = { x: x + rect.width, y: y + rect.height };
            } else if (this.resizeDirection) {
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
        },

        handleSelectionPointerUp(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionDragMode = null;
            this.selectionMoveStart = null;
            this.selectionMoveRect = null;

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
        },

        async saveSelectionScreenshot() {
            if (!this.hasValidSelection()) {
                this.showReaderMessage('\u8bf7\u5148\u62d6\u52a8\u9009\u51fa\u622a\u56fe\u8303\u56f4', true);
                return;
            }

            const success = await this.captureScreenshot(this.normalizeSelectionRect());
            if (success) {
                this.updateSelectionBox();
                this.updateSelectionActions();
                this.setSelectionHint('\u622a\u56fe\u5df2\u4fdd\u5b58\uff0c\u53ef\u7ee7\u7eed\u8c03\u6574\u9009\u533a\u6216\u70b9\u51fb\u53d6\u6d88\u622a\u56fe\u9000\u51fa');
            }
        },

        async saveFullScreenshot() {
            const descriptors = this.getVisibleImageDescriptors();
            const rect = readerScreenshot.getBounds(descriptors);
            if (!rect) {
                this.showReaderMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u622a\u56fe\u7684\u9875\u9762', true);
                return;
            }

            const success = await this.captureScreenshot(rect, descriptors);
            if (success) {
                this.setSelectionHint('\u6574\u9875\u622a\u56fe\u5df2\u4fdd\u5b58\uff0c\u53ef\u7ee7\u7eed\u622a\u56fe\u6216\u70b9\u51fb\u53d6\u6d88\u622a\u56fe\u9000\u51fa');
            }
        }
    };

    function attach(reader) {
        Object.entries(methods).forEach(([name, method]) => {
            reader[name] = method.bind(reader);
        });
        return reader;
    }

    Toolbox.readerSelection = {
        attach,
        methods
    };
})();
