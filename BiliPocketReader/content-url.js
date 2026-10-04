// Bilibili Toolbox - URL change bridge
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';
    let initialized = false;
    let originalHistoryMethods = null;
    let patchedHistoryMethods = null;
    let lastUrl = null;

    function notifyUrlChange() {
        const url = window.location.href;
        if (!initialized || url === lastUrl) return;
        lastUrl = url;
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function initUrlBridge() {
        if (initialized) return;
        window.__bilibiliToolboxUrlChangePatched = true;
        initialized = true;
        lastUrl = window.location.href;
        originalHistoryMethods = {};
        patchedHistoryMethods = {};

        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') return;

            originalHistoryMethods[methodName] = original;
            patchedHistoryMethods[methodName] = function(...args) {
                const result = original.apply(this, args);
                notifyUrlChange();
                return result;
            };
            history[methodName] = patchedHistoryMethods[methodName];
        });

        window.addEventListener('popstate', notifyUrlChange);
        window.addEventListener('hashchange', notifyUrlChange);
        // Native navigation events cross extension isolated worlds; patching
        // this world's history alone cannot observe the site's own SPA calls.
        window.navigation?.addEventListener('currententrychange', notifyUrlChange);
    }

    function destroyUrlBridge() {
        if (!initialized) return;
        window.removeEventListener('popstate', notifyUrlChange);
        window.removeEventListener('hashchange', notifyUrlChange);
        window.navigation?.removeEventListener('currententrychange', notifyUrlChange);
        Object.entries(originalHistoryMethods || {}).forEach(([methodName, original]) => {
            if (history[methodName] === patchedHistoryMethods?.[methodName]) {
                history[methodName] = original;
            }
        });
        initialized = false;
        lastUrl = null;
        originalHistoryMethods = null;
        patchedHistoryMethods = null;
        window.__bilibiliToolboxUrlChangePatched = false;
    }

    Toolbox.url = {
        URL_CHANGE_EVENT,
        init: initUrlBridge,
        destroy: destroyUrlBridge,
        notifyUrlChange
    };
})();
