// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const DEFAULT_ANIMATION_MODE = 'fade';
    const ANIMATION_MODES = ['none', 'fade'];
    const ANIMATION_BUTTON_MAP = {
        none: ['\u65e0', '\u7ffb\u9875\u52a8\u753b\uff1a\u5173\u95ed', '#333'],
        fade: ['\u6de1\u5165', '\u7ffb\u9875\u52a8\u753b\uff1a\u6de1\u5165\u6de1\u51fa', '#4b5563']
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

    function playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `transform ${FADE_ANIMATION_DURATION}ms, opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none',
            transform: `translateX(${direction * FADE_SHIFT_DISTANCE}px) scale(0.95)`
        });

        window.setTimeout(() => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'fade', direction);
        }, FADE_ANIMATION_DURATION);
    }

    function runTransitionFlow(options) {
        const {
            animate,
            imgContainer,
            animationMode,
            step,
            isRightToLeft,
            lastStep,
            renderIndex,
            getCurrentIndex,
            transitionToken,
            getTransitionToken,
            loadImages
        } = options;
        const renderMode = resolveRenderMode(animate, Boolean(imgContainer.firstChild), animationMode);
        const direction = resolveTransitionDirection(step, isRightToLeft, lastStep);

        if (renderMode === 'fade') {
            playFadeTransition(
                imgContainer,
                renderIndex,
                getCurrentIndex,
                transitionToken,
                getTransitionToken,
                loadImages,
                direction
            );
            return;
        }

        loadImages(renderIndex, 'none', direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform) {
        imgContainer.innerHTML = '';
        imgContainer.style.transition = 'none';
        applyTransform();
        Object.assign(
            imgContainer.style,
            normalizeMode(animationMode) === 'fade'
                ? {
                    transform: `translateX(${-transitionDirection * FADE_SHIFT_DISTANCE}px) scale(0.95)`,
                    opacity: '0',
                    filter: 'none'
                }
                : {
                    opacity: '1',
                    filter: 'none'
                }
        );
    }

    function finishAnimatedRender(imgContainer, animationMode, transitionDirection, applyTransform) {
        if (normalizeMode(animationMode) === 'fade') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `transform ${FADE_SETTLE_DURATION}ms ease-out, opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1',
                filter: 'none',
                transform: 'translateX(0) scale(1)'
            });
        } else {
            Object.assign(imgContainer.style, {
                transition: 'none',
                opacity: '1',
                filter: 'none'
            });
        }
        applyTransform();
    }

    window.BiliAnimations = {
        FADE_ANIMATION_DURATION,
        FADE_SETTLE_DURATION,
        FADE_SHIFT_DISTANCE,
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
