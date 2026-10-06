const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extensionRoot = path.resolve(__dirname, '..');

function runScript(filename, context) {
    const source = fs.readFileSync(path.join(extensionRoot, filename), 'utf8');
    vm.runInNewContext(source, context, { filename });
}

function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

test('page observer extracts photo, GIF, and video metadata from an API response', async () => {
    const posted = [];
    const listeners = {};
    const payload = {
        data: {
            tweetResult: {
                result: {
                    rest_id: '2079947269349220355',
                    legacy: {
                        extended_entities: {
                            media: [
                                {
                                    id_str: '1',
                                    type: 'photo',
                                    media_url_https: 'https://pbs.twimg.com/media/example.jpg'
                                },
                                {
                                    id_str: '2',
                                    type: 'animated_gif',
                                    media_url_https: 'https://pbs.twimg.com/tweet_video_thumb/gif.jpg',
                                    video_info: {
                                        variants: [{
                                            content_type: 'video/mp4',
                                            url: 'https://video.twimg.com/tweet_video/example.mp4'
                                        }]
                                    }
                                },
                                {
                                    id_str: '3',
                                    type: 'video',
                                    media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/video.jpg',
                                    video_info: {
                                        variants: [
                                            {
                                                bitrate: 256000,
                                                content_type: 'video/mp4',
                                                url: 'https://video.twimg.com/ext_tw_video/low.mp4'
                                            },
                                            {
                                                bitrate: 2176000,
                                                content_type: 'video/mp4',
                                                url: 'https://video.twimg.com/ext_tw_video/high.mp4'
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        }
    };
    const response = {
        headers: { get: () => 'application/json' },
        clone: () => ({ json: async () => payload })
    };
    function FakeXhr() {}
    FakeXhr.prototype.open = function() {};

    const window = {
        location: { origin: 'https://x.com' },
        fetch: async () => response,
        postMessage: message => posted.push(message),
        addEventListener: (type, listener) => { listeners[type] = listener; }
    };
    const context = {
        window,
        XMLHttpRequest: FakeXhr,
        URL,
        WeakSet,
        Map,
        Set,
        Object,
        Array,
        String,
        Number,
        Promise
    };

    runScript('page-observer.js', context);
    await window.fetch('https://x.com/i/api/graphql/TweetDetail');
    await tick();

    const discovery = posted.find(message => message.type === 'media');
    assert.equal(discovery.tweetId, '2079947269349220355');
    assert.deepEqual(
        Array.from(discovery.media, item => item.type),
        ['photo', 'animated_gif', 'video']
    );
    assert.equal(discovery.media[2].variants[1].bitrate, 2176000);

    posted.length = 0;
    listeners.message({
        source: window,
        origin: 'https://x.com',
        data: {
            source: 'betterX.page-observer.v1',
            type: 'request',
            tweetId: '2079947269349220355'
        }
    });
    assert.equal(posted[0].tweetId, '2079947269349220355');
});

test('background starts trusted downloads and rejects untrusted URLs', async () => {
    const started = [];
    const conversionMessages = [];
    let onMessage;
    const chrome = {
        downloads: {
            download: async options => {
                started.push(options);
                return started.length;
            }
        },
        offscreen: {
            hasDocument: async () => true,
            createDocument: async () => {}
        },
        runtime: {
            getURL: path => `chrome-extension://test/${path}`,
            sendMessage: async message => {
                conversionMessages.push(message);
                if (message.type === 'betterx.offscreen.release') return undefined;
                return {
                    ok: true,
                    started: message.items.length,
                    files: message.items.map((item, index) => ({
                        url: `blob:chrome-extension://test/converted-${index}`,
                        filename: item.filename
                    })),
                    errors: [],
                    warnings: []
                };
            },
            onMessage: {
                addListener: listener => { onMessage = listener; }
            }
        }
    };
    runScript('background.js', { chrome, URL, Set, String, Array, Promise });

    const response = await new Promise(resolve => {
        const keepChannelOpen = onMessage({
            type: 'betterx.download',
            items: [
                {
                    url: 'https://pbs.twimg.com/media/example.jpg?name=orig',
                    type: 'image',
                    filename: 'betterX/user_123_01_image.png'
                },
                {
                    url: 'https://video.twimg.com/tweet_video/example.mp4',
                    type: 'gif',
                    filename: 'betterX/user_123_02_gif.gif'
                },
                {
                    url: 'https://video.twimg.com/ext_tw_video/example.mp4',
                    type: 'video',
                    filename: '../unsafe/03_video.mp4'
                },
                {
                    url: 'https://evil.example/video.mp4',
                    filename: '03_video.mp4'
                }
            ]
        }, {}, resolve);
        assert.equal(keepChannelOpen, true);
    });

    assert.equal(response.ok, true);
    assert.equal(response.started, 3);
    assert.equal(started.length, 3);
    assert.deepEqual(
        Array.from(started, item => item.filename).sort(),
        [
            'betterX/user_123_01_image.png',
            'betterX/user_123_02_gif.gif',
            'unsafe/03_video.mp4'
        ]
    );
    assert.ok(started.every(item => item.conflictAction === 'uniquify'));
    const convertMessage = conversionMessages.find(
        message => message.type === 'betterx.offscreen.convert'
    );
    const releaseMessage = conversionMessages.find(
        message => message.type === 'betterx.offscreen.release'
    );
    assert.deepEqual(
        Array.from(convertMessage.items, item => item.type),
        ['image', 'gif']
    );
    assert.equal(convertMessage.items[0].filename, 'betterX/user_123_01_image.png');
    assert.equal(convertMessage.items[1].filename, 'betterX/user_123_02_gif.gif');
    assert.equal(releaseMessage.urls.length, 2);
});

test('media utilities preserve original formats, deduplicate by media identity, and use flat filenames', () => {
    const context = {
        location: { pathname: '/sample/status/123' },
        URL,
        Map,
        Set,
        Object,
        Array,
        String,
        Number,
        Promise
    };
    runScript('media.js', context);
    const hooks = context.BetterX.media;

    const apiUrl = hooks.getOriginalImageUrl('https://pbs.twimg.com/media/example.jpg');
    const domUrl = hooks.getOriginalImageUrl(
        'https://pbs.twimg.com/media/example?format=webp&name=small'
    );
    assert.equal(apiUrl, 'https://pbs.twimg.com/media/example.jpg?name=orig');
    assert.equal(domUrl, 'https://pbs.twimg.com/media/example?format=webp&name=orig');
    assert.equal(hooks.getImageIdentity(apiUrl), hooks.getImageIdentity(domUrl));

    const pngUrl = hooks.getOriginalImageUrl(
        'https://pbs.twimg.com/media/HNvNv_vbsAAiyTL.png?name=small'
    );
    assert.equal(pngUrl, 'https://pbs.twimg.com/media/HNvNv_vbsAAiyTL.png?name=orig');

    const items = hooks.buildDownloadItems(
        [{ url: apiUrl, type: 'image' }],
        { handle: 'sample', tweetId: '123' }
    );
    assert.equal(items[0].type, 'image');
    assert.equal(items[0].filename, 'betterX/sample_123_01_image.png');
});

test('offscreen converter tags PNG as sRGB and bounds GIF work', async () => {
    const hooks = {};
    const chrome = {
        runtime: {
            onMessage: { addListener: () => {} }
        }
    };
    runScript('offscreen.js', {
        __betterXOffscreenTestHooks: hooks,
        chrome,
        Object,
        Math,
        Promise,
        Blob,
        Uint8Array,
        DataView,
        String
    });

    const shortPlan = hooks.getGifPlan(5, 1280, 720);
    assert.equal(shortPlan.width, 640);
    assert.equal(shortPlan.height, 360);
    assert.equal(shortPlan.fps, 12);
    assert.equal(shortPlan.frameCount, 60);
    assert.equal(shortPlan.resized, true);

    const longPlan = hooks.getGifPlan(45, 320, 180);
    assert.equal(longPlan.duration, 30);
    assert.equal(longPlan.fps, 5);
    assert.equal(longPlan.frameCount, 150);
    assert.equal(longPlan.clipped, true);

    const pngWithoutSrgb = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10,
        0, 0, 0, 13, 73, 72, 68, 82,
        0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0, 73, 69, 78, 68,
        0, 0, 0, 0
    ]);
    const tagged = new Uint8Array(await (
        await hooks.tagPngAsSrgb(new Blob([pngWithoutSrgb], { type: 'image/png' }))
    ).arrayBuffer());
    assert.equal(tagged.length, pngWithoutSrgb.length + 13);
    assert.equal(
        String.fromCharCode(...tagged.slice(37, 41)),
        'sRGB'
    );
});
