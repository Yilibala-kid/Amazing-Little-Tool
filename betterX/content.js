// betterX - hide video tweets on X.com
(function() {
    'use strict';

    const STORAGE_KEY = 'betterX.settings.v1';
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
            const isVideoTweet = hasVideoMedia(article);
            if (isVideoTweet) found += 1;
            if (isVideoTweet && isFilterActive()) hidden += 1;
            setArticleHidden(article, isVideoTweet);
        });

        videoTweetCount = document.querySelectorAll('article[data-betterx-video-tweet="true"]').length;
        hiddenCount = isFilterActive() ? videoTweetCount : 0;

        renderManagerState();
        return { scanned: articles.length, found, hidden };
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
        observeTimeline();
        scanTweets();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
