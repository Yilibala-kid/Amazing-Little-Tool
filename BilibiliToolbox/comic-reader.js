// Bilibili Toolbox - Comic Reader
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
    const CONTROLS_HIDE_DELAY = 500;
    const SWIPE_THRESHOLD = 50;
    const PRELOAD_COUNT = 4;
    const MOBILE_BREAKPOINT = 768;

    const READER_BACKGROUND = '#0a0a0a';
    const animations = window.BiliAnimations;

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
            this.viewMode = 'auto';
            this.animationMode = 'smooth';
            this.rotation = 0;
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
                ? 'position:fixed;bottom:16px;right:16px;z-index:9999;padding:12px 16px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:24px;font-size:18px;box-shadow:0 4px 16px rgba(251,114,153,0.3)'
                : 'position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:24px;font-size:20px;box-shadow:0 4px 16px rgba(251,114,153,0.3)';
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

        normalizeImageUrl(rawSrc) {
            if (!rawSrc || typeof rawSrc !== 'string' || rawSrc.includes('base64')) return '';
            let src = rawSrc.split('@')[0];
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('http:')) src = 'https:' + src.slice(5);
            return src.startsWith('http') ? src : '';
        }

        collectDynamicImagesFromState() {
            const modules = window.__INITIAL_STATE__?.detail?.modules;
            if (!Array.isArray(modules)) return [];

            return modules.flatMap(module => {
                const pics = module?.module_top?.display?.album?.pics;
                if (!Array.isArray(pics)) return [];
                return pics
                    .map(pic => this.normalizeImageUrl(pic?.url || ''))
                    .filter(Boolean);
            });
        }

        collectDynamicImagesFromDom() {
            const fileSet = new Set();
            const images = [];
            const rawImages = document.querySelectorAll(`
                .opus-module-content img,
                .article-content img,
                .bili-rich-text img,
                .opus-read-content img,
                .horizontal-scroll-album__indicator__thumbnail img,
                .horizontal-scroll-album__pic__img img
            `);

            rawImages.forEach(img => {
                const src = this.normalizeImageUrl(img.getAttribute('data-src') || img.getAttribute('src') || '');
                if (!src) return;

                const isNoise = img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover');
                const isEmoji = img.classList.contains('emoji') || src.includes('emote') || src.includes('emoji') || src.includes('garb');
                const fileName = src.split('/').pop();

                if (!fileSet.has(fileName) && !isNoise && !isEmoji) {
                    fileSet.add(fileName);
                    images.push(src);
                }
            });

            return images;
        }

        // 2. 启动阅读器
        start() {
            const mergedImages = [
                ...this.collectDynamicImagesFromState(),
                ...this.collectDynamicImagesFromDom()
            ];
            const seen = new Set();
            this.imgList = mergedImages.filter(src => {
                const fileName = src.split('/').pop();
                if (!fileName || seen.has(fileName)) return false;
                seen.add(fileName);
                return true;
            });

            // 排序纠正保持不变
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
            const createBtn = (text, title, className = 'comic-btn') => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.title = title;
                btn.className = className;
                return btn;
            };

            this.el.reader = document.createElement('div');
            this.el.reader.id = 'comic-reader-overlay';

            this.el.imgContainer = document.createElement('div');
            this.el.imgContainer.className = 'comic-img-container';

            this.el.controls = document.createElement('div');
            this.el.controls.className = 'comic-controls';

            this.el.settingsControls = document.createElement('div');
            this.el.settingsControls.className = 'comic-settings-controls';

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center';
            const secondRow = document.createElement('div');
            secondRow.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap';

            [
                ['rightBtn', '\u2192', '向右翻页', 'comic-btn'],
                ['leftBtn', '\u2190', '向左翻页', 'comic-btn'],
                ['offsetIncBtn', '<', '左移一页', 'comic-btn comic-btn-alt'],
                ['offsetDecBtn', '>', '右移一页', 'comic-btn comic-btn-alt'],
                ['directionBtn', '', '', 'comic-btn comic-btn-alt'],
                ['animationBtn', '', '', 'comic-btn comic-btn-alt'],
                ['viewModeBtn', '', '', 'comic-btn comic-btn-alt'],
                ['resetViewBtn', '重置', '重置视图', 'comic-btn comic-btn-alt'],
                ['screenshotBtn', '截图', '拖动选择截图范围', 'comic-btn comic-btn-alt'],
                ['fullScreenBtn', '', '', 'comic-btn comic-btn-alt'],
                ['rotateBtn', '', '', 'comic-btn comic-btn-alt'],
                ['closeBtn', '退出', '退出', 'comic-btn']
            ].forEach(([key, text, title, style]) => {
                this.el[key] = createBtn(text, title, style);
            });

            this.el.pageInfo = document.createElement('span');
            this.el.pageInfo.style.cssText = 'font-size:14px;cursor:pointer;padding:0 8px';
            this.el.pageInfo.title = '点击跳转指定页码';

            this.el.toast = document.createElement('div');
            this.el.toast.className = 'comic-toast';
            this.el.toast.style.cssText = 'top:18px;background:rgba(30,30,30,0.92);opacity:0';

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

            const handleCursors = {
                nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
                e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
                sw: 'nesw-resize', w: 'ew-resize'
            };
            for (const [dir, cursor] of Object.entries(handleCursors)) {
                const h = document.createElement('div');
                h.className = 'comic-sel-handle';
                h.dataset.dir = dir;
                h.style.cssText = `position:absolute;width:12px;height:12px;background:#fb7299;border:2px solid #fff;border-radius:50%;cursor:${cursor};pointer-events:auto;display:none;z-index:1;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:translate(-50%,-50%)`;
                this.el.selectionBox.appendChild(h);
                this.selectionHandles[dir] = h;
            }

            this.el.selectionToolbar.append(this.el.selectionSaveBtn, this.el.selectionCancelBtn);
            this.el.selectionOverlay.append(this.el.selectionHint, this.el.selectionToolbar, this.el.selectionBox);

            row.append(this.el.leftBtn, this.el.offsetIncBtn, this.el.pageInfo, this.el.offsetDecBtn, this.el.rightBtn);
            secondRow.append(this.el.directionBtn, this.el.resetViewBtn, this.el.fullScreenBtn);
            this.el.controls.append(row, secondRow);

            // 右上角设置按钮横向排列(退出在最上面)
            this.el.settingsControls.append(this.el.closeBtn, this.el.screenshotBtn, this.el.rotateBtn, this.el.animationBtn, this.el.viewModeBtn);

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

            // Controls visibility — only the panels trigger show/hide, images don't
            this.el.controls.addEventListener('mouseenter', () => this.showControls());
            this.el.settingsControls.addEventListener('mouseenter', () => this.showControls());
            this.el.controls.addEventListener('mouseleave', () => this.scheduleHideControls());
            this.el.settingsControls.addEventListener('mouseleave', () => this.scheduleHideControls());
            this.el.reader.addEventListener('mouseleave', () => this.scheduleHideControls());

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
                this.animateTransform();
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
            this.showControls();
        }

        syncDirectionButton() {
            const dir = this.isRightToLeft;
            this.el.directionBtn.innerText = dir ? '从右往左' : '从左往右';
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
            return window.innerWidth < MOBILE_BREAKPOINT;
        }

        applyResponsiveLayout() {
            this.isCompactLayout = this.isCompactViewport();
            const c = this.isCompactLayout;
            this.el.reader.classList.toggle('reader-compact', c);
            Object.assign(this.el.toast.style, { top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 24px)' : 'none' });
            Object.assign(this.el.selectionHint.style, { top: c ? '12px' : '18px', maxWidth: c ? 'calc(100vw - 120px)' : 'none', fontSize: c ? '12px' : '13px' });
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
        }

        clearSelectionBox() {
            this.isDraggingSelection = false;
            this.selectionPointerId = null;
            this.resizeDirection = null;
            this.selectionStart = null;
            this.selectionCurrent = null;
            this.el.selectionBox.style.display = 'none';
            this._hideHandles();
            this.updateSelectionActions();
        }

        _hideHandles() {
            for (const h of Object.values(this.selectionHandles)) {
                h.style.display = 'none';
            }
        }

        startScreenshotSelection() {
            if (this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = true;
            this.pageFlipToken += 1;
            this.selectionWasControlsVisible = this.controlsVisible;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'block';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            this.hideControls();
            if (this.hideTimer) clearTimeout(this.hideTimer);
        }

        cancelScreenshotSelection(showMessage = false, restoreControls = true) {
            if (!this.isSelectingScreenshot) return;
            this.isSelectingScreenshot = false;
            this.clearSelectionBox();
            this.el.selectionOverlay.style.display = 'none';
            this.setSelectionHint('拖动选择截图范围，完成后点击保存');
            if (restoreControls) { this.selectionWasControlsVisible ? this.showControls() : this.hideControls(); }
            if (showMessage) this.showReaderMessage('已取消截图');
        }

        handleSelectionPointerDown(e) {
            if (!this.isSelectingScreenshot || e.button === 2 || e.target.closest?.('button')) return;
            e.preventDefault();
            this.selectionPointerId = e.pointerId;

            const handle = e.target.closest?.('.comic-sel-handle');
            if (handle && this.hasValidSelection()) {
                this.resizeDirection = handle.dataset.dir;
                this.isDraggingSelection = true;
                this.setSelectionHint('拖动边角调整选区范围');
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
            this.setSelectionHint('拖动选择截图范围，完成后拖动边角微调');
            this.el.selectionOverlay.setPointerCapture?.(e.pointerId);
        }

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
        }

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
                this.setSelectionHint('选区已就绪 — 拖动边角微调，或点击保存');
            } else {
                this.clearSelectionBox();
                this.setSelectionHint('选区太小，请重新拖动选择');
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

        setControlsOpacity(opacity) {
            this.el.controls.style.opacity = opacity;
            this.el.settingsControls.style.opacity = opacity;
        }

        showControls() {
            if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
            if (!this.controlsVisible) this.setControlsOpacity('1');
            this.controlsVisible = true;
            this.el.reader.style.cursor = 'default';
        }

        hideControls() {
            this.controlsVisible = false;
            this.setControlsOpacity('0');
            if (!this.isTouchDevice) this.el.reader.style.cursor = 'none';
        }

        scheduleHideControls() {
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => this.hideControls(), this.isTouchDevice ? 1000 : 500);
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

        handleTapNavigation() {
            this.controlsVisible ? this.hideControls() : this.showControls();
        }

        clearPendingTap() {
            if (!this.pendingTapTimer) return;
            clearTimeout(this.pendingTapTimer);
            this.pendingTapTimer = null;
        }

        isTouchPanMode() {
            return this.touchPanLocked;
        }

        setTransformTransition(value) {
            if (!this.el.imgContainer) return;
            this.el.imgContainer.style.transition = value;
        }

        animateTransform(duration = 180) {
            if (this.transformTransitionTimer) clearTimeout(this.transformTransitionTimer);
            this.setTransformTransition(`transform ${duration}ms ease-out`);
            this.transformTransitionTimer = setTimeout(() => {
                this.transformTransitionTimer = null;
                this.setTransformTransition('none');
            }, duration);
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

        async shareScreenshot(blob, filename) {
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
            if (navigator.share) {
                try { await this.shareScreenshot(blob, filename); this.showReaderMessage('截图已打开系统分享'); return; } catch (_) { }
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
                    const image = await this.loadExportImageSafe(descriptor.src);
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

                try {
                    const blob = await this.canvasToBlob(output);
                    await this.outputScreenshot(blob, this.getScreenshotFileName(this.activePageCount));
                    return true;
                } catch (_) {
                    this.showReaderMessage('图片受跨域限制，无法合成截图', true, 3000);
                    return false;
                }
            } catch (error) {
                this.showReaderMessage('截图失败，请重试', true, 2800);
                return false;
            }
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
                this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.initialScale * scaleFactor));

                const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                if (Math.abs(currentDistance - this.initialPinchDistance) > 8
                    || Math.abs(currentCenterX - this.twoFingerTapCenterX) > 8
                    || Math.abs(currentCenterY - this.twoFingerTapCenterY) > 8) {
                    this.twoFingerTapCandidate = false;
                }
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

                const moveX = this.touchEndX - this.touchStartX;
                const moveY = this.touchEndY - this.touchStartY;
                const deltaX = Math.abs(moveX);
                const deltaY = Math.abs(moveY);

                if (this.isTouchPanMode() && !this.touchStartedOnInteractive) {
                    if (deltaX > 4 || deltaY > 4) {
                        e.preventDefault();
                        this.setTransformTransition('none');
                        this.touchDidMoveImage = true;
                        this.translateX = this.initX + moveX;
                        this.translateY = this.initY + moveY;
                        this.applyTransform();
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
                this.twoFingerTapCandidate = false;
                return;
            }

            if (this.isTwoFingerGesturing) {
                const isTwoFingerTap = this.twoFingerTapCandidate
                    && Date.now() - this.twoFingerTapStartTime < 300;
                this.isTwoFingerGesturing = false;
                this.twoFingerTapCandidate = false;
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

            if (this.touchDidMoveImage) {
                this.isTouchSwiping = false;
                this.touchDidMoveImage = false;
                return;
            }

            if (isTap) {
                if (!this.touchStartedOnInteractive) {
                    e.preventDefault();
                    this.clearPendingTap();
                    this.pendingTapTimer = setTimeout(() => {
                        this.pendingTapTimer = null;
                        this.handleTapNavigation(this.touchEndX);
                    }, 220);
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
            if (animationMode === 'none') {
                this.el.imgContainer.innerHTML = '';
            }
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
            img.className = isFull ? 'comic-img-full' : 'comic-img-half';
            img.dataset.rotated = rotated ? 'true' : 'false';
            Object.assign(img.style, {
                objectFit: 'contain', flexShrink: '0',
                transform: this.rotation ? `rotate(${this.rotation}deg)` : ''
            });
            if (rotated) img.style.maxWidth = '100vh';
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
            this.clearPendingTap();
            this.animateTransform(220);
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.rotation = 0;
            this.touchPanLocked = false;
            this.touchDidMoveImage = false;
            this.lastTapTime = 0;
            this.twoFingerTapCandidate = false;
            this.lastTwoFingerTapTime = 0;
            this.lastTwoFingerTapCenterX = 0;
            this.lastTwoFingerTapCenterY = 0;
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

    // Expose
    window.BiliComicReader = BiliComicReader;
    window.shouldInitComicReader = shouldInitComicReader;
})();
