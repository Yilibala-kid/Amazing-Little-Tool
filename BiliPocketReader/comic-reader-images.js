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
    const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;

    function normalizeImageUrl(rawSrc, options = {}) {
        if (!rawSrc || typeof rawSrc !== 'string') return '';
        let src = rawSrc.trim().replace(/^["']|["']$/g, '');
        if (!src || src.includes('base64')) return '';
        src = bilibiliDom.normalizeProtocolUrl(src);
        if (src.startsWith('http:')) src = 'https:' + src.slice(5);
        if (!src.startsWith('http')) return '';

        // Bilibili image URLs often append resize/format directives after "@"
        // (for example @672w_378h_1c.webp). Removing them asks the CDN for the
        // original file instead of a thumbnail-sized derivative.
        if (!options.preserveBiliSuffix) src = src.replace(/@[^?#]*/, '');
        return src.startsWith('http') ? src : '';
    }

    function getImageIdentity(src) {
        const normalized = normalizeImageUrl(src);
        return normalized ? normalized.split(/[?#]/)[0].split('/').pop() : '';
    }

    function isLikelyImageUrl(src) {
        return IMAGE_FILE_PATTERN.test(src);
    }

    function getImageSource(img, options = {}) {
        for (const attr of IMAGE_ATTRS) {
            const value = img.getAttribute(attr);
            const src = normalizeImageUrl(value, options);
            if (src && isLikelyImageUrl(src)) return src;
        }
        return '';
    }

    function isNoiseImage(img, src) {
        return img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover')
            || img.classList.contains('emoji')
            || src.includes('emote')
            || src.includes('emoji')
            || src.includes('garb');
    }

    function pushBestImage(images, fileSet, img, options = {}) {
        const src = getImageSource(img, options);
        if (!src || isNoiseImage(img, src)) return;

        const fileName = getImageIdentity(src);
        if (!fileName || fileSet.has(fileName)) return;

        fileSet.add(fileName);
        images.push(src);
    }

    function collectDynamicImagesFromState(options = {}) {
        const modules = window.__INITIAL_STATE__?.detail?.modules;
        if (!Array.isArray(modules)) return [];

        return modules.flatMap(module => {
            const pics = module?.module_top?.display?.album?.pics;
            if (!Array.isArray(pics)) return [];
            return pics
                .map(pic => normalizeImageUrl(pic?.url || '', options))
                .filter(isLikelyImageUrl);
        });
    }

    function collectDynamicImagesFromDom(options = {}) {
        const fileSet = new Set();
        const images = [];
        const primaryImages = bilibiliDom.getPrimaryImages();
        primaryImages.forEach(img => pushBestImage(images, fileSet, img, options));

        // Thumbnail strips are a last resort. They are useful on some album
        // pages, but preferring them can make the reader display low-res images.
        if (images.length === 0) {
            bilibiliDom.getFallbackImages().forEach(img => pushBestImage(images, fileSet, img, options));
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

    function collectImages(options = {}) {
        const stateImages = collectDynamicImagesFromState(options);
        const mergedImages = stateImages.length ? stateImages : sortImagesByDomPosition(collectDynamicImagesFromDom(options));
        const seen = new Set();
        return mergedImages.filter(src => {
            const fileName = getImageIdentity(src);
            if (!fileName || seen.has(fileName)) return false;
            seen.add(fileName);
            return true;
        });
    }

    Toolbox.comicImages = {
        normalizeImageUrl,
        getImageIdentity,
        isLikelyImageUrl,
        getImageSource,
        collectDynamicImagesFromState,
        collectDynamicImagesFromDom,
        sortImagesByDomPosition,
        collectImages
    };
})();
