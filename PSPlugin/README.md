# PSD to PNG 批量导出

在 Photoshop 的“文件 → 脚本 → 浏览”中选择 `PSD-to-PNG-Export.jsx`，选定文件夹后开始导出。脚本扫描子文件夹，PNG 保存在各 PSD 所在目录，使用相同文件名。

PNG 始终以原始尺寸无损导出，尝试转换到 sRGB；移除了原来不影响输出的“原图质量”选项。默认保留图层可见性，取消勾选后将在导出副本中显示所有图层。

脚本保持单文件、兼容 ExtendScript：界面只收集选项并显示进度；`scanPSDFiles`、`exportFile` 和 `exportBatch` 分别负责扫描、单文件导出和批处理。所有状态位于闭包内，重复运行不留下全局变量。

导出使用文档副本，用户已经打开的文档不会被转换、保存或关闭。批处理中遇到单个文件失败会继续处理其他文件，并在结束时报告完整路径；对话框模式、当前文档和临时文档统一在退出路径中清理。

从仓库根目录运行模拟 Photoshop 接口的回归检查：

```powershell
node --test PSPlugin/tests/*.test.js
```

这些检查覆盖批处理、失败恢复和文档保护；实际色彩转换与 ScriptUI 显示仍需在 Photoshop 中验证。
