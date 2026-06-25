// Bilibili Toolbox - page information extraction
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const ARTICLE_URL_PATTERN = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/read\/(?:cv\d+|mobile|native)(?:[/?#]|$)/i;
    const SPACE_OPUS_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/(\d+)\/upload\/opus(?:[/?#]|$)/i;

    function extractUserNameFromMeta() {
        const title = document.title || '';
        const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const profileSuffixPattern = '(?:\\u7684)?\\u4e2a\\u4eba(?:\\u52a8\\u6001|\\u7a7a\\u95f4|\\u4e3b\\u9875)';

        return (
            title.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || keywords.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || description.match(/\u54d4\u54e9\u54d4\u54e9(.+?)\u7684\u4e2a\u4eba(?:\u52a8\u6001|\u7a7a\u95f4)/)?.[1]
            || description.match(/\u5173\u6ce8(.+?)\u8d26\u53f7/)?.[1]
            || ''
        ).trim();
    }

    function normalizeImageUrl(src) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('//')) return `https:${src}`;
        return src;
    }

    function extractUidFromAuthorLink(link) {
        const href = link?.getAttribute?.('href') || link?.href || '';
        return href.match(/space\.bilibili\.com\/(\d+)/)?.[1]
            || href.match(/\/space\/(\d+)/)?.[1]
            || null;
    }

    function getArticleAuthorLink() {
        const selectors = [
            '.article-author a[href*="space"]',
            '.article-info a[href*="space"]',
            '.author-info a[href*="space"]',
            '.up-info a[href*="space"]',
            '.opus-module-author a[href*="space"]',
            '[class*="author"] a[href*="space"]',
            '[class*="up"] a[href*="space"]',
            'a[href*="space.bilibili.com/"]',
            'a[href*="/space/"]'
        ];

        return selectors
            .flatMap(selector => Array.from(document.querySelectorAll(selector)))
            .find(link => extractUidFromAuthorLink(link));
    }

    function getArticleAuthorInfo(url = window.location.href) {
        if (!ARTICLE_URL_PATTERN.test(url)) return null;

        const link = getArticleAuthorLink();
        const uid = extractUidFromAuthorLink(link)
            || document.querySelector('[data-mid]')?.getAttribute('data-mid');
        if (!uid) return null;

        const scope = link?.closest?.('.article-author, .article-info, .author-info, .up-info, [class*="author"], [class*="up"]')
            || document;
        const uname = link?.textContent?.trim()
            || scope.querySelector('.user-name, .name, [class*="name"]')?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = normalizeImageUrl(
            scope.querySelector('img')?.getAttribute('data-src')
            || scope.querySelector('img')?.getAttribute('src')
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || ''
        );

        return { type: Shared.USER_TYPE, uid, uname, face };
    }

    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = Shared.$('.read-list-title, .title, h1', '\u4e13\u680f');
            const cover = Shared.$src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: Shared.READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const opusMatch = url.match(SPACE_OPUS_URL_PATTERN);
        if (opusMatch) return { type: Shared.OPUS_TYPE, uid: opusMatch[1] };

        const uid = Shared.extractUidFromUrl(url);
        if (uid) return { type: Shared.USER_TYPE, uid };

        const articleAuthor = getArticleAuthorInfo(url);
        if (articleAuthor) return articleAuthor;

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector('.user-name, .user-name-shadow, .name')?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: Shared.USER_TYPE, uid: pageUid } : null;
    }

    function extractPageInfoForFavorite(pageInfo) {
        if (!pageInfo) return null;

        if (Shared.isReadlistFavorite(pageInfo)) {
            return {
                type: Shared.READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '\u4e13\u680f',
                cover: pageInfo.cover || Shared.FALLBACK_IMAGE
            };
        }

        const uname = pageInfo.uname
            || document.querySelector('.user-name, .user-name-shadow, .name')?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = pageInfo.face
            || document.querySelector('.user-face img, .avatar img, [class*="face"] img')?.src
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || '';

        return {
            type: pageInfo.type === Shared.OPUS_TYPE ? Shared.OPUS_TYPE : Shared.USER_TYPE,
            uid: pageInfo.uid,
            uname,
            face
        };
    }

    Toolbox.pageInfo = {
        getCurrentPageInfo,
        extractPageInfoForFavorite,
        getCurrentFavoriteData: () => extractPageInfoForFavorite(getCurrentPageInfo())
    };
})();
