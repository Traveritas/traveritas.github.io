# 内页排版分层（随笔 / 项目）

> 给「补设计尚未成形的样式」这一轮用的地图。改动内页正文排版前先读这里，
> 免得在同一元素上两处各写一份、或漏掉一边。
> 摊开来看的样张：`/styleguide/`（`npm run dev` 后访问；三栏并置 + 两态开关），
> 怎么加新样张见 `docs/design/styleguide.md`。

## 一、结构：一层公共 + 两个变体

内页正文（随笔 `src/pages/articles/[slug].astro`、项目 `src/pages/projects/[slug].astro`）
的 markdown 容器都是 `<div class="md">`，排版全部集中在 `src/styles/global.css` 的
「内容页排版」一节，分三层：

```
.prose                    骨架：列宽 34em、页头、元信息、.prose-rule
├─ 默认层  .prose p/h2/h3/blockquote/ul/ol/code/pre/img
│          给 about 页这类非 markdown 长文兜底；内页里被公共层覆盖
├─ 公共层  .md …          随笔与项目取值一致的规则（含计数器、列表骨架、互链块 .xfile）
└─ 变体层  .prose--essay  随笔：宋体夜话（长文阅读正典）
           .prose--project 项目：黑体方正文（与随笔保持体温差）
```

变体类挂在 `<article class="prose prose--essay">` 上，**必须挂在 `.prose` 同一个元素**：
`--measure: 34em` 是 em 单位，会按该元素自身的字号折算列宽。

**层序约定**：公共层刻意排在默认层之后，同权重时以公共层为准；
变体层写成 `.prose--x .md …`（比公共层多一个类），权重天然更高，不需要 `!important`。
新加规则时按这个顺序往下排即可。

## 二、元素归谁

| 元素 | 公共层（两页一致） | 随笔变体 | 项目变体 |
| --- | --- | --- | --- |
| `article.prose` 度量 | — | 宋体 · clamp(17→18.5px) · 行高 2.08 · 字距 .015em · 两端对齐 | 黑体 · 16px · 行高 2.05 · 字距 .02em |
| 段落 `p` | 下边距 1.5em | — | 上下 1.3em |
| 两态块 `div[data-side]` | 下边距 1.5em | — | 上下 1.3em（＝自己的段落值，「两态块与段落同呼吸」） |
| 小节 `h2` | 计数器自增 + 汉字序号（琥珀、600） | 行内嵌字，字号 1.28rem、上 2.65em | flex 行，方框序号 + 右侧细线，字号 1.2rem、上 2.5em |
| 列表 `ul/li` | `list-style:none`、`li` 相对定位、**符号只挂 `ul > li::before`** | 间距 1.6em、左内 1.75em、符号＝14° 琥珀微刻度 | 间距 1.4em、左内 1.9em、符号＝mono `○` |
| 有序 `ol` | 保留原生序号：`ol > li` 左内归零、`::marker` 换 mono 0.84em + `--fg-soft` | 字号随正文；嵌套 `ol` 从 1 重新计 | 与公共层同款 |
| 任务项 `- [x]` | — | — | `ul > li:has(input)` 系：`○` → 琥珀 `✓`，未完成项 `--fg-soft` |
| 表格 `table` | 无框名录：`th` 底线 `--line`、行间 55% 淡线、末行收口；内距 `.6em .9em … 0`、整表 `tabular-nums` | 同公共层 | 板块：1px 外框 + 2% 底、内距 `.72em .95em`、`th` 700 |
| 图 `figure` / 图注 `figcaption` | `figure` 上 2.4em、图版内的图去掉上下外边距；图注 0.78rem + `--fg-soft`。**图注内容自定、不自动编号** | 同公共层（松散图版） | 成框图版：1px + 2% 底、内距 .9rem；图注降为 mono 0.58rem 角注 |
| 代码 `pre` / 行内 `code` | 行内一律写 `:not(pre) > code`；`pre` 底 4% `--fg`、行高 1.8 / 0.85em、`data-language` 语言签、4px 细滚动条 | 左缘 2px 梦色 50%；行内不填底、改压一条梦色下划线（0.84em） | 1px 方框（直角）；行内填 7% 底成小块 |
| 行内强调 `strong` | — （高层给的是随笔值） | 600 + 梦色 30% 底衬 | 700 + 琥珀 24% 底衬 |
| 行内光景 `((…))` / `{{…}}` | 两页同款：醒面归零、梦面才动；默认值只有一处 | — | — |
| 链接 `a` | `--umber` | — | — |
| 引文 `blockquote` | 梦色左边 + 0.96em + **drift 浮动**（2026-09-25 实测：**两页同款** `drift 9.5s / 2.6px / 0.15deg`） | 与公共层相同 | 与公共层相同 ——「项目页不浮动」是**误记**：公共层排在默认层之后，`.md blockquote` 两页都吃到 |
| 跨页互链 `.xfile` | margin-top 2.6rem 起 | — | margin-top 3rem |

**行内光景**（`((浮起))` / `{{流过}}`，写作手册见 `docs/writing.md`）样式在 `global.css`
「行内光景」一节，随笔与项目同款：只在 `body[data-reality='dream']` 下声明动画与背景，
醒面没有任何动效与色差（与 `.drift` 的 `--still` 不同 —— 它们不消费 `--still`，
因为逐帧解算那个根变量会让 Blink 每帧 tick，构块场为此吃过一次亏，见 `Constructs.astro`）。

- **逐字浮起**拆字成 `inline-block`（每个字一盒）：字串内部不再换行，两端对齐在此留缺口，2–8 字为宜。
- **流光**不拆字，不影响换行与两端对齐；只动 `background-position`，不碰字号字距，所以没有布局抖动。
- 参数都是自定义属性（`--float-amp/dur/stagger/tint/sway`、`--sheen-angle/hue/span/dur/ease`），
  默认值写在 keyframes 与 `background-image` 里；正文侧由 `((…|k=v,…))` 覆盖，预览页「醒梦双态」一节有滑杆。

**代码配色**由 `astro.config.mjs` 的 `shikiConfig.theme` 指向 `src/markdown/shiki-theme.mjs`：
主题里的颜色写成 `var(--umber)` / `var(--ghost-ink)` / `var(--fg-soft)` 这类字符串，会被原样写进
token 的行内样式，于是代码的颜色跟着醒梦两态（`reality.ts` 逐帧改写的强调色）与夜色一起走。
底由主题与 CSS 写成同一条 `color-mix(in srgb, var(--fg) 4%, transparent)`：主题的值是**行内**样式，
会压过样式表，所以两边必须同值（写 `transparent` 不是「交回 CSS」，只会把底抹掉）。
琥珀在代码里一次都不出现 —— 它属于锚点与进度。

页面 `<style>` 里只剩该页独有的块：随笔的 `.dawn-glow`、`.tag-row`、`.wake-card`；
项目的 `.pin-line`、`.coverband`、`.file-note`、`.link-list`、`.pj-next`。
（随笔页原有的「起笔琥珀标尺」（`.prose-rule::before`）已于 2026-09-25 移除，见第三节。）

## 三、还没有设计的（下一轮的活）

> **本轮（2026-09-25）已落地**：`ol`（保留原生序号 + mono）、`table`（无框名录 / 项目板块）、
> `figure` + `figcaption`（松散图版 / 项目图版，**图注不自动编号**）、
> `code` + `pre`（梦色左缘 / 方框 + 语言签 + 站内令牌配色），
> 以及两处必修：**列表记号收窄到 `ul > li`**（原先 `ol` 会同时吃到自绘记号与原生序号）、
> **行内 code 收窄到 `:not(pre) > code`**（原先底与字号会漏进 `pre`）。
> 备选与过程见 `design/mocks/p19-notes.md`。

- **`h3` 与其上的小节序号**：仍只吃默认层（`1.1rem` / 上 `2.2em`）。
  **2026-09-25 裁决：本体不做** —— 记号与序号（含 `h2` 的汉字序号）将整体由一枚自制的「小节」组件承担。
- **`<caption>` 与 `figure` / `figcaption` 的来源**：样式已就位，但 markdown 出不了这几个标签，
  只有正文里写原始 HTML 才吃到。若希望纯 markdown 也能出图注，得给 Sätteri 加一个小插件
  （把图片的 title 升为 figcaption，做法见 p19-notes.md）。
- **三处例外：已全部裁决（2026-09-25）**：
  - **引文**：**保持两页同款**（`drift 9.5s / 2.6px`），不加差别 —— 现在没有任何项目正文用到引文，
    凭空拉开振幅等于造一条没人验证的规则；将来真要用，项目侧改 `--d-amp: 1.2px / 12s` 一行即可。
  - **两态块边距**：项目侧由 1.35em 改成 **1.3em**（＝它自己的段落值），规则收敛为「两态块与段落同呼吸」。
  - **起笔琥珀标尺**：**不做**。随笔页原有的那枚一并移除（它在梦面是 54px 的琥珀短线、
    醒面因 `--amber` 插值成冷灰 `#a7b1ba` 而与 1px 的 hr 几乎重合 —— 这也是「看不出有」的原因）。
    两页此后都只有 `hr` 那条 `--line` 发丝线。
- **列宽 34em**：**已判定不是疏漏** —— em 在中文字体里约等于一个汉字宽，
  两页都是「一行 34 字」，只是字号不同（18.5px → 629px、16px → 544px）。


## 四、命名与红线

- 变体类名沿用 `prose--essay` / `prose--project`；再加页面时照此扩展。
- `AGENTS.md` 红线 3 禁「账目 / 台账 / 案号」这类词汇。现存仍与红线冲突的地方：
  `global.css` 里的 `.ledger` 一族（被首页与标签页使用）、`articles/index.astro` 的 `.essay-ledger`、
  `projects/index.astro` 的 `.prj-ledger`、以及项目页封面渲染出的 `PRJ-01` 文案。
  类名与注释不影响用户，但下一轮顺手改名成本最低。

## 五、改完怎么验证（这次踩过的坑）

1. **先修工具**：`getComputedStyle(el).getPropertyValue('fontWeight')` 取不到值——
   这个 API 只认连字符名（`font-weight`），驼峰一律返回空串，会让整份对比静默通过。用 `cs.fontWeight` 这种属性访问。
2. **对比布局要连 `y/x/宽/高` 一起比**，不能只比属性值：
   这次列表项 `margin-top` 从 0.4em 变成了 0，但因为外边距塌陷，`y` 与高度逐项完全一致，属惰性差异。
3. **开屏有会话档位**：`boot.ts` 用 `sessionStorage` 的 `xm-boot-seen` 判断首访。
   首访揭幕在 3.1s，同会话后续页面走 1.05s 快版。**不预热就对比，会把开屏时机差当成样式差**
   （现象是同一元素一版醒面文案、一版梦面文案——因为入梦换面发生在 `booted` 之后 120ms）。
   做法：每换一个源先随便加载一页预热，再统一在 2s 后采样。
4. **morph「走神」是随机的**：`[data-morph]` 元素会周期性乱码再归位，两态演示页里这类 span 的宽度每次采样都不同。
   判断方法：同一版构建连采三次，自身就会抖的行不算差异。
5. **浮动动画会带相位噪声**：采样前把 `--still` 置 0 并强制一次重排（读一次 `offsetHeight`），
   否则引文的 `transform` 矩阵每次都不同。
6. **行内光景不吃这一套**：`.float-run` / `.sheen-run` 只在 `body[data-reality='dream']` 下
   声明动画，把 `--still` 置 0 不会让它们停下。要对照就显式切面：醒面读到的
   `translate` 恒为 0（没有 animation），流光那一段的 `background-image` 恒为 `none`。

本轮改造的实测结果：4 条路由（随笔 2 篇 / 项目 2 篇）× 改动前后，
`article.prose` 子树逐元素几何与排版全部一致；仅存的差异是新增的变体类名本身、
上面第 2 条的惰性边距、`color-mix` 与字面 rgba 的序列化差异（数值相同），以及第 4、5 条的运行时噪声。
