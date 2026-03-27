/*!
 * PSD to PNG 批量导出工具
 * Author: Claude
 * Released under GPL-2.0 License
*/

// 全局变量
var g_uiStrings = null;       // UI 字符串（根据 PS 语言环境选择）
var g_uiOptions = null;       // 用户选项

/**
 * 主入口
 */
function main() {
    // 初始化
    initStrings();
    createUI();
}

// 入口
main();

/**
 * 初始化中英文字符串
 */
function initStrings() {
    // 中文
    var zh = {
        WINDOW_TITLE: "PSD to PNG 批量导出工具",
        BUTTON_FOLDER: "选择文件夹",
        BUTTON_START: "开始导出",
        BUTTON_CANCEL: "取消",
        CHECKBOX_KEEP_VISIBILITY: "保留图层可见性",
        CHECKBOX_ORIGINAL_QUALITY: "原图质量输出",
        CHECKBOX_OPEN_FOLDER: "导出完成后打开输出文件夹",
        LABEL_FOLDER: "文件夹:",
        LABEL_STATUS: "状态:",
        MSG_NO_PSD_FOUND: "未找到 PSD 文件",
        MSG_EXPORT_COMPLETE: "导出完成！共处理 %d 个文件",
        MSG_EXPORT_FAILED: "部分文件导出失败",
        MSG_SELECT_FOLDER: "请先选择文件夹",
        ERROR_OPEN_PSD: "无法打开: %s",
    };

    // 英文
    var en = {
        WINDOW_TITLE: "PSD to PNG Batch Export",
        BUTTON_FOLDER: "Select Folder",
        BUTTON_START: "Start Export",
        BUTTON_CANCEL: "Cancel",
        CHECKBOX_KEEP_VISIBILITY: "Keep Layer Visibility",
        CHECKBOX_ORIGINAL_QUALITY: "Original Quality Export",
        CHECKBOX_OPEN_FOLDER: "Open Output Folder After Export",
        LABEL_FOLDER: "Folder:",
        LABEL_STATUS: "Status:",
        MSG_NO_PSD_FOUND: "No PSD files found",
        MSG_EXPORT_COMPLETE: "Export complete! Processed %d files",
        MSG_EXPORT_FAILED: "Some files failed to export",
        MSG_SELECT_FOLDER: "Please select a folder first",
        ERROR_OPEN_PSD: "Cannot open: %s",
    };

    // 根据 PS 语言环境选择
    g_uiStrings = (app.locale === "zh_CN") ? zh : en;
}

/**
 * 创建 UI 对话框
 */
function createUI() {
    var strings = g_uiStrings;

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

    win.chkOriginalQuality = win.optionsGroup.add("checkbox", [0, 25, 360, 20], strings.CHECKBOX_ORIGINAL_QUALITY);
    win.chkOriginalQuality.value = true;

    win.chkOpenFolder = win.optionsGroup.add("checkbox", [0, 50, 360, 20], strings.CHECKBOX_OPEN_FOLDER);
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
        win.txtFolder.text = folder.fsName;
        g_uiOptions = {
            folder: folder,
            keepVisibility: win.chkKeepVisibility.value,
            originalQuality: win.chkOriginalQuality.value,
            openFolder: win.chkOpenFolder.value
        };
    }
}

function syncUIOptions(win) {
    if (!g_uiOptions) {
        g_uiOptions = {};
    }

    g_uiOptions.keepVisibility = win.chkKeepVisibility.value;
    g_uiOptions.originalQuality = win.chkOriginalQuality.value;
    g_uiOptions.openFolder = win.chkOpenFolder.value;

    return g_uiOptions;
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
    var files = folder.getFiles();

    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file instanceof Folder) {
            // 递归处理子文件夹
            psdFiles = psdFiles.concat(scanPSDFiles(file));
        } else if (isPSDFile(file)) {
            psdFiles.push(file);
        }
    }

    return psdFiles;
}

/**
 * 将打开的文档导出为 PNG
 * 导出设置: sRGB, 100%缩放, PNG格式
 * @param {File} targetFile 目标 PNG 文件
 */
function exportDocumentAsPNG(targetFile) {
    var doc = app.activeDocument;

    // 记录原始设置
    var originalDialogMode = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;

    try {
        // 尝试转换为 sRGB 色彩空间（如果需要）
        try {
            doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true);
        } catch (e) {
            // 如果已经是 sRGB 或没有颜色管理，可能报错，忽略继续
        }

        // 使用 Save As 方式导出 PNG（更可靠）
        var pngSaveOptions = new PNGSaveOptions();
        pngSaveOptions.compression = 9;  // 最大压缩

        doc.saveAs(targetFile, pngSaveOptions, true, Extension.LOWERCASE);

    } finally {
        app.displayDialogs = originalDialogMode;
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
    progressWin.bar = progressWin.add("progressbar", [20, 50, 360, 20], 0, 100);

    return progressWin;
}

/**
 * 开始导出
 */
function startExport(win) {
    var strings = g_uiStrings;
    var progressWin = null;

    syncUIOptions(win);

    if (!g_uiOptions || !g_uiOptions.folder) {
        alert(strings.MSG_SELECT_FOLDER);
        return;
    }

    var folder = g_uiOptions.folder;
    var psdFiles = scanPSDFiles(folder);

    if (psdFiles.length === 0) {
        alert(strings.MSG_NO_PSD_FOUND);
        return;
    }

    // 关闭对话框
    win.close();

    // 创建进度窗口（需要短暂延迟确保主窗口完全关闭）
    $.sleep(100);
    var progressWin = createProgressWindow(strings.WINDOW_TITLE, "准备导出...");

    progressWin.show();

    var successCount = 0;
    var failCount = 0;
    var failedFiles = [];

    for (var i = 0; i < psdFiles.length; i++) {
        // 更新进度
        var progress = Math.round(((i + 1) / psdFiles.length) * 100);
        progressWin.bar.value = progress;
        progressWin.status.text = strings.LABEL_STATUS + " " + (i + 1) + "/" + psdFiles.length;

        var psdFile = psdFiles[i];
        var pngFile = new File(psdFile.parent.fsName + "/" + psdFile.name.replace(/\.psd$/i, ".png"));
        var doc = null;

        try {
            doc = app.open(psdFile);
            exportDocumentAsPNG(pngFile);
            successCount++;
        } catch (e) {
            failCount++;
            failedFiles.push(psdFile.name + " - " + e.message);
        } finally {
            if (doc !== null) {
                try {
                    doc.close(SaveOptions.DONOTSAVECHANGES);
                } catch (closeError) {
                }
            }
        }
    }

    // 完成进度
    progressWin.bar.value = 100;
    progressWin.status.text = strings.MSG_EXPORT_COMPLETE.replace("%d", successCount);

    // 延迟关闭进度窗口
    $.sleep(500);
    progressWin.close();

    // 显示结果
    var message = strings.MSG_EXPORT_COMPLETE.replace("%d", successCount);
    if (failCount > 0) {
        message += "\n" + strings.MSG_EXPORT_FAILED + "\n" + failedFiles.join("\n");
    }

    alert(message);

    if (g_uiOptions.openFolder && psdFiles.length > 0) {
        var outputFolder = new Folder(psdFiles[0].parent.fsName);
        outputFolder.execute();
    }
}

// ==================== 工具函数 ====================
