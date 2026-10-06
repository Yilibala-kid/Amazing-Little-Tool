/*!
 * PSD to PNG 批量导出工具
 * Released under GPL-2.0 License
*/

(function() {
var strings = getStrings();

function getStrings() {
    // 中文
    var zh = {
        WINDOW_TITLE: "PSD to PNG 批量导出工具",
        BUTTON_FOLDER: "选择文件夹",
        BUTTON_START: "开始导出",
        BUTTON_CANCEL: "取消",
        CHECKBOX_KEEP_VISIBILITY: "保留图层可见性",
        CHECKBOX_OPEN_FOLDER: "导出完成后打开输出文件夹",
        LABEL_FOLDER: "文件夹:",
        LABEL_STATUS: "状态:",
        MSG_NO_PSD_FOUND: "未找到 PSD 文件",
        MSG_EXPORT_COMPLETE: "导出完成！共处理 %d 个文件",
        MSG_EXPORT_FAILED: "部分文件导出失败",
        MSG_SELECT_FOLDER: "请先选择文件夹"
    };

    // 英文
    var en = {
        WINDOW_TITLE: "PSD to PNG Batch Export",
        BUTTON_FOLDER: "Select Folder",
        BUTTON_START: "Start Export",
        BUTTON_CANCEL: "Cancel",
        CHECKBOX_KEEP_VISIBILITY: "Keep Layer Visibility",
        CHECKBOX_OPEN_FOLDER: "Open Output Folder After Export",
        LABEL_FOLDER: "Folder:",
        LABEL_STATUS: "Status:",
        MSG_NO_PSD_FOUND: "No PSD files found",
        MSG_EXPORT_COMPLETE: "Export complete! Processed %d files",
        MSG_EXPORT_FAILED: "Some files failed to export",
        MSG_SELECT_FOLDER: "Please select a folder first"
    };

    // 根据 PS 语言环境选择
    return (app.locale === "zh_CN") ? zh : en;
}

/**
 * 创建 UI 对话框
 */
function createUI() {

    // 创建窗口
    var win = new Window("dialog", strings.WINDOW_TITLE, [0, 0, 400, 220]);
    win.center();

    // 文件夹选择区域
    win.folderGroup = win.add("group", [20, 20, 380, 50]);
    win.folderGroup.orientation = "row";

    win.btnFolder = win.folderGroup.add("button", [0, 0, 100, 28], strings.BUTTON_FOLDER);
    win.txtFolder = win.folderGroup.add("edittext", [110, 3, 360, 25], strings.MSG_SELECT_FOLDER);
    win.txtFolder.readonly = true;

    // 复选框区域
    win.optionsGroup = win.add("group", [20, 65, 380, 140]);
    win.optionsGroup.orientation = "column";
    win.optionsGroup.alignment = "left";

    win.chkKeepVisibility = win.optionsGroup.add("checkbox", [0, 0, 360, 20], strings.CHECKBOX_KEEP_VISIBILITY);
    win.chkKeepVisibility.value = true;

    win.chkOpenFolder = win.optionsGroup.add("checkbox", [0, 25, 360, 20], strings.CHECKBOX_OPEN_FOLDER);
    win.chkOpenFolder.value = false;

    // 按钮区域
    win.btnGroup = win.add("group", [140, 165, 380, 195]);
    win.btnGroup.orientation = "row";

    win.btnStart = win.btnGroup.add("button", [0, 0, 100, 28], strings.BUTTON_START);
    win.btnCancel = win.btnGroup.add("button", [120, 0, 100, 28], strings.BUTTON_CANCEL);

    // 事件绑定
    win.btnFolder.onClick = function() { selectFolder(win); };
    win.btnStart.onClick = function() { startExport(win); };
    win.btnCancel.onClick = function() { win.close(); };

    win.show();
}

/**
 * 文件夹选择逻辑
 */
function selectFolder(win) {
    var folder = Folder.selectDialog();
    if (folder !== null) {
        win.selectedFolder = folder;
        win.txtFolder.text = folder.fsName;
    }
}

function readUIOptions(win) {
    return {
        folder: win.selectedFolder,
        keepVisibility: win.chkKeepVisibility.value,
        openFolder: win.chkOpenFolder.value
    };
}

function isPSDFile(file) {
    return file instanceof File && /\.psd$/i.test(file.name);
}

/**
 * 递归扫描文件夹中的所有 PSD 文件
 * @param {Folder} folder 文件夹
 * @returns {Array} PSD 文件数组
 */
function scanPSDFiles(folder) {
    var psdFiles = [];
    var pending = [folder];
    while (pending.length) {
        var files = pending.pop().getFiles();
        for (var i = 0; i < files.length; i++) {
            if (files[i] instanceof Folder) pending.push(files[i]);
            else if (isPSDFile(files[i])) psdFiles.push(files[i]);
        }
    }
    return psdFiles;
}

/**
 * 将打开的文档导出为 PNG
 * 导出设置: sRGB, 100%缩放, PNG格式
 * @param {File} targetFile 目标 PNG 文件
 */
function exportDocumentAsPNG(doc, targetFile) {
    try {
        doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true);
    } catch (error) {
        // Documents already in sRGB can reject redundant profile conversion.
    }
    var pngOptions = new PNGSaveOptions();
    pngOptions.compression = 9;
    doc.saveAs(targetFile, pngOptions, true, Extension.LOWERCASE);
}

function showAllLayers(layers) {
    for (var i = 0; i < layers.length; i++) {
        layers[i].visible = true;
        if (layers[i].typename === "LayerSet") showAllLayers(layers[i].layers);
    }
}

function findOpenDocument(file) {
    for (var i = 0; i < app.documents.length; i++) {
        try {
            if (app.documents[i].fullName.fsName === file.fsName) return app.documents[i];
        } catch (error) { /* Unsaved documents have no fullName. */ }
    }
    return null;
}

function closeWithoutSaving(doc) {
    if (!doc) return;
    try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (error) {}
}

function exportFile(file, options) {
    var source = findOpenDocument(file);
    var owned = !source;
    var working = null;
    try {
        if (!source) source = app.open(file);
        // Never change or close a document that the user already has open.
        working = source.duplicate();
        if (!options.keepVisibility) showAllLayers(working.layers);
        var target = new File(file.parent.fsName + "/" + file.name.replace(/\.psd$/i, ".png"));
        exportDocumentAsPNG(working, target);
    } finally {
        closeWithoutSaving(working);
        if (owned) closeWithoutSaving(source);
    }
}

function exportBatch(files, options, onProgress) {
    var originalDialogs = app.displayDialogs;
    var originalDocument = app.documents.length ? app.activeDocument : null;
    var result = { successCount: 0, failedFiles: [] };
    app.displayDialogs = DialogModes.NO;
    try {
        for (var i = 0; i < files.length; i++) {
            try {
                exportFile(files[i], options);
                result.successCount++;
            } catch (error) {
                result.failedFiles.push(files[i].fsName + " - " + error.message);
            }
            if (onProgress) onProgress(i + 1, files.length);
        }
        return result;
    } finally {
        app.displayDialogs = originalDialogs;
        if (originalDocument) app.activeDocument = originalDocument;
    }
}

/**
 * 创建进度对话框
 * @param {string} title 标题
 * @param {string} message 消息
 * @returns {Window} 进度窗口
 */
function createProgressWindow(title, message) {
    var progressWin = new Window("palette", title, [0, 0, 400, 100]);
    progressWin.center();

    progressWin.status = progressWin.add("statictext", [20, 20, 380, 30], message);
    progressWin.bar = progressWin.add("progressbar", [20, 50, 380, 70], 0, 100);

    return progressWin;
}

/**
 * 开始导出
 */
function startExport(win) {
    var options = readUIOptions(win);
    if (!options.folder) { alert(strings.MSG_SELECT_FOLDER); return; }
    var files;
    try { files = scanPSDFiles(options.folder); }
    catch (error) { alert(error.message); return; }
    if (!files.length) { alert(strings.MSG_NO_PSD_FOUND); return; }

    win.close();
    var progressWin = createProgressWindow(strings.WINDOW_TITLE, strings.LABEL_STATUS);
    var result;
    try {
        progressWin.show();
        result = exportBatch(files, options, function(done, total) {
            progressWin.bar.value = Math.round(done / total * 100);
            progressWin.status.text = strings.LABEL_STATUS + " " + done + "/" + total;
            progressWin.update();
        });
    } catch (error) {
        alert(error.message);
        return;
    } finally {
        progressWin.close();
    }
    var message = strings.MSG_EXPORT_COMPLETE.replace("%d", result.successCount);
    if (result.failedFiles.length)
        message += "\n" + strings.MSG_EXPORT_FAILED + "\n" + result.failedFiles.join("\n");
    alert(message);
    if (options.openFolder) options.folder.execute();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { scanPSDFiles: scanPSDFiles, exportBatch: exportBatch };
} else {
    createUI();
}
})();
