// ==UserScript==
// @name         B站漫画模式
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  支持从右往左阅读，图片自动适配屏幕，控制栏位于右下角 (逻辑优化版)
// @match        *://www.bilibili.com/read/*
// @match        *://www.bilibili.com/opus/*
// @match        *://t.bilibili.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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
            this.enableAnimation = true; // 翻页动画开关

            // 拖拽状态
            this.isDragging = false;
            this.startX = 0;
            this.startY = 0;
            this.initX = 0;
            this.initY = 0;

            // DOM 元素引用
            this.el = {};

            // 绑定全局事件的 this 指向，方便后续解绑
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseUp = this.handleMouseUp.bind(this);
        }

        // 1. 初始化入口按钮
        init() {
            const entryBtn = document.createElement('button');
            entryBtn.innerText = '📖 漫画模式';
            entryBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 20px;cursor:pointer;background:#fb7299;color:#fff;border:none;border-radius:25px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
            document.body.appendChild(entryBtn);

            entryBtn.onclick = () => this.start();
        }

// 2. 启动阅读器 (终极提取文件名去重版)
        start() {
            const fileSet = new Set(); // 现在我们用它来存纯文件名，而不是完整 URL
            this.imgList = [];
            
            const rawImages = document.querySelectorAll(`
                .opus-module-content img, 
                .article-content img, 
                .bili-rich-text img,
                .opus-read-content img
            `);

            rawImages.forEach(img => {
                // 1. 获取原始地址并剥离后缀
                let rawSrc = img.getAttribute('data-src') || img.getAttribute('src') || '';
                if (!rawSrc || rawSrc.includes('base64')) return;

                let src = rawSrc.split('@')[0];
                if (src.startsWith('//')) src = 'https:' + src;
                if (!src.startsWith('http')) return;

                // 2. 排除干扰项
                const isNoise = img.closest('.reply-item, .user-face, .avatar, .sub-reply-container, .v-popover');
                const isEmoji = img.classList.contains('emoji') || src.includes('emote') || src.includes('emoji') || src.includes('garb'); // garb 是装扮/表情包的路径

                // 3. 终极去重核心：只取最后的图片文件名 (例如 hash.png)
                // 这样无论它是 i0 还是 i2 域名，都会被识别为同一张图
                const fileName = src.split('/').pop(); 

                // 4. 判断逻辑更新
                if (!fileSet.has(fileName) && !isNoise && !isEmoji) {
                    fileSet.add(fileName);
                    this.imgList.push(src); // 存入数组的依然是完整的真实 URL
                }
            });

            // 5. 排序修正保持不变
            this.imgList.sort((a, b) => {
                const getTop = (url) => {
                    const el = document.querySelector(`img[src*="${url.split('/').pop()}"], img[data-src*="${url.split('/').pop()}"]`);
                    return el ? el.getBoundingClientRect().top + window.scrollY : 0;
                };
                return getTop(a) - getTop(b);
            });

            if (this.imgList.length === 0) return alert('未找到漫画图片');

            this.currentIndex = 0;
            this.lastStep = 2;
            this.isDragging = false;

            this.createUI();
            this.bindEvents();
            this.render();
        }

        // 3. 创建 UI
        createUI() {
            this.el.reader = document.createElement('div');
            this.el.reader.id = 'comic-reader-overlay';
            this.el.reader.style.cssText = 'position:fixed;inset:0;background:#0a0a0a;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden';

            this.el.imgContainer = document.createElement('div');
            this.el.imgContainer.style.cssText = 'display:flex;width:100%;height:100%;align-items:center;justify-content:center;gap:5px;padding:0;margin:0;cursor:grab;transition:opacity 0.2s ease-out,transform 0.25s ease-out';
            this.updateDirection();

            this.el.controls = document.createElement('div');
            this.el.controls.style.cssText = 'position:fixed;bottom:30px;right:30px;display:flex;flex-direction:column;gap:8px;background:rgba(30,30,30,0.9);padding:10px 15px;border-radius:8px;backdrop-filter:blur(10px);border:1px solid #444;color:#fff;z-index:10001;transition:opacity 0.5s;opacity:1';

            const row1 = document.createElement('div');
            row1.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center';
            const row2 = document.createElement('div');
            row2.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center';

            const btnStyle = 'padding:8px 15px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:4px';
            const createBtn = (text, title, style = btnStyle) => {
                const btn = document.createElement('button');
                btn.innerText = text;
                btn.title = title;
                btn.style.cssText = style;
                return btn;
            };

            this.el.rightBtn = createBtn('▶', '向右翻页', btnStyle);
            this.el.leftBtn = createBtn('◀', '向左翻页', btnStyle);
            this.el.offsetIncBtn = createBtn('<', '左移一页', btnStyle + ';background:#444');
            this.el.offsetDecBtn = createBtn('>', '右移一页', btnStyle + ';background:#444');
            this.el.directionBtn = createBtn(this.isRightToLeft ? '←' : '→', this.isRightToLeft ? '当前：从右往左' : '当前：从左往右', btnStyle + ';background:#444;font-weight:bold');
            this.el.animationBtn = createBtn('动画', '翻页动画：开', btnStyle + ';background:#444;font-weight:bold');
            this.el.resetViewBtn = createBtn('重置', '重置视图', btnStyle + ';background:#444');
            this.el.fullScreenBtn = createBtn('全屏', '全屏', btnStyle + ';background:#444');
            this.el.closeBtn = createBtn('退出', '退出', btnStyle + ';background:#555');

            this.el.pageInfo = document.createElement('span');
            this.el.pageInfo.style.fontSize = '14px';
            this.el.pageInfo.style.cursor = 'pointer';
            this.el.pageInfo.style.padding = '0 8px';
            this.el.pageInfo.title = '点击跳转指定页码';

            row1.append(this.el.leftBtn, this.el.offsetIncBtn, this.el.pageInfo, this.el.offsetDecBtn, this.el.rightBtn);
            row2.append(this.el.directionBtn, this.el.animationBtn, this.el.resetViewBtn, this.el.fullScreenBtn, this.el.closeBtn);
            this.el.controls.append(row1, row2);
            this.el.reader.append(this.el.imgContainer, this.el.controls);

            document.body.appendChild(this.el.reader);
        }

        // 4. 绑定事件
        bindEvents() {
            // UI 控制事件
            this.el.reader.addEventListener('mousemove', () => this.resetTimer());

            this.el.leftBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? this.lastStep : -this.lastStep);
            this.el.rightBtn.onclick = (e) => this.turnPage(e, this.isRightToLeft ? -this.lastStep : this.lastStep);

            this.el.offsetIncBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? 1 : -1);
            this.el.offsetDecBtn.onclick = (e) => this.offsetPage(e, this.isRightToLeft ? -1 : 1);

            this.el.directionBtn.onclick = (e) => {
                e.stopPropagation();
                this.isRightToLeft = !this.isRightToLeft;
                this.updateDirection();
                this.el.directionBtn.innerText = this.isRightToLeft ? '←' : '→';
                this.el.directionBtn.title = this.isRightToLeft ? '当前：从右往左' : '当前：从左往右';
            };

            this.el.animationBtn.onclick = (e) => {
                e.stopPropagation();
                this.enableAnimation = !this.enableAnimation;
                this.el.animationBtn.innerText = this.enableAnimation ? '动画' : '无动画';
                this.el.animationBtn.title = this.enableAnimation ? '翻页动画：开' : '翻页动画：关';
                this.el.animationBtn.style.background = this.enableAnimation ? '#444' : '#333';
            };

            this.el.resetViewBtn.onclick = (e) => {
                e.stopPropagation();
                this.resetTransform();
            };

            this.el.fullScreenBtn.onclick = (e) => {
                e.stopPropagation();
                if (!document.fullscreenElement) {
                    this.el.reader.requestFullscreen().catch(() => { });
                } else {
                    document.exitFullscreen();
                }
            };

            this.el.closeBtn.onclick = () => this.close();

            // 页码跳转
            this.el.pageInfo.onclick = (e) => {
                e.stopPropagation();
                this.showJumpDialog();
            };

            // 图片容器事件 (滚轮与拖拽起始)
            this.el.imgContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.scale = Math.max(0.5, Math.min(3, this.scale + (e.deltaY > 0 ? -0.1 : 0.1)));
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
        }

        // 5. 核心渲染逻辑 (处理动画切换)
        render(animate = true, step = 0) {
            const renderIndex = this.currentIndex;
            // 结合全局动画开关
            const shouldAnimate = animate && this.enableAnimation;

            const slideOut = () => {
                // 如果不需要动画或者容器为空，直接加载
                if (!shouldAnimate || !this.el.imgContainer.firstChild) {
                    this.loadImages(renderIndex, false, 0);
                    return;
                }

                // 根据翻页方向决定滑出方向
                // step > 0: 向后翻(下一页), step < 0: 向前翻(下一页)
                // 向后翻：当前页向右滑出，新页从左滑入
                // 向前翻：当前页向左滑出，新页从右滑入
                let slideDirection;
                if (this.isRightToLeft) {
                    // 从右往左读：左按钮是下一页(step>0)，右按钮是上一页(step<0)
                    slideDirection = step > 0 ? 1 : -1;
                } else {
                    // 从左往右读：右按钮是下一页(step>0)，左按钮是上一页(step<0)
                    slideDirection = step > 0 ? -1 : 1;
                }

                // --- 1. 滑出动画阶段 ---
                this.el.imgContainer.style.transition = 'transform 0.2s, opacity 0.2s';
                this.el.imgContainer.style.opacity = '0';
                // 往翻页方向滑出
                this.el.imgContainer.style.transform = `translateX(${slideDirection * 60}px) scale(0.95)`;

                setTimeout(() => {
                    this.loadImages(renderIndex, true, slideDirection);
                }, 200);
            };
            slideOut();
        }

        // 6. 智能图片加载逻辑 (决定单双页)
        loadImages(renderIndex, animateIn = false, slideDirection = 0) {
            if (renderIndex !== this.currentIndex) return;

            this.el.imgContainer.innerHTML = '';
            this.resetTransform(); // 重置缩放和位移

            // 初始状态：先隐藏，准备滑入
            if (animateIn) {
                this.el.imgContainer.style.transition = 'none';
                // 从翻页反方向滑入
                this.el.imgContainer.style.transform = `translateX(${-slideDirection * 60}px) scale(0.95)`;
                this.el.imgContainer.style.opacity = '0';
            }

            const img1 = new Image();
            img1.src = this.imgList[this.currentIndex];

            img1.onload = () => {
                if (renderIndex !== this.currentIndex) return;

                // 判断第一张图比例 (宽图: 宽高比 > 1.2)
                const isWide1 = img1.naturalWidth > img1.naturalHeight * 1.2;

                if (isWide1) {
                    // --- 情况 A: 第一张就是宽图 ---
                    this.setupImg(img1, true); // 100% 宽度
                    this.el.imgContainer.appendChild(img1);
                    this.updatePageInfo(1); // 步长设为 1
                    this.finishRender(animateIn, slideDirection);
                } else {
                    // --- 情况 B: 第一张是竖图，尝试配对 ---
                    this.setupImg(img1, false); // 50% 宽度

                    // 检查是否有下一张
                    if (this.currentIndex + 1 < this.imgList.length) {
                        const img2 = new Image();
                        img2.src = this.imgList[this.currentIndex + 1];

                        img2.onload = () => {
                            if (renderIndex !== this.currentIndex) return;
                            const isWide2 = img2.naturalWidth > img2.naturalHeight * 1.2;

                            if (isWide2) {
                                // 下一张是宽图，不能配对
                                this.el.imgContainer.appendChild(img1);
                                this.updatePageInfo(1);
                            } else {
                                // 下一张也是竖图，配对成功！
                                this.setupImg(img2, false);
                                this.el.imgContainer.appendChild(img1);
                                this.el.imgContainer.appendChild(img2);
                                this.updatePageInfo(2); // 步长设为 2
                            }
                            this.finishRender(animateIn, slideDirection);
                        };
                    } else {
                        // 没有下一张了，孤伶伶的最后一张竖图
                        this.el.imgContainer.appendChild(img1);
                        this.updatePageInfo(1);
                        this.finishRender(animateIn, slideDirection);
                    }
                }
                // 无论如何，预加载后续图片
                this.preloadImages(this.currentIndex + 2);
            };
        }

        // 辅助：设置图片样式
        setupImg(img, isFull) {
            img.style.cssText = `max-height:100vh; object-fit:contain; flex-shrink:0;`;
            img.style.maxWidth = isFull ? '100%' : '50%';
        }

        // 辅助：完成渲染并滑入
        finishRender(animateIn, slideDirection = 0) {
            if (animateIn) {
                // 强制重绘
                this.el.imgContainer.getBoundingClientRect();
                this.el.imgContainer.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                this.el.imgContainer.style.opacity = '1';
                this.el.imgContainer.style.transform = 'translateX(0) scale(1)';
            } else {
                this.el.imgContainer.style.opacity = '1';
                this.el.imgContainer.style.transform = 'none';
            }
        }

        // --- 辅助与逻辑方法 ---

        turnPage(e, step) {
            e.stopPropagation();
            if (this.canGoForward(step)) {
                this.currentIndex += step;
                this.render(true, step);
            }
        }

        offsetPage(e, step) {
            e.stopPropagation();
            if (this.currentIndex + step >= 0 && this.currentIndex + step < this.imgList.length) {
                this.currentIndex += step;
                this.render(true, step);
            }
        }

        showJumpDialog() {
            const total = this.imgList.length;
            const current = this.currentIndex + 1;
            const input = prompt(`当前页码: ${current} / ${total}\n请输入要跳转的页码 (1-${total}):`);
            if (input !== null) {
                const page = parseInt(input, 10);
                if (!isNaN(page) && page >= 1 && page <= total) {
                    const step = page - 1 - this.currentIndex;
                    this.currentIndex = page - 1;
                    this.render(true, step);
                } else if (input.trim() !== '') {
                    alert(`请输入 1-${total} 之间的有效数字`);
                }
            }
        }

        canGoForward(step) {
            if (this.currentIndex >= this.imgList.length - 1) {
                return this.currentIndex - 1 >= 0;
            }
            return this.currentIndex + step >= 0 && this.currentIndex + step < this.imgList.length;
        }

        updatePageInfo(step) {
            this.lastStep = step;
            const start = this.currentIndex + 1;
            const end = this.currentIndex + step;
            this.el.pageInfo.innerText = step === 1
                ? `${start} / ${this.imgList.length}`
                : `${start}-${end} / ${this.imgList.length}`;
        }

        preloadImages(start, count = 4) {
            for (let i = start; i < start + count && i < this.imgList.length; i++) {
                new Image().src = this.imgList[i];
            }
        }

        updateDirection() {
            if (this.el.imgContainer) {
                this.el.imgContainer.style.flexDirection = this.isRightToLeft ? 'row-reverse' : 'row';
            }
        }

        resetTransform() {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform();
        }

        applyTransform() {
            if (this.el.imgContainer) {
                this.el.imgContainer.style.transform = `scale(${this.scale}) translate(${this.translateX}px,${this.translateY}px)`;
            }
        }

        resetTimer() {
            this.el.controls.style.opacity = '1';
            this.el.reader.style.cursor = 'default';
            if (this.hideTimer) clearTimeout(this.hideTimer);
            this.hideTimer = setTimeout(() => {
                this.el.controls.style.opacity = '0';
                this.el.reader.style.cursor = 'none';
            }, 2000);
        }

        // --- 全局事件处理函数 ---

        handleMouseMove(e) {
            if (!this.isDragging) return;
            this.translateX = this.initX + (e.clientX - this.startX);
            this.translateY = this.initY + (e.clientY - this.startY);
            this.applyTransform();
        }

        handleMouseUp() {
            if (this.isDragging) {
                this.isDragging = false;
                this.el.imgContainer.style.cursor = 'grab';
            }
        }

        handleFullscreenChange() {
            if (this.el.fullScreenBtn) {
                this.el.fullScreenBtn.innerText = document.fullscreenElement ? '退出全屏' : '全屏';
            }
        }

        handleKeyDown(e) {
            if (e.key === 'ArrowLeft') this.el.leftBtn.click();
            if (e.key === 'ArrowRight') this.el.rightBtn.click();
            if (e.key === 'Escape') this.close();
        }

        // 6. 清理并关闭
        close() {
            if (this.hideTimer) clearTimeout(this.hideTimer);

            // 彻底解绑全局事件，防止内存泄露！
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
            document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
            window.removeEventListener('keydown', this.handleKeyDown);

            // 移除 DOM
            if (this.el.reader) {
                this.el.reader.remove();
                this.el = {}; // 清空引用
            }
        }
    }

    // 实例化并初始化
    const reader = new BiliComicReader();
    reader.init();

})();