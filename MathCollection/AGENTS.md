# Codex Instructions for This LaTeX Project

本目录是中文高中数学 LaTeX 项目。处理这里的 `.tex` 文件时，优先遵守以下约定，目标是稳定编辑中文、数学公式和 TeX 命令，减少编码与花括号匹配导致的失败。

## Encoding and Editing

- 所有 `.tex`、`.md`、`.latexmkrc` 文件按 UTF-8 读取和保存。
- 在 PowerShell 中读取中文文件时使用 `Get-Content -Raw -Encoding UTF8 <file>`。
- 手工改文件优先使用 `apply_patch`，保持改动小而精确。
- 不要用脚本整体重写包含大量中文和公式的 `.tex` 文件，除非用户明确要求大规模整理。
- 修改题目或答案时，尽量只替换目标题块，不重排全文件空行、缩进或标点。
- 不要把中文标点机械替换成英文标点；数学公式内部例外，按 TeX 语法需要处理。

## LaTeX Structure

- 公共导言和自定义命令在 `Head.tex`。
- 试卷入口是 `ExamPaper.tex`。
- 习题集入口是 `QuestionSet.tex`。
- 单章调试入口是 `BuildChapter.tex`，只需修改其中的 `\input{chapters/...}` 行。
- 章节文件在 `chapters/` 下，图片在 `Images/` 下。
- 项目已经使用 `ctex`，中文编译应使用 XeLaTeX，不要改成 pdfLaTeX。

## Local Commands

推荐验证命令：

```powershell
latexmk -xelatex -interaction=nonstopmode -file-line-error ExamPaper.tex
latexmk -xelatex -interaction=nonstopmode -file-line-error QuestionSet.tex
latexmk -xelatex -interaction=nonstopmode -file-line-error BuildChapter.tex
```

清理辅助文件时只清理 LaTeX 生成物，避免删除源文件、图片或 PDF，除非用户明确要求。

## Project Macros

- 题目使用 `\begin{question}...\end{question}`。
- 大题标题使用 `\TITLE{...}`。
- 单选、多选选项使用 `\Choose{A}{B}{C}{D}`、`\Choose[2]{...}` 或 `\Choose[4]{...}`。
- 选项括号使用 `\choice`。
- 填空横线使用 `\fillin{3cm}`。
- 解答题留白使用 `\ansspace{5cm}`。
- 答案使用：

```tex
\begin{answer}{答案}
分析内容
\end{answer}
```

## Editing Safety for TeX

- 改动含有 `{}`、`\left...\right`、`\begin...\end` 的内容后，检查括号和环境成对。
- 不要在数学模式 `$...$` 内随意插入空行。
- 不要把 `\input{Head.tex}`、`\graphicspath{{./Images/}}`、`\ShowAns` 相关逻辑移走，除非任务明确要求。
- 图片路径默认相对 `Images/`，插图优先写 `\includegraphics{image1.png}` 这种项目现有风格。
- 如果答案速校为空，通常需要再次编译，这是现有 `aux` 写入机制导致的正常现象。

## Response Style

- 面向用户用中文回答。
- 说明 TeX 问题时直接指出文件、位置、原因和验证命令。
- 如果不能编译，报告首个关键 LaTeX 错误，不要只说“编译失败”。
