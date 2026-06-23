// Bilibili Toolbox - URL change bridge
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const URL_CHANGE_EVENT = 'bilibili-toolbox:urlchange';

    function notifyUrlChange() {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
    }

    function initUrlBridge() {
        if (window.__bilibiliToolboxUrlChangePatched) return;
        window.__bilibiliToolboxUrlChangePatched = true;

        ['pushState', 'replaceState'].forEach((methodName) => {
            const original = history[methodName];
            if (typeof original !== 'function') return;

            history[methodName] = function(...args) {
                const result = original.apply(this, args);
                notifyUrlChange();
                return result;
            };
        });

        window.addEventListener('popstate', notifyUrlChange);
        window.addEventListener('hashchange', notifyUrlChange);
    }

    Toolbox.url = {
        URL_CHANGE_EVENT,
        init: initUrlBridge,
        notifyUrlChange
    };
})();
