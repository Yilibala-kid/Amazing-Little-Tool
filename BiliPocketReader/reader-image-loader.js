// Bilibili Toolbox - reader image cache and configurable preload scheduling
(function() {
    'use strict';
    const Toolbox = window.BilibiliToolbox;
    const PRELOAD_COUNTS = Object.freeze({ '2': 2, '4': 4, '6': 6 });

    class ReaderImageLoader {
        constructor(getState) {
            this.getState = getState;
            this.imageCache = new Map();
            this.preloadToken = 0;
            this.preloadTimer = null;
            this.preloadActive = null;
            this.imageProtections = new Set();
        }

        loadImage(src, preload = false) {
            const state = this.getState();
            if (!(state.isOpen || state.isPreparing) || !src) return Promise.resolve(null);
            const cached = this.imageCache.get(src);
            if (cached) {
                if (!preload) cached.image.fetchPriority = 'high';
                // A browser may discard a cached original's decoded frame under
                // memory pressure. Prepare it again before touching the viewport.
                if (!preload && cached.settled) return this.prepareCachedFrame(cached);
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
                    entry.releaseFrame?.();
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

        prepareCachedFrame(entry) {
            if (entry.framePromise) return entry.framePromise;
            entry.framePromise = new Promise(resolve => {
                entry.releaseFrame = () => resolve(null);
                Promise.resolve().then(() => entry.released ? null : entry.image.decode?.())
                    .catch(() => { /* A successfully loaded image remains usable. */ })
                    .then(() => resolve(entry.released ? null : entry.image));
            }).finally(() => {
                entry.framePromise = null;
                entry.releaseFrame = null;
            });
            return entry.framePromise;
        }

        releaseCachedImage(src) {
            const entry = this.imageCache.get(src);
            this.imageCache.delete(src);
            entry?.release();
        }

        protectImages(sources) {
            const protection = new Set(sources);
            this.imageProtections.add(protection);
            return () => this.imageProtections.delete(protection);
        }

        cancelPreload() {
            this.preloadToken += 1;
            clearTimeout(this.preloadTimer);
            this.preloadTimer = null;
        }

        getPreloadCount() {
            const state = this.getState();
            return PRELOAD_COUNTS[state.preloadPages] || state.imgList.length;
        }

        preloadImages(startIndex = 0, delay = 800) {
            this.cancelPreload();
            const state = this.getState();
            if (!(state.isOpen || state.isPreparing) || !Array.isArray(state.imgList) || state.imgList.length === 0) return;
            const loadAll = !PRELOAD_COUNTS[state.preloadPages];
            // Every full-article queue resumes at the earliest missing page,
            // including when opened or restarted while reading a later page.
            const start = loadAll ? 0 : Math.max(0, Math.min(startIndex, state.imgList.length));
            const end = Math.min(state.imgList.length, start + this.getPreloadCount());
            const token = this.preloadToken;
            let index = start;
            const next = async () => {
                this.preloadTimer = null;
                // A previous navigation may still be decoding one background
                // image. Never start a second speculative decode alongside it.
                if (this.preloadActive) await this.preloadActive;
                if (token !== this.preloadToken) return;
                const currentState = this.getState();
                while (index < end) {
                    const cached = this.imageCache.get(state.imgList[index]);
                    // Respect explicit disposal of already-read pages. Full
                    // preloading must not reload them after every page turn.
                    const releasedPage = loadAll && currentState.imageMemoryPolicy === 'previous' &&
                        index < (currentState.displayedIndex ?? currentState.currentIndex);
                    if (!releasedPage && !(cached && (!loadAll || cached.settled))) break;
                    index += 1;
                }
                if (index >= end) return;
                this.pruneImageCache();
                // An unfinished foreground request also belongs to this ordered
                // queue: wait for its decode before advancing to the next page.
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

        pruneImageCache() {
            const state = this.getState();
            if (state.imageMemoryPolicy !== 'previous') return;
            if (!this.imageCache.size || !Array.isArray(state.imgList) || !state.imgList.length) return;
            const visibleSources = new Set(state.visibleSources || []);
            for (const protection of this.imageProtections) {
                for (const src of protection) visibleSources.add(src);
            }
            // Backward navigation can prepare predecessors while a later page
            // remains visible. Keep the incoming single/double group until commit.
            for (const src of state.imgList.slice(state.currentIndex, state.currentIndex + 2)) visibleSources.add(src);
            const index = Math.max(0, state.displayedIndex ?? state.currentIndex);
            const retainedSources = new Set(state.imgList.slice(index));
            for (const src of this.imageCache.keys()) {
                if (!visibleSources.has(src) && !retainedSources.has(src)) this.releaseCachedImage(src);
            }
        }

        pause() {
            this.cancelPreload();
            for (const [src, entry] of this.imageCache) {
                if (!entry.settled) this.releaseCachedImage(src);
            }
            this.preloadActive = null;
            this.imageProtections.clear();
        }

        clear() {
            this.cancelPreload();
            for (const src of this.imageCache.keys()) this.releaseCachedImage(src);
            this.preloadActive = null;
            this.imageProtections.clear();
        }
    }
    Toolbox.ReaderImageLoader = ReaderImageLoader;
})();
