# 自用神奇妙妙工具集

一些自制的自用小工具。这个仓库用于集中保存浏览器扩展、桌面程序和 Photoshop 脚本。

数学资料已经拆分到独立仓库：[`forMath`](https://github.com/Yilibala-kid/forMath)。

## 项目一览

| 目录 | 用途 | 运行环境 |
| --- | --- | --- |
| [`BiliPocketReader`](./BiliPocketReader/) | B 站漫画模式阅读器，提供漫画阅读、收藏夹快捷跳转等功能。 | Chrome / Edge 扩展，或 Tampermonkey 用户脚本 |
| [`ForceDarkModeExtension`](./ForceDarkModeExtension/) | 将当前网页临时切换为深色模式，可随时恢复。 | Chrome / Edge 扩展 |
| [`betterX`](./betterX/) | 过滤视频推文，下载当前帖子中的图片、GIF 和视频。 | Chrome / Edge 扩展 |
| [`GIFcut`](./GIFcut/) | GIF 裁剪工具，支持帧范围选择、预览、播放速度调整、输出缩放和重新导出。 | Windows，.NET 10 WPF |
| [`LoopScroller`](./LoopScroller/) | 全屏循环滚动图片、TXT、DOCX、PDF 和 PPT/PPTX，支持暂停、调速及缩放。 | Windows x64；PPT/PPTX 自动转换需要桌面版 PowerPoint |
| [`PSPlugin`](./PSPlugin/) | Photoshop JSX 脚本，用于批量将 PSD 文件导出为 PNG。 | Adobe Photoshop |

## BiliPocketReader

可以通过两种方式使用：

1. 在 Chrome 或 Edge 的扩展管理页面开启开发者模式，加载 [`BiliPocketReader`](./BiliPocketReader/) 文件夹。
2. 在 Tampermonkey 中导入 [`BiliPocketReader.user.js`](./BiliPocketReader/dist/BiliPocketReader.user.js)。

修改源码后，可运行以下命令重新生成用户脚本：

```powershell
.\BiliPocketReader\build-userscript.cmd
```

更详细的安装步骤见 [`安装指南.txt`](./BiliPocketReader/安装指南.txt)。

## ForceDarkModeExtension

这是一个只作用于当前标签页的深色模式扩展。加载扩展后，点击浏览器工具栏中的图标即可开启或关闭。

详细说明见 [`ForceDarkModeExtension/README.md`](./ForceDarkModeExtension/README.md)。

## GIFcut

这是一个 Windows WPF 桌面程序。可以打开或拖入 GIF 文件，框选需要保留的区域，调整起止帧、播放速度和输出比例，再导出新的 GIF。

在安装 .NET 10 SDK 后，可运行：

```powershell
dotnet run --project .\GIFcut\GIFcut.csproj
```

## LoopScroller

Windows 全屏循环滚动播放器，支持图片、TXT、DOCX、PDF 和 PPT/PPTX。可以打开或拖入文件，暂停、调速、缩放，也可以用滚轮回看内容。

直接运行 [`LoopScroller/LoopScroller-Portable-Net8/LoopScroller.exe`](./LoopScroller/LoopScroller-Portable-Net8/LoopScroller.exe)，无需安装 .NET。下载或分享便携版时，请同时保留该目录中的 `ThirdPartyNotices.txt`。

PPT/PPTX 通过本机 Microsoft PowerPoint 转换为静态 PDF 后播放，不播放动画、声音或视频；没有 PowerPoint 时可先手动导出 PDF。

源码、测试、构建方法及详细使用说明见 [`LoopScroller/README.md`](./LoopScroller/README.md)。

## PSPlugin

[`PSD-to-PNG-Export.jsx`](./PSPlugin/PSD-to-PNG-Export.jsx) 是 Photoshop 脚本，提供中英文界面，可批量处理文件夹中的 PSD 文件并导出 PNG。

## 维护与验证

各工具保留独立部署目录。浏览器工具通过各自的命名空间与回调组合模块；GIF 工具将界面、裁剪交互与图像服务分开；Photoshop 脚本保持可直接运行的单文件闭包。

详细结构见 [BiliPocketReader 设计文档](./BiliPocketReader/DESIGN.md)、[betterX 说明](./betterX/README.md)、[GIFcut 说明](./GIFcut/README.md) 和 [Photoshop 脚本说明](./PSPlugin/README.md)。

使用 Node.js 及 .NET 10 SDK，在仓库根目录运行统一验证：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
# 仅验证浏览器工具和 Photoshop 脚本
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipDesktop
```

验证会重新生成 BiliPocketReader 用户脚本，检查脚本语法、扩展资源和构建产物一致性，运行全部 JavaScript 回归，并编译和检查 GIF 的实际导出结果。阅读器的浏览器回归另见其设计文档；Photoshop 的实际界面及色彩转换需在宿主程序中检查。

## License

本仓库使用 [`MIT License`](./LICENSE)。
