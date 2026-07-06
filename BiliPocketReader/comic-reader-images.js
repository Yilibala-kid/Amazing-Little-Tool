// Bilibili Toolbox - comic reader image collection
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const IMAGE_ATTRS = [
        'data-origin-src',
        'data-original',
        'data-original-src',
        'data-large-src',
        'data-url',
        'data-image',
        'data-src',
        'src'
    ];
    const ORIGINAL_IMAGE_ATTRS = new Set([
        'data-origin-src',
        'data-original',
        'data-original-src',
        'data-large-src'
    ]);
    const CANDIDATE_PRIORITY = Object.freeze({
        original: 4,
        state: 3,
        responsive: 2,
        regular: 1
    });
    const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;

    function normalizeImageUrl(rawSrc) {
        if (!rawSrc || typeof rawSrc !== 'string') return '';
        let src = rawSrc.trim().replace(/^["']|["']$/g, '');
        if (!src || src.includes('base64')) return '';
        src = bilibiliDom.normalizeProtocolUrl(src);
        if (src.startsWith('http:')) src = 'https:' + src.slice(5);
        if (!src.startsWith('http')) return '';

        // Bilibili image URLs often append resize/format directives after "@"
        // (for example @672w_378h_1c.webp). Removing them asks the CDN for the
        // original file instead of a thumbnail-sized derivative.
        src = src.replace(/@[^?#]*/, '');
        return src.startsWith('http') ? src : '';
    }

    function getImageIdentity(src) {
        const normalized = normalizeImageUrl(src);
        return normalized ? normalized.split(/[?#]/)[0].split('/').pop() : '';
    }

    function isLikelyImageUrl(src) {
        return IMAGE_FILE_PATTERN.test(src);
    }

    function parseSrcsetEntries(srcset) {
        if (!srcset || typeof srcset !== 'string') return [];
        return srcset
            .split(',')
            .map((part, index) => {
                const [url, descriptor = ''] = part.trim().split(/\s+/);
                return url ? { url, descriptor, index } : null;
            })
            .filter(Boolean);
    }

    function parseSrcset(srcset) {
        return parseSrcsetEntries(srcset).map(entry => entry.url);
    }

    function parseImageSizeHint(rawSrc, descriptor = '') {
        const hint = { width: 0, height: 0, density: 0 };
        const suffix = String(rawSrc || '').match(/@([^?#]*)/)?.[1] || '';
        const width = suffix.match(/(?:^|_)(\d+)w(?:_|$|\.)/i)?.[1];
        const height = suffix.match(/(?:^|_)(\d+)h(?:_|$|\.)/i)?.[1];
        if (width) hint.width = Number.parseInt(width, 10) || 0;
        if (height) hint.height = Number.parseInt(height, 10) || 0;

        const descriptorText = String(descriptor || '').trim();
        const widthDescriptor = descriptorText.match(/^(\d+(?:\.\d+)?)w$/i);
        const densityDescriptor = descriptorText.match(/^(\d+(?:\.\d+)?)x$/i);
        if (widthDescriptor) hint.width = Math.max(hint.width, Number.parseFloat(widthDescriptor[1]) || 0);
        if (densityDescriptor) hint.density = Number.parseFloat(densityDescriptor[1]) || 0;

        return hint;
    }

    function getSizeScore(rawSrc, descriptor = '') {
        const size = parseImageSizeHint(rawSrc, descriptor);
        if (size.width && size.height) return size.width * size.height;
        if (size.width) return size.width * 1000;
        if (size.height) return size.height * 1000;
        if (size.density) return size.density * 100000;
        return 0;
    }

    function createImageCandidate(rawSrc, tier, order, descriptor = '') {
        const src = normalizeImageUrl(rawSrc);
        if (!src || !isLikelyImageUrl(src)) return null;
        return {
            src,
            priority: CANDIDATE_PRIORITY[tier] || CANDIDATE_PRIORITY.regular,
            sizeScore: getSizeScore(rawSrc, descriptor),
            order
        };
    }

    function addCandidate(candidates, rawSrc, tier, order, descriptor = '') {
        const candidate = createImageCandidate(rawSrc, tier, order, descriptor);
        if (candidate) candidates.push(candidate);
    }

    function sortCandidates(candidates) {
        const bestBySrc = new Map();
        candidates.forEach(candidate => {
            const existing = bestBySrc.get(candidate.src);
            if (!existing
                || candidate.priority > existing.priority
                || (candidate.priority === existing.priority && candidate.sizeScore > existing.sizeScore)
                || (candidate.priority === existing.priority && candidate.sizeScore === existing.sizeScore && candidate.order < existing.order)) {
                bestBySrc.set(candidate.src, candidate);
            }
        });

        return Array.from(bestBySrc.values()).sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            if (b.sizeScore !== a.sizeScore) return b.sizeScore - a.sizeScore;
            return a.order - b.order;
        });
    }

    function getImageSourceCandidates(img) {
        const candidates = [];
        let order = 0;
        IMAGE_ATTRS.forEach(attr => {
            const value = img.getAttribute(attr);
            if (value) addCandidate(candidates, value, ORIGINAL_IMAGE_ATTRS.has(attr) ? 'original' : 'regular', order++);
        });

        if (img.currentSrc) addCandidate(candidates, img.currentSrc, 'responsive', order++);
        parseSrcsetEntries(img.getAttribute('srcset')).forEach(entry => {
            addCandidate(candidates, entry.url, 'responsive', order++, entry.descriptor);
        });
        parseSrcsetEntries(img.getAttribute('data-srcset')).forEach(entry => {
            addCandidate(candidates, entry.url, 'responsive', order++, entry.descriptor);
        });

        const picture = img.closest('picture');
        picture?.querySelectorAll('source').forEach(source => {
            parseSrcsetEntries(source.getAttribute('srcset')).forEach(entry => {
                addCandidate(candidates, entry.url, 'responsive', order++, entry.descriptor);
            });
            parseSrcsetEntries(source.getAttribute('data-srcset')).forEach(entry => {
                addCandidate(candidates, entry.url, 'responsive', order++, entry.descriptor);
            });
        });

        const link = img.closest('a')?.href;
        if (link) addCandidate(candidates, link, 'responsive', order++);

        return sortCandidates(candidates).map(candidate => candidate.src);
    }

    function isNoiseImage(img, src) {
        return img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover')
            || img.classList.contains('emoji')
            || src.includes('emote')
            || src.includes('emoji')
            || src.includes('garb');
    }

    function pushBestImage(images, fileSet, img) {
        const candidates = getImageSourceCandidates(img);
        const src = candidates[0] || '';
        if (!src || isNoiseImage(img, src)) return;

        const fileName = getImageIdentity(src);
        if (!fileName || fileSet.has(fileName)) return;

        fileSet.add(fileName);
        images.push(src);
    }

    function collectDynamicImagesFromState() {
        const modules = window.__INITIAL_STATE__?.detail?.modules;
        if (!Array.isArray(modules)) return [];

        return modules.flatMap(module => {
            const pics = module?.module_top?.display?.album?.pics;
            if (!Array.isArray(pics)) return [];
            return pics
                .map((pic, index) => createImageCandidate(pic?.url || '', 'state', index))
                .filter(Boolean)
                .map(candidate => candidate.src)
                .filter(Boolean);
        });
    }

    function collectDynamicImagesFromDom() {
        const fileSet = new Set();
        const images = [];
        const primaryImages = bilibiliDom.getPrimaryImages();
        primaryImages.forEach(img => pushBestImage(images, fileSet, img));

        // Thumbnail strips are a last resort. They are useful on some album
        // pages, but preferring them can make the reader display low-res images.
        if (images.length === 0) {
            bilibiliDom.getFallbackImages().forEach(img => pushBestImage(images, fileSet, img));
        }

        return images;
    }

    function sortImagesByDomPosition(images) {
        return [...images].sort((a, b) => {
            const getTop = (url) => {
                const fn = getImageIdentity(url);
                const el = document.querySelector(`img[src*="${fn}"], img[data-src*="${fn}"]`);
                return el ? el.getBoundingClientRect().top + window.scrollY : 0;
            };
            return getTop(a) - getTop(b);
        });
    }

    function collectImages() {
        const mergedImages = [
            ...collectDynamicImagesFromState(),
            ...collectDynamicImagesFromDom()
        ];
        const seen = new Set();
        const uniqueImages = mergedImages.filter(src => {
            const fileName = getImageIdentity(src);
            if (!fileName || seen.has(fileName)) return false;
            seen.add(fileName);
            return true;
        });

        return sortImagesByDomPosition(uniqueImages);
    }

    Toolbox.comicImages = {
        normalizeImageUrl,
        getImageIdentity,
        isLikelyImageUrl,
        parseSrcset,
        parseImageSizeHint,
        getImageSourceCandidates,
        collectDynamicImagesFromState,
        collectDynamicImagesFromDom,
        sortImagesByDomPosition,
        collectImages
    };
})();
