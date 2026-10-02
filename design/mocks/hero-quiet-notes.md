# 首屏原型 · quiet（去掉大字）

页面：`/mock/hero-quiet/`（v1 沿线横排）· `/mock/hero-quiet/?v=2`（竖排）
文件：`src/pages/mock/hero-quiet.astro`（复制自 `new.astro`，只重做场 0）· `src/scripts/proto/hero-quiet.ts`
截图：`node design/mocks/.shot-hero-quiet.cjs [base]`（默认连 `astro dev` 的 4321）→ `design/mocks/_shots-hero/quiet-v{1,2}-{dream,wake}-{d,m}.png`

## 思路

首屏只留三样东西：那根 14° 的线（全站同一根脑电线，Worker 画）、那句问句、以及线两侧两枚小注「醒 06:31」「梦 23:07」。两个时刻正是全站夜轴的两端，用来暗示两侧，不点破。大字原本承担的「醒 / 梦两侧」现在交给了位置：醒在线上方，梦在线下方，各有一根沿线法向的细引线垂到线上。当前所在那一面的字是实的，另一面退成淡墨（`--reality-mix`）。

- **v1 · 沿线**：问句挂在线下、与线平行，逐字从线上落定。线起头处有一枚躺在线上的小序号 `00 / 05`（五幕）。左下角是页角元信息（`入夜 · 23:07` / 随笔、项目，与正在成形的东西）。
- **v2 · 竖排**：问句竖排三列立在线上（右上），列脚沿线逐列抬高，右沿对齐页头导航的右端。小注也改成竖排。

## 调研提炼的三条原则

1. **负空间是结构，不是空白**（間 / ma）。画面中心让给线，文字只占线的一侧和页角；大片空白本身就是内容。日式海报常把文字推到边缘、中心不放文字重点。
2. **层级只靠字号与字重，最多三级**。问句（主，约 1.9vw / 300）、小注（约 20px 正文字）、元信息（10px 等宽 + 宽字距），中间不再加任何层。辅助信息用小字号配降低的对比度。
3. **一切落在网格上**。网格就用页头那条 42rem 中栏（12 栏）：站名、问句起点、序号、页角元信息共用中栏左沿；竖排变体的问句右沿对齐导航右端。线是唯一不受网格约束的元素，它和网格的张力就是画面。

参考：
- Swiss / 国际主义排版在网页上的要点（严格栏格、左对齐、留白即结构、只用字号字重表达层级、元信息 10–12pt 细字）：<https://digitalheroes.co.in/styles/swiss-grid/>、<https://www.pixeldarts.com/en/post/swiss-style-web-design-a-comprehensive-guide>、<https://designmd.app/library/minimalism-swiss-style>
- 日式网页 / 海报的 ma 与边缘排字：<https://www.utsubo.com/blog/japanese-web-design-style-guide>、<https://medium.com/@katyatinmey/https-medium-com-katyatinmey-typography-in-japanese-posters-eng-ea1aeab53ad6>
- 竖排的 CSS 写法：<https://www.w3.org/International/articles/vertical-text/>
- 极简 hero 合集（看层级与留白比例用）：<https://herogrids.com/style/minimal/>、<https://reallygooddesigns.com/hero-section-design-examples/>

## 实现层次

- 线高公式 `--ly = 50svh + (x − 50vw)·tan14°`。每个元素写自己的 `--x`，再用 `--ly` 把自己挂到线上方或下方，全是静态 CSS 定位。
- 竖排列脚抬高：`padding-inline-end: n · 2f · tan14°`（列宽 = 行高 2f）。
- 入场：问句逐字 `opacity + translateY`，小注、序号、元信息只做 `opacity`。都是一次性 CSS 动画，依赖 `html.booted`。
- 滚动淡出：只改外层 `.qset` 的 `opacity`（读 `--p`）。

## 性能

`hero-quiet.ts` 去掉了膜切口、字形遮罩、波纹贴图和 30fps 节拍。主线程只在滚动、尺寸变化和入场线画出的约 1.3s 内出帧；静置时没有 rAF。开屏没有任何 `filter`、`clip-path` 或 `mask`。

实测（dev 模式，1440×900，入场结束后静置 3 秒）：

| 页面 | rAF | 样式重算 | 重算耗时 | 脚本耗时 |
|---|---|---|---|---|
| quiet | 0 | 4 | 3ms | 1ms |
| `/new/` | 91 | 91 | 67ms | 36ms |

## 已知问题

- 开屏没有「醒 / 梦」的大视觉记忆点，记忆点全押在线和排版上。v1 偏安静，可能被认为太空、像模板。
- 窄屏顶部是页头和元信息，下面一大片空到线；v1 窄屏问句不倾斜，和线的关系弱一些。
- v2 竖排时，小注的等宽时刻是侧躺的拉丁字（竖排海报的常规做法），不一定讨喜。
- 窄屏页头导航被挤成竖排，这是共享页头本身的问题（`/new/` 同样如此），不在本原型范围内。
- 截图里的线在静帧下呈阶梯状，是 Worker 画布在 headless 下取到的瞬间，不代表实际观感。
