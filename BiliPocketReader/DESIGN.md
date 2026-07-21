# BiliPocketReader 设计文档

本文档面向后续维护者，说明扩展的功能边界、模块职责、数据流和常见修改入口。源码以 `manifest.json` 中的加载顺序组织，所有模块通过全局命名空间 `window.BilibiliToolbox` 和 `window.Shared` 协作。

## 功能概览

BiliPocketReader 是运行在 bilibili 页面上的 MV3 内容脚本扩展，同时提供 userscript 构建产物。

主要功能：

- 漫画/图文阅读器：在专栏、动态图文等页面收集图片，打开全屏阅读器，支持单双页、自动宽图判断、缩放、拖拽、触摸手势、翻页动画、背景色、显示质量、图像滤镜、截图。
- 收藏面板：悬浮星标按钮，收藏用户空间、空间图文页、阅读列表，快速跳转。
- 收藏显示设置：收藏面板每行 2 到 5 个收藏，保持收藏块固定宽度，通过调整面板宽度改变列数。
- 动态过滤：在用户动态页隐藏转发动态，或临时按关键词只显示匹配动态。
- 收藏导入/导出：文本格式导入导出收藏。

## 加载顺序

`manifest.json` 中的脚本顺序很重要。后面的模块依赖前面已经挂载到 `window.BilibiliToolbox` 或 `window.Shared` 的 API。

当前顺序：

1. `shared.js`
2. `storage-service.js`
3. `bilibili-dom-adapter.js`
4. `animations.js`
5. `comic-reader-images.js`
6. `reader-preferences.js`
7. `reader-screenshot.js`
8. `reader-transform.js`
9. `reader-selection.js`
10. `reader-dom.js`
11. `comic-reader-page-groups.js`
12. `comic-reader-interactions.js`
13. `comic-reader.js`
14. `content-page-info.js`
15. `content-url.js`
16. `space-opus-tabs.js`
17. `dynamic-filter.js`
18. `favorites-text-dialog.js`
19. `settings-popover-ui.js`
20. `favorites-ui.js`
21. `content.js`

新增模块时优先维持“基础能力 -> 业务 helper -> UI -> content 入口”的顺序。

## 数据模型

统一数据保存在 `chrome.storage.local`：

```js
{
  favorites: [],
  settings: {
    hideForwardDynamics: false,
    favoriteColumns: 2,
    readerPreferences: { ... }
  }
}
```

存储 key：

- `Shared.SHARED_STORAGE_KEY`
- 当前值：`bilibiliToolboxSharedData.v1`

收藏类型：

- `user`：用户空间收藏，主键 `uid`
- `opus`：空间图文页收藏，主键 `uid`
- `readlist`：阅读列表收藏，主键 `id`

收藏 key 格式：

- `user:<uid>`
- `opus:<uid>`
- `readlist:<id>`

设置项：

- `hideForwardDynamics`：是否隐藏转发动态，持久化。
- `favoriteColumns`：收藏面板列数，合法值 `2, 3, 4, 5`，默认 `2`。
- `readerPreferences`：阅读器偏好，包含阅读方向、显示张数、翻页动画、显示质量、背景色、图像滤镜、移动端点击翻页。

关键词过滤是临时内存状态，不写入 storage。

## 数据流

持久设置统一走 storage 驱动同步：

1. UI 调用 `Toolbox.storage.setSetting(...)` 或收藏服务写入。
2. `storage-service.js` 写入 `chrome.storage.local`。
3. storage 服务调用内部 `notify(...)`。
4. `content.js` 中的 `syncAll(data)` 接收新数据。
5. `syncAll` 触发：
   - `favoritesUi.sync()`
   - `dynamicFilter.sync()`

设置弹窗不要直接调用 `favoritesUi.renderFavoriteList()`、`dynamicFilter.sync()` 或 `syncFloatButton()` 来刷新持久设置。这样可以保持单向数据流，避免 UI 和业务模块互相驱动。

临时关键词过滤例外：`settings-popover-ui.js` 直接调用 `dynamicFilter.setKeywordFilterState(...)`，因为它不持久化。

## 文件职责

### `shared.js`

基础共享模块。导出 `window.Shared`，并初始化 `window.BilibiliToolbox`。

职责：

- 定义 storage key、收藏类型、设置 key。
- 归一化收藏和整体数据结构。
- 生成收藏 key、名称、图片、跳转链接。
- 生成空间图文页跳转链接。
- 定义收藏列数选项和归一化函数。
- 定义设置默认值、`normalizeSettings()` 和 `getSettingValue()`。
- 提供 `createEventBag()` 统一管理事件解绑。

维护要点：

- 新增持久设置时，先在 `TOOLBOX_SETTINGS` 中加 key，再在 `DEFAULT_SETTINGS` / `normalizeSettings()` 中给默认值和校验。
- 收藏类型变化时，同时检查 `normalizeFavorite()`、`getFavoriteIdentity()`、`getFavoriteLink()`、导入导出格式和 UI 展示。

### `bilibili-dom-adapter.js`

B 站 URL、页面类型和 DOM 选择器适配层。

导出：

- `Toolbox.bilibiliDom`

职责：

- 集中判断漫画/图文阅读页、文章页、空间图文页、空间动态页。
- 集中维护动态卡片、图文图片、空间 tab、作者信息等 B 站 DOM 选择器。
- 提供 `getPrimaryImages()`、`getDynamicCards()`、`getArticleAuthorLink()` 等 DOM 查询入口。

维护要点：

- B 站改版时，优先从这里检查 URL 正则和选择器。
- 业务模块可以保留业务规则，但不要重复定义同一类 B 站页面 selector。

### `storage-service.js`

storage 和收藏服务。

导出：

- `Toolbox.storage`
- `Toolbox.favorites`

职责：

- 从 `chrome.storage.local` 读写统一数据。
- 监听跨上下文 storage 变化。
- 对外提供 `onChanged(listener)`。
- 提供收藏增删、导入合并、导出文本。

维护要点：

- 所有持久化写入应经过这里。
- `write()` 会归一化数据并通知监听者。
- 导入格式为每行一个 `[<type:id><name><image>]` 块。

### `content.js`

扩展启动入口。

职责：

- 初始化 storage。
- 初始化 URL 监听、动态过滤、设置弹窗、收藏 UI。
- 在可阅读页面初始化漫画阅读器入口按钮。
- 设置 `storage.onChanged(syncAll)`。
- 提供简单 message bridge：`GET_PAGE_FAVORITE_DATA`。
- 管理 `init()` 防重入和 `destroy()` 清理。

维护要点：

- 全局数据刷新在 `syncAll()`。
- 如果新增需要响应 storage 变化的模块，应在 `syncAll()` 中接入。
- 新增全局 listener、message bridge 或 reader 实例时，应同时在 `destroy()` 中清理。

### `content-url.js`

SPA URL 变化桥。

导出：

- `Toolbox.url.URL_CHANGE_EVENT`
- `Toolbox.url.init()`

职责：

- patch `history.pushState` / `replaceState`。
- 监听 `popstate`。
- 派发 `bilibili-toolbox:urlchange`。
- `destroy()` 中恢复 history 原方法并移除监听。

维护要点：

- B 站 SPA 页面变化依赖这个事件触发后续模块重扫。
- 如果新增 URL 监听来源，需要保持 `init()` / `destroy()` 成对可逆。

### `space-opus-tabs.js`

空间图文页 tab 自动选择。

导出：

- `Toolbox.spaceOpusTabs`

职责：

- 在 `/upload/opus` 页面等待 B 站渲染 `.content-filter .content-tab`。
- 自动点击文本为“专栏”的 tab。
- 每次进入空间图文页只自动选择一次，成功后停止当前 intent，避免和用户手动切换冲突。

维护要点：

- tab selector 集中在 `bilibili-dom-adapter.js` 的 `getContentTabs()`。
- 该功能固定开启，不写入 storage，也不提供设置项。

### `content-page-info.js`

当前页面收藏信息识别。

导出：

- `Toolbox.pageInfo`

职责：

- 识别用户空间、空间图文页、专栏文章、阅读列表页面。
- 提取 uid、用户名、头像、阅读列表标题和封面。
- 转换为收藏可保存的数据。

维护要点：

- B 站 DOM 改版时，优先检查这里的选择器。
- 文章作者 uid 通过作者链接和 URL 兜底提取。

### `favorites-ui.js`

收藏悬浮按钮和收藏面板 UI。

导出：

- `Toolbox.favoritesUi`

职责：

- 创建悬浮星标按钮。
- hover 或点击展示收藏面板。
- 添加当前页面为收藏。
- 删除收藏。
- 根据 `favoriteColumns` 设置收藏面板 CSS 变量。
- 右键或长按打开设置弹窗。
- 在视频页隐藏悬浮按钮，只在交互时临时显示。

维护要点：

- 面板列数只改变面板宽度，不改变收藏块宽度。
- `sync()` 应通过当前 storage 数据刷新 UI。
- 不直接持久化数据，收藏写入调用 `favoritesService`。
- 不直接依赖设置弹窗模块，通过 `content.js` 注入的 `settingsUi` 回调打开/隐藏设置。

### `settings-popover-ui.js`

右键/长按打开的工具箱设置弹窗。

导出：

- `Toolbox.settingsPopoverUi`

职责：

- 展示“收藏显示”和“动态过滤”设置。
- 修改 `favoriteColumns`。
- 修改 `hideForwardDynamics`。
- 控制临时关键词过滤。
- 提供收藏导入/导出入口。

维护要点：

- 持久设置只调用 `storage.setSetting(...)`。
- 弹窗刷新由 `render()` 根据当前数据重绘状态。
- DOM id 是 `bilibili-toolbox-settings-panel`。

### `favorites-text-dialog.js`

收藏导入/导出文本弹窗。

导出：

- `Toolbox.favoritesTextDialog`

职责：

- 显示文本区域弹窗。
- 支持复制到剪贴板、从剪贴板粘贴。
- 支持确认回调和状态提示。

维护要点：

- 该模块只负责通用文本弹窗，不解析收藏格式。

### `dynamic-filter.js`

动态页过滤逻辑。

导出：

- `Toolbox.dynamicFilter`

职责：

- 判断当前是否用户动态页。
- 识别动态卡片。
- 识别转发动态。
- 隐藏转发或非关键词匹配动态。
- 管理临时关键词过滤状态。
- 监听动态列表增删并延迟重跑过滤。

维护要点：

- `MutationObserver` 只监听 `childList + subtree`，避免自身改 class 触发重复过滤。
- `apply()` 不负责主动渲染设置 UI。
- URL/SPA 加载使用 burst retry，延迟数组是 `DYNAMIC_FILTER_BURST_DELAYS`。

### `comic-reader-images.js`

阅读器图片收集。

导出：

- `Toolbox.comicImages`

职责：

- 从 DOM 和页面状态中收集图片 URL。
- 处理 `srcset`、懒加载属性、协议相对 URL。
- 过滤头像、图标、表情等噪声图片。
- 按 DOM 顺序排序。

维护要点：

- 图片收集不创建 UI。
- B 站图文 DOM 改版时，优先调整选择器和噪声过滤。

### `reader-preferences.js`

阅读器偏好设置。

导出：

- `Toolbox.readerPreferences`

职责：

- 定义合法选项：
  - `VIEW_MODES`: `auto`, `single`, `double`
  - `IMAGE_RENDER_MODES`: `sharp`, `smooth`
  - `BACKGROUND_MODES`: `black`, `darkGray`, `lightGray`, `white`
  - `FILTER_MODES`: `original`, `soft`, `warm`, `grayscale`
- 归一化阅读器偏好。
- 从统一 storage 的 `readerPreferences` 读取/保存。

维护要点：

- 新增阅读器设置时，同时更新默认值、归一化、UI 按钮同步和测试。

### `animations.js`

阅读器翻页动画。

导出：

- `Toolbox.animations`

职责：

- 管理动画模式：`smooth`, `fade`。
- 运行翻页过渡。
- 重置图片容器状态。
- 完成渲染后恢复 transform/opacity。
- 同步动画按钮文案。

维护要点：

- 首次渲染和设置变化引起的重排使用内部即时渲染路径，不作为用户可选动画模式。
- 设置按钮不应因为当前值产生颜色 active 状态，除非这是明确的 UI 设计变更。

### `reader-screenshot.js`

阅读器截图输出。

导出：

- `Toolbox.readerScreenshot`

职责：

- 根据当前可见图片和选择框生成 canvas。
- 支持旋转图片绘制。
- 输出到剪贴板、系统分享或下载。
- 生成截图文件名。

维护要点：

- 截图依赖 reader 提供可见图片描述和背景色。
- 浏览器能力不同，输出路径会自动降级。

### `reader-transform.js`

阅读器缩放、平移、边界限制和原图尺寸计算 helper。

导出：

- `Toolbox.readerTransform.attach(reader)`

职责：

- 计算 `fitScale`、渲染缩放、最大缩放、双击缩放。
- 处理 `zoomAt()`、`resetTransform()`、`applyTransform()`。
- 计算图片边界、平移限制和鼠标拖拽。
- 根据原图/流畅模式设置显示尺寸。

维护要点：

- 修改缩放或原图显示规则时优先改这里。
- 模块方法 attach 到 reader 实例，事件绑定仍通过 reader 实例调用。

### `reader-selection.js`

阅读器截图选区 helper。

导出：

- `Toolbox.readerSelection.attach(reader)`

职责：

- 管理截图选区矩形、拖拽、缩放手柄和按钮状态。
- 处理选区 pointer 事件。
- 调用 `readerScreenshot` 保存选区或全图截图。

维护要点：

- 新增截图交互时优先改这里。
- 该模块只处理选区状态，不负责图片渲染和翻页。

### `reader-dom.js`

阅读器 DOM 创建 helper。

导出：

- `Toolbox.readerDom.attach(reader)`
- `Toolbox.readerDom.create(reader)`

职责：

- 创建阅读器覆盖层、图片容器、控制区、设置面板、截图选区 DOM。
- 初始化按钮文案和阅读器初始布局。

维护要点：

- 新增阅读器按钮或面板结构时优先改这里。
- 按钮行为仍在 `comic-reader-interactions.js` 绑定。

### `comic-reader-page-groups.js`

阅读器分页分组 helper。

导出：

- `Toolbox.readerPageGroups`

职责：

- 判断图片是否宽图。
- 根据当前 index、模式和步长计算下一组/上一组。
- 根据 `viewMode` 加载当前应展示的 1 或 2 张图片。

维护要点：

- 这里是单双页规则的集中位置。
- `auto` 模式遇到宽图时应单页显示。

### `comic-reader-interactions.js`

阅读器事件绑定。

导出：

- `Toolbox.readerInteractions.bind(reader)`

职责：

- 给 reader 实例绑定按钮、键盘、鼠标、触摸、截图选择事件。
- 事件处理仍调用 reader 实例已有方法。

维护要点：

- 该文件不持有阅读器状态，只负责把事件接到 reader。
- 新增 UI 控件时，优先在这里绑定事件，在 `comic-reader.js` 中保留状态和行为方法。

### `comic-reader.js`

阅读器主类。

导出：

- `Toolbox.reader.BiliComicReader`
- `Toolbox.reader.shouldInitComicReader`

职责：

- 判断当前页面是否需要阅读器入口。
- 创建阅读器 DOM。
- 管理阅读器状态。
- 渲染图片、更新布局、缩放、拖拽、触摸手势、截图选择。
- 通过 `readerDom` 创建 DOM。
- 通过 `readerTransform` 处理缩放/平移。
- 通过 `readerSelection` 处理截图选区。
- 调用 `readerPageGroups` 决定当前展示图片。
- 调用 `readerInteractions` 绑定交互。
- 调用 `animations` 执行翻页。

维护要点：

- 主类应尽量保留“状态 + 行为调度 + 渲染入口”，避免继续膨胀 DOM 创建、事件绑定、分页、选区和 transform 规则。
- 页面切换时的交互状态重置集中在 `resetPageInteractionState()`。

### CSS 分片

所有注入页面的样式按职责拆分，并在 `manifest.json` 中按顺序加载。

职责：

- `content-base.css`：全局 CSS 变量和基础主题 token。
- `content-toolbox.css`：收藏悬浮按钮、收藏面板、设置弹窗、动态过滤隐藏类、导入导出弹窗。
- `content-reader.css`：阅读器覆盖层、控制区、设置面板、截图选择 UI。
- `content-responsive.css`：触摸设备和紧凑布局响应式样式。

维护要点：

- 收藏块固定宽度由 CSS 变量控制：
  - `--bilibili-fav-columns`
  - `--bilibili-fav-item-width`
  - `--bilibili-fav-list-gap`
  - `--bilibili-fav-list-padding-x`
- 设置弹窗 selector 使用 `#bilibili-toolbox-settings-panel`。
- 动态过滤隐藏类是 `bilibili-toolbox-hide-forward-dynamic`。

### 构建与测试文件

- `build-userscript.ps1`：从源码和 CSS 生成 `dist/BiliPocketReader.user.js`。
- `build-userscript.cmd`：Windows cmd wrapper。
- `dist/BiliPocketReader.user.js`：userscript 构建产物，需要随源码变更重新生成。
- `tests/content-modules.test.js`：内容脚本模块单元测试。
- `tests/storage-service.test.js`：storage 和收藏服务测试。
- `安装指南.txt`：面向用户的安装说明。

## 收藏与设置 UI 交互

悬浮按钮行为：

- 桌面 hover：展示收藏面板。
- 桌面右键：打开设置弹窗。
- 移动端点击：打开/关闭收藏面板。
- 移动端长按：打开设置弹窗。
- 视频页：默认隐藏，交互时临时显示。

收藏面板：

- “添加当前”调用 `pageInfo.getCurrentFavoriteData()` 并写入收藏服务。
- “设置”打开 `settingsPopoverUi`。
- 每个收藏项根据类型渲染头像/封面、名称和跳转链接。

设置弹窗：

- 收藏列数按钮写入 `favoriteColumns`。
- 隐藏转发开关写入 `hideForwardDynamics`。
- 关键词开关和输入框只改内存过滤状态。
- 导入/导出使用 `favoritesTextDialog`。

## 阅读器交互

入口：

- `content.js` 调用 `Toolbox.reader.shouldInitComicReader()`。
- 命中后创建 `BiliComicReader`，页面右下角出现阅读器入口按钮。

核心状态：

- `imgList`：图片 URL 列表。
- `currentIndex`：当前第一张图片下标。
- `activePageCount` / `lastStep`：当前显示张数和默认翻页步长。
- `viewMode`：`auto` / `single` / `double`。
- `animationMode`：`smooth` / `fade`。
- `imageRenderMode`：`sharp` / `smooth`。
- `backgroundMode`：阅读背景色。
- `filterMode`：`original` / `soft` / `warm` / `grayscale`，只影响阅读显示，不写入截图。
- `scale`、`translateX/Y`、`rotation`：视图变换。

分页规则：

- `single` 永远单图。
- `double` 尽量双图。
- `auto` 中，如果第一张或第二张是宽图，宽图所在组单图显示。
- 上一组逻辑由 `readerPageGroups.getPreviousIndex()` 统一处理。

手势：

- 鼠标滚轮缩放。
- 双击缩放/重置。
- 鼠标拖拽平移。
- 移动端单指滑动翻页或拖图。
- 移动端双指缩放。
- 双指双击重置。
- 可选点击屏幕左右区域翻页。

## 深链和 URL 处理

空间图文收藏链接由 `Shared.getFavoriteLink()` 生成：

```text
https://space.bilibili.com/<uid>/upload/opus
```

进入页面后：

扩展会等待空间图文页内的“全部图文 / 专栏 / 动态”tab 渲染出来，并自动点击“专栏”。该行为固定开启，不持久化设置；每次进入同一个空间图文页只自动选择一次。

## 常见维护任务

### 新增一个持久设置

1. 在 `shared.js` 的 `TOOLBOX_SETTINGS` 加 key。
2. 在 `createDefaultData()` 和归一化逻辑中加默认值。
3. 在设置 UI 中只调用 `storage.setSetting(...)`。
4. 在消费模块的 `sync()` 或 render 中从 dataProvider 读值。
5. 补 storage-driven sync 测试。

### 调整收藏卡片布局

优先改 `content-toolbox.css` 和必要的 `content-responsive.css`：

- 面板宽度：`#bilibili-fav-panel`
- 网格列：`.bilibili-fav-list`
- 单个收藏块：`.bilibili-fav-item-link` / `.bilibili-fav-item`

列数合法值和默认值在 `shared.js`。

### B 站页面 DOM 改版

按影响范围排查：

- 收藏页面信息提取：`content-page-info.js`
- 阅读器图片收集：`comic-reader-images.js`
- 动态卡片识别/转发识别：`dynamic-filter.js`

### 调整阅读器分页

优先改 `comic-reader-page-groups.js`，再跑 `content-modules.test.js`。只有涉及渲染状态时再改 `comic-reader.js`。

### 调整阅读器按钮行为

优先改 `comic-reader-interactions.js`。如果新增按钮，需要同时在 `reader-dom.js` 的 DOM 创建和 `comic-reader.js` 的按钮同步方法中接入。

### 调整阅读器 DOM、缩放或截图选区

- DOM 结构优先改 `reader-dom.js`。
- 缩放、平移、原图尺寸优先改 `reader-transform.js`。
- 截图选区优先改 `reader-selection.js`。
- 主类 `comic-reader.js` 只保留状态和调度入口。

## 构建与验证

运行测试：

```powershell
node BiliPocketReader\tests\content-modules.test.js
node BiliPocketReader\tests\storage-service.test.js
```

重新生成 userscript：

```powershell
powershell -ExecutionPolicy Bypass -File BiliPocketReader\build-userscript.ps1
```

提交前建议检查：

```powershell
rg -n "dynamic-controls-ui|dynamicControlsUi|bilibili-fav-controls-panel|content\\.css" BiliPocketReader -g "!DESIGN.md"
git status --short
```

## 设计原则

- storage 是持久状态唯一来源。
- UI 修改持久设置后只写 storage，不直接跨模块刷新。
- 临时状态可以直接驱动对应模块，但不要写入 storage。
- 阅读器主类避免继续承载过多独立规则，分页和事件绑定已经拆出。
- B 站 DOM 选择器优先集中在 `bilibili-dom-adapter.js`。
- 全局 listener、history patch、message bridge 和 reader 实例必须在 `destroy()` 中可清理。
- 样式按 manifest CSS 分片维护，避免回到单个大 CSS 文件。
- `dist/BiliPocketReader.user.js` 是构建产物，review 以源码为准，但发布前必须重新生成。
