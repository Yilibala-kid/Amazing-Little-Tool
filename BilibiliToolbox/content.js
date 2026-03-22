// Bilibili Toolbox - Content Script
// 整合了极光漫画+ 收藏夹功能（本地版 - 无外部API调用）
(function() {
    'use strict';

    // ============ 常量定义 ============
    const VIEW_MODES = ['auto', 'single', 'double'];

    // 漫画模式常量
    const COMIC_URL_PATTERNS = [
        'bilibili.com/read/',
        'bilibili.com/opus/',
        't.bilibili.com/'
    ];
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 3;
    const SCALE_STEP = 0.1;
    const CONTROLS_HIDE_DELAY = 2000;
    const SWIPE_THRESHOLD = 50;
    const PRELOAD_COUNT = 4;
    const MOBILE_BREAKPOINT = 768;
    const TOUCH_TAP_ZONE_RATIO = 0.3;
    const READER_BACKGROUND = '#0a0a0a';
    const animations = window.BiliAnimations;

    // 存储相关常量
    const STORAGE_KEY = 'bilibiliToolboxData';
    const OLD_STORAGE_KEY = 'bilibiliFavorites';
    const USER_TYPE = 'user';
    const READLIST_TYPE = 'readlist';
    const FALLBACK_IMAGE = 'https://www.bilibili.com/favicon.ico';

    // 存储收藏列表（支持用户和专栏）
    let toolboxData = {
        favorites: [],
        settings: {}
    };

    function normalizeObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function normalizeFavoriteList(favorites) {
        return Array.isArray(favorites)
            ? favorites.filter(item => item && typeof item === 'object')
            : [];
    }

    function normalizeToolboxData(data) {
        const next = normalizeObject(data);
        return {
            favorites: normalizeFavoriteList(next.favorites),
            settings: normalizeObject(next.settings)
        };
    }

    function getFavoriteType(item) {
        return item?.type || USER_TYPE;
    }

    function isReadlistFavorite(item) {
        return getFavoriteType(item) === READLIST_TYPE;
    }

    function getFavoriteKey(item) {
        if (!item) return '';
        const type = isReadlistFavorite(item) ? READLIST_TYPE : USER_TYPE;
        const value = isReadlistFavorite(item) ? item.id : item.uid;
        return value ? `${type}:${value}` : '';
    }

    function getFavoriteName(item) {
        return isReadlistFavorite(item)
            ? (item?.title || '专栏')
            : (item?.uname || '用户');
    }

    function getFavoriteImage(item) {
        return isReadlistFavorite(item)
            ? (item?.cover || FALLBACK_IMAGE)
            : (item?.face || FALLBACK_IMAGE);
    }

    function getFavoriteLink(item) {
        if (!item) return '#';
        return isReadlistFavorite(item)
            ? `https://www.bilibili.com/read/readlist/rl${item.id}`
            : `https://space.bilibili.com/${item.uid}/dynamic`;
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

    const UID_URL_PATTERNS = [
        [/space\.bilibili\.com\/(\d+)/, () => true],
        [/t\.bilibili\.com\/(\d+)/, uid => uid.length > 6]
    ];

    function extractUidFromUrl(url) {
        if (typeof url !== 'string') return null;
        for (const [pattern, isValid] of UID_URL_PATTERNS) {
            const match = url.match(pattern);
            if (match && isValid(match[1])) return match[1];
        }
        return null;
    }

    const $ = (selector, fallback = '') => document.querySelector(selector)?.textContent.trim() || fallback;
    const $src = (selector) => document.querySelector(selector)?.src || '';

    function sortFavorites(favorites) {
        return [...favorites].sort((a, b) => isReadlistFavorite(a) - isReadlistFavorite(b));
    }

    // ============ 数据迁移函数 - 从旧版本迁移数据 ============
    function migrateDataIfNeeded(callback) {
        chrome.storage.local.get([OLD_STORAGE_KEY, STORAGE_KEY], (result) => {
            const oldFavorites = result[OLD_STORAGE_KEY] || [];
            if (oldFavorites.length === 0) {
                const existing = normalizeToolboxData(result[STORAGE_KEY]);
                toolboxData = existing;
                return callback?.();
            }

            const existing = normalizeToolboxData(result[STORAGE_KEY]);
            const merged = [...existing.favorites];
            const existingKeys = new Set(merged.map(getFavoriteKey));

            oldFavorites.forEach(item => {
                const key = getFavoriteKey(item);
                if (key && !existingKeys.has(key)) {
                    existingKeys.add(key);
                    merged.push(item);
                }
            });

            toolboxData = normalizeToolboxData({
                ...existing,
                favorites: merged
            });

            chrome.storage.local.set({ [STORAGE_KEY]: toolboxData }, () => {
                chrome.storage.local.remove([OLD_STORAGE_KEY]);
                callback?.();
            });
        });
    }

    // 保存数据
    function saveData(callback) {
        chrome.storage.local.set({ [STORAGE_KEY]: toolboxData }, callback);
    }

    function setFavorites(favorites) {
        toolboxData.favorites = favorites;
        saveData();
        renderFavoriteList();
    }

    // ============ 收藏夹功能 ============
    let isHovering = false;

    // 创建悬浮按钮
    function createFloatingButton() {
        if (document.getElementById('bilibili-fav-float-btn')) return;

        const btn = document.createElement('div');
        btn.id = 'bilibili-fav-float-btn';
        btn.innerHTML = '&#11088;';
        btn.title = '暂停查看收藏夹';
        document.body.appendChild(btn);

        btn.addEventListener('mouseenter', () => { isHovering = true; showFavoritesPanel(); });
        btn.addEventListener('mouseleave', () => { isHovering = false; setTimeout(() => { if (!isHovering) hideFavoritesPanel(); }, 200); });
    }

    // 创建收藏夹面板
    function createFavoritesPanel() {
        if (document.getElementById('bilibili-fav-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bilibili-fav-panel';
        panel.innerHTML = `
            <div class="bilibili-fav-header"><span>我的收藏</span><button class="bilibili-fav-close">&times;</button></div>
            <div class="bilibili-fav-content"><div class="bilibili-fav-list"></div></div>
            <div class="bilibili-fav-msg"></div>
            <div class="bilibili-fav-footer"><button class="bilibili-fav-add-btn">+ 添加当前</button></div>
        `;

        document.body.appendChild(panel);

        panel.addEventListener('mouseenter', () => { isHovering = true; });
        panel.addEventListener('mouseleave', () => { isHovering = false; hideFavoritesPanel(); });
        panel.addEventListener('click', (e) => {
            const del = e.target.closest('.bilibili-fav-delete');
            if (del) { e.preventDefault(); e.stopPropagation(); deleteFavorite(del.dataset.key); }
        });

        panel.querySelector('.bilibili-fav-close').onclick = hideFavoritesPanel;
        panel.querySelector('.bilibili-fav-add-btn').onclick = addCurrent;

        renderFavoriteList();
    }

    function showFavoritesPanel() {
        let panel = document.getElementById('bilibili-fav-panel');
        if (!panel) { createFavoritesPanel(); panel = document.getElementById('bilibili-fav-panel'); }
        panel?.classList.add('show');
        loadFavorites();
    }

    function hideFavoritesPanel() {
        const panel = document.getElementById('bilibili-fav-panel');
        if (panel) panel.classList.remove('show');
    }

    function showMessage(text, isError = false) {
        const msgEl = document.querySelector('.bilibili-fav-msg');
        if (!msgEl) return;
        Object.assign(msgEl.style, { color: isError ? '#ff4757' : '#4cd964', display: 'block' });
        msgEl.textContent = text;
        setTimeout(() => { msgEl.style.display = 'none'; }, CONTROLS_HIDE_DELAY);
    }

    function loadFavorites() {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            toolboxData = normalizeToolboxData(result[STORAGE_KEY]);
            renderFavoriteList();
        });
    }

    function getFavoriteDisplayData(item) {
        const isReadlist = isReadlistFavorite(item);
        return {
            isReadlist,
            key: escapeHtml(getFavoriteKey(item)),
            link: escapeHtml(getFavoriteLink(item)),
            img: escapeHtml(getFavoriteImage(item)) || FALLBACK_IMAGE,
            imgClass: isReadlist ? 'bilibili-fav-avatar cover' : 'bilibili-fav-avatar',
            name: escapeHtml(getFavoriteName(item))
        };
    }

    function renderFavoriteList() {
        const listEl = document.querySelector('.bilibili-fav-list');
        if (!listEl) return;
        const favorites = toolboxData.favorites || [];
        if (favorites.length === 0) return listEl.innerHTML = '<div class="bilibili-fav-empty">暂无收藏<br>点击下方按钮添加</div>';

        listEl.innerHTML = sortFavorites(favorites).map(item => {
            const { isReadlist, key, link, img, imgClass, name } = getFavoriteDisplayData(item);
            return `<a href="${link}" target="_blank" class="bilibili-fav-item-link">
                <div class="bilibili-fav-item"${isReadlist ? ' data-readlist="true"' : ''}>
                    <div class="bilibili-fav-item-info"><img src="${img}" alt="${name}" class="${imgClass}"><span class="bilibili-fav-name">${name}</span></div>
                    <button class="bilibili-fav-delete" data-key="${key}">&times;</button>
                </div>
            </a>`;
        }).join('');
    }

    // 添加当前页面内容（用户或专栏）- 纯本地版本
    function addCurrent() {
        const pageInfo = getCurrentPageInfo();
        if (!pageInfo) return showMessage('无法获取当前页面信息', true);

        const favorites = toolboxData.favorites;
        const favoriteKey = getFavoriteKey(pageInfo);
        if (favorites.some(item => getFavoriteKey(item) === favoriteKey)) {
            return showMessage('该项已在收藏列表中', true);
        }

        // 从页面DOM提取信息（不上传，不调用API）
        const item = extractPageInfoForFavorite(pageInfo);
        setFavorites([...favorites, item]);
        showMessage('添加成功');
    }

    // 从页面提取收藏所需信息（纯本地，不请求API）
    function extractPageInfoForFavorite(pageInfo) {
        if (isReadlistFavorite(pageInfo)) {
            // 专栏：从页面提取标题和封面
            return {
                type: READLIST_TYPE,
                id: pageInfo.id,
                title: pageInfo.title || '专栏',
                cover: pageInfo.cover || FALLBACK_IMAGE
            };
        } else {
            // 用户：提取用户名和头像
            const uname = document.querySelector('.user-name, .user-name-shadow, .name')?.textContent?.trim()
                || document.querySelector('[data-mid]')?.getAttribute('data-uname')
                || '用户';
            const face = document.querySelector('.user-face img, .avatar img, [class*="face"] img')?.src
                || document.querySelector('[data-mid]')?.getAttribute('data-face')
                || '';

            return {
                type: USER_TYPE,
                uid: pageInfo.uid,
                uname: uname,
                face: face
            };
        }
    }

    // 获取当前页面信息
    function getCurrentPageInfo() {
        const url = window.location.href;
        const readlistMatch = url.match(/readlist\/rl(\d+)/);
        if (readlistMatch) {
            const title = $('.read-list-title, .title, h1', '专栏');
            const cover = $src('.read-list-cover img, .cover-img img, .banner-image img, [class*="cover"] img');
            return { type: READLIST_TYPE, id: readlistMatch[1], title, cover };
        }

        const uid = extractUidFromUrl(url);
        if (uid) return { type: USER_TYPE, uid };

        const pageUid = document.querySelector('[data-mid]')?.getAttribute('data-mid')
            || document.querySelector('.user-name, .user-name-shadow, .name')?.closest('a')?.href?.match(/space\.bilibili\.com\/(\d+)/)?.[1];

        return pageUid ? { type: USER_TYPE, uid: pageUid } : null;
    }

    function deleteFavorite(favoriteKey) {
        const favorites = toolboxData.favorites;
        const filtered = favorites.filter(item => getFavoriteKey(item) !== favoriteKey);
        if (filtered.length !== favorites.length) setFavorites(filtered);
    }

    function initFavorites() {
        createFloatingButton();
    }


    // ============ 漫画模式功能 ============

    class BiliComicReader {
        constructor() {
            // 状态管理
            this.imgList = [];
            this.currentIndex = 0;
            this.lastStep = 2;
            this.isRightToLeft = true;
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.hideTimer = null;
            this.messageTimer = null;
            this.viewMode = 'auto'; // 视图模式: auto(自动), single(单图), double(双图)
            this.rotation = 0; // 旋转角度 (0, 90, 180, 270)
            this.activePageCount = 1;
            this.controlsVisible = true;
            this.isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
            this.isCompactLayout = false;
            this.isSelectingScreenshot = false;
            this.isDraggingSelection = false;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.selectionWasControlsVisible = true;
            this.selectionPointerId = null;
            this.pageFlipToken = 0;

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

            // 双指缩放状态
            this.isTwoFingerGesturing = false;
            this.initialPinchDistance = 0;
            this.initialScale = 1;
            this.initialCenterX = 0;
            this.initialCenterY = 0;

            // DOM 元素引用
            this.el = {};

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
            this.handleResize = this.handleResize.bind(this);
        }

        // 1. 初始化入口按钮
        init() {
            const entryBtn = document.createElement('button');
            entryBtn.innerHTML = '&#128216;';
            entryBtn.style.cssText = this.isTouchDevice
                ? 'position:fixed;bottom:16px;right:16px;z-index:9999;padding:12px 16px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:20px;font-size:18px;box-shadow:0 4px 12px rgba(0,0,0,0.2)'
                : 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:10px 18px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:22px;font-size:20px;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

        // 2. 启动阅读器
        start() {
            const fileSet = new Set();
            this.imgList = [];

            const rawImages = document.querySelectorAll(`
                .opus-module-content img,
                .article-content img,
                .bili-rich-text img,
                .opus-read-content img
            `);

            rawImages.forEach(img => {
                // 1. 获取原始地址并截取后缀
                // 优先使用 src（通常是高画质），其次 data-src（可能是懒加载低画质）
                let rawSrc = img.getAttribute('src') || img.getAttribute('data-src') || '';
                if (!rawSrc || rawSrc.includes('base64')) return;

                let src = rawSrc.split('@')[0];
                if (src.startsWith('//')) src = 'https:' + src;
                if (!src.startsWith('http')) return;

                // 2. 排除干扰项
                const isNoise = img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover');
                const isEmoji = img.classList.contains('emoji') || src.includes('emote') || src.includes('emoji') || src.includes('garb');

                // 3. 最终去重核心：只取最后的图片文件名
                const fileName = src.split('/').pop();

                // 4. 判断逻辑更新
                if (!fileSet.has(fileName) && !isNoise && !isEmoji) {
                    fileSet.add(fileName);
                    this.imgList.push(src);
                }
            });

            // 5. 排序纠正保持不变
            this.imgList.sort((a, b) => {
                const getTop = (url) => {
                    const fn = url.split('/').pop();
                    const el = document.querySelector(`img[src*="${fn}"], img[data-src*="${fn}"]`);
                    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
                };
                return getTop(a) - getTop(b);
            });

            if (this.imgList.length === 0) return alert('未找到漫画图片');

            this.currentIndex = 0;
            this.lastStep = 2;
            this.isDragging = false;
            this.animationMode = animations.normalizeAnimationMode(this.animationMode);

            // 隐藏收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = 'none';

            this.createUI();
            this.bindEvents();
            this.render();
        }

        // 3. 创建 UI
        createUI() {
            const btnStyle = 'padding:8px 15px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:4px';
            const altBtnStyle = `${btnStyle};background:#444`;
            const createBtn = (text, title, style = btnStyle) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.title = title;
                btn.style.cssText = style;
                return btn;
            };

            this.el.reader = document.createElement('div');
            this.el.reader.id = 'comic-reader-overlay';
            this.el.reader.style.cssText = `position:fixed;inset:0;background:${READER_BACKGROUND};z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;touch-action:none;overscroll-behavior:none;perspective:2400px;isolation:isolate`;

            this.el.imgContainer = document.createElement('div');
            this.el.imgContainer.style.cssText = 'display:flex;width:100%;height:100%;align-items:center;justify-content:center;gap:5px;padding:0;margin:0;cursor:grab;touch-action:none;will-change:transform,opacity,filter';

            this.el.controls = document.createElement('div');
            this.el.controls.style.cssText = 'position:fixed;bottom:30px;right:30px;display:flex;flex-direction:column;gap:8px;background:rgba(30,30,30,0.9);padding:10px 15px;border-radius:8px;backdrop-filter:blur(10px);border:1px solid #444;color:#fff;z-index:10001;transition:opacity 0.5s;opacity:1';

            // 右上角设置控件（横向排列）
            this.el.settingsControls = document.createElement('div');
            this.el.settingsControls.style.cssText = 'position:fixed;top:30px;right:30px;display:flex;flex-direction:column;gap:8px;background:rgba(30,30,30,0.9);padding:10px 15px;border-radius:8px;backdrop-filter:blur(10px);border:1px solid #444;color:#fff;z-index:10001;transition:opacity 0.5s;opacity:1';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center';

            [
                ['rightBtn', '\u2192', '向右翻页', btnStyle],
                ['leftBtn', '\u2190', '向左翻页', btnStyle],
                ['offsetIncBtn', '<', '左移一页', altBtnStyle],
                ['offsetDecBtn', '>', '右移一页', altBtnStyle],
                ['directionBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['animationBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['viewModeBtn', '', '', `${altBtnStyle};font-weight:bold`],
                ['resetViewBtn', '重置', '重置视图', altBtnStyle],
                ['screenshotBtn', '截图', '拖动选择截图范围', altBtnStyle],
                ['fullScreenBtn', '', '', altBtnStyle],
                ['rotateBtn', '', '', altBtnStyle],
                ['closeBtn', '退出', '退出', `${btnStyle};background:#d33`]
            ].forEach(([key, text, title, style]) => {
                this.el[key] = createBtn(text, title, style);
            });

            this.el.pageInfo = document.createElement('span');
            this.el.pageInfo.style.cssText = 'font-size:14px;cursor:pointer;padding:0 8px';
            this.el.pageInfo.title = '点击跳转指定页码';

            this.el.toast = document.createElement('div');
            this.el.toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(30,30,30,0.92);color:#fff;font-size:13px;z-index:10004;pointer-events:none;opacity:0;transition:opacity 0.2s';

            this.el.selectionOverlay = document.createElement('div');
            this.el.selectionOverlay.style.cssText = 'position:fixed;inset:0;z-index:10003;display:none;cursor:crosshair;touch-action:none;background:rgba(10,10,10,0.01)';

            this.el.selectionHint = document.createElement('div');
            this.el.selectionHint.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(15,15,15,0.92);color:#fff;font-size:13px;pointer-events:none';
            this.el.selectionHint.textContent = '拖动选择截图范围，完成后点击保存';

            this.el.selectionToolbar = document.createElement('div');
            this.el.selectionToolbar.style.cssText = 'position:fixed;top:18px;right:18px;display:flex;gap:10px;align-items:center';

            this.el.selectionCancelBtn = document.createElement('button');
            this.el.selectionCancelBtn.type = 'button';
            this.el.selectionCancelBtn.innerText = '取消截图';
            this.el.selectionCancelBtn.style.cssText = 'padding:10px 14px;border:none;border-radius:999px;background:#d33;color:#fff;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25)';

            this.el.selectionSaveBtn = document.createElement('button');
            this.el.selectionSaveBtn.type = 'button';
            this.el.selectionSaveBtn.innerText = '保存截图';
            this.el.selectionSaveBtn.style.cssText = 'padding:10px 14px;border:none;border-radius:999px;background:#fb7299;color:#fff;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.25)';

            this.el.selectionBox = document.createElement('div');
            this.el.selectionBox.style.cssText = 'position:absolute;display:none;border:2px dashed #fb7299;background:rgba(251,114,153,0.18);box-shadow:0 0 0 1px rgba(255,255,255,0.25) inset;pointer-events:none';

            this.el.selectionToolbar.append(this.el.selectionSaveBtn, this.el.selectionCancelBtn);
            this.el.selectionOverlay.append(this.el.selectionHint, this.el.selectionToolbar, this.el.selectionBox);

            row.append(this.el.leftBtn, this.el.offsetIncBtn, this.el.pageInfo, this.el.offsetDecBtn, this.el.rightBtn);
            this.el.controls.append(row);

            // 右上角设置按钮横向排列(退出在最上面)
            this.el.settingsControls.append(this.el.closeBtn, this.el.screenshotBtn, this.el.rotateBtn, this.el.directionBtn, this.el.animationBtn, this.el.viewModeBtn, this.el.resetViewBtn, this.el.fullScreenBtn);

            this.el.reader.append(this.el.imgContainer, this.el.controls, this.el.settingsControls, this.el.toast, this.el.selectionOverlay);

            document.body.appendChild(this.el.reader);
            this.updateDirection();
            this.syncDirectionButton();
            animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
            this.syncViewModeButton();
            this.syncRotateButton();
            this.syncFullscreenButton();
            this.applyResponsiveLayout();
        }

        // 4. 绑定事件
        bindEvents() {
            const stop = (handler) => (e) => {
                e.stopPropagation();
                handler();
            };

            // UI 控制事件
            this.el.reader.addEventListener('mousemove', () => this.resetTimer());

            this.el.leftBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? this.lastStep : -this.lastStep);
            this.el.rightBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? -this.lastStep : this.lastStep);

            this.el.offsetIncBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? 1 : -1);
            this.el.offsetDecBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? -1 : 1);

            this.el.directionBtn.onclick = stop(() => {
                this.isRightToLeft = !this.isRightToLeft;
                this.updateDirection();
                this.syncDirectionButton();
            });

            this.el.animationBtn.onclick = stop(() => {
                this.animationMode = animations.getNextAnimationMode(this.animationMode);
                animations.syncAnimationButton(this.el.animationBtn, this.animationMode);
            });

            this.el.viewModeBtn.onclick = stop(() => {
                const currentIdx = VIEW_MODES.indexOf(this.viewMode);
                this.viewMode = VIEW_MODES[(currentIdx + 1) % VIEW_MODES.length];
                this.syncViewModeButton();
                this.render(false);
            });

            this.el.resetViewBtn.onclick = stop(() => this.resetTransform());
            this.el.screenshotBtn.onclick = stop(() => this.startScreenshotSelection());

            this.el.fullScreenBtn.onclick = stop(() => this.toggleFullscreen());

            this.el.rotateBtn.onclick = stop(() => {
                this.rotation = (this.rotation + 90) % 360;
                this.syncRotateButton();
                this.render(false);
            });

            this.el.closeBtn.onclick = () => this.close();

            // 页码跳转
            this.el.pageInfo.onclick = stop(() => this.showJumpDialog());
            this.el.selectionCancelBtn.onclick = () => this.cancelScreenshotSelection(true);
            this.el.selectionSaveBtn.onclick = () => { void this.saveSelectionScreenshot(); };
            this.el.selectionOverlay.addEventListener('pointerdown', this.handleSelectionPointerDown);
            this.el.selectionOverlay.addEventListener('pointermove', this.handleSelectionPointerMove);
            this.el.selectionOverlay.addEventListener('pointerup', this.handleSelectionPointerUp);
            this.el.selectionOverlay.addEventListener('pointercancel', this.handleSelectionPointerUp);

            // 图片容器事件 (翻页与拖拽起冲突)
            this.el.imgContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale + (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP)));
                this.applyTransform();
            }, { passive: false });

            this.el.imgContainer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.isDragging = true;
                this.initX = this.translateX;
                this.initY = this.translateY;
                this.startX = e.clientX;
                this.startY = e.clientY;
                this.el.imgContainer.style.cursor = 'grabbing';
            });

            this.el.imgContainer.addEventListener('mouseleave', () => {
                this.isDragging = false;
                this.el.imgContainer.style.cursor = 'grab';
            });

            // 注册全局事件 (需要在退出时清理)
            document.addEventListener('mousemove', this.handleMouseMove);
            document.addEventListener('mouseup', this.handleMouseUp);
            document.addEventListener('fullscreenchange', this.handleFullscreenChange);
            window.addEventListener('keydown', this.handleKeyDown);
            window.addEventListener('resize', this.handleResize);

            // 触摸滑动事件（使用已经绑定的函数引用，便于后续解绑）
            this.el.reader.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
            this.el.reader.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
            this.el.reader.addEventListener('touchend', this.boundHandleTouchEnd, { passive: false });
            this.el.reader.addEventListener('touchcancel', this.boundHandleTouchEnd, { passive: false });
            this.resetTimer();
        }

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '\u2190' : '\u2192';
            this.el.directionBtn.title = dir ? '当前：从右往左' : '当前：从左往右';
        }

        syncViewModeButton() {
            const map = { auto: ['自动', '视图模式：自动'], single: ['单图', '视图模式：单图'], double: ['双图', '视图模式：双图'] };
            const [text, title] = map[this.viewMode] || map.auto;
            Object.assign(this.el.viewModeBtn, { innerText: text, title });
        }

        syncRotateButton() {
            const rot = this.rotation;
            this.el.rotateBtn.innerText = rot === 0 ? '旋转' : `${rot}度`;
            this.el.rotateBtn.title = rot === 0 ? '旋转90度' : `当前旋转：${rot}度`;
        }

        syncFullscreenButton() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '退出全屏' : '全屏';
                this.el.fullScreenBtn.title = this.el.fullScreenBtn.innerText;
            }
        }

        toggleFullscreen() {
            if (!document.fullscreenElement) {
                this.el.reader.requestFullscreen().catch(() => { });
            } else {
                document.exitFullscreen();
            }
        }

        isCompactViewport() {
            return this.isTouchDevice || window.innerWidth <= MOBILE_BREAKPOINT;
        }

        applyResponsiveLayout() {
            this.isCompactLayout = this.isCompactViewport();
            const c = this.isCompactLayout;
            const btns = [this.el.leftBtn, this.el.rightBtn, this.el.offsetIncBtn, this.el.offsetDecBtn, this.el.directionBtn, this.el.animationBtn, this.el.viewModeBtn, this.el.resetViewBtn, this.el.screenshotBtn, this.el.fullScreenBtn, this.el.rotateBtn, this.el.closeBtn].filter(Boolean);

            btns.forEach(btn => {
                btn.style.minWidth = c ? '54px' : '';
                btn.style.minHeight = c ? '44px' : '';
                btn.style.padding = c ? '10px 12px' : '8px 15px';
                btn.style.fontSize = c ? '14px' : '13px';
            });

            Object.assign(this.el.controls.style, {
                left: c ? '12px' : '', right: c ? '12px' : '30px', bottom: c ? '12px' : '30px',
                width: c ? 'auto' : '', padding: c ? '10px 12px' : '10px 15px'
            });

            Object.assign(this.el.settingsControls.style, {
                top: c ? '12px' : '30px', left: c ? '12px' : '', right: c ? '12px' : '30px',
                flexDirection: c ? 'row' : 'column', flexWrap: c ? 'wrap' : 'nowrap',
                justifyContent: c ? 'center' : '', padding: c ? '10px 12px' : '10px 15px'
            });

            Object.assign(this.el.pageInfo.style, { fontSize: c ? '15px' : '14px', padding: c ? '0 4px' : '0 8px' });
            Object.assign(this.el.toast.style, { top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 24px)' : 'none' });
            Object.assign(this.el.selectionHint.style, {
                top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 120px)' : 'none', fontSize: c ? '12px' : '13px'
            });
            Object.assign(this.el.selectionToolbar.style, { top: c ? '12px' : '18px', right: c ? '12px' : '18px' });

            [this.el.selectionSaveBtn, this.el.selectionCancelBtn].forEach(btn => {
                btn.style.padding = c ? '10px 12px' : '10px 14px';
                btn.style.fontSize = c ? '12px' : '13px';
            });
        }

        setSelectionHint(text) {
            this.el.selectionHint.textContent = text;
        }

        getReaderPoint(clientX, clientY) {
            const rect = this.el.reader.getBoundingClientRect();
            return {
                x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, clientY - rect.top))
            };
        }

        normalizeSelectionRect(start = this.selectionStart, end = this.selectionCurrent) {
            if (!start || !end) return null;
            return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        }

        hasValidSelection(rect = this.normalizeSelectionRect()) {
            return Boolean(rect && rect.width >= 8 && rect.height >= 8);
        }

        updateSelectionActions() {
            const hasSelection = this.hasValidSelection();
            this.el.selectionSaveBtn.disabled = !hasSelection;
            Object.assign(this.el.selectionSaveBtn.style, {
                opacity: hasSelection ? '1' : '0.45',
                cursor: hasSelection ? 'pointer' : 'not-allowed'
            });
        }

        updateSelectionBox() {
            const rect = this.normalizeSelectionRect();
            if (!rect) {
                this.el.selectionBox.style.display = 'none';
                return;
            }
            Object.assign(this.el.selectionBox.style, {
                display: 'block', left: `${rect.x}px`, top: `${rect.y}px`,
                width: `${rect.width}px`, height: `${rect.height}px`
            });
        }

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this.updateSelectionActions();
        }

        startScreenshotSelection() {
            if (this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = true;
            this.pageFlipToken += 1;
            this.selectionWasControlsVisible = this.controlsVisible;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'block';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            this.updateControlVisibility(false);
            if (this.hideTimer) clearTimeout(this.hideTimer);
        }

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            if (restoreControls) { this.selectionWasControlsVisible ? this.resetTimer() : this.updateControlVisibility(false); }
            if (showMessage) this.showReaderMessage('已取消截图');
        }

        handleSelectionPointerDown(e) {
            if (!this.isSelectingScreenshot || e.button === 2 || e.target.closest?.('button')) return;
            e.preventDefault();
            this.selectionPointerId = e.pointerId;
            this.isDraggingSelection = true;
            this.selectionStart = this.getReaderPoint(e.clientX, e.clientY);
            this.selectionCurrent = this.selectionStart;
            this.updateSelectionBox();
            this.updateSelectionActions();
            this.setSelectionHint('拖动调整截图范围，完成后点击保存');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        }

        handleSelectionPointerMove(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.selectionCurrent = this.getReaderPoint(e.clientX, e.clientY);
            this.updateSelectionBox();
            this.updateSelectionActions();
        }

        handleSelectionPointerUp(e) {
            if (!this.isSelectingScreenshot || !this.isDraggingSelection) return;
            if (this.selectionPointerId !== null && e.pointerId !== this.selectionPointerId) return;
            e.preventDefault();
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.selectionCurrent = this.getReaderPoint(e.clientX, e.clientY);
            this.updateSelectionBox();
            this.el.selectionOverlay.releasePointerCapture?.(e.pointerId);
            this.updateSelectionActions();

            if (this.hasValidSelection()) {
                this.setSelectionHint('范围已选中，可点击保存，也可重新拖动重新选择');
            } else {
                this.clearSelectionBox();
                this.setSelectionHint('范围太小，请重新拖动选择');
            }
        }

        async saveSelectionScreenshot() {
            if (!this.hasValidSelection()) {
                this.showReaderMessage('请先拖动选出截图范围', true);
                return;
            }

            const success = await this.captureScreenshot(this.normalizeSelectionRect());
            if (success) {
                this.cancelScreenshotSelection(false);
            }
        }

        updateControlVisibility(visible) {
            this.controlsVisible = visible;
            const opacity = visible ? '1' : '0';
            const pointerEvents = visible ? 'auto' : 'none';
            Object.assign(this.el.controls.style, { opacity, pointerEvents });
            Object.assign(this.el.settingsControls.style, { opacity, pointerEvents });
            this.el.reader.style.cursor = visible || this.isTouchDevice ? 'default' : 'none';
        }

        toggleControls(forceVisible) {
            const nextVisible = typeof forceVisible === 'boolean' ? forceVisible : !this.controlsVisible;
            this.updateControlVisibility(nextVisible);
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (nextVisible) {
                this.hideTimer = setTimeout(() => {
                    this.updateControlVisibility(false);
                }, this.isTouchDevice ? 3500 : CONTROLS_HIDE_DELAY);
            }
        }

        showReaderMessage(text, isError = false, duration = 2200) {
            if (!this.el.toast) return;
            if (this.messageTimer) clearTimeout(this.messageTimer);
            Object.assign(this.el.toast.style, { background: isError ? 'rgba(180, 40, 40, 0.94)' : 'rgba(30,30,30,0.92)', opacity: '1' });
            this.el.toast.textContent = text;
            this.messageTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, duration);
        }

        isInteractiveTouchTarget(target) {
            const el = target instanceof Element ? target : null;
            return el?.closest('button, a, input, textarea, select')
                || this.el.controls.contains(el)
                || this.el.settingsControls.contains(el);
        }

        handleResize() {
            this.pageFlipToken += 1;
            this.applyResponsiveLayout();
        }

        handleTapNavigation(x) {
            const w = this.el.reader.clientWidth || window.innerWidth;
            if (x < w * TOUCH_TAP_ZONE_RATIO) return this.el.leftBtn.click();
            if (x > w * (1 - TOUCH_TAP_ZONE_RATIO)) return this.el.rightBtn.click();
            this.toggleControls();
        }

        loadExportImage(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => {
                    img.crossOrigin = '';
                    img.onload = () => resolve(img);
                    img.onerror = () => resolve(null);
                    img.src = src;
                };
                img.src = src;
            });
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
        drawScreenshotImage(ctx, img, descriptor, selectionRect) {
            const x = descriptor.x - selectionRect.x;
            const y = descriptor.y - selectionRect.y;
            const rot = this.rotation;
            const swap = rot === 90 || rot === 270;
            const dw = swap ? descriptor.height : descriptor.width;
            const dh = swap ? descriptor.width : descriptor.height;

            ctx.save();
            ctx.translate(x + descriptor.width / 2, y + descriptor.height / 2);
            if (rot) ctx.rotate(rot * Math.PI / 180);
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
        }

        canvasToBlob(canvas) {
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('EMPTY_BLOB')), 'image/png');
            });
        }

        shouldCopyScreenshotToClipboard() {
            return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        }

        async copyBlobToClipboard(blob) {
            if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
                throw new Error('CLIPBOARD_UNAVAILABLE');
            }

            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type || 'image/png']: blob
                })
            ]);
        }

        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        async outputScreenshot(blob, filename) {
            if (this.shouldCopyScreenshotToClipboard()) {
                try { await this.copyBlobToClipboard(blob); this.showReaderMessage('截图已复制到剪贴板'); return; } catch (_) { this.downloadBlob(blob, filename); this.showReaderMessage('剪贴板不可用，已改为保存文件', true, 2600); return; }
            }
            this.downloadBlob(blob, filename);
            this.showReaderMessage('截图已保存');
        }

        getScreenshotFileName(count) {
            const start = this.currentIndex + 1;
            const end = this.currentIndex + count;
            const range = count === 1 ? `${start}` : `${start}-${end}`;
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            return `bilibili-reader-${range}-${stamp}.png`;
        }

        async captureScreenshot(selectionRect) {
            const descriptors = this.getVisibleImageDescriptors();
            if (descriptors.length === 0) {
                this.showReaderMessage('当前没有可截图的页面', true);
                return false;
            }

            this.showReaderMessage('正在生成截图...', false, 3000);

            try {
                const loadedImages = await Promise.all(descriptors.map(async descriptor => {
                    const image = await this.loadExportImage(descriptor.src);
                    if (!image) throw new Error('LOAD_FAILED');
                    return { descriptor, image };
                }));

                const dpr = window.devicePixelRatio || 1;
                const output = document.createElement('canvas');
                output.width = Math.max(1, Math.round(selectionRect.width * dpr));
                output.height = Math.max(1, Math.round(selectionRect.height * dpr));

                const ctx = output.getContext('2d');
                if (!ctx) throw new Error('CANVAS_CONTEXT_FAILED');
                ctx.scale(dpr, dpr);
                ctx.fillStyle = READER_BACKGROUND;
                ctx.fillRect(0, 0, selectionRect.width, selectionRect.height);

                loadedImages.forEach(({ descriptor, image }) => {
                    this.drawScreenshotImage(ctx, image, descriptor, selectionRect);
                });

                const blob = await this.canvasToBlob(output);
                await this.outputScreenshot(blob, this.getScreenshotFileName(this.activePageCount));
                return true;
            } catch (error) {
                this.showReaderMessage('截图失败，当前图源可能限制导出', true, 2800);
                return false;
            }
        }

        // 触摸事件处理
        handleTouchStart(e) {
            if (this.isSelectingScreenshot) return;
            if (e.touches.length === 2) {
                // 双指缩放开启
                e.preventDefault();
                this.isTwoFingerGesturing = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
                this.initialScale = this.scale;
                this.initialCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                this.initialCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                return;
            }

            if (e.touches.length === 1) {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchEndX = this.touchStartX;
                this.touchEndY = this.touchStartY;
                this.isTouchSwiping = false;
                this.touchStartTime = Date.now();
                this.touchStartedOnInteractive = this.isInteractiveTouchTarget(e.target);
                if (this.touchStartedOnInteractive) {
                    this.resetTimer();
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
                this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.initialScale * scaleFactor));

                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                this.translateX += currentCenterX - this.initialCenterX;
                this.translateY += currentCenterY - this.initialCenterY;
                this.initialCenterX = currentCenterX;
                this.initialCenterY = currentCenterY;

                this.applyTransform();
                return;
            }

            if (e.touches.length === 1) {
                this.touchEndX = e.touches[0].clientX;
                this.touchEndY = e.touches[0].clientY;

                const deltaX = Math.abs(this.touchEndX - this.touchStartX);
                const deltaY = Math.abs(this.touchEndY - this.touchStartY);

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
                this.isTwoFingerGesturing = false;
                this.isTouchSwiping = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                this.isTwoFingerGesturing = false;
                return;
            }

            const deltaX = this.touchEndX - this.touchStartX;
            const deltaY = this.touchEndY - this.touchStartY;
            const threshold = SWIPE_THRESHOLD;
            const isTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && Date.now() - this.touchStartTime < 300;

            if (isTap) {
                if (!this.touchStartedOnInteractive) {
                    e.preventDefault();
                    this.handleTapNavigation(this.touchEndX);
                }
                this.isTouchSwiping = false;
                return;
            }

            if (!this.isTouchSwiping || (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold)) {
                return;
            }

            if (Math.abs(deltaX) > threshold) {
                const dir = (deltaX > 0) !== this.isRightToLeft ? -this.lastStep : this.lastStep;
                this.turnPage(null, dir);
            }

            this.isTouchSwiping = false;
        }

        // 5. 核心渲染逻辑 (处理动画切换)
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
                loadImages: (index, mode, direction) => { void this.loadImages(index, mode, direction); }
            });
        }

        // 6. 智能图片加载逻辑 (决定单双页)
        async loadImages(renderIndex, animationMode = 'none', transitionDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            animations.resetImageContainer(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform()
            );
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;

            const img1 = await this.loadImage(this.imgList[this.currentIndex]);
            if (!img1 || renderIndex !== this.currentIndex) return;

            const canUseDoubleMode = this.viewMode === 'double' || (this.viewMode === 'auto' && !this.isWideImage(img1));
            if (!canUseDoubleMode || this.currentIndex + 1 >= this.imgList.length) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const img2 = await this.loadImage(this.imgList[this.currentIndex + 1]);
            if (!img2 || renderIndex !== this.currentIndex) {
                this.commitImages([img1], animationMode, this.currentIndex + 1, transitionDirection);
                return;
            }

            const images = this.viewMode === 'auto' && this.isWideImage(img2) ? [img1] : [img1, img2];
            this.commitImages(images, animationMode, this.currentIndex + 2, transitionDirection);
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
            const isRotated90or270 = this.rotation === 90 || this.rotation === 270;
            const width = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
            const height = isRotated90or270 ? img.naturalWidth : img.naturalHeight;
            return width > height * 1.2;
        }

        commitImages(images, animationMode, preloadStart, transitionDirection = 0) {
            const isFull = images.length === 1;
            images.forEach(img => {
                this.setupImg(img, isFull);
                this.el.imgContainer.appendChild(img);
            });
            this.updatePageInfo(images.length);
            animations.finishRender(
                this.el.imgContainer,
                animationMode,
                transitionDirection,
                () => this.applyTransform()
            );
            this.preloadImages(preloadStart);
        }

        // 辅助：设置图片样式
        setupImg(img, isFull) {
            const rotated = this.rotation === 90 || this.rotation === 270;
            Object.assign(img.style, {
                maxWidth: rotated ? '100vh' : (isFull ? '100%' : '50%'),
                maxHeight: rotated ? (isFull ? '100vw' : '50vw') : '100vh',
                objectFit: 'contain', flexShrink: '0',
                transform: this.rotation ? `rotate(${this.rotation}deg)` : ''
            });
        }

        // 辅助：完成渲染并触发

        // 翻页相关方法

        turnPage(e, step) {
            e?.stopPropagation?.();
            if (!this.canGoForward(step)) step = step > 0 ? 1 : -1;
            if (!this.canGoForward(step)) return;
            this.currentIndex += step;
            this.render(true, step);
        }

        offsetPage(e, step) {
            e?.stopPropagation?.();
            const idx = this.currentIndex + step;
            if (idx >= 0 && idx < this.imgList.length) {
                this.currentIndex = idx;
                this.render(true, step);
            }
        }

        showJumpDialog() {
            const total = this.imgList.length;
            const input = prompt(`当前页码: ${this.currentIndex + 1} / ${total}\n请输入要跳转的页码(1-${total}):`);
            if (input === null) return;
            const page = parseInt(input, 10);
            if (isNaN(page) || page < 1 || page > total) { if (input.trim()) alert(`请输入1-${total} 之间的有效数字`); return; }
            const step = page - 1 - this.currentIndex;
            this.currentIndex = page - 1;
            this.render(true, step);
        }

        canGoForward(step) {
            const newIndex = this.currentIndex + step;
            return newIndex >= 0 && newIndex < this.imgList.length;
        }

        updatePageInfo(step) {
            this.activePageCount = step;
            this.lastStep = step;
            const total = this.imgList.length;
            this.el.pageInfo.innerText = step === 1
                ? `${this.currentIndex + 1} / ${total}`
                : `${this.currentIndex + 1}-${this.currentIndex + step} / ${total}`;
        }

        preloadImages(start, count = PRELOAD_COUNT) {
            for (let i = start; i < start + count && i < this.imgList.length; i++) {
                new Image().src = this.imgList[i];
            }
        }

        updateDirection() {
            if (this.el.imgContainer) this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
        }

        resetTransform() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.rotation = 0;
            this.syncRotateButton();
            this.applyTransform();
            this.el.imgContainer.querySelectorAll('img').forEach(img => {
                const isFull = img.style.maxWidth === '100%' || img.style.maxHeight === '100vw';
                img.style.transform = '';
                img.style.maxWidth = isFull ? '100%' : '50%';
                img.style.maxHeight = '100vh';
            });
        }

        applyTransform() {
            if (this.el.imgContainer) this.el.imgContainer.style.transform = `scale(${this.scale}) translate(${this.translateX}px,${this.translateY}px)`;
        }

        resetTimer() {
            if (this.isSelectingScreenshot) return;
            this.toggleControls(true);
        }

        // 全局事件处理函数

        handleMouseMove(e) {
            if (!this.isDragging) return;
            this.translateX = this.initX + (e.clientX - this.startX);
            this.translateY = this.initY + (e.clientY - this.startY);
            this.applyTransform();
        }

        handleMouseUp() {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.el.imgContainer.style.cursor = 'grab';
        }

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
            if (e.key === 'ArrowLeft') this.el.leftBtn.click();
            else if (e.key === 'ArrowRight') this.el.rightBtn.click();
            else if (e.key.toLowerCase() === 's') this.startScreenshotSelection();
            else if (e.key === 'Escape') this.close();
        }

        // 清理并关闭
        close() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            if (this.messageTimer) clearTimeout(this.messageTimer);
            this.pageFlipToken += 1;
            this.cancelScreenshotSelection(false, false);

            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
            document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
            window.removeEventListener('keydown', this.handleKeyDown);
            window.removeEventListener('resize', this.handleResize);

            if (this.el.reader) {
                this.el.reader.removeEventListener('touchstart', this.boundHandleTouchStart);
                this.el.reader.removeEventListener('touchmove', this.boundHandleTouchMove);
                this.el.reader.removeEventListener('touchend', this.boundHandleTouchEnd);
                this.el.reader.removeEventListener('touchcancel', this.boundHandleTouchEnd);
                this.el.selectionOverlay.removeEventListener('pointerdown', this.handleSelectionPointerDown);
                this.el.selectionOverlay.removeEventListener('pointermove', this.handleSelectionPointerMove);
                this.el.selectionOverlay.removeEventListener('pointerup', this.handleSelectionPointerUp);
                this.el.selectionOverlay.removeEventListener('pointercancel', this.handleSelectionPointerUp);
                this.el.reader.remove();
                this.el = {};
            }

            // 显示收藏夹悬浮按钮
            const favBtn = document.getElementById('bilibili-fav-float-btn');
            if (favBtn) favBtn.style.display = '';
        }
    }


    // ============ 入口函数 ============
    // 检查URL是否匹配漫画模式
    function shouldInitComicReader() {
        const url = window.location.href;
        return COMIC_URL_PATTERNS.some(pattern => url.includes(pattern));
    }

    // 初始化
    function init() {
        // 数据迁移：检查并迁移旧版本数据
        migrateDataIfNeeded(function() {
            // 收藏夹功能：所有页面初始化
            initFavorites();

            // 漫画模式：只在特定URL下初始化
            if (shouldInitComicReader()) {
                new BiliComicReader().init();
            }
        });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
