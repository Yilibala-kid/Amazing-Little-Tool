// betterX - runs in X's main world to capture the original media URLs in API data.
(function() {
    'use strict';

    const SOURCE = 'betterX.page-observer.v1';
    const mediaByTweet = new Map();

    function isApiUrl(value) {
        const url = typeof value === 'string' ? value : value?.url;
        return typeof url === 'string' && (url.includes('/i/api/') || url.includes('/graphql/'));
    }

    function normalizeMedia(media) {
        if (!media || typeof media !== 'object') return null;
        const type = media.type;
        if (!['photo', 'video', 'animated_gif'].includes(type)) return null;

        const imageUrl = typeof media.media_url_https === 'string'
            ? media.media_url_https
            : (typeof media.media_url === 'string' ? media.media_url.replace(/^http:/, 'https:') : '');
        const variants = Array.isArray(media.video_info?.variants)
            ? media.video_info.variants
                .filter(variant => typeof variant?.url === 'string')
                .map(variant => ({
                    url: variant.url,
                    bitrate: Number.isFinite(variant.bitrate) ? variant.bitrate : 0,
                    contentType: variant.content_type || ''
                }))
            : [];

        if (!imageUrl && !variants.length) return null;
        return {
            id: String(media.id_str || media.id || imageUrl || variants[0].url),
            type,
            imageUrl,
            variants
        };
    }

    function mergeTweetMedia(tweetId, mediaItems) {
        if (!/^\d+$/.test(String(tweetId)) || !mediaItems.length) return;
        const existing = mediaByTweet.get(String(tweetId)) || [];
        const merged = new Map(existing.map(item => [item.id, item]));
        mediaItems.forEach(item => merged.set(item.id, item));
        mediaByTweet.set(String(tweetId), [...merged.values()]);
    }

    function collectPayload(payload) {
        if (!payload || typeof payload !== 'object') return;
        const seen = new WeakSet();
        const stack = [payload];
        const changedTweetIds = new Set();

        while (stack.length) {
            const value = stack.pop();
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);

            const legacy = value.legacy && typeof value.legacy === 'object' ? value.legacy : null;
            const tweetId = value.rest_id || value.id_str || legacy?.id_str;
            const rawMedia = legacy?.extended_entities?.media || value.extended_entities?.media;
            if (/^\d+$/.test(String(tweetId)) && Array.isArray(rawMedia)) {
                const normalized = rawMedia.map(normalizeMedia).filter(Boolean);
                if (normalized.length) {
                    mergeTweetMedia(String(tweetId), normalized);
                    changedTweetIds.add(String(tweetId));
                }
            }

            Object.values(value).forEach(child => {
                if (child && typeof child === 'object') stack.push(child);
            });
        }

        changedTweetIds.forEach(publishTweet);
    }

    function publishTweet(tweetId) {
        const media = mediaByTweet.get(String(tweetId));
        if (!media?.length) return;
        window.postMessage({
            source: SOURCE,
            type: 'media',
            tweetId: String(tweetId),
            media
        }, window.location.origin);
    }

    async function inspectFetchResponse(response) {
        try {
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('json')) return;
            collectPayload(await response.clone().json());
        } catch (_error) {
            // X can cancel speculative requests; that is harmless for media discovery.
        }
    }

    const nativeFetch = window.fetch;
    window.fetch = function(...args) {
        const request = args[0];
        const result = nativeFetch.apply(this, args);
        if (isApiUrl(request)) {
            result.then(inspectFetchResponse).catch(() => {});
        }
        return result;
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (isApiUrl(url)) {
            this.addEventListener('load', function() {
                try {
                    const payload = this.responseType === 'json'
                        ? this.response
                        : JSON.parse(this.responseText);
                    collectPayload(payload);
                } catch (_error) {
                    // Ignore non-JSON and inaccessible XHR responses.
                }
            }, { once: true });
        }
        return nativeOpen.call(this, method, url, ...rest);
    };

    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        if (event.data?.source !== SOURCE || event.data?.type !== 'request') return;
        const tweetId = String(event.data.tweetId || '');
        if (/^\d+$/.test(tweetId)) publishTweet(tweetId);
    });
})();
