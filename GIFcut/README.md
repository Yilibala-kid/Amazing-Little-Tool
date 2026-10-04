# GIFcut

Windows / .NET 10 WPF GIF 裁剪工具。支持帧范围、播放速度、裁剪预览和输出缩放。

## 代码结构

- `ViewModels/MainViewModel.cs`：文件操作、帧选择和播放生命周期。
- `ViewModels/MainViewModel.Crop.cs`：裁剪框、手柄、鼠标交互和裁剪预览。
- `Services/GifDocument.cs`：只读帧集合与冻结的 WPF 位图。
- `Services/GifReaderService.cs`：后台解码，每次读取返回独立文档。
- `Services/GifExporterService.cs`：后台裁剪、缩放与 GIF 编码，支持单帧范围。
- `Services/BitmapPixelConverter.cs`：统一 BGRA 像素转换，仅复制需要导出的区域。

界面只在最新读取完成后替换预览，旧任务完成时不会覆盖新文件；关闭窗口时清理播放计时器和鼠标捕获。导出使用输入帧快照，临时 ImageSharp 图像在成功或失败时均释放。

## 运行和验证

从仓库根目录运行：

```powershell
dotnet run --project GIFcut\GIFcut.csproj
dotnet run --project tests\GIFcut.Tests\GIFcut.Tests.csproj
```

回归程序实际生成、解码和重新导出 GIF，检查帧顺序、颜色通道、单帧范围、裁剪与最小缩放尺寸、速度和参数校验。
