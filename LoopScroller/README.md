# LoopScroller

Amazing-Little-Tool 中的 Windows 全屏循环滚动播放器。

## 目录

- `LoopScroller/`：WPF 程序源码和详细使用说明
- `LoopScroller.Tests/`：回归测试
- `LoopScroller-Portable-Net8/`：唯一保留的便携发布版，.NET 8 自包含 x64 单文件

直接运行 `LoopScroller-Portable-Net8/LoopScroller.exe`。分享时请保留同目录的 `ThirdPartyNotices.txt`。目标电脑无需安装 .NET、Microsoft Word 或 PDF 阅读器。

当前版本为 **1.3.1**：在保持功能不变的前提下，统一文件读取、精简窗口状态和快捷键处理、减少文本页面布局层级。支持 PPT/PPTX 静态幻灯片循环滚动：本机安装 Microsoft PowerPoint 桌面版后，程序自动将演示文稿的副本转换为 PDF，再复用现有播放、缩放及全屏操作；不修改原文件。未安装 PowerPoint 时，可先用 PowerPoint 或 WPS 导出 PDF 后播放。仅保留 Net8 便携发布版。详细说明和验证方式见 [程序说明](LoopScroller/README.md)。

PDF 渲染组件已打包到程序中，不需要安装 PDF 阅读器。需要打开密码的 PDF 请先另存为无密码版本。

代码已统一循环绘制、缓存和格式配置，PDF 底层接口独立封装，结构见 [架构说明](LoopScroller/ARCHITECTURE.md)。

本机离屏性能对比及测试边界见 [性能验证记录](LoopScroller/PERFORMANCE.md)。

## 构建与测试

在本目录中使用 .NET 10 SDK 构建 .NET 8 目标：

```powershell
dotnet run --project LoopScroller.Tests -c Release
dotnet publish LoopScroller -c Release -r win-x64 --self-contained true -o LoopScroller-Portable-Net8
```

自动回归测试自行生成所需文档，不需要个人文件。可选的真实 DOCX 测试通过 `--document "文档的完整路径.docx"` 传入；个人测试文档不随仓库分发。
