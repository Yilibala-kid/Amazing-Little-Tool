// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const SMOOTH_SCALE_START = 0.95;
    const DEFAULT_ANIMATION_MODE = 'smooth';
    const ANIMATION_MODES = ['smooth', 'fade'];
    const activeTransitions = new WeakMap();
    const IMMEDIATE_RENDER_MODE = 'immediate';

    function cancelTransition(container, settle = false) {
        if (!container) return;
        activeTransitions.get(container)?.(settle);
        activeTransitions.delete(container);
        Object.assign(container.style, { transition: 'none', opacity: '1' });
    }

    function scheduleCommit(container, commit) {
        const timer = window.setTimeout(() => {
            activeTransitions.delete(container);
            commit();
        }, FADE_ANIMATION_DURATION);
        activeTransitions.set(container, settle => {
            window.clearTimeout(timer);
            if (settle) commit();
        });
    }

    function normalizeMode(animationMode) {
        return ANIMATION_MODES.includes(animationMode) ? animationMode : DEFAULT_ANIMATION_MODE;
    }

    function resolveRenderMode(animate, hasExistingImage, animationMode) {
        return animate && hasExistingImage ? normalizeMode(animationMode) : IMMEDIATE_RENDER_MODE;
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
        scheduleCommit(imgContainer, () => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'smooth', direction);
        });
    }

    function playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction) {
        Object.assign(imgContainer.style, {
            transition: `opacity ${FADE_ANIMATION_DURATION}ms`,
            opacity: '0',
            filter: 'none'
        });
        scheduleCommit(imgContainer, () => {
            if (renderIndex !== getCurrentIndex()) return;
            if (transitionToken !== getTransitionToken()) return;
            loadImages(renderIndex, 'fade', direction);
        });
    }

    function runTransitionFlow(options) {
        const {
            animate, imgContainer, animationMode, step, isRightToLeft, lastStep,
            renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages,
            getTransform, getShiftedTransform
        } = options;
        cancelTransition(imgContainer);
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const renderMode = resolveRenderMode(animate && !reduceMotion, Boolean(imgContainer.firstChild), animationMode);
        const direction = resolveTransitionDirection(step, isRightToLeft, lastStep);

        if (renderMode === 'smooth') {
            playSmoothTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction, getTransform, getShiftedTransform);
            return;
        }
        if (renderMode === 'fade') {
            playFadeTransition(imgContainer, renderIndex, getCurrentIndex, transitionToken, getTransitionToken, loadImages, direction);
            return;
        }
        loadImages(renderIndex, IMMEDIATE_RENDER_MODE, direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform, getTransform, getShiftedTransformFn) {
        const mode = ANIMATION_MODES.includes(animationMode) ? animationMode : IMMEDIATE_RENDER_MODE;
        imgContainer.style.transition = 'none';
        applyTransform();
        if (mode === 'smooth') {
            Object.assign(imgContainer.style, {
                transform: withSubtleScale(getShiftedTransform(getShiftedTransformFn, getTransform, -transitionDirection * FADE_SHIFT_DISTANCE)),
                opacity: '0',
                filter: 'none'
            });
        } else if (mode === 'fade') {
            Object.assign(imgContainer.style, { opacity: '0', filter: 'none' });
        } else {
            Object.assign(imgContainer.style, { opacity: '1', filter: 'none' });
        }
    }

    function finishAnimatedRender(imgContainer, animationMode, transitionDirection, applyTransform, getTransform, getShiftedTransformFn) {
        const mode = ANIMATION_MODES.includes(animationMode) ? animationMode : IMMEDIATE_RENDER_MODE;
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
        IMMEDIATE_RENDER_MODE,
        normalizeAnimationMode: normalizeMode,
        runTransition: runTransitionFlow,
        resetImageContainer: resetAnimatedContainer,
        finishRender: finishAnimatedRender,
        cancel: cancelTransition
    };

    window.BilibiliToolbox.animations = animationsApi;
})();
