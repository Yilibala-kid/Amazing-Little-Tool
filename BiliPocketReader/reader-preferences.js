// Bilibili Toolbox - reader preferences
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const storage = Toolbox.storage;
    const VIEW_MODES = Object.freeze(['auto', 'single', 'double']);
    const IMAGE_RENDER_MODES = Object.freeze(['sharp', 'smooth']);
    const DEFAULT_READER_PREFERENCES = Object.freeze({
        isRightToLeft: true,
        viewMode: 'auto',
        animationMode: 'smooth',
        imageRenderMode: 'smooth',
        tapPageNavigation: true
    });

    function normalizeAnimationMode(mode) {
        return Toolbox.animations.normalizeAnimationMode(mode);
    }

    function normalizeImageRenderMode(mode) {
        return IMAGE_RENDER_MODES.includes(mode) ? mode : DEFAULT_READER_PREFERENCES.imageRenderMode;
    }

    function normalizePreferences(value = {}) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            isRightToLeft: typeof input.isRightToLeft === 'boolean'
                ? input.isRightToLeft
                : DEFAULT_READER_PREFERENCES.isRightToLeft,
            viewMode: VIEW_MODES.includes(input.viewMode)
                ? input.viewMode
                : DEFAULT_READER_PREFERENCES.viewMode,
            animationMode: normalizeAnimationMode(input.animationMode || DEFAULT_READER_PREFERENCES.animationMode),
            imageRenderMode: normalizeImageRenderMode(input.imageRenderMode || DEFAULT_READER_PREFERENCES.imageRenderMode),
            tapPageNavigation: typeof input.tapPageNavigation === 'boolean'
                ? input.tapPageNavigation
                : DEFAULT_READER_PREFERENCES.tapPageNavigation
        };
    }

    function loadPreferences() {
        return normalizePreferences(storage.getSetting(Shared.TOOLBOX_SETTINGS.readerPreferences, DEFAULT_READER_PREFERENCES));
    }

    async function savePreferences(value) {
        await storage.setSetting(Shared.TOOLBOX_SETTINGS.readerPreferences, normalizePreferences(value));
    }

    Toolbox.readerPreferences = {
        VIEW_MODES,
        IMAGE_RENDER_MODES,
        DEFAULT_READER_PREFERENCES,
        normalizeAnimationMode,
        normalizeImageRenderMode,
        normalize: normalizePreferences,
        load: loadPreferences,
        save: savePreferences
    };
})();
