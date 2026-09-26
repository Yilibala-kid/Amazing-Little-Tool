// betterX - hide video tweets on X.com
(function() {
    'use strict';

    const STORAGE_KEY = 'betterX.settings.v1';
    const PAGE_OBSERVER_SOURCE = 'betterX.page-observer.v1';
    const DEFAULT_SETTINGS = Object.freeze({
        hideVideos: true,
        revealHidden: false
    });
    const VIDEO_SELECTOR = [
        'video',
        '[data-testid="videoPlayer"]',
        '[data-testid="videoComponent"]',
        '[data-testid="playButton"]',
        '[aria-label*="Video"]',
        '[aria-label*="video"]'
    ].join(',');
    const SCAN_DEBOUNCE_MS = 140;

    let settings = { ...DEFAULT_SETTINGS };
    let observer = null;
    let scanTimer = 0;
    let hiddenCount = 0;
    let videoTweetCount = 0;
    let messageTimer = 0;
    let currentStatusId = '';
    let downloadBusy = false;
    let activeDownloadRequestId = '';
    const mediaByTweet = new Map();

    function getStorageArea() {
        return globalThis.chrome?.storage?.local || null;
    }

    async function loadSettings() {
        const storage = getStorageArea();
        if (!storage) return { ...DEFAULT_SETTINGS };
        const result = await storage.get([STORAGE_KEY]);
        return normalizeSettings(result[STORAGE_KEY]);
    }

    async function saveSettings(nextSettings) {
        settings = normalizeSettings(nextSettings);
        const storage = getStorageArea();
        if (storage) await storage.set({ [STORAGE_KEY]: settings });
        applySettings();
    }

    function normalizeSettings(input) {
        const source = input && typeof input === 'object' ? input : {};
        return {
            hideVideos: typeof source.hideVideos === 'boolean'
                ? source.hideVideos
                : DEFAULT_SETTINGS.hideVideos,
            revealHidden: typeof source.revealHidden === 'boolean'
                ? source.revealHidden
                : DEFAULT_SETTINGS.revealHidden
        };
    }

    function isFilterActive() {
        return settings.hideVideos && !settings.revealHidden;
    }

    function isTweetArticle(element) {
        return element?.matches?.('article[data-testid="tweet"], article');
    }

    function getTweetArticles(root = document) {
        const articles = new Set();
        if (isTweetArticle(root)) articles.add(root);
        const closestArticle = root.closest?.('article[data-testid="tweet"], article');
        if (closestArticle) articles.add(closestArticle);
        root.querySelectorAll?.('article[data-testid="tweet"], article').forEach(article => {
            articles.add(article);
        });
        return [...articles];
    }

    function getHideTargets(article) {
        const cell = article.closest('[data-testid="cellInnerDiv"]');
        return cell ? [article, cell] : [article];
    }

    function getCurrentStatus() {
        const match = location.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/);
        return match ? { handle: match[1], tweetId: match[2] } : null;
    }

    function isCurrentStatusArticle(article) {
        const status = getCurrentStatus();
        if (!status || !article) return false;
        return [...article.querySelectorAll('a[href]')].some(link => {
            try {
                return new URL(link.href).pathname.match(/\/status\/(\d+)/)?.[1] === status.tweetId;
            } catch (_error) {
                return false;
            }
        });
    }

    function hasVideoMedia(article) {
        if (!article?.isConnected) return false;
        const media = article.querySelector(VIDEO_SELECTOR);
        if (!media) return false;

        const quotedTweet = media.closest('article');
        return !quotedTweet || quotedTweet === article || article.contains(quotedTweet);
    }

    function setArticleHidden(article, shouldHide) {
        article.dataset.betterxVideoTweet = shouldHide ? 'true' : 'false';
        getHideTargets(article).forEach(target => {
            target.classList.toggle('betterx-hidden-video-tweet', shouldHide && isFilterActive());
            target.dataset.betterxHiddenVideoTweet = shouldHide ? 'true' : 'false';
        });
    }

    function scanTweets(root = document) {
        const articles = getTweetArticles(root);
        let found = 0;
        let hidden = 0;

        articles.forEach(article => {
            const isVideoTweet = hasVideoMedia(article) && !isCurrentStatusArticle(article);
            if (isVideoTweet) found += 1;
            if (isVideoTweet && isFilterActive()) hidden += 1;
            setArticleHidden(article, isVideoTweet);
        });

        videoTweetCount = document.querySelectorAll('article[data-betterx-video-tweet="true"]').length;
        hiddenCount = isFilterActive() ? videoTweetCount : 0;

        renderManagerState();
        refreshDownloadState();
        return { scanned: articles.length, found, hidden };
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

    function getCurrentStatusArticle(tweetId) {
        const links = document.querySelectorAll(`article a[href*="/status/${tweetId}"]`);
        for (const link of links) {
            const article = link.closest('article[data-testid="tweet"], article');
            if (article && isCurrentStatusArticle(article)) return article;
        }
        return null;
    }

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

    if (globalThis.__betterXTestHooks) {
        Object.assign(globalThis.__betterXTestHooks, {
            getOriginalImageUrl,
            getImageIdentity,
            buildDownloadItems
        });
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

    function scheduleScan(root = document) {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = window.setTimeout(() => {
            scanTimer = 0;
            scanTweets(root);
        }, SCAN_DEBOUNCE_MS);
    }

    function applySettings() {
        document.querySelectorAll('[data-betterx-hidden-video-tweet="true"]').forEach(target => {
            target.classList.toggle('betterx-hidden-video-tweet', isFilterActive());
        });
        hiddenCount = isFilterActive() ? videoTweetCount : 0;
        renderManagerState();
        scheduleScan();
    }

    function createManagerButton() {
        if (document.getElementById('betterx-manager-button')) return;
        const button = document.createElement('div');
        button.id = 'betterx-manager-button';
        button.title = 'betterX 视频推文过滤';
        button.innerHTML = 'X<span class="betterx-manager-badge">0</span>';
        document.body.appendChild(button);
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            togglePanel();
        });
    }

    function createManagerPanel() {
        if (document.getElementById('betterx-manager-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'betterx-manager-panel';
        panel.innerHTML = `
            <div class="betterx-panel-header">
                <span>betterX 视频过滤</span>
            </div>
            <div class="betterx-panel-content">
                <div class="betterx-status-row">
                    <div class="betterx-stat">
                        <span class="betterx-stat-value" data-betterx-stat="video">0</span>
                        <span class="betterx-stat-label">已识别视频推文</span>
                    </div>
                    <div class="betterx-stat">
                        <span class="betterx-stat-value" data-betterx-stat="hidden">0</span>
                        <span class="betterx-stat-label">当前隐藏</span>
                    </div>
                </div>
                <section class="betterx-download-section" hidden>
                    <div class="betterx-download-copy">
                        <span class="betterx-control-title">下载本帖媒体</span>
                        <span class="betterx-control-desc" data-betterx-download-summary>正在识别图片、GIF 或视频</span>
                    </div>
                    <button class="betterx-action-button betterx-download-action" data-betterx-action="download">重新识别媒体</button>
                </section>
                <label class="betterx-control-row">
                    <span class="betterx-control-copy">
                        <span class="betterx-control-title">隐藏视频推文</span>
                        <span class="betterx-control-desc">隐藏时间线中含有视频播放器的推文</span>
                    </span>
                    <span class="betterx-switch">
                        <input type="checkbox" data-betterx-setting="hideVideos">
                        <span class="betterx-switch-slider"></span>
                    </span>
                </label>
                <label class="betterx-control-row">
                    <span class="betterx-control-copy">
                        <span class="betterx-control-title">暂时显示已隐藏</span>
                        <span class="betterx-control-desc">保留识别结果，但临时放出视频推文</span>
                    </span>
                    <span class="betterx-switch">
                        <input type="checkbox" data-betterx-setting="revealHidden">
                        <span class="betterx-switch-slider"></span>
                    </span>
                </label>
                <div class="betterx-panel-actions">
                    <button class="betterx-action-button" data-betterx-action="scan">重新扫描</button>
                    <button class="betterx-action-button secondary" data-betterx-action="close">关闭</button>
                </div>
                <div class="betterx-message">默认自动处理新加载的推文</div>
            </div>
        `;
        document.body.appendChild(panel);
        panel.querySelector('[data-betterx-setting="hideVideos"]').addEventListener('change', event => {
            saveSettings({ ...settings, hideVideos: Boolean(event.target.checked) });
        });
        panel.querySelector('[data-betterx-setting="revealHidden"]').addEventListener('change', event => {
            saveSettings({ ...settings, revealHidden: Boolean(event.target.checked) });
        });
        panel.querySelector('[data-betterx-action="scan"]').addEventListener('click', () => {
            const result = scanTweets();
            showMessage(`已扫描 ${result.scanned} 条推文，识别 ${videoTweetCount} 条视频推文`);
        });
        panel.querySelector('[data-betterx-action="download"]').addEventListener('click', downloadCurrentMedia);
        panel.querySelector('[data-betterx-action="close"]').addEventListener('click', hidePanel);
    }

    function renderManagerState() {
        const button = document.getElementById('betterx-manager-button');
        const panel = document.getElementById('betterx-manager-panel');
        button?.classList.toggle('betterx-paused', !isFilterActive());
        const badge = button?.querySelector('.betterx-manager-badge');
        if (badge) {
            badge.textContent = String(hiddenCount);
            badge.style.display = hiddenCount > 0 ? 'block' : 'none';
        }
        if (!panel) return;
        panel.querySelector('[data-betterx-stat="video"]').textContent = String(videoTweetCount);
        panel.querySelector('[data-betterx-stat="hidden"]').textContent = String(hiddenCount);
        panel.querySelector('[data-betterx-setting="hideVideos"]').checked = settings.hideVideos;
        panel.querySelector('[data-betterx-setting="revealHidden"]').checked = settings.revealHidden;
        renderDownloadState();
    }

    function showMessage(text) {
        const message = document.querySelector('.betterx-message');
        if (!message) return;
        if (messageTimer) clearTimeout(messageTimer);
        message.textContent = text;
        messageTimer = window.setTimeout(() => {
            message.textContent = '默认自动处理新加载的推文';
            messageTimer = 0;
        }, 2400);
    }

    function togglePanel() {
        createManagerPanel();
        const panel = document.getElementById('betterx-manager-panel');
        panel?.classList.toggle('show');
        renderManagerState();
    }

    function hidePanel() {
        document.getElementById('betterx-manager-panel')?.classList.remove('show');
    }

    function handleDocumentPointerDown(event) {
        const panel = document.getElementById('betterx-manager-panel');
        const button = document.getElementById('betterx-manager-button');
        if (!panel?.classList.contains('show')) return;
        if (panel.contains(event.target) || button?.contains(event.target)) return;
        hidePanel();
    }

    function handleDocumentKeyDown(event) {
        if (event.key === 'Escape') hidePanel();
    }

    function observeTimeline() {
        if (observer) observer.disconnect();
        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;
                const changedElement = [...mutation.addedNodes, ...mutation.removedNodes]
                    .find(node => node.nodeType === Node.ELEMENT_NODE);
                if (changedElement) {
                    scheduleScan();
                    return;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    async function init() {
        settings = await loadSettings();
        createManagerButton();
        createManagerPanel();
        document.addEventListener('pointerdown', handleDocumentPointerDown, true);
        document.addEventListener('keydown', handleDocumentKeyDown);
        window.addEventListener('message', handlePageMessage);
        chrome.runtime.onMessage.addListener(handleRuntimeMessage);
        observeTimeline();
        scanTweets();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
