// Bilibili Toolbox - Bilibili DOM and URL adapter
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const COMIC_URL_PATTERNS = Object.freeze([
        'bilibili.com/read/',
        'bilibili.com/opus/',
        't.bilibili.com/'
    ]);
    const ARTICLE_URL_PATTERN = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/read\/(?:cv\d+|mobile|native)(?:[/?#]|$)/i;
    const SPACE_OPUS_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/(\d+)\/upload\/opus(?:[/?#]|$)/i;
    const SPACE_DYNAMIC_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/\d+\/dynamic(?:[/?#]|$)/i;
    const CONTENT_TAB_SELECTOR = '.content-filter .content-tab';
    const DYNAMIC_CARD_SELECTOR = '.bili-dyn-list__item, .bili-dyn-item, .bili-opus-view';
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
    const ARTICLE_AUTHOR_LINK_SELECTORS = Object.freeze([
        '.article-author a[href*="space"]',
        '.article-info a[href*="space"]',
        '.author-info a[href*="space"]',
        '.up-info a[href*="space"]',
        '.opus-module-author a[href*="space"]',
        '[class*="author"] a[href*="space"]',
        '[class*="up"] a[href*="space"]',
        'a[href*="space.bilibili.com/"]',
        'a[href*="/space/"]'
    ]);
    const AUTHOR_SCOPE_SELECTOR = '.article-author, .article-info, .author-info, .up-info, [class*="author"], [class*="up"]';
    const USER_NAME_SELECTOR = '.user-name, .user-name-shadow, .name';
    const USER_FACE_SELECTOR = '.user-face img, .avatar img, [class*="face"] img';

    function queryAll(selector, root = document) {
        return Array.from(root?.querySelectorAll?.(selector) || []);
    }

    function query(selector, root = document) {
        return root?.querySelector?.(selector) || null;
    }

    function normalizeProtocolUrl(src) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('//')) return `https:${src}`;
        return src;
    }

    function isComicReaderPage(url = window.location.href) {
        return COMIC_URL_PATTERNS.some(pattern => url.includes(pattern));
    }

    function isArticlePage(url = window.location.href) {
        return ARTICLE_URL_PATTERN.test(url);
    }

    function isSpaceOpusUploadPage(url = window.location.href) {
        return SPACE_OPUS_URL_PATTERN.test(url);
    }

    function getSpaceOpusUid(url = window.location.href) {
        return url.match(SPACE_OPUS_URL_PATTERN)?.[1] || '';
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return SPACE_DYNAMIC_URL_PATTERN.test(url);
    }

    function extractUidFromAuthorLink(link) {
        const href = link?.getAttribute?.('href') || link?.href || '';
        return href.match(/space\.bilibili\.com\/(\d+)/)?.[1]
            || href.match(/\/space\/(\d+)/)?.[1]
            || null;
    }

    function getArticleAuthorLink() {
        return ARTICLE_AUTHOR_LINK_SELECTORS
            .flatMap(selector => queryAll(selector))
            .find(link => extractUidFromAuthorLink(link)) || null;
    }

    function getContentTabs() {
        return queryAll(CONTENT_TAB_SELECTOR);
    }

    function getDynamicCards() {
        return queryAll(DYNAMIC_CARD_SELECTOR);
    }

    function getPrimaryImages() {
        return queryAll(PRIMARY_IMAGE_SELECTOR);
    }

    function getFallbackImages() {
        return queryAll(FALLBACK_IMAGE_SELECTOR);
    }

    Toolbox.bilibiliDom = {
        COMIC_URL_PATTERNS,
        DYNAMIC_CARD_SELECTOR,
        AUTHOR_SCOPE_SELECTOR,
        USER_NAME_SELECTOR,
        USER_FACE_SELECTOR,
        query,
        queryAll,
        normalizeProtocolUrl,
        isComicReaderPage,
        isArticlePage,
        isSpaceOpusUploadPage,
        getSpaceOpusUid,
        isSpaceDynamicPage,
        extractUidFromAuthorLink,
        getArticleAuthorLink,
        getContentTabs,
        getDynamicCards,
        getPrimaryImages,
        getFallbackImages
    };
})();
