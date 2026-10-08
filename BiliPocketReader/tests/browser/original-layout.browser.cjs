// Run with Node and Playwright; BPR_BROWSER_PATH may select system Edge/Chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'bpr-original-layout-'));

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.BPR_BROWSER_PATH ? { executablePath: process.env.BPR_BROWSER_PATH } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // Use a decoded raster, not an SVG: long originals stress image paint bounds.
        const raster = Buffer.from(await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 2400; canvas.height = 16000;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fcf3db'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#243346'; ctx.font = '64px sans-serif';
            for (let y = 100; y < canvas.height; y += 180) {
                ctx.fillText('Original image — fine text ABC 0123456789', 100, y);
                ctx.fillRect(80, y + 30, 2240, 4);
            }
            const result = canvas.toDataURL('image/png').split(',')[1];
            canvas.width = canvas.height = 1;
            return result;
        }), 'base64');
        await page.route('**/*', route => route.request().url().includes('hdslb.com')
            ? route.fulfill({ contentType: 'image/png', body: raster })
            : route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="article-content">' +
                [0, 1, 2, 3].map(i => `<img width="60" height="400" src="https://i0.hdslb.com/bfs/article/long${i}.png">`).join('') + '</div>' }));
        await page.goto('https://www.bilibili.com/read/cv1');
        for (const file of manifest.content_scripts[0].css) {
            await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') });
        }
        for (const file of manifest.content_scripts[0].js.filter(file => file !== 'content.js')) {
            await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(async () => {
            window.reader = new BilibiliToolbox.reader.BiliComicReader();
            reader.preloadPages = '2'; reader.imageMemoryPolicy = 'previous';
            reader.start(); await reader.render(false);
        });
        const checkLayout = async () => {
            const issues = await page.evaluate(() => {
                const issues = [];
                const bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
                const inside = (rect, box) => rect.left >= box.left - 1 && rect.top >= box.top - 1 &&
                    rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1;
                const images = [...reader.el.imgContainer.querySelectorAll('img')];
                for (const img of images) {
                    if (img.naturalHeight !== 16000) issues.push('original resolution lost');
                    if (Math.max(img.offsetWidth, img.offsetHeight) > Math.max(innerWidth, innerHeight) + 1)
                        issues.push('oversized image layout');
                    if (!inside(img.getBoundingClientRect(), bounds)) issues.push('image outside viewport');
                }
                const rects = images.map(img => img.getBoundingClientRect()).sort((a, b) => a.left - b.left);
                if (rects.length === 2 && rects[0].right > rects[1].left) issues.push('rotated pages overlap');
                reader.showControls();
                for (const panel of [reader.el.controls, reader.el.settingsControls]) {
                    if (!inside(panel.getBoundingClientRect(), bounds)) issues.push('controls outside viewport');
                    if (panel.scrollWidth > panel.clientWidth + 1) issues.push('controls horizontally clipped');
                    if (panel.scrollHeight > panel.clientHeight + 1) issues.push('toolbar buttons require scrolling');
                    if (getComputedStyle(panel).backdropFilter !== 'none') issues.push('controls repaint the image backdrop');
                    for (const button of panel.querySelectorAll('button')) {
                        button.scrollIntoView({ block: 'nearest' });
                        const rect = button.getBoundingClientRect();
                        if (!inside(rect, panel.getBoundingClientRect())) issues.push(button.innerText + ' clipped');
                        if (!button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)))
                            issues.push(button.innerText + ' obscured');
                    }
                }
                return issues;
            });
            assert.deepEqual(issues, [], JSON.stringify(await page.evaluate(() => ({
                width: innerWidth, height: innerHeight, rotation: reader.rotation
            }))));
        };
        for (const viewport of [{ width: 1360, height: 900 }, { width: 320, height: 568 }, { width: 568, height: 320 }]) {
            await page.setViewportSize(viewport);
            for (const rotation of [0, 90, 270]) {
                await page.evaluate(async rotation => {
                    reader.rotation = rotation; reader.viewMode = 'double'; await reader.render(false);
                }, rotation);
                await checkLayout();
                await page.screenshot({ path: path.join(artifacts, `${viewport.width}-${rotation}.png`) });
            }
        }
        await page.setViewportSize({ width: 1360, height: 900 });
        await page.evaluate(async () => { reader.rotation = 0; reader.viewMode = 'single'; await reader.render(false); });
        const zoom = await page.evaluate(() => {
            reader.zoomAt(innerWidth / 2, innerHeight / 2, reader.getDoubleClickScale());
            return reader.el.imgContainer.querySelector('img').getBoundingClientRect().height;
        });
        assert.ok(Math.abs(zoom - 16000) < 2, 'double-click scale still reaches native pixels');
        await page.evaluate(() => reader.resetScaleAndPan());
        for (const animation of ['smooth', 'fade']) {
            await page.evaluate(async animation => {
                reader.animationMode = animation; reader.currentIndex = reader.currentIndex === 0 ? 2 : 0;
                await reader.render(true, 2);
            }, animation);
            await page.waitForFunction(() => reader.currentIndex === reader.displayedIndex &&
                !reader.el.imgContainer.getAnimations().some(a => a.playState === 'running'));
            await checkLayout();
        }
        await page.evaluate(() => reader.close(true));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ result: 'Large original layout, rotation, controls, zoom and page transitions passed', screenshots: artifacts }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
