const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  const closed = [], saved = [];
  class Folder {
    constructor(name, files = []) { this.fsName = name; this.files = files; }
    getFiles() { return this.files; }
  }
  class File {
    constructor(name) {
      this.fsName = name;
      this.name = name.split('/').pop();
      this.parent = new Folder(name.slice(0, name.lastIndexOf('/')));
    }
  }
  const app = {
    locale: 'en', displayDialogs: 'ALL', documents: [], activeDocument: null,
    open(file) {
      if (file.name === 'broken.psd') throw new Error('Open failed');
      const doc = {
        fullName: file,
        close() { closed.push(file.fsName); },
        duplicate() {
          const doc = {
            layers: [{ typename: 'LayerSet', visible: false, layers: [{ visible: false }] }],
            convertProfile() {},
            saveAs(target) {
              if (file.name === 'save-failed.psd') throw new Error('Save failed');
              saved.push({ path: target.fsName, layers: doc.layers });
            },
            close() { closed.push(`${file.fsName}:copy`); }
          };
          return doc;
        }
      };
      return doc;
    }
  };
  const context = vm.createContext({ app, File, Folder, module: { exports: {} },
    PNGSaveOptions: function() {}, Intent: { RELATIVECOLORIMETRIC: 1 },
    Extension: { LOWERCASE: 1 }, SaveOptions: { DONOTSAVECHANGES: 1 }, DialogModes: { NO: 'NO' }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../PSD-to-PNG-Export.jsx'), 'utf8'), context);
  return { ...context.module.exports, app, File, Folder, closed, saved };
}

test('batch continues after file failures and restores Photoshop state without closing user documents', () => {
  const h = load();
  const existingFile = new h.File('/art/existing.psd');
  const existing = h.app.open(existingFile);
  h.app.documents.push(existing);
  h.app.activeDocument = existing;
  const progress = [];
  const result = h.exportBatch([
    existingFile, new h.File('/art/broken.psd'), new h.File('/art/save-failed.psd'), new h.File('/art/new.PSD')
  ], { keepVisibility: false }, (done, total) => {
    assert.equal(h.app.displayDialogs, 'NO');
    progress.push([done, total]);
  });
  assert.equal(result.successCount, 2);
  assert.equal(result.failedFiles.length, 2);
  assert.equal(h.app.displayDialogs, 'ALL');
  assert.equal(h.app.activeDocument, existing);
  assert.equal(h.closed.includes(existingFile.fsName), false);
  assert.ok(h.closed.includes('/art/save-failed.psd:copy'));
  assert.ok(h.closed.includes('/art/save-failed.psd'));
  assert.equal(h.saved[1].path, '/art/new.png');
  assert.equal(h.saved[0].layers[0].layers[0].visible, true);
  assert.deepEqual(progress, [[1, 4], [2, 4], [3, 4], [4, 4]]);
});

test('scan includes nested PSD files and excludes other formats; progress failures restore dialogs', () => {
  const h = load();
  const file = new h.File('/art/a.psd');
  const folder = new h.Folder('/art', [file, new h.Folder('/art/sub', [new h.File('/art/sub/b.PSD')]),
    new h.File('/art/image.png')]);
  assert.deepEqual(Array.from(h.scanPSDFiles(folder), file => file.name), ['a.psd', 'b.PSD']);
  assert.throws(() => h.exportBatch([file], { keepVisibility: true }, () => { throw new Error('UI failed'); }), /UI failed/);
  assert.equal(h.app.displayDialogs, 'ALL');
  assert.equal(h.saved[0].layers[0].visible, false);
});
