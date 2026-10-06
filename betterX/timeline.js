(function() {
    'use strict';

    const BetterX = globalThis.BetterX ||= {};

    const VIDEO_SELECTOR = [
        'video',
        '[data-testid="videoPlayer"]',
        '[data-testid="videoComponent"]',
        '[data-testid="playButton"]',
        '[aria-label*="Video"]',
        '[aria-label*="video"]'
    ].join(',');
    const SCAN_DEBOUNCE_MS = 140;

    BetterX.createTimeline = function({ getSettings, onScan }) {
        const { getCurrentStatus } = BetterX.media;
        let observer = null;
        let scanTimer = 0;
        let videoTweetCount = 0;
        let hiddenCount = 0;

        function isFilterActive() {
            const settings = getSettings();
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
            let hidden = 0;

            articles.forEach(article => {
                const isVideoTweet = hasVideoMedia(article) && !isCurrentStatusArticle(article);
                if (isVideoTweet && isFilterActive()) hidden += 1;
                setArticleHidden(article, isVideoTweet);
            });

            videoTweetCount = document.querySelectorAll('article[data-betterx-video-tweet="true"]').length;
            hiddenCount = isFilterActive() ? videoTweetCount : 0;

            onScan();
            return { scanned: articles.length, hidden };
        }

        function getCurrentStatusArticle(tweetId) {
            const links = document.querySelectorAll(`article a[href*="/status/${tweetId}"]`);
            for (const link of links) {
                const article = link.closest('article[data-testid="tweet"], article');
                if (article && isCurrentStatusArticle(article)) return article;
            }
            return null;
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
            onScan();
            scheduleScan();
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

        return {
            scan: scanTweets, applySettings, isFilterActive, getCurrentStatusArticle,
            getCounts: () => ({ hiddenCount, videoTweetCount }),
            start: observeTimeline,
            destroy() {
                observer?.disconnect();
                observer = null;
                clearTimeout(scanTimer);
                scanTimer = 0;
                document.querySelectorAll('[data-betterx-hidden-video-tweet]').forEach(target => {
                    target.classList.remove('betterx-hidden-video-tweet');
                    delete target.dataset.betterxHiddenVideoTweet;
                    delete target.dataset.betterxVideoTweet;
                });
                videoTweetCount = hiddenCount = 0;
            }
        };
    };
})();
