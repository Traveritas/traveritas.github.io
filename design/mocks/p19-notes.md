# p19 正文元素补齐（h3 / ol / table / figure / code）· 自验笔记

> 稿：`design/mocks/p19-prose-elements.html`（`node design/.shot-p19.cjs` 出图）
> 题面：`docs/design/content-typography.md` 第三节「还没有设计的」＋ backlog 六.8 那四处待拍板。

## 裁决与落地（2026-09-25）

| 项 | 裁决 | 落地位置 |
| --- | --- | --- |
| h3 与其上的小节序号 | **本体不做**，整枚留给自制的「小节」组件 | 未动（仍只有默认层 `1.1rem` / 上 2.2em） |
| ol | **B**：保留原生序号，只换成 mono 0.84em + `--fg-soft`（两页同款） | `global.css` 公共层 |
| table | **A**：无框名录 / 项目侧方框板块 | `global.css` 公共层 + 项目变体层 |
| figure / figcaption | **A**，但**图注不自动编号**（内容由正文自己写） | `global.css` 公共层 + 项目变体层 |
| code / pre | **A**：随笔梦色左缘 / 项目方框 + 语言签 + 站内令牌配色 | `global.css` 三层 + `src/markdown/shiki-theme.mjs` + `astro.config.mjs` |
| 必修 ①（`ul > li::before`） | 随 ol=B 一并修（否则记号会压在原生序号旁的首字上） | `global.css` 公共层 + 两个变体层（含施工清单的 `ul > li:has(input)`） |
| 必修 ②（`:not(pre) > code`） | 随 code=A 一并修 | `global.css` 三层 |
| 必修 ③（Shiki 深色底） | 随 code=A 一并修 | 自写主题 `src/markdown/shiki-theme.mjs` |
| 引文浮动 | **保持两页同款**（不加差别）；仅改正误记 | 无需改动 |
| 两态块边距 | 项目侧 1.35em → **1.3em**（＝它自己的段落值） | `global.css` 项目变体层 |
| 起笔标尺 | **不做**；随笔页原有那枚一并移除 | `pages/articles/[slug].astro` 的页内样式 |
| 列宽 34em | 判定「不是疏漏」，已写进 content-typography.md 第二节末 | 无需改动 |

配色落地的一个升级：稿里 token 是用 `.tk-*` 类手写的，真落地时改由 Shiki 主题直接输出
`var(--umber)` / `var(--ghost-ink)` / `var(--fg-soft)` 这类**字符串**（Shiki 原样写进行内样式），
于是代码的颜色跟着醒梦两态与夜色一起走，CSS 里不必再维护一套 token 类。
主题里**琥珀一次都不出现**（数字与运算符回到中性 `--fg`，第一版把 `=` `:` `=>` 也染成了
`--umber`，满屏都是那枚最深的墨，已收窄）。

## 主张

h2 上其实早就定下了一条规则：**随笔是行内记号，项目是方框板块**——随笔的小节号嵌在字里（琥珀、0.6em，被正文读过就忘），项目的小节号是方框加一条右侧细线（自成一块）。

本轮只做一件事：**把这条件规则铺到 h3 / ol / table / figure / code 上**。铺完之后两页的体温差不再是一串「这里也不一样、那里也不一样」，而是一句话可复述的规则；反过来，凡是不属于这条规则的东西（两态块边距、引文浮不浮、尺子有没有）就都成了要收掉的例外。

一处刻意的不对称：**琥珀在这五个元素里一次都不出现**。琥珀是全站的「锚点 / 进度 / 焦点」，字号阶梯上只有 h2 的小节号配用它；h3 的序号、代码的关键字、图注的编号，都退到 `--fg-soft` / `--umber` / 梦色压深。这条不对称是本稿最想守住的东西。

## 逐元素

### h3（三级小节）

- **现状**：只吃默认层 `1.1rem` / 上 `2.2em`，与两套 h2 的字号阶梯（1.28 / 1.2rem）不成序。
- **A（本稿）**：公共层只给阶梯——`1.06rem` / 行高 1.72 / 字距 .035em / 上 2.05em 下 .7em；记号交给变体：
  - 随笔：一枚 `--wake` 冷灰短横（1.15em × 1px，`translateY(-.34em)`，`margin-right .62em`）。用冷灰而不用琥珀，也不是 14° 斜线（那是列表刻度的形状，不能撞）。实测 `::before` = `""`、19.5×1px、`rgb(167,177,186)`。
  - 项目：二级汉字序号 `一·一`（`counter(sec) '·' counter(sub)`，0.7em = 11.09px，`--fg-soft`，字重 400）。`sub` 计数器在 h2 处归零。
- **B**：两边都不加记号，靠字重与留白分层（随笔加到 1.14rem = 18.24px）。
- **C**：随笔照旧，项目改成一根竖发丝（`border-left: 1px --line`）——「同一根线横置／竖置」。
- **代价（选 A 或 C 都要认）**：A 的 `sec` 由 h2 自增，**孤立的 h3（前面没有 h2）会显示「零·一」**。规矩得写进写作文档：h3 必须落在 h2 之下。C 没这个依赖，但丢掉层级定位。
- **为什么不给 h3 配琥珀或方框**：h2 的方框是这一层的重量上限，h3 再框一次，两页的阶梯就塌了。

### ol（有序列表）

- **现状**：`list-style` 与标记法全未定义；浏览器默认数字 + 默认层 `padding-left: 1.5em`。**且有一个潜伏冲突**（见「三处必修」）。
- **A**：两页都自绘，与各自 ul 同一套骨架；公共层给位置，变体给记号：
  - 随笔 `一、二、三`（`counter(item, cjk-ideographic) '、'`，0.92em = 17.02px，`--fg-soft`，`padding-left: 2.05em` = 37.93px）——与 h2 的汉字序号同源，只是不点琥珀。
  - 项目 `01 / 02`（mono，0.78em = 12.48px，`padding-left: 1.9em` = 30.4px）——与 ul 的 mono ○、页面上的 `PRJ-01` 同源；**项目侧的 ol 与 ul 正文左缘因此对齐在同一个 1.9em**。
  - 嵌套：内层 `counter-reset: item` 重新从一，记号加括号（`(一)` / `(01)`）区分层级。
- **B**：保留原生数字，只改颜色与字体（`::marker`）。省事，但两页的 ol 会各是各的方言，与 ul 的语言断开。

### table（表格）

- **现状**：全站零规则 → 浏览器默认细框、无内距。
- **A**：公共层只有横向发丝线——`th` 一条 `--line`、行间 55% 淡线、末行收口 `--line`；`th` 600 / `td` 常规，内距 `.6em .9em .6em 0`（实测 `padding-top` 10.67px）；整表 `tabular-nums`；`text-align: left`（随笔正文是两端对齐，表格必须自己左齐）。与 `.ledger` 同族。
  - 项目侧加成板块：1px 外框 + 2% 底 + 内距抬到 `.68em .95em`，与 `.coverband`、方框小节号同族。
- **B**：两页都只用发丝线，不要外框。
- **底色一律用 `color-mix(--fg …)` 而不是 `--bg-sunken`**。`--bg-sunken` 是写死的浅色，一旦正文
  落在深色语境里（首页深眠段那种底）就会亮成一块白斑。**勘误**：本稿初版把这条写成「现状会翻白」，
  不准确 —— `initNight()` 在没有 `#ns-hero` 的页面上直接返回，所以内页从不切夜色，`.md` 的正文
  眼下只会出现在浅色语境；这条是**面向未来的稳当**（也顺带让底色跟着醒梦两态的 `--fg` 走），不是现存缺陷。
  稿里的三夜段开关是为看清这一点而设的预览装置，不是真实页面状态。
- 未做：`<caption>` 的样式写了（mono 0.6rem / 字距 .22em），但 markdown 出不了 `<caption>`，只有写原始 HTML 才吃到。

### figure / figcaption（图与图注）

- **现状**：`.prose img` 只有 `border-radius: 4px` 与 `margin-block: 1.8em`；`figure` / `figcaption` 零规则。
- **A**：`figure { margin: 2.4em 0 }`；图注 0.78rem（实测 12.48px）/ `--fg-soft` / 字距 .05em，**自动编号「图 01」**（`counter(fig, decimal-leading-zero)`，mono 0.6rem，`--umber`）——与 h2 的汉字序号同一套计数器思路，改一篇图的顺序不必手改号。
  - 项目侧整块成框（1px + 2% 底 + 内距 .9rem），图注降成 mono 0.58rem 角注、编号同款，与 `.coverband` 同构。
- **B**：两页同款松散图版（项目侧不要框）。
- **落地前提**：markdown 的 `![](src)` 只出 `<img>`，`<figure>` / `<figcaption>` 只有在正文里写原始 HTML 时才吃到。若希望纯 markdown 也能出图注，得给 Sätteri 加一个小插件（`src/markdown/` 已有 `twilight.mjs` 的先例）：把图片的 **title 属性**升为 figcaption——`![δ 波纹](plate.svg "宽谱 δ 波纹 · 0.5–3Hz")` → `<figure><img><figcaption>宽谱 δ 波纹…</figcaption></figure>`。这条比「靠紧跟其后的斜体行当图注」可靠，也仍然完全确定。

### code / pre（等宽）

- **现状**：`.prose code` / `.prose pre` 只在默认层、两页同款；`pre` 的底是 `--bg-sunken`；而 Shiki 的 `github-dark` 用行内样式把底盖成 `#24292e`（见必修 ③）。
- **A**：**代码与引文都是「外来语」，共用一条梦色左缘**——
  - 随笔 `pre`：`border-left: 2px --dream@50%`、底 `color-mix(--fg 4%)`、右角 4px 圆角（实测 border-left 2px）。
  - 项目 `pre`：吃换成 1px 方框、无左缘强调、直角（实测 border-left 1px），与 table / figure 同族。
  - 行内 `code`：随笔**不填底**，只在字下压一条梦色发丝（外来语的下划线，0.84em）；项目填 7% 底成小块（0.88em）。实测随笔 `background: rgba(0,0,0,0)` + `border-bottom: 1px`。
  - 语言签直接吃 Shiki 已有的 `data-language`（`pre::after { content: attr(data-language) }`，mono 0.56rem 上右角）。
  - 全站把滚动条藏了（`html` 与 `::-webkit-scrollbar` 两处），所以代码块自己开一条 4px 细的（`scrollbar-width: thin` 实测生效）——否则窄屏上横向溢出没有任何提示。
  - **代码里的墨只用全站已有的色**：关键字 `--umber`、类型与字符串梦色压深、注释 `--fg-soft`、数字中性 `--fg`。琥珀不出现。落地时由 `astro.config.mjs` 的 `shikiConfig` 输出 CSS 变量，再在 global.css 里映射到这四个值。
- **B**：两页同款方框（随笔也成框，去掉梦色左缘）。

## 顺带收掉的四处待拍板

| # | 现状 | 本稿 | 实测 |
| --- | --- | --- | --- |
| ① 引文振幅 | **勘误：两页已经同款**（都吃公共层 `drift 9.5s / 2.6px`，实测三个变体一致）。原先记的「项目不浮动」是误记 | 若要区别：项目侧 1.2px / 12s（深眠里浮得慢而少） | 实测 `animation-name` 随笔/项目均 `drift 9.5s`、`--d-amp: 2.6px` |
| ② 两态块边距 | 随笔 1.5em / 项目 1.35em（改造前的既有值） | 删掉项目侧那条覆盖，统一 1.5em | 随笔 27.75px / 项目 **24px**（B 稿 21.6px）；差 0.8px 肉眼不可见，但少一条特例 |
| ③ 起笔标尺 | 只有随笔页有 `.prose-rule::before` | 搬进公共层，两页都有；随笔是琥珀尺，项目是 `--line` 尺身 + 左端 5px 琥珀方块（方框语言的尺） | 见 `15-decisions.png` |
| ④ 列宽 34em | 随笔 629px、项目 544px，被记为「设计意图还是疏漏」 | **不是疏漏**：em 在中文字体里约等于一个汉字宽，34em 就是「一行 34 字」。两页行字数一模一样，只是字号不同（18.5 / 16px） | 实测 `.prose` 宽 629px / 544px、字号 18.5px / 16px |

④ 建议保持现状，把这条账写进 `content-typography.md`——它现在被记成疑问，其实是设计。

## 三处必修（与 A/B 无关，都是现状缺陷；全站还没有内容踩到）

1. **列表记号不分 ul / ol**：随笔的刻度与项目的 ○ 写在 `.md li::before` 上（`global.css:512` 只写 `position: absolute`，`573` / `637` 给内容），而 `ol` 从未被 reset。于是 ol 一被用上就是**原生数字 + 记号**同场，且因为记号相对 `li` 定位、`li` 从原生序号之后才起，**琥珀刻度会压在每项首字上**。
   - 证据：`19-legacy-ol.png`（同页 `?legacy=1` 还原现状）、3× 裁片 `zb4-li-essay-legacy.png`（刻度压在「先／再／最」上）对 `zb5-li-essay-fixed.png`（本稿：`一、` 干净）。
   - 修法：随笔刻度与项目 ○ 收窄成 `ul > li::before`；项目侧那套施工清单（`li:has(input)`）同理。
2. **行内 code 漏到 `pre > code`**：`.md code`（底 + 字号）在 `pre` 里同样命中，项目侧因此每行多一条底带、随笔侧字号被二次缩到 `.71em`。
   - 证据：`20-legacy-code.png` 对 `z10-code-project.png`；修法：行内规则一律写成 `:not(pre) > code`。
3. **Shiki 的深色底**（已在 backlog 八.1 记过）：`<pre>` 带行内 `background-color:#24292e`，会盖掉 `.prose pre` 的一切底色。修法：`astro.config.mjs` 关掉默认主题 / 只输出变量。

前两条都是「注释里写着两页同款、实际只在某种结构下才成立」的类型——**新增元素时先确认规则的作用域**，比事后对照三张截图便宜。

## 实测

- **列宽与字号**：`.prose` 随笔 629px / 18.5px、项目 544px / 16px（1440 视口）；两栏均为 `34em` 折算值。
- **A / B 逐项差**（脚本读计算值，非手抄）：

  | 选择器 | A（本稿） | B（备选） |
  | --- | --- | --- |
  | `.col--essay .md h3::before` | `content: ""`、19.5×1px、`rgb(167,177,186)` | `content: none` |
  | `.col--project .md h3::before` | `counter(sec…) "·" counter(sub…)`、11.088px | `content: none` |
  | `.col--essay .md ol > li::before` | `counter(item, cjk-ideographic) "、"`、17.02px | `content: none` |
  | `.col--project .md ol > li::before` | `counter(item, decimal-leading-zero)`、12.48px mono | `content: none` |
  | `.col--project .md table` | border 1px、底 `--fg@2%` | border 0、无底 |
  | `.col--project .md figure` | border 1px | border 0 |
  | `.col--essay .md pre` | `border-left: 2px`、底 `--fg@4%` | `border-left: 1px` |
  | `.col--essay .md code` | 透明底 + `border-bottom: 1px`、15.54px | 6% 底、无底线、15.91px |
  | `.col--project .md blockquote` | `drift 12s` | `none` |
  | `.col--project .md div[data-side]` | 24px | 21.6px |
- **两态**：`?mix=0` / `?mix=1` 全页换面（强调色插值随 `--reality-mix` 走），`02-read-wake.png` 对 `01-read-dream.png`；`?freeze=1` 停掉引文漂移与颗粒相位，截图一律带它。
- **三夜段**：`03-read-deep.png` / `04-read-paper.png` 各查一遍；deep 段表格与代码块的底都跟着 `--fg` 走（见上），`--bg-sunken` 那一版会在夜里翻白。
- **390 窄屏**：两栏叠成单栏（`grid-template-columns` 单轨 342px）、表格 342px 不顶宽、`document.scrollWidth = 390`（无横向溢出）；见 `17-w390-read.png` / `18-w390-table.png`。
- **控制台与页面错误 0**（`design/.shot-p19.cjs` 每张图都过一遍 `console.error` 与 `pageerror`）。

## 落地映射（裁决之后照这张表改）

| 选择器 | 写在哪 | 备注 |
| --- | --- | --- |
| `.md h3`（阶梯）、`.md h2 { counter-reset: sub }` | `global.css` 公共层 | 新增 |
| `.md ol` / `ol > li` / `li::before` 位置 | `global.css` 公共层 | 新增 |
| `ul > li::before` | `global.css` 公共层 + 随笔/项目变体层 | **改**：现存 `li::before` 收窄 |
| `.md table` / `th` / `td` / `caption` | `global.css` 公共层 | 新增 |
| `.md figure` / `figcaption` | `global.css` 公共层 | 新增 |
| `.md :not(pre) > code` / `pre` / `pre::after` / `pre::-webkit-scrollbar` | `global.css` 公共层 | **改**：现存 `.md code` 收窄 |
| `.md div[data-side]` 的 1.5em | `global.css` 公共层 | **删**项目侧 1.35em 覆盖 |
| `.md blockquote` 的 `--d-amp` / `--d-rot` | `global.css` 公共层 + 变体层 | **改**：项目侧从「不动」改为轻漂移 |
| `hr.prose-rule::before` | `global.css` 公共层 | **改**：从随笔页面内移入 |
| `pre` 的 `data-language` 语义与 token 变量 | `astro.config.mjs` 的 `shikiConfig` | 新增 |
| 图注自动编号的 `<figure>` 来源 | `src/markdown/` 新插件（可选） | 若不做，图注只能用原始 HTML |

## 最不放心的

1. **h3 选 A 就要认「h3 必须在 h2 之下」这条规矩**。写进 `docs/writing.md` 才算数；不写的话，将来某篇正文里出现孤立 h3，页面上会印出「零·一」，看起来像渲染坏了。若不想背这条规矩，选 C（竖线）。
2. **ol 的汉字序号与 h2 的汉字序号会不会读混**：h2 是琥珀 + 0.6em 嵌字，ol 是 `--fg-soft` + 0.92em 齐左、且列表项本身有缩进，我的判断是不会混；但这是要靠眼睛裁的，`07-ol-a.png` 与 `zb5` 是判断材料。若裁「会混」，把随笔 ol 退成 `01` 式的 mono 两位数即可（与项目同款，代价是随笔失掉一处宋体汉字）。
3. **代码 token 的四色映射**是我按「琥珀不出现」推的，还没有真代码页对照过（全站零代码围栏）。落地后要用一篇真的带代码的文章复验一遍对比度——尤其 `--umber` 关键字在 deep 夜段的表现。
4. **`figure` 成框（项目侧）对纵向大图的观感**：本稿的样张是 640×190 的扁图版，成框好看；一张很高的截图成框后会不会显得像海报，没验过。
5. **两态块边距统一到 1.5em** 是「删一条特例」，但项目页的段落是 1.3em，于是项目侧两态块（1.5em）与段落（1.3em）的差从 0.8px 变成 3.2px——若裁「两态块应该跟段落同呼吸」，正确做法是反过来把项目侧拉到 1.3em，而不是我这条。
