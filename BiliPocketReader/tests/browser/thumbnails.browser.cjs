// Run with Node and Playwright, optionally BPR_BROWSER_PATH for system Edge/Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'bpr-thumbnails-'));
const svg = number => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
    <rect width="600" height="900" fill="${number % 2 ? '#e3edf5' : '#fcf3db'}"/>
    <rect x="30" y="30" width="540" height="840" fill="none" stroke="#243346" stroke-width="5"/>
    <text x="300" y="450" text-anchor="middle" font-family="sans-serif" font-size="64">PAGE ${number + 1}</text></svg>`;
const html = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8">' +
    '<div class="article-content">' + Array.from({ length: 80 }, (_, i) =>
        `<img width="200" height="300" src="https://i0.hdslb.com/bfs/article/page${i}.jpg@200w.webp">`).join('') + '</div>';

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.BPR_BROWSER_PATH ? { executablePath: process.env.BPR_BROWSER_PATH } : {}) });
    try {
        for (const mobile of [false, true]) {
            const context = await browser.newContext({ viewport: mobile ? { width: 393, height: 820 } : { width: 1360, height: 900 },
                hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
            const page = await context.newPage();
            const errors = [], thumbnailRequests = [];
            let failOriginal = false;
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', async route => {
                const url = route.request().url();
                if (!url.includes('hdslb.com')) return route.fulfill({ contentType: 'text/html', body: html });
                const index = Number(url.match(/page(\d+)/)[1]);
                if (url.includes('@240w.webp')) {
                    thumbnailRequests.push(index);
                    if (index === 42) return route.abort();
                }
                if (index === 69 && failOriginal && !url.includes('@')) return route.abort();
                await route.fulfill({ contentType: 'image/svg+xml', body: svg(index) });
            });
            await page.goto('https://www.bilibili.com/read/cv1');
            for (const file of manifest.content_scripts[0].css) {
                await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') });
            }
            for (const file of manifest.content_scripts[0].js.filter(file => file !== 'content.js')) {
                await page.addScriptTag({ path: path.join(root, file) });
            }
            await page.evaluate(async () => {
                window.reader = new BilibiliToolbox.reader.BiliComicReader();
                reader.preloadPages = '2';
                reader.animationMode = 'smooth';
                reader.start();
                await reader.render(false);
            });
            assert.equal(thumbnailRequests.length, 0, 'closed navigation makes no thumbnail requests');
            const controls = await page.evaluate(() => {
                reader.showControls();
                const thumbnail = reader.el.thumbnailsBtn.getBoundingClientRect();
                const reset = reader.el.resetViewBtn.getBoundingClientRect();
                return { beforeReset: reader.el.thumbnailsBtn.nextElementSibling === reader.el.resetViewBtn,
                    onLeft: thumbnail.right <= reset.left, sameRow: Math.abs(thumbnail.top - reset.top) < 1 };
            });
            assert.deepEqual(controls, { beforeReset: true, onLeft: true, sameRow: true }, 'thumbnails sit immediately left of Reset');
            const open = () => page.evaluate(() => { reader.showControls(); reader.el.thumbnailsBtn.click(); });
            await open();
            await page.waitForFunction(() => document.querySelectorAll('.comic-thumbnail img').length > 0);
            assert.equal(await page.locator('.comic-thumbnail').count(), 80);
            assert.equal(await page.locator('.comic-thumbnail.is-current').count(), 2, 'both spread pages are marked');
            assert.equal(await page.locator('.comic-thumbnail.is-current').first().getAttribute('data-index'), '0');
            assert.ok(thumbnailRequests.length < 40, 'only nearby rows load previews');
            await page.locator('.comic-thumbnail[data-index="40"]').click();
            await page.waitForFunction(() => reader.displayedIndex === 40);
            assert.equal(await page.locator('.comic-thumbnails-panel').isVisible(), false, 'choosing a page collapses navigation');
            assert.equal(await page.locator('.comic-thumbnail').count(), 0, 'closing releases thumbnail DOM');
            assert.equal(await page.evaluate(() => reader.thumbnailObserver), null);
            await open();
            await page.waitForFunction(() => document.querySelector('.comic-thumbnail[data-index="40"] img')?.complete);
            assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '40');
            assert.equal(await page.locator('.comic-thumbnail.is-current').first().getAttribute('data-index'), '40');
            const bounds = await page.locator('.comic-thumbnail[data-index="40"]').boundingBox();
            assert.ok(bounds.y > 0 && bounds.y + bounds.height < (mobile ? 820 : 900), 'opening scrolls to current page');
            await page.waitForFunction(() => document.querySelector('.comic-thumbnail[data-index="42"]')?.textContent.includes('预览不可用'));
            await page.screenshot({ path: path.join(artifacts, mobile ? 'mobile.png' : 'desktop.png') });
            if (!mobile) {
                await page.keyboard.press('ArrowRight');
                assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '41');
                assert.equal(await page.evaluate(() => reader.displayedIndex), 40, 'navigation arrows do not turn reader pages');
                await page.keyboard.press('End');
                assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '79');
                await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement === reader.el.thumbnailCloseBtn), true);
                await page.keyboard.press('Shift+Tab');
                assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '79', 'focus stays in the dialog');
            } else {
                const grid = await page.locator('.comic-thumbnails-grid').boundingBox();
                const before = await page.locator('.comic-thumbnails-grid').evaluate(el => el.scrollTop);
                const cdp = await context.newCDPSession(page);
                const x = grid.x + grid.width / 2, y = grid.y + grid.height * .8;
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
                for (let i = 1; i <= 8; i++) {
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 22 }] });
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await page.waitForFunction(before => document.querySelector('.comic-thumbnails-grid').scrollTop > before + 20, before);
                assert.equal(await page.evaluate(() => reader.displayedIndex), 40, 'touch scrolling does not turn pages');
            }
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => reader.isOpen && !reader.isThumbnailsVisible()), true);
            assert.equal(await page.evaluate(() => document.activeElement === reader.el.thumbnailsBtn), true);
            await open();
            await page.locator('.comic-thumbnail[data-index="42"]').click();
            await page.waitForFunction(() => reader.displayedIndex === 42);
            assert.equal(await page.evaluate(() => reader.activePageCount), 2, 'a failed preview remains navigable');
            failOriginal = true;
            await open();
            await page.locator('.comic-thumbnail[data-index="69"]').click();
            await page.waitForFunction(() => reader.el.toast.textContent.includes('图片加载失败'));
            assert.equal(await page.evaluate(() => reader.displayedIndex), 42, 'failed jumps retain the old spread');
            await open();
            assert.equal(await page.locator('.comic-thumbnail.is-current').first().getAttribute('data-index'), '42');
            await page.evaluate(() => reader.close(true));
            assert.equal(await page.locator('.comic-thumbnails-panel').count(), 0);
            assert.equal(await page.evaluate(() => reader.thumbnailObserver), null);
            assert.deepEqual(errors, []);
            console.log(`${mobile ? 'Mobile' : 'Desktop'} thumbnail navigation passed.`);
            await context.close();
        }
        console.log('Screenshots:', artifacts);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
