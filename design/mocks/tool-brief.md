# 工具层原型 · 共用简章

> 给四个并行执行原型的智能体。动手前先读仓库根目录的 `AGENTS.md`。
> 这是**定方向用的原型**：四个方案并排比较，不定稿、不改正式代码。

## 0 · 一句话

站内的十二件工具现在散在五处、五套材质、五种出现方式。这一轮要试的是：**把它们收成一层**——
一个统一的「工具区」，在主页、目录页、阅读页、NEXUS 入口上都成立。

四个方案各试一条路：**潜影 `latent`** · **切面 `threshold`** · **罗盘环 `ring`** · **薄玻璃窗 `window`**。
一个方案 = 一件东西 + 一个动词。材质是动词的材料，悬停是动词的第一次发生，展开是动词的完成。

## 1 · 必读（按顺序）

| | 读什么 | 为什么 |
| --- | --- | --- |
| 1 | `AGENTS.md` | 绝对红线与双态文风基本法 |
| 2 | `docs/design/aesthetic-direction.md` | 审美简报：材质、色彩分工、母题、禁止事项 |
| 3 | `docs/writing.md` 的「导航与版块映射」「版块徽标体系」 | 双态词表与命题徽标，工具文案要用 |
| 4 | `design/mocks/wander/NOTES.md` | 那片空间的现状；第 50 行是这件事的出处 |
| 5 | `design/mocks/drift/SCHEMES.md` | 「一个方案靠内部自洽成立」的切法 |
| 6 | `src/styles/tokens.css` | 令牌（只读） |
| 7 | `src/components/chrome/Gauge.astro` · `Rail.astro` · `Sound.astro` | 要被收编的三件散件（只读） |

`design/mocks/hours/BRIEF.md` 是本简章的格式来源，可以参照它的语气与结构。

## 2 · 已定的共同约束（站长 2026-10-18 答复）

1. **统一收编。** 这层要能取代 `Gauge` 的展开薄片、`Sound` 的微弦按钮、`Rail` 的探针。原型里
   **可以自由推翻现有形态与命名**，不必向后兼容——四个方案之间也不要互相兼容，各自做到底。
2. **三种召唤并存。** 常驻边缘露头 · 手势 / 快捷键 · 指针跟随。**同一件东西的三条唤出路径**，
   不是三个入口：三条路都要通，且唤出后是同一个面。
3. **覆盖四种语境。** 漫游空间（主页 + 三个目录页）· 阅读页（随笔 / 项目 / 瞬间）·
   NEXUS 入口（`/gate/`）· 404 失线页。原型里要能**当场切换**这几种底子，证明同一层在四种
   明暗与三种夜色上都成立。
4. **移动端不要求同等完整**，但 390×844 不能坏（可以退化，不可以溢出或压字）。
5. **无脚本可读**不是这一轮的要求（工具层本来就是增强层），但正文与目录的兜底别删。

## 3 · 工具清单（十二件，每个方案都要放得下）

沿用站内既有的「中文小标签 · 英文」形制（见 `Gauge.astro`），可以改名，但不要用官僚审计词。

| # | 工具 | 现状出处 | 说明 |
| --- | --- | --- | --- |
| 1 | 检索 · FIND | `wander` 的 `__w.setQuery`（无 UI） | 全站搜：标题 / 描述 / 标签 / 正文 / 图注 |
| 2 | 视图 · VIEW | `wander` 外框右上 | 漫游 ↔ 检索 |
| 3 | 场景 · SCENE | `wander` 外框顶部 | 随笔 / 瞬间 / 项目（梦面：断章 / 闪念 / 造物） |
| 4 | 归处 · 回主页 | `wander` 品牌字 | 回 `/` |
| 5 | 门 · NEXUS | `wander` 主页右下 | 去 `/gate/` |
| 6 | 出口 · EXITS | `wander` 主页底部 | GitHub / RSS |
| 7 | 面 · 换面 | `reality.ts` 长按 2200ms（无可见入口） | 醒 ↔ 梦；梦面回醒是 1300ms |
| 8 | 声 · 环境声 | `Sound.astro` | 开关；阅读页有整页电平退避 |
| 9 | 目录 · CONTENTS | `Gauge` 展开薄片（阅读页） | h2 主刻度 / h3 细刻度 |
| 10 | 读 · 字号 / 行距 | `Gauge` 展开薄片（阅读页） | 小 / 中 / 大；常 / 疏 |
| 11 | 筛 · 标签 / 年月 | `Gauge` 展开薄片（目录页） | 标签 chip + 年月（TIME） |
| 12 | 刻 · 时刻 / 进度 | `Rail.astro`（主页）+ `Gauge` 游标 | 23:07 → 06:31；滚动百分比 |

## 4 · 红线（违反即返工）

- **严禁裁缝与手工作坊语汇**：针 / 缝 / 穿针 / 起针 / 落针 / 针脚。注意 `--seam-angle` 是既有
  令牌名，可以引用变量，但**界面文案里不要出现「缝」以外的刺缀说法**；线就是线。
- **严禁直白出戏的标签**：这是梦 / 你在做梦 / 快醒了 / 读起来像梦话 / 可核验 / 半可核验。
  梦感来自知觉距离、悬停与微光，不来自自我标榜。
- **严禁官僚审计与财务台账词汇**：账目 / 台账 / 案号 / 待立项 / 构想条目 / 相关档案 / 进度刻度。
  工具标签就是干净的名字，不要给链接贴状态签。
- **严禁极客中二**：白昼写代码夜里构筑世界 / 活跃坐标 / 占用公网地址。
- **不新增依赖、不引外部字体或 CDN、不联网。**
- **琥珀 `--amber` 是全站唯一的异质色**，只用在锚点、进度、焦点与「当前」。不要引入第二个强调色。

## 5 · 共用资源

### 令牌（照抄，别自创）

```
--bg #f0f3f6   --bg-sunken #e5ebf2   --fg #232830   --fg-soft #56606d   --fg-faint #858f9d
--line rgba(35,40,48,.12)   --wake #a7b1ba   --dream #c2a382   --umber #765640
--amber #d9a05b   --seal #a3452f   --seam-angle 14deg
--measure 34em
字体：--font-display 'Noto Serif SC'（正文与标题）· --font-mono 'IBM Plex Mono'（数字与西文）
     · --font-body 系统黑体（中文小字不要走 mono：Plex Mono 没有中文字形）
```

三种夜色（取 `src/styles/hours.css` 与 `wander.css` 的实测值，四种语境各用一套）：

| 语境 | 底 | 墨 | 柔 | 淡 | 锚（ink） |
| --- | --- | --- | --- | --- | --- |
| 浅梦（随笔 / 标签页 / 阅读） | `#c6ced9` / `#e1e7ef` | `#232830` | `#56606d` | `#8a94a2` | `#765640` |
| 深眠（项目） | `#0d1524` | `#e6ebf1` | `#a6b4c6` | `#71849c` | `#c9a77e` |
| 异相（瞬间） | `#1d1729` | `#f0e9f4` | `#bcadca` | `#877a98` | `#e0aa86` |
| 晨光 / 主页（NEXUS 入口 · 主页） | `#0e0f1d` | `#ece8f2` | `#b7b3c8` | `#827f98` | `#d6b28c` |

NEXUS 入口那一屏（`src/pages/gate.astro`）另有一整套天光渐变（上方淡丁香 → 地平亮带 → 下方偏紫的雾），
要接就现读它的 `--sky-wake` / `--sky-dream`。

### 内容（只读）

`design/mocks/layout-plane/data.js` 里是真实内容：`window.PLANE_DATA = { articles, projects, moments }`
（各含 `title` / `desc` / `date` / `tags` / `chars` / `status` / `links` / `note`）。配图在
`design/mocks/layout-plane/assets/img/`。**检索要有说服力就得用真标题**，别现编。
`design/mocks/wander/` 已经做过一版「同一批窗的两种看法」，可以读它的 `wander.js` 学空间与过渡的手法，
但**不要 import 它**——四个方案各自独立，避免互相牵住。

### 字体怎么挂

`serve.cjs` 挂两个前缀（照抄 `design/mocks/wander/server.cjs`，只改端口与重定向目录）：

```
/fonts/noto/  →  <repo>/public/fonts/noto-serif-sc      （里面就有 font.css，直接 <link> 它）
/fonts/plex/  →  <repo>/node_modules/@fontsource/ibm-plex-mono/files
```

`font.css` 按用字自切、带 `unicode-range`，直接引；`--font-mono` 里垫一层系统黑体，
中文小字不要落到 Plex Mono。

## 6 · 交付物（每个方案一份）

只写自己那一个目录，**不碰 `src/` `public/` `dist/` 和仓库里任何别的文件，不要 git commit**：

```
design/mocks/tool-latent/      端口 4640
design/mocks/tool-threshold/   端口 4641
design/mocks/tool-ring/        端口 4642
design/mocks/tool-window/      端口 4643
```

每个目录里：

| 文件 | 内容 |
| --- | --- |
| `index.html` | 原型本体。静态、无构建步骤。**单文件也可以**，但拆开更好读 |
| `*.css` / `*.js` | 拆开的样式与脚本（建议拆） |
| `serve.cjs` | 静态服务，照抄 `wander/server.cjs` 改端口与重定向目录 |
| `.shot.cjs` | 截图脚本，输出到 `.shots/`；照抄 `wander/.shot.cjs` 的取法（`puppeteer-core` 从 `os.tmpdir()` 取，Chrome 指 `C:/Program Files/Google/Chrome/Application/chrome.exe`） |
| `.shots/` | 截图产物（`.png`） |
| `NOTES.md` | 见第 8 节 |

### 原型必须能当场切换语境

给地址参数（或面板开关），至少覆盖：

- `?ctx=home` 主页那片空间 · `?ctx=grid` 目录 / 检索 · `?ctx=read` 阅读页 · `?ctx=gate` NEXUS 入口 · `?ctx=404` 失线页
- `?face=wake|dream` 两面
- 各方案自己的动词参数（如 `?verb=0..1` 停在展开中途的某一帧）

## 7 · 怎么跑

```bash
node design/mocks/tool-latent/serve.cjs          # 打开它打印的地址
node design/mocks/tool-latent/.shot.cjs          # 截图 → design/mocks/tool-latent/.shots/
```

`.shot.cjs` 至少要拍：四种语境的静置帧、两面、唤出的三条路（边缘 / 快捷键 / 指针）各一帧、
动词中途一帧、390×844 一帧。**控制台错误数必须是 0**。

## 8 · 验收

- 截图全量跑通，控制台与页面错误数 0。
- 十二件工具在原型里**都能找到、都能用**（NOTES.md 里逐件给「在哪、怎么到」）。
- 三种召唤路径都通，且唤出的是同一个面。
- 四种语境都不坏：底色变了工具还读得清（深底浅底各至少核对一次对比度，正文类 ≥ 4.5、小标签类 ≥ 3）。
- `prefers-reduced-motion` 下动词退成直接显示。
- 390×844 不溢出、不压字。
- **`NOTES.md` 必须写清**：
  1. 一句话的动词与那件东西是什么；
  2. 十二件工具各自在哪、怎么到；
  3. 三条召唤路径怎么走；
  4. 四种语境各长什么样（附截图文件名）；
  5. 你**认为**这个方案成不成立、哪里最弱；
  6. 发现了但没处理的问题，以及需要人眼确认的地方。
- **不要宣布方向定稿。** 方向由站长看完对照图再决定。
- 如果你看不到图片，就以 `NOTES.md` 与截图文件名索引为准，并列出哪些帧需要人眼确认。
