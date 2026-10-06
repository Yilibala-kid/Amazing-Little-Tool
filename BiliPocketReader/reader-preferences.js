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
    const BACKGROUND_MODES = Object.freeze(['black', 'darkGray', 'lightGray', 'white']);
    const FILTER_MODES = Object.freeze(['original', 'soft', 'warm', 'grayscale']);
    const PRELOAD_PAGES = Object.freeze(['2', '4', '6', 'all']);
    const IMAGE_MEMORY_POLICIES = Object.freeze(['page', 'previous']);
    const ANIMATION_MODES = Object.freeze([...Toolbox.animations.ANIMATION_MODES]);
    const DEFAULT_READER_PREFERENCES = Object.freeze({
        isRightToLeft: true,
        viewMode: 'auto',
        animationMode: 'smooth',
        imageRenderMode: 'smooth',
        backgroundMode: 'darkGray',
        filterMode: 'original',
        preloadPages: 'all',
        imageMemoryPolicy: 'page',
        tapPageNavigation: false
    });
    const MODES_BY_KEY = Object.freeze({
        viewMode: VIEW_MODES,
        animationMode: ANIMATION_MODES,
        imageRenderMode: IMAGE_RENDER_MODES,
        backgroundMode: BACKGROUND_MODES,
        filterMode: FILTER_MODES,
        preloadPages: PRELOAD_PAGES,
        imageMemoryPolicy: IMAGE_MEMORY_POLICIES
    });

    function normalizeMode(key, value) {
        return MODES_BY_KEY[key].includes(value) ? value : DEFAULT_READER_PREFERENCES[key];
    }

    function normalizeAnimationMode(mode) {
        return normalizeMode('animationMode', mode);
    }

    function normalizeImageRenderMode(mode) {
        return normalizeMode('imageRenderMode', mode);
    }

    function normalizeBackgroundMode(mode) {
        return normalizeMode('backgroundMode', mode);
    }

    function normalizeFilterMode(mode) {
        return normalizeMode('filterMode', mode);
    }

    function normalizePreferences(value = {}) {
        const input = value && typeof value === 'object' ? value : {};
        return Object.fromEntries(Object.entries(DEFAULT_READER_PREFERENCES).map(([key, fallback]) => [
            key, MODES_BY_KEY[key]
                ? normalizeMode(key, input[key])
                : (typeof input[key] === 'boolean' ? input[key] : fallback)
        ]));
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
        BACKGROUND_MODES,
        FILTER_MODES,
        PRELOAD_PAGES,
        IMAGE_MEMORY_POLICIES,
        ANIMATION_MODES,
        DEFAULT_READER_PREFERENCES,
        normalizeAnimationMode,
        normalizeImageRenderMode,
        normalizeBackgroundMode,
        normalizeFilterMode,
        normalize: normalizePreferences,
        load: loadPreferences,
        save: savePreferences
    };
})();
