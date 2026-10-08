// Bilibili Toolbox - on-demand thumbnail navigation
(function() {
    'use strict';
    const Toolbox = window.BilibiliToolbox;

    function thumbnailSource(src) {
        try {
            const url = new URL(src);
            if (/(^|\.)hdslb\.com$/i.test(url.hostname)) {
                url.pathname = url.pathname.replace(/@.*$/, '') + '@240w.webp';
            }
            return url.href;
        } catch (_) { return src; }
    }

    function releaseThumbnail(card) {
        const image = card.querySelector('img');
        if (image) Toolbox.releaseImage(image);
    }

    function loadThumbnail(card, src) {
        if (card.querySelector('img')) return;
        const preview = card.querySelector('.comic-thumbnail-preview');
        preview.textContent = '';
        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.loading = 'lazy';
        image.draggable = false;
        image.onerror = () => {
            Toolbox.releaseImage(image);
            preview.textContent = '预览不可用';
        };
        preview.appendChild(image);
        image.src = thumbnailSource(src);
    }

    const methods = {
        isThumbnailsVisible() {
            return Boolean(this.el.thumbnailPanel && !this.el.thumbnailPanel.hidden);
        },

        createThumbnailPanel() {
            const panel = document.createElement('div');
            panel.className = 'comic-thumbnails-panel';
            panel.id = 'comic-thumbnails-panel';
            panel.hidden = true;
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-label', '缩略图导航');
            const dialog = document.createElement('div');
            dialog.className = 'comic-thumbnails-dialog';
            const header = document.createElement('div');
            header.className = 'comic-thumbnails-header';
            const title = document.createElement('h2');
            title.textContent = '缩略图导航';
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'comic-btn';
            close.textContent = '关闭';
            close.setAttribute('aria-label', '关闭缩略图导航');
            const hint = document.createElement('p');
            hint.className = 'comic-thumbnails-hint';
            hint.textContent = `共 ${this.imgList.length} 页 · 点击跳转，粉色标记当前页`;
            const grid = document.createElement('div');
            grid.className = 'comic-thumbnails-grid';
            header.append(title, close);
            dialog.append(header, hint, grid);
            panel.appendChild(dialog);
            this.el.reader.appendChild(panel);
            Object.assign(this.el, { thumbnailPanel: panel, thumbnailGrid: grid, thumbnailCloseBtn: close, thumbnailHint: hint });
            const on = (...args) => this.eventBag.on(...args);
            on(close, 'click', () => this.hideThumbnails(true));
            on(panel, 'click', event => {
                event.stopPropagation();
                if (event.target === panel) this.hideThumbnails(true);
            });
            // Keep scrolling and gestures inside the navigator out of reader controls.
            for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'pointerdown']) {
                on(panel, type, event => event.stopPropagation(), { passive: true });
            }
            on(grid, 'click', event => {
                const card = event.target.closest('.comic-thumbnail');
                if (!card || !grid.contains(card)) return;
                const index = Number(card.dataset.index);
                this.hideThumbnails(true);
                this.jumpToImage(index);
            });
            on(panel, 'keydown', event => {
                event.stopPropagation();
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.hideThumbnails(true);
                    return;
                }
                const cards = Array.from(grid.children);
                const index = cards.indexOf(document.activeElement);
                let next = null;
                if (index >= 0) {
                    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
                    if (event.key === 'ArrowRight') next = Math.min(cards.length - 1, index + 1);
                    if (event.key === 'Home') next = 0;
                    if (event.key === 'End') next = cards.length - 1;
                }
                if (next !== null) {
                    event.preventDefault();
                    cards[next].focus();
                }
                if (event.key === 'Tab') {
                    const last = cards.at(-1) || close;
                    if (event.shiftKey && document.activeElement === close) {
                        event.preventDefault(); last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault(); close.focus();
                    }
                }
            });
        },

        toggleThumbnails() {
            if (this.isThumbnailsVisible()) { this.hideThumbnails(true); return; }
            if (!this.isOpen || this.isSelectingScreenshot || !this.imgList.length) return;
            this.hideSettingsPanel();
            this.clearPendingTap();
            this.showControls();
            if (!this.el.thumbnailPanel) this.createThumbnailPanel();
            const { thumbnailPanel: panel, thumbnailGrid: grid } = this.el;
            this.el.thumbnailHint.textContent = `共 ${this.imgList.length} 页 · 点击跳转，粉色标记当前页`;
            const fragment = document.createDocumentFragment();
            this.imgList.forEach((_src, index) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'comic-thumbnail';
                card.dataset.index = String(index);
                card.setAttribute('aria-label', `第 ${index + 1} 页`);
                const preview = document.createElement('span');
                preview.className = 'comic-thumbnail-preview';
                const label = document.createElement('span');
                label.className = 'comic-thumbnail-number';
                label.textContent = String(index + 1);
                card.append(preview, label);
                fragment.appendChild(card);
            });
            grid.replaceChildren(fragment);
            panel.hidden = false;
            this.el.reader.classList.add('thumbnails-open');
            this.el.thumbnailsBtn.setAttribute('aria-expanded', 'true');
            this.syncThumbnailSelection();
            const current = grid.children[this.displayedIndex] || grid.firstElementChild;
            if (current) {
                current.focus({ preventScroll: true });
                grid.scrollTop = current.offsetTop - (grid.clientHeight - current.offsetHeight) / 2;
            }
            if (typeof IntersectionObserver === 'function') {
                this.thumbnailObserver = new IntersectionObserver(entries => {
                    if (!this.isThumbnailsVisible()) return;
                    for (const entry of entries) {
                        if (!grid.contains(entry.target)) continue;
                        if (entry.isIntersecting) loadThumbnail(entry.target, this.imgList[Number(entry.target.dataset.index)]);
                        else releaseThumbnail(entry.target);
                    }
                }, { root: grid, rootMargin: '160px 0px' });
                for (const card of grid.children) this.thumbnailObserver.observe(card);
            } else {
                // Native lazy loading is the fallback for browsers without observers.
                for (const card of grid.children) loadThumbnail(card, this.imgList[Number(card.dataset.index)]);
            }
        },

        syncThumbnailSelection() {
            if (!this.isThumbnailsVisible()) return;
            const start = this.displayedIndex;
            for (const card of this.el.thumbnailGrid.children) {
                const index = Number(card.dataset.index);
                const selected = index >= start && index < start + this.activePageCount;
                card.classList.toggle('is-current', selected);
                card.setAttribute('aria-current', selected ? 'page' : 'false');
                card.setAttribute('aria-label', `第 ${index + 1} 页${selected ? '，当前显示' : ''}`);
            }
        },

        hideThumbnails(restoreFocus = false) {
            this.thumbnailObserver?.disconnect();
            this.thumbnailObserver = null;
            if (!this.el.thumbnailPanel) return;
            this.el.thumbnailPanel.hidden = true;
            this.el.reader.classList.remove('thumbnails-open');
            this.el.thumbnailsBtn.setAttribute('aria-expanded', 'false');
            for (const card of this.el.thumbnailGrid.children) releaseThumbnail(card);
            this.el.thumbnailGrid.replaceChildren();
            if (restoreFocus) {
                this.showControls();
                this.el.thumbnailsBtn.focus({ preventScroll: true });
            }
        }
    };

    Toolbox.readerThumbnails = { attach: reader => Toolbox.attachMethods(reader, methods) };
})();
