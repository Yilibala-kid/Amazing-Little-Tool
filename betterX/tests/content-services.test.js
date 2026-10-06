const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadServices(extra = {}) {
    const listeners = {};
    const runtimeListeners = new Set();
    const window = {
        location: { origin: 'https://x.com' },
        postMessage() {},
        addEventListener(type, listener) { listeners[type] = listener; },
        removeEventListener(type, listener) {
            if (listeners[type] === listener) delete listeners[type];
        },
        setTimeout() { return 1; }
    };
    const context = vm.createContext({
        window, URL, clearTimeout() {},
        location: { pathname: '/sample/status/123' },
        performance: { getEntriesByType: () => [] },
        document: { querySelector: () => null },
        chrome: { runtime: {
            onMessage: {
                addListener(listener) { runtimeListeners.add(listener); },
                removeListener(listener) { runtimeListeners.delete(listener); }
            },
            async sendMessage() { return { started: 1 }; }
        } },
        ...extra
    });
    for (const name of ['media.js', 'timeline.js', 'downloads.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    }
    return { context, listeners, runtimeListeners, window, services: context.BetterX };
}

test('downloads accept only current-post media from the page bridge and preserve formats', async () => {
    const { services, context, window, listeners, runtimeListeners } = loadServices();
    const requests = [];
    const messages = [];
    let finishDownload;
    context.chrome.runtime.sendMessage = request => {
        requests.push(request);
        return new Promise(resolve => { finishDownload = resolve; });
    };
    const downloads = services.createDownloads({
        getCurrentStatusArticle: () => null,
        showMessage: text => messages.push(text)
    });
    downloads.start();
    const media = [
        { type: 'photo', imageUrl: 'https://pbs.twimg.com/media/image.png?name=small' },
        { type: 'photo', imageUrl: 'https://pbs.twimg.com/media/image?format=png&name=large' },
        { type: 'animated_gif', variants: [
            { contentType: 'video/mp4', url: 'https://video.twimg.com/gif.mp4' }
        ] },
        { type: 'video', variants: [
            { contentType: 'video/mp4', bitrate: 10, url: 'https://video.twimg.com/low.mp4' },
            { contentType: 'video/mp4', bitrate: 100, url: 'https://evil.example/high.mp4' },
            { contentType: 'video/mp4', bitrate: 20, url: 'https://video.twimg.com/high.mp4' }
        ] },
        { type: 'photo', imageUrl: 'http://pbs.twimg.com/media/insecure.png' }
    ];
    const event = {
        source: window, origin: window.location.origin,
        data: { source: services.media.PAGE_OBSERVER_SOURCE, type: 'media', tweetId: '123', media }
    };
    listeners.message({ ...event, origin: 'https://evil.example' });
    assert.equal(downloads.collect().length, 0);
    listeners.message(event);
    assert.deepEqual(Array.from(downloads.collect(), item => item.type), ['image', 'gif', 'video']);
    const downloading = downloads.download();
    await downloads.download();
    assert.equal(requests.length, 1, 'a second click cannot start another download');
    assert.equal(requests[0].items[0].filename, 'betterX/sample_123_01_image.png');
    assert.equal(requests[0].items[2].url, 'https://video.twimg.com/high.mp4');
    for (const listener of runtimeListeners) {
        listener({ type: 'betterx.conversion-progress', requestId: 'another-request', text: 'unrelated' });
        listener({ type: 'betterx.conversion-progress', requestId: requests[0].requestId, text: 'converting' });
    }
    assert.equal(messages.includes('unrelated'), false);
    assert.equal(messages.includes('converting'), true);
    finishDownload({ started: 3 });
    await downloading;
    context.location.pathname = '/sample/status/456';
    assert.equal(downloads.collect().length, 0, 'navigation does not reuse another post media');
    downloads.destroy();
    assert.equal(runtimeListeners.size, 0);
    assert.equal(listeners.message, undefined);
});

test('timeline settings restore hidden cells while keeping the current status visible', () => {
    const makeArticle = (tweetId, hasVideo) => {
        const classList = { hidden: false, toggle(_name, enabled) { this.hidden = enabled; } };
        const cell = { dataset: {}, classList: { ...classList } };
        const article = {
            dataset: {}, classList, isConnected: true,
            matches: () => true,
            closest: () => cell,
            querySelector: () => hasVideo ? { closest: () => article } : null,
            querySelectorAll: () => [{ href: `https://x.com/sample/status/${tweetId}` }]
        };
        return { article, cell };
    };
    const posts = [makeArticle('123', true), makeArticle('456', true), makeArticle('789', false)];
    const document = {
        querySelectorAll(selector) {
            if (selector.startsWith('article[data-betterx')) return posts.map(p => p.article)
                .filter(a => a.dataset.betterxVideoTweet === 'true');
            if (selector.startsWith('[data-betterx')) return posts.flatMap(p => [p.article, p.cell])
                .filter(a => a.dataset.betterxHiddenVideoTweet === 'true');
            return posts.map(p => p.article);
        }
    };
    const { services } = loadServices({ document });
    const settings = { hideVideos: true, revealHidden: false };
    const timeline = services.createTimeline({ getSettings: () => settings, onScan() {} });
    assert.equal(timeline.scan().hidden, 1);
    assert.equal(posts[0].article.classList.hidden, false);
    assert.equal(posts[1].cell.classList.hidden, true);
    settings.revealHidden = true;
    timeline.applySettings();
    assert.equal(posts[1].cell.classList.hidden, false);
    assert.equal(timeline.getCounts().videoTweetCount, 1);
    assert.equal(timeline.getCounts().hiddenCount, 0);
});
