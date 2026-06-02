// Bilibili Toolbox - comic reader image collection
(function() {
    'use strict';

    const Toolbox = window.BilibiliToolbox || (window.BilibiliToolbox = {});
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
    const PRIMARY_IMAGE_SELECTOR = `
        .opus-module-content img,
        .article-content img,
        .bili-rich-text img,
        .opus-read-content img,
        .horizontal-scroll-album__pic__img img
    `;
    const FALLBACK_IMAGE_SELECTOR = `
        .horizontal-scroll-album__indicator__thumbnail img
    `;
    const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;

    function normalizeImageUrl(rawSrc) {
        if (!rawSrc || typeof rawSrc !== 'string') return '';
        let src = rawSrc.trim().replace(/^["']|["']$/g, '');
        if (!src || src.includes('base64')) return '';
        if (src.startsWith('//')) src = 'https:' + src;
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

    function parseSrcset(srcset) {
        if (!srcset || typeof srcset !== 'string') return [];
        return srcset
            .split(',')
            .map(part => part.trim().split(/\s+/)[0])
            .filter(Boolean);
    }

    function getImageSourceCandidates(img) {
        const rawCandidates = [];
        IMAGE_ATTRS.forEach(attr => {
            const value = img.getAttribute(attr);
            if (value) rawCandidates.push(value);
        });

        if (img.currentSrc) rawCandidates.push(img.currentSrc);
        rawCandidates.push(...parseSrcset(img.getAttribute('srcset')));
        rawCandidates.push(...parseSrcset(img.getAttribute('data-srcset')));

        const picture = img.closest('picture');
        picture?.querySelectorAll('source').forEach(source => {
            rawCandidates.push(...parseSrcset(source.getAttribute('srcset')));
            rawCandidates.push(...parseSrcset(source.getAttribute('data-srcset')));
        });

        const link = img.closest('a')?.href;
        if (link) rawCandidates.push(link);

        const seen = new Set();
        return rawCandidates
            .map(normalizeImageUrl)
            .filter(isLikelyImageUrl)
            .filter(src => {
                if (!src || seen.has(src)) return false;
                seen.add(src);
                return true;
            });
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
                .map(pic => normalizeImageUrl(pic?.url || ''))
                .filter(Boolean);
        });
    }

    function collectDynamicImagesFromDom() {
        const fileSet = new Set();
        const images = [];
        const primaryImages = Array.from(document.querySelectorAll(PRIMARY_IMAGE_SELECTOR));
        primaryImages.forEach(img => pushBestImage(images, fileSet, img));

        // Thumbnail strips are a last resort. They are useful on some album
        // pages, but preferring them can make the reader display low-res images.
        if (images.length === 0) {
            Array.from(document.querySelectorAll(FALLBACK_IMAGE_SELECTOR))
                .forEach(img => pushBestImage(images, fileSet, img));
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
        getImageSourceCandidates,
        collectDynamicImagesFromState,
        collectDynamicImagesFromDom,
        sortImagesByDomPosition,
        collectImages
    };
})();
