// Bilibili Toolbox - URL change bridge
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';
    let initialized = false;
    let originalHistoryMethods = null;
    let patchedHistoryMethods = null;

    function notifyUrlChange() {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function initUrlBridge() {
        if (initialized) return;
        window.__bilibiliToolboxUrlChangePatched = true;
        initialized = true;
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
    }

    function destroyUrlBridge() {
        if (!initialized) return;
        window.removeEventListener('popstate', notifyUrlChange);
        window.removeEventListener('hashchange', notifyUrlChange);
        Object.entries(originalHistoryMethods || {}).forEach(([methodName, original]) => {
            if (history[methodName] === patchedHistoryMethods?.[methodName]) {
                history[methodName] = original;
            }
        });
        initialized = false;
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
