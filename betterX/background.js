// betterX - trusted download and local-conversion bridge for X media URLs.
(function() {
    'use strict';

    const ALLOWED_MEDIA_HOSTS = new Set([
        'pbs.twimg.com',
        'video.twimg.com'
    ]);
    const MAX_DOWNLOADS_PER_REQUEST = 20;
    let creatingOffscreenDocument = null;

    function sanitizeFilename(filename, index) {
        const fallback = `betterX/media-${index + 1}`;
        if (typeof filename !== 'string' || !filename.trim()) return fallback;

        const parts = filename
            .replace(/\\/g, '/')
            .split('/')
            .filter(part => part && part !== '.' && part !== '..')
            .map(part => part.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim())
            .filter(Boolean);

        return parts.join('/').slice(0, 220) || fallback;
    }

    function normalizeDownloadItem(item, index) {
        if (!item || typeof item.url !== 'string') return null;

        let url;
        try {
            url = new URL(item.url);
        } catch (_error) {
            return null;
        }

        if (url.protocol !== 'https:' || !ALLOWED_MEDIA_HOSTS.has(url.hostname)) {
            return null;
        }

        const inferredType = url.hostname === 'pbs.twimg.com' ? 'image' : 'video';
        const type = ['image', 'gif', 'video'].includes(item.type) ? item.type : inferredType;
        if (type === 'image' && url.hostname !== 'pbs.twimg.com') return null;
        if (['gif', 'video'].includes(type) && url.hostname !== 'video.twimg.com') return null;

        return {
            url: url.href,
            type,
            filename: sanitizeFilename(item.filename, index),
            conflictAction: 'uniquify',
            saveAs: false
        };
    }

    async function hasOffscreenDocument() {
        if (typeof chrome.offscreen?.hasDocument === 'function'
            && await chrome.offscreen.hasDocument()) {
            return true;
        }
        const offscreenUrl = chrome.runtime.getURL('offscreen.html');
        if (typeof chrome.runtime.getContexts === 'function') {
            const contexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
                documentUrls: [offscreenUrl]
            });
            return contexts.length > 0;
        }
        if (typeof globalThis.clients?.matchAll === 'function') {
            const matchedClients = await globalThis.clients.matchAll();
            return matchedClients.some(client => client.url === offscreenUrl);
        }
        return false;
    }

    async function ensureOffscreenDocument() {
        if (await hasOffscreenDocument()) return;
        if (!creatingOffscreenDocument) {
            creatingOffscreenDocument = chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['BLOBS', 'WORKERS'],
                justification: 'Convert X images to sRGB PNG and X animated GIF videos to GIF files.'
            }).catch(error => {
                if (!/single offscreen|already exists/i.test(error?.message || '')) throw error;
            }).finally(() => {
                creatingOffscreenDocument = null;
            });
        }
        await creatingOffscreenDocument;
    }

    async function startDirectDownloads(items) {
        const results = await Promise.allSettled(
            items.map(options => chrome.downloads.download({
                url: options.url,
                filename: options.filename,
                conflictAction: options.conflictAction,
                saveAs: options.saveAs
            }))
        );
        return {
            started: results.filter(result => result.status === 'fulfilled').length,
            errors: results
                .filter(result => result.status === 'rejected')
                .map(result => result.reason?.message || String(result.reason))
        };
    }

    async function startConvertedDownloads(items, requestId) {
        if (!items.length) return { started: 0, errors: [], warnings: [] };
        await ensureOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
            type: 'betterx.offscreen.convert',
            requestId,
            items
        });
        if (!response) {
            return { started: 0, errors: ['离屏转换页面没有返回结果'], warnings: [] };
        }

        const extensionBlobPrefix = `blob:${chrome.runtime.getURL('')}`;
        const prepared = (Array.isArray(response.files) ? response.files : [])
            .filter(file => typeof file?.url === 'string'
                && file.url.startsWith(extensionBlobPrefix))
            .map((file, index) => ({
                url: file.url,
                filename: sanitizeFilename(file.filename, index),
                conflictAction: 'uniquify',
                saveAs: false
            }));
        const downloaded = await startDirectDownloads(prepared);
        if (prepared.length) {
            chrome.runtime.sendMessage({
                type: 'betterx.offscreen.release',
                urls: prepared.map(file => file.url)
            }).catch(() => {});
        }
        return {
            started: downloaded.started,
            errors: [...(response.errors || []), ...downloaded.errors],
            warnings: response.warnings || []
        };
    }

    async function startDownloads(items, requestId) {
        const requested = Array.isArray(items) ? items.slice(0, MAX_DOWNLOADS_PER_REQUEST) : [];
        const downloads = requested.map(normalizeDownloadItem).filter(Boolean);
        if (!downloads.length) {
            return { ok: false, started: 0, errors: ['没有可下载的有效媒体地址'], warnings: [] };
        }

        const directItems = downloads.filter(item => item.type === 'video');
        const convertedItems = downloads.filter(item => item.type !== 'video');
        const [direct, converted] = await Promise.all([
            startDirectDownloads(directItems),
            startConvertedDownloads(convertedItems, requestId).catch(error => ({
                started: 0,
                errors: [error?.message || String(error)],
                warnings: []
            }))
        ]);
        const started = direct.started + (converted.started || 0);
        const errors = [...direct.errors, ...(converted.errors || [])];
        return {
            ok: started > 0,
            started,
            errors,
            warnings: converted.warnings || []
        };
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'betterx.download') return false;

        startDownloads(message.items, message.requestId)
            .then(sendResponse)
            .catch(error => sendResponse({
                ok: false,
                started: 0,
                errors: [error?.message || String(error)],
                warnings: []
            }));
        return true;
    });
})();
