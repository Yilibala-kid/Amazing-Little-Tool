// Bilibili Toolbox - reader screenshot helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const READER_BACKGROUND = '#0a0a0a';

    function getBounds(descriptors) {
        if (!descriptors.length) return null;
        const left = Math.min(...descriptors.map(item => item.x));
        const right = Math.max(...descriptors.map(item => item.x + item.width));
        const top = Math.min(...descriptors.map(item => item.y));
        const bottom = Math.max(...descriptors.map(item => item.y + item.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    function drawImage(ctx, img, descriptor, selectionRect, rotation = 0) {
        const x = descriptor.x - selectionRect.x;
        const y = descriptor.y - selectionRect.y;
        const swap = rotation === 90 || rotation === 270;
        const dw = swap ? descriptor.height : descriptor.width;
        const dh = swap ? descriptor.width : descriptor.height;

        ctx.save();
        ctx.translate(x + descriptor.width / 2, y + descriptor.height / 2);
        if (rotation) ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('EMPTY_BLOB')), 'image/png');
        });
    }

    function shouldCopyToClipboard() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    async function copyBlobToClipboard(blob) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            throw new Error('CLIPBOARD_UNAVAILABLE');
        }

        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type || 'image/png']: blob
            })
        ]);
    }

    async function share(blob, filename) {
        if (typeof File === 'undefined' || !navigator.share) {
            throw new Error('SHARE_UNAVAILABLE');
        }

        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        const data = {
            files: [file],
            title: filename
        };

        if (navigator.canShare && !navigator.canShare(data)) {
            throw new Error('SHARE_UNAVAILABLE');
        }

        await navigator.share(data);
    }

    function isShareCanceled(error) {
        return error?.name === 'AbortError'
            || /cancel/i.test(error?.message || '');
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function output(reader, blob, filename) {
        if (shouldCopyToClipboard()) {
            try {
                await copyBlobToClipboard(blob);
                reader.showReaderMessage('\u622a\u56fe\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
                return;
            } catch (_) {
                download(blob, filename);
                reader.showReaderMessage('\u526a\u8d34\u677f\u4e0d\u53ef\u7528\uff0c\u5df2\u6539\u4e3a\u4fdd\u5b58\u6587\u4ef6', true, 2600);
                return;
            }
        }

        if (navigator.share) {
            try {
                await share(blob, filename);
                reader.showReaderMessage('\u622a\u56fe\u5df2\u6253\u5f00\u7cfb\u7edf\u5206\u4eab');
                return;
            } catch (error) {
                if (isShareCanceled(error)) {
                    reader.showReaderMessage('\u5df2\u53d6\u6d88\u5206\u4eab');
                    return;
                }
            }
        }

        download(blob, filename);
        reader.showReaderMessage('\u622a\u56fe\u5df2\u4fdd\u5b58');
    }

    function getFileName(currentIndex, count, now = new Date()) {
        const start = currentIndex + 1;
        const end = currentIndex + count;
        const range = count === 1 ? `${start}` : `${start}-${end}`;
        const stamp = now.toISOString().replace(/[:.]/g, '-');
        return `bilibili-reader-${range}-${stamp}.png`;
    }

    async function capture(reader, selectionRect, descriptors = reader.getVisibleImageDescriptors()) {
        if (descriptors.length === 0) {
            reader.showReaderMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u622a\u56fe\u7684\u9875\u9762', true);
            return false;
        }

        reader.showReaderMessage('\u6b63\u5728\u751f\u6210\u622a\u56fe...', false, 3000);

        try {
            const loadedImages = await Promise.all(descriptors.map(async descriptor => {
                const image = await reader.loadExportImageSafe(descriptor.src);
                if (!image) throw new Error('LOAD_FAILED');
                return { descriptor, image };
            }));

            const dpr = window.devicePixelRatio || 1;
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = Math.max(1, Math.round(selectionRect.width * dpr));
            outputCanvas.height = Math.max(1, Math.round(selectionRect.height * dpr));

            const ctx = outputCanvas.getContext('2d');
            if (!ctx) throw new Error('CANVAS_CONTEXT_FAILED');
            ctx.scale(dpr, dpr);
            ctx.fillStyle = reader.getReaderBackgroundColor?.() || READER_BACKGROUND;
            ctx.fillRect(0, 0, selectionRect.width, selectionRect.height);

            loadedImages.forEach(({ descriptor, image }) => {
                drawImage(ctx, image, descriptor, selectionRect, reader.rotation);
            });

            try {
                const blob = await canvasToBlob(outputCanvas);
                await output(reader, blob, getFileName(reader.currentIndex, reader.activePageCount));
                return true;
            } catch (_) {
                reader.showReaderMessage('\u56fe\u7247\u53d7\u8de8\u57df\u9650\u5236\uff0c\u65e0\u6cd5\u5408\u6210\u622a\u56fe', true, 3000);
                return false;
            }
        } catch (_) {
            reader.showReaderMessage('\u622a\u56fe\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', true, 2800);
            return false;
        }
    }

    Toolbox.readerScreenshot = {
        getBounds,
        capture
    };
})();
