const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const launchBrowser = () => chromium.launch({ headless: true,
    ...(process.env.BPR_BROWSER_PATH ? { executablePath: process.env.BPR_BROWSER_PATH } : {}) });
const createArtifacts = name => fs.mkdtempSync(path.join(os.tmpdir(), `bpr-${name}-`));

async function mockStorage(page, variant = 'extension') {
    await page.evaluate(variant => {
        const values = {}, listeners = new Set();
        const get = async keys => structuredClone(Object.fromEntries(keys.map(key => [key, values[key]])));
        const set = async items => {
            const changes = Object.fromEntries(Object.entries(items).map(([key, newValue]) =>
                [key, { oldValue: values[key], newValue: structuredClone(newValue) }]));
            Object.assign(values, structuredClone(items));
            listeners.forEach(fn => fn(changes, 'local'));
        };
        window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } } };
        if (variant === 'userscript') {
            // Leave chrome.storage absent so the generated script uses its GM adapter.
            window.GM = {
                async getValue(key) { return structuredClone(values[key]); },
                async setValue(key, value) { values[key] = structuredClone(value); }
            };
        } else {
            window.chrome.storage = {
                local: { get, set },
                onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
            };
        }
    }, variant);
}

async function loadReader(page, { variant = 'extension', entry = false } = {}) {
    if (variant === 'userscript') {
        await page.addScriptTag({ path: path.join(root, 'dist/BiliPocketReader.user.js') });
        return;
    }
    for (const file of manifest.content_scripts[0].css) {
        // Strip the encoding marker as file-based extension loading does.
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '') });
    }
    for (const file of manifest.content_scripts[0].js) {
        if (file === 'content.js') {
            if (!entry) continue;
            await page.evaluate(() => {
                const Base = BilibiliToolbox.reader.BiliComicReader;
                BilibiliToolbox.reader.BiliComicReader = class extends Base {
                    constructor() { super(); window.reader = this; }
                };
            });
        }
        await page.addScriptTag({ path: path.join(root, file) });
    }
}

module.exports = { root, launchBrowser, createArtifacts, mockStorage, loadReader };
