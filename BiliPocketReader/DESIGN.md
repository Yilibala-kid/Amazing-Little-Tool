# BiliPocketReader 维护指南

B 站 MV3 内容脚本扩展，提供漫画阅读、收藏快捷入口和动态过滤，同时发布 userscript。用户安装与操作见 [安装指南](安装指南.txt)。

## 项目结构

`manifest.json` 是脚本加载顺序、样式和权限的唯一清单。模块依次挂载到 `window.Shared` / `window.BilibiliToolbox`，入口 `content.js` 最后初始化。新增模块同时检查依赖顺序并重建 userscript。

| 范围 | 文件 | 维护入口 |
| --- | --- | --- |
| 公共模型与存储 | `shared.js`、`storage-service.js` | 收藏格式、默认设置、归一化、串行保存与变更通知 |
| 站点与路由 | `bilibili-dom-adapter.js`、`content-url.js`、`content-page-info.js` | DOM 选择器、URL 变化、当前页收藏信息 |
| 页面入口 | `content.js` | 服务初始化、设置按需刷新、路由与关闭清理 |
| 收藏 UI | `favorites-ui.js`、`settings-popover-ui.js`、`favorites-text-dialog.js` | 收藏卡片、设置、文本导入导出 |
| 空间与动态 | `space-opus-tabs.js`、`dynamic-filter.js` | 自动选择专栏、转发识别、增量关键词过滤 |
| 图片来源与缓存 | `comic-reader-images.js`、`reader-image-loader.js` | URL/懒加载收集、原图选择、解码、预加载、缓存保护 |
| 阅读调度与分页 | `comic-reader.js`、`comic-reader-page-groups.js` | 当前组、渲染提交、单双页与宽图判断 |
| 阅读 DOM 与偏好 | `reader-dom.js`、`reader-preferences.js`、`reader-settings.js` | 设置控件、合法值、持久化与显示效果 |
| 输入和翻页 | `comic-reader-interactions.js`、`reader-touch.js`、`reader-swipe.js`、`animations.js` | 按钮/键盘、手势分流、跟手翻页与过渡 |
| 几何与截图 | `reader-transform.js`、`reader-selection.js`、`reader-screenshot.js` | 缩放/旋转/平移、选区、PNG 输出 |
| 缩略图 | `reader-thumbnails.js` | 按需预览、定位、键盘焦点与跳转 |
| 样式 | `content-base.css`、`content-toolbox.css`、`content-reader.css`、`content-responsive.css` | 主题变量、收藏、阅读器和响应式覆盖 |
| 发布 | `build-userscript.ps1`、`build-userscript.cmd`、`dist/BiliPocketReader.user.js` | 从 manifest 合并源码和样式、注入 GM 存储适配 |

`dist` 是生成产物，修改源文件后重建，不直接手改。扩展没有运行时第三方依赖，测试文件不进入 userscript。

## 数据和生命周期

`chrome.storage.local` 的 `bilibiliToolboxSharedData.v1` 保存 `{ favorites, settings }`。收藏身份为 `user:<uid>`、`opus:<uid>` 或 `readlist:<id>`；导入时归一化并去重。设置键为 `hideForwardDynamics`、`favoriteColumns`、`readerPreferences`。

- 收藏与设置写入统一经过 `storage-service.js` 的串行队列，成功后再通知；失败不发布推测状态。
- 阅读偏好的默认值、合法档位和兼容迁移集中在 `reader-preferences.js`。单项读取/更新只归一化该字段，完整载入/保存复用同一规则。设置 UI 只调用 `setPreference()`；归一化后值相同则跳过保存和副作用。
- 清晰度保存为 `0 / 40 / 100`。旧滑块数值取最近档位，等距取低档；仅在缺少新字段时将旧 `clarityMode: mild` 转为 40，保存时移除旧字段。
- `transitionEnabled` 默认开启，控制触屏跟手过渡；关闭时拖动期间保持画面，松手后播放所选常规翻页动画。按钮和键盘始终使用所选翻页动画。
- 关键词过滤仅在内存中生效。收藏列数为 2–5，固定卡片宽度，调整面板宽度。
- `content.js` 按变动字段刷新相关服务；收藏内容相同时复用 DOM，列数变化仅更新布局。
- 路由桥对 history、popstate、hashchange、Navigation API 的通知去重。阅读器按文章路径判断是否重建；离页、关闭和 BFCache 恢复均由生命周期代码处理。

空间图文收藏链接由 `Shared.getFavoriteLink()` 生成，形如 `https://space.bilibili.com/<uid>/upload/opus`。进入后等待标签渲染并自动选“专栏”，同一次进入只执行一次，不保存为偏好。

## 阅读与图片约束

`currentIndex` 是请求的第一张图片下标，`displayedIndex` 是已经提交的图片组。目标组解码完成后才替换画面；`pageFlipToken` 阻止旧请求覆盖新请求，失败保留当前页。

`commitImages()` 统一完成换图、入场动画、已显示页码/缩略图更新，再安排预加载和相邻组保护，最后同步清理缓存。普通翻页与跟手翻页共用该提交入口；入场动画只初始化一次。

- `single` 单图、`double` 尽量双图；`auto` 将宽图单独成组。向前、向后的组边界统一由 `comic-reader-page-groups.js` 计算，考虑旋转后的宽高。
- `sharp` 使用原图 URL；`smooth` 可保留 B 站缩放后缀。缩放和截图继续使用可用的原始像素，避免仅放大低清预览。
- 当前组与相邻预览共用无副作用的 `getImageDisplayLayout()`。只有当前组更新缩放基准，预览不能改变当前页的缩放和平移。
- 图片布局在静止时控制在视口附近，几何缓存用于拖拽边界；触摸移动不反复读取布局。
- 预加载可选 2、4、6 页或全部，默认全部。后台逐张解码；前台请求复用已加载或正在加载的图片。调小预加载数量、替换图片列表或离页会取消旧队列。
- `imageMemoryPolicy: page` 保留已完成图片，关闭阅读覆盖层仍可复用，离开文章时释放；`previous` 在成功提交后释放更早的图片，回看时重新加载。
- 触屏额外保留相邻前后组的缓存保护，包括 `previous` 策略下的上一组。保护必须在缓存清理前建立，关闭/换组时释放；相同 URL 的显示节点需克隆，避免从当前画面移走。
- “全部预加载 + 关闭页释放”没有总像素预算上限；不要把相邻预览的数量限制误写成总缓存限制。

## 手势与过渡

`reader-touch.js` 分流点击、双击、双指缩放；`ReaderSwipe` 管理单指翻页。图片变换留在内层容器，外层舞台仅修改 transform 和 opacity。

实际拖动距离与待绘制偏移都保存在当前 `gesture` 中；松手判定由 `end()` 一次性消费，`finishTurn()` 负责等候邻页并选择常规翻页或跟手动画收尾，过期请求通过代次和动画标识忽略。

- 约 10 CSS px 后锁定手势方向；纵向操作不翻页。放大时先平移图片，到边缘继续拖动的溢出距离才用于翻页。
- 拖动前 24 CSS px 为无视觉变化区域，超过后扣除该距离再驱动画面，避免起步跳动。松手达到固定 80 CSS px，或至少 32px 且最近 100ms 速度达到 0.5px/ms，即可翻页；快速反向移动取消。手机和平板使用同一距离。
- 平行保持页面与手指等距移动；淡入和平滑采用固定 240px 过渡行程。120px 中点两页均透明，显示所选阅读背景。平滑附加 48px 位移与 5% 缩放。
- 平行收尾/边界回弹为 120–220ms；淡入和平滑单阶段为 280–420ms。跨背景中点时分别为 160–220ms、220–280ms，并保留至少一帧背景色。减少动态效果时即时完成。
- 过渡关闭时相邻组仅保存图片数据与缓存保护，不创建预览舞台、克隆图片或计算预览布局。松手后将准备好的组交给常规渲染动画；平行动画仅在实际翻页时创建舞台。双页内 URL 重复时在实际提交前克隆第二个节点。减少动态效果或已经到达目标位置时直接收尾。
- 动画中的再次触摸从实际画面继续，双指或额外触点取消翻页，剩余触点全部抬起后才允许新手势。单指手势仅接受一次结束事件，重复结束/剩余移动不能再次翻页；长拖只在抬手时提交一个相邻组。
- 缺页时等待解码，失败回弹并允许重试。取消、改设置、旋转、窗口变化和关闭均清理计时器、帧回调、预览节点及保护；异步回调检查代次。
- 同帧移动合并到一次 requestAnimationFrame；相邻组已就绪或正在准备时复用现有任务，等待启动时复用缓存保护。旧任务结束不能释放新一组的保护；提交后重建任务，静止后恢复后台预加载。

## 清晰度、截图与缩略图

清晰度通过每个阅读器独立的 SVG 卷积滤镜锐化文字和线条，不使用 AI 模型、不改变图片尺寸。显示滤镜与清晰度可以组合；截图仅应用清晰度，排除暖色/灰度等显示滤镜。导出开始时克隆清晰度滤镜，避免异步输出受中途设置变化影响，完成或取消均释放克隆。

截图的“全图”只扩展选区，复制/下载分别输出；取消、关闭或失败须清理临时画布与任务。复制失败保持选区，不自动下载。

缩略图面板按可见区域加载预览并标记当前组，打开定位当前页，点击跳转后关闭；键盘焦点在面板内，触屏滚动不触发翻页。关闭释放预览 DOM 和观察器。

## 构建与验证

以下命令从仓库根目录运行。无依赖检查包含源码/测试语法、manifest 资源、userscript 源码一致性及全部 Node 单元测试：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File BiliPocketReader/build-userscript.ps1
node scripts/verify-js.cjs
```

仅运行阅读器单元测试：

```powershell
node --test BiliPocketReader/tests/*.test.js
```

浏览器测试需要可解析的 Playwright（可通过 `NODE_PATH` 指向已有依赖），默认使用其 Chromium；`BPR_BROWSER_PATH` 可指定系统 Edge/Chrome。

```powershell
$env:BPR_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
foreach ($suite in @('reader', 'clarity', 'swipe', 'original-layout', 'thumbnails')) {
    node "BiliPocketReader/tests/browser/$suite.browser.cjs"
    if ($LASTEXITCODE -ne 0) { throw "$suite failed" }
}
```

| 测试 | 覆盖重点 |
| --- | --- |
| `content-modules.test.js` | URL/DOM 适配、动态过滤、收藏、分页和图片布局计算 |
| `storage-service.test.js`、`storage-concurrency.test.js` | 数据归一化、导入导出、并发保存、失败恢复与通知去重 |
| `reader-settings.test.js` | 全部设置选项/合法值、旧数据迁移、保存及控件事件 |
| `reader-lifecycle.test.js` | 路由/关闭/BFCache、按需刷新、截图输出与取消 |
| `render-pipeline.test.js` | 解码竞态、加载失败、预加载队列、缓存释放和几何缓存 |
| `reader-swipe.test.js` | 固定阈值、快速甩动、方向锁定、帧合并、中点与取消 |
| `browser/reader.browser.cjs` | 完整入口、设置布局/输入、缓存、截图、DOM/监听器清理、增量过滤 |
| `browser/clarity.browser.cjs` | 扩展和脚本版的实际 PNG 像素、设置交互及导出期间强度快照 |
| `browser/swipe.browser.cjs` | 两种发布格式、手机/平板触摸、背景像素、开关、解码失败与关闭清理 |
| `browser/original-layout.browser.cjs` | 2400×16000 原图、旋转布局、缩放和控件可点击性 |
| `browser/thumbnails.browser.cjs` | 桌面/触屏预览、懒加载、焦点、跳转失败和资源释放 |

浏览器准备逻辑集中在 `tests/browser/helpers.cjs`：浏览器启动、临时截图目录、存储模拟和按 manifest 加载源码。脚本版只模拟 GM，让生成产物自己的存储适配实际运行；完整入口用例加载 `content.js`，其余用例直接创建阅读器。

各浏览器套件拦截全部网络请求，使用本地生成的图片；截图输出到系统临时目录。测试不会写入用户浏览器配置，不代表真实 B 站 DOM、扩展隔离世界或手机帧率/发热已验证。

维护测试时，合法值/选项遍历放单元测试，浏览器测试聚焦真实布局、输入、像素及资源生命周期。删除用例前确认相同行为已有覆盖，保留失败、取消、关闭和旧数据兼容路径。兼容迁移代码仍服务已保存的数据，不因旧 UI 被删除而移除。
