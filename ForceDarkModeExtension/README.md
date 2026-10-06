# Force Dark Current Page

这是一个 Chrome / Edge 浏览器插件，用来把当前标签页强制切换为深色模式。

## 使用方法

1. 打开 Chrome 或 Edge 的扩展管理页面。
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前文件夹：`ForceDarkModeExtension`。
5. 打开任意网页，点击插件图标，再点击“开启当前页深色模式”。

## 说明

- 插件只会修改当前标签页。
- 再次点击按钮可以恢复当前页面。
- 浏览器内置页面，例如 `chrome://extensions/`，出于浏览器安全限制不能被插件修改。

## 代码结构与验证

`dark-style.js` 保存页面样式；`page-controller.js` 提供可独立序列化到各页面框架的控制函数；`popup.js` 只负责当前标签页、按钮状态和错误提示。页面函数的依赖均位于函数内部，适配 `chrome.scripting.executeScript` 的隔离执行方式。

从仓库根目录运行 `node --test ForceDarkModeExtension/tests/*.test.js`，检查独立注入、重复开启和关闭后的样式及标记清理。
