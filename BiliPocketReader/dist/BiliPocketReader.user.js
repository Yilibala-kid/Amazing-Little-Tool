// ==UserScript==
// @name         BiliPocketReader
// @namespace    https://local/bilibili-toolbox
// @version      1.0
// @description  B站漫画模式阅读器 + 收藏夹快捷跳转
// @match        *://bilibili.com/*
// @match        *://*.bilibili.com/*
// @run-at       document-start
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function() {
    'use strict';

    const changeListeners = new Set();

    async function readValue(key) {
        return GM.getValue(key);
    }

    async function writeValue(key, value) {
        await GM.setValue(key, value);
    }

    function normalizeGetKeys(keys) {
        if (Array.isArray(keys)) return keys.map(key => [key, undefined]);
        if (typeof keys === 'string') return [[keys, undefined]];
        if (keys && typeof keys === 'object') return Object.entries(keys);
        return [];
    }

    const chromeShim = window.chrome || {};
    chromeShim.storage = chromeShim.storage || {};
    chromeShim.storage.local = chromeShim.storage.local || {
        async get(keys) {
            const result = {};
            for (const [key, fallback] of normalizeGetKeys(keys)) {
                const value = await readValue(key);
                result[key] = value === undefined ? fallback : value;
            }
            return result;
        },
        async set(items) {
            const changes = {};
            for (const [key, newValue] of Object.entries(items || {})) {
                const oldValue = await readValue(key);
                await writeValue(key, newValue);
                changes[key] = { oldValue, newValue };
            }
            changeListeners.forEach(listener => listener(changes, 'local'));
        }
    };
    chromeShim.storage.onChanged = chromeShim.storage.onChanged || {
        addListener(listener) { changeListeners.add(listener); },
        removeListener(listener) { changeListeners.delete(listener); }
    };
    chromeShim.runtime = chromeShim.runtime || {};
    chromeShim.runtime.onMessage = chromeShim.runtime.onMessage || {
        addListener() {},
        removeListener() {}
    };
    window.chrome = chromeShim;

    const css = "/* ===== content-base.css ===== */\n/* Bilibili Toolbox — Spotify-inspired dark theme */\r\n\r\n:root {\r\n    --acc: #fb7299;\r\n    --acc-hover: #fc8bab;\r\n    --acc-active: #e86288;\r\n    --bg-deepest: #0a0a0a;\r\n    --bg-surface: #181818;\r\n    --bg-elevated: #1f1f1f;\r\n    --bg-overlay: rgba(20, 20, 20, 0.94);\r\n    --text-primary: #ffffff;\r\n    --text-secondary: #b3b3b3;\r\n    --text-muted: #7c7c7c;\r\n    --border-subtle: rgba(255, 255, 255, 0.12);\r\n    --border-strong: #4d4d4d;\r\n    --error: #f3727f;\r\n    --error-hover: #e86a77;\r\n    --shadow-heavy: 0 8px 24px rgba(0, 0, 0, 0.5);\r\n    --shadow-card: 0 4px 8px rgba(0, 0, 0, 0.3);\r\n    --shadow-float: 0 4px 16px rgba(251, 114, 153, 0.25);\r\n    --radius-sm: 6px;\r\n    --radius-md: 8px;\r\n    --radius-lg: 12px;\r\n    --radius-pill: 9999px;\r\n    --font: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;\r\n}\r\n\r\n\n/* ===== content-toolbox.css ===== */\n/* ===== Floating star button ===== */\r\n#bilibili-fav-float-btn {\r\n    position: fixed;\r\n    bottom: 80px;\r\n    right: 20px;\r\n    width: 50px;\r\n    height: 50px;\r\n    background: var(--acc);\r\n    border-radius: 50%;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    font-size: 24px;\r\n    cursor: pointer;\r\n    box-shadow: var(--shadow-float);\r\n    z-index: 999999;\r\n    transition: transform 0.2s, box-shadow 0.2s, opacity 0.3s, visibility 0.3s;\r\n    line-height: 1;\r\n    text-align: center;\r\n}\r\n\r\n#bilibili-fav-float-btn:hover {\r\n    transform: scale(1.1);\r\n    box-shadow: 0 6px 20px rgba(251, 114, 153, 0.4);\r\n}\r\n\r\n#bilibili-fav-float-btn.dynamic-filter-active {\n    border-radius: var(--radius-sm);\n}\n\r\n#bilibili-fav-float-btn.bilibili-fav-video-hidden {\r\n    opacity: 0;\r\n}\r\n\r\n#bilibili-fav-float-btn.bilibili-fav-video-visible {\r\n    opacity: 1;\r\n}\r\n\r\n/* ===== Shared panel base ===== */\r\n#bilibili-fav-panel,\r\n#bilibili-toolbox-settings-panel {\r\n    position: fixed;\r\n    bottom: 140px;\r\n    right: 20px;\r\n    width: 280px;\r\n    background: var(--bg-overlay);\r\n    backdrop-filter: blur(20px);\r\n    -webkit-backdrop-filter: blur(20px);\r\n    border-radius: var(--radius-lg);\r\n    box-shadow: var(--shadow-heavy);\r\n    z-index: 1000000;\r\n    opacity: 0;\r\n    visibility: hidden;\r\n    transition: opacity 0.2s, transform 0.2s, visibility 0.2s;\r\n    font-family: var(--font);\r\n    transform: translateY(10px);\r\n    color: var(--text-primary);\r\n    border: 1px solid var(--border-subtle);\r\n}\r\n\r\n#bilibili-fav-panel {\r\n    --bilibili-fav-columns: 2;\r\n    --bilibili-fav-item-width: 130px;\r\n    --bilibili-fav-list-gap: 4px;\r\n    --bilibili-fav-list-padding-x: 10px;\r\n    width: calc(\r\n        var(--bilibili-fav-columns) * var(--bilibili-fav-item-width)\r\n        + (var(--bilibili-fav-columns) - 1) * var(--bilibili-fav-list-gap)\r\n        + var(--bilibili-fav-list-padding-x) * 2\r\n    );\r\n}\r\n\r\n#bilibili-toolbox-settings-panel {\r\n    width: 320px;\r\n    z-index: 1000001;\r\n}\r\n\r\n#bilibili-fav-panel.show,\r\n#bilibili-toolbox-settings-panel.show {\r\n    opacity: 1;\r\n    visibility: visible;\r\n    transform: translateY(0);\r\n}\r\n\r\n/* ===== Panel header ===== */\r\n.bilibili-fav-header {\r\n    display: flex;\r\n    justify-content: space-between;\r\n    align-items: center;\r\n    padding: 10px 16px;\r\n    border-bottom: 1px solid var(--border-subtle);\r\n    background: var(--bg-elevated);\r\n    color: var(--text-primary);\r\n    border-radius: var(--radius-lg) var(--radius-lg) 0 0;\r\n    font-weight: 600;\r\n    font-size: 14px;\r\n    letter-spacing: 0.3px;\r\n}\r\n\r\n.bilibili-fav-header-actions {\r\n    display: flex;\r\n    align-items: center;\r\n    gap: 6px;\r\n}\r\n\r\n/* ===== Panel content ===== */\r\n.bilibili-fav-content { max-height: 400px; overflow: auto; }\r\n\r\n.bilibili-fav-list {\r\n    padding: 8px var(--bilibili-fav-list-padding-x);\r\n    display: grid;\r\n    grid-template-columns: repeat(var(--bilibili-fav-columns, 2), var(--bilibili-fav-item-width));\r\n    gap: var(--bilibili-fav-list-gap);\r\n}\r\n\r\n.bilibili-fav-content::-webkit-scrollbar { width: 5px; }\r\n.bilibili-fav-content::-webkit-scrollbar-track { background: transparent; }\r\n.bilibili-fav-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }\r\n.bilibili-fav-content::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }\r\n\r\n/* ===== Toolbox settings content ===== */\r\n.bilibili-toolbox-control-content {\r\n    padding: 14px;\r\n    display: flex;\r\n    flex-direction: column;\r\n    gap: 14px;\r\n}\r\n\r\n.bilibili-toolbox-control-section {\r\n    display: flex;\r\n    flex-direction: column;\r\n    gap: 10px;\r\n}\r\n\r\n.bilibili-toolbox-section-title {\r\n    color: var(--text-secondary);\r\n    font-size: 12px;\r\n    font-weight: 700;\r\n    line-height: 1;\r\n}\r\n\r\n.bilibili-toolbox-control-row {\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: space-between;\r\n    gap: 12px;\r\n    padding: 12px 14px;\r\n    border-radius: var(--radius-md);\r\n    background: var(--bg-surface);\r\n    cursor: pointer;\r\n    border: 1px solid var(--border-subtle);\r\n}\r\n\r\n.bilibili-toolbox-control-row-stack {\r\n    align-items: stretch;\r\n    cursor: default;\r\n    flex-direction: column;\r\n    gap: 10px;\r\n}\r\n\r\n.bilibili-toolbox-control-copy {\r\n    display: flex;\r\n    flex-direction: column;\r\n    gap: 4px;\r\n    min-width: 0;\r\n}\r\n\r\n.bilibili-toolbox-control-title {\r\n    font-size: 14px;\r\n    font-weight: 600;\r\n    color: var(--text-primary);\r\n}\r\n\r\n.bilibili-toolbox-control-desc {\r\n    font-size: 12px;\r\n    color: var(--text-secondary);\r\n    line-height: 1.4;\r\n}\r\n\r\n.bilibili-toolbox-segmented {\r\n    display: grid;\r\n    grid-template-columns: repeat(4, minmax(0, 1fr));\r\n    gap: 4px;\r\n    padding: 3px;\r\n    border-radius: var(--radius-pill);\r\n    background: var(--bg-deepest);\r\n    border: 1px solid var(--border-subtle);\r\n}\r\n\r\n.bilibili-toolbox-segmented button {\r\n    min-height: 30px;\r\n    padding: 0;\r\n    color: var(--text-secondary);\r\n    background: transparent;\r\n    border: none;\r\n    border-radius: var(--radius-pill);\r\n    cursor: pointer;\r\n    font: 600 13px/1 var(--font);\r\n}\r\n\r\n.bilibili-toolbox-segmented button:hover {\r\n    color: var(--text-primary);\r\n    background: rgba(255, 255, 255, 0.08);\r\n}\r\n\r\n.bilibili-toolbox-segmented button.active {\r\n    color: #fff;\r\n    background: var(--acc);\r\n}\r\n\r\n.bilibili-toolbox-keyword-input {\n    width: 100%;\r\n    min-height: 38px;\r\n    padding: 0 12px;\r\n    box-sizing: border-box;\r\n    color: var(--text-primary);\r\n    background: var(--bg-deepest);\r\n    border: 1px solid var(--border-subtle);\r\n    border-radius: var(--radius-md);\r\n    font-family: var(--font);\r\n    font-size: 13px;\r\n    outline: none;\r\n    transition: border-color 0.2s, box-shadow 0.2s, opacity 0.2s;\r\n}\r\n\r\n.bilibili-toolbox-keyword-input::placeholder {\r\n    color: var(--text-muted);\r\n}\r\n\r\n.bilibili-toolbox-keyword-input:focus {\r\n    border-color: var(--acc);\r\n    box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.18);\r\n}\r\n\r\n/* ===== Toggle switch ===== */\r\n.bilibili-toolbox-switch {\r\n    position: relative;\r\n    width: 46px;\r\n    height: 28px;\r\n    flex-shrink: 0;\r\n}\r\n\r\n.bilibili-toolbox-switch input {\r\n    position: absolute;\r\n    inset: 0;\r\n    opacity: 0;\r\n    cursor: pointer;\r\n    margin: 0;\r\n}\r\n\r\n.bilibili-toolbox-switch-slider {\r\n    position: absolute;\r\n    inset: 0;\r\n    border-radius: var(--radius-pill);\r\n    background: rgba(255, 255, 255, 0.2);\r\n    transition: background 0.2s;\r\n}\r\n\r\n.bilibili-toolbox-switch-slider::before {\r\n    content: \"\";\r\n    position: absolute;\r\n    top: 3px;\r\n    left: 3px;\r\n    width: 22px;\r\n    height: 22px;\r\n    border-radius: 50%;\r\n    background: #fff;\r\n    transition: transform 0.2s;\r\n    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);\r\n}\r\n\r\n.bilibili-toolbox-switch input:checked + .bilibili-toolbox-switch-slider {\r\n    background: var(--acc);\r\n}\r\n\r\n.bilibili-toolbox-switch input:checked + .bilibili-toolbox-switch-slider::before {\r\n    transform: translateX(18px);\r\n}\r\n\r\n/* ===== Empty state ===== */\r\n.bilibili-fav-empty { grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px 20px; font-size: 14px; }\r\n\r\n/* ===== Toast message ===== */\r\n.bilibili-fav-msg { padding: 8px; text-align: center; font-size: 12px; display: none; }\r\n\r\n/* ===== Pill buttons (global) ===== */\r\n.bilibili-fav-add-btn,\r\n.bilibili-fav-control-btn,\r\n.bilibili-toolbox-export-btn,\r\n.bilibili-toolbox-import-btn {\r\n    padding: 10px 0;\r\n    font-size: 13px;\r\n    font-weight: 600;\r\n    border: none;\r\n    border-radius: var(--radius-pill);\r\n    cursor: pointer;\r\n    transition: all 0.2s;\r\n    color: var(--text-primary);\r\n    letter-spacing: 0.3px;\r\n    flex: 1;\r\n}\r\n\r\n.bilibili-fav-add-btn {\r\n    padding: 8px 16px;\r\n    flex: none;\r\n}\r\n\r\n.bilibili-fav-control-btn {\r\n    display: none;\r\n    padding: 8px 12px;\r\n    flex: none;\r\n}\r\n\r\n/* Primary pill — accent fill */\r\n.bilibili-fav-add-btn,\r\n.bilibili-fav-control-btn,\r\n.bilibili-toolbox-export-btn {\r\n    background: var(--acc);\r\n    color: #fff;\r\n}\r\n\r\n.bilibili-fav-add-btn:hover,\r\n.bilibili-fav-control-btn:hover,\r\n.bilibili-toolbox-export-btn:hover {\r\n    background: var(--acc-hover);\r\n}\r\n\r\n/* Secondary pill — dark fill */\r\n.bilibili-toolbox-import-btn {\r\n    background: var(--bg-elevated);\r\n    border: 1px solid var(--border-strong);\r\n}\r\n\r\n.bilibili-toolbox-import-btn:hover {\r\n    background: #2a2a2a;\r\n}\r\n\r\n/* ===== Button group layout ===== */\r\n.bilibili-toolbox-control-actions {\r\n    display: flex;\r\n    gap: 8px;\r\n    padding: 0 16px 16px;\r\n}\r\n\r\n/* ===== Export text document ===== */\r\n.bilibili-toolbox-export-dialog {\r\n    position: fixed;\r\n    inset: 0;\r\n    z-index: 1000002;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    padding: 16px;\r\n    background: rgba(0, 0, 0, 0.72);\r\n}\r\n\r\n.bilibili-toolbox-export-document {\r\n    display: flex;\r\n    width: min(640px, 100%);\r\n    max-height: min(720px, 86vh);\r\n    flex-direction: column;\r\n    overflow: hidden;\r\n    background: var(--bg-elevated);\r\n    border: 1px solid var(--border-subtle);\r\n    border-radius: var(--radius-md);\r\n    box-shadow: var(--shadow-heavy);\r\n}\r\n\r\n.bilibili-toolbox-export-header {\r\n    display: flex;\r\n    min-height: 44px;\r\n    align-items: center;\r\n    justify-content: space-between;\r\n    padding: 0 14px;\r\n    color: var(--text-primary);\r\n    font-size: 14px;\r\n    font-weight: 600;\r\n    border-bottom: 1px solid var(--border-subtle);\r\n}\r\n\r\n.bilibili-toolbox-export-close {\r\n    display: inline-flex;\r\n    width: 30px;\r\n    height: 30px;\r\n    align-items: center;\r\n    justify-content: center;\r\n    padding: 0;\r\n    color: var(--text-secondary);\r\n    background: transparent;\r\n    border: none;\r\n    border-radius: 50%;\r\n    cursor: pointer;\r\n    font-size: 22px;\r\n    line-height: 1;\r\n}\r\n\r\n.bilibili-toolbox-export-close:hover {\r\n    color: var(--text-primary);\r\n    background: rgba(255, 255, 255, 0.1);\r\n}\r\n\r\n.bilibili-toolbox-export-text {\r\n    width: 100%;\r\n    min-height: min(560px, 72vh);\r\n    padding: 14px;\r\n    resize: vertical;\r\n    box-sizing: border-box;\r\n    color: var(--text-primary);\r\n    background: var(--bg-deepest);\r\n    border: none;\r\n    outline: none;\r\n    font-family: Consolas, \"Courier New\", monospace;\r\n    font-size: 13px;\r\n    line-height: 1.5;\r\n}\r\n\r\n.bilibili-toolbox-export-footer {\r\n    display: flex;\r\n    min-height: 52px;\r\n    align-items: center;\r\n    justify-content: space-between;\r\n    gap: 12px;\r\n    padding: 8px 12px;\r\n    border-top: 1px solid var(--border-subtle);\r\n}\r\n\r\n.bilibili-toolbox-export-status {\r\n    color: var(--text-secondary);\r\n    font-size: 12px;\r\n    line-height: 1.4;\r\n}\r\n\r\n.bilibili-toolbox-export-status.is-error {\r\n    color: var(--error);\r\n}\r\n\r\n.bilibili-toolbox-export-actions {\r\n    display: flex;\r\n    flex-shrink: 0;\r\n    align-items: center;\r\n    gap: 8px;\r\n}\r\n\r\n.bilibili-toolbox-export-clipboard,\r\n.bilibili-toolbox-export-confirm {\r\n    flex-shrink: 0;\r\n    padding: 8px 18px;\r\n    color: #fff;\r\n    background: var(--acc);\r\n    border: none;\r\n    border-radius: var(--radius-pill);\r\n    cursor: pointer;\r\n    font-size: 13px;\r\n    font-weight: 600;\r\n}\r\n\r\n.bilibili-toolbox-export-clipboard:hover,\r\n.bilibili-toolbox-export-confirm:hover {\r\n    background: var(--acc-hover);\r\n}\r\n\r\n/* ===== Favorite list items ===== */\r\n.bilibili-fav-item-link {\r\n    display: block;\r\n    text-decoration: none;\r\n    color: inherit;\r\n    width: var(--bilibili-fav-item-width);\r\n    min-width: 0;\r\n    position: relative;\r\n}\r\n\r\n.bilibili-fav-item {\r\n    display: flex;\r\n    flex-direction: column;\r\n    align-items: center;\r\n    padding: 8px 6px 10px;\r\n    border-radius: var(--radius-md);\r\n    transition: background 0.2s;\r\n    text-align: center;\r\n    position: relative;\r\n    overflow: hidden;\r\n    height: 88px;\r\n    box-sizing: border-box;\r\n    background: transparent;\r\n}\r\n\r\n.bilibili-fav-item[data-readlist=\"true\"] { padding: 0; }\r\n\r\n.bilibili-fav-item-link:hover .bilibili-fav-item {\r\n    background: var(--bg-surface);\r\n}\r\n\r\n.bilibili-fav-item-info {\r\n    display: flex;\r\n    flex-direction: column;\r\n    align-items: center;\r\n    width: 100%;\r\n    height: 100%;\r\n    position: relative;\r\n    z-index: 1;\r\n}\r\n\r\n.bilibili-fav-item[data-readlist=\"true\"] .bilibili-fav-item-info {\r\n    padding: 0;\r\n    overflow: hidden;\r\n    border-radius: inherit;\r\n}\r\n\r\n/* ===== Avatar — round, no border ===== */\r\n.bilibili-fav-avatar {\r\n    width: 44px;\r\n    height: 44px;\r\n    border-radius: 50%;\r\n    object-fit: cover;\r\n    position: relative;\r\n    z-index: 1;\r\n    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);\r\n}\r\n\r\n.bilibili-fav-avatar.square {\r\n    border-radius: var(--radius-md);\r\n}\r\n\r\n.bilibili-fav-avatar.cover {\r\n    display: block;\r\n    width: 100%;\r\n    height: 100%;\r\n    border-radius: var(--radius-md);\r\n    box-shadow: none;\r\n    position: absolute;\r\n    inset: 0;\r\n}\r\n\r\n/* ===== Name label ===== */\r\n.bilibili-fav-name {\r\n    font-size: 12px;\r\n    color: var(--text-primary);\r\n    font-weight: 500;\r\n    max-width: 100%;\r\n    overflow: hidden;\r\n    text-overflow: ellipsis;\r\n    white-space: nowrap;\r\n    position: relative;\r\n    z-index: 1;\r\n    margin-top: 6px;\r\n}\r\n\r\n.bilibili-fav-item[data-readlist=\"true\"] .bilibili-fav-name {\r\n    position: absolute;\r\n    bottom: 0;\r\n    left: 0;\r\n    right: 0;\r\n    color: #fff;\r\n    background: linear-gradient(transparent, rgba(0, 0, 0, 0.75));\r\n    padding: 20px 8px 8px;\r\n    border-radius: 0 0 var(--radius-md) var(--radius-md);\r\n    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);\r\n    font-weight: 600;\r\n}\r\n\r\n/* ===== Delete button — ghost pill ===== */\r\n.bilibili-fav-delete {\r\n    position: absolute;\r\n    top: 4px;\r\n    right: 4px;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    width: 20px;\r\n    height: 20px;\r\n    padding: 0;\r\n    font-size: 14px;\r\n    line-height: 1;\r\n    color: var(--text-primary);\r\n    background: rgba(0, 0, 0, 0.5);\r\n    border: none;\r\n    border-radius: 50%;\r\n    appearance: none;\r\n    cursor: pointer;\r\n    transition: all 0.2s;\r\n    z-index: 2;\r\n    opacity: 0;\r\n}\r\n\r\n.bilibili-fav-item:hover .bilibili-fav-delete { opacity: 1; }\r\n.bilibili-fav-delete:hover { background: var(--error); }\r\n\r\n/* ===== Dynamic filter visibility ===== */\r\n.bilibili-toolbox-dynamic-filter-active .bili-dyn-list__item:not(.bilibili-toolbox-dynamic-filter-ready),\r\n.bilibili-toolbox-dynamic-filter-active .bili-dyn-item:not(.bilibili-toolbox-dynamic-filter-ready),\r\n.bilibili-toolbox-dynamic-filter-active .bili-opus-view:not(.bilibili-toolbox-dynamic-filter-ready),\r\n.bilibili-toolbox-hide-forward-dynamic { display: none !important; }\r\n\r\n/* ══════════════════════════════════════ */\r\n\n/* ===== content-reader.css ===== */\n/*  Comic Reader — Spotify dark theme   */\r\n/* ══════════════════════════════════════ */\r\n\r\n.comic-entry-btn {\r\n    position: fixed;\r\n    bottom: 24px;\r\n    right: 24px;\r\n    z-index: 9999;\r\n    display: inline-flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    padding: 10px 18px;\r\n    cursor: pointer;\r\n    background: var(--acc);\r\n    color: #fff;\r\n    border: none;\r\n    border-radius: 24px;\r\n    font-size: 20px;\r\n    line-height: 1;\r\n    box-shadow: 0 4px 16px rgba(251,114,153,0.3);\r\n}\r\n\r\n.comic-entry-btn-touch {\r\n    bottom: 16px;\r\n    right: 16px;\r\n    padding: 12px 16px;\r\n    font-size: 18px;\r\n}\r\n\r\n#comic-reader-overlay {\r\n    position: fixed;\r\n    inset: 0;\r\n    background: var(--bg-deepest);\r\n    z-index: 10000;\r\n    display: flex;\r\n    flex-direction: column;\r\n    align-items: center;\r\n    justify-content: center;\r\n    overflow: hidden;\r\n    touch-action: none;\r\n    overscroll-behavior: none;\r\n    isolation: isolate;\r\n}\r\n\r\n.comic-img-container {\r\n    display: flex;\r\n    width: 100%;\r\n    height: 100%;\r\n    align-items: center;\r\n    justify-content: center;\r\n    gap: 4px;\r\n    padding: 0;\r\n    margin: 0;\r\n    cursor: grab;\r\n    touch-action: none;\r\n    transform-origin: center center;\r\n    will-change: transform;\r\n}\r\n\r\n.comic-img-container.is-grabbing,\r\n.comic-img-container.is-grabbing img { cursor: grabbing; }\r\n\r\n/* ===== Reader control panels ===== */\r\n.comic-controls,\r\n.comic-settings-controls {\r\n    position: fixed;\r\n    display: flex;\r\n    flex-direction: column;\r\n    gap: 6px;\r\n    background: var(--bg-overlay);\r\n    padding: 8px 10px;\r\n    border-radius: var(--radius-lg);\r\n    backdrop-filter: blur(20px);\r\n    -webkit-backdrop-filter: blur(20px);\r\n    border: 1px solid var(--border-subtle);\r\n    color: var(--text-primary);\r\n    z-index: 10001;\r\n    transition: opacity 0.5s;\r\n    opacity: 1;\r\n    box-shadow: var(--shadow-heavy);\r\n}\r\n\r\n.comic-controls.is-hidden,\r\n.comic-settings-controls.is-hidden { opacity: 0; }\r\n\r\n.comic-controls { bottom: 24px; right: 24px; }\r\n.comic-settings-controls { top: 24px; right: 24px; }\r\n\r\n.comic-settings-panel {\r\n    position: fixed;\r\n    left: 50%;\r\n    top: 50%;\r\n    z-index: 10002;\r\n    display: flex;\r\n    flex-direction: column;\r\n    gap: 8px;\r\n    width: min(460px, calc(100vw - 32px));\r\n    max-height: min(76vh, 560px);\r\n    overflow-y: auto;\r\n    padding: 14px;\r\n    color: var(--text-primary);\r\n    background: var(--bg-overlay);\r\n    border: 1px solid var(--border-subtle);\r\n    border-radius: var(--radius-md);\r\n    box-shadow: var(--shadow-heavy);\r\n    backdrop-filter: blur(20px);\r\n    -webkit-backdrop-filter: blur(20px);\r\n    opacity: 0;\r\n    visibility: hidden;\r\n    pointer-events: none;\r\n    transform: translate(-50%, -50%) scale(0.96);\r\n    transition: opacity 0.18s ease-out, transform 0.18s ease-out, visibility 0.18s;\r\n}\r\n\r\n.comic-settings-panel.show {\r\n    opacity: 1;\r\n    visibility: visible;\r\n    pointer-events: auto;\r\n    transform: translate(-50%, -50%) scale(1);\r\n}\r\n\r\n.comic-settings-panel .comic-btn {\r\n    min-width: 96px;\r\n    padding: 8px 12px;\r\n    border-radius: var(--radius-md);\r\n    white-space: nowrap;\r\n}\r\n\r\n.comic-settings-panel-header {\r\n    padding: 2px 2px 10px;\r\n    border-bottom: 1px solid var(--border-subtle);\r\n}\r\n\r\n.comic-settings-panel-title {\r\n    font-size: 15px;\r\n    font-weight: 700;\r\n    color: var(--text-primary);\r\n}\r\n\r\n.comic-settings-panel-desc {\r\n    margin-top: 4px;\r\n    font-size: 12px;\r\n    line-height: 1.5;\r\n    color: var(--text-secondary);\r\n}\r\n\r\n.comic-settings-item {\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: space-between;\r\n    gap: 14px;\r\n    padding: 12px;\r\n    border: 1px solid var(--border-subtle);\r\n    border-radius: var(--radius-md);\r\n    background: rgba(255, 255, 255, 0.035);\r\n}\r\n\r\n.comic-settings-copy {\r\n    min-width: 0;\r\n}\r\n\r\n.comic-settings-title {\r\n    font-size: 13px;\r\n    font-weight: 700;\r\n    color: var(--text-primary);\r\n}\r\n\r\n.comic-settings-desc {\r\n    margin-top: 4px;\r\n    font-size: 12px;\r\n    line-height: 1.45;\r\n    color: var(--text-secondary);\r\n}\r\n\r\n.comic-settings-action {\r\n    display: flex;\r\n    flex-shrink: 0;\r\n    align-items: center;\r\n    justify-content: flex-end;\r\n}\r\n\r\n.comic-reader-row {\r\n    display: flex;\r\n    gap: 6px;\r\n    align-items: center;\r\n    justify-content: center;\r\n}\r\n\r\n.comic-reader-row-wrap { flex-wrap: wrap; }\r\n\r\n.comic-page-info {\r\n    display: inline-flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    gap: 4px;\r\n    font-size: 14px;\r\n    min-width: 68px;\r\n    min-height: 32px;\r\n    padding: 0 2px;\r\n    color: var(--text-primary);\r\n    cursor: pointer;\r\n    white-space: nowrap;\r\n}\r\n\r\n.comic-page-display {\r\n    display: inline;\r\n}\r\n\r\n.comic-page-input {\r\n    display: none;\r\n    width: 44px;\r\n    height: 32px;\r\n    padding: 0 8px;\r\n    color: var(--text-primary);\r\n    background: var(--bg-deepest);\r\n    border: 1px solid var(--border-subtle);\r\n    border-radius: var(--radius-pill);\r\n    font: inherit;\r\n    text-align: center;\r\n    outline: none;\r\n}\r\n\r\n.comic-page-input:focus {\r\n    border-color: var(--acc);\r\n    box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.18);\r\n}\r\n\r\n.comic-page-range {\r\n    display: none;\r\n    color: var(--text-secondary);\r\n}\r\n\r\n.comic-page-info.is-editing {\r\n    cursor: text;\r\n    justify-content: flex-start;\r\n}\r\n\r\n.comic-page-info.is-editing .comic-page-display {\r\n    display: none;\r\n}\r\n\r\n.comic-page-info.is-editing .comic-page-input,\r\n.comic-page-info.is-editing .comic-page-range {\r\n    display: inline-flex;\r\n}\r\n\r\n/* ===== Reader pill buttons ===== */\r\n.comic-btn {\r\n    padding: 8px 16px;\r\n    cursor: pointer;\r\n    background: var(--bg-elevated);\r\n    color: var(--text-primary);\r\n    border: 1px solid var(--border-strong);\r\n    border-radius: var(--radius-pill);\r\n    font-size: 13px;\r\n    font-weight: 500;\r\n    letter-spacing: 0.3px;\r\n    transition: background 0.15s, border-color 0.15s;\r\n}\r\n\r\n.comic-btn-alt {\r\n    background: transparent;\r\n    border-color: var(--border-subtle);\r\n}\r\n\r\n.comic-btn:hover { background: #2a2a2a; }\r\n\r\n.comic-btn-alt:hover { background: var(--bg-elevated); }\r\n\r\n.comic-btn.active {\r\n    background: var(--acc);\r\n    border-color: var(--acc);\r\n    color: #fff;\r\n}\r\n.comic-btn.active:hover { background: var(--acc-hover); }\r\n\r\n/* ===== Reader toast ===== */\r\n.comic-toast {\r\n    position: fixed;\r\n    left: 50%;\r\n    transform: translateX(-50%);\r\n    padding: 8px 16px;\r\n    border-radius: var(--radius-pill);\r\n    font-size: 13px;\r\n    font-weight: 500;\r\n    color: var(--text-primary);\r\n    z-index: 10004;\r\n    opacity: 0;\r\n    transition: opacity 0.2s;\r\n    pointer-events: none;\r\n    background: var(--bg-overlay);\r\n    backdrop-filter: blur(12px);\r\n    -webkit-backdrop-filter: blur(12px);\r\n    border: 1px solid var(--border-subtle);\r\n    box-shadow: var(--shadow-card);\r\n    top: 18px;\r\n}\r\n\r\n.comic-toast.is-visible { opacity: 1; }\r\n\r\n.comic-toast.is-error { background: rgba(180, 40, 40, 0.94); }\r\n\r\n/* ===== Reader images ===== */\r\n#comic-reader-overlay img {\r\n    cursor: grab;\r\n    display: block;\r\n    max-width: none;\r\n    max-height: none;\r\n    object-fit: contain;\r\n    box-shadow: 0 0 30px rgba(0, 0, 0, 0.4);\r\n    touch-action: none;\r\n    user-select: none;\r\n    -webkit-user-drag: none;\r\n    flex-shrink: 0;\r\n}\r\n\r\n#comic-reader-overlay .comic-img-full,\r\n#comic-reader-overlay .comic-img-half {\r\n    max-width: none;\r\n    max-height: none;\r\n}\r\n\r\n/* ===== Screenshot selection ===== */\r\n.comic-selection-overlay {\r\n    position: fixed;\r\n    inset: 0;\r\n    z-index: 10003;\r\n    display: none;\r\n    cursor: crosshair;\r\n    touch-action: none;\r\n    background: rgba(10,10,10,0.01);\r\n}\r\n\r\n.comic-selection-hint {\r\n    position: fixed;\r\n    top: 66px;\r\n    right: 18px;\r\n    width: 236px;\r\n    max-width: calc(100vw - 36px);\r\n    padding: 10px 12px;\r\n    border-radius: var(--radius-md);\r\n    background: rgba(15,15,15,0.92);\r\n    color: #fff;\r\n    font-size: 13px;\r\n    line-height: 1.45;\r\n    text-align: left;\r\n    pointer-events: none;\r\n    border: 1px solid var(--border-subtle);\r\n    box-shadow: var(--shadow-card);\r\n}\r\n\r\n.comic-selection-toolbar {\r\n    position: fixed;\r\n    top: 18px;\r\n    right: 18px;\r\n    display: flex;\r\n    gap: 10px;\r\n    align-items: center;\r\n}\r\n\r\n.comic-selection-action {\r\n    padding: 10px 14px;\r\n    border: none;\r\n    border-radius: var(--radius-pill);\r\n    color: #fff;\r\n    font-size: 13px;\r\n    cursor: pointer;\r\n    box-shadow: 0 4px 12px rgba(0,0,0,0.25);\r\n}\r\n\r\n.comic-selection-save { background: var(--acc); }\r\n.comic-selection-full { background: #3467a8; }\r\n.comic-selection-cancel { background: #d33; }\r\n\r\n.comic-selection-action.is-disabled {\r\n    opacity: 0.45;\r\n    cursor: not-allowed;\r\n}\r\n\r\n.comic-selection-box {\r\n    position: absolute;\r\n    display: none;\r\n    border: 2px dashed var(--acc);\r\n    background: rgba(251,114,153,0.18);\r\n    box-shadow: 0 0 0 1px rgba(255,255,255,0.25) inset;\r\n    pointer-events: none;\r\n}\r\n\r\n.comic-sel-handle {\r\n    position: absolute;\r\n    width: 28px;\r\n    height: 28px;\r\n    pointer-events: auto;\r\n    display: none;\r\n    z-index: 2;\r\n    transform: translate(-50%,-50%);\r\n    touch-action: none;\r\n}\r\n\r\n.comic-sel-handle::after {\r\n    content: \"\";\r\n    position: absolute;\r\n    left: 50%;\r\n    top: 50%;\r\n    width: 12px;\r\n    height: 12px;\r\n    background: var(--acc);\r\n    border: 2px solid #fff;\r\n    border-radius: 50%;\r\n    box-shadow: 0 1px 4px rgba(0,0,0,0.4);\r\n    transform: translate(-50%,-50%);\r\n}\r\n\r\n.comic-sel-handle[data-dir=\"n\"],\r\n.comic-sel-handle[data-dir=\"s\"] {\r\n    width: max(28px, calc(100% - 40px));\r\n}\r\n\r\n.comic-sel-handle[data-dir=\"e\"],\r\n.comic-sel-handle[data-dir=\"w\"] {\r\n    height: max(28px, calc(100% - 40px));\r\n}\r\n\r\n.comic-sel-handle[data-dir=\"nw\"],\r\n.comic-sel-handle[data-dir=\"ne\"],\r\n.comic-sel-handle[data-dir=\"se\"],\r\n.comic-sel-handle[data-dir=\"sw\"] {\r\n    width: 34px;\r\n    height: 34px;\r\n    z-index: 3;\r\n}\r\n\r\n/* ===== Compact layout (mobile) ===== */\r\n#comic-reader-overlay.reader-compact .comic-btn {\r\n    min-width: 54px;\r\n    min-height: 44px;\r\n    padding: 10px 12px;\r\n    font-size: 14px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-controls {\r\n    left: auto;\r\n    right: max(12px, env(safe-area-inset-right));\r\n    bottom: max(12px, env(safe-area-inset-bottom));\r\n    width: fit-content;\r\n    max-width: calc(100vw - 24px);\r\n    padding: 8px 12px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-settings-controls {\r\n    top: max(12px, env(safe-area-inset-top));\r\n    left: auto;\r\n    right: max(12px, env(safe-area-inset-right));\r\n    width: fit-content;\r\n    max-width: 96px;\r\n    flex-direction: column;\r\n    flex-wrap: nowrap;\r\n    justify-content: center;\r\n    max-height: 40vh;\r\n    overflow-y: auto;\r\n    padding: 8px 12px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-settings-panel {\r\n    width: min(360px, calc(100vw - 24px));\r\n    padding: 12px;\r\n    gap: 8px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-settings-item {\r\n    align-items: center;\r\n    flex-direction: row;\r\n    gap: 14px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-settings-action {\r\n    justify-content: flex-end;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-settings-action .comic-btn {\r\n    width: auto;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-toast {\r\n    top: 12px;\r\n    max-width: calc(100vw - 24px);\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-selection-hint {\r\n    top: 62px;\r\n    right: 12px;\r\n    width: min(236px, calc(100vw - 24px));\r\n    max-width: calc(100vw - 24px);\r\n    font-size: 12px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-selection-toolbar {\r\n    top: 12px;\r\n    right: 12px;\r\n}\r\n\r\n#comic-reader-overlay.reader-compact .comic-selection-action {\r\n    padding: 10px 12px;\r\n    font-size: 12px;\r\n}\r\n\r\n@media (hover: none), (pointer: coarse) {\r\n\n/* ===== content-responsive.css ===== */\n    #bilibili-fav-float-btn.bilibili-fav-touch {\r\n        bottom: max(76px, env(safe-area-inset-bottom));\r\n        right: max(16px, env(safe-area-inset-right));\r\n        width: 54px;\r\n        height: 54px;\r\n        font-size: 24px;\r\n        opacity: 1 !important;\r\n        visibility: visible !important;\r\n    }\r\n\r\n    #bilibili-fav-panel,\r\n    #bilibili-toolbox-settings-panel {\r\n        right: max(12px, env(safe-area-inset-right));\r\n        bottom: max(140px, calc(env(safe-area-inset-bottom) + 84px));\r\n        max-height: min(70vh, 560px);\r\n        overflow: hidden;\r\n    }\r\n\r\n    #bilibili-fav-panel {\r\n        width: min(\r\n            calc(\r\n                var(--bilibili-fav-columns) * var(--bilibili-fav-item-width)\r\n                + (var(--bilibili-fav-columns) - 1) * var(--bilibili-fav-list-gap)\r\n                + var(--bilibili-fav-list-padding-x) * 2\r\n            ),\r\n            calc(100vw - 24px)\r\n        );\r\n    }\r\n\r\n    #bilibili-toolbox-settings-panel {\r\n        width: min(320px, calc(100vw - 24px));\r\n    }\r\n\r\n    .bilibili-fav-header {\r\n        gap: 8px;\r\n        padding: 10px 12px;\r\n    }\r\n\r\n    .bilibili-fav-header-actions {\r\n        flex-shrink: 0;\r\n    }\r\n\r\n    .bilibili-fav-control-btn {\r\n        display: inline-flex;\r\n        align-items: center;\r\n        justify-content: center;\r\n    }\r\n\r\n    .bilibili-fav-add-btn,\r\n    .bilibili-fav-control-btn,\r\n    .bilibili-toolbox-export-btn,\r\n    .bilibili-toolbox-import-btn {\r\n        min-height: 42px;\r\n    }\r\n\r\n    .bilibili-fav-content {\r\n        max-height: min(52vh, 420px);\r\n    }\r\n\r\n    .bilibili-fav-delete {\r\n        width: 26px;\r\n        height: 26px;\r\n        font-size: 16px;\r\n        opacity: 1;\r\n    }\r\n\r\n    .bilibili-fav-item-link {\r\n        touch-action: manipulation;\r\n    }\r\n\r\n    .comic-sel-handle {\r\n        width: 36px;\r\n        height: 36px;\r\n    }\r\n\r\n    .comic-sel-handle[data-dir=\"n\"],\r\n    .comic-sel-handle[data-dir=\"s\"] {\r\n        width: max(36px, calc(100% - 48px));\r\n    }\r\n\r\n    .comic-sel-handle[data-dir=\"e\"],\r\n    .comic-sel-handle[data-dir=\"w\"] {\r\n        height: max(36px, calc(100% - 48px));\r\n    }\r\n\r\n    .comic-sel-handle[data-dir=\"nw\"],\r\n    .comic-sel-handle[data-dir=\"ne\"],\r\n    .comic-sel-handle[data-dir=\"se\"],\r\n    .comic-sel-handle[data-dir=\"sw\"] {\r\n        width: 44px;\r\n        height: 44px;\r\n    }\r\n\r\n    #comic-reader-overlay.reader-compact .comic-reader-row {\r\n        gap: 6px;\r\n        flex-wrap: wrap;\r\n    }\r\n\r\n    #comic-reader-overlay.reader-compact .comic-settings-controls { gap: 8px; }\r\n\r\n    #comic-reader-overlay.reader-compact .comic-selection-hint { text-align: left; }\r\n}\r\n\n";
    function injectStyle() {
        if (document.getElementById('bilibili-toolbox-userscript-style')) return;
        const style = document.createElement('style');
        style.id = 'bilibili-toolbox-userscript-style';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }
    if (document.documentElement) injectStyle();
    else document.addEventListener('DOMContentLoaded', injectStyle, { once: true });
})();
// ===== shared.js =====
// Bilibili Toolbox - shared utilities
(function() {
    'use strict';

    const SHARED_STORAGE_KEY = 'bilibiliToolboxSharedData.v1';
    const USER_TYPE = 'user';
    const OPUS_TYPE = 'opus';
    const READLIST_TYPE = 'readlist';
    const OPUS_TAB_INTENT_PARAM = 'bilibili_toolbox_opus_tab';
    const FAVORITE_COLUMN_OPTIONS = Object.freeze([2, 3, 4, 5]);
    const DEFAULT_FAVORITE_COLUMNS = 2;
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';
    const BILIBILI_SPACE_URL = 'https://space.bilibili.com/';
    const BILIBILI_READLIST_URL = 'https://www.bilibili.com/read/readlist/rl';
    const TOOLBOX_SETTINGS = Object.freeze({
        hideForwardDynamics: 'hideForwardDynamics',
        readerPreferences: 'readerPreferences',
        favoriteColumns: 'favoriteColumns'
    });
    const DEFAULT_SETTINGS = Object.freeze({
        hideForwardDynamics: false,
        favoriteColumns: DEFAULT_FAVORITE_COLUMNS,
        readerPreferences: {}
    });
    const UID_URL_PATTERNS = [
        [/space\.bilibili\.com\/(\d+)/, () => true],
        [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
    ];

    function normalizeObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function createDefaultData() {
        return {
            favorites: [],
            settings: createDefaultSettings()
        };
    }

    function createDefaultSettings() {
        return {
            hideForwardDynamics: DEFAULT_SETTINGS.hideForwardDynamics,
            favoriteColumns: DEFAULT_SETTINGS.favoriteColumns,
            readerPreferences: { ...DEFAULT_SETTINGS.readerPreferences }
        };
    }

    function normalizeFavoriteId(value) {
        return typeof value === 'string' && /^\d+$/.test(value) ? value : '';
    }

    function normalizeFavorite(item) {
        const identity = getFavoriteIdentity(item);
        if (!identity) return null;

        if (identity.type === READLIST_TYPE) {
            return {
                type: READLIST_TYPE,
                id: identity.id,
                title: typeof item.title === 'string' ? item.title : '',
                cover: typeof item.cover === 'string' ? item.cover : ''
            };
        }

        return {
            type: identity.type,
            uid: identity.id,
            uname: typeof item.uname === 'string' ? item.uname : '',
            face: typeof item.face === 'string' ? item.face : ''
        };
    }

    function normalizeFavoriteList(favorites) {
        return Array.isArray(favorites)
            ? favorites.map(normalizeFavorite).filter(Boolean)
            : [];
    }

    function normalizeToolboxData(data) {
        const next = normalizeObject(data);
        return {
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeSettings(next.settings)
        };
    }

    function normalizeFavoriteColumns(value) {
        const columns = Number(value);
        return FAVORITE_COLUMN_OPTIONS.includes(columns) ? columns : DEFAULT_FAVORITE_COLUMNS;
    }

    function normalizeSettings(settings) {
        const input = normalizeObject(settings);
        return {
            hideForwardDynamics: typeof input.hideForwardDynamics === 'boolean'
                ? input.hideForwardDynamics
                : DEFAULT_SETTINGS.hideForwardDynamics,
            favoriteColumns: normalizeFavoriteColumns(input.favoriteColumns),
            readerPreferences: normalizeObject(input.readerPreferences)
        };
    }

    function getSettingValue(data, key, fallback = false) {
        const settings = normalizeToolboxData(data).settings;
        return Object.prototype.hasOwnProperty.call(settings, key)
            ? settings[key]
            : fallback;
    }

    function isReadlistFavorite(item) {
        return item?.type === READLIST_TYPE;
    }

    function isOpusFavorite(item) {
        return item?.type === OPUS_TYPE;
    }

    function getFavoriteIdentity(item) {
        if (!item || typeof item !== 'object') return null;
        if (item.type !== USER_TYPE && item.type !== OPUS_TYPE && item.type !== READLIST_TYPE) return null;
        const type = item.type;
        const id = normalizeFavoriteId(type === READLIST_TYPE ? item.id : item.uid);
        return id ? { type, id } : null;
    }

    function getFavoriteKey(item) {
        const identity = getFavoriteIdentity(item);
        return identity ? `${identity.type}:${identity.id}` : '';
    }

    function getFavoriteName(item) {
        return isReadlistFavorite(item)
            ? (item?.title || '\u4e13\u680f')
            : (item?.uname || '\u7528\u6237');
    }

    function getFavoriteImage(item) {
        return isReadlistFavorite(item)
            ? (item?.cover || FALLBACK_IMAGE)
            : (item?.face || FALLBACK_IMAGE);
    }

    function getFavoriteLink(item) {
        const identity = getFavoriteIdentity(item);
        if (!identity) return '#';
        if (identity.type === READLIST_TYPE) return `${BILIBILI_READLIST_URL}${identity.id}`;
        if (identity.type === OPUS_TYPE) return `${BILIBILI_SPACE_URL}${identity.id}/upload/opus?${OPUS_TAB_INTENT_PARAM}=1`;
        return `${BILIBILI_SPACE_URL}${identity.id}/dynamic`;
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function extractUidFromUrl(url) {
        if (typeof url !== 'string') return null;
        for (const [pattern, isValid] of UID_URL_PATTERNS) {
            const match = url.match(pattern);
            if (match && isValid(match[1])) return match[1];
        }
        return null;
    }

    function isTouchLikeDevice() {
        const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
        const noHover = window.matchMedia?.('(hover: none)').matches;
        const nav = window.navigator || {};
        return Boolean(coarsePointer || noHover || nav.maxTouchPoints > 0);
    }

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    const Toolbox = {};

    function createEventBag() {
        const cleanupFns = [];
        return {
            on(target, type, handler, options) {
                target.addEventListener(type, handler, options);
                cleanupFns.push(() => target.removeEventListener(type, handler, options));
                return handler;
            },
            timer(timerId, clearFn = clearTimeout) {
                if (timerId) cleanupFns.push(() => clearFn(timerId));
                return timerId;
            },
            add(cleanup) {
                if (typeof cleanup === 'function') cleanupFns.push(cleanup);
                return cleanup;
            },
            cleanup() {
                while (cleanupFns.length) {
                    const cleanup = cleanupFns.pop();
                    try { cleanup(); } catch (_) {}
                }
            }
        };
    }

    window.BilibiliToolbox = Toolbox;
    Toolbox.settings = TOOLBOX_SETTINGS;
    Toolbox.createEventBag = createEventBag;

    // Expose API for extension scripts.
    window.Shared = {
        SHARED_STORAGE_KEY,
        USER_TYPE,
        OPUS_TYPE,
        READLIST_TYPE,
        OPUS_TAB_INTENT_PARAM,
        FAVORITE_COLUMN_OPTIONS,
        DEFAULT_FAVORITE_COLUMNS,
        FALLBACK_IMAGE,
        TOOLBOX_SETTINGS,
        DEFAULT_SETTINGS,
        createDefaultData,
        createDefaultSettings,
        normalizeFavorite,
        normalizeFavoriteList,
        normalizeToolboxData,
        normalizeFavoriteColumns,
        normalizeSettings,
        getSettingValue,
        isReadlistFavorite,
        isOpusFavorite,
        getFavoriteKey,
        getFavoriteName,
        getFavoriteImage,
        getFavoriteLink,
        escapeHtml,
        extractUidFromUrl,
        isTouchLikeDevice,
        $,
        $src
    };
})();

// ===== storage-service.js =====
// Bilibili Toolbox - shared storage service
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;

    let dataCache = window.Shared.createDefaultData();
    let initialized = false;
    let changeListeners = new Set();
    let storageListener = null;

    function dataSignature(data) {
        return JSON.stringify(window.Shared.normalizeToolboxData(data));
    }

    async function read() {
        const result = await chrome.storage.local.get([window.Shared.SHARED_STORAGE_KEY]);
        dataCache = window.Shared.normalizeToolboxData(result[window.Shared.SHARED_STORAGE_KEY]);
        return dataCache;
    }

    async function write(data) {
        dataCache = window.Shared.normalizeToolboxData(data);
        await chrome.storage.local.set({ [window.Shared.SHARED_STORAGE_KEY]: dataCache });
        notify(dataCache);
        return dataCache;
    }

    function notify(data) {
        const normalized = window.Shared.normalizeToolboxData(data);
        changeListeners.forEach(listener => listener(normalized));
    }

    async function update(mutator) {
        const current = await read();
        const next = typeof mutator === 'function' ? mutator(current) : mutator;
        return write(next);
    }

    async function setSetting(key, value) {
        return update(current => ({
            ...current,
            settings: { ...current.settings, [key]: value }
        }));
    }

    function getSetting(key, fallback = false) {
        return Object.prototype.hasOwnProperty.call(dataCache.settings, key)
            ? dataCache.settings[key]
            : fallback;
    }

    function onChanged(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
    }

    function handleExtensionStorageChange(changes, areaName) {
        if (areaName !== 'local' || !changes[window.Shared.SHARED_STORAGE_KEY]) return;
        const nextData = window.Shared.normalizeToolboxData(changes[window.Shared.SHARED_STORAGE_KEY].newValue);
        if (dataSignature(nextData) === dataSignature(dataCache)) return;
        dataCache = nextData;
        notify(dataCache);
    }

    async function init() {
        if (!initialized) {
            storageListener = handleExtensionStorageChange;
            chrome.storage.onChanged.addListener(storageListener);
            initialized = true;
        }

        return read();
    }

    function destroy() {
        if (storageListener) chrome.storage.onChanged.removeListener(storageListener);
        storageListener = null;
        initialized = false;
        changeListeners = new Set();
    }

    function parseFavoriteBlockContent(content) {
        if (typeof content !== 'string') return null;

        const parts = content.match(/^\s*<([^<>]*)>\s*<([^<>]*)>\s*<([^<>]*)>\s*$/);
        if (!parts) return null;

        const [, keyRaw, nameRaw, imageRaw] = parts;
        const key = keyRaw.trim();
        const name = nameRaw.replace(/\s+/g, ' ').trim();
        const image = imageRaw.replace(/\s+/g, '').trim();
        const match = key.match(/^(user|opus|readlist):(\d+)$/);
        if (!match) return null;
        if (!name || !image) return null;

        const type = match[1].toLowerCase();
        const isReadlist = type === window.Shared.READLIST_TYPE;
        return {
            type: isReadlist ? window.Shared.READLIST_TYPE : type,
            [isReadlist ? 'id' : 'uid']: match[2],
            [isReadlist ? 'title' : 'uname']: name,
            [isReadlist ? 'cover' : 'face']: image
        };
    }

    function parseFavoriteText(text) {
        const favorites = [];
        const pattern = /\[([\s\S]*?)\]/g;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            const favorite = parseFavoriteBlockContent(match[1]);
            if (favorite) favorites.push(favorite);
        }

        return favorites;
    }

    function normalizeImportedFavorites(data) {
        if (typeof data === 'string') {
            return window.Shared.normalizeFavoriteList(parseFavoriteText(data));
        }

        return window.Shared.normalizeFavoriteList(data);
    }

    function mergeFavorites(existing, imported) {
        const result = [...existing];
        const indexes = new Map(result.map((item, index) => [window.Shared.getFavoriteKey(item), index]));
        let added = 0;
        let updated = 0;

        imported.forEach(item => {
            const key = window.Shared.getFavoriteKey(item);
            if (!key) return;
            const index = indexes.get(key);
            if (index !== undefined) {
                const merged = { ...result[index], ...item };
                if (JSON.stringify(merged) !== JSON.stringify(result[index])) {
                    result[index] = merged;
                    updated += 1;
                }
                return;
            }
            indexes.set(key, result.length);
            result.push(item);
            added += 1;
        });

        return { result, added, updated, skipped: imported.length - added - updated };
    }

    async function addFavorite(item) {
        const current = await read();
        const normalized = window.Shared.normalizeFavorite(item);
        const key = window.Shared.getFavoriteKey(normalized);
        if (!key) return { data: current, added: false, reason: 'invalid' };
        if (current.favorites.some(existing => window.Shared.getFavoriteKey(existing) === key)) {
            return { data: current, added: false, reason: 'duplicate' };
        }

        const data = await write({ ...current, favorites: [...current.favorites, normalized] });
        return { data, added: true, key };
    }

    async function removeFavorite(favoriteKey) {
        const current = await read();
        const favorites = current.favorites.filter(item => window.Shared.getFavoriteKey(item) !== favoriteKey);
        if (favorites.length === current.favorites.length) {
            return { data: current, removed: false };
        }

        const data = await write({ ...current, favorites });
        return { data, removed: true };
    }

    async function importFavorites(imported) {
        const current = await read();
        const normalized = normalizeImportedFavorites(imported);
        const merged = mergeFavorites(current.favorites, normalized);
        const data = merged.added || merged.updated
            ? await write({ ...current, favorites: merged.result })
            : current;
        return { ...merged, data };
    }

    function cleanExportName(value) {
        return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    }

    function cleanExportImage(value) {
        return typeof value === 'string' ? value.replace(/\s+/g, '').trim() : '';
    }

    function createExportText(data = dataCache) {
        return window.Shared.normalizeToolboxData(data).favorites
            .map(item => {
                const key = window.Shared.getFavoriteKey(item);
                if (!key) return '';
                const name = cleanExportName(window.Shared.getFavoriteName(item));
                const image = cleanExportImage(window.Shared.getFavoriteImage(item));
                return name && image ? `[<${key}><${name}><${image}>]` : '';
            })
            .filter(Boolean)
            .join('\n');
    }

    const storageApi = {
        init,
        destroy,
        read,
        write,
        update,
        setSetting,
        getSetting,
        onChanged
    };

    Toolbox.storage = storageApi;
    Toolbox.favorites = {
        addFavorite,
        removeFavorite,
        importFavorites,
        normalizeImportedFavorites,
        createExportText
    };
})();

// ===== bilibili-dom-adapter.js =====
// Bilibili Toolbox - Bilibili DOM and URL adapter
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const COMIC_URL_PATTERNS = Object.freeze([
        'bilibili.com/read/',
        'bilibili.com/opus/',
        't.bilibili.com/'
    ]);
    const ARTICLE_URL_PATTERN = /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/read\/(?:cv\d+|mobile|native)(?:[/?#]|$)/i;
    const SPACE_OPUS_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/(\d+)\/upload\/opus(?:[/?#]|$)/i;
    const SPACE_DYNAMIC_URL_PATTERN = /^https?:\/\/space\.bilibili\.com\/\d+\/dynamic(?:[/?#]|$)/i;
    const CONTENT_TAB_SELECTOR = '.content-filter .content-tab';
    const DYNAMIC_CARD_SELECTOR = '.bili-dyn-list__item, .bili-dyn-item, .bili-opus-view';
    const PRIMARY_IMAGE_SELECTOR = `
        .opus-module-content img,
        .article-content img,
        .bili-rich-text img,
        .opus-read-content img,
        .horizontal-scroll-album__pic__img img
    `;
    const FALLBACK_IMAGE_SELECTOR = `
        .horizontal-scroll-album__indicator__thumbnail img
    `;
    const ARTICLE_AUTHOR_LINK_SELECTORS = Object.freeze([
        '.article-author a[href*="space"]',
        '.article-info a[href*="space"]',
        '.author-info a[href*="space"]',
        '.up-info a[href*="space"]',
        '.opus-module-author a[href*="space"]',
        '[class*="author"] a[href*="space"]',
        '[class*="up"] a[href*="space"]',
        'a[href*="space.bilibili.com/"]',
        'a[href*="/space/"]'
    ]);
    const AUTHOR_SCOPE_SELECTOR = '.article-author, .article-info, .author-info, .up-info, [class*="author"], [class*="up"]';
    const USER_NAME_SELECTOR = '.user-name, .user-name-shadow, .name';
    const USER_FACE_SELECTOR = '.user-face img, .avatar img, [class*="face"] img';

    function queryAll(selector, root = document) {
        return Array.from(root?.querySelectorAll?.(selector) || []);
    }

    function query(selector, root = document) {
        return root?.querySelector?.(selector) || null;
    }

    function normalizeProtocolUrl(src) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('//')) return `https:${src}`;
        return src;
    }

    function isComicReaderPage(url = window.location.href) {
        return COMIC_URL_PATTERNS.some(pattern => url.includes(pattern));
    }

    function isArticlePage(url = window.location.href) {
        return ARTICLE_URL_PATTERN.test(url);
    }

    function isSpaceOpusUploadPage(url = window.location.href) {
        return SPACE_OPUS_URL_PATTERN.test(url);
    }

    function getSpaceOpusUid(url = window.location.href) {
        return url.match(SPACE_OPUS_URL_PATTERN)?.[1] || '';
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return SPACE_DYNAMIC_URL_PATTERN.test(url);
    }

    function extractUidFromAuthorLink(link) {
        const href = link?.getAttribute?.('href') || link?.href || '';
        return href.match(/space\.bilibili\.com\/(\d+)/)?.[1]
            || href.match(/\/space\/(\d+)/)?.[1]
            || null;
    }

    function getArticleAuthorLink() {
        return ARTICLE_AUTHOR_LINK_SELECTORS
            .flatMap(selector => queryAll(selector))
            .find(link => extractUidFromAuthorLink(link)) || null;
    }

    function getContentTabs() {
        return queryAll(CONTENT_TAB_SELECTOR);
    }

    function getDynamicCards() {
        return queryAll(DYNAMIC_CARD_SELECTOR);
    }

    function getPrimaryImages() {
        return queryAll(PRIMARY_IMAGE_SELECTOR);
    }

    function getFallbackImages() {
        return queryAll(FALLBACK_IMAGE_SELECTOR);
    }

    Toolbox.bilibiliDom = {
        COMIC_URL_PATTERNS,
        DYNAMIC_CARD_SELECTOR,
        AUTHOR_SCOPE_SELECTOR,
        USER_NAME_SELECTOR,
        USER_FACE_SELECTOR,
        query,
        queryAll,
        normalizeProtocolUrl,
        isComicReaderPage,
        isArticlePage,
        isSpaceOpusUploadPage,
        getSpaceOpusUid,
        isSpaceDynamicPage,
        extractUidFromAuthorLink,
        getArticleAuthorLink,
        getContentTabs,
        getDynamicCards,
        getPrimaryImages,
        getFallbackImages
    };
})();

// ===== animations.js =====
// Bilibili Toolbox - Animation Module
(function() {
    'use strict';

    const FADE_ANIMATION_DURATION = 200;
    const FADE_SETTLE_DURATION = 300;
    const FADE_SHIFT_DISTANCE = 60;
    const SMOOTH_SCALE_START = 0.95;
    const DEFAULT_ANIMATION_MODE = 'smooth';
    const ANIMATION_MODES = ['smooth', 'fade'];
    const IMMEDIATE_RENDER_MODE = 'immediate';
    const ANIMATION_BUTTON_MAP = {
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
        loadImages(renderIndex, IMMEDIATE_RENDER_MODE, direction);
    }

    function resetAnimatedContainer(imgContainer, animationMode, transitionDirection, applyTransform, getTransform, getShiftedTransformFn) {
        const mode = ANIMATION_MODES.includes(animationMode) ? animationMode : IMMEDIATE_RENDER_MODE;
        imgContainer.innerHTML = '';
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
        getNextAnimationMode: getNextMode,
        syncAnimationButton: syncAnimationButtonState,
        runTransition: runTransitionFlow,
        resetImageContainer: resetAnimatedContainer,
        finishRender: finishAnimatedRender
    };

    window.BilibiliToolbox.animations = animationsApi;
})();

// ===== comic-reader-images.js =====
// Bilibili Toolbox - comic reader image collection
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const IMAGE_ATTRS = [
        'data-origin-src',
        'data-original',
        'data-original-src',
        'data-large-src',
        'data-url',
        'data-image',
        'data-src',
        'src'
    ];
    const IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;

    function normalizeImageUrl(rawSrc) {
        if (!rawSrc || typeof rawSrc !== 'string') return '';
        let src = rawSrc.trim().replace(/^["']|["']$/g, '');
        if (!src || src.includes('base64')) return '';
        src = bilibiliDom.normalizeProtocolUrl(src);
        if (src.startsWith('http:')) src = 'https:' + src.slice(5);
        if (!src.startsWith('http')) return '';

        // Bilibili image URLs often append resize/format directives after "@"
        // (for example @672w_378h_1c.webp). Removing them asks the CDN for the
        // original file instead of a thumbnail-sized derivative.
        src = src.replace(/@[^?#]*/, '');
        return src.startsWith('http') ? src : '';
    }

    function getImageIdentity(src) {
        const normalized = normalizeImageUrl(src);
        return normalized ? normalized.split(/[?#]/)[0].split('/').pop() : '';
    }

    function isLikelyImageUrl(src) {
        return IMAGE_FILE_PATTERN.test(src);
    }

    function parseSrcset(srcset) {
        if (!srcset || typeof srcset !== 'string') return [];
        return srcset
            .split(',')
            .map(part => part.trim().split(/\s+/)[0])
            .filter(Boolean);
    }

    function getImageSourceCandidates(img) {
        const rawCandidates = [];
        IMAGE_ATTRS.forEach(attr => {
            const value = img.getAttribute(attr);
            if (value) rawCandidates.push(value);
        });

        if (img.currentSrc) rawCandidates.push(img.currentSrc);
        rawCandidates.push(...parseSrcset(img.getAttribute('srcset')));
        rawCandidates.push(...parseSrcset(img.getAttribute('data-srcset')));

        const picture = img.closest('picture');
        picture?.querySelectorAll('source').forEach(source => {
            rawCandidates.push(...parseSrcset(source.getAttribute('srcset')));
            rawCandidates.push(...parseSrcset(source.getAttribute('data-srcset')));
        });

        const link = img.closest('a')?.href;
        if (link) rawCandidates.push(link);

        const seen = new Set();
        return rawCandidates
            .map(normalizeImageUrl)
            .filter(isLikelyImageUrl)
            .filter(src => {
                if (!src || seen.has(src)) return false;
                seen.add(src);
                return true;
            });
    }

    function isNoiseImage(img, src) {
        return img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover')
            || img.classList.contains('emoji')
            || src.includes('emote')
            || src.includes('emoji')
            || src.includes('garb');
    }

    function pushBestImage(images, fileSet, img) {
        const candidates = getImageSourceCandidates(img);
        const src = candidates[0] || '';
        if (!src || isNoiseImage(img, src)) return;

        const fileName = getImageIdentity(src);
        if (!fileName || fileSet.has(fileName)) return;

        fileSet.add(fileName);
        images.push(src);
    }

    function collectDynamicImagesFromState() {
        const modules = window.__INITIAL_STATE__?.detail?.modules;
        if (!Array.isArray(modules)) return [];

        return modules.flatMap(module => {
            const pics = module?.module_top?.display?.album?.pics;
            if (!Array.isArray(pics)) return [];
            return pics
                .map(pic => normalizeImageUrl(pic?.url || ''))
                .filter(Boolean);
        });
    }

    function collectDynamicImagesFromDom() {
        const fileSet = new Set();
        const images = [];
        const primaryImages = bilibiliDom.getPrimaryImages();
        primaryImages.forEach(img => pushBestImage(images, fileSet, img));

        // Thumbnail strips are a last resort. They are useful on some album
        // pages, but preferring them can make the reader display low-res images.
        if (images.length === 0) {
            bilibiliDom.getFallbackImages().forEach(img => pushBestImage(images, fileSet, img));
        }

        return images;
    }

    function sortImagesByDomPosition(images) {
        return [...images].sort((a, b) => {
            const getTop = (url) => {
                const fn = getImageIdentity(url);
                const el = document.querySelector(`img[src*="${fn}"], img[data-src*="${fn}"]`);
                return el ? el.getBoundingClientRect().top + window.scrollY : 0;
            };
            return getTop(a) - getTop(b);
        });
    }

    function collectImages() {
        const mergedImages = [
            ...collectDynamicImagesFromState(),
            ...collectDynamicImagesFromDom()
        ];
        const seen = new Set();
        const uniqueImages = mergedImages.filter(src => {
            const fileName = getImageIdentity(src);
            if (!fileName || seen.has(fileName)) return false;
            seen.add(fileName);
            return true;
        });

        return sortImagesByDomPosition(uniqueImages);
    }

    Toolbox.comicImages = {
        normalizeImageUrl,
        getImageIdentity,
        isLikelyImageUrl,
        parseSrcset,
        getImageSourceCandidates,
        collectDynamicImagesFromState,
        collectDynamicImagesFromDom,
        sortImagesByDomPosition,
        collectImages
    };
})();

// ===== reader-preferences.js =====
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
    const DEFAULT_READER_PREFERENCES = Object.freeze({
        isRightToLeft: true,
        viewMode: 'auto',
        animationMode: 'smooth',
        imageRenderMode: 'smooth',
        backgroundMode: 'black',
        tapPageNavigation: true
    });

    function normalizeAnimationMode(mode) {
        return Toolbox.animations.normalizeAnimationMode(mode);
    }

    function normalizeImageRenderMode(mode) {
        return IMAGE_RENDER_MODES.includes(mode) ? mode : DEFAULT_READER_PREFERENCES.imageRenderMode;
    }

    function normalizeBackgroundMode(mode) {
        return BACKGROUND_MODES.includes(mode) ? mode : DEFAULT_READER_PREFERENCES.backgroundMode;
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
            backgroundMode: normalizeBackgroundMode(input.backgroundMode || DEFAULT_READER_PREFERENCES.backgroundMode),
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
        BACKGROUND_MODES,
        DEFAULT_READER_PREFERENCES,
        normalizeAnimationMode,
        normalizeImageRenderMode,
        normalizeBackgroundMode,
        normalize: normalizePreferences,
        load: loadPreferences,
        save: savePreferences
    };
})();

// ===== reader-screenshot.js =====
// Bilibili Toolbox - reader screenshot helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const READER_BACKGROUND = '#0a0a0a';

    function getBounds(descriptors) {
        if (!descriptors.length) return null;
        const left = Math.min(...descriptors.map(item => item.x));
        const right = Math.max(...descriptors.map(item => item.x + item.width));
        const top = Math.min(...descriptors.map(item => item.y));
        const bottom = Math.max(...descriptors.map(item => item.y + item.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    function drawImage(ctx, img, descriptor, selectionRect, rotation = 0) {
        const x = descriptor.x - selectionRect.x;
        const y = descriptor.y - selectionRect.y;
        const swap = rotation === 90 || rotation === 270;
        const dw = swap ? descriptor.height : descriptor.width;
        const dh = swap ? descriptor.width : descriptor.height;

        ctx.save();
        ctx.translate(x + descriptor.width / 2, y + descriptor.height / 2);
        if (rotation) ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('EMPTY_BLOB')), 'image/png');
        });
    }

    function shouldCopyToClipboard() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    async function copyBlobToClipboard(blob) {
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            throw new Error('CLIPBOARD_UNAVAILABLE');
        }

        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type || 'image/png']: blob
            })
        ]);
    }

    async function share(blob, filename) {
        if (typeof File === 'undefined' || !navigator.share) {
            throw new Error('SHARE_UNAVAILABLE');
        }

        const file = new File([blob], filename, { type: blob.type || 'image/png' });
        const data = {
            files: [file],
            title: filename
        };

        if (navigator.canShare && !navigator.canShare(data)) {
            throw new Error('SHARE_UNAVAILABLE');
        }

        await navigator.share(data);
    }

    function isShareCanceled(error) {
        return error?.name === 'AbortError'
            || /cancel/i.test(error?.message || '');
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function output(reader, blob, filename) {
        if (shouldCopyToClipboard()) {
            try {
                await copyBlobToClipboard(blob);
                reader.showReaderMessage('\u622a\u56fe\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
                return;
            } catch (_) {
                download(blob, filename);
                reader.showReaderMessage('\u526a\u8d34\u677f\u4e0d\u53ef\u7528\uff0c\u5df2\u6539\u4e3a\u4fdd\u5b58\u6587\u4ef6', true, 2600);
                return;
            }
        }

        if (navigator.share) {
            try {
                await share(blob, filename);
                reader.showReaderMessage('\u622a\u56fe\u5df2\u6253\u5f00\u7cfb\u7edf\u5206\u4eab');
                return;
            } catch (error) {
                if (isShareCanceled(error)) {
                    reader.showReaderMessage('\u5df2\u53d6\u6d88\u5206\u4eab');
                    return;
                }
            }
        }

        download(blob, filename);
        reader.showReaderMessage('\u622a\u56fe\u5df2\u4fdd\u5b58');
    }

    function getFileName(currentIndex, count, now = new Date()) {
        const start = currentIndex + 1;
        const end = currentIndex + count;
        const range = count === 1 ? `${start}` : `${start}-${end}`;
        const stamp = now.toISOString().replace(/[:.]/g, '-');
        return `bilibili-reader-${range}-${stamp}.png`;
    }

    async function capture(reader, selectionRect, descriptors = reader.getVisibleImageDescriptors()) {
        if (descriptors.length === 0) {
            reader.showReaderMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u622a\u56fe\u7684\u9875\u9762', true);
            return false;
        }

        reader.showReaderMessage('\u6b63\u5728\u751f\u6210\u622a\u56fe...', false, 3000);

        try {
            const loadedImages = await Promise.all(descriptors.map(async descriptor => {
                const image = await reader.loadExportImageSafe(descriptor.src);
                if (!image) throw new Error('LOAD_FAILED');
                return { descriptor, image };
            }));

            const dpr = window.devicePixelRatio || 1;
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = Math.max(1, Math.round(selectionRect.width * dpr));
            outputCanvas.height = Math.max(1, Math.round(selectionRect.height * dpr));

            const ctx = outputCanvas.getContext('2d');
            if (!ctx) throw new Error('CANVAS_CONTEXT_FAILED');
            ctx.scale(dpr, dpr);
            ctx.fillStyle = reader.getReaderBackgroundColor?.() || READER_BACKGROUND;
            ctx.fillRect(0, 0, selectionRect.width, selectionRect.height);

            loadedImages.forEach(({ descriptor, image }) => {
                drawImage(ctx, image, descriptor, selectionRect, reader.rotation);
            });

            try {
                const blob = await canvasToBlob(outputCanvas);
                await output(reader, blob, getFileName(reader.currentIndex, reader.activePageCount));
                return true;
            } catch (_) {
                reader.showReaderMessage('\u56fe\u7247\u53d7\u8de8\u57df\u9650\u5236\uff0c\u65e0\u6cd5\u5408\u6210\u622a\u56fe', true, 3000);
                return false;
            }
        } catch (_) {
            reader.showReaderMessage('\u622a\u56fe\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5', true, 2800);
            return false;
        }
    }

    Toolbox.readerScreenshot = {
        getBounds,
        capture
    };
})();

// ===== reader-transform.js =====
// Bilibili Toolbox - reader transform and image sizing helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const DOUBLE_CLICK_SCALE = 2;
    const MAX_RENDER_SCALE = 2;
    const TOUCH_ZOOM_EPSILON = 0.01;
    const PAN_EDGE_ALLOWANCE = 72;

    const methods = {
        setTransformTransition(value) {
            if (!this.el.imgContainer) return;
            this.el.imgContainer.style.transition = value;
        },

        animateTransform(duration = 180) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.setTransformTransition(`transform ${duration}ms ease-out`);
            this.transformTransitionTimer = setTimeout(() => {
                this.transformTransitionTimer = null;
                this.setTransformTransition('none');
            }, duration);
        },

        getImageGap() {
            if (!this.el.imgContainer) return 0;
            const styles = window.getComputedStyle(this.el.imgContainer);
            const gap = parseFloat(styles.columnGap || styles.gap || '0');
            return Number.isFinite(gap) ? gap : 0;
        },

        isSharpRenderMode() {
            return this.imageRenderMode === 'sharp';
        },

        getEffectiveImageSize(img) {
            const naturalWidth = img.naturalWidth || img.width || 0;
            const naturalHeight = img.naturalHeight || img.height || 0;
            const rotated = this.rotation === 90 || this.rotation === 270;
            return {
                width: rotated ? naturalHeight : naturalWidth,
                height: rotated ? naturalWidth : naturalHeight
            };
        },

        getSharpDisplaySizes(images, isFull) {
            const naturalSizes = images.map(img => this.getEffectiveImageSize(img));
            if (isFull || naturalSizes.length < 2) return naturalSizes;

            const targetHeight = Math.max(...naturalSizes.map(size => size.height || 0));
            if (!targetHeight) return naturalSizes;

            return naturalSizes.map(size => {
                if (!size.width || !size.height) return size;
                const ratio = targetHeight / size.height;
                return {
                    width: size.width * ratio,
                    height: targetHeight
                };
            });
        },

        getDisplayedImageSize(img) {
            const displayWidth = Number.parseFloat(img.dataset.displayWidth || '');
            const displayHeight = Number.parseFloat(img.dataset.displayHeight || '');
            if (Number.isFinite(displayWidth) && displayWidth > 0
                && Number.isFinite(displayHeight) && displayHeight > 0) {
                return { width: displayWidth, height: displayHeight };
            }
            return this.getEffectiveImageSize(img);
        },

        updateFitScale(images = Array.from(this.el.imgContainer?.querySelectorAll('img') || [])) {
            if (!this.isSharpRenderMode()) {
                this.fitScale = 1;
                this.contentNaturalWidth = 0;
                this.contentNaturalHeight = 0;
                return;
            }

            const readerRect = this.el.reader?.getBoundingClientRect();
            if (!readerRect || !images.length) {
                this.fitScale = 1;
                this.contentNaturalWidth = 0;
                this.contentNaturalHeight = 0;
                return;
            }

            const sizes = images.map(img => this.getDisplayedImageSize(img));
            const gap = this.getImageGap() * Math.max(0, images.length - 1);
            const width = sizes.reduce((sum, size) => sum + size.width, 0) + gap;
            const height = Math.max(...sizes.map(size => size.height));

            this.contentNaturalWidth = width;
            this.contentNaturalHeight = height;
            if (!width || !height || !readerRect.width || !readerRect.height) {
                this.fitScale = 1;
                return;
            }

            this.fitScale = Math.min(1, readerRect.width / width, readerRect.height / height);
        },

        getRenderScale(scale = this.scale) {
            return Math.max(0.001, this.fitScale * scale);
        },

        getMaxScale() {
            if (!this.fitScale) return MAX_SCALE;
            return Math.max(MAX_SCALE, MAX_RENDER_SCALE / this.fitScale);
        },

        getDoubleClickScale() {
            if (!this.fitScale) return DOUBLE_CLICK_SCALE;
            return Math.min(this.getMaxScale(), Math.max(DOUBLE_CLICK_SCALE, 1 / this.fitScale));
        },

        applyImageRenderMode() {
            const images = Array.from(this.el.imgContainer?.querySelectorAll('img') || []);
            const isFull = images.length === 1;
            const displaySizes = this.isSharpRenderMode()
                ? this.getSharpDisplaySizes(images, isFull)
                : [];
            images.forEach((img, index) => this.setupImg(img, isFull, displaySizes[index]));
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.updateFitScale(images);
            this.applyTransform();
        },

        getImageBounds() {
            if (!this.el.imgContainer) return null;
            const images = Array.from(this.el.imgContainer.querySelectorAll('img'));
            if (!images.length) return null;
            const containerRect = this.el.reader?.getBoundingClientRect()
                || this.el.imgContainer.getBoundingClientRect();
            const imageRects = images.map(img => img.getBoundingClientRect());
            const left = Math.min(...imageRects.map(rect => rect.left));
            const right = Math.max(...imageRects.map(rect => rect.right));
            const top = Math.min(...imageRects.map(rect => rect.top));
            const bottom = Math.max(...imageRects.map(rect => rect.bottom));
            return {
                containerRect,
                left,
                right,
                top,
                bottom,
                width: right - left,
                height: bottom - top
            };
        },

        getPanLimits() {
            const bounds = this.getImageBounds();
            if (!bounds || this.scale <= 1) return { maxX: 0, maxY: 0 };

            const renderScale = this.getRenderScale();
            const allowance = PAN_EDGE_ALLOWANCE / renderScale;
            return {
                maxX: Math.max(0, (bounds.width - bounds.containerRect.width) / (2 * renderScale)) + allowance,
                maxY: Math.max(0, (bounds.height - bounds.containerRect.height) / (2 * renderScale)) + allowance
            };
        },

        clampPanValue(value, limit) {
            return Math.max(-limit, Math.min(limit, value));
        },

        clampTransform() {
            const limits = this.getPanLimits();
            if (!limits.maxX && !limits.maxY) {
                this.translateX = 0;
                this.translateY = 0;
                return;
            }

            this.translateX = this.clampPanValue(this.translateX, limits.maxX);
            this.translateY = this.clampPanValue(this.translateY, limits.maxY);
        },

        zoomAt(clientX, clientY, nextScale) {
            if (!this.el.imgContainer) return;
            const clampedScale = Math.max(MIN_SCALE, Math.min(this.getMaxScale(), nextScale));
            const previousScale = this.scale || 1;
            if (Math.abs(clampedScale - previousScale) < 0.001) return;

            const rect = this.el.reader?.getBoundingClientRect()
                || this.el.imgContainer.getBoundingClientRect();
            const offsetX = clientX - (rect.left + rect.width / 2);
            const offsetY = clientY - (rect.top + rect.height / 2);
            const previousRenderScale = this.getRenderScale(previousScale);

            this.scale = clampedScale;
            const nextRenderScale = this.getRenderScale(clampedScale);
            this.translateX += offsetX * (1 / nextRenderScale - 1 / previousRenderScale);
            this.translateY += offsetY * (1 / nextRenderScale - 1 / previousRenderScale);
            if (this.isTouchDevice) {
                this.touchPanLocked = clampedScale > 1 + TOUCH_ZOOM_EPSILON;
            }
            this.applyTransform();
        },

        resetScaleAndPan() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.applyTransform();
        },

        resetTransform() {
            this.clearPendingTap();
            this.animateTransform(220);
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.rotation = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.lastTapTime = 0;
            this.twoFingerTapCandidate = false;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;
            this.syncRotateButton();
            this.applyImageRenderMode();
        },

        getTransformStyle(screenTranslateX = 0, screenTranslateY = 0) {
            const renderScale = this.getRenderScale();
            return `scale(${renderScale}) translate(${this.translateX + screenTranslateX / renderScale}px,${this.translateY + screenTranslateY / renderScale}px)`;
        },

        writeTransform() {
            if (this.el.imgContainer) this.el.imgContainer.style.transform = this.getTransformStyle();
        },

        applyTransform() {
            this.writeTransform();
            this.clampTransform();
            if (this.isTouchDevice && this.scale <= 1 + TOUCH_ZOOM_EPSILON) {
                this.touchPanLocked = false;
            }
            this.writeTransform();
        },

        handleMouseMove(e) {
            if (!this.isDragging) return;
            const renderScale = this.getRenderScale();
            this.translateX = this.initX + (e.clientX - this.startX) / renderScale;
            this.translateY = this.initY + (e.clientY - this.startY) / renderScale;
            this.applyTransform();
        },

        handleMouseUp() {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.el.imgContainer.classList.remove('is-grabbing');
        }
    };

    function attach(reader) {
        Object.entries(methods).forEach(([name, method]) => {
            reader[name] = method.bind(reader);
        });
        return reader;
    }

    Toolbox.readerTransform = {
        attach,
        methods
    };
})();

// ===== reader-selection.js =====
// Bilibili Toolbox - reader screenshot selection helpers
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const readerScreenshot = Toolbox.readerScreenshot;

    const methods = {
        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        },

        getReaderPoint(clientX, clientY) {
            const rect = this.el.reader.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, clientY - rect.top))
            };
        },

        normalizeSelectionRect(start = this.selectionStart, end = this.selectionCurrent) {
            if (!start || !end) return null;
            return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        },

        hasValidSelection(rect = this.normalizeSelectionRect()) {
            return Boolean(rect && rect.width >= 8 && rect.height >= 8);
        },

        updateSelectionActions() {
            const hasSelection = this.hasValidSelection();
            this.el.selectionSaveBtn.disabled = !hasSelection;
            this.el.selectionSaveBtn.classList.toggle('is-disabled', !hasSelection);
        },

        updateSelectionBox() {
            const rect = this.normalizeSelectionRect();
            if (!rect) {
                this.el.selectionBox.style.display = 'none';
                this._hideHandles();
                return;
            }
            Object.assign(this.el.selectionBox.style, {
                display: 'block', left: `${rect.x}px`, top: `${rect.y}px`,
                width: `${rect.width}px`, height: `${rect.height}px`
            });
            const valid = this.hasValidSelection(rect);
            const w = rect.width, h = rect.height;
            const pos = { nw: [0,0], n: [w/2,0], ne: [w,0], e: [w,h/2], se: [w,h], s: [w/2,h], sw: [0,h], w: [0,h/2] };
            for (const [dir, [x, y]] of Object.entries(pos)) {
                const el = this.selectionHandles[dir];
                if (!el) continue;
                el.style.display = valid ? 'block' : 'none';
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            }
        },

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this._hideHandles();
            this.updateSelectionActions();
        },

        _hideHandles() {
            for (const h of Object.values(this.selectionHandles)) {
                h.style.display = 'none';
            }
        },

        startScreenshotSelection() {
            if (this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = true;
            this.pageFlipToken += 1;
            this.selectionWasControlsVisible = this.controlsVisible;
            this.clearSelectionBox();
            this.hideSettingsPanel();
            this.el.selectionOverlay.style.display = 'block';
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58');
            this.hideControls();
            if (this.hideTimer) clearTimeout(this.hideTimer);
        },

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58');
            if (restoreControls) { this.selectionWasControlsVisible ? this.showControls() : this.hideControls(); }
            if (showMessage) this.showReaderMessage('\u5df2\u53d6\u6d88\u622a\u56fe');
        },

        handleSelectionPointerDown(e) {
            if (!this.isSelectingScreenshot || e.button === 2 || e.target.closest?.('button')) return;
            e.preventDefault();
            this.selectionPointerId = e.pointerId;

            const handle = e.target.closest?.('.comic-sel-handle');
            if (handle && this.hasValidSelection()) {
                const rect = this.normalizeSelectionRect();
                this.selectionStart = { x: rect.x, y: rect.y };
                this.selectionCurrent = { x: rect.x + rect.width, y: rect.y + rect.height };
                this.resizeDirection = handle.dataset.dir;
                this.isDraggingSelection = true;
                this.setSelectionHint('\u62d6\u52a8\u8fb9\u89d2\u8c03\u6574\u9009\u533a\u8303\u56f4');
                this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
                return;
            }

            if (e.target.closest?.('.comic-sel-handle') || e.target === this.el.selectionBox) return;

            this.isDraggingSelection = true;
            this.resizeDirection = null;
            this.selectionStart = this.getReaderPoint(e.clientX, e.clientY);
            this.selectionCurrent = this.selectionStart;
            this.updateSelectionBox();
            this.updateSelectionActions();
            this.setSelectionHint('\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u62d6\u52a8\u8fb9\u89d2\u5fae\u8c03');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        },

        handleSelectionPointerMove(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();

            const pt = this.getReaderPoint(e.clientX, e.clientY);
            const MIN = 8;

            if (this.resizeDirection) {
                const d = this.resizeDirection;
                if (d.includes('w')) this.selectionStart.x = Math.min(pt.x, this.selectionCurrent.x - MIN);
                if (d.includes('e')) this.selectionCurrent.x = Math.max(pt.x, this.selectionStart.x + MIN);
                if (d.includes('n')) this.selectionStart.y = Math.min(pt.y, this.selectionCurrent.y - MIN);
                if (d.includes('s')) this.selectionCurrent.y = Math.max(pt.y, this.selectionStart.y + MIN);
            } else {
                this.selectionCurrent = pt;
            }

            this.updateSelectionBox();
            this.updateSelectionActions();
        },

        handleSelectionPointerUp(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;

            if (!this.selectionStart && !this.selectionCurrent) return;

            this.el.selectionOverlay.releasePointerCapture?.(e.pointerId);
            this.updateSelectionBox();
            this.updateSelectionActions();

            if (this.hasValidSelection()) {
                this.setSelectionHint('\u9009\u533a\u5df2\u5c31\u7eea\uff0c\u62d6\u52a8\u8fb9\u89d2\u5fae\u8c03\uff0c\u6216\u70b9\u51fb\u4fdd\u5b58');
            } else {
                this.clearSelectionBox();
                this.setSelectionHint('\u9009\u533a\u592a\u5c0f\uff0c\u8bf7\u91cd\u65b0\u62d6\u52a8\u9009\u62e9');
            }
        },

        async saveSelectionScreenshot() {
            if (!this.hasValidSelection()) {
                this.showReaderMessage('\u8bf7\u5148\u62d6\u52a8\u9009\u51fa\u622a\u56fe\u8303\u56f4', true);
                return;
            }

            const success = await this.captureScreenshot(this.normalizeSelectionRect());
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        },

        async saveFullScreenshot() {
            const descriptors = this.getVisibleImageDescriptors();
            const rect = readerScreenshot.getBounds(descriptors);
            if (!rect) {
                this.showReaderMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u622a\u56fe\u7684\u9875\u9762', true);
                return;
            }

            const success = await this.captureScreenshot(rect, descriptors);
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        }
    };

    function attach(reader) {
        Object.entries(methods).forEach(([name, method]) => {
            reader[name] = method.bind(reader);
        });
        return reader;
    }

    Toolbox.readerSelection = {
        attach,
        methods
    };
})();

// ===== reader-dom.js =====
// Bilibili Toolbox - reader DOM creation
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const animations = Toolbox.animations;

    function createButton(text, title, className = 'comic-btn') {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.title = title;
        btn.className = className;
        return btn;
    }

    function createSettingsRow(title, desc, control) {
        const item = document.createElement('div');
        item.className = 'comic-settings-item';
        const copy = document.createElement('div');
        copy.className = 'comic-settings-copy';
        const titleEl = document.createElement('div');
        titleEl.className = 'comic-settings-title';
        titleEl.textContent = title;
        const descEl = document.createElement('div');
        descEl.className = 'comic-settings-desc';
        descEl.textContent = desc;
        const action = document.createElement('div');
        action.className = 'comic-settings-action';
        copy.append(titleEl, descEl);
        action.append(control);
        item.append(copy, action);
        return item;
    }

    function createReaderUi(reader) {
        reader.el.reader = document.createElement('div');
        reader.el.reader.id = 'comic-reader-overlay';

        reader.el.imgContainer = document.createElement('div');
        reader.el.imgContainer.className = 'comic-img-container';

        reader.el.controls = document.createElement('div');
        reader.el.controls.className = 'comic-controls';

        reader.el.settingsControls = document.createElement('div');
        reader.el.settingsControls.className = 'comic-settings-controls';

        reader.el.settingsPanel = document.createElement('div');
        reader.el.settingsPanel.className = 'comic-settings-panel';
        reader.el.settingsPanel.setAttribute('aria-hidden', 'true');

        const row = document.createElement('div');
        row.className = 'comic-reader-row';
        const secondRow = document.createElement('div');
        secondRow.className = 'comic-reader-row comic-reader-row-wrap';

        [
            ['rightBtn', '\u2192', '\u5411\u53f3\u7ffb\u9875', 'comic-btn'],
            ['leftBtn', '\u2190', '\u5411\u5de6\u7ffb\u9875', 'comic-btn'],
            ['offsetIncBtn', '<', '\u5de6\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['offsetDecBtn', '>', '\u53f3\u79fb\u4e00\u9875', 'comic-btn comic-btn-alt'],
            ['directionBtn', '', '', 'comic-btn comic-btn-alt'],
            ['animationBtn', '', '', 'comic-btn comic-btn-alt'],
            ['viewModeBtn', '', '', 'comic-btn comic-btn-alt'],
            ['imageRenderBtn', '', '', 'comic-btn comic-btn-alt'],
            ['backgroundBtn', '', '', 'comic-btn comic-btn-alt'],
            ['tapPageBtn', '', '', 'comic-btn comic-btn-alt'],
            ['resetViewBtn', '\u91cd\u7f6e', '\u91cd\u7f6e\u89c6\u56fe', 'comic-btn comic-btn-alt'],
            ['screenshotBtn', '\u622a\u56fe', '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4', 'comic-btn comic-btn-alt'],
            ['fullScreenBtn', '', '', 'comic-btn comic-btn-alt'],
            ['rotateBtn', '', '', 'comic-btn comic-btn-alt'],
            ['settingsBtn', '\u8bbe\u7f6e', '\u6253\u5f00\u9605\u8bfb\u5668\u8bbe\u7f6e', 'comic-btn comic-btn-alt'],
            ['closeBtn', '\u9000\u51fa', '\u9000\u51fa', 'comic-btn']
        ].forEach(([key, text, title, style]) => {
            reader.el[key] = createButton(text, title, style);
        });

        reader.el.pageInfo = document.createElement('span');
        reader.el.pageInfo.className = 'comic-page-info';
        reader.el.pageInfo.title = '\u70b9\u51fb\u8f93\u5165\u9875\u7801';

        reader.el.pageDisplay = document.createElement('span');
        reader.el.pageDisplay.className = 'comic-page-display';

        reader.el.pageInput = document.createElement('input');
        reader.el.pageInput.className = 'comic-page-input';
        reader.el.pageInput.type = 'text';
        reader.el.pageInput.inputMode = 'numeric';
        reader.el.pageInput.pattern = '[0-9]*';
        reader.el.pageInput.autocomplete = 'off';
        reader.el.pageInput.spellcheck = false;
        reader.el.pageInput.title = '\u8f93\u5165\u9875\u7801\u540e\u56de\u8f66\u8df3\u8f6c';

        reader.el.pageRange = document.createElement('span');
        reader.el.pageRange.className = 'comic-page-range';
        reader.el.pageInfo.append(reader.el.pageDisplay, reader.el.pageInput, reader.el.pageRange);

        reader.el.toast = document.createElement('div');
        reader.el.toast.className = 'comic-toast';

        reader.el.selectionOverlay = document.createElement('div');
        reader.el.selectionOverlay.className = 'comic-selection-overlay';

        reader.el.selectionHint = document.createElement('div');
        reader.el.selectionHint.className = 'comic-selection-hint';
        reader.el.selectionHint.textContent = '\u62d6\u52a8\u9009\u62e9\u622a\u56fe\u8303\u56f4\uff0c\u5b8c\u6210\u540e\u70b9\u51fb\u4fdd\u5b58';

        reader.el.selectionToolbar = document.createElement('div');
        reader.el.selectionToolbar.className = 'comic-selection-toolbar';

        reader.el.selectionCancelBtn = document.createElement('button');
        reader.el.selectionCancelBtn.type = 'button';
        reader.el.selectionCancelBtn.innerText = '\u53d6\u6d88\u622a\u56fe';
        reader.el.selectionCancelBtn.className = 'comic-selection-action comic-selection-cancel';

        reader.el.selectionSaveBtn = document.createElement('button');
        reader.el.selectionSaveBtn.type = 'button';
        reader.el.selectionSaveBtn.innerText = '\u4fdd\u5b58\u622a\u56fe';
        reader.el.selectionSaveBtn.className = 'comic-selection-action comic-selection-save';

        reader.el.selectionFullBtn = document.createElement('button');
        reader.el.selectionFullBtn.type = 'button';
        reader.el.selectionFullBtn.innerText = '\u4fdd\u5b58\u5168\u56fe';
        reader.el.selectionFullBtn.className = 'comic-selection-action comic-selection-full';

        reader.el.selectionBox = document.createElement('div');
        reader.el.selectionBox.className = 'comic-selection-box';

        const handleCursors = {
            nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
            e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
            sw: 'nesw-resize', w: 'ew-resize'
        };
        for (const [dir, cursor] of Object.entries(handleCursors)) {
            const h = document.createElement('div');
            h.className = 'comic-sel-handle';
            h.dataset.dir = dir;
            h.style.cursor = cursor;
            reader.el.selectionBox.appendChild(h);
            reader.selectionHandles[dir] = h;
        }

        reader.el.selectionToolbar.append(reader.el.selectionFullBtn, reader.el.selectionSaveBtn, reader.el.selectionCancelBtn);
        reader.el.selectionOverlay.append(reader.el.selectionHint, reader.el.selectionToolbar, reader.el.selectionBox);

        const settingsHeader = document.createElement('div');
        settingsHeader.className = 'comic-settings-panel-header';
        const settingsTitle = document.createElement('div');
        settingsTitle.className = 'comic-settings-panel-title';
        settingsTitle.textContent = '\u9605\u8bfb\u8bbe\u7f6e';
        const settingsDesc = document.createElement('div');
        settingsDesc.className = 'comic-settings-panel-desc';
        settingsDesc.textContent = '\u8c03\u6574\u663e\u793a\u3001\u7ffb\u9875\u548c\u9605\u8bfb\u4e60\u60ef\uff0c\u66f4\u6539\u4f1a\u81ea\u52a8\u4fdd\u5b58\u3002';
        settingsHeader.append(settingsTitle, settingsDesc);

        row.append(reader.el.leftBtn, reader.el.offsetIncBtn, reader.el.pageInfo, reader.el.offsetDecBtn, reader.el.rightBtn);
        secondRow.append(reader.el.resetViewBtn, reader.el.fullScreenBtn);
        reader.el.controls.append(row, secondRow);

        reader.el.settingsControls.append(reader.el.closeBtn, reader.el.screenshotBtn, reader.el.rotateBtn, reader.el.settingsBtn);
        reader.el.settingsPanel.append(
            settingsHeader,
            createSettingsRow('\u663e\u793a\u8d28\u91cf', '\u539f\u56fe\u4fdd\u7559\u7ec6\u8282\uff0c\u6d41\u7545\u51cf\u5c11\u7eb9\u7406\u95ea\u70c1\u3002', reader.el.imageRenderBtn),
            createSettingsRow('\u80cc\u666f\u989c\u8272', '\u5728\u9ed1\u8272\u3001\u6df1\u7070\u3001\u6d45\u7070\u548c\u767d\u8272\u9605\u8bfb\u80cc\u666f\u4e4b\u95f4\u5207\u6362\u3002', reader.el.backgroundBtn),
            createSettingsRow('\u7ffb\u9875\u52a8\u753b', '\u5728\u5e73\u6ed1\u548c\u6de1\u5165\u4e4b\u95f4\u5207\u6362\u3002', reader.el.animationBtn),
            createSettingsRow('\u663e\u793a\u5f20\u6570', '\u81ea\u52a8\u5224\u65ad\u5355\u56fe\u6216\u53cc\u56fe\uff0c\u4e5f\u53ef\u624b\u52a8\u6307\u5b9a\u3002', reader.el.viewModeBtn),
            createSettingsRow('\u70b9\u51fb\u7ffb\u9875\uff08\u4ec5\u79fb\u52a8\u7aef\uff09', '\u63a7\u5236\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u662f\u5426\u7ffb\u9875\u3002', reader.el.tapPageBtn),
            createSettingsRow('\u9605\u8bfb\u65b9\u5411', '\u9002\u914d\u4ece\u53f3\u5f80\u5de6\u6216\u4ece\u5de6\u5f80\u53f3\u7684\u9605\u8bfb\u4e60\u60ef\u3002', reader.el.directionBtn)
        );

        reader.el.reader.append(reader.el.imgContainer, reader.el.controls, reader.el.settingsControls, reader.el.settingsPanel, reader.el.toast, reader.el.selectionOverlay);

        document.body.appendChild(reader.el.reader);
        reader.updateDirection();
        reader.syncDirectionButton();
        animations.syncAnimationButton(reader.el.animationBtn, reader.animationMode);
        reader.syncViewModeButton();
        reader.syncImageRenderButton();
        reader.syncBackgroundButton();
        reader.syncTapPageButton();
        reader.syncRotateButton();
        reader.syncFullscreenButton();
        reader.applyReaderBackground();
        reader.applyResponsiveLayout();
    }

    function attach(reader) {
        reader.createUI = () => createReaderUi(reader);
        return reader;
    }

    Toolbox.readerDom = {
        attach,
        create: createReaderUi
    };
})();

// ===== comic-reader-page-groups.js =====
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

// ===== comic-reader-interactions.js =====
// Bilibili Toolbox - reader interaction bindings
(function() {
    'use strict';

    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const animations = Toolbox.animations;
    const readerPreferences = Toolbox.readerPreferences;
    const VIEW_MODES = readerPreferences.VIEW_MODES;
    const IMAGE_RENDER_MODES = readerPreferences.IMAGE_RENDER_MODES;
    const BACKGROUND_MODES = readerPreferences.BACKGROUND_MODES;
    const SCALE_STEP = 0.1;

    function stop(handler) {
        return (event) => {
            event.stopPropagation();
            handler(event);
        };
    }

    function bindReaderInteractions(reader) {
        const on = (...args) => reader.eventBag.on(...args);
        const el = reader.el;

        on(el.controls, 'mouseenter', () => reader.showControls());
        on(el.settingsControls, 'mouseenter', () => reader.showControls());
        on(el.settingsPanel, 'mouseenter', () => reader.showControls());
        on(el.controls, 'mouseleave', () => reader.scheduleHideControls());
        on(el.settingsControls, 'mouseleave', () => reader.scheduleHideControls());
        on(el.settingsPanel, 'mouseleave', () => reader.scheduleHideControls());
        on(el.reader, 'mouseleave', () => reader.scheduleHideControls());

        el.leftBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? reader.lastStep : -reader.lastStep);
        el.rightBtn.onclick = (event) => reader.turnPage(event, reader.isRightToLeft ? -reader.lastStep : reader.lastStep);

        el.offsetIncBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? 1 : -1);
        el.offsetDecBtn.onclick = (event) => reader.offsetPage(event, reader.isRightToLeft ? -1 : 1);

        el.directionBtn.onclick = stop(() => {
            reader.isRightToLeft = !reader.isRightToLeft;
            reader.updateDirection();
            reader.syncDirectionButton();
            reader.savePreferences();
        });

        el.animationBtn.onclick = stop(() => {
            reader.animationMode = animations.getNextAnimationMode(reader.animationMode);
            animations.syncAnimationButton(el.animationBtn, reader.animationMode);
            reader.savePreferences();
        });

        el.viewModeBtn.onclick = stop(() => {
            const currentIdx = VIEW_MODES.indexOf(reader.viewMode);
            reader.viewMode = VIEW_MODES[(currentIdx + 1) % VIEW_MODES.length];
            reader.syncViewModeButton();
            reader.savePreferences();
            reader.render(false);
        });

        el.imageRenderBtn.onclick = stop(() => {
            const currentIdx = IMAGE_RENDER_MODES.indexOf(reader.imageRenderMode);
            reader.imageRenderMode = IMAGE_RENDER_MODES[(currentIdx + 1) % IMAGE_RENDER_MODES.length];
            reader.syncImageRenderButton();
            reader.savePreferences();
            reader.applyImageRenderMode();
            reader.showReaderMessage(reader.imageRenderMode === 'sharp' ? '\u539f\u56fe\u6a21\u5f0f' : '\u6d41\u7545\u6a21\u5f0f');
        });

        el.backgroundBtn.onclick = stop(() => {
            const currentIdx = BACKGROUND_MODES.indexOf(reader.backgroundMode);
            reader.backgroundMode = BACKGROUND_MODES[(currentIdx + 1) % BACKGROUND_MODES.length];
            reader.syncBackgroundButton();
            reader.applyReaderBackground();
            reader.savePreferences();
            reader.showReaderMessage(`\u80cc\u666f\uff1a${reader.getReaderBackgroundLabel()}`);
        });

        el.tapPageBtn.onclick = stop(() => {
            reader.tapPageNavigation = !reader.tapPageNavigation;
            reader.syncTapPageButton();
            reader.savePreferences();
            reader.showReaderMessage(reader.tapPageNavigation ? '\u70b9\u51fb\u7ffb\u9875\u5df2\u5f00\u542f' : '\u70b9\u51fb\u7ffb\u9875\u5df2\u5173\u95ed');
        });

        el.settingsBtn.onclick = stop(() => reader.toggleSettingsPanel());

        el.resetViewBtn.onclick = stop(() => reader.resetTransform());
        el.screenshotBtn.onclick = stop(() => reader.startScreenshotSelection());
        el.fullScreenBtn.onclick = stop(() => reader.toggleFullscreen());

        el.rotateBtn.onclick = stop(() => {
            reader.rotation = (reader.rotation + 90) % 360;
            reader.syncRotateButton();
            reader.render(false);
        });

        el.closeBtn.onclick = () => reader.close();

        on(el.pageInfo, 'click', (event) => {
            event.stopPropagation();
            reader.showPageInput();
        });
        on(el.pageInput, 'focus', () => el.pageInput.select());
        on(el.pageInput, 'keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                reader.jumpToPageFromInput();
                el.pageInput.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                reader.hidePageInput();
                el.pageInput.blur();
            }
        });
        on(el.pageInput, 'blur', () => reader.jumpToPageFromInput());

        el.selectionCancelBtn.onclick = () => reader.cancelScreenshotSelection(true);
        el.selectionFullBtn.onclick = () => { void reader.saveFullScreenshot(); };
        el.selectionSaveBtn.onclick = () => { void reader.saveSelectionScreenshot(); };
        on(el.selectionOverlay, 'pointerdown', reader.handleSelectionPointerDown);
        on(el.selectionOverlay, 'pointermove', reader.handleSelectionPointerMove);
        on(el.selectionOverlay, 'pointerup', reader.handleSelectionPointerUp);
        on(el.selectionOverlay, 'pointercancel', reader.handleSelectionPointerUp);
        on(el.reader, 'pointerdown', reader.handleSettingsOutsidePointerDown, true);

        on(el.imgContainer, 'wheel', (event) => {
            event.preventDefault();
            reader.animateTransform();
            reader.zoomAt(event.clientX, event.clientY, reader.scale + (event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP));
        }, { passive: false });

        on(el.imgContainer, 'dblclick', (event) => {
            event.preventDefault();
            reader.animateTransform(220);
            if (Math.abs(reader.scale - 1) < 0.05) {
                reader.zoomAt(event.clientX, event.clientY, reader.getDoubleClickScale());
                return;
            }
            reader.resetScaleAndPan();
        });

        on(el.imgContainer, 'mousedown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            reader.setTransformTransition('none');
            reader.isDragging = true;
            reader.initX = reader.translateX;
            reader.initY = reader.translateY;
            reader.startX = event.clientX;
            reader.startY = event.clientY;
            el.imgContainer.classList.add('is-grabbing');
        });

        on(el.imgContainer, 'mouseleave', () => {
            reader.isDragging = false;
            el.imgContainer.classList.remove('is-grabbing');
        });

        on(document, 'mousemove', reader.handleMouseMove);
        on(document, 'mouseup', reader.handleMouseUp);
        on(document, 'fullscreenchange', reader.handleFullscreenChange);
        on(window, 'keydown', reader.handleKeyDown);
        on(window, 'resize', reader.handleResize);

        on(el.reader, 'touchstart', reader.boundHandleTouchStart, { passive: false });
        on(el.reader, 'touchmove', reader.boundHandleTouchMove, { passive: false });
        on(el.reader, 'touchend', reader.boundHandleTouchEnd, { passive: false });
        on(el.reader, 'touchcancel', reader.boundHandleTouchEnd, { passive: false });
        reader.showControls();
    }

    Toolbox.readerInteractions = {
        bind: bindReaderInteractions
    };
})();

// ===== comic-reader.js =====
// Bilibili Toolbox - Comic Reader
(function() {
    'use strict';

    // ============ 常量定义 ============
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const DOUBLE_CLICK_SCALE = 2;
    const MAX_RENDER_SCALE = 2;
    const CONTROLS_HIDE_DELAY = 500;
    const SWIPE_THRESHOLD = 50;
    const TAP_DELAY = 220;
    const DOUBLE_TAP_DELAY = 300;
    const TAP_ZONE_RATIO = 0.28;
    const TOUCH_ZOOM_EPSILON = 0.01;
    const TOUCH_EDGE_EPSILON = 0.5;
    const PAN_EDGE_ALLOWANCE = 72;
    const PRELOAD_COUNT = 4;
    const MOBILE_BREAKPOINT = 768;
    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.readerPreferences) throw new Error('BilibiliToolbox: reader-preferences.js not loaded');
    if (!window.BilibiliToolbox?.readerScreenshot) throw new Error('BilibiliToolbox: reader-screenshot.js not loaded');
    if (!window.BilibiliToolbox?.readerTransform) throw new Error('BilibiliToolbox: reader-transform.js not loaded');
    if (!window.BilibiliToolbox?.readerSelection) throw new Error('BilibiliToolbox: reader-selection.js not loaded');
    if (!window.BilibiliToolbox?.readerDom) throw new Error('BilibiliToolbox: reader-dom.js not loaded');
    if (!window.BilibiliToolbox?.readerPageGroups) throw new Error('BilibiliToolbox: comic-reader-page-groups.js not loaded');
    if (!window.BilibiliToolbox?.readerInteractions) throw new Error('BilibiliToolbox: comic-reader-interactions.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const Shared = window.Shared;
    const bilibiliDom = Toolbox.bilibiliDom;
    const animations = Toolbox.animations;
    const comicImages = Toolbox.comicImages;
    const readerPreferences = Toolbox.readerPreferences;
    const readerScreenshot = Toolbox.readerScreenshot;
    const readerTransform = Toolbox.readerTransform;
    const readerSelection = Toolbox.readerSelection;
    const readerDom = Toolbox.readerDom;
    const readerPageGroups = Toolbox.readerPageGroups;
    const readerInteractions = Toolbox.readerInteractions;
    const READER_BACKGROUND_COLORS = Object.freeze({
        black: '#0a0a0a',
        darkGray: '#1f1f1f',
        lightGray: '#d8d8d8',
        white: '#ffffff'
    });
    const READER_BACKGROUND_LABELS = Object.freeze({
        black: '\u9ed1\u8272',
        darkGray: '\u6df1\u7070',
        lightGray: '\u6d45\u7070',
        white: '\u767d\u8272'
    });

    // ============ 漫画模式功能 ============

    class BiliComicReader {
        normalizePreferences(value = {}) {
            return readerPreferences.normalize(value);
        }

        loadPreferences() {
            return readerPreferences.load();
        }

        savePreferences() {
            const preferences = this.normalizePreferences({
                isRightToLeft: this.isRightToLeft,
                viewMode: this.viewMode,
                animationMode: this.animationMode,
                imageRenderMode: this.imageRenderMode,
                backgroundMode: this.backgroundMode,
                tapPageNavigation: this.tapPageNavigation
            });
            void readerPreferences.save(preferences).catch(() => {});
        }

        constructor() {
            const preferences = this.loadPreferences();
            // 状态管理
            this.imgList = [];
            this.currentIndex = 0;
            this.lastStep = 2;
            this.isRightToLeft = preferences.isRightToLeft;
            this.scale = 1;
            this.fitScale = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
            this.viewMode = preferences.viewMode;
            this.animationMode = preferences.animationMode;
            this.imageRenderMode = preferences.imageRenderMode;
            this.backgroundMode = preferences.backgroundMode;
            this.tapPageNavigation = preferences.tapPageNavigation;
            this.rotation = 0;
            this.activePageCount = 1;
            this.controlsVisible = true;
            this.isTouchDevice = Shared.isTouchLikeDevice();
            this.isCompactLayout = false;
            this.isSelectingScreenshot = false;
            this.isDraggingSelection = false;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.selectionWasControlsVisible = true;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionHandles = {};
            this.pageFlipToken = 0;
            this.transformTransitionTimer = null;

            // 拖拽状态
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.initX = 0;
            this.initY = 0;

            // 触摸滑动状态
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.touchEndX = 0;
            this.touchEndY = 0;
            this.isTouchSwiping = false;
            this.touchStartTime = 0;
            this.touchStartedOnInteractive = false;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.pendingTapTimer = null;
            this.lastTapTime = 0;
            this.lastTapX = 0;
            this.lastTapY = 0;

            // 双指缩放状态
            this.isTwoFingerGesturing = false;
            this.initialPinchDistance = 0;
            this.initialScale = 1;
            this.initialCenterX = 0;
            this.initialCenterY = 0;
            this.twoFingerTapCandidate = false;
            this.twoFingerTapStartTime = 0;
            this.twoFingerTapCenterX = 0;
            this.twoFingerTapCenterY = 0;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;

            // DOM 元素引用
            this.el = {};
            this.eventBag = null;

            readerTransform.attach(this);
            readerSelection.attach(this);
            readerDom.attach(this);

            // 绑定全局事件的 this 指向，便于后续解绑
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseUp = this.handleMouseUp.bind(this);
            this.boundHandleTouchStart = this.handleTouchStart.bind(this);
            this.boundHandleTouchMove = this.handleTouchMove.bind(this);
            this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
            this.handleSelectionPointerDown = this.handleSelectionPointerDown.bind(this);
            this.handleSelectionPointerMove = this.handleSelectionPointerMove.bind(this);
            this.handleSelectionPointerUp = this.handleSelectionPointerUp.bind(this);
            this.handleSettingsOutsidePointerDown = this.handleSettingsOutsidePointerDown.bind(this);
            this.handleResize = this.handleResize.bind(this);
        }

        // 1. 初始化入口按钮
        init() {
            const entryBtn = document.createElement('button');
            entryBtn.innerHTML = '&#128214;';
            entryBtn.className = `comic-entry-btn${this.isTouchDevice ? ' comic-entry-btn-touch' : ''}`;
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

        // 2. 启动阅读器
        start() {
            this.imgList = comicImages.collectImages();

            if (this.imgList.length === 0) return alert('\u672a\u627e\u5230\u6f2b\u753b\u56fe\u7247');

            this.currentIndex = 0;
            this.lastStep = 2;
            this.isDragging = false;
            this.animationMode = readerPreferences.normalizeAnimationMode(this.animationMode);

            // 隐藏收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = 'none';

            this.eventBag = Toolbox.createEventBag();
            this.createUI();
            this.bindEvents();
            this.render();
        }

        // 3. 创建 UI
        // 4. 缁戝畾浜嬩欢
        bindEvents() {
            readerInteractions.bind(this);
        }

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '\u4ece\u53f3\u5f80\u5de6 \u2190' : '\u4ece\u5de6\u5f80\u53f3 \u2192';
            this.el.directionBtn.title = dir ? '\u5f53\u524d\uff1a\u4ece\u53f3\u5f80\u5de6' : '\u5f53\u524d\uff1a\u4ece\u5de6\u5f80\u53f3';
        }

        syncViewModeButton() {
            const map = {
                auto: ['\u81ea\u52a8', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u81ea\u52a8'],
                single: ['\u5355\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u5355\u56fe'],
                double: ['\u53cc\u56fe', '\u89c6\u56fe\u6a21\u5f0f\uff1a\u53cc\u56fe']
            };
            const [text, title] = map[this.viewMode] || map.auto;
            Object.assign(this.el.viewModeBtn, { innerText: text, title });
        }

        syncImageRenderButton() {
            const sharp = this.imageRenderMode === 'sharp';
            this.el.imageRenderBtn.innerText = sharp ? '\u539f\u56fe' : '\u6d41\u7545';
            this.el.imageRenderBtn.title = sharp
                ? '\u663e\u793a\u6a21\u5f0f\uff1a\u539f\u56fe\uff08\u7ec6\u8282\u66f4\u597d\uff0c\u53ef\u80fd\u6709\u6469\u5c14\u7eb9\uff09'
                : '\u663e\u793a\u6a21\u5f0f\uff1a\u6d41\u7545\uff08\u6469\u5c14\u7eb9\u66f4\u5c11\uff0c\u653e\u5927\u540e\u7ec6\u8282\u7a0d\u8f6f\uff09';
            this.el.imageRenderBtn.classList.remove('active');
        }

        syncBackgroundButton() {
            const label = this.getReaderBackgroundLabel();
            this.el.backgroundBtn.innerText = label;
            this.el.backgroundBtn.title = `\u80cc\u666f\u989c\u8272\uff1a${label}`;
            this.el.backgroundBtn.classList.remove('active');
        }

        syncTapPageButton() {
            const enabled = Boolean(this.tapPageNavigation);
            this.el.tapPageBtn.innerText = enabled ? '\u70b9\u51fb\u7ffb\u9875' : '\u70b9\u51fb\u5173\u95ed';
            this.el.tapPageBtn.title = enabled
                ? '\u70b9\u51fb\u5c4f\u5e55\u5de6\u53f3\u533a\u57df\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09'
                : '\u70b9\u51fb\u5c4f\u5e55\u4e0d\u7ffb\u9875\uff08\u6ed1\u52a8\u7ffb\u9875\u59cb\u7ec8\u5f00\u542f\uff09';
            this.el.tapPageBtn.classList.toggle('active', enabled);
        }

        syncRotateButton() {
            const rot = this.rotation;
            this.el.rotateBtn.innerText = rot === 0 ? '\u65cb\u8f6c' : `${rot}\u5ea6`;
            this.el.rotateBtn.title = rot === 0 ? '\u65cb\u8f6c90\u5ea6' : `\u5f53\u524d\u65cb\u8f6c\uff1a${rot}\u5ea6`;
        }

        syncFullscreenButton() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '\u9000\u51fa\u5168\u5c4f' : '\u5168\u5c4f';
                this.el.fullScreenBtn.title = this.el.fullScreenBtn.innerText;
            }
        }

        isSettingsPanelVisible() {
            return Boolean(this.el.settingsPanel?.classList.contains('show'));
        }

        toggleSettingsPanel() {
            if (this.isSettingsPanelVisible()) {
                this.hideSettingsPanel();
                return;
            }
            this.showControls();
            this.el.settingsPanel.classList.add('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'false');
            this.el.settingsBtn.classList.add('active');
        }

        hideSettingsPanel() {
            if (!this.el.settingsPanel) return;
            this.el.settingsPanel.classList.remove('show');
            this.el.settingsPanel.setAttribute('aria-hidden', 'true');
            this.el.settingsBtn?.classList.remove('active');
        }

        handleSettingsOutsidePointerDown(e) {
            if (!this.isSettingsPanelVisible()) return;
            const target = e.target instanceof Element ? e.target : null;
            if (target && (this.el.settingsPanel.contains(target) || this.el.settingsBtn.contains(target))) return;
            this.hideSettingsPanel();
        }

        toggleFullscreen() {
            if (!this.el.reader?.requestFullscreen || document.fullscreenEnabled === false) {
                this.showReaderMessage('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u7f51\u9875\u5168\u5c4f', true, 2600);
                return;
            }
            if (!document.fullscreenElement) {
                this.el.reader.requestFullscreen().catch(() => {
                    this.showReaderMessage('\u5168\u5c4f\u5f00\u542f\u5931\u8d25\uff0c\u53ef\u80fd\u53d7\u6d4f\u89c8\u5668\u9650\u5236', true, 2600);
                });
            } else {
                document.exitFullscreen().catch(() => {
                    this.showReaderMessage('\u9000\u51fa\u5168\u5c4f\u5931\u8d25', true, 2200);
                });
            }
        }

        isCompactViewport() {
            return window.innerWidth < MOBILE_BREAKPOINT || this.isTouchDevice;
        }

        applyResponsiveLayout() {
            this.isCompactLayout = this.isCompactViewport();
            this.el.reader.classList.toggle('reader-compact', this.isCompactLayout);
            this.updateFitScale();
            this.applyTransform();
        }

        getReaderBackgroundColor() {
            return READER_BACKGROUND_COLORS[this.backgroundMode] || READER_BACKGROUND_COLORS.black;
        }

        getReaderBackgroundLabel() {
            return READER_BACKGROUND_LABELS[this.backgroundMode] || READER_BACKGROUND_LABELS.black;
        }

        applyReaderBackground() {
            if (this.el.reader) this.el.reader.style.background = this.getReaderBackgroundColor();
        }

        setControlsOpacity(opacity) {
            const hidden = opacity === '0';
            this.el.controls.classList.toggle('is-hidden', hidden);
            this.el.settingsControls.classList.toggle('is-hidden', hidden);
            if (hidden) this.hideSettingsPanel();
        }

        showControls() {
            if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
            if (!this.controlsVisible) this.setControlsOpacity('1');
            this.controlsVisible = true;
        }

        hideControls() {
            this.controlsVisible = false;
            this.setControlsOpacity('0');
        }

        scheduleHideControls() {
            if (this.isSettingsPanelVisible()) return;
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => this.hideControls(), this.isTouchDevice ? 1000 : 500);
        }

        showReaderMessage(text, isError = false, duration = 2200) {
            if (!this.el.toast) return;
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.el.toast.classList.toggle('is-error', isError);
            this.el.toast.classList.add('is-visible');
            this.el.toast.textContent = text;
            this.messageTimer = setTimeout(() => { this.el.toast.classList.remove('is-visible'); }, duration);
        }

        isInteractiveTouchTarget(target) {
            const el = target instanceof Element ? target : null;
            return el?.closest('button, a, input, textarea, select')
                || this.el.controls.contains(el)
                || this.el.settingsControls.contains(el)
                || this.el.settingsPanel.contains(el);
        }

        handleResize() {
            this.pageFlipToken += 1;
            this.applyResponsiveLayout();
        }

        handleTapNavigation(clientX) {
            if (!this.isTouchDevice || !this.el.reader) {
                this.controlsVisible ? this.hideControls() : this.showControls();
                return;
            }

            const rect = this.el.reader.getBoundingClientRect();
            const x = clientX - rect.left;
            if (this.tapPageNavigation && x < rect.width * TAP_ZONE_RATIO) {
                this.turnPage(null, this.isRightToLeft ? this.lastStep : -this.lastStep);
                return;
            }
            if (this.tapPageNavigation && x > rect.width * (1 - TAP_ZONE_RATIO)) {
                this.turnPage(null, this.isRightToLeft ? -this.lastStep : this.lastStep);
                return;
            }

            this.controlsVisible ? this.hideControls() : this.showControls();
        }

        clearPendingTap() {
            if (!this.pendingTapTimer) return;
            clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        }

        handleSingleFingerTap(clientX, clientY) {
            const now = Date.now();
            const isDoubleTap = now - this.lastTapTime < DOUBLE_TAP_DELAY
                && Math.abs(clientX - this.lastTapX) < 36
                && Math.abs(clientY - this.lastTapY) < 36;

            this.clearPendingTap();
            if (isDoubleTap) {
                this.lastTapTime = 0;
                this.lastTapX = 0;
                this.lastTapY = 0;
                this.animateTransform(220);
                if (Math.abs(this.scale - 1) < 0.05) {
                    this.zoomAt(clientX, clientY, this.getDoubleClickScale());
                    this.touchPanLocked = this.scale > 1 + TOUCH_ZOOM_EPSILON;
                    return;
                }
                this.resetScaleAndPan();
                this.touchPanLocked = false;
                return;
            }

            this.lastTapTime = now;
            this.lastTapX = clientX;
            this.lastTapY = clientY;
            this.pendingTapTimer = setTimeout(() => {
                this.pendingTapTimer = null;
                this.handleTapNavigation(clientX);
            }, TAP_DELAY);
        }

        isTouchPanMode() {
            return this.touchPanLocked && this.scale > 1 + TOUCH_ZOOM_EPSILON;
        }

        async loadExportImageSafe(src) {
            try {
                const res = await fetch(src);
                if (!res.ok) return this.loadImage(src);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const img = await new Promise((resolve) => {
                    const el = new Image();
                    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
                    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                    el.src = url;
                });
                return img || this.loadImage(src);
            } catch (_) {
                return this.loadImage(src);
            }
        }

        getVisibleImageDescriptors() {
            const readerRect = this.el.reader.getBoundingClientRect();
            return Array.from(this.el.imgContainer.querySelectorAll('img'))
                .map(img => {
                    const rect = img.getBoundingClientRect();
                    return { src: img.currentSrc || img.src, x: rect.left - readerRect.left, y: rect.top - readerRect.top, width: rect.width, height: rect.height };
                })
                .filter(item => item.src && item.width > 0 && item.height > 0);
        }

        async captureScreenshot(selectionRect, descriptors = this.getVisibleImageDescriptors()) {
            return readerScreenshot.capture(this, selectionRect, descriptors);
        }

        // 触摸事件处理
        handleTouchStart(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2) {
                // 双指缩放开启
                e.preventDefault();
                this.clearPendingTap();
                this.setTransformTransition('none');
                this.isTwoFingerGesturing = true;
                this.touchPanLocked = true;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                this.initialScale = this.scale;
                this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                this.twoFingerTapCandidate = true;
                this.twoFingerTapStartTime = Date.now();
                this.twoFingerTapCenterX = this.initialCenterX;
                this.twoFingerTapCenterY = this.initialCenterY;
                return;
            }

            if (e.touches.length === 1) {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchEndX = this.touchStartX;
                this.touchEndY = this.touchStartY;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                this.touchStartTime = Date.now();
                this.touchStartedOnInteractive = this.isInteractiveTouchTarget(e.target);
                this.initX = this.translateX;
                this.initY = this.translateY;
                if (this.touchStartedOnInteractive) {
                    this.showControls();
                }
            }
        }

        handleTouchMove(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2 && this.isTwoFingerGesturing) {
                // 双指缩放中
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);

                const scaleFactor = currentDistance / this.initialPinchDistance;
                this.scale = Math.max(MIN_SCALE, Math.min(this.getMaxScale(), this.initialScale * scaleFactor));

                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                if (Math.abs(currentDistance - this.initialPinchDistance) > 8
                    || Math.abs(currentCenterX - this.twoFingerTapCenterX) > 8
                    || Math.abs(currentCenterY - this.twoFingerTapCenterY) > 8) {
                    this.twoFingerTapCandidate = false;
                }
                const renderScale = this.getRenderScale();
                this.translateX += (currentCenterX - this.initialCenterX) / renderScale;
                this.translateY += (currentCenterY - this.initialCenterY) / renderScale;
                this.initialCenterX = currentCenterX;
                this.initialCenterY = currentCenterY;

                this.applyTransform();
                return;
            }

            if (e.touches.length === 1) {
                this.touchEndX = e.touches[0].clientX;
                this.touchEndY = e.touches[0].clientY;

                const moveX = this.touchEndX - this.touchStartX;
                const moveY = this.touchEndY - this.touchStartY;
                const deltaX = Math.abs(moveX);
                const deltaY = Math.abs(moveY);

                if (!this.touchStartedOnInteractive) {
                    if (deltaX > 4 || deltaY > 4) {
                        e.preventDefault();
                        this.setTransformTransition('none');
                        const renderScale = this.getRenderScale();
                        const limits = this.getPanLimits();
                        const nextX = this.initX + moveX / renderScale;
                        const nextY = this.initY + moveY / renderScale;
                        const clampedX = this.clampPanValue(nextX, limits.maxX);
                        const clampedY = this.clampPanValue(nextY, limits.maxY);

                        this.translateX = clampedX;
                        this.translateY = clampedY;
                        this.applyTransform();

                        const movedImage = Math.abs(clampedX - this.initX) > TOUCH_EDGE_EPSILON
                            || Math.abs(clampedY - this.initY) > TOUCH_EDGE_EPSILON;
                        const blockedHorizontally = limits.maxX <= TOUCH_EDGE_EPSILON
                            || Math.abs(nextX - clampedX) > TOUCH_EDGE_EPSILON;

                        this.touchDidMoveImage = movedImage;
                        this.isTouchSwiping = deltaX > 10 || deltaY > 10;
                        this.touchEdgePageStep = 0;
                        if (deltaX > deltaY && deltaX > SWIPE_THRESHOLD && blockedHorizontally) {
                            this.touchEdgePageStep = (moveX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                        }
                    }
                    return;
                }

                if (deltaX > 10 || deltaY > 10) {
                    this.isTouchSwiping = true;
                    if (deltaX > deltaY) {
                        e.preventDefault();
                    }
                }
            }
        }

        handleTouchEnd(e) {
            if (this.isSelectingScreenshot) return;
            if (e.type === 'touchcancel') {
                this.clearPendingTap();
                this.isTwoFingerGesturing = false;
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                this.twoFingerTapCandidate = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                const isTwoFingerTap = this.twoFingerTapCandidate
                    && Date.now() - this.twoFingerTapStartTime < 300;
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
                if (this.scale <= 1 + TOUCH_ZOOM_EPSILON) {
                    this.touchPanLocked = false;
                }
                if (isTwoFingerTap) {
                    const now = Date.now();
                    const isDoubleTwoFingerTap = now - this.lastTwoFingerTapTime < 320
                        && Math.abs(this.twoFingerTapCenterX - this.lastTwoFingerTapCenterX) < 40
                        && Math.abs(this.twoFingerTapCenterY - this.lastTwoFingerTapCenterY) < 40;

                    if (isDoubleTwoFingerTap) {
                        this.lastTwoFingerTapTime = 0;
                        this.lastTwoFingerTapCenterX = 0;
                        this.lastTwoFingerTapCenterY = 0;
                        this.resetTransform();
                    } else {
                        this.lastTwoFingerTapTime = now;
                        this.lastTwoFingerTapCenterX = this.twoFingerTapCenterX;
                        this.lastTwoFingerTapCenterY = this.twoFingerTapCenterY;
                    }
                }
                return;
            }

            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const threshold = SWIPE_THRESHOLD;
            const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && Date.now() - this.touchStartTime < 300;

            if (this.touchEdgePageStep && Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
                const step = this.touchEdgePageStep;
                this.touchEdgePageStep = 0;
                this.touchDidMoveImage = false;
                this.isTouchSwiping = false;
                this.turnPage(null, step);
                return;
            }

            if (this.touchDidMoveImage) {
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                this.touchEdgePageStep = 0;
                return;
            }

            if (isTap) {
                if (!this.touchStartedOnInteractive) {
                    e.preventDefault();
                    this.handleSingleFingerTap(this.touchEndX, this.touchEndY);
                }
                this.isTouchSwiping = false;
                return;
            }

            this.clearPendingTap();
            if (!this.isTouchSwiping || (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold)) {
                return;
            }

            if (Math.abs(deltaX) > threshold) {
                const dir = (deltaX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                this.turnPage(null, dir);
            }

            this.isTouchSwiping = false;
            this.touchEdgePageStep = 0;
        }

        // 5. 核心渲染逻辑（处理动画切换）
        render(animate = true, step = 0) {
            const renderIndex = this.currentIndex;
            const transitionToken = ++this.pageFlipToken;
            animations.runTransition({
                animate,
                imgContainer: this.el.imgContainer,
                animationMode: this.animationMode,
                step,
                isRightToLeft: this.isRightToLeft,
                lastStep: this.lastStep,
                renderIndex,
                getCurrentIndex: () => this.currentIndex,
                transitionToken,
                getTransitionToken: () => this.pageFlipToken,
                getTransform: () => this.getTransformStyle(),
                getShiftedTransform: (screenTranslateX) => this.getTransformStyle(screenTranslateX),
                loadImages: (index, mode, direction) => { void this.loadImages(index, mode, direction); }
            });
        }

        // 6. 智能图片加载逻辑（决定单双页）
        async loadImages(renderIndex, animationMode = animations.IMMEDIATE_RENDER_MODE, transitionDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            this.resetPageInteractionState();

            animations.resetImageContainer(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform(),
                () => this.getTransformStyle(),
                (screenTranslateX) => this.getTransformStyle(screenTranslateX)
            );

            const result = await readerPageGroups.loadVisibleImages({
                currentIndex: this.currentIndex,
                imgList: this.imgList,
                viewMode: this.viewMode,
                loadImage: (src) => this.loadImage(src),
                isWideImage: (img) => this.isWideImage(img)
            });
            if (!result || renderIndex !== this.currentIndex) return;

            this.commitImages(result.images, animationMode, result.preloadStart, transitionDirection);
        }

        resetPageInteractionState() {
            this.scale = 1;
            this.fitScale = 1;
            this.contentNaturalWidth = 0;
            this.contentNaturalHeight = 0;
            this.translateX = 0;
            this.translateY = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.touchEdgePageStep = 0;
            this.lastTapTime = 0;
            this.clearPendingTap();
        }

        loadImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        isWideImage(img) {
            return readerPageGroups.isWideImage(img, this.rotation);
        }

        commitImages(images, animationMode, preloadStart, transitionDirection = 0) {
            const isFull = images.length === 1;
            const displaySizes = this.isSharpRenderMode()
                ? this.getSharpDisplaySizes(images, isFull)
                : [];
            images.forEach((img, index) => {
                this.setupImg(img, isFull, displaySizes[index]);
                this.el.imgContainer.appendChild(img);
            });
            this.updateFitScale(images);
            this.updatePageInfo(images.length);
            animations.finishRender(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform(),
                () => this.getTransformStyle(),
                (screenTranslateX) => this.getTransformStyle(screenTranslateX)
            );
            this.preloadImages(preloadStart);
        }

        // 辅助：设置图片样式
        setupImg(img, isFull, displaySize = null) {
            const rotated = this.rotation === 90 || this.rotation === 270;
            img.className = isFull ? 'comic-img-full' : 'comic-img-half';
            img.dataset.rotated = rotated ? 'true' : 'false';
            img.style.objectFit = 'contain';
            img.style.transformOrigin = 'center center';
            img.style.imageRendering = 'auto';

            if (this.isSharpRenderMode()) {
                const effectiveSize = displaySize || this.getEffectiveImageSize(img);
                const effectiveWidth = Math.max(1, Math.round(effectiveSize.width || 1));
                const effectiveHeight = Math.max(1, Math.round(effectiveSize.height || 1));
                img.dataset.displayWidth = String(effectiveWidth);
                img.dataset.displayHeight = String(effectiveHeight);
                img.style.width = `${rotated ? effectiveHeight : effectiveWidth}px`;
                img.style.height = `${rotated ? effectiveWidth : effectiveHeight}px`;
                img.style.maxWidth = 'none';
                img.style.maxHeight = 'none';
            } else {
                delete img.dataset.displayWidth;
                delete img.dataset.displayHeight;
                img.style.width = '';
                img.style.height = '';
                img.style.maxWidth = rotated ? '100vh' : (isFull ? '100%' : '50%');
                img.style.maxHeight = rotated ? (isFull ? '100vw' : '50vw') : '100%';
            }

            img.style.transform = this.rotation ? `rotate(${this.rotation}deg)` : '';
        }

        // 辅助：完成渲染并触发

        // 翻页相关方法

        async turnPage(e, step) {
            e?.stopPropagation?.();
            const direction = Math.sign(step);
            if (!this.canTurnPage(direction)) return;
            const requestIndex = this.currentIndex;
            const nextIndex = direction < 0
                ? await this.getPreviousPageGroupIndex()
                : this.getNextPageGroupIndex(step);
            if (requestIndex !== this.currentIndex) return;
            if (nextIndex < 0 || nextIndex >= this.imgList.length || nextIndex === this.currentIndex) return;
            const actualStep = nextIndex - this.currentIndex;
            this.currentIndex = nextIndex;
            this.render(true, actualStep);
        }

        offsetPage(e, step) {
            e?.stopPropagation?.();
            const idx = this.currentIndex + step;
            if (idx >= 0 && idx < this.imgList.length) {
                this.currentIndex = idx;
                this.render(true, step);
            }
        }

        showPageInput() {
            if (!this.el.pageInfo || this.el.pageInfo.classList.contains('is-editing')) return;
            this.el.pageInfo.classList.add('is-editing');
            this.el.pageInput.value = '';
            this.el.pageRange.textContent = ` / ${this.imgList.length}`;
            window.setTimeout(() => this.el.pageInput.focus(), 0);
        }

        hidePageInput() {
            if (!this.el.pageInfo) return;
            this.el.pageInfo.classList.remove('is-editing');
            this.updatePageInfo(this.activePageCount);
        }

        jumpToPageFromInput() {
            if (!this.el.pageInfo?.classList.contains('is-editing')) return;
            const raw = this.el.pageInput?.value?.trim() || '';
            const total = this.imgList.length;
            const page = parseInt(raw, 10);
            if (!raw || !Number.isInteger(page) || String(page) !== raw || page < 1 || page > total) {
                if (raw) this.showReaderMessage(`\u8bf7\u8f93\u5165 1-${total} \u4e4b\u95f4\u7684\u6709\u6548\u6570\u5b57`, true);
                this.hidePageInput();
                return;
            }
            if (page === this.currentIndex + 1) {
                this.hidePageInput();
                return;
            }
            const step = page - 1 - this.currentIndex;
            this.el.pageInfo.classList.remove('is-editing');
            this.currentIndex = page - 1;
            this.render(true, step);
        }

        canGoForward(step) {
            const newIndex = this.currentIndex + step;
            return newIndex >= 0 && newIndex < this.imgList.length;
        }

        getNextPageGroupIndex(step) {
            return readerPageGroups.getNextIndex({
                currentIndex: this.currentIndex,
                total: this.imgList.length,
                step
            });
        }

        async getPreviousPageGroupIndex() {
            return readerPageGroups.getPreviousIndex({
                currentIndex: this.currentIndex,
                viewMode: this.viewMode,
                loadImage: (index) => this.loadImage(this.imgList[index]),
                isWideImage: (img) => this.isWideImage(img)
            });
        }

        canTurnPage(direction) {
            if (direction > 0) return this.currentIndex + this.activePageCount < this.imgList.length;
            if (direction < 0) return this.currentIndex > 0;
            return false;
        }

        updatePageInfo(step) {
            this.activePageCount = step;
            this.lastStep = step;
            const total = this.imgList.length;
            this.el.pageDisplay.textContent = step === 1
                ? `${this.currentIndex + 1} / ${total}`
                : `${this.currentIndex + 1}-${this.currentIndex + step} / ${total}`;
            this.el.pageInput.value = '';
            this.el.pageInput.max = String(total);
            this.el.pageRange.textContent = '';
        }

        preloadImages(start, count = PRELOAD_COUNT) {
            for (let i = start; i < start + count && i < this.imgList.length; i++) {
                new Image().src = this.imgList[i];
            }
        }

        updateDirection() {
            if (this.el.imgContainer) this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
        }

        // 全局事件处理函数

        handleFullscreenChange() {
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        handleKeyDown(e) {
            if (this.isSelectingScreenshot) {
                if (e.key === 'Escape') this.cancelScreenshotSelection(true);
                if (e.key === 'Enter') void this.saveSelectionScreenshot();
                return;
            }
            if (e.key === 'Escape' && this.isSettingsPanelVisible()) {
                this.hideSettingsPanel();
                return;
            }
            if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') this.el.leftBtn.click();
            else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') this.el.rightBtn.click();
            else if (e.key.toLowerCase() === 's') this.startScreenshotSelection();
            else if (e.key === 'Escape') this.close();
        }

        // 清理并关闭
        close() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.clearPendingTap();
            this.pageFlipToken += 1;
            this.cancelScreenshotSelection(false, false);
            this.hideSettingsPanel();

            if (this.eventBag) {
                this.eventBag.cleanup();
                this.eventBag = null;
            }

            if (this.el.reader) {
                this.el.reader.remove();
                this.el = {};
            }

            // 显示收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = '';
        }
    }


    // ============ 入口函数 ============
    // 检查 URL 是否匹配漫画模式
    function shouldInitComicReader() {
        return bilibiliDom.isComicReaderPage();
    }

    Toolbox.reader = {
        BiliComicReader,
        shouldInitComicReader
    };
})();

// ===== content-page-info.js =====
// Bilibili Toolbox - page information extraction
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;

    function extractUserNameFromMeta() {
        const title = document.title || '';
        const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const profileSuffixPattern = '(?:\\u7684)?\\u4e2a\\u4eba(?:\\u52a8\\u6001|\\u7a7a\\u95f4|\\u4e3b\\u9875)';

        return (
            title.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || keywords.match(new RegExp(`^(.+?)${profileSuffixPattern}`))?.[1]
            || description.match(/\u54d4\u54e9\u54d4\u54e9(.+?)\u7684\u4e2a\u4eba(?:\u52a8\u6001|\u7a7a\u95f4)/)?.[1]
            || description.match(/\u5173\u6ce8(.+?)\u8d26\u53f7/)?.[1]
            || ''
        ).trim();
    }

    function normalizeImageUrl(src) {
        if (!src || typeof src !== 'string') return '';
        return bilibiliDom.normalizeProtocolUrl(src);
    }

    function getArticleAuthorInfo(url = window.location.href) {
        if (!bilibiliDom.isArticlePage(url)) return null;

        const link = bilibiliDom.getArticleAuthorLink();
        const uid = bilibiliDom.extractUidFromAuthorLink(link)
            || document.querySelector('[data-mid]')?.getAttribute('data-mid');
        if (!uid) return null;

        const scope = link?.closest?.(bilibiliDom.AUTHOR_SCOPE_SELECTOR)
            || document;
        const uname = link?.textContent?.trim()
            || scope.querySelector('.user-name, .name, [class*="name"]')?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = normalizeImageUrl(
            scope.querySelector('img')?.getAttribute('data-src')
            || scope.querySelector('img')?.getAttribute('src')
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || ''
        );

        return { type: Shared.USER_TYPE, uid, uname, face };
    }

    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = Shared.$('.read-list-title, .title, h1', '\u4e13\u680f');
            const cover = Shared.$src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: Shared.READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const opusUid = bilibiliDom.getSpaceOpusUid(url);
        if (opusUid) return { type: Shared.OPUS_TYPE, uid: opusUid };

        const uid = Shared.extractUidFromUrl(url);
        if (uid) return { type: Shared.USER_TYPE, uid };

        const articleAuthor = getArticleAuthorInfo(url);
        if (articleAuthor) return articleAuthor;

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector(bilibiliDom.USER_NAME_SELECTOR)?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: Shared.USER_TYPE, uid: pageUid } : null;
    }

    function extractPageInfoForFavorite(pageInfo) {
        if (!pageInfo) return null;

        if (Shared.isReadlistFavorite(pageInfo)) {
            return {
                type: Shared.READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '\u4e13\u680f',
                cover: pageInfo.cover || Shared.FALLBACK_IMAGE
            };
        }

        const uname = pageInfo.uname
            || document.querySelector(bilibiliDom.USER_NAME_SELECTOR)?.textContent?.trim()
            || document.querySelector('[data-mid]')?.getAttribute('data-uname')
            || extractUserNameFromMeta()
            || '\u7528\u6237';
        const face = pageInfo.face
            || document.querySelector(bilibiliDom.USER_FACE_SELECTOR)?.src
            || document.querySelector('[data-mid]')?.getAttribute('data-face')
            || '';

        return {
            type: pageInfo.type === Shared.OPUS_TYPE ? Shared.OPUS_TYPE : Shared.USER_TYPE,
            uid: pageInfo.uid,
            uname,
            face
        };
    }

    Toolbox.pageInfo = {
        getCurrentPageInfo,
        extractPageInfoForFavorite,
        getCurrentFavoriteData: () => extractPageInfoForFavorite(getCurrentPageInfo())
    };
})();

// ===== content-url.js =====
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

// ===== dynamic-filter.js =====
// Bilibili Toolbox - dynamic feed filtering
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
    const FORWARD_DYNAMIC_SELECTOR = [
        '.bili-dyn-content__forw__desc',
        '.bili-dyn-content__orig.reference',
        '.bili-dyn-content__orig__author',
        '.dyn-orig-author',
        '[class*="opus-module-top__forward"]',
        '[class*="module-top-forward"]'
    ].join(', ');
    const FORWARD_ACTION_SELECTORS = [
        '.module-author__action',
        '.bili-dyn-item__action',
        '.bili-dyn-title__action',
        '.bili-dyn-author__action',
        '.opus-module-author__action'
    ];
    const FILTER_ACTIVE_CLASS = 'bilibili-toolbox-dynamic-filter-active';
    const FILTER_READY_CLASS = 'bilibili-toolbox-dynamic-filter-ready';
    const HIDDEN_FORWARD_CLASS = 'bilibili-toolbox-hide-forward-dynamic';
    const FORWARD_TYPE_PATTERN = /(^|[\s:_-])(forward|repost)([\s:_-]|$)/i;
    const FORWARD_TEXT_MARKERS = [
        '\u8f6c\u53d1\u4e86\u52a8\u6001',
        '\u8f6c\u53d1\u4e86\u89c6\u9891',
        '\u8f6c\u53d1\u4e86\u4e13\u680f',
        '\u8f6c\u53d1\u4e86'
    ];
    const DYNAMIC_FILTER_BURST_DELAYS = [0, 80, 250, 600, 1200, 2500];

    let dataProvider = () => Shared.createDefaultData();
    let onRenderSettings = () => {};
    let onSyncFloatButton = () => {};
    let dynamicFilterObserver = null;
    let debounceFilterTimer = 0;
    let dynamicFilterBurstTimers = [];
    let keywordFilterEnabled = false;
    let keywordFilterText = '';

    function setDataProvider(provider) {
        if (typeof provider === 'function') dataProvider = provider;
    }

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
    }

    function isSpaceDynamicPage(url = window.location.href) {
        return bilibiliDom.isSpaceDynamicPage(url);
    }

    function getDynamicCardElements() {
        const candidates = bilibiliDom.getDynamicCards();
        const set = new Set(candidates);
        return candidates.filter(card => {
            for (let parent = card.parentElement; parent; parent = parent.parentElement) {
                if (set.has(parent)) return false;
            }
            return true;
        });
    }

    function hasForwardActionText(card) {
        return FORWARD_ACTION_SELECTORS.some(selector => {
            const text = card.querySelector(selector)?.textContent?.replace(/\s+/g, '') || '';
            return FORWARD_TEXT_MARKERS.some(marker => text.includes(marker));
        });
    }

    function isForwardDynamic(card) {
        const attrText = [
            card.dataset.type,
            card.dataset.dynType,
            card.getAttribute('data-type'),
            card.getAttribute('data-dyn-type')
        ].filter(Boolean).join(' ');

        return FORWARD_TYPE_PATTERN.test(attrText)
            || hasForwardActionText(card)
            || Boolean(card.querySelector(FORWARD_DYNAMIC_SELECTOR));
    }

    function normalizeDynamicText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getDynamicCardText(card) {
        return normalizeDynamicText(card.innerText || card.textContent || '');
    }

    function getKeywordFilterState() {
        const displayText = String(keywordFilterText || '').replace(/\s+/g, ' ').trim();
        const normalizedText = normalizeDynamicText(keywordFilterText);
        return {
            enabled: keywordFilterEnabled,
            text: keywordFilterText,
            displayText,
            normalizedText,
            hasKeyword: Boolean(normalizedText),
            isActive: keywordFilterEnabled && Boolean(normalizedText)
        };
    }

    function setKeywordFilterState(state = {}) {
        if (Object.prototype.hasOwnProperty.call(state, 'enabled')) {
            keywordFilterEnabled = Boolean(state.enabled);
        }
        if (typeof state.text === 'string') {
            keywordFilterText = state.text;
        }
        onRenderSettings();
        onSyncFloatButton();
        scheduleDynamicFilterApply(0);
    }

    function setDynamicFilterActive(active) {
        document.documentElement?.classList.toggle(FILTER_ACTIVE_CLASS, Boolean(active));
    }

    function clearDynamicFilterCardClasses() {
        document.querySelectorAll(`.${HIDDEN_FORWARD_CLASS}, .${FILTER_READY_CLASS}`).forEach(card => {
            card.classList.remove(HIDDEN_FORWARD_CLASS, FILTER_READY_CLASS);
        });
    }

    function markDynamicCardReady(card) {
        card.classList.add(FILTER_READY_CLASS);
        card.querySelectorAll(bilibiliDom.DYNAMIC_CARD_SELECTOR).forEach(child => child.classList.add(FILTER_READY_CLASS));
    }

    function applyDynamicFilter() {
        const dynamicPage = isSpaceDynamicPage();
        const shouldHideForward = dynamicPage
            && Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics, false));
        const keywordState = getKeywordFilterState();
        const shouldFilterKeyword = dynamicPage && keywordState.isActive;

        if (!shouldHideForward && !shouldFilterKeyword) {
            setDynamicFilterActive(false);
            clearDynamicFilterCardClasses();
            return;
        }

        setDynamicFilterActive(true);
        getDynamicCardElements().forEach(card => {
            const hideForward = shouldHideForward && isForwardDynamic(card);
            const hideKeyword = shouldFilterKeyword && !getDynamicCardText(card).includes(keywordState.normalizedText);
            card.classList.toggle(HIDDEN_FORWARD_CLASS, hideForward || hideKeyword);
            markDynamicCardReady(card);
        });
    }

    function runDynamicFilterNow() {
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = 0;
        applyDynamicFilter();
    }

    function scheduleDynamicFilterApply(delay = 80) {
        if (delay <= 0) {
            runDynamicFilterNow();
            return;
        }

        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        debounceFilterTimer = window.setTimeout(() => {
            debounceFilterTimer = 0;
            applyDynamicFilter();
        }, delay);
    }

    function clearDynamicFilterBurstTimers() {
        dynamicFilterBurstTimers.forEach(timer => clearTimeout(timer));
        dynamicFilterBurstTimers = [];
    }

    function scheduleDynamicFilterBurst() {
        clearDynamicFilterBurstTimers();
        DYNAMIC_FILTER_BURST_DELAYS.forEach(delay => {
            const timer = window.setTimeout(() => {
                dynamicFilterBurstTimers = dynamicFilterBurstTimers.filter(item => item !== timer);
                runDynamicFilterNow();
            }, delay);
            dynamicFilterBurstTimers.push(timer);
        });
    }

    function syncDynamicFilter() {
        onRenderSettings();
        onSyncFloatButton();
        scheduleDynamicFilterBurst();
    }

    function initDynamicFilter(options = {}) {
        setDataProvider(options.getData);
        onRenderSettings = options.renderSettings || onRenderSettings;
        onSyncFloatButton = options.syncFloatButton || onSyncFloatButton;

        if (!dynamicFilterObserver && document.body) {
            dynamicFilterObserver = new MutationObserver((mutations) => {
                if (mutations.some(mutation => mutation.addedNodes.length
                    || mutation.removedNodes.length)) {
                    scheduleDynamicFilterApply();
                }
            });
            dynamicFilterObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        scheduleDynamicFilterBurst();
    }

    function destroyDynamicFilter() {
        if (dynamicFilterObserver) dynamicFilterObserver.disconnect();
        if (debounceFilterTimer) clearTimeout(debounceFilterTimer);
        clearDynamicFilterBurstTimers();
        dynamicFilterObserver = null;
        debounceFilterTimer = 0;
        keywordFilterEnabled = false;
        keywordFilterText = '';
        onRenderSettings = () => {};
        onSyncFloatButton = () => {};
        setDynamicFilterActive(false);
        clearDynamicFilterCardClasses();
    }

    Toolbox.dynamicFilter = {
        init: initDynamicFilter,
        destroy: destroyDynamicFilter,
        sync: syncDynamicFilter,
        apply: applyDynamicFilter,
        scheduleApply: scheduleDynamicFilterApply,
        isSpaceDynamicPage,
        getSettingValue,
        setKeywordFilterState,
        getKeywordFilterState,
        normalizeDynamicText,
        isForwardDynamic,
        FILTER_ACTIVE_CLASS,
        FILTER_READY_CLASS,
        HIDDEN_FORWARD_CLASS
    };
})();

// ===== space-opus-tabs.js =====
// Bilibili Toolbox - space opus tab selection
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.bilibiliDom) throw new Error('BilibiliToolbox: bilibili-dom-adapter.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const bilibiliDom = Toolbox.bilibiliDom;
    const OPUS_TAB_TEXT = '\u4e13\u680f';
    const BURST_DELAYS = [0, 80, 250, 600, 1200, 2500, 5000];
    const INTENT_TTL_MS = 10000;

    let tabObserver = null;
    let tabTimers = [];
    let urlChangeHandler = null;
    let intentUid = '';
    let intentUntil = 0;
    let selectedForIntent = false;

    function isSpaceOpusUploadPage(url = window.location.href) {
        return bilibiliDom.isSpaceOpusUploadPage(url);
    }

    function getSpaceOpusUid(url = window.location.href) {
        return bilibiliDom.getSpaceOpusUid(url);
    }

    function consumeOpusTabIntent() {
        if (!isSpaceOpusUploadPage()) return false;

        const url = new URL(window.location.href);
        if (url.searchParams.get(Shared.OPUS_TAB_INTENT_PARAM) !== '1') return false;

        intentUid = getSpaceOpusUid(url.toString());
        intentUntil = Date.now() + INTENT_TTL_MS;
        selectedForIntent = false;
        url.searchParams.delete(Shared.OPUS_TAB_INTENT_PARAM);
        history.replaceState(history.state, document.title, url.toString());
        return Boolean(intentUid);
    }

    function normalizeTabText(tab) {
        return String(tab?.textContent || '').replace(/\s+/g, '').trim();
    }

    function isActiveTab(tab) {
        return Boolean(tab?.classList?.contains?.('active') || /\bactive\b/.test(tab?.className || ''));
    }

    function getContentTabs() {
        return bilibiliDom.getContentTabs();
    }

    function findOpusTab() {
        return getContentTabs().find(tab => normalizeTabText(tab) === OPUS_TAB_TEXT) || null;
    }

    function hasFreshIntentForCurrentUrl() {
        const uid = getSpaceOpusUid();
        const hasFreshIntent = intentUid
            && uid === intentUid
            && Date.now() <= intentUntil;

        if (!hasFreshIntent) {
            if (uid !== intentUid || Date.now() > intentUntil) intentUid = '';
            return false;
        }

        return !selectedForIntent;
    }

    function clickTab(tab) {
        if (!tab) return;
        tab.click();
    }

    function selectOpusTabNow() {
        if (!intentUid) consumeOpusTabIntent();
        if (!hasFreshIntentForCurrentUrl()) return false;

        const tab = findOpusTab();
        if (!tab) return false;

        if (isActiveTab(tab)) {
            selectedForIntent = true;
            return true;
        }

        clickTab(tab);
        if (!isActiveTab(tab)) return false;
        selectedForIntent = true;
        return true;
    }

    function clearTabTimers() {
        tabTimers.forEach(timer => clearTimeout(timer));
        tabTimers = [];
    }

    function scheduleSelect(delay = 80) {
        const timer = window.setTimeout(() => {
            tabTimers = tabTimers.filter(item => item !== timer);
            selectOpusTabNow();
        }, delay);
        tabTimers.push(timer);
    }

    function scheduleSelectBurst() {
        clearTabTimers();
        consumeOpusTabIntent();
        if (!hasFreshIntentForCurrentUrl()) return;
        BURST_DELAYS.forEach(scheduleSelect);
    }

    function initSpaceOpusTabs() {
        if (tabObserver) return;

        tabObserver = new MutationObserver(() => {
            if (hasFreshIntentForCurrentUrl()) scheduleSelect();
        });
        tabObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });

        urlChangeHandler = scheduleSelectBurst;
        window.addEventListener(Toolbox.url?.URL_CHANGE_EVENT || 'bilibili-toolbox:urlchange', urlChangeHandler);
        scheduleSelectBurst();
    }

    function destroySpaceOpusTabs() {
        if (tabObserver) tabObserver.disconnect();
        if (urlChangeHandler) {
            window.removeEventListener(Toolbox.url?.URL_CHANGE_EVENT || 'bilibili-toolbox:urlchange', urlChangeHandler);
        }
        clearTabTimers();
        tabObserver = null;
        urlChangeHandler = null;
        intentUid = '';
        intentUntil = 0;
        selectedForIntent = false;
    }

    Toolbox.spaceOpusTabs = {
        init: initSpaceOpusTabs,
        destroy: destroySpaceOpusTabs,
        selectNow: selectOpusTabNow,
        isSpaceOpusUploadPage
    };
})();

// ===== favorites-text-dialog.js =====
// Bilibili Toolbox - favorites import/export text dialog
(function() {
    'use strict';

    if (!window.BilibiliToolbox) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    let activeClose = null;

    function closeFavoritesTextDialog() {
        if (activeClose) {
            activeClose();
            return;
        }
        document.querySelector('#bilibili-toolbox-export-dialog .bilibili-toolbox-export-close')?.click();
    }

    function showFavoritesTextDialog({ title, text = '', readOnly = false, clipboardAction = '', confirmText = '', onConfirm = null }) {
        closeFavoritesTextDialog();
        const dialog = document.createElement('div');
        dialog.id = 'bilibili-toolbox-export-dialog';
        dialog.className = 'bilibili-toolbox-export-dialog';
        dialog.innerHTML = `
            <div class="bilibili-toolbox-export-document" role="dialog" aria-modal="true" aria-labelledby="bilibili-toolbox-export-title">
                <div class="bilibili-toolbox-export-header">
                    <span id="bilibili-toolbox-export-title"></span>
                    <button class="bilibili-toolbox-export-close" type="button" aria-label="\u5173\u95ed">&times;</button>
                </div>
                <textarea class="bilibili-toolbox-export-text" aria-label="\u6536\u85cf\u6587\u672c" spellcheck="false"></textarea>
                ${clipboardAction || onConfirm ? `
                    <div class="bilibili-toolbox-export-footer">
                        <span class="bilibili-toolbox-export-status" role="status"></span>
                        <div class="bilibili-toolbox-export-actions">
                            ${clipboardAction ? '<button class="bilibili-toolbox-export-clipboard" type="button"></button>' : ''}
                            ${onConfirm ? '<button class="bilibili-toolbox-export-confirm" type="button"></button>' : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        const handleKeyDown = event => {
            if (event.key === 'Escape') closeDialog();
        };
        const closeDialog = () => {
            document.removeEventListener('keydown', handleKeyDown);
            dialog.remove();
            if (activeClose === closeDialog) activeClose = null;
        };
        activeClose = closeDialog;

        dialog.querySelector('.bilibili-toolbox-export-close').addEventListener('click', closeDialog);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) closeDialog();
        });
        document.addEventListener('keydown', handleKeyDown);
        document.body.appendChild(dialog);

        dialog.querySelector('#bilibili-toolbox-export-title').textContent = title;
        const textarea = dialog.querySelector('.bilibili-toolbox-export-text');
        textarea.value = text;
        textarea.readOnly = readOnly;
        const status = dialog.querySelector('.bilibili-toolbox-export-status');
        const setStatus = (message, isError = false) => {
            if (!status) return;
            status.textContent = message;
            status.classList.toggle('is-error', isError);
        };

        if (clipboardAction) {
            const clipboard = dialog.querySelector('.bilibili-toolbox-export-clipboard');
            clipboard.textContent = clipboardAction === 'copy' ? '\u4e00\u952e\u590d\u5236' : '\u4e00\u952e\u7c98\u8d34';
            clipboard.addEventListener('click', async () => {
                try {
                    if (clipboardAction === 'copy') {
                        await navigator.clipboard.writeText(textarea.value);
                        setStatus('\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f');
                    } else {
                        textarea.value = await navigator.clipboard.readText();
                        textarea.focus();
                        setStatus('\u5df2\u7c98\u8d34\u526a\u8d34\u677f\u5185\u5bb9');
                    }
                } catch (_) {
                    textarea.focus();
                    if (clipboardAction === 'copy') textarea.select();
                    setStatus(
                        clipboardAction === 'copy'
                            ? '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+C \u624b\u52a8\u590d\u5236'
                            : '\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u6309 Ctrl+V \u624b\u52a8\u7c98\u8d34',
                        true
                    );
                }
            });
        }

        if (onConfirm) {
            const confirm = dialog.querySelector('.bilibili-toolbox-export-confirm');
            confirm.textContent = confirmText;
            confirm.addEventListener('click', () => onConfirm({ text: textarea.value, close: closeDialog, setStatus }));
        }

        textarea.focus();
        if (readOnly) textarea.select();
        return dialog;
    }

    Toolbox.favoritesTextDialog = {
        show: showFavoritesTextDialog,
        close: closeFavoritesTextDialog
    };
})();

// ===== settings-popover-ui.js =====
// Bilibili Toolbox - settings popover UI
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.favoritesTextDialog) throw new Error('BilibiliToolbox: favorites-text-dialog.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;

    let dataProvider = () => Shared.createDefaultData();
    let storage = null;
    let favoritesService = null;
    let dynamicFilter = null;
    let eventBag = null;
    let showMessage = () => {};

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
    }

    function hidePanel(id) {
        document.getElementById(id)?.classList.remove('show');
    }

    function exportFavorites() {
        const data = Shared.normalizeToolboxData(dataProvider());
        if (!data.favorites.length) {
            showMessage('\u6682\u65e0\u53ef\u5bfc\u51fa\u7684\u6536\u85cf', true);
            return;
        }

        Toolbox.favoritesTextDialog.show({
            title: '\u5bfc\u51fa\u6536\u85cf\u6587\u672c',
            text: favoritesService.createExportText(data),
            readOnly: true,
            clipboardAction: 'copy'
        });
    }

    function importFavorites() {
        Toolbox.favoritesTextDialog.show({
            title: '\u5bfc\u5165\u6536\u85cf\u6587\u672c',
            clipboardAction: 'paste',
            confirmText: '\u5bfc\u5165',
            onConfirm: async ({ text, close, setStatus }) => {
                const imported = favoritesService.normalizeImportedFavorites(text);

                if (!imported?.length) {
                    setStatus('\u672a\u8bfb\u53d6\u5230\u6709\u6548\u6536\u85cf', true);
                    return;
                }

                try {
                    const result = await favoritesService.importFavorites(imported);
                    close();
                    showMessage(`\u5bfc\u5165 ${result.added} \u6761\uff0c\u66f4\u65b0 ${result.updated} \u6761\uff0c\u8df3\u8fc7 ${result.skipped} \u6761`);
                } catch (_) {
                    setStatus('\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', true);
                }
            }
        });
    }

    function createSettingsPopoverPanel() {
        if (document.getElementById('bilibili-toolbox-settings-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-toolbox-settings-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>\u5de5\u5177\u7bb1\u8bbe\u7f6e</span></div>
            <div class="bilibili-toolbox-control-content">
                <section class="bilibili-toolbox-control-section">
                    <div class="bilibili-toolbox-section-title">\u6536\u85cf\u663e\u793a</div>
                    <div class="bilibili-toolbox-control-row bilibili-toolbox-control-row-stack">
                        <span class="bilibili-toolbox-control-copy">
                            <span class="bilibili-toolbox-control-title">\u6bcf\u884c\u6536\u85cf\u4e2a\u6570</span>
                            <span class="bilibili-toolbox-control-desc">\u8c03\u6574\u6536\u85cf\u9762\u677f\u7684\u6392\u5217\u5bc6\u5ea6</span>
                        </span>
                        <span class="bilibili-toolbox-segmented bilibili-toolbox-favorite-columns" role="group" aria-label="\u6bcf\u884c\u6536\u85cf\u4e2a\u6570">
                            ${Shared.FAVORITE_COLUMN_OPTIONS.map(columns => `<button type="button" data-columns="${columns}">${columns}</button>`).join('')}
                        </span>
                    </div>
                </section>
                <section class="bilibili-toolbox-control-section">
                    <div class="bilibili-toolbox-section-title">\u52a8\u6001\u8fc7\u6ee4\uff08\u5728\u52a8\u6001\u9875\u751f\u6548\uff09</div>
                    <label class="bilibili-toolbox-control-row">
                        <span class="bilibili-toolbox-control-copy">
                            <span class="bilibili-toolbox-control-title">\u9690\u85cf\u8f6c\u53d1\u52a8\u6001</span>
                        </span>
                        <span class="bilibili-toolbox-switch">
                            <input type="checkbox" class="bilibili-toolbox-forward-toggle">
                            <span class="bilibili-toolbox-switch-slider"></span>
                        </span>
                    </label>
                    <label class="bilibili-toolbox-control-row">
                        <span class="bilibili-toolbox-control-copy">
                            <span class="bilibili-toolbox-control-title">\u5173\u952e\u8bcd\u7b5b\u9009\u52a8\u6001</span>
                            <span class="bilibili-toolbox-control-desc">\u4ec5\u663e\u793a\u5305\u542b\u8f93\u5165\u5185\u5bb9\u7684\u52a8\u6001</span>
                        </span>
                        <span class="bilibili-toolbox-switch">
                            <input type="checkbox" class="bilibili-toolbox-keyword-toggle">
                            <span class="bilibili-toolbox-switch-slider"></span>
                        </span>
                    </label>
                    <input type="text" class="bilibili-toolbox-keyword-input" placeholder="\u8f93\u5165\u8981\u5305\u542b\u7684\u5185\u5bb9" autocomplete="off" spellcheck="false">
                </section>
            </div>
            <div class="bilibili-toolbox-control-actions">
                <button class="bilibili-toolbox-export-btn">\u5bfc\u51fa\u6536\u85cf</button>
                <button class="bilibili-toolbox-import-btn">\u5bfc\u5165\u6536\u85cf</button>
            </div>
        `;
        document.body.appendChild(panel);

        eventBag.on(panel.querySelector('.bilibili-toolbox-forward-toggle'), 'change', async (event) => {
            await storage.setSetting(TOOLBOX_SETTINGS.hideForwardDynamics, Boolean(event.target.checked));
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-toggle'), 'change', (event) => {
            const enabled = Boolean(event.target.checked);
            dynamicFilter.setKeywordFilterState({ enabled });
            renderSettingsPopoverPanel();
            if (enabled) {
                window.setTimeout(() => panel.querySelector('.bilibili-toolbox-keyword-input')?.focus(), 0);
            }
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-keyword-input'), 'input', (event) => {
            dynamicFilter.setKeywordFilterState({ text: event.target.value });
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-favorite-columns'), 'click', async (event) => {
            const button = event.target.closest('button[data-columns]');
            if (!button) return;
            const columns = Shared.normalizeFavoriteColumns(button.dataset.columns);
            await storage.setSetting(TOOLBOX_SETTINGS.favoriteColumns, columns);
        });
        eventBag.on(panel.querySelector('.bilibili-toolbox-export-btn'), 'click', exportFavorites);
        eventBag.on(panel.querySelector('.bilibili-toolbox-import-btn'), 'click', importFavorites);

        renderSettingsPopoverPanel();
    }

    function isSettingsPopoverPanelVisible() {
        return document.getElementById('bilibili-toolbox-settings-panel')?.classList.contains('show');
    }

    function getSettingsPopoverPanel() {
        return document.getElementById('bilibili-toolbox-settings-panel');
    }

    function renderSettingsPopoverPanel() {
        const panel = document.getElementById('bilibili-toolbox-settings-panel');
        if (!panel || !dynamicFilter) return;

        const forwardEnabled = Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics));
        const favoriteColumns = getSettingValue(
            TOOLBOX_SETTINGS.favoriteColumns,
            Shared.DEFAULT_FAVORITE_COLUMNS
        );
        const keywordState = dynamicFilter.getKeywordFilterState();
        const keywordInput = panel.querySelector('.bilibili-toolbox-keyword-input');
        panel.querySelector('.bilibili-toolbox-forward-toggle').checked = forwardEnabled;
        panel.querySelector('.bilibili-toolbox-keyword-toggle').checked = keywordState.enabled;
        panel.querySelectorAll('.bilibili-toolbox-favorite-columns button').forEach(button => {
            const active = Number(button.dataset.columns) === favoriteColumns;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        if (keywordInput.value !== keywordState.text) keywordInput.value = keywordState.text;
    }

    function showSettingsPopoverPanel() {
        createSettingsPopoverPanel();
        hidePanel('bilibili-fav-panel');
        document.getElementById('bilibili-toolbox-settings-panel')?.classList.add('show');
        renderSettingsPopoverPanel();
    }

    function toggleSettingsPopoverPanel() {
        if (isSettingsPopoverPanelVisible()) {
            hidePanel('bilibili-toolbox-settings-panel');
            return;
        }
        showSettingsPopoverPanel();
    }

    function initSettingsPopoverUi(options) {
        storage = options.storage;
        favoritesService = options.favoritesService;
        dynamicFilter = options.dynamicFilter;
        eventBag = options.eventBag;
        showMessage = options.showMessage || showMessage;
        dataProvider = typeof options.getData === 'function' ? options.getData : dataProvider;
        createSettingsPopoverPanel();
    }

    function destroySettingsPopoverUi() {
        Toolbox.favoritesTextDialog.close();
        document.getElementById('bilibili-toolbox-settings-panel')?.remove();
        storage = null;
        favoritesService = null;
        dynamicFilter = null;
        eventBag = null;
        showMessage = () => {};
        dataProvider = () => Shared.createDefaultData();
    }

    Toolbox.settingsPopoverUi = {
        init: initSettingsPopoverUi,
        render: renderSettingsPopoverPanel,
        toggle: toggleSettingsPopoverPanel,
        hide: () => hidePanel('bilibili-toolbox-settings-panel'),
        isVisible: isSettingsPopoverPanelVisible,
        contains: target => Boolean(getSettingsPopoverPanel()?.contains(target)),
        destroy: destroySettingsPopoverUi
    };
})();

// ===== favorites-ui.js =====
// Bilibili Toolbox - favorites floating entry and list UI
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;

    let dataProvider = () => Shared.createDefaultData();
    let favoritesService = null;
    let pageInfo = null;
    let dynamicFilter = null;
    let settingsUi = null;
    let eventBag = null;
    let isTouchDevice = false;
    let useHoverInteractions = false;
    let hoverState = { button: false, panel: false };
    let hideTimers = { panel: 0, videoButton: 0 };
    let messageTimer = 0;

    function setDataProvider(provider) {
        if (typeof provider === 'function') dataProvider = provider;
    }

    function getSettingValue(key, fallback = false) {
        return Shared.getSettingValue(dataProvider(), key, fallback);
    }

    function hidePanel(id) {
        document.getElementById(id)?.classList.remove('show');
    }

    function isPanelVisible(id) {
        return document.getElementById(id)?.classList.contains('show') || false;
    }

    function isSettingsPanelVisible() {
        return Boolean(settingsUi?.isVisible?.());
    }

    function settingsPanelContains(target) {
        return Boolean(settingsUi?.contains?.(target));
    }

    function hideSettingsPanel() {
        settingsUi?.hide?.();
    }

    function toggleSettingsPanel() {
        settingsUi?.toggle?.();
    }

    function clearHideTimer(name) {
        if (hideTimers[name]) clearTimeout(hideTimers[name]);
        hideTimers[name] = 0;
    }

    function isHoveringFavoritesArea() {
        return hoverState.button || hoverState.panel;
    }

    function setHoverState(area, active) {
        hoverState[area] = Boolean(active);
    }

    function resetHoverState() {
        hoverState = { button: false, panel: false };
    }

    function sortFavorites(favorites) {
        return [...favorites].sort((a, b) => Shared.isReadlistFavorite(a) - Shared.isReadlistFavorite(b));
    }

    function syncFloatBtnHideState() {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn) return;
        const keywordEnabled = Boolean(dynamicFilter?.getKeywordFilterState?.().enabled);
        btn.classList.toggle(
            'dynamic-filter-active',
            Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics)) || keywordEnabled
        );
    }

    function showMessage(text, isError = false, duration = 2200) {
        const msgEl = document.querySelector('.bilibili-fav-msg');
        if (!msgEl) return;
        if (messageTimer) clearTimeout(messageTimer);
        Object.assign(msgEl.style, { color: isError ? '#ff4757' : '#4cd964', display: 'block' });
        msgEl.textContent = text;
        messageTimer = setTimeout(() => { msgEl.style.display = 'none'; messageTimer = 0; }, duration);
    }

    function isVideoLikePage(url = window.location.href) {
        return /\/\/(?:www\.)?bilibili\.com\/video\//i.test(url)
            || /\/\/(?:www\.)?bilibili\.com\/bangumi\//i.test(url);
    }

    function supportsHoverPointer() {
        const matchMedia = window.matchMedia;
        if (typeof matchMedia !== 'function') return !isTouchDevice;
        return Boolean(matchMedia('(any-hover: hover)').matches || matchMedia('(hover: hover)').matches);
    }

    function setVideoFavoriteButtonVisible(visible) {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn?.classList.contains('bilibili-fav-video-hidden')) return;
        btn.classList.toggle('bilibili-fav-video-visible', Boolean(visible));
    }

    function scheduleHideVideoFavoriteButton() {
        clearHideTimer('videoButton');
        hideTimers.videoButton = setTimeout(() => {
            hideTimers.videoButton = 0;
            if (!isHoveringFavoritesArea() && !isPanelVisible('bilibili-fav-panel') && !isSettingsPanelVisible()) {
                setVideoFavoriteButtonVisible(false);
            }
        }, 220);
    }

    function scheduleHideFavoritesPanel() {
        clearHideTimer('panel');
        hideTimers.panel = setTimeout(() => {
            hideTimers.panel = 0;
            if (!isHoveringFavoritesArea()) {
                hidePanel('bilibili-fav-panel');
                scheduleHideVideoFavoriteButton();
            }
        }, 200);
    }

    function enterFavoritesArea(area) {
        setHoverState(area, true);
        clearHideTimer('panel');
        clearHideTimer('videoButton');
        setVideoFavoriteButtonVisible(true);
        showFavoritesPanel();
    }

    function leaveFavoritesArea(area) {
        setHoverState(area, false);
        scheduleHideFavoritesPanel();
    }

    function openToolboxSettings() {
        resetHoverState();
        clearHideTimer('panel');
        setVideoFavoriteButtonVisible(true);
        hidePanel('bilibili-fav-panel');
        toggleSettingsPanel();
        scheduleHideVideoFavoriteButton();
    }

    function updateVideoFavoriteButtonMode() {
        const btn = document.getElementById('bilibili-fav-float-btn');
        if (!btn) return;

        const shouldHideOnVideoPage = isVideoLikePage() && useHoverInteractions;
        btn.classList.toggle('bilibili-fav-video-hidden', shouldHideOnVideoPage);
        if (shouldHideOnVideoPage) {
            setVideoFavoriteButtonVisible(false);
            return;
        }

        btn.classList.remove('bilibili-fav-video-visible');
    }

    function createFloatingButton() {
        if (document.getElementById('bilibili-fav-float-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'bilibili-fav-float-btn';
        btn.innerHTML = '&#11088;';
        btn.title = useHoverInteractions
            ? '\u60ac\u505c\u67e5\u770b\u6536\u85cf\uff0c\u53f3\u952e\u6253\u5f00\u8bbe\u7f6e'
            : '\u70b9\u51fb\u6253\u5f00\u6536\u85cf\uff0c\u957f\u6309\u6253\u5f00\u8bbe\u7f6e';
        if (!useHoverInteractions && isTouchDevice) btn.classList.add('bilibili-fav-touch');
        document.body.appendChild(btn);

        let touchLongPressHandled = false;
        updateVideoFavoriteButtonMode();

        if (!useHoverInteractions) {
            let longPressTimer = 0;
            const clearLongPress = () => {
                if (longPressTimer) clearTimeout(longPressTimer);
                longPressTimer = 0;
            };
            eventBag.on(btn, 'touchstart', () => {
                touchLongPressHandled = false;
                clearLongPress();
                longPressTimer = setTimeout(() => {
                    touchLongPressHandled = true;
                    hidePanel('bilibili-fav-panel');
                    toggleSettingsPanel();
                }, 520);
            }, { passive: true });
            eventBag.on(btn, 'touchmove', clearLongPress, { passive: true });
            eventBag.on(btn, 'touchend', clearLongPress, { passive: true });
            eventBag.on(btn, 'touchcancel', clearLongPress, { passive: true });
            eventBag.on(btn, 'click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (touchLongPressHandled) {
                    touchLongPressHandled = false;
                    return;
                }
                if (document.getElementById('bilibili-fav-panel')?.classList.contains('show')) {
                    hidePanel('bilibili-fav-panel');
                } else {
                    showFavoritesPanel();
                }
            });
            eventBag.add(clearLongPress);
        } else {
            eventBag.on(btn, 'mouseenter', () => enterFavoritesArea('button'));
            eventBag.on(btn, 'mouseleave', () => leaveFavoritesArea('button'));
        }
        eventBag.on(btn, 'contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (touchLongPressHandled) {
                touchLongPressHandled = false;
                return;
            }
            openToolboxSettings();
        });

        syncFloatBtnHideState();
    }

    function createFavoritesPanel() {
        const existing = document.getElementById('bilibili-fav-panel');
        if (existing) return existing;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header">
                <span>\u6211\u7684\u6536\u85cf</span>
                <span class="bilibili-fav-header-actions">
                    <button class="bilibili-fav-control-btn">\u8bbe\u7f6e</button>
                    <button class="bilibili-fav-add-btn">+ \u6dfb\u52a0\u5f53\u524d</button>
                </span>
            </div>
            <div class="bilibili-fav-content"><div class="bilibili-fav-list"></div></div>
            <div class="bilibili-fav-msg"></div>
        `;
        document.body.appendChild(panel);

        if (useHoverInteractions) {
            eventBag.on(panel, 'mouseenter', () => {
                setHoverState('panel', true);
                clearHideTimer('panel');
                clearHideTimer('videoButton');
            });
            eventBag.on(panel, 'mouseleave', () => {
                leaveFavoritesArea('panel');
            });
        }
        eventBag.on(panel, 'click', (event) => {
            const del = event.target.closest('.bilibili-fav-delete');
            if (!del) return;
            event.preventDefault();
            event.stopPropagation();
            deleteFavorite(del.dataset.key);
        });
        eventBag.on(panel.querySelector('.bilibili-fav-add-btn'), 'click', addCurrent);
        eventBag.on(panel.querySelector('.bilibili-fav-control-btn'), 'click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openToolboxSettings();
        });
        return panel;
    }

    function showFavoritesPanel() {
        const wasCreated = !document.getElementById('bilibili-fav-panel');
        const panel = createFavoritesPanel();
        hideSettingsPanel();
        renderFavoriteList();
        if (wasCreated) panel.getBoundingClientRect?.();
        panel.classList.add('show');
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = Shared.isReadlistFavorite(item);
        const isOpus = Shared.isOpusFavorite(item);
        return {
            isReadlist,
            key: Shared.escapeHtml(Shared.getFavoriteKey(item)),
            link: Shared.escapeHtml(Shared.getFavoriteLink(item)),
            img: Shared.escapeHtml(Shared.getFavoriteImage(item)) || Shared.FALLBACK_IMAGE,
            imgClass: isReadlist
                ? 'bilibili-fav-avatar cover'
                : `bilibili-fav-avatar${isOpus ? ' square' : ''}`,
            name: Shared.escapeHtml(Shared.getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;

        const columns = getSettingValue(
            TOOLBOX_SETTINGS.favoriteColumns,
            Shared.DEFAULT_FAVORITE_COLUMNS
        );
        document.getElementById('bilibili-fav-panel')?.style.setProperty('--bilibili-fav-columns', String(columns));

        const favorites = dataProvider().favorites || [];
        if (favorites.length === 0) {
            listEl.innerHTML = '<div class="bilibili-fav-empty">\u6682\u65e0\u6536\u85cf<br>\u70b9\u51fb\u4e0b\u65b9\u6309\u94ae\u6dfb\u52a0</div>';
            return;
        }

        listEl.innerHTML = sortFavorites(favorites).map(item => {
            const { isReadlist, key, link, img, imgClass, name } = getFavoriteDisplayData(item);
            return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="bilibili-fav-item-link">
                <div class="bilibili-fav-item"${isReadlist ? ' data-readlist="true"' : ''}>
                    <div class="bilibili-fav-item-info"><img src="${img}" alt="${name}" class="${imgClass}"><span class="bilibili-fav-name">${name}</span></div>
                    <button class="bilibili-fav-delete" data-key="${key}">&times;</button>
                </div>
            </a>`;
        }).join('');
    }

    async function addCurrent() {
        const item = pageInfo.getCurrentFavoriteData();
        if (!item) return showMessage('\u65e0\u6cd5\u83b7\u53d6\u5f53\u524d\u9875\u9762\u4fe1\u606f', true);

        const result = await favoritesService.addFavorite(item);
        if (!result.added) {
            return showMessage(
                result.reason === 'duplicate' ? '\u5df2\u5728\u6536\u85cf\u5217\u8868' : '\u65e0\u6cd5\u83b7\u53d6\u5f53\u524d\u9875\u9762\u4fe1\u606f',
                true
            );
        }

        showMessage('\u6dfb\u52a0\u6210\u529f');
    }

    async function deleteFavorite(favoriteKey) {
        await favoritesService.removeFavorite(favoriteKey);
    }

    function handleDocumentPointerDown(event) {
        const favoritesPanel = document.getElementById('bilibili-fav-panel');
        const button = document.getElementById('bilibili-fav-float-btn');
        const favoritesVisible = favoritesPanel?.classList.contains('show');
        const controlsVisible = isSettingsPanelVisible();
        if (!favoritesVisible && !controlsVisible) return;
        if (favoritesPanel?.contains(event.target) || settingsPanelContains(event.target) || button?.contains(event.target)) return;
        if (!useHoverInteractions) hidePanel('bilibili-fav-panel');
        hideSettingsPanel();
        scheduleHideVideoFavoriteButton();
    }

    function handleDocumentKeyDown(event) {
        if (event.key !== 'Escape') return;
        hideSettingsPanel();
        scheduleHideVideoFavoriteButton();
    }

    function syncFavoritesUi() {
        renderFavoriteList();
        syncFloatBtnHideState();
    }

    function initFavoritesUi(options) {
        favoritesService = options.favoritesService;
        pageInfo = options.pageInfo;
        dynamicFilter = options.dynamicFilter;
        settingsUi = options.settingsUi || null;
        setDataProvider(options.getData);
        eventBag = Toolbox.createEventBag();
        isTouchDevice = Shared.isTouchLikeDevice();
        useHoverInteractions = supportsHoverPointer();

        createFloatingButton();
        eventBag.on(document, 'mousedown', handleDocumentPointerDown, true);
        eventBag.on(document, 'pointerdown', handleDocumentPointerDown, true);
        eventBag.on(document, 'touchstart', handleDocumentPointerDown, true);
        eventBag.on(document, 'keydown', handleDocumentKeyDown);
        syncFavoritesUi();
    }

    function destroyFavoritesUi() {
        if (messageTimer) clearTimeout(messageTimer);
        clearHideTimer('panel');
        clearHideTimer('videoButton');
        if (eventBag) eventBag.cleanup();
        eventBag = null;
        settingsUi = null;
        resetHoverState();
        messageTimer = 0;
        document.getElementById('bilibili-fav-panel')?.remove();
        document.getElementById('bilibili-fav-float-btn')?.remove();
        document.getElementById('bilibili-fav-hover-zone')?.remove();
    }

    Toolbox.favoritesUi = {
        init: initFavoritesUi,
        destroy: destroyFavoritesUi,
        sync: syncFavoritesUi,
        renderFavoriteList,
        showMessage,
        syncFloatButton: syncFloatBtnHideState,
        syncPageMode: updateVideoFavoriteButtonMode
    };
})();

// ===== content.js =====
// Bilibili Toolbox - content entrypoint
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.storage) throw new Error('BilibiliToolbox: storage-service.js not loaded');
    if (!window.BilibiliToolbox?.favorites) throw new Error('BilibiliToolbox: favorites service not loaded');
    if (!window.BilibiliToolbox?.comicImages) throw new Error('BilibiliToolbox: comic-reader-images.js not loaded');
    if (!window.BilibiliToolbox?.animations) throw new Error('BilibiliToolbox: animations.js not loaded');
    if (!window.BilibiliToolbox?.reader) throw new Error('BilibiliToolbox: comic-reader.js not loaded');
    if (!window.BilibiliToolbox?.pageInfo) throw new Error('BilibiliToolbox: content-page-info.js not loaded');
    if (!window.BilibiliToolbox?.url) throw new Error('BilibiliToolbox: content-url.js not loaded');
    if (!window.BilibiliToolbox?.dynamicFilter) throw new Error('BilibiliToolbox: dynamic-filter.js not loaded');
    if (!window.BilibiliToolbox?.spaceOpusTabs) throw new Error('BilibiliToolbox: space-opus-tabs.js not loaded');
    if (!window.BilibiliToolbox?.settingsPopoverUi) throw new Error('BilibiliToolbox: settings-popover-ui.js not loaded');
    if (!window.BilibiliToolbox?.favoritesUi) throw new Error('BilibiliToolbox: favorites-ui.js not loaded');

    const Toolbox = window.BilibiliToolbox;
    const storage = Toolbox.storage;
    let toolboxData = window.Shared.createDefaultData();
    let unsubscribeStorage = null;
    let settingsEventBag = null;
    let initialized = false;
    let messageHandler = null;
    let readerInstance = null;

    function syncAll(data) {
        toolboxData = window.Shared.normalizeToolboxData(data);
        Toolbox.favoritesUi.sync();
        Toolbox.dynamicFilter.sync();
    }

    function setupMessageBridge() {
        if (messageHandler) return;
        messageHandler = (request, sender, sendResponse) => {
            if (request.type === 'GET_PAGE_FAVORITE_DATA') {
                sendResponse(Toolbox.pageInfo.getCurrentFavoriteData());
            }
        };
        chrome.runtime.onMessage.addListener(messageHandler);
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        toolboxData = await storage.init();
        unsubscribeStorage = storage.onChanged(syncAll);

        Toolbox.url.init();
        Toolbox.spaceOpusTabs.init();
        settingsEventBag = Toolbox.createEventBag();
        Toolbox.dynamicFilter.init({
            getData: () => toolboxData,
            renderSettings: () => Toolbox.settingsPopoverUi.render(),
            syncFloatButton: () => Toolbox.favoritesUi.syncFloatButton()
        });
        Toolbox.settingsPopoverUi.init({
            storage,
            favoritesService: Toolbox.favorites,
            dynamicFilter: Toolbox.dynamicFilter,
            getData: () => toolboxData,
            showMessage: (...args) => Toolbox.favoritesUi.showMessage(...args),
            eventBag: settingsEventBag
        });
        Toolbox.favoritesUi.init({
            favoritesService: Toolbox.favorites,
            getData: () => toolboxData,
            pageInfo: Toolbox.pageInfo,
            dynamicFilter: Toolbox.dynamicFilter,
            settingsUi: Toolbox.settingsPopoverUi
        });
        window.addEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        setupMessageBridge();

        if (Toolbox.reader.shouldInitComicReader()) {
            readerInstance = new Toolbox.reader.BiliComicReader();
            readerInstance.init();
        }
    }

    function handleUrlChange() {
        Toolbox.dynamicFilter.sync();
        Toolbox.favoritesUi.syncPageMode();
    }

    function destroy() {
        if (unsubscribeStorage) unsubscribeStorage();
        unsubscribeStorage = null;
        if (messageHandler) chrome.runtime.onMessage.removeListener(messageHandler);
        messageHandler = null;
        window.removeEventListener(Toolbox.url.URL_CHANGE_EVENT, handleUrlChange);
        readerInstance?.close?.();
        readerInstance = null;
        Toolbox.spaceOpusTabs.destroy();
        Toolbox.settingsPopoverUi.destroy();
        if (settingsEventBag) settingsEventBag.cleanup();
        settingsEventBag = null;
        Toolbox.favoritesUi.destroy();
        Toolbox.dynamicFilter.destroy();
        Toolbox.url.destroy();
        storage.destroy();
        initialized = false;
    }

    Toolbox.contentApp = {
        init,
        destroy,
        getData: () => toolboxData
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
