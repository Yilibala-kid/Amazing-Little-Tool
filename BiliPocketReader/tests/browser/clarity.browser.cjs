// Run with Node + Playwright; BPR_BROWSER_PATH optionally selects Edge/Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'bpr-clarity-'));

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.BPR_BROWSER_PATH ? { executablePath: process.env.BPR_BROWSER_PATH } : {}) });
    try {
        for (const variant of ['extension', 'userscript']) {
            const context = await browser.newContext({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 1, hasTouch: true });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const raster = Buffer.from(await page.evaluate(() => {
                const canvas = document.createElement('canvas');
                canvas.width = 512; canvas.height = 768;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, 0, 512, 768);
                ctx.fillStyle = '#606060'; ctx.fillRect(60, 60, 196, 648);
                ctx.fillStyle = '#a0a0a0'; ctx.fillRect(256, 60, 196, 648);
                ctx.fillStyle = '#333'; ctx.font = '18px sans-serif';
                for (let y = 100; y < 700; y += 50) ctx.fillText('漫画 ABC 0123 细线', 100, y);
                return canvas.toDataURL().split(',')[1];
            }), 'base64');
            await page.route('**/*', route => route.request().url().includes('hdslb.com')
                ? route.fulfill({ contentType: 'image/png', body: raster, headers: { 'access-control-allow-origin': '*' } })
                : route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div class="article-content">' +
                    [0, 1, 2].map(i => `<img src="https://i0.hdslb.com/bfs/article/page${i}.png">`).join('') + '</div>' }));
            await page.goto('https://www.bilibili.com/read/cv1');
            await page.evaluate(() => {
                const values = {};
                window.GM = { async getValue(key) { return values[key]; }, async setValue(key, value) { values[key] = value; } };
                const listeners = new Set();
                window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } }, storage: {
                    local: {
                        async get(keys) { return Object.fromEntries(keys.map(key => [key, values[key]])); },
                        async set(items) {
                            Object.assign(values, items);
                            const changes = Object.fromEntries(Object.entries(items).map(([key, newValue]) => [key, { newValue }]));
                            listeners.forEach(fn => fn(changes, 'local'));
                        }
                    },
                    onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } }
                } };
            });
            if (variant === 'extension') {
                for (const file of manifest.content_scripts[0].css) {
                    await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') });
                }
                for (const file of manifest.content_scripts[0].js.filter(file => file !== 'content.js')) {
                    await page.addScriptTag({ path: path.join(root, file) });
                }
            } else {
                // Exercise the userscript's own storage adapter, not the extension mock.
                await page.evaluate(() => { delete window.chrome.storage; });
                await page.addScriptTag({ path: path.join(root, 'dist/BiliPocketReader.user.js') });
            }
            await page.evaluate(async () => {
                await BilibiliToolbox.storage.init();
                window.reader = new BilibiliToolbox.reader.BiliComicReader();
                reader.start();
            });
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()), '#ffffff');
            await page.waitForFunction(() => reader.el.imgContainer.children.length === 2);
            assert.equal(await page.evaluate(() => reader.clarityStrength), 0);
            await page.locator('.comic-settings-controls button').filter({ hasText: /^设置$/ }).click();
            await page.waitForFunction(() => getComputedStyle(reader.el.settingsPanel).opacity === '1');
            const setting = page.locator('[data-preference-key="clarityStrength"]');
            await setting.click();
            assert.equal(await setting.locator('.comic-setting-value').innerText(), '轻度');
            await page.waitForFunction(() => BilibiliToolbox.readerPreferences.load().clarityStrength === 40);
            await setting.focus();
            await page.keyboard.press('Enter');
            assert.equal(await setting.locator('.comic-setting-value').innerText(), '较强');
            await page.keyboard.press('Space');
            assert.equal(await page.evaluate(() => reader.clarityStrength), 0);
            await setting.click();
            await page.waitForFunction(() => BilibiliToolbox.readerPreferences.load().clarityStrength === 40);
            await page.evaluate(() => reader.hideSettingsPanel());
            const before = await page.evaluate(() => {
                reader.scale = 1.4; reader.translateX = 20; reader.translateY = -35; reader.applyTransform();
                return [reader.scale, reader.translateX, reader.translateY, reader.rotation, reader.currentIndex];
            });
            await page.evaluate(() => reader.setPreference('clarityStrength', 0));
            assert.equal(await page.evaluate(() => reader.getReaderClarityFilterCss()), 'none');
            await page.evaluate(() => reader.setPreference('clarityStrength', 40));
            assert.match(await page.evaluate(() => reader.getReaderClarityFilterCss()), /^url/);
            const touch = await context.newCDPSession(page);
            assert.deepEqual(await page.evaluate(() => [reader.scale, reader.translateX, reader.translateY, reader.rotation, reader.currentIndex]), before);

            // Verify exported pixels, not merely the presence of a CSS setting.
            await page.evaluate(() => {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgb(96,96,96)'; ctx.fillRect(0, 0, 8, 16);
                ctx.fillStyle = 'rgb(160,160,160)'; ctx.fillRect(8, 0, 8, 16);
                window.exportSource = canvas.toDataURL();
                reader.rotation = 0;
            });
            const exports = [];
            for (const strength of [0, 40, 100]) {
                await page.evaluate(strength => reader.setPreference('clarityStrength', strength), strength);
                const downloadEvent = page.waitForEvent('download');
                const result = await page.evaluate(async () => {
                    const rect = { x: 0, y: 0, width: 16, height: 16 };
                    const pending = BilibiliToolbox.readerScreenshot.capture(reader, rect, [{ ...rect, src: exportSource }]);
                    reader.setPreference('clarityStrength', 0);
                    return pending;
                });
                assert.equal(result, true, 'screenshot encodes the clarity filter without tainting the canvas');
                const download = await downloadEvent;
                const output = path.join(artifacts, `${variant}-${strength}.png`);
                await download.saveAs(output);
                exports.push(await page.evaluate(async bytes => {
                    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
                    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
                    return Array.from(ctx.getImageData(0, 8, 16, 1).data);
                }, [...fs.readFileSync(output)]));
                assert.equal(await page.locator('feConvolveMatrix').count(), 1, 'export filter is released after encoding');
            }
            assert.equal(exports[0][7 * 4], 96);
            assert.equal(exports[0][8 * 4], 160);
            assert.ok(exports[1][7 * 4] < 96, 'sharpening darkens the dark side of an edge');
            assert.ok(exports[1][8 * 4] > 160, 'sharpening lightens the light side of an edge');
            assert.equal(exports[1][2 * 4], 96, 'flat areas keep their brightness');
            assert.equal(exports[1][2 * 4 + 3], 255, 'opacity is preserved');
            assert.ok(exports[2][7 * 4] < exports[1][7 * 4], 'higher strength increases edge contrast even when the setting changes during export');
            assert.ok(exports[2][8 * 4] > exports[1][8 * 4]);

            await page.evaluate(() => { reader.setPreference('clarityStrength', 40); reader.resetTransform(); reader.hideControls(); });
            const displayedImage = page.locator('.comic-img-container img').first();
            const enhancedPixels = await displayedImage.screenshot();
            await page.screenshot({ path: path.join(artifacts, `${variant}-enhanced.png`) });
            await page.evaluate(() => reader.setPreference('clarityStrength', 0));
            const originalPixels = await displayedImage.screenshot();
            assert.notDeepEqual(enhancedPixels, originalPixels, 'the visible image pixels change, not only the export');
            await page.screenshot({ path: path.join(artifacts, `${variant}-original.png`) });
            await page.evaluate(() => { reader.setPreference('clarityStrength', 40); reader.close(); reader.start(); });
            await page.waitForFunction(() => reader.el.imgContainer.children.length === 2);
            assert.equal(await page.evaluate(() => reader.clarityStrength), 40);
            assert.equal(await page.evaluate(() => document.querySelectorAll('feConvolveMatrix').length), 1, 'reopening does not leak filters');
            for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
                await page.setViewportSize(viewport);
                await page.evaluate(() => reader.toggleSettingsPanel());
                await page.waitForFunction(() => getComputedStyle(reader.el.settingsPanel).opacity === '1');
                assert.equal(await page.locator('.comic-setting-btn').count(), 10);
                await setting.scrollIntoViewIfNeeded();
                const rect = await setting.boundingBox();
                assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
                assert.ok(rect.y >= 0 && rect.y + rect.height <= viewport.height);
                const currentPage = await page.evaluate(() => reader.currentIndex);
                const currentStrength = await page.evaluate(() => reader.clarityStrength);
                const touchY = rect.y + rect.height / 2;
                const touchX = rect.x + rect.width / 2;
                await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
                await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                const expectedStrength = currentStrength === 40 ? 100 : 0;
                await page.waitForFunction(expected => BilibiliToolbox.readerPreferences.load().clarityStrength === expected, expectedStrength);
                assert.equal(await page.evaluate(() => reader.currentIndex), currentPage, 'touching the setting never turns the page');
                await page.screenshot({ path: path.join(artifacts, `${variant}-${viewport.width}-settings.png`) });
                await page.evaluate(() => reader.hideSettingsPanel());
            }
            assert.deepEqual(errors, []);
            console.log(`${variant}: clarity controls, touch, view preservation, PNG pixels, reopen and mobile layout passed`);
            await context.close();
        }
        console.log('Clarity artifacts:', artifacts);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
