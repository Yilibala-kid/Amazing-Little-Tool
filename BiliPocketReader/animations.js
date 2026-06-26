// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const SMOOTH_SCALE_START = 0.95;
    const DEFAULT_ANIMATION_MODE = 'smooth';
    const ANIMATION_MODES = ['none', 'smooth', 'fade'];
    const ANIMATION_BUTTON_MAP = {
        none: ['\u65e0', '\u7ffb\u9875\u52a8\u753b\uff1a\u5173\u95ed'],
        smooth: ['\u5e73\u6ed1', '\u7ffb\u9875\u52a8\u753b\uff1a\u6de1\u5165 + \u5e73\u79fb + \u7ec6\u5fae\u7f29\u653e'],
        fade: ['\u6de1\u5165', '\u7ffb\u9875\u52a8\u753b\uff1a\u6de1\u5165\u6de1\u51fa']
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
        const [text, title] = ANIMATION_BUTTON_MAP[normalizeMode(animationMode)];
        Object.assign(animationBtn, { innerText: text, title });
        animationBtn.style.background = '';
    }

    function resolveRenderMode(animate, hasExistingImage, animationMode) {
        return animate && hasExistingImage ? normalizeMode(animationMode) : 'none';
    }

    function resolveTransitionDirection(step, isRightToLeft, lastStep) {
        const normalizedStep = step || (isRightToLeft ? lastStep : -lastStep) || 1;
        return isRightToLeft ? (normalizedStep > 0 ? 1 : -1) : (normalizedStep > 0 ? -1 : 1);
    }

    function getBaseTransform(getTransform) {
        return typeof getTransform === 'function' ? getTransform() : 'scale(1) translate(0px,0px)';
    }

    function getShiftedTransform(getShiftedTransformFn, getTransform, screenTranslateX) {
        return typeof getShiftedTransformFn === 'function'
            ? getShiftedTransformFn(screenTranslateX)
            : `translateX(${screenTranslateX}px) ${getBaseTransform(getTransform)}`;
    }

    function withSubtleScale(transform, scale = SMOOTH_SCALE_START) {
        return `${transform} scale(${scale})`;
    }

    function playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction, getTransform, getShiftedTransformFn) {
        Object.assign(imgContainer.style, {
            transition: `transform ${FADE_ANIMATION_DURATION}ms, opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none',
            transform: withSubtleScale(getShiftedTransform(getShiftedTransformFn, getTransform, direction * FADE_SHIFT_DISTANCE))
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

    function runTransitionFlow(options) {
        const {
            animate, imgContainer, animationMode, step, isRightToLeft, lastStep,
            renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages,
            getTransform, getShiftedTransform
        } = options;
        const renderMode = resolveRenderMode(animate, Boolean(imgContainer.firstChild), animationMode);
        const direction = resolveTransitionDirection(step, isRightToLeft, lastStep);

        if (renderMode === 'smooth') {
            playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction, getTransform, getShiftedTransform);
            return;
        }
        if (renderMode === 'fade') {
            playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        loadImages(renderIndex, 'none', direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform, getTransform, getShiftedTransformFn) {
        const mode = normalizeMode(animationMode);
        imgContainer.style.transition = 'none';
        applyTransform();
        if (mode === 'smooth') {
            imgContainer.innerHTML = '';
            Object.assign(imgContainer.style, {
                transform: withSubtleScale(getShiftedTransform(getShiftedTransformFn, getTransform, -transitionDirection * FADE_SHIFT_DISTANCE)),
                opacity: '0',
                filter: 'none'
            });
        } else if (mode === 'fade') {
            imgContainer.innerHTML = '';
            Object.assign(imgContainer.style, { opacity: '0', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { opacity: '1', filter: 'none' });
        }
    }

    function finishAnimatedRender(imgContainer, animationMode, transitionDirection, applyTransform, getTransform, getShiftedTransformFn) {
        const mode = normalizeMode(animationMode);
        if (mode === 'smooth') {
            Object.assign(imgContainer.style, {
                transition: 'none',
                opacity: '0',
                filter: 'none',
                transform: withSubtleScale(getShiftedTransform(getShiftedTransformFn, getTransform, -transitionDirection * FADE_SHIFT_DISTANCE))
            });
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `transform ${FADE_SETTLE_DURATION}ms ease-out, opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1',
                filter: 'none',
                transform: getBaseTransform(getTransform)
            });
        } else if (mode === 'fade') {
            imgContainer.getBoundingClientRect();
            Object.assign(imgContainer.style, {
                transition: `opacity ${FADE_SETTLE_DURATION}ms ease-out`,
                opacity: '1',
                filter: 'none'
            });
        } else {
            Object.assign(imgContainer.style, { transition: 'none', opacity: '1', filter: 'none' });
        }
        applyTransform();
    }

    const animationsApi = {
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

    window.BilibiliToolbox.animations = animationsApi;
})();
