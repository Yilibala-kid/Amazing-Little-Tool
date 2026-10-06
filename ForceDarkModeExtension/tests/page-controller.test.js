const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('serialized controller enables, reads and restores each frame without popup globals', () => {
  const styles = new Map();
  const icon = { dataset: {}, getBoundingClientRect: () => ({ width: 24, height: 24 }) };
  const decor = { ...icon, dataset: {}, className: 'logo' };
  const large = { dataset: {}, getBoundingClientRect: () => ({ width: 500, height: 400 }) };
  const document = {
    documentElement: { dataset: {}, appendChild: sheet => styles.set(sheet.id, sheet) },
    getElementById: id => styles.get(id),
    createElement: () => ({ remove() { styles.delete(this.id); } }),
    querySelectorAll: selector => selector === 'img, svg' ? [icon, large] : [decor, icon, large]
  };
  const source = fs.readFileSync(path.join(__dirname, '../page-controller.js'), 'utf8');
  const popup = vm.createContext({});
  vm.runInContext(source, popup);
  // Match chrome.scripting: the function runs in a fresh page context.
  const control = vm.runInNewContext(`(${popup.controlPageDarkMode.toString()})`, {
    document, getComputedStyle: el => ({ backgroundImage: el === decor ? 'url(icon.png)' : 'none' })
  });
  const options = { styleId: 'dark-test', css: 'body { color: white; }' };
  assert.equal(control(options), false);
  assert.equal(control({ ...options, enabled: true }), true);
  assert.equal(styles.get(options.styleId).textContent, options.css);
  assert.equal(icon.dataset.forceDarkIcon, 'true');
  assert.equal(large.dataset.forceDarkIcon, undefined);
  assert.equal(decor.dataset.forceDarkDecor, 'true');
  control({ ...options, enabled: true });
  assert.equal(styles.size, 1);
  assert.equal(control(options), true);
  assert.equal(control({ ...options, enabled: false }), false);
  assert.equal(styles.size, 0);
  assert.deepEqual(document.documentElement.dataset, {});
  assert.deepEqual(icon.dataset, {});
  assert.deepEqual(decor.dataset, {});
});
