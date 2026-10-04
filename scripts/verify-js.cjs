const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tools = ['BiliPocketReader', 'betterX', 'ForceDarkModeExtension', 'PSPlugin'];
const tests = [];
let checked = 0;

function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (!['vendor', 'dist', 'node_modules', 'sample', 'browser'].includes(entry.name)) walk(file);
        } else if (/\.(js|jsx|cjs)$/.test(file)) {
            new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
            checked++;
            if (file.endsWith('.test.js')) tests.push(file);
        }
    }
}

for (const tool of tools) {
    const directory = path.join(root, tool);
    walk(directory);
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const resources = (manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]);
    if (manifest.background?.service_worker) resources.push(manifest.background.service_worker);
    if (manifest.action?.default_popup) resources.push(manifest.action.default_popup);
    for (const resource of resources) {
        const file = path.join(directory, resource);
        assert.ok(fs.existsSync(file), `${tool}: missing ${resource}`);
        if (!file.endsWith('.html')) continue;
        const html = fs.readFileSync(file, 'utf8');
        for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
            assert.ok(fs.existsSync(path.resolve(path.dirname(file), match[1])), `${tool}: missing ${match[1]}`);
        }
    }
}

const readerRoot = path.join(root, 'BiliPocketReader');
const bundle = fs.readFileSync(path.join(readerRoot, 'dist/BiliPocketReader.user.js'), 'utf8').replace(/\r\n/g, '\n');
new vm.Script(bundle, { filename: 'BiliPocketReader.user.js' });
const manifest = JSON.parse(fs.readFileSync(path.join(readerRoot, 'manifest.json'), 'utf8'));
for (const script of manifest.content_scripts[0].js) {
    const source = fs.readFileSync(path.join(readerRoot, script), 'utf8')
        .replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/[\r\n]+$/, '');
    assert.ok(bundle.includes(`// ===== ${script} =====\n${source}`), `Rebuild userscript: ${script} is stale`);
}
console.log(`Checked syntax of ${checked} source/test files, extension resources and userscript source parity.`);
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
