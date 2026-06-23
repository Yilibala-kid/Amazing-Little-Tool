// Bilibili Toolbox - favorites floating entry and list UI
(function() {
    'use strict';

    if (!window.Shared) throw new Error('BilibiliToolbox: shared.js not loaded');
    if (!window.BilibiliToolbox?.dynamicControlsUi) throw new Error('BilibiliToolbox: dynamic-controls-ui.js not loaded');

    const Shared = window.Shared;
    const Toolbox = window.BilibiliToolbox;
    const TOOLBOX_SETTINGS = Shared.TOOLBOX_SETTINGS;
    const dynamicControlsUi = Toolbox.dynamicControlsUi;

    let dataProvider = () => Shared.createDefaultData();
    let storage = null;
    let favoritesService = null;
    let pageInfo = null;
    let dynamicFilter = null;
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
        const data = Shared.normalizeToolboxData(dataProvider());
        return Object.prototype.hasOwnProperty.call(data.settings, key)
            ? data.settings[key]
            : fallback;
    }

    function hidePanel(id) {
        document.getElementById(id)?.classList.remove('show');
    }

    function isPanelVisible(id) {
        return document.getElementById(id)?.classList.contains('show') || false;
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
        const keywordActive = Boolean(dynamicFilter?.getKeywordFilterState?.().isActive);
        btn.classList.toggle(
            'hide-forward-active',
            Boolean(getSettingValue(TOOLBOX_SETTINGS.hideForwardDynamics)) || keywordActive
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
            if (!isHoveringFavoritesArea() && !isPanelVisible('bilibili-fav-panel') && !isPanelVisible('bilibili-fav-controls-panel')) {
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

    function openDynamicControls() {
        resetHoverState();
        clearHideTimer('panel');
        setVideoFavoriteButtonVisible(true);
        hidePanel('bilibili-fav-panel');
        dynamicControlsUi.toggle();
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
            ? '\u60ac\u505c\u67e5\u770b\u6536\u85cf\uff0c\u53f3\u952e\u6253\u5f00\u52a8\u6001\u8fc7\u6ee4'
            : '\u70b9\u51fb\u6253\u5f00\u6536\u85cf\uff0c\u957f\u6309\u6253\u5f00\u52a8\u6001\u63a7\u5236';
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
                    dynamicControlsUi.toggle();
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
            openDynamicControls();
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
                    <button class="bilibili-fav-control-btn">\u63a7\u5236</button>
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
            openDynamicControls();
        });
        return panel;
    }

    function showFavoritesPanel() {
        const wasCreated = !document.getElementById('bilibili-fav-panel');
        const panel = createFavoritesPanel();
        hidePanel('bilibili-fav-controls-panel');
        renderFavoriteList();
        if (wasCreated) panel.getBoundingClientRect?.();
        panel.classList.add('show');
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = Shared.isReadlistFavorite(item);
        return {
            isReadlist,
            key: Shared.escapeHtml(Shared.getFavoriteKey(item)),
            link: Shared.escapeHtml(Shared.getFavoriteLink(item)),
            img: Shared.escapeHtml(Shared.getFavoriteImage(item)) || Shared.FALLBACK_IMAGE,
            imgClass: isReadlist ? 'bilibili-fav-avatar cover' : 'bilibili-fav-avatar',
            name: Shared.escapeHtml(Shared.getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;

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
        const controlsPanel = document.getElementById('bilibili-fav-controls-panel');
        const button = document.getElementById('bilibili-fav-float-btn');
        const favoritesVisible = favoritesPanel?.classList.contains('show');
        const controlsVisible = controlsPanel?.classList.contains('show');
        if (!favoritesVisible && !controlsVisible) return;
        if (favoritesPanel?.contains(event.target) || controlsPanel?.contains(event.target) || button?.contains(event.target)) return;
        if (!useHoverInteractions) hidePanel('bilibili-fav-panel');
        hidePanel('bilibili-fav-controls-panel');
        scheduleHideVideoFavoriteButton();
    }

    function handleDocumentKeyDown(event) {
        if (event.key !== 'Escape') return;
        hidePanel('bilibili-fav-controls-panel');
        scheduleHideVideoFavoriteButton();
    }

    function syncFavoritesUi() {
        renderFavoriteList();
        dynamicControlsUi.render();
        syncFloatBtnHideState();
    }

    function initFavoritesUi(options) {
        storage = options.storage;
        favoritesService = options.favoritesService;
        pageInfo = options.pageInfo;
        dynamicFilter = options.dynamicFilter;
        setDataProvider(options.getData);
        eventBag = Toolbox.createEventBag();
        isTouchDevice = Shared.isTouchLikeDevice();
        useHoverInteractions = supportsHoverPointer();

        dynamicFilter.init({
            getData: () => dataProvider(),
            renderControls: () => dynamicControlsUi.render(),
            syncFloatButton: syncFloatBtnHideState
        });
        dynamicControlsUi.init({
            storage,
            favoritesService,
            dynamicFilter,
            getData: () => dataProvider(),
            showMessage,
            renderFavoriteList,
            syncFloatButton: syncFloatBtnHideState,
            eventBag
        });
        createFloatingButton();
        eventBag.on(document, 'mousedown', handleDocumentPointerDown, true);
        eventBag.on(document, 'pointerdown', handleDocumentPointerDown, true);
        eventBag.on(document, 'touchstart', handleDocumentPointerDown, true);
        eventBag.on(document, 'keydown', handleDocumentKeyDown);
        eventBag.on(window, Toolbox.url.URL_CHANGE_EVENT, () => {
            dynamicFilter.sync();
            updateVideoFavoriteButtonMode();
        });
        syncFavoritesUi();
    }

    function destroyFavoritesUi() {
        if (messageTimer) clearTimeout(messageTimer);
        clearHideTimer('panel');
        clearHideTimer('videoButton');
        dynamicControlsUi.destroy();
        if (eventBag) eventBag.cleanup();
        eventBag = null;
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
        renderFavoriteList
    };
})();
