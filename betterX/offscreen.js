// betterX - local sRGB PNG and GIF conversion in an offscreen extension page.
(function() {
    'use strict';

    const MAX_GIF_DURATION_SECONDS = 30;
    const MAX_GIF_DIMENSION = 640;
    const MAX_LONG_GIF_DIMENSION = 480;
    const MAX_GIF_FRAMES = 150;
    const DOWNLOAD_URL_LIFETIME_MS = 60_000;
    const activeDownloadUrls = new Set();

    function waitForEvent(target, eventName, timeoutMs = 30_000) {
        return new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                cleanup();
                reject(new Error(`等待 ${eventName} 超时`));
            }, timeoutMs);
            const onSuccess = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error(`媒体加载失败：${target.error?.message || eventName}`));
            };
            const cleanup = () => {
                window.clearTimeout(timeout);
                target.removeEventListener(eventName, onSuccess);
                target.removeEventListener('error', onError);
            };
            target.addEventListener(eventName, onSuccess, { once: true });
            target.addEventListener('error', onError, { once: true });
        });
    }

    function canvasToBlob(canvas, type) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error(`无法编码 ${type}`));
            }, type);
        });
    }

    async function tagPngAsSrgb(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) {
            throw new Error('PNG 编码结果无效');
        }

        let offset = 8;
        let hasSrgb = false;
        let hasIccProfile = false;
        let ihdrEnd = 0;
        while (offset + 12 <= bytes.length) {
            const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
            const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
            const chunkEnd = offset + 12 + length;
            if (chunkEnd > bytes.length) throw new Error('PNG 数据块损坏');
            if (type === 'IHDR') ihdrEnd = chunkEnd;
            if (type === 'sRGB') hasSrgb = true;
            if (type === 'iCCP') hasIccProfile = true;
            if (type === 'IEND') break;
            offset = chunkEnd;
        }
        if (hasSrgb || hasIccProfile) return blob;
        if (!ihdrEnd) throw new Error('PNG 缺少 IHDR 数据块');

        // PNG sRGB rendering-intent 0 chunk, including its precomputed CRC32.
        const srgbChunk = new Uint8Array([
            0, 0, 0, 1, 115, 82, 71, 66, 0, 174, 206, 28, 233
        ]);
        return new Blob([
            bytes.slice(0, ihdrEnd),
            srgbChunk,
            bytes.slice(ihdrEnd)
        ], { type: 'image/png' });
    }

    async function fetchMedia(url) {
        const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error(`媒体请求失败：HTTP ${response.status}`);
        return response.blob();
    }

    async function createBitmap(blob) {
        try {
            return await createImageBitmap(blob, {
                colorSpaceConversion: 'default',
                premultiplyAlpha: 'default'
            });
        } catch (_error) {
            return createImageBitmap(blob);
        }
    }

    async function convertImageToSrgbPng(url) {
        const source = await fetchMedia(url);
        const bitmap = await createBitmap(source);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d', { colorSpace: 'srgb', alpha: true });
            if (!context) throw new Error('浏览器不支持 sRGB 画布');
            context.drawImage(bitmap, 0, 0);
            return await tagPngAsSrgb(await canvasToBlob(canvas, 'image/png'));
        } finally {
            bitmap.close?.();
        }
    }

    function getGifPlan(duration, sourceWidth, sourceHeight) {
        const clippedDuration = Math.min(duration, MAX_GIF_DURATION_SECONDS);
        const targetFps = clippedDuration <= 10 ? 12 : (clippedDuration <= 20 ? 10 : 8);
        const fps = Math.min(
            targetFps,
            Math.max(5, Math.floor(MAX_GIF_FRAMES / clippedDuration))
        );
        const maxDimension = clippedDuration <= 10
            ? MAX_GIF_DIMENSION
            : MAX_LONG_GIF_DIMENSION;
        const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        return {
            duration: clippedDuration,
            fps,
            width,
            height,
            frameCount: Math.max(1, Math.ceil(clippedDuration * fps)),
            frameDelay: Math.round(1000 / fps),
            clipped: duration > MAX_GIF_DURATION_SECONDS,
            resized: scale < 1
        };
    }

    async function seekVideo(video, time) {
        const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
        if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) return;
        const ready = waitForEvent(video, 'seeked', 20_000);
        video.currentTime = target;
        await ready;
    }

    function notifyProgress(requestId, text) {
        chrome.runtime.sendMessage({
            type: 'betterx.conversion-progress',
            requestId,
            text
        }).catch(() => {});
    }

    async function renderGif(gif, requestId) {
        return new Promise((resolve, reject) => {
            gif.on('finished', resolve);
            gif.on('progress', progress => {
                notifyProgress(requestId, `正在编码 GIF：${Math.round(progress * 100)}%`);
            });
            try {
                gif.render();
            } catch (error) {
                reject(error);
            }
        });
    }

    async function convertVideoToGif(url, requestId) {
        const source = await fetchMedia(url);
        const sourceUrl = URL.createObjectURL(source);
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        video.src = sourceUrl;

        try {
            const metadataReady = waitForEvent(video, 'loadedmetadata');
            video.load();
            await metadataReady;
            if (video.readyState < 2) await waitForEvent(video, 'loadeddata');
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                throw new Error('无法读取动画时长');
            }

            const plan = getGifPlan(video.duration, video.videoWidth, video.videoHeight);
            const canvas = document.createElement('canvas');
            canvas.width = plan.width;
            canvas.height = plan.height;
            const context = canvas.getContext('2d', { colorSpace: 'srgb', alpha: false });
            if (!context) throw new Error('浏览器不支持 GIF 转换画布');
            const gif = new GIF({
                workers: 2,
                quality: 10,
                repeat: 0,
                width: plan.width,
                height: plan.height,
                dither: 'FloydSteinberg-serpentine',
                workerScript: chrome.runtime.getURL('vendor/gif.js-0.2.0/gif.worker.js')
            });

            for (let index = 0; index < plan.frameCount; index += 1) {
                await seekVideo(video, index / plan.fps);
                context.drawImage(video, 0, 0, plan.width, plan.height);
                gif.addFrame(context, { copy: true, delay: plan.frameDelay });
                if (index % Math.max(1, Math.round(plan.fps)) === 0) {
                    notifyProgress(
                        requestId,
                        `正在提取 GIF 帧：${index + 1}/${plan.frameCount}`
                    );
                }
            }

            const blob = await renderGif(gif, requestId);
            const warnings = [];
            if (plan.resized) warnings.push(`GIF 已缩放至 ${plan.width}×${plan.height}`);
            if (plan.clipped) warnings.push(`GIF 仅转换前 ${MAX_GIF_DURATION_SECONDS} 秒`);
            return { blob, warnings };
        } finally {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(sourceUrl);
        }
    }

    function prepareBlobDownload(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        activeDownloadUrls.add(blobUrl);
        return { url: blobUrl, filename };
    }

    function releaseDownloadUrls(urls) {
        (Array.isArray(urls) ? urls : []).forEach(url => {
            if (!activeDownloadUrls.has(url)) return;
            window.setTimeout(() => {
                URL.revokeObjectURL(url);
                activeDownloadUrls.delete(url);
            }, DOWNLOAD_URL_LIFETIME_MS);
        });
    }

    async function convertItems(items, requestId) {
        let started = 0;
        const errors = [];
        const warnings = [];
        const files = [];

        for (const item of Array.isArray(items) ? items : []) {
            try {
                if (item.type === 'image') {
                    notifyProgress(requestId, '正在转换标准 sRGB PNG…');
                    const png = await convertImageToSrgbPng(item.url);
                    files.push(prepareBlobDownload(png, item.filename));
                } else if (item.type === 'gif') {
                    notifyProgress(requestId, '正在读取 GIF 视频源…');
                    const result = await convertVideoToGif(item.url, requestId);
                    warnings.push(...result.warnings);
                    files.push(prepareBlobDownload(result.blob, item.filename));
                } else {
                    throw new Error(`不支持的转换类型：${item.type}`);
                }
                started += 1;
            } catch (error) {
                errors.push(`${item.filename}：${error?.message || error}`);
            }
        }

        return { ok: started > 0, started, files, errors, warnings };
    }

    if (globalThis.__betterXOffscreenTestHooks) {
        Object.assign(globalThis.__betterXOffscreenTestHooks, {
            getGifPlan,
            tagPngAsSrgb
        });
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type === 'betterx.offscreen.release') {
            releaseDownloadUrls(message.urls);
            return false;
        }
        if (message?.type !== 'betterx.offscreen.convert') return false;
        convertItems(message.items, message.requestId)
            .then(sendResponse)
            .catch(error => sendResponse({
                ok: false,
                started: 0,
                files: [],
                errors: [error?.message || String(error)],
                warnings: []
            }));
        return true;
    });
})();
