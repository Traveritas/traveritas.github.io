# /draft/ 接入任务

> 2026-11-03。把两张已经认可的卡片做法接进真实站点，先做成一个可回滚的真实路由，不动现有页面。

## 目标

在 `src/pages/draft/index.astro`（地址 `/draft/`）里：

1. 用站内真实的 `WanderIndex`（`src/components/wander/WanderIndex.astro`，`scene="essay"`）铺那片空间；
2. **把它自己的 canvas 卡片层藏掉**（`#w-stage`），保留背景流光、三栏栏头、导航、左下星、Ave；
3. 用 **DOM 卡片**接管三栏，内容来自真实收藏（`getCollection('articles' | 'moments' | 'projects')`，只取非 draft）；
4. 卡片位置**不要写死坐标**：读三栏栏头（`[data-w-head]`）的 `getBoundingClientRect()`，在它下面排卡片，窗口 resize 时重排。

## 两套做法，可切换

用查询参数切换，默认 `halftone`：

- `?v=halftone`：网点 —— 4×4 Bayer 网版、格 5px、卡角对齐 5 的倍数、只用 mask 改每格墨的浓淡；
  亮栏冷墨、夜栏浅墨；悬停把 mask 的 alpha 乘 1.5（180ms）。
- `?v=value`：基准 —— 值偏移（亮栏压暗、暗栏提亮，三栏各一组数）+ 上亮下暗两条 0.6px + 极淡闭合；
  悬停只亮顶沿左边约 62% 一段并把字距放开一点。

两套的展开：点卡片先 60ms 定影，再从这张卡的矩形长成阅读面板（同一块材质），
面板里放真实正文（随笔/项目取那一页的 `article.prose .md`，瞬间用 `html`），`Esc` / `—` 收起，
收起后落回卡片原位、焦点回卡。

参考实现（照抄结构与数值，别重新发明）：
- `design/mocks/cards-r7/halftone-live/index.html` + `notes.md`
- `design/mocks/cards-r7/value-live/index.html` + `notes.md`

## 硬约束

- **不动现有页面与组件**：不改 `WanderIndex.astro`、不改 `src/scripts/wander/*`、不改 `BaseLayout`。
  新增文件只放这三个地方：`src/pages/draft/index.astro`、`src/scripts/draft/*.ts`、`src/styles/draft.css`。
- 藏 `#w-stage` 用一页内联脚本在这个路由里做（`document.getElementById('w-stage').style.visibility='hidden'`），
  **不要改 wander.js**；同时确认它的输入监听不会和 DOM 卡打架（必要时在卡片层上 `stopPropagation`）。
- 页面用 `BaseLayout`，`immersive` + `noindex`；标题随便写「草稿 · 卡片」。
- 不装依赖。
- `npm run build` 必须通过（这是硬性验收）；跑 `npm run check` 若有类型错也要修。

## 交付

1. 代码（上面三个位置）。
2. `npm run build` 的输出（成功与否）。
3. 用 dev server 截 4 张图证明能用：
   - `/draft/`（halftone 列表）
   - `/draft/?v=value`（value 列表）
   - 展开一篇文章后
   - 窄屏 390
   截图存 `design/mocks/cards-r8/`（自己建目录），用本机 Chrome + CDP（可参照 `design/mocks/cards-r7/frames.cjs`）。
4. `design/mocks/cards-r8/notes.md`：三段——接了哪些真东西、哪些地方还是假的（比如卡片位置靠读栏头）、
   接到正式页面还需要做什么。

## 交回来

4–6 句：build 过没过、真站上看起来和原型差在哪、最没底的一处。
