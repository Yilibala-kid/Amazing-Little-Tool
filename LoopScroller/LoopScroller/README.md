# LoopScroller

Windows 全屏循环滚动播放器。可打开图片、TXT、DOCX、PDF 和 PPT/PPTX，让内容持续向上无缝滚动。

## 使用

1.3.1 更新：代码精简，功能和操作方式保持不变。图片、TXT 和 PDF 共用有大小限制且可取消的文件快照读取；速度、缩放及其文字提示直接使用滑条值，消除重复状态；快捷键共用边界处理，文本页面去掉多余的布局容器。保留原有缓存预算、逐块渲染、阅读位置恢复及 PowerPoint 转换保护。

1.3.0 更新：支持 PPT/PPTX。需要本机安装并激活 Microsoft PowerPoint 桌面版；只安装 WPS 不支持自动转换，但可在 WPS 中手动导出 PDF 后打开。首次打开时在后台将文件副本转换为 PDF，随后沿用 PDF 的清晰度、按需渲染和缓存；缩放不会重复转换。原始文件不修改。

PPT/PPTX 展示静态幻灯片，不播放动画、切换效果、声音或视频。每张幻灯片对应一页，隐藏幻灯片不导入。源文件限制为 100 MB，转换后的 PDF 仍受 100 MB / 5000 页限制。需要密码、受保护或无法正常打开的文件，请先在 PowerPoint 中处理后导出 PDF。

转换时按 `Esc` 可取消，换文件或关闭播放器也会取消；转换最多等待 2 分钟。程序只关闭自己的演示文稿副本，不强制结束 PowerPoint 进程，以保留用户已打开的文稿。若 Office 卡在提示窗口中，可能需要手动处理该窗口后重试。临时文件在请求结束后清理；被 Office 占用而无法删除的文件可能暂留在系统临时目录的 `LoopScroller-PPT` 文件夹。

1.2.0 更新：PDF 按原版式逐页连续播放，支持扫描页、旋转及混合页面尺寸，所有操作与现有文件共用。每次只渲染当前区域及附近内容，缩放或 DPI 改变后按新分辨率重新渲染，并保持当前页及页内位置。

1.1.2 更新：简化首页文案，采用统一深色配色、圆角按钮及滑条。首页右上角可查看快捷键，控制栏按钮与滑条也有悬停提示。仅保留 `LoopScroller-Portable-Net8` 便携发布目录，默认构建目标改为 .NET 8。

1.1.1 修复：150% 等 Windows 显示缩放下，分块边界浮点误差可能使预加载反复访问同一块，阻塞界面。现改为有明确次数上限的整数块序号遍历，同时校正精确边界的定位。使用本地 DOCX 样本验证了 100%–200% DPI、100%/300% 内容缩放，以及实际窗口自动滚动、滚轮、逐块跳转、返回首页和重复打开。原始文档未修改，个人测试样本不随仓库分发。

可选的真实文档回归测试（从项目根目录运行；有 90 秒超时保护）：

```powershell
dotnet run --project LoopScroller.Tests/LoopScroller.Tests.csproj -c Release -p:LoopScrollerFramework=net8.0-windows -- --document "C:\Documents\sample.docx"
```

1. 双击 `LoopScroller.exe`。
2. 点击“选择文件”，或把文件拖进窗口。
3. 文件加载后会自动进入全屏并开始滚动。

快捷键：

- 鼠标滚轮：向上回看、向下前进；自动滚动保持原速度，暂停时也可调整位置
- `Space`：暂停或继续
- `↑` / `↓`：调整速度
- `+` / `-`：调整缩放
- `Ctrl+O`：打开新文件
- `F11`：切换全屏
- `Esc`：返回启动页

支持 PNG、JPG/JPEG、BMP、GIF（首帧）、TIFF、TXT、DOCX、PDF、PPT 和 PPTX。旧版 DOC 请先转换为 DOCX。

PDF 使用随程序打包的 PDFium 渲染组件，无需额外安装 PDF 阅读器。默认按每页宽度适应窗口，页面按顺序紧接排列，文末保留循环分割线。PDF 限制为 100 MB、5000 页；需要打开密码的文件请先另存为无需密码的 PDF。本次仅增加滚动播放，未添加密码输入、页码跳转或批注编辑。

## 构建

需要 .NET 10 SDK：

```powershell
dotnet publish .\LoopScroller.csproj -c Release -r win-x64 --self-contained true
```

发布产物为自包含单文件 EXE，目标电脑无需安装 .NET 或 Microsoft Word。

### .NET 8 便携版（x64）

唯一的便携发布程序为 `../LoopScroller-Portable-Net8/LoopScroller.exe`。运行只需要该 EXE；不适用于 32 位 Windows。PDFium 原生组件包含在单文件内，启动时由 .NET 自动解压加载。分享时请保留同目录的 ThirdPartyNotices.txt。

使用现有 .NET 10 SDK 即可构建较低目标版本，首次构建需要联网下载 .NET 8 依赖：

```powershell
dotnet publish .\LoopScroller.csproj -c Release -r win-x64 --self-contained true -p:LoopScrollerFramework=net8.0-windows -o ..\LoopScroller-Portable-Net8
dotnet run --project ..\LoopScroller.Tests\LoopScroller.Tests.csproj -c Release -p:LoopScrollerFramework=net8.0-windows
```

这是供目标电脑试运行的较低运行时版本，不代表已定位原先的启动失败原因，也不保证支持所有 Windows 10 教育版。微软当前对 Windows 10 的正式支持范围限于特定 LTSC/企业版；见 [Windows 支持说明](https://learn.microsoft.com/en-us/dotnet/core/install/windows#supported-versions)。[.NET 8 安全维护截至 2026 年 11 月 10 日](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)，长期使用应优先选择仍受支持的系统及较新运行时。

## 显示与操作说明

- 缩放范围为 50%–300%。图片及 PDF 页面 100% 按屏幕宽度显示；50% 为半屏宽，300% 为三倍屏宽（左右超出部分居中裁切）。
- 自动滚动速度范围为 10–150 DIP/秒，默认 60；速度滑条仍保持原有 120 DIP 长度。快捷键与滑条使用同一组上下限。
- 文本缩放会重新换行，并尽量保持当前阅读段落及段内位置。
- TXT 和 Word 的页面背景及排版宽度随窗口铺满，两侧保留 32 个布局像素的浅色阅读内边距，不再限制为居中窄页。
- 每轮内容末尾都有一条横贯屏幕、3 个布局像素高的 RoyalBlue（#4169E1）分割线，图片、TXT、Word 和 PDF 均适用。
- 滚轮每格调整约 120 个布局像素，支持细小滚轮增量；越过开头或末尾会循环衔接，不改变播放/暂停状态、速度或缩放。
- 鼠标移到底部显示控制栏，静止两秒或离开后隐藏；拖动滑块期间保持显示。顶部文件名与控制栏一起隐藏。
- “退出全屏”与 F11 均保留播放；Esc 返回首页，并取消正在进行的加载。
- DOCX 支持段内图片、表格中的图文、常见横向/纵向合并单元格、基本样式继承及常见编号列表。浮动布局、复杂域、公式和特殊编号格式不保证与 Word 一致；外部链接图片需要先嵌入文档。
- 单张图片最多 4000 万像素，文档内图片总计最多 8000 万像素；文本最多 200 万字符、20000 行。超限请拆分或缩小后播放。

## 1.1.0 播放优化

- 图片、TXT、DOCX 使用同一条显示路径：独立 STA 线程排版，生成每段高 256 个物理像素的图片，交给前台连续平移。普通帧只更新一个平移变换，跨片段时才更新显示内容。
- 图片按当前屏幕 DPI 生成，片段边缘多保留一个物理像素以避免接缝。缩放、窗口宽度或 DPI 变化后重新生成，不通过降低缓存分辨率提速。
- 首屏准备好后开始播放，后台预热前方两屏及后方一屏。缓存采用 96 MiB 预算，并保护正在显示的片段；预算不包含原图、排版对象和图形系统副本。超大视口若仅可见内容便超过预算，优先保住可见图片。
- 缩放重排期间旧画面继续播放，切换时保留最新的阅读位置，包括等待期间的滚轮调整。暂停、最小化和首页解除逐帧回调。
- 大跨度滚轮跳转到尚未缓存的位置时，首次生成相关图片仍可能短暂等待；不显示空白或低清替代图。超长文档的首次完整排版仍需要一定时间。
- 简化了原先两套同步/异步排版实现，排版只保留一套；播放位置只在显示层保存，滑条和快捷键共用范围配置。

仅保留 `.NET 8` 便携发布版；源码仍可通过 `LoopScrollerFramework` 参数指定其他构建目标。

## 回归验证

```powershell
dotnet run --project ..\LoopScroller.Tests\LoopScroller.Tests.csproj -c Release -p:LoopScrollerFramework=net8.0-windows
```

测试包含首尾衔接的逐像素检查、缩放和阅读位置保持、DOCX 图文/样式/表格/编号，以及隐藏窗口中的加载取消、快速换文件、全屏切换和控制栏定时隐藏。窗口测试会创建透明测试窗口后自动关闭，预览图保存到测试输出目录的 `qa` 文件夹。

新增验证包含独立线程排版、普通帧不重新生成图片、100%/125%/150%/200% DPI 接缝、300% 缩放、150 速度上限、缩放期间继续播放，以及缓存淘汰和取消。

PDF 回归额外覆盖矢量文字和图形、嵌入扫描图像、横竖页及旋转、50%/100%/300% 缩放、100%/150%/200% DPI 下逐像素接缝、按页阅读位置、90 页文档按需渲染及缓存预算、损坏文件、取消加载、实际窗口自动播放及从 PDF 切换回 TXT。

PPT 回归覆盖加载器分派、原文件名、内容快照、缺少 PowerPoint、空文件及大小限制、失败和取消后的临时文件清理。已安装 PowerPoint 时可运行实际转换测试，覆盖 PPTX/PPT、隐藏页、原文件不变及保留已打开文稿：

```powershell
dotnet run --project ../LoopScroller.Tests -c Release -- --ppt-office
```

可重复的离屏绘制基准与十分钟逻辑播放模拟：

```powershell
dotnet run --project ..\LoopScroller.Tests\LoopScroller.Tests.csproj -c Release -p:LoopScrollerFramework=net8.0-windows -- --benchmark
```

该基准比较旧绘制方式和新缓存方式在本机 1920×1080 下的 CPU 离屏绘制耗时，并输出 `qa/playback-benchmark.json`。它不是屏幕实测 FPS，也不等同于在目标 Windows 10 电脑上连续播放十分钟；实际显示流畅度仍应在目标电脑上检验。
