// Bilibili Toolbox - page information extraction
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;

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
        return bilibiliDom.normalizeProtocolUrl(src);
    }

    function getArticleAuthorInfo(url = window.location.href) {
        if (!bilibiliDom.isArticlePage(url)) return null;

        const link = bilibiliDom.getArticleAuthorLink();
        const uid = bilibiliDom.extractUidFromAuthorLink(link)
            || document.querySelector('[data-mid]')?.getAttribute('data-mid');
        if (!uid) return null;

        const scope = link?.closest?.(bilibiliDom.AUTHOR_SCOPE_SELECTOR)
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

        const opusUid = bilibiliDom.getSpaceOpusUid(url);
        if (opusUid) return { type: Shared.OPUS_TYPE, uid: opusUid };

        const uid = Shared.extractUidFromUrl(url);
        if (uid) return { type: Shared.USER_TYPE, uid };

        const articleAuthor = getArticleAuthorInfo(url);
        if (articleAuthor) return articleAuthor;

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector(bilibiliDom.USER_NAME_SELECTOR)?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

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
            || document.querySelector(bilibiliDom.USER_NAME_SELECTOR)?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = pageInfo.face
            || document.querySelector(bilibiliDom.USER_FACE_SELECTOR)?.src
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
