# 自定义命令说明

本文档说明 `Head.tex` 中定义的项目命令、环境及常用配置。示例中的 `[...]` 表示可选参数，可以省略；省略时会使用默认值。带 `*` 的命令表示星号版本，例如 `\QuestionSetSection*{...}`。

## 题目与选项

### `question` 环境

用于书写一道题目，自动递增题号。

```tex
\begin{question}
题干内容
\end{question}
```

效果：显示为“1．题干内容”。

可选参数可写题源或说明：

```tex
\begin{question}[GPT生成]
题干内容
\end{question}
```

效果：显示为“1．（GPT生成）题干内容”。

### `\resetQuestionNumber`

重置题号为 0。

```tex
\resetQuestionNumber
```

效果：下一道 `question` 会重新从 1 开始。通常由 `\QuestionSetSection` 自动调用，手写大题时也可以单独使用。

### `\questionGroup{标题内容}`

输出大题标题，并写入答案速校分组。

```tex
\questionGroup{一、选择题}
```

效果：加粗显示“一、选择题”，后续答案速校中也会按这个标题分组。

### `\choices`

输出四个选择题选项。可选参数控制排版方式；省略时默认是 `[1]`。

```tex
\choices{A}{B}{C}{D}
```

等价于：

```tex
\choices[1]{A}{B}{C}{D}
```

效果：四列横排显示 A、B、C、D。

两列两行：

```tex
\choices[2]{A}{B}{C}{D}
```

一列四行：

```tex
\choices[4]{A}{B}{C}{D}
```

## 答题留空与占位

### `\choiceBox`

输出选择题答案括号。

```tex
下列说法正确的是\choiceBox
```

效果：显示类似 `(~~~~~~)` 的选项括号，并尽量避免被换行拆开。

### `\blank{长度}`

输出填空题下划线。

```tex
答案为\blank{3cm}．
```

效果：生成长度为 `3cm` 的下划线，并尽量避免被换行拆开。

### `\solutionSpace{高度}`

为解答题预留答题空间。

```tex
\solutionSpace{5cm}
```

效果：隐藏题后答案时留出 `5cm` 空白；显示题后答案时不留大块空白。

## 图片

图片路径默认搜索 `Images/`，因此通常只需要写图片文件名。

### `\questionImage`

居中插入一张图片。

```tex
\questionImage{image1.png}
```

等价于：

```tex
\questionImage[0.45\linewidth]{image1.png}
```

效果：以 `0.45\linewidth` 宽度居中显示图片。

指定宽度：

```tex
\questionImage[0.6\linewidth]{image1.png}
```

添加图片标题：

```tex
\questionImage[0.45\linewidth]{image1.png}[图1]
```

效果：图片下方显示“图1”。

### `questionImageRight` 环境

右图左文。

```tex
\begin{questionImageRight}{image1.png}
左侧文字
\end{questionImageRight}
```

等价于：

```tex
\begin{questionImageRight}[0.32\linewidth]{image1.png}
左侧文字
\end{questionImageRight}
```

效果：左侧排文字，右侧以 `0.32\linewidth` 宽度排图片。

带图片标题：

```tex
\begin{questionImageRight}[0.32\linewidth]{image1.png}[图1]
左侧文字
\end{questionImageRight}
```

### `questionImageLeft` 环境

左图右文。

```tex
\begin{questionImageLeft}{image1.png}
右侧文字
\end{questionImageLeft}
```

效果：左侧排图片，右侧排文字。

指定图片宽度和标题：

```tex
\begin{questionImageLeft}[0.32\linewidth]{image1.png}[图1]
右侧文字
\end{questionImageLeft}
```

### `\questionImagePair`

双图并排。

```tex
\questionImagePair{imageA.png}{imageB.png}
```

等价于：

```tex
\questionImagePair[0.45\linewidth]{imageA.png}{imageB.png}
```

效果：两张图并排显示，每张宽度为 `0.45\linewidth`。

带标题：

```tex
\questionImagePair[0.45\linewidth]{imageA.png}[图1]{imageB.png}[图2]
```

## 答案与解析

### `answer` 环境

记录答案，并按当前答案显示模式决定是否在题后展示。

```tex
\begin{answer}{C}
这里写分析过程。
\end{answer}
```

效果：

- `{C}` 会进入答案速校。
- 环境正文“这里写分析过程。”会作为详细分析。
- 如果当前模式显示题后答案，会输出【答案】和【分析】。

没有分析时可以只写答案：

```tex
\begin{answer}{C}
\end{answer}
```

效果：分析为空时不显示【分析】标签。

### `\printAnswerCheck`

输出当前已收集的答案速校内容。

```tex
\printAnswerCheck
```

效果：生成“答案速校”区域，适合试卷末尾或调试时使用。

### `\printChapterAnswers`

输出本章答案速校。

```tex
\printChapterAnswers
```

效果：在章末答案模式开启时输出“本章答案速校”，然后清空本章答案缓存，避免串到下一章。

### `\printBookAnswerCheck`

输出全书答案速校。

```tex
\printBookAnswerCheck
```

效果：仅在 `\answersAtEnd` 模式下生效，通常放在 `QuestionSet.tex` 所有章节之后。

## 答案显示模式

以下命令通常放在 `QuestionSet.tex` 或 `ExamPaper.tex` 的导言设置区。每次建议只选择一种模式。

### 试卷常用模式

```tex
\showAnswers
```

效果：题后显示答案和分析。

```tex
\showAnswersOnly
```

效果：题后只显示答案，不显示分析。

```tex
\hideAnswers
```

效果：隐藏题后答案。

### 习题集常用模式

```tex
\answersNone
```

效果：完全不显示答案。

```tex
\answersByChapter
```

效果：题后不显示答案，每章末尾显示答案速校。

```tex
\answersAtEnd
```

效果：题后和章末不显示答案，全书末尾统一显示答案速校。

```tex
\answersInline
```

效果：每题后显示答案和分析。

```tex
\answersInlineBrief
```

效果：每题后只显示答案，不显示分析。

```tex
\answersInlineAndChapter
```

效果：每题后显示答案和分析，并在章末显示答案速校。

```tex
\studentBook
```

等价于：

```tex
\answersByChapter
```

```tex
\teacherBook
```

等价于：

```tex
\answersInline
```

## 习题集结构

### `\UseQuestionSetStyle{页眉标题}`

设置习题集页眉、页脚和页码样式。

```tex
\UseQuestionSetStyle{高中数学习题集}
```

效果：左页眉显示“高中数学习题集”，右页眉显示当前章节标题，中间页脚显示页码。

### `\QuestionSetCover{主标题}{副标题}{底部信息}`

生成习题集封面。

```tex
\QuestionSetCover
  {高中数学习题集}
  {按知识点章节编排，适用新高考}
  {姓名：\blank{4cm}\qquad 班级：\blank{4cm}}
```

效果：生成居中封面页。

### `\QuestionSetTOC`

输出目录。

```tex
\QuestionSetTOC
```

效果：另起页生成目录，并在目录后再次分页。

### `\includeChapter{文件名}`

输入 `chapters/` 下的章节文件。只写文件名，不写 `chapters/` 和 `.tex`。

```tex
\includeChapter{01-集合与常用逻辑用语}
```

效果：等价于输入：

```tex
\input{chapters/01-集合与常用逻辑用语.tex}
```

### `\QuestionSetChapter`

生成章标题。

```tex
\QuestionSetChapter{函数与基本性质}
```

效果：自动显示“第1章　函数与基本性质”，写入目录，更新页眉，重置小节编号，并开始收集本章答案。

星号版本：

```tex
\QuestionSetChapter*{附录}
```

效果：显示“附录”，不推进章节编号。

### `\QuestionSetSection`

生成节标题。

```tex
\QuestionSetSection{函数的概念与表示}
```

效果：自动显示类似“1.1　函数的概念与表示”，写入目录，重置题号，并开启答案分组。

星号版本：

```tex
\QuestionSetSection*{本章综合训练}
```

效果：显示“本章综合训练”，不推进小节编号，但仍会重置题号并写入答案分组。

## 内部辅助命令

以下命令是 `Head.tex` 内部实现用的，一般不建议在章节或试卷正文中直接使用。

### `\MC@questionImageCaption`

内部图片标题辅助命令，由 `\questionImage`、`questionImageRight`、`questionImageLeft`、`\questionImagePair` 调用。

### `\chapteranswerlist`、`\bookanswerlist`、`\aclist`

内部答案缓存宏，用于保存本章或全书的答案速校内容。

### `\ACGroup{标题}`

内部答案分组命令，会向本章和全书答案缓存中写入一个分组标题。

### `\ACItem{题号}{答案}`

内部答案记录命令，会向本章和全书答案缓存中写入一道题的答案。

### `\MC@appendBookChapter{章标题}`

内部全书答案速校辅助命令，会向全书答案缓存中写入章标题。
