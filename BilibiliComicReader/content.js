(function () {
    'use strict';

    let imgList = [];
    let currentIndex = 0;
    let hideTimer = null;
    let lastStep = 2;
    // 1. 入口按钮
    const entryBtn = document.createElement('button');
    entryBtn.innerText = '📖 漫画模式';
    entryBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; padding: 12px 20px; cursor: pointer; background: #fb7299; color: white; border: none; border-radius: 25px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.2);';
    document.body.appendChild(entryBtn);

    entryBtn.onclick = () => {
        const rawImages = document.querySelectorAll('.article-content img, .opus-module-content img, .bili-rich-text img');
        imgList = Array.from(rawImages).map(img => {
            let src = img.getAttribute('data-src') || img.src;
            return src.split('@')[0];
        }).filter(src => src && !src.includes('base64'));

        if (imgList.length === 0) return alert('未找到图片');
        currentIndex = 0;
        showReader();
    };

    function showReader() {
        const reader = document.createElement('div');
        reader.id = 'comic-reader-overlay';
        // 使用 flex-direction: column 使图片区和控制区上下排列
        reader.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: #0a0a0a; z-index: 10000; display: flex;
            flex-direction: column; align-items: center; justify-content: center;
            overflow: hidden;
        `;

        // 2. 图片显示容器 (核心：row-reverse 实现从右往左)
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = `
            display: flex; flex-direction: row-reverse; 
            width: 100%; height: 100%; justify-content: center; 
            align-items: center; gap: 5px; padding: 0; margin: 0;
        `;

        // 3. 右下角控制面板
        const controls = document.createElement('div');
        controls.style.cssText = `
            position: fixed; bottom: 30px; right: 30px;
            display: flex; gap: 10px; align-items: center;
            background: rgba(30, 30, 30, 0.9); padding: 10px 15px;
            border-radius: 8px; backdrop-filter: blur(10px);
            border: 1px solid #444; color: white; z-index: 10001;
            transition: opacity 0.5s ease; /* 平滑过渡动画 */
            opacity: 1;
        `;

        const btnStyle = 'padding: 8px 15px; cursor: pointer; background: #333; color: white; border: 1px solid #555; border-radius: 4px;';

        const prevBtn = document.createElement('button');
        prevBtn.innerText = '▶'; // 因为是RTL，逻辑上的“下一张”在左边，所以用前进符号
        prevBtn.style.cssText = btnStyle;

        const nextBtn = document.createElement('button');
        nextBtn.innerText = '◀';
        nextBtn.style.cssText = btnStyle;

        // --- 偏移修正按钮 ---
        const offsetDecBtn = document.createElement('button');
        offsetDecBtn.innerText = '>';
        offsetDecBtn.title = '向前平移1页';
        offsetDecBtn.style.cssText = btnStyle + 'background: #444;';
        
        const offsetIncBtn = document.createElement('button');
        offsetIncBtn.innerText = '<';
        offsetIncBtn.title = '向后平移1页';
        offsetIncBtn.style.cssText = btnStyle + 'background: #444;';

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '退出';
        closeBtn.style.cssText = btnStyle + 'background: #555;';

        const pageInfo = document.createElement('span');
        pageInfo.style.fontSize = '14px';

        // 3. 自动隐藏逻辑函数
        const resetTimer = () => {
            // 显示面板和鼠标
            controls.style.opacity = '1';
            reader.style.cursor = 'default';
            // 清除之前的计时器
            if (hideTimer) clearTimeout(hideTimer);
            // 3秒后隐藏
            hideTimer = setTimeout(() => {
                controls.style.opacity = '0';
                reader.style.cursor = 'none'; // 同时隐藏鼠标指针，实现彻底沉浸
            }, 1000);
        };

        // 监听鼠标在阅读器上的移动
        reader.addEventListener('mousemove', resetTimer);

        // --- 新增：预加载函数 ---
        const preloadImages = (startIndex, count = 4) => {
            for (let i = startIndex; i < startIndex + count && i < imgList.length; i++) {
                const tempImg = new Image();
                tempImg.src = imgList[i]; // 这一行就会让浏览器开始下载并缓存图片
            }
        };
        // 渲染核心逻辑
        const render = () => {
            imgContainer.innerHTML = '';
            const img1 = new Image();
            img1.src = imgList[currentIndex];

            img1.onload = () => {
                const isWide = img1.naturalWidth > img1.naturalHeight;

                if (isWide) {
                    // 大图模式：单张撑满
                    img1.style.cssText = 'max-width: 100%; max-height: 100vh; object-fit: contain;';
                    imgContainer.appendChild(img1);
                    lastStep = 1;
                } else {
                    // 双页模式
                    img1.style.cssText = 'max-width: 50%; max-height: 100vh; object-fit: contain;';
                    imgContainer.appendChild(img1);

                    if (currentIndex + 1 < imgList.length) {
                        const img2 = new Image();
                        img2.src = imgList[currentIndex + 1];
                        img2.onload = () => {
                            // 如果第二张也是横图，就不并排了，依然只显第一张
                            if (img2.naturalWidth > img2.naturalHeight) {
                                lastStep = 1;
                            } else {
                                img2.style.cssText = 'max-width: 50%; max-height: 100vh; object-fit: contain;';
                                imgContainer.appendChild(img2);
                                lastStep = 2;
                            }
                            preloadImages(currentIndex + 2);// ***两张竖图加载完后，预加载后面的图 ***
                        };
                    } else {
                        lastStep = 1;
                    }
                }
                if (isWide) preloadImages(currentIndex + 1);
                
                pageInfo.innerText = `${currentIndex + 1} / ${imgList.length}`;
                prevBtn.disabled = currentIndex === 0;
                nextBtn.disabled = currentIndex + lastStep >= imgList.length;
            };
        };

        // 翻页逻辑
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex + lastStep < imgList.length) {
                currentIndex += lastStep;
                render();
            }
        };
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                // 回退逻辑比较复杂，默认回退 2 张或 1 张
                currentIndex = Math.max(0, currentIndex - 2);
                render();
            }
        };
        // --- 修正按钮逻辑 ---
        offsetDecBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex -= 1;
                render();
            }
        };
        offsetIncBtn.onclick = (e) => {
            e.stopPropagation();
            if (currentIndex < imgList.length - 1) {
                currentIndex += 1;
                render();
            }
        };
        closeBtn.onclick = () => { if (hideTimer) clearTimeout(hideTimer); reader.remove(); };

        // --- 新增：全屏切换按钮 ---
        const fullScreenBtn = document.createElement('button');
        fullScreenBtn.innerText = '全屏';
        fullScreenBtn.style.cssText = btnStyle + 'background: #444;';
        
        fullScreenBtn.onclick = (e) => {
            e.stopPropagation();
            if (!document.fullscreenElement) {
                // 进入全屏
                reader.requestFullscreen().catch(err => {
                    alert(`无法进入全屏: ${err.message}`);
                });
                fullScreenBtn.innerText = '退出全屏';
            } else {
                // 退出全屏
                document.exitFullscreen();
                fullScreenBtn.innerText = '全屏';
            }
        };

        // 监听全屏状态变化（防止用户按 F11 导致按钮文字没更新）
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                fullScreenBtn.innerText = '全屏';
            }
        });
        //
        // 组装
        controls.append(nextBtn, offsetIncBtn, pageInfo, offsetDecBtn, prevBtn, fullScreenBtn,closeBtn);
        reader.append(imgContainer, controls);
        document.body.appendChild(reader);

        render();

        // 键盘支持 (左键下一页，右键上一页)
        window.addEventListener('keydown', function handleKey(e) {
            if (!document.getElementById('comic-reader-overlay')) {
                window.removeEventListener('keydown', handleKey);
                return;
            }
            if (e.key === 'ArrowLeft') nextBtn.click();
            if (e.key === 'ArrowRight') prevBtn.click();
            if (e.key === 'Escape') closeBtn.click();
        });
    }
})();