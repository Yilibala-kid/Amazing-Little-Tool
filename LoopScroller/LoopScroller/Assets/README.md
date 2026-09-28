# LoopScroller 图标

蓝色圆角底、白色循环箭头与阅读行，表达全屏阅读及首尾循环。外部为透明背景。

- LoopScroller.png：内置 image_gen 生成的原始图案，保留透明通道。
- LoopScroller.ico：从原图机械缩放和封装，包含 16、20、24、32、40、48、64、96、128、256 像素帧，32 位透明色。
- EXE 图标由 ApplicationIcon 嵌入，窗口图标使用同一份内嵌资源；转发时无需附带图片或 ICO。
- 重新生成 ICO：在项目目录执行 powershell -NoProfile -File .\Build-Icon.ps1。

## 生成方式与最终提示词

使用内置 image_gen 工具生成，未使用 API/CLI。PNG 转为 ICO 仅做尺寸转换与格式封装。

Use case: logo-brand. Asset type: production Windows desktop application icon for LoopScroller, an offline fullscreen endlessly scrolling image and document viewer. Generate ONE finished square icon, not a presentation or mockup. A substantial rounded-square tile in rich RoyalBlue #4169E1, with restrained luminous blue depth, carrying a crisp thick white continuous vertical loop arrow surrounding three short horizontal reading lines. The loop arrow should clearly suggest upward scrolling and repetition; extremely simple, distinctive, bold silhouette, readable at 16px and 32px. Front-on orthographic, optically centered, all elements inside the tile, generous but not excessive padding; tile occupies about 90% of canvas. Premium calm Windows productivity application aesthetic; subtle polished surface but mostly flat, no tiny details. Actual transparent background outside rounded tile, preserve alpha, no white canvas, no checkerboard pattern. No letters, no words, no watermark, no multiple icons, no extra objects. Square high-resolution PNG.
