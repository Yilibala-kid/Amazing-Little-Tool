// Bilibili Toolbox - reader page grouping helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;

    function isWideImage(img, rotation = 0) {
        const isRotated90or270 = rotation === 90 || rotation === 270;
        const width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
        const height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;
        return width > height * 1.2;
    }

    function getNextIndex({ currentIndex, total, step }) {
        const nextIndex = currentIndex + step;
        if (nextIndex >= 0 && nextIndex < total) return nextIndex;
        return currentIndex + Math.sign(step);
    }

    async function getPreviousIndex({ currentIndex, viewMode, loadImage, isWideImage: isWideImageForReader }) {
        const prevIndex = currentIndex - 1;
        if (prevIndex <= 0) return Math.max(0, prevIndex);
        if (viewMode === 'single') return prevIndex;
        if (viewMode === 'double') return Math.max(0, currentIndex - 2);

        const prevImg = await loadImage(prevIndex);
        if (prevImg && isWideImageForReader(prevImg)) return prevIndex;
        return Math.max(0, currentIndex - 2);
    }

    async function loadVisibleImages({ currentIndex, imgList, viewMode, loadImage, isWideImage: isWideImageForReader }) {
        const img1 = await loadImage(imgList[currentIndex]);
        if (!img1) return null;

        const canUseDoubleMode = viewMode === 'double' || (viewMode === 'auto' && !isWideImageForReader(img1));
        if (!canUseDoubleMode || currentIndex + 1 >= imgList.length) {
            return { images: [img1], preloadStart: currentIndex + 1 };
        }

        const img2 = await loadImage(imgList[currentIndex + 1]);
        if (!img2) return { images: [img1], preloadStart: currentIndex + 1 };

        const images = viewMode === 'auto' && isWideImageForReader(img2) ? [img1] : [img1, img2];
        return { images, preloadStart: currentIndex + images.length };
    }

    Toolbox.readerPageGroups = {
        isWideImage,
        getNextIndex,
        getPreviousIndex,
        loadVisibleImages
    };
})();
