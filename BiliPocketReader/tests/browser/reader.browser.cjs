// Run with node tests/browser/reader.browser.cjs; Playwright must be resolvable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpr-browser-'));
const svg = number => '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3600">' +
    '<rect width="2400" height="3600" fill="' + (number % 2 ? '#fcf3db' : '#e3edf5') + '"/>' +
    '<rect x="90" y="90" width="2220" height="3420" fill="none" stroke="#243346" stroke-width="8"/>' +
    Array.from({ length: 75 }, (_, i) => '<text x="150" y="' + (180 + i * 44) +
        '" font-family="sans-serif" font-size="28" fill="#18222f">PAGE ' + number +
        ' — Fine text ABCDEFG abcdefg 0123456789 — straight lines and curved paper</text>').join('') + '</svg>';
const html = '<!doctype html><meta charset="utf-8"><title>Reader regression</title><div class="article-content">' +
    Array.from({ length: 12 }, (_, i) => '<img width="200" height="300" src="https://i0.hdslb.com/bfs/article/page' +
        i + '.jpg@200w.webp">').join('') + '</div>';

(async () => {
    const browser = await chromium.launch({
        headless: true, ...(process.env.BPR_BROWSER_PATH ? { executablePath: process.env.BPR_BROWSER_PATH } : {})
    });
    try {
        const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const errors = [];
        let originals = 0, delayOriginals = false;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
            const url = route.request().url();
            if (url.includes('hdslb.com')) {
                if (!url.includes('@')) {
                    originals++;
                    if (delayOriginals) await new Promise(resolve => setTimeout(resolve, 200));
                }
                await route.fulfill({ contentType: 'image/svg+xml', body: svg(Number(url.match(/page(\d+)/)?.[1] || 0)) }).catch(() => {});
            } else await route.fulfill({ contentType: 'text/html', body: html });
        });
        await page.goto('https://www.bilibili.com/read/cv1');
        await page.evaluate(() => {
            const values = {}, listeners = new Set();
            window.chrome = { storage: {
                local: {
                    async get(keys) { return structuredClone(Object.fromEntries(keys.map(key => [key, values[key]]))); },
                    async set(items) {
                        Object.assign(values, structuredClone(items));
                        const changes = Object.fromEntries(Object.entries(items).map(([key, newValue]) => [key, { newValue }]));
                        listeners.forEach(fn => fn(changes, 'local'));
                    }
                },
                onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
            }, runtime: { onMessage: { addListener() {}, removeListener() {} } } };
            const NativeImage = window.Image;
            window.trackedImages = [];
            window.preloadOverlap = false;
            window.Image = function(...args) {
                if (window.reader?.isPreparing && [...reader.imageCache.values()].some(entry => !entry.settled)) {
                    window.preloadOverlap = true;
                }
                const img = new NativeImage(...args);
                window.trackedImages.push(img);
                return img;
            };
            window.trackedCanvases = [];
            const create = document.createElement.bind(document);
            document.createElement = function(name, ...args) {
                const element = create(name, ...args);
                if (name === 'canvas') window.trackedCanvases.push(element);
                return element;
            };
        });
        for (const file of manifest.content_scripts[0].css) {
            // File-based extension loading consumes the encoding marker. A
            // literal style tag would treat it as part of the first selector.
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') });
        }
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()),
            '#ffffff', 'reader theme tokens are loaded');
        for (const file of manifest.content_scripts[0].js) {
            if (file === 'content.js') await page.evaluate(() => {
                const Base = BilibiliToolbox.reader.BiliComicReader;
                BilibiliToolbox.reader.BiliComicReader = class extends Base {
                    constructor() { super(); window.reader = this; }
                };
            });
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.locator('.comic-entry-btn').waitFor();
        await page.waitForFunction(() => reader.imageCache.size === 12 &&
            [...reader.imageCache.values()].every(entry => entry.settled));
        assert.deepEqual(await page.evaluate(() => [reader.preloadPages, reader.imageMemoryPolicy]), ['all', 'page'],
            'new installations default to all pages and release on page close');
        assert.deepEqual(await page.evaluate(() => trackedImages.map(img => Number(img.src.match(/page(\d+)/)[1]))),
            Array.from({ length: 12 }, (_, i) => i), 'all entry preloading starts at page one and requests pages in order');
        assert.equal(await page.evaluate(() => preloadOverlap), false, 'entry preload decodes one image before starting the next');
        assert.equal(await page.locator('#comic-reader-overlay').count(), 0, 'all entry warmup does not open the reader');
        await page.evaluate(() => {
            reader.close(true);
            trackedImages.length = 0;
            reader.preloadPages = '4';
            reader.prepareImages();
        });
        await page.waitForFunction(() => reader.imageCache.size === 4 &&
            [...reader.imageCache.values()].every(entry => entry.settled));
        assert.equal(await page.evaluate(() => trackedImages.length), 4, 'entry warms only the first four images');
        assert.equal(await page.locator('#comic-reader-overlay').count(), 0, 'warming does not open the reader');
        await page.evaluate(async () => {
            reader.viewMode = 'double';
            reader.start();
            await reader.render(false);
        });
        assert.equal(await page.evaluate(() => trackedImages.length), 4, 'opening reuses the warmed images');
        await page.waitForFunction(() => reader.imageCache.size === 6 &&
            [...reader.imageCache.values()].every(entry => entry.settled));
        assert.equal(await page.evaluate(() => [...reader.imageCache.keys()].map(src =>
            Number(src.match(/page(\d+)/)[1]))).then(indices => indices.join(',')), '0,1,2,3,4,5',
        'double-page reading warms the next four images');
        await page.evaluate(() => reader.close());
        assert.equal(await page.locator('#comic-reader-overlay').count(), 0);
        assert.equal(await page.evaluate(() => reader.imageCache.size), 6, 'closing the overlay retains decoded images');
        assert.equal(await page.evaluate(() => trackedImages.every(img => !img.src.startsWith('data:'))), true);
        await page.evaluate(async () => { reader.start(); await reader.render(false); });
        assert.equal(await page.evaluate(() => trackedImages.length), 6, 'reopening reuses decoded images');
        await page.locator('#comic-reader-overlay').getByRole('button', { name: '设置', exact: true }).click();
        const preloadSelect = page.getByLabel('漫画预加载', { exact: true });
        const memorySelect = page.getByLabel('图片内存', { exact: true });
        assert.deepEqual(await preloadSelect.locator('option').allTextContents(), ['2页', '4页', '6页', '全部']);
        assert.deepEqual(await memorySelect.locator('option').allTextContents(), ['关闭页释放', '释放前页']);
        const checkLoadingLayout = async () => {
            assert.equal(await page.evaluate(() => {
                const preload = reader.el.preloadSelect.getBoundingClientRect();
                const memory = reader.el.imageMemorySelect.getBoundingClientRect();
                const panel = reader.el.settingsPanel.getBoundingClientRect();
                const context = new OffscreenCanvas(1, 1).getContext('2d');
                return Math.abs(preload.top - memory.top) < 1 && preload.right <= memory.left &&
                    panel.left >= 0 && panel.right <= innerWidth &&
                    [reader.el.preloadSelect, reader.el.imageMemorySelect].every(select => {
                        const style = getComputedStyle(select);
                        context.font = style.font;
                        const textWidth = Math.max(...[...select.options].map(option => context.measureText(option.text).width));
                        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
                        return textWidth + padding + 2 <= select.getBoundingClientRect().width;
                    });
            }), true, 'preloading and memory controls share one row and fit their option labels');
        };
        await checkLoadingLayout();
        await preloadSelect.selectOption('6');
        await page.waitForFunction(() => reader.imageCache.size === 8 &&
            [...reader.imageCache.values()].every(entry => entry.settled));
        await preloadSelect.selectOption('all');
        await page.waitForFunction(() => reader.imageCache.size === 12 &&
            [...reader.imageCache.values()].every(entry => entry.settled));
        assert.ok(await page.evaluate(() => [...reader.imageCache.values()].reduce((sum, entry) => sum + entry.pixels, 0)) > 64e6,
            'all preloading retains the entire article beyond the former pixel budget');
        await memorySelect.selectOption('previous');
        await page.evaluate(async () => {
            reader.hideSettingsPanel();
            reader.viewMode = 'single';
            reader.animationMode = 'paper';
            reader.currentIndex = 4;
            window.snapshotImages = [];
            const draw = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function(img, ...args) {
                if (img instanceof HTMLImageElement) snapshotImages.push({ src: img.src, width: img.naturalWidth });
                return draw.call(this, img, ...args);
            };
            try { await reader.render(true, 4); }
            finally { CanvasRenderingContext2D.prototype.drawImage = draw; }
        });
        assert.equal(await page.evaluate(() => reader.displayedIndex), 4);
        assert.equal(await page.evaluate(() => [...reader.imageCache.keys()].every(src => Number(src.match(/page(\d+)/)[1]) >= 4)), true);
        assert.equal(await page.evaluate(() => trackedImages.slice(0, 4).every(img => img.src.startsWith('data:image/gif'))), true);
        assert.equal(await page.evaluate(() => snapshotImages.some(img => /page0\.jpg(?:@|$)/.test(img.src) && img.width === 2400)), true,
            'the outgoing paper snapshot is drawn before its source is released');
        assert.equal(await page.evaluate(() => /page4\.jpg(?:@|$)/.test(reader.el.imgContainer.firstChild.src) &&
            reader.el.imgContainer.firstChild.naturalWidth === 2400), true);
        await page.locator('.comic-paper-turn').waitFor({ state: 'detached' });
        await page.evaluate(() => reader.turnPage(null, -1));
        await page.waitForFunction(() => reader.displayedIndex === 3 &&
            reader.el.imgContainer?.querySelector('img')?.naturalWidth === 2400);
        assert.equal(await page.evaluate(() => /page3\.jpg(?:@|$)/.test(reader.el.imgContainer.firstChild.src)), true,
            'backward navigation reloads the released image');
        await page.locator('.comic-paper-turn').waitFor({ state: 'detached' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => reader.resizeFrame === null);
        await page.evaluate(() => reader.toggleSettingsPanel());
        await preloadSelect.selectOption('2');
        await page.waitForFunction(() => {
            const prefs = BilibiliToolbox.readerPreferences.load();
            return prefs.preloadPages === '2' && prefs.imageMemoryPolicy === 'previous';
        });
        await page.waitForFunction(() => getComputedStyle(reader.el.settingsPanel).opacity === '1');
        assert.equal(await page.evaluate(() => {
            const panel = reader.el.settingsPanel.getBoundingClientRect();
            return [...reader.el.settingsPanel.querySelectorAll('select')].every(select => {
                const rect = select.getBoundingClientRect();
                return rect.left >= panel.left && rect.right <= panel.right;
            }) && panel.left >= 0 && panel.right <= innerWidth;
        }), true, 'selects fit the mobile settings panel');
        assert.notEqual(await page.evaluate(() => getComputedStyle(reader.el.settingsPanel).backgroundColor), 'rgba(0, 0, 0, 0)',
            'the settings panel has an opaque background for readable text');
        await checkLoadingLayout();
        await page.screenshot({ path: path.join(artifactDir, 'mobile-settings.png') });
        await page.setViewportSize({ width: 320, height: 740 });
        await page.waitForFunction(() => reader.resizeFrame === null);
        await checkLoadingLayout();
        await page.screenshot({ path: path.join(artifactDir, 'narrow-settings.png') });
        await page.evaluate(() => {
            reader.setPreference('preloadPages', 'all');
            reader.setPreference('imageMemoryPolicy', 'page');
            reader.close(true);
        });
        await page.setViewportSize({ width: 1360, height: 900 });
        await page.evaluate(() => { trackedImages.length = trackedCanvases.length = 0; });
        const open = async mode => {
            await page.evaluate(mode => {
                reader.imageRenderMode = 'sharp';
                reader.viewMode = mode;
                reader.animationMode = 'paper';
                reader.start(); reader.start();
            }, mode);
            await page.waitForFunction(() => reader.el.imgContainer?.querySelector('img')?.naturalWidth > 0);
            assert.equal(await page.locator('#comic-reader-overlay').count(), 1);
        };
        const release = async () => {
            await page.evaluate(() => reader.close(true));
            assert.equal(await page.locator('#comic-reader-overlay').count(), 0);
            assert.equal(await page.evaluate(() => trackedCanvases.every(c => !c.width && !c.height)), true);
            assert.equal(await page.evaluate(() => trackedImages.every(img => img.src.startsWith('data:image/gif'))), true);
            assert.equal(await page.evaluate(() => reader.imageCache.size), 0);
            await page.evaluate(() => { trackedImages.length = trackedCanvases.length = 0; });
        };
        await open('double');
        assert.ok(originals >= 2);
        await page.evaluate(async () => {
            for (const index of [2, 5, 8]) { reader.currentIndex = index; void reader.render(true, 1); }
            await reader.render(false);
        });
        assert.equal(await page.evaluate(() => reader.displayedIndex), 8);
        // Exercise single/double pages, both directions, rotation and high DPI.
        const budgets = [];
        for (const mode of ['single', 'double']) {
            await page.evaluate(async mode => {
                reader.viewMode = mode; reader.currentIndex = 0; reader.rotation = 0;
                await reader.render(false);
            }, mode);
            for (const direction of [true, false]) {
                await page.evaluate(direction => { reader.isRightToLeft = direction; reader.updateDirection(); }, direction);
                await page.evaluate(async () => {
                    reader.currentIndex = 2;
                    const originalRaf = window.requestAnimationFrame;
                    window.paperFrames = new Map();
                    window.requestAnimationFrame = fn => { paperFrames.set(paperFrames.size + 1, fn); return paperFrames.size; };
                    window.restoreRaf = () => { window.requestAnimationFrame = originalRaf; };
                    await reader.render(true, 1);
                });
                assert.equal(await page.locator('.comic-paper-turn').count(), 1);
                const pixels = await page.evaluate(() => trackedCanvases.reduce((sum, c) => sum + c.width * c.height, 0));
                assert.ok(pixels <= 40e6, 'aggregate animation budget');
                budgets.push(pixels);
                await page.screenshot({ path: path.join(artifactDir, mode + '-' + direction + '-start.png') });
                await page.evaluate(() => { const fn = paperFrames.values().next().value; fn(performance.now() + 280); });
                await page.screenshot({ path: path.join(artifactDir, mode + '-' + direction + '-curl.png') });
                await page.evaluate(() => {
                    BilibiliToolbox.animations.cancel(reader.el.imgContainer);
                    restoreRaf(); delete window.restoreRaf; delete window.paperFrames;
                });
                await page.evaluate(async () => { reader.currentIndex = 0; await reader.render(false); });
            }
        }
        await page.evaluate(async () => { reader.rotation = 90; await reader.render(false); });
        await page.setViewportSize({ width: 900, height: 700 });
        await page.waitForFunction(() => reader.resizeFrame === null);
        await page.evaluate(async () => { reader.currentIndex = 2; await reader.render(true, 1); });
        await page.locator('.comic-paper-turn').waitFor({ state: 'detached' });
        await page.evaluate(async () => { reader.currentIndex = 4; await reader.render(true, 1); });
        await release(); // Close during an active animation.
        delayOriginals = true;
        await page.evaluate(() => { reader.start(); reader.close(true); });
        await page.waitForTimeout(300);
        await release(); // Close during network/decode.
        delayOriginals = false;
        await page.setViewportSize({ width: 1360, height: 900 });
        await open('single');
        await page.evaluate(() => history.pushState({}, '', '/video/BV1'));
        await page.locator('.comic-entry-btn').waitFor({ state: 'detached' });
        await release();
        await page.evaluate(() => history.pushState({}, '', '/read/cv2'));
        await page.locator('.comic-entry-btn').waitFor();
        await open('single');
        await page.evaluate(() => dispatchEvent(new Event('pagehide')));
        await release();

        const cdp = await context.newCDPSession(page);
        async function memory() {
            await page.waitForTimeout(300); // Allow cancellation placeholders and events to settle.
            await cdp.send('HeapProfiler.collectGarbage');
            return cdp.send('Memory.getDOMCounters');
        }
        await open('single'); await release();
        const before = await memory();
        for (let i = 0; i < 10; i++) {
            await open(i % 2 ? 'double' : 'single');
            await page.evaluate(async () => { reader.currentIndex = 2; await reader.render(true, 1); });
            await release();
        }
        const after = await memory();
        assert.ok(after.nodes <= before.nodes + 12, JSON.stringify({ before, after }));
        assert.ok(after.jsEventListeners <= before.jsEventListeners + 2, JSON.stringify({ before, after }));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ animationPixels: budgets, memory: { before, after }, screenshots: artifactDir }, null, 2));

        // Real DOM regression: disabled filters do not scan; mutations inspect only their outer card.
        await page.goto('https://space.bilibili.com/123/dynamic');
        for (const file of ['shared.js', 'bilibili-dom-adapter.js', 'dynamic-filter.js']) {
            await page.addScriptTag({ path: path.join(root, file) });
        }
        const result = await page.evaluate(async () => {
            document.body.innerHTML = Array.from({ length: 400 }, (_, i) =>
                '<div class="bili-dyn-list__item"><div class="bili-dyn-item">comic ' + i + '</div></div>').join('');
            const dom = BilibiliToolbox.bilibiliDom, filter = BilibiliToolbox.dynamicFilter;
            let scans = 0;
            const getCards = dom.getDynamicCards;
            dom.getDynamicCards = () => { scans++; return getCards(); };
            filter.init();
            const disabledScans = scans;
            filter.setKeywordFilterState({ enabled: true, text: 'comic' });
            const enabledScans = scans;
            const card = document.querySelector('.bili-dyn-item');
            card.firstChild.data = 'different text';
            await new Promise(resolve => setTimeout(resolve, 180));
            const incrementalScans = scans;
            const hidden = card.parentElement.classList.contains(filter.HIDDEN_FORWARD_CLASS);
            card.firstChild.data = 'comic restored';
            await new Promise(resolve => setTimeout(resolve, 180));
            const restored = !card.parentElement.classList.contains(filter.HIDDEN_FORWARD_CLASS);
            filter.setKeywordFilterState({ enabled: false });
            const classesCleared = !document.querySelector('.' + filter.FILTER_READY_CLASS);
            const stoppedScans = scans;
            card.firstChild.data = 'after disable';
            await new Promise(resolve => setTimeout(resolve, 180));
            filter.destroy();
            return { disabledScans, enabledScans, incrementalScans, hidden, restored, classesCleared, stoppedScans, finalScans: scans };
        });
        assert.equal(result.disabledScans, 0);
        assert.equal(result.enabledScans, 1);
        assert.equal(result.incrementalScans, 1);
        assert.equal(result.hidden, true);
        assert.equal(result.restored, true);
        assert.equal(result.classesCleared, true);
        assert.equal(result.finalScans, result.stoppedScans);
        console.log('Incremental dynamic filtering:', result);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
