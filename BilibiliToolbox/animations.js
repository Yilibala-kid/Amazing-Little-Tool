// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const BOOK_ANIMATION_DURATION = 500;
    const DEFAULT_ANIMATION_MODE = 'smooth';
    const ANIMATION_MODES = ['none', 'smooth', 'fade'];
    const ANIMATION_BUTTON_MAP = {
        none: ['\u65e0', '\u7ffb\u9875\u52a8\u753b\uff1a\u5173\u95ed', '#333'],
        smooth: ['\u5e73\u6ed1', '\u7ffb\u9875\u52a8\u753b\uff1a\u5e73\u6ed1\u6ed1\u52a8', '#4b5563'],
        fade: ['\u6de1\u5165', '\u7ffb\u9875\u52a8\u753b\uff1a\u6de1\u5165\u6de1\u51fa', '#4b5563'],
        book: ['\u4e66\u672c', '\u7ffb\u9875\u52a8\u753b\uff1a\u4e66\u672c\u5377\u66f2', '#4b5563']
    };

    function normalizeMode(animationMode) {
        return ANIMATION_MODES.includes(animationMode) ? animationMode : DEFAULT_ANIMATION_MODE;
    }

    function getNextMode(animationMode) {
        const currentIndex = ANIMATION_MODES.indexOf(normalizeMode(animationMode));
        return ANIMATION_MODES[(currentIndex + 1) % ANIMATION_MODES.length];
    }

    function syncAnimationButtonState(animationBtn, animationMode) {
        if (!animationBtn) return;
        const [text, title, background] = ANIMATION_BUTTON_MAP[normalizeMode(animationMode)];
        Object.assign(animationBtn, { innerText: text, title });
        animationBtn.style.background = background;
    }

    function resolveRenderMode(animate, hasExistingImage, animationMode) {
        return animate && hasExistingImage ? normalizeMode(animationMode) : 'none';
    }

    function resolveTransitionDirection(step, isRightToLeft, lastStep) {
        const normalizedStep = step || (isRightToLeft ? lastStep : -lastStep) || 1;
        return isRightToLeft ? (normalizedStep > 0 ? 1 : -1) : (normalizedStep > 0 ? -1 : 1);
    }

    function playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `transform ${FADE_ANIMATION_DURATION}ms, opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none',
            transform: `translateX(${direction * FADE_SHIFT_DISTANCE}px) scale(0.95)`
        });
        window.setTimeout(() => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'smooth', direction);
        }, FADE_ANIMATION_DURATION);
    }

    function playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none'
        });
        window.setTimeout(() => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'fade', direction);
        }, FADE_ANIMATION_DURATION);
    }

    // =====================================================================
    // 书本翻页动画（占位，待实现）
    // =====================================================================
    function playBookTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        // TODO: 实现书本3D翻页动画
        // 提示：可参考 StPageFlip-master 的几何交点算法
        console.warn('[BilibiliToolbox] book transition not implemented yet, falling back to fade');
        playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
    }

    // =====================================================================
    // 动画流程编排
    // =====================================================================

    function runTransitionFlow(options) {
        const {
            animate, imgContainer, animationMode, step, isRightToLeft, lastStep,
            renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages
        } = options;
        const renderMode = resolveRenderMode(animate, Boolean(imgContainer.firstChild), animationMode);
        const direction = resolveTransitionDirection(step, isRightToLeft, lastStep);

        if (renderMode === 'smooth') {
            playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        if (renderMode === 'fade') {
            playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        if (renderMode === 'book') {
            playBookTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        loadImages(renderIndex, 'none', direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform) {
        const mode = normalizeMode(animationMode);
        imgContainer.innerHTML = '';
        imgContainer.style.transition = 'none';
        applyTransform();
        if (mode === 'smooth') {
            Object.assign(imgContainer.style, {
                transform: `translateX(${-transitionDirection * FADE_SHIFT_DISTANCE}px) scale(0.95)`,
                opacity: '0', filter: 'none'
            });
        } else if (mode === 'fade') {
            Object.assign(imgContainer.style, { opacity: '0', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { opacity: '1', filter: 'none' });
        }
    }

    function finishAnimatedRender(imgContainer, animationMode, transitionDirection, applyTransform) {
        const mode = normalizeMode(animationMode);
        if (mode === 'smooth') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `transform ${FADE_SETTLE_DURATION}ms ease-out, opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1', filter: 'none', transform: 'translateX(0) scale(1)'
            });
        } else if (mode === 'fade') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1', filter: 'none'
            });
        } else if (mode === 'book') {
            // TODO: 实现书本动画结束时的处理
            Object.assign(imgContainer.style, { transition: 'none', opacity: '1', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { transition: 'none', opacity: '1', filter: 'none' });
        }
        applyTransform();
    }

    window.BiliAnimations = {
        FADE_ANIMATION_DURATION,
        FADE_SETTLE_DURATION,
        FADE_SHIFT_DISTANCE,
        BOOK_ANIMATION_DURATION,
        DEFAULT_ANIMATION_MODE,
        ANIMATION_MODES,
        normalizeAnimationMode: normalizeMode,
        getNextAnimationMode: getNextMode,
        syncAnimationButton: syncAnimationButtonState,
        runTransition: runTransitionFlow,
        resetImageContainer: resetAnimatedContainer,
        finishRender: finishAnimatedRender
    };
})();
