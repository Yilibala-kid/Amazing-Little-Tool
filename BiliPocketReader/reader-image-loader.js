// Bilibili Toolbox - bounded decoded-image cache and preload scheduling
(function() {
    'use strict';
    const Toolbox = window.BilibiliToolbox;
    const PRELOAD_COUNT = 2;
    const CACHE_PIXEL_BUDGET = 32e6;

    class ReaderImageLoader {
        constructor(getState) {
            this.getState = getState;
            this.imageCache = new Map();
            this.preloadToken = 0;
            this.preloadTimer = null;
            this.preloadActive = null;
        }

        loadImage(src, preload = false) {
            if (!this.getState().isOpen || !src) return Promise.resolve(null);
            const cached = this.imageCache.get(src);
            if (cached) {
                if (!preload) cached.image.fetchPriority = 'high';
                return cached.promise;
            }

            const img = new Image();
            const entry = { image: img, pixels: 0, promise: null, settled: false, released: false };
            img.decoding = 'async';
            img.fetchPriority = preload ? 'low' : 'high';
            entry.promise = new Promise((resolve) => {
                entry.release = () => {
                    if (entry.released) return;
                    entry.released = true;
                    // Detach first: browser image-loader bookkeeping can retain
                    // an image after cancellation; it must not retain the UI tree.
                    Toolbox.releaseImage(img);
                    resolve(null); // Also unblock a network/decode wait on close.
                };
                img.onload = async () => {
                    entry.pixels = img.naturalWidth * img.naturalHeight;
                    // onload can precede the first decoded frame of a large original.
                    try { await img.decode?.(); } catch (_) { /* onload already succeeded. */ }
                    if (entry.released) return;
                    entry.settled = true;
                    img.onload = img.onerror = null;
                    resolve(img);
                    if (this.imageCache.get(src) === entry) this.pruneImageCache();
                };
                img.onerror = () => {
                    if (this.imageCache.get(src) === entry) this.imageCache.delete(src);
                    entry.release();
                };
            });
            this.imageCache.set(src, entry);
            img.src = src;
            return entry.promise;
        }

        releaseCachedImage(src) {
            const entry = this.imageCache.get(src);
            this.imageCache.delete(src);
            entry?.release();
        }

        cancelPreload() {
            this.preloadToken += 1;
            clearTimeout(this.preloadTimer);
            this.preloadTimer = null;
        }

        preloadImages(startIndex = 0, delay = 800) {
            this.cancelPreload();
            const state = this.getState();
            if (!state.isOpen || !Array.isArray(state.imgList) || state.imgList.length === 0) return;
            const start = Math.max(0, Math.min(startIndex, state.imgList.length));
            const end = Math.min(state.imgList.length, start + PRELOAD_COUNT);
            const token = this.preloadToken;
            let index = start;
            const next = async () => {
                this.preloadTimer = null;
                // A previous navigation may still be decoding one background
                // image. Never start a second speculative decode alongside it.
                if (this.preloadActive) await this.preloadActive;
                if (token !== this.preloadToken) return;
                while (index < end && this.imageCache.has(state.imgList[index])) index += 1;
                if (index >= end) return;
                const estimate = Math.max(1e6, ...Array.from(this.imageCache.values(), entry => entry.pixels));
                this.pruneImageCache(start, estimate);
                const pixels = Array.from(this.imageCache.values()).reduce((sum, entry) => sum + entry.pixels, 0);
                if (pixels + estimate > CACHE_PIXEL_BUDGET) return;
                const pending = this.loadImage(state.imgList[index++], true);
                this.preloadActive = pending;
                await pending;
                if (this.preloadActive === pending) this.preloadActive = null;
                if (token === this.preloadToken && index < end) {
                    this.preloadTimer = setTimeout(next, 120);
                }
            };
            // Let the visible page and its transition finish before background
            // decoding competes for memory bandwidth. Yield between originals.
            this.preloadTimer = setTimeout(next, delay);
        }

        pruneImageCache(preloadStart, reservePixels = 0) {
            const state = this.getState();
            preloadStart ??= state.currentIndex + state.activePageCount;
            if (!this.imageCache.size || !Array.isArray(state.imgList) || !state.imgList.length) return;
            const keepStart = Math.max(0, state.currentIndex - PRELOAD_COUNT);
            const keepEnd = Math.min(
                state.imgList.length,
                Math.max(state.currentIndex + state.activePageCount, preloadStart + PRELOAD_COUNT)
            );
            const keepUrls = new Set(state.imgList.slice(keepStart, keepEnd));
            const protectedUrls = new Set(state.imgList.slice(state.currentIndex, state.currentIndex + 2));
            for (const src of state.visibleSources) protectedUrls.add(src);
            for (const src of this.imageCache.keys()) {
                const entry = this.imageCache.get(src);
                if (!protectedUrls.has(src) && (!keepUrls.has(src) || !entry.settled)) this.releaseCachedImage(src);
            }
            let pixels = Array.from(this.imageCache.values()).reduce((sum, entry) => sum + entry.pixels, 0);
            const candidates = Array.from(this.imageCache.keys()).filter(src => !protectedUrls.has(src))
                .sort((a, b) => Math.abs(state.imgList.indexOf(b) - state.currentIndex) - Math.abs(state.imgList.indexOf(a) - state.currentIndex));
            for (const src of candidates) {
                if (pixels + reservePixels <= CACHE_PIXEL_BUDGET) break;
                pixels -= this.imageCache.get(src).pixels;
                this.releaseCachedImage(src);
            }
        }

        clear() {
            this.cancelPreload();
            for (const src of this.imageCache.keys()) this.releaseCachedImage(src);
            this.preloadActive = null;
        }
    }
    Toolbox.ReaderImageLoader = ReaderImageLoader;
})();
