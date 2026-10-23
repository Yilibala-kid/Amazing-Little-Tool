// Real touch input in both distribution formats; no live Bilibili requests.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, createArtifacts, loadReader, mockStorage } = require('./helpers.cjs');
const artifacts = createArtifacts('swipe');

(async () => {
    const browser = await launchBrowser();
    try {
        for (const variant of ['extension', 'userscript']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
                isMobile: true, deviceScaleFactor: 2 });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const rasters = await page.evaluate(() => Array.from({ length: 8 }, (_, i) => {
                const canvas = document.createElement('canvas');
                canvas.width = i === 2 ? 1000 : 512;
                canvas.height = 768;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = ['#ffaaaa', '#aaffaa', '#aaaaff', '#ffffaa', '#ffaaff', '#aaffff', '#eeeeee', '#cccccc'][i];
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#222'; ctx.font = '80px sans-serif';
                ctx.fillText(String(i + 1), 100, 200);
                return canvas.toDataURL().split(',')[1];
            }));
            let holdSix, releaseSix;
            let failSeven = false;
            await page.route('**/*', async route => {
                const match = route.request().url().match(/page(\d+)\.png/);
                if (match) {
                    const index = Number(match[1]);
                    if (index === 6 && holdSix) await holdSix;
                    if (index === 7 && failSeven) return route.abort();
                    return route.fulfill({ contentType: 'image/png', body: Buffer.from(rasters[index], 'base64') });
                }
                return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>.article-content img{max-width:100%}</style><div class="article-content">' +
                    Array.from({ length: 8 }, (_, i) => `<img src="https://i0.hdslb.com/bfs/article/page${i}.png">`).join('') + '</div>' });
            });
            await page.goto('https://www.bilibili.com/read/cv1');
            await mockStorage(page, variant);
            await loadReader(page, { variant });
            await page.evaluate(async () => {
                await BilibiliToolbox.storage.init();
                window.reader = new BilibiliToolbox.reader.BiliComicReader();
                Object.assign(reader, { animationMode: 'parallel', viewMode: 'single', isRightToLeft: false, preloadPages: '2', imageMemoryPolicy: 'previous' });
                reader.start(); reader.hideControls();
            });
            const cdp = await context.newCDPSession(page);
            const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type,
                touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
            const down = (x, y = 410) => send('touchStart', [[x, y]]);
            const move = (x, y = 410) => send('touchMove', [[x, y]]);
            const up = () => send('touchEnd', []);
            const rest = () => page.waitForFunction(() => !reader.swipe.animating && !reader.swipe.waiting && !reader.swipe.gesture && Math.abs(reader.swipe.offset) < 0.1);
            const ready = direction => page.waitForFunction(dir => !!reader.swipe.slots.get(dir)?.result, direction);
            const jump = async (index, viewMode = 'single') => {
                await page.evaluate(async ({ index, viewMode }) => {
                    reader.viewMode = viewMode; reader.currentIndex = index;
                    await reader.render(false); reader.hideControls();
                }, { index, viewMode });
                await page.waitForFunction(i => reader.displayedIndex === i, index);
            };
            const drag = async (from, to, { y = 410, pause = 140 } = {}) => {
                await down(from, y);
                for (let i = 1; i <= 4; i++) { await move(from + (to - from) * i / 4, y); await page.waitForTimeout(pause ? 16 : 1); }
                if (pause) await page.waitForTimeout(pause);
                await up();
            };
            await page.waitForFunction(() => reader.el.imgContainer.children.length === 1);
            await ready(1);

            // Before release, finger delta equals stage delta and index stays put.
            await down(260);
            await move(190);
            await page.waitForFunction(() => reader.swipe.offset === -70);
            assert.equal(await page.evaluate(() => reader.currentIndex), 0);
            const follow = await page.evaluate(() => ({
                x: new DOMMatrixReadOnly(getComputedStyle(reader.el.pageStage).transform).m41,
                next: reader.swipe.slots.get(1).stage.getBoundingClientRect().left,
                slots: document.querySelectorAll('.comic-page-stage').length,
                neighborImage: reader.swipe.slots.get(1).stage.querySelector('img').getBoundingClientRect().left
            }));
            assert.equal(follow.x, -70);
            assert.equal(follow.next, 320);
            assert.ok(follow.neighborImage >= 320 && follow.neighborImage < 390);
            assert.ok(follow.slots <= 3);
            await page.screenshot({ path: path.join(artifacts, `${variant}-following.png`) });
            await page.waitForTimeout(140); await up(); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 0, 'short slow drag rebounds');

            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 1);
            await ready(1); await ready(-1);
            assert.equal(await page.evaluate(() => reader.imageLoader.imageProtections.size), 2, 'only neighboring groups stay protected');
            await down(300); await move(220); await up(); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 2, 'short fast flick turns');

            for (const strength of [0, 40, 100]) {
                await page.evaluate(strength => reader.setPreference('clarityStrength', strength), strength);
                await ready(1);
                await drag(300, 235); await rest();
                assert.equal(await page.evaluate(() => reader.currentIndex), 2, 'clarity does not change gesture thresholds');
                assert.equal(await page.evaluate(() => getComputedStyle(reader.swipe.slots.get(1).stage.querySelector('img')).filter),
                    await page.evaluate(() => getComputedStyle(reader.el.imgContainer.querySelector('img')).filter));
            }

            // A screenshot initiated while dragging cancels the page motion.
            await down(300); await move(120);
            await page.evaluate(() => reader.startScreenshotSelection());
            await up();
            await page.evaluate(() => reader.cancelScreenshotSelection(false));
            assert.equal(await page.evaluate(() => reader.currentIndex), 2);
            assert.equal(await page.evaluate(() => reader.suppressRemainingTouch), false);

            // Reverse an in-progress settling animation with a fresh gesture.
            await jump(0); await ready(1);
            await drag(300, 175);
            await page.waitForTimeout(25);
            await down(80); await move(360);
            await page.waitForTimeout(140); await up(); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 0, 'new touch interrupts settlement and can return to the old page');
            await drag(100, 290); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 0, 'first page has resistance and cannot turn backward');

            // Cancellation and vertical gestures must never commit a page.
            await down(300); await move(130); await send('touchCancel', []); await rest();
            await down(200, 300); await move(170, 540); await up();
            assert.equal(await page.evaluate(() => reader.currentIndex), 0);

            // Direction, double grouping, wide-page auto grouping and landscape.
            await page.evaluate(() => reader.setPreference('isRightToLeft', true));
            await ready(1);
            await drag(70, 250); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 1);
            await page.evaluate(() => reader.setPreference('isRightToLeft', false));
            await jump(0, 'double'); await ready(1);
            await drag(300, 120); await rest();
            assert.deepEqual(await page.evaluate(() => [reader.currentIndex, reader.activePageCount]), [2, 2]);
            await jump(0, 'auto'); await ready(1);
            await drag(300, 120); await rest();
            assert.deepEqual(await page.evaluate(() => [reader.currentIndex, reader.activePageCount]), [2, 1]);
            await page.setViewportSize({ width: 844, height: 390 });
            await ready(1);
            await drag(650, 350, { y: 190 }); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 3);
            await page.screenshot({ path: path.join(artifacts, `${variant}-landscape.png`) });
            await page.setViewportSize({ width: 390, height: 844 });
            await jump(3); await ready(1);

            // Zoomed image pans first, then hands excess edge drag to paging.
            await page.evaluate(() => { reader.scale = 2; reader.translateX = 0; reader.applyTransform(); });
            await drag(180, 235);
            assert.equal(await page.evaluate(() => reader.currentIndex), 3);
            assert.ok(await page.evaluate(() => reader.translateX > 0));
            await page.evaluate(() => { reader.translateX = reader.getPanLimits().maxX; reader.applyTransform(); });
            await ready(-1);
            await drag(100, 280); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 2, 'outward drag at zoom boundary turns backward');

            // A pinch cancels the page drag; lifting the remaining finger is inert.
            await down(280); await move(150);
            await send('touchStart', [[150, 410], [260, 410]]);
            await send('touchMove', [[120, 410], [290, 410]]);
            await send('touchEnd', [[120, 410]]);
            await move(260); await up();
            assert.equal(await page.evaluate(() => reader.currentIndex), 2);

            // Decode/network wait holds the old page; arrival commits from the offset.
            holdSix = new Promise(resolve => { releaseSix = resolve; });
            await page.evaluate(() => {
                reader.swipe.reset(); reader.cancelPreload();
                reader.imageLoader.releaseCachedImage(reader.imgList[6]);
                reader.imgList[6] += '?slow'; // Bypass the browser's already decoded article image.
            });
            await jump(5);
            await drag(300, 120);
            await page.waitForFunction(() => reader.swipe.waiting);
            assert.equal(await page.evaluate(() => reader.currentIndex), 5);
            assert.equal(await page.evaluate(() => reader.displayedIndex), 5);
            releaseSix(); holdSix = null;
            await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 6);

            // Failed next page rebounds; a later gesture retries.
            failSeven = true;
            await page.evaluate(() => {
                reader.swipe.reset(); reader.imageLoader.releaseCachedImage(reader.imgList[7]);
                reader.imgList[7] += '?failure'; reader.swipe.schedule(0);
            });
            await page.waitForTimeout(80);
            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 6);
            failSeven = false;
            // The failed turn itself has reset and rescheduled its neighbor.
            await ready(1);
            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 7);
            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 7, 'last page rebounds');

            await page.emulateMedia({ reducedMotion: 'reduce' });
            await jump(3); await ready(1);
            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 4, 'reduced motion still follows the finger and commits');
            await page.emulateMedia({ reducedMotion: 'no-preference' });

            // Duplicate image URLs use a separate display node for the neighbor.
            await page.evaluate(() => { window.savedSource = reader.imgList[4]; reader.imgList[4] = reader.imgList[3]; });
            await jump(3); await ready(1);
            assert.equal(await page.evaluate(() => reader.el.imgContainer.children.length), 1);
            await drag(300, 120); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 4);
            await page.evaluate(() => { reader.imgList[4] = savedSource; });

            await page.evaluate(() => { window.savedPrevious = reader.imgList[2]; reader.imgList[2] = reader.imgList[4]; });
            await jump(3); await ready(1); await ready(-1);
            assert.deepEqual(await page.evaluate(() => [-1, 1].map(direction =>
                reader.swipe.slots.get(direction).stage.querySelectorAll('img').length)), [1, 1],
                'neighbors sharing a URL retain separate display nodes');
            await page.evaluate(() => { reader.imgList[2] = savedPrevious; });

            const animationFrames = [];
            for (const mode of ['parallel', 'fade', 'smooth']) {
                await page.evaluate(mode => reader.setPreference('animationMode', mode), mode);
                await jump(3); await ready(1); await ready(-1);
                await down(300); await move(240);
                await page.waitForFunction(() => reader.swipe.offset === -60);
                const visual = await page.evaluate(() => {
                    const current = getComputedStyle(reader.el.pageStage);
                    const incoming = getComputedStyle(reader.swipe.slots.get(1).stage);
                    const matrix = new DOMMatrixReadOnly(current.transform);
                    return { x: matrix.m41, scale: matrix.m11, opacity: Number(current.opacity),
                        nextX: new DOMMatrixReadOnly(incoming.transform).m41, nextVisible: incoming.visibility,
                        nextOpacity: Number(incoming.opacity) };
                });
                assert.equal(visual.nextVisible, 'visible');
                if (mode === 'parallel') {
                    assert.equal(visual.x, -60); assert.equal(visual.opacity, 1);
                } else {
                    assert.ok(Math.abs(visual.opacity - 0.5) < 0.01);
                    assert.equal(visual.nextOpacity, 0, 'next page stays transparent until the old page has faded out');
                    if (mode === 'fade') {
                        assert.equal(visual.x, 0); assert.equal(visual.nextX, 0); assert.equal(visual.scale, 1);
                    } else {
                        assert.ok(visual.x < 0 && visual.x > -25);
                        assert.ok(visual.nextX > 0 && visual.nextX < 60);
                        assert.ok(visual.scale < 1 && visual.scale > 0.97);
                    }
                }
                animationFrames.push(await page.screenshot({ path: path.join(artifacts, `${variant}-${mode}-drag.png`) }));
                await page.waitForTimeout(140); await up();
                // Rollback restores the old page through the same background.
                if (mode !== 'parallel') assert.equal(await page.evaluate(() =>
                    getComputedStyle(reader.swipe.slots.get(1).stage).visibility), 'visible');
                await rest();
                assert.equal(await page.evaluate(() => reader.currentIndex), 3);

                if (mode !== 'parallel') {
                    for (const [background, value] of [['white', 255], ['darkGray', 31]]) {
                        await page.evaluate(background => reader.setPreference('backgroundMode', background), background);
                        await down(300); await move(180);
                        await page.waitForFunction(() => reader.swipe.offset === -120);
                        assert.deepEqual(await page.evaluate(() => [reader.el.pageStage,
                            reader.swipe.slots.get(1).stage].map(stage => Number(getComputedStyle(stage).opacity))), [0, 0]);
                        const pixels = await page.screenshot({ clip: { x: 180, y: 400, width: 10, height: 10 },
                            path: path.join(artifacts, `${variant}-${mode}-${background}-midpoint.png`) });
                        const pixel = await page.evaluate(async bytes => {
                            const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
                            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
                            const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
                            return [...ctx.getImageData(0, 0, 1, 1).data];
                        }, [...pixels]);
                        assert.deepEqual(pixel, [value, value, value, 255], 'midpoint pixels equal the selected reader background');
                        await move(120);
                        await page.waitForFunction(() => reader.swipe.offset === -180);
                        const incoming = await page.evaluate(() => [reader.el.pageStage,
                            reader.swipe.slots.get(1).stage].map(stage => Number(getComputedStyle(stage).opacity)));
                        assert.equal(incoming[0], 0);
                        assert.ok(incoming[1] > 0.4 && incoming[1] < 0.6);
                        await send('touchCancel', []); await rest();
                        assert.equal(await page.evaluate(() => reader.currentIndex), 3);
                    }
                    await page.evaluate(() => reader.setPreference('backgroundMode', 'white'));
                }

                // Interrupt on the first browser frame after release. Separate
                // driver round trips can miss a 120ms transition on a busy host.
                await page.evaluate(() => {
                    window.interruptedTurn = new Promise(resolve => {
                        reader.el.reader.addEventListener('touchend', () => requestAnimationFrame(() => {
                            const target = reader.el.reader;
                            const touch = new Touch({ identifier: 9, target, clientX: 80, clientY: 410 });
                            target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true,
                                cancelable: true, touches: [touch], changedTouches: [touch] }));
                            resolve({ offset: reader.swipe.offset,
                                opacity: Number(getComputedStyle(reader.el.pageStage).opacity),
                                nextOpacity: Number(getComputedStyle(reader.swipe.slots.get(1).stage).opacity) });
                        }), { once: true });
                    });
                });
                await drag(300, 120);
                const frozen = await page.evaluate(() => interruptedTurn);
                assert.ok(frozen.offset < 0 && frozen.offset > -390, 'new touch catches the transition before completion');
                if (mode !== 'parallel') {
                    const progress = Math.abs(frozen.offset) / 240;
                    assert.ok(Math.abs(frozen.opacity - Math.max(0, 1 - 2 * progress)) < 0.02);
                    assert.ok(Math.abs(frozen.nextOpacity - Math.max(0, 2 * progress - 1)) < 0.02);
                }
                await page.evaluate(() => reader.el.reader.dispatchEvent(
                    new TouchEvent('touchcancel', { bubbles: true, touches: [], changedTouches: [] })));
                await rest();
                assert.equal(await page.evaluate(() => reader.currentIndex), 3);
                await drag(300, 120); await rest();
                assert.equal(await page.evaluate(() => reader.currentIndex), 4, `${mode} finishes its own touch transition`);
            }
            assert.notDeepEqual(animationFrames[0], animationFrames[1]);
            assert.notDeepEqual(animationFrames[1], animationFrames[2]);

            // Fixed drag distances and visual progress on phones and tablets.
            for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 },
                { width: 1366, height: 1024 }]) {
                await page.setViewportSize(viewport);
                for (const mode of ['parallel', 'fade', 'smooth']) {
                    await page.evaluate(mode => reader.setPreference('animationMode', mode), mode);
                    await jump(3); await ready(1);
                    await drag(300, 230); await rest();
                    assert.equal(await page.evaluate(() => reader.currentIndex), 3, '70px slow drag rebounds on every screen');
                    if (mode !== 'parallel') {
                        await down(300); await move(180);
                        await page.waitForFunction(() => reader.swipe.offset === -120);
                        assert.deepEqual(await page.evaluate(() => [reader.el.pageStage,
                            reader.swipe.slots.get(1).stage].map(stage => Number(getComputedStyle(stage).opacity))), [0, 0]);
                        await send('touchCancel', []); await rest();
                    }
                    await drag(300, 210); await rest();
                    assert.equal(await page.evaluate(() => reader.currentIndex), 4, '90px slow drag turns on every screen');
                }
            }
            await page.setViewportSize({ width: 390, height: 844 });
            await jump(3); await ready(1);
            await page.evaluate(() => reader.toggleSettingsPanel());
            const toggle = page.getByRole('switch', { name: '过渡动画' });
            const animationCard = page.locator('.comic-animation-card');
            await toggle.click();
            await page.waitForTimeout(180);
            assert.equal(await toggle.getAttribute('aria-checked'), 'false');
            assert.equal(await page.evaluate(() => reader.animationMode), 'smooth', 'switch never cycles the selected mode');
            const bounds = await animationCard.boundingBox(), switchBounds = await toggle.boundingBox();
            assert.ok(switchBounds.x >= bounds.x && switchBounds.x + switchBounds.width <= bounds.x + bounds.width);
            assert.ok(switchBounds.height >= 44);
            await page.screenshot({ path: path.join(artifacts, `${variant}-transition-switch.png`) });
            await toggle.focus(); await page.keyboard.press('Space');
            assert.equal(await toggle.getAttribute('aria-checked'), 'true');
            await page.keyboard.press('Space');
            await page.evaluate(() => { reader.hideSettingsPanel(); reader.hideControls(); });
            for (const mode of ['parallel', 'fade', 'smooth']) {
                await page.evaluate(mode => reader.setPreference('animationMode', mode), mode);
                await jump(3); await ready(1);
                assert.equal(await page.locator('.comic-page-neighbor').count(), 0, 'disabled transitions create no neighbor DOM');
                assert.equal(await page.evaluate(() => reader.swipe.slots.get(1).stage), null);
                await down(300); await move(210);
                await page.waitForFunction(() => reader.swipe.offset === -90);
                assert.deepEqual(await page.evaluate(() => {
                    const style = getComputedStyle(reader.el.pageStage);
                    return [style.transform, Number(style.opacity), reader.currentIndex];
                }), ['none', 1, 3]);
                await page.waitForTimeout(140); await up(); await rest();
                assert.equal(await page.evaluate(() => reader.currentIndex), 4);
                await page.evaluate(() => reader.el.leftBtn.click());
                await page.waitForFunction(() => reader.displayedIndex === 3);
                assert.equal(await page.evaluate(() => getComputedStyle(reader.el.imgContainer).opacity), '1');
                await page.keyboard.press('ArrowRight');
                await page.waitForFunction(() => reader.displayedIndex === 4);
                assert.equal(await page.evaluate(() => reader.swipe.animating), false);
            }
            // Equal URLs in a destination spread need separate nodes only at commit.
            await page.evaluate(() => { window.savedFifth = reader.imgList[5]; reader.imgList[5] = reader.imgList[4]; });
            await jump(2, 'double'); await ready(1);
            assert.equal(await page.evaluate(() => {
                const images = reader.swipe.slots.get(1).result.images;
                return images[0] === images[1];
            }), true, 'preparation retains cached nodes without cloning');
            await drag(300, 210); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 4);
            assert.deepEqual(await page.evaluate(() => {
                const images = [...reader.el.imgContainer.querySelectorAll('img')];
                return [images.length, images[0] !== images[1], images.every(img => img.naturalWidth > 0)];
            }), [2, true, true], 'direct commit displays both equal-URL pages');
            await page.evaluate(() => { reader.imgList[5] = savedFifth; });
            failSeven = true;
            await page.evaluate(() => {
                reader.swipe.reset(); reader.cancelPreload();
                reader.imageLoader.releaseCachedImage(reader.imgList[7]);
                reader.imgList[7] += '&off';
            });
            await jump(6); await drag(300, 210); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 6, 'failed direct turn retains the current page');
            assert.equal(await page.locator('.comic-page-neighbor').count(), 0);
            failSeven = false;
            await ready(1); await drag(300, 210); await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 7, 'direct turn can retry without a preview');
            await page.evaluate(() => { reader.close(); reader.start(); });
            await ready(1);
            assert.equal(await page.locator('.comic-page-stage').count(), 0, 'opening with animation disabled creates no stages');
            await page.evaluate(() => reader.setPreference('transitionEnabled', true));

            // Parallel button/keyboard navigation also moves both pages together.
            await page.evaluate(() => reader.setPreference('animationMode', 'parallel'));
            await jump(3); await ready(1);
            await page.evaluate(() => reader.el.rightBtn.click());
            await page.waitForFunction(() => reader.swipe.programmatic && reader.swipe.animating);
            assert.equal(await page.evaluate(() => reader.displayedIndex), 3);
            await rest();
            assert.equal(await page.evaluate(() => reader.currentIndex), 4);
            await page.keyboard.press('ArrowLeft'); await rest();
            await page.waitForFunction(() => reader.displayedIndex === 3);
            assert.equal(await page.evaluate(() => reader.currentIndex), 3);

            // Resize and close invalidate deferred motions and release preview DOM.
            await jump(3); await ready(1);
            await down(300); await move(120);
            await page.setViewportSize({ width: 400, height: 850 }); await page.waitForTimeout(50); await up();
            assert.equal(await page.evaluate(() => reader.currentIndex), 3);
            await ready(1);
            await drag(300, 120);
            await page.evaluate(() => reader.close(true));
            await page.waitForTimeout(300);
            assert.deepEqual(await page.evaluate(() => [reader.swipe.slots.size, reader.imageLoader.imageProtections.size,
                reader.imageCache.size, document.querySelectorAll('.comic-page-stage').length]), [0, 0, 0, 0]);
            await page.evaluate(() => reader.start());
            await page.waitForFunction(() => reader.el.imgContainer.children.length > 0);
            assert.equal(await page.evaluate(() => reader.suppressRemainingTouch), false);
            assert.deepEqual(errors, []);
            console.log(`${variant}: following, rebound, flick, interruption, direction/grouping, zoom/pinch, loading/failure, resize/close passed`);
            await context.close();
        }
        console.log('Swipe artifacts:', artifacts);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
