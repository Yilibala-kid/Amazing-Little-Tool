# Amazing-Little-Tool

一些自制（其实是问出来）的自用小工具。这个仓库用于集中保存浏览器扩展、桌面程序、Photoshop 脚本和 LaTeX 资料。

## 项目一览

| 目录 | 用途 | 运行环境 |
| --- | --- | --- |
| [`BiliPocketReader`](./BiliPocketReader/) | B 站漫画模式阅读器，提供漫画阅读、收藏夹快捷跳转等功能。 | Chrome / Edge 扩展，或 Tampermonkey 用户脚本 |
| [`ForceDarkModeExtension`](./ForceDarkModeExtension/) | 将当前网页临时切换为深色模式，可随时恢复。 | Chrome / Edge 扩展 |
| [`gifcut`](./gifcut/) | GIF 裁剪工具，支持帧范围选择、预览、播放速度调整、输出缩放和重新导出。 | Windows，.NET 10 WPF |
| [`PSPlugin`](./PSPlugin/) | Photoshop JSX 脚本，用于批量将 PSD 文件导出为 PNG。 | Adobe Photoshop |
| [`MathCollection`](./MathCollection/) | 高中数学 LaTeX 题库、试卷模板和已生成的 PDF。 | XeLaTeX / latexmk |

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

## gifcut

这是一个 Windows WPF 桌面程序。可以打开或拖入 GIF 文件，框选需要保留的区域，调整起止帧、播放速度和输出比例，再导出新的 GIF。

在安装 .NET 10 SDK 后，可运行：

```powershell
dotnet run --project .\gifcut\GIFcut.csproj
```

## PSPlugin

[`PSD-to-PNG-Export.jsx`](./PSPlugin/PSD-to-PNG-Export.jsx) 是 Photoshop 脚本，提供中英文界面，可批量处理文件夹中的 PSD 文件并导出 PNG。

## MathCollection

这是一个使用 XeLaTeX 编译的高中数学资料项目：

- [`QuestionSet.tex`](./MathCollection/QuestionSet.tex)：按知识点章节编排的高中数学习题集。
- [`ExamPaper.tex`](./MathCollection/ExamPaper.tex)：试卷模板与示例题目。
- [`Head.tex`](./MathCollection/Head.tex)：公共宏命令和样式。
- [`chapters`](./MathCollection/chapters/)：各知识点章节源码。

编译命令：

```powershell
cd .\MathCollection
latexmk -xelatex -interaction=nonstopmode -file-line-error ExamPaper.tex
latexmk -xelatex -interaction=nonstopmode -file-line-error QuestionSet.tex
```

清理 LaTeX 中间文件：

```powershell
.\0000clean_latex.bat
```

## License

本仓库使用 [`MIT License`](./LICENSE)。
