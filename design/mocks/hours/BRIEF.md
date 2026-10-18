# 原型任务：版块＝时辰

> 给执行原型的智能体。动手前先读仓库根目录的 `AGENTS.md` 和 `docs/design/aesthetic-direction.md`。
> 这是**定方向用的原型**：做出两个可以并排比较的变体，不定稿、不改正式代码。

## 0 · 一句话

主页把站点讲成一夜：浅梦 23:19 随笔 → 深眠 01:11 项目 → 异相 02:08 瞬间 → 06:31 晨光。
内页却全是同一种浅灰蓝底，从主页「深眠」那一段点进项目，落地是一张浅灰页，刚才的时辰就断了。
这个原型要试的是：**让每个版块页属于主页给它的那个时辰。**

## 1 · 交付物

只写 `design/mocks/hours/` 里的这两个文件，不改 `src/`、`public/`、`dist/` 和仓库里任何别的文件，也不要 git commit：

1. `hours.css`：已有骨架，把 TODO 填完。
2. `NOTES.md`：新建，内容见第 7 节。

`serve-hours.cjs`（预览服务）和 `.shot-hours.cjs`（截图对照）已经写好，一般不用改；真要改，在 NOTES.md 里说明原因。

## 2 · 原型怎么挂上去

预览服务以 `dist/` 为根，往每个 HTML 里注入 `hours.css`，并在 `<html>` 上写两个属性：

| 路由 | `data-hour` | 时辰 | 主页对应段 |
| --- | --- | --- | --- |
| `/articles/…`、`/tags/…` | `shallow` | 浅梦 | 23:19 — 01:11 |
| `/projects/…` | `deep` | 深眠 | 01:11 — 02:08 |
| `/moments/…` | `rem` | 异相 | 02:08 — 04:59 |
| `/about/…` | `dawn` | 晨光 | 06:31 |
| `/` | `home` | —— 主页保持原样，只吃外壳修正 | |
| 404 等 | `none` | —— 只吃外壳修正 | |

`data-hours` 是变体：`a` 或 `b`。`?v=off` 时什么都不注入，就是现状。

## 3 · 两个变体

### 变体 A「整夜」

内页直接用主页那一段的夜色：项目是深靛底，瞬间是暗紫底。`hours.css` 里已经按主页色板
（`src/scripts/home-storyboard.ts` 的 `PALETTE`）填好 `--bg / --fg / --fg-soft`，你补齐其余变量和组件。

### 变体 B「浅色时辰」

每个时辰做一个浅色版，深色只留在主页那一夜。约束：

- 色相取该时辰的色相：浅梦冷雾灰蓝、深眠靛、异相淡紫、晨光暖杏。主页色板里每段的「雾光」值可以当色相参考。
- 底色明度高、彩度低（大致 OKLCH L 0.94–0.97、C ≤ 0.02）。浅梦可以直接沿用现在的 `--bg: #f0f3f6`。
- 四个时辰的底色两两之间要能一眼分开，不能做成四张差不多的灰。
- 正文色仍然够深，对比度要求见第 6 节。

两个变体都要守《醒梦》的底色：低饱和、磨砂玻璃、大面积留白。琥珀（`--amber`）仍是全站唯一的强调色，只用在锚点、进度和焦点上。

## 4 · 外壳修正（A、B 都生效）

这些是现状诊断里查出来的问题，放进原型是为了让对比更公平：

1. **隐藏背景方块。** 根元素是 `.fld-bg`（`src/components/chrome/Constructs.astro`）。
2. **导航和中文小标签不走等宽字体。** 导航、`.xfile-t`、`.year`、`.row-date` 这类标签现在用的是 IBM Plex Mono。它没有中文字形，中文会落到新宋体（实测 `.site-nav a` 整个是 NSimSun）。改成中文走 `--font-body` 或 `--font-display`，数字和西文可以继续用 mono。
3. **手机 390px 宽时导航不折行。** 现在 `.site-nav a` 被挤到 19px 宽，「随/笔」折成两行。
4. **页头和内容列左缘对齐。** 1440 宽时，页头品牌从 x=384 起（`.container`，42rem），目录页标题从 x=272 起（`.container-wide`，56rem），标签页从 x=307 起。用什么办法对齐由你决定，在 NOTES.md 里写理由。

## 5 · 会踩的坑

- **有些变量不能覆盖。** `--amber / --umber / --ghost-ink / --dream / --reality-mix` 由 `src/scripts/reality.ts` 每帧写在 `<html>` 的行内样式上，随醒梦插值。别覆盖它们，覆盖了醒梦两态就坏了。某个时辰要换强调色，就新起一个变量名。
- **可以覆盖的变量：** `--bg / --bg-sunken / --fg / --fg-soft / --fg-faint / --line`。写在 `html[data-hours='…'][data-hour='…']` 上，权重高于 `tokens.css` 的 `:root`。
- **组件样式带作用域。** 组件是 Astro 作用域样式，形如 `.x[data-astro-cid-…]`，权重 (0,2,0)。覆盖时用 `html[data-hours] .x` 这类更高权重的选择器，不要满篇 `!important`。
- **已知写死浅色的地方：** 变体 A 会在这里露馅，变体 B 也要核对。
  - `.page-ambient` 的三层浅色渐变、`.wash-backdrop`（都在 `src/styles/global.css`）
  - 瞬间薄片 `.sheet`：`src/pages/moments/index.astro` 第 173、188 行写死了 `rgba(255,255,255,…)`
  - 标签框 `.tag-chip`（`src/styles/tags.css`，每个标签有自己的变量）
  - `.coverband / .link-list / .file-note / .pj-next`（`src/components/project/`）、`.wake-card / .tag-row`（`src/components/article/`）
  - 导览轨展开面板 `.g-panel`（`Gauge.astro`）、环境声按钮 `.snd`、页脚
- **醒面和梦面都要看。** 站点默认落在梦面，梦面的发丝线、方块、字色都会变；截图脚本两面都拍。
- **不新增依赖，不引入外部字体或 CDN，不改文案。**

## 6 · 怎么跑

```bash
# dist 不存在或 src 改过时（这个任务本身不改 src）
npm run build

# 浏览：打开打印出来的地址，?v=off / a / b 切换，选择记在 cookie 里
node design/mocks/hours/serve-hours.cjs

# 截图对照：全量约 10 分钟，输出在 design/mocks/hours/.shots/
node design/mocks/hours/.shot-hours.cjs

# 迭代时收窄范围（Git Bash 里传 ROUTES 要加 MSYS_NO_PATHCONV=1）
MSYS_NO_PATHCONV=1 VARIANTS=a,b VIEWS=d STATES=wake MAXSEG=1 ROUTES=/projects/,/moments/ node design/mocks/hours/.shot-hours.cjs
```

`.shots/index.html` 是「现状 | A | B」三栏并排的总览。`.shots/report.json` 里每页有这几项：

- `injected`：`hours.css` 是否挂上
- `hour`：注入的时辰
- `bg`：实际底色
- `contrast`：几类文字对底色的对比度
- `errs`：控制台报错

## 7 · 验收

- 截图全量跑通，`report.json` 里 `errs` 全为空，变体 a/b 的页 `injected` 全为 `true`。
- 对比度：正文类（`body-p`、`row-title`、`h1`、`lede`）≥ 4.5，小标签类（`row-date`、`year`、`meta`、`nav`、`footer`）≥ 3。这个探针只按「最近的不透明底色」算，不计渐变和叠加层；数值可疑的地方写进 NOTES.md。
- `NOTES.md` 写清楚以下几项：
  - A、B 各自四个时辰的色值表
  - 外壳修正四项各怎么做的
  - 你认为哪个变体更好、为什么
  - 发现了但没处理的问题
- 如果你看不到图片，就以 `report.json` 的数值为准，并在 NOTES.md 里列出哪些地方需要人眼确认。
- **不要宣布方向定稿。** 方向由站长看完对照图再决定。
