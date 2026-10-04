(function() {
    'use strict';

    const BetterX = globalThis.BetterX ||= {};

    const PAGE_OBSERVER_SOURCE = 'betterX.page-observer.v1';

    function getCurrentStatus() {
        const match = location.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/);
        return match ? { handle: match[1], tweetId: match[2] } : null;
    }

    function isAllowedMediaUrl(value, expectedHost) {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && url.hostname === expectedHost;
        } catch (_error) {
            return false;
        }
    }

    function getOriginalImageUrl(value) {
        if (!isAllowedMediaUrl(value, 'pbs.twimg.com')) return '';
        const url = new URL(value);
        const mediaPath = url.pathname.match(/^\/media\/([^/]+)$/i);
        if (!mediaPath) return '';

        // Keep X's original file extension/format. In particular, do not ask the
        // CDN to transcode a PNG to JPEG/WebP because that can change color data.
        const format = url.searchParams.get('format');
        url.search = '';
        if (format) url.searchParams.set('format', format);
        url.searchParams.set('name', 'orig');
        return url.href;
    }

    function getImageIdentity(value) {
        if (!isAllowedMediaUrl(value, 'pbs.twimg.com')) return '';
        const url = new URL(value);
        const mediaPath = url.pathname.match(/^\/media\/([^/]+)$/i);
        if (!mediaPath) return '';
        const baseName = mediaPath[1].replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, '');
        return `pbs-media:${baseName}`;
    }

    function selectBestVideoVariant(variants) {
        return (Array.isArray(variants) ? variants : [])
            .filter(variant => {
                const contentType = variant?.contentType || variant?.content_type;
                return contentType === 'video/mp4'
                    && isAllowedMediaUrl(variant.url, 'video.twimg.com');
            })
            .sort((left, right) => (Number(right.bitrate) || 0) - (Number(left.bitrate) || 0))[0] || null;
    }

    function buildDownloadItems(media, status) {
        const safeHandle = status.handle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tweet';
        return media.map((item, index) => {
            const number = String(index + 1).padStart(2, '0');
            const extension = item.type === 'image'
                ? 'png'
                : (item.type === 'gif' ? 'gif' : 'mp4');
            return {
                url: item.url,
                type: item.type,
                filename: `betterX/${safeHandle}_${status.tweetId}_${number}_${item.type}.${extension}`
            };
        });
    }

    function getMediaSummary(items) {
        const counts = items.reduce((result, item) => {
            result[item.type] = (result[item.type] || 0) + 1;
            return result;
        }, {});
        return [
            counts.image ? `${counts.image} 张图片` : '',
            counts.gif ? `${counts.gif} 个 GIF` : '',
            counts.video ? `${counts.video} 个视频` : ''
        ].filter(Boolean).join('、');
    }

    BetterX.media = {
        PAGE_OBSERVER_SOURCE, getCurrentStatus, isAllowedMediaUrl, getOriginalImageUrl,
        getImageIdentity, selectBestVideoVariant, buildDownloadItems, getMediaSummary
    };
})();
