# 播放结构

文件 → 加载器 → 内容数据 → 渲染源 → 分块缓存 → 循环滚动

- `IContentLoader` 声明格式名称、扩展名和读取方法。`ContentLoaderFactory` 从同一份声明生成选择框、首页格式提示和加载分派，新增格式无需修改窗口里的筛选字符串。
- `ContentFile` 统一图片、TXT 和 PDF 的有界字节读取，在同一个文件句柄上检查大小并读取完整快照，支持取消；各加载器保留自己的格式检查和限制文案。
- `DisplayDocument` 保存内容快照。PDF 保留原始字节，避免缩放时重新读取用户文件，也不预先展开整本文档的页面图片。
- `IRenderSource` 只负责内容高度、阅读位置边界和局部画面。`WpfRenderSource` 处理图片/TXT/DOCX，`PdfRenderSource` 处理 PDF。渲染源由后台工作线程创建、使用和释放。
- `RenderedDocument` 统一负责循环分割线、256 物理像素分块、DPI、阅读位置恢复、预加载和 96 MiB 图片缓存。逐块绘制无需按文件格式分支。
- `LoopSurface` 负责复用并平移可见分块；`MainWindow` 负责文件选择、播放状态、快捷键、全屏和取消请求。
- 窗口直接从滑条读取速度和缩放，文字提示使用 WPF 绑定，不再保存重复数值；文本视觉树以 `Border` 包裹段落面板，`WpfRenderSource` 从该面板提取阅读位置边界。
- `PdfNative` 隔离 PDFium 原生接口。PDF 文档、页面和位图均有明确释放位置，原生调用共用一把锁以符合 PDFium 的线程要求。
- `PptContentLoader` 支持 PPT/PPTX，`PowerPointConverter` 检测本机 PowerPoint、创建独立临时源文件快照并启动同一 EXE 的 `--convert-ppt` 后台模式。`PowerPointWorker` 在 STA 启动线程上以只读方式打开副本，禁用宏，导出静态 PDF（不含隐藏页），然后关闭副本并释放 COM 对象。结果复用 `DisplayPdf`，不增加渲染分支。
- PPT 转换有 2 分钟等待上限，取消时先请求正常清理，必要时只结束转换辅助进程，不强制结束可能承载用户文稿的 PowerPoint。辅助进程监测父进程退出，防止播放器退出后继续无限等待。请求目录在读取 PDF 快照后清理；Office 仍占用文件时允许清理失败。

## 生命周期

每次打开文件和缩放重建有独立取消请求。重建期间原画面继续显示，完成后按最新阅读位置替换；被取消的结果不能覆盖新文件。

关闭渲染文档会取消预加载、清空分块缓存并停止后台调度。工作线程的 `finally` 释放所属渲染源；PDF 页面和临时位图在每次局部绘制后立即释放。

## 验证与发布

在项目根目录运行：

```powershell
dotnet run --project LoopScroller.Tests -c Release
dotnet publish LoopScroller -c Release -r win-x64 --self-contained true -o LoopScroller-Portable-Net8
```

回归包括图片/TXT/DOCX/PDF、循环接缝、DPI/缩放、缓存淘汰、取消和窗口操作。发布后还需用便携 EXE 打开 PDF 并检查关闭后无进程残留。只保留 `LoopScroller-Portable-Net8` 发布目录；分发时包含 `ThirdPartyNotices.txt`。
