(function() {
    'use strict';

    const BetterX = globalThis.BetterX ||= {};

    BetterX.createDownloads = function({ getCurrentStatusArticle, showMessage }) {
        const { PAGE_OBSERVER_SOURCE, getCurrentStatus, isAllowedMediaUrl,
            getOriginalImageUrl, getImageIdentity, selectBestVideoVariant,
            buildDownloadItems, getMediaSummary } = BetterX.media;
        const mediaByTweet = new Map();
        let currentStatusId = '';
        let downloadBusy = false;
        let activeDownloadRequestId = '';

        function getPerformanceVideoUrls() {
            const bestByFile = new Map();
            performance.getEntriesByType('resource').forEach(entry => {
                if (!isAllowedMediaUrl(entry.name, 'video.twimg.com')) return;
                const url = new URL(entry.name);
                if (!url.pathname.endsWith('.mp4')) return;
                const filename = url.pathname.split('/').pop();
                const dimensions = url.pathname.match(/\/(\d+)x(\d+)\//);
                const score = dimensions ? Number(dimensions[1]) * Number(dimensions[2]) : 0;
                const existing = bestByFile.get(filename);
                if (!existing || score > existing.score) {
                    bestByFile.set(filename, { url: url.href, score });
                }
            });
            return [...bestByFile.values()].map(item => item.url);
        }

        function collectCurrentMedia() {
            const status = getCurrentStatus();
            if (!status) return [];
            const result = [];
            const seen = new Set();
            const add = (url, type, identity = url) => {
                if (!url || !identity || seen.has(identity)) return;
                seen.add(identity);
                result.push({ url, type });
            };

            const apiMedia = mediaByTweet.get(status.tweetId) || [];
            const hasApiPhotos = apiMedia.some(media => media.type === 'photo');
            apiMedia.forEach(media => {
                if (media.type === 'photo') {
                    const url = getOriginalImageUrl(media.imageUrl);
                    add(url, 'image', getImageIdentity(url));
                    return;
                }
                const variant = selectBestVideoVariant(media.variants);
                if (variant) add(variant.url, media.type === 'animated_gif' ? 'gif' : 'video');
            });

            const article = getCurrentStatusArticle(status.tweetId);
            if (!hasApiPhotos) {
                article?.querySelectorAll('img[src*="pbs.twimg.com/media/"]').forEach(image => {
                    const url = getOriginalImageUrl(image.currentSrc || image.src);
                    add(url, 'image', getImageIdentity(url));
                });
            }

            if (article?.querySelector('video') && !result.some(item => item.type !== 'image')) {
                article.querySelectorAll('video, video source').forEach(video => {
                    const url = video.currentSrc || video.src;
                    if (isAllowedMediaUrl(url, 'video.twimg.com')) add(url, 'video');
                });
                getPerformanceVideoUrls().forEach(url => add(url, 'video'));
            }

            return result;
        }

        function requestTweetMedia(tweetId) {
            if (!/^\d+$/.test(String(tweetId || ''))) return;
            window.postMessage({
                source: PAGE_OBSERVER_SOURCE,
                type: 'request',
                tweetId: String(tweetId)
            }, window.location.origin);
        }

        function handlePageMessage(event) {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const data = event.data;
            if (data?.source !== PAGE_OBSERVER_SOURCE || data?.type !== 'media') return;
            if (!/^\d+$/.test(String(data.tweetId)) || !Array.isArray(data.media)) return;

            const safeMedia = data.media.slice(0, 20).filter(media => {
                if (!media || !['photo', 'video', 'animated_gif'].includes(media.type)) return false;
                if (media.type === 'photo') return isAllowedMediaUrl(media.imageUrl, 'pbs.twimg.com');
                return Boolean(selectBestVideoVariant(media.variants));
            });
            if (safeMedia.length) mediaByTweet.set(String(data.tweetId), safeMedia);
            renderDownloadState();
        }

        function renderDownloadState() {
            const section = document.querySelector('.betterx-download-section');
            if (!section) return;
            const status = getCurrentStatus();
            section.hidden = !status;
            if (!status) return;

            const media = collectCurrentMedia();
            const copy = section.querySelector('[data-betterx-download-summary]');
            const button = section.querySelector('[data-betterx-action="download"]');
            copy.textContent = media.length
                ? `已找到 ${getMediaSummary(media)}`
                : '正在识别图片、GIF 或视频';
            button.textContent = media.length ? `下载全部（${media.length}）` : '重新识别媒体';
            button.disabled = downloadBusy;
        }

        function refreshDownloadState() {
            const status = getCurrentStatus();
            const nextStatusId = status?.tweetId || '';
            if (nextStatusId !== currentStatusId) {
                currentStatusId = nextStatusId;
                if (currentStatusId) requestTweetMedia(currentStatusId);
            }
            renderDownloadState();
        }

        async function downloadCurrentMedia() {
            const status = getCurrentStatus();
            if (!status || downloadBusy) return;
            let media = collectCurrentMedia();

            if (!media.length) {
                requestTweetMedia(status.tweetId);
                showMessage('正在读取本帖媒体…');
                await new Promise(resolve => window.setTimeout(resolve, 700));
                media = collectCurrentMedia();
            }
            if (!media.length) {
                showMessage('未发现媒体；如果是视频，请先播放一下再重试');
                renderDownloadState();
                return;
            }

            downloadBusy = true;
            activeDownloadRequestId = globalThis.crypto?.randomUUID?.()
                || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            renderDownloadState();
            const needsImageConversion = media.some(item => item.type === 'image');
            const needsGifConversion = media.some(item => item.type === 'gif');
            if (needsGifConversion) showMessage('正在本地转换 GIF，请保持页面开启…');
            else if (needsImageConversion) showMessage('正在转换标准 sRGB PNG…');
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'betterx.download',
                    requestId: activeDownloadRequestId,
                    items: buildDownloadItems(media, status)
                });
                if (response?.started) {
                    const details = [
                        response.errors?.length ? `${response.errors.length} 项失败` : '',
                        response.warnings?.[0] || ''
                    ].filter(Boolean).join('；');
                    showMessage(`已开始下载 ${response.started} 项媒体${details ? `；${details}` : ''}`);
                } else {
                    showMessage(response?.errors?.[0] || '下载启动失败');
                }
            } catch (error) {
                showMessage(`下载失败：${error?.message || error}`);
            } finally {
                downloadBusy = false;
                activeDownloadRequestId = '';
                renderDownloadState();
            }
        }

        function handleRuntimeMessage(message) {
            if (message?.type !== 'betterx.conversion-progress') return false;
            if (!activeDownloadRequestId || message.requestId !== activeDownloadRequestId) return false;
            if (typeof message.text === 'string') showMessage(message.text);
            return false;
        }

        return {
            collect: collectCurrentMedia, download: downloadCurrentMedia,
            render: renderDownloadState, refresh: refreshDownloadState,
            start() {
                window.addEventListener('message', handlePageMessage);
                chrome.runtime.onMessage.addListener(handleRuntimeMessage);
            },
            destroy() {
                window.removeEventListener('message', handlePageMessage);
                chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
                mediaByTweet.clear();
            }
        };
    };
})();
