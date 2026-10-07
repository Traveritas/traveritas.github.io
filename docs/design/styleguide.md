# 样式预览页（/styleguide/）

> 工作台，不是内容页。改样式之前先在这里看一眼全局，改完再回来核对。
> 内页正文排版的地图另有一份：`docs/design/content-typography.md`。

## 一、它在哪、为什么看不见入口

- 地址：`/styleguide/`（`npm run dev` 后开 <http://localhost:4321/styleguide/>）。
- 站内导航里没有它，`sitemap` 用 `filter` 排除，`public/robots.txt` 里 `Disallow: /styleguide/`。
  它是工具页，不承担内容，也不该被索引。
- 源码：`src/pages/styleguide.astro`。页面自身的框与字写在 `src/styles/styleguide.css`
  （只在预览页 import，全部 `sg-` 前缀，不进全站样式表）。
- 预览页不带开屏面纱（`BaseLayout` 的 `boot={false}`）——不然每次改样式都要等它演完
  1.05s（首访 3.1s）。

## 二、页面结构

按 `SECTIONS` 数组排定，正文里每一节对应一个同 id 的 `<GuideSection>`：

| 节 | 内容 |
| --- | --- |
| 一 · 设计令牌 | 醒梦缝色板、面与底线、四种字体、度量与容器宽度（宽度与色值都读计算值回填） |
| 二 · 内容页正文 | **同一份 markdown 样张**放进默认层 / 随笔 / 项目三条管道并置；另附页头元信息、任务清单（两页同款 ✓ 行与 ○ 符号）、互链块 |
| 三 · 通用构件 | StitchHeader、GlassChip（夜色舞台）、目录行 `YearGroup` / `IndexRow`、`.stitch-meter` |
| 四 · 醒梦双态 | `data-morph` 行内 / `[data-side]` 块级、`.drift`、`.ghost-pair`（带 `--echo` 滑杆）、`::selection` 与 `:focus-visible` |
| 五 · 全站仪器层 | 缝线三变体与主页仪表轨装框预览；发丝线 / 脑电 / 构块场 / 开屏只能整页看，故给逐层隔离开关 |
| 六 · 页面专属块 | 已抽成组件的专属块直接预览；还在各页 `<style>` 里的块列索引表，给出类名、所在文件与实物入口 |

## 三、怎么把新样式加进来

### 1. 属于公共层（`global.css` / `tokens.css`）的样式

最省事的一条路，两个原语就够：

```astro
<Spec name="小节标题" cls=".md h2" src="styles/global.css" note="…">
  实物放这里（可以是 HTML，也可以是 <Content /> 那种 markdown 组件）
</Spec>
```

- `name` 中文名、`cls` 被预览的选择器、`src` 写在哪个文件、`note` 一句话说明
  （只有 `note` 走 `set:html`，可用 `<code>` 等内联标签；`cls` 是转义后的纯文本）。
- `flush` 让实物出血（自己带内边距、或需要整宽的东西）：眼下用在三个缝线变体与第六节的索引表。
- 放进对应 `<GuideSection>` 的 slot 即可。它已经在 `sg-specs` 网格里排好。

### 2. 属于正文层（`.md` 内元素）的样式

**别手写 HTML 样张**——markdown 编译出来的 DOM 才是真身。四份样张分工：

- `prose.md` —— 三栏并置共用这一份（公共层 / 随笔 / 项目）；新元素加进去，三栏同时看到。
- `tasklist.md` —— 项目专属元素（施工清单的 `- [x]` 勾选态）。
- `two-sided.md` —— 双态语法：行内 `[[醒|梦]]` 与块级 `:::wake / :::dream`。
- `inline-fx.md` —— 行内光景：`((浮起))` 与 `{{流过}}`。

`:::wake / :::dream` 与 `[[醒|梦]]` 在样张里照常可用（与正文同一套 Sätteri 处理器）。

### 3. 新章节

`SECTIONS` 数组加一行 + 正文加一个 `<GuideSection id="…">`。目录自动跟着长。

### 4. 视图与开关

控制条（底部固定）已有：切面（醒 / 梦，走 `reality.ts` 的 `forceReality`，与长按入梦同一条
路径）、逐层消隐、8 / 64px 参考线、轮廓、复位。加新开关 = 在控制条上放一个
`data-sg-toggle="<html 类名>"` 的按钮，样式写在 `styleguide.css` 里、挂在 `html.sg-*`
之下。

## 四、纪律：样张不复制样式

页面上所有被预览的样式都现取真实来源，`styleguide.css` 里只有工具箱自己的框与字。
原因是这个项目已经有一处「同一元素两处各写一份」的教训（见 content-typography.md 开头）。
所以：

- 能用真实组件就用真实组件（StitchHeader / GlassChip / Rail / Seam / IndexRow 都是直接
  `import` 的实物）。
- 正文样张一律走 markdown 文件，不手抄 DOM。
- 需要「深色语境」才成立的构件（玻璃片），给它一块标注清楚的夜色舞台，而不是改它的颜色。

### 摆样张时踩过的三个坑（都在 `styleguide.css` 里兜住了）

1. **Astro 把组件自带的 `<script>` 内联在首个实例之后**，于是那一格的 `:last-child`
   落在 `script` 上，真正的末元素漏掉重置——症状是同一构件三个实例，第一个的框比另两个
   高出一个 `margin`。修法：除了 `> :last-child`，再写一支 `> *:has(+ script:last-child)`。
2. **网格轨道下限要写 `minmax(min(19rem, 100%), 1fr)`**，直接写 `minmax(19rem, 1fr)`
   时容器窄于 19rem 会整格溢出，而且网格项的 `min-width: auto` 会把这股劲传到外层 grid、
   把整页顶宽（症状：390px 视口下 `.sg-spec` 比 `.sg-body` 宽 10px）。
3. **`--still` 归零后不能直接验叠影**：错位量与残影不透明度都乘 `--still`，锁相以后恒为 0；
   验残影要先撤掉那支内联 `--still`（醒面本来就该归零，别把它当 bug）。

## 五、页面专属块：抽成组件（2026-10-07 定案）

Astro 的 `<style>` 是**组件作用域**的：写在 `projects/[slug].astro` 里的 `.coverband` 会编译成
`.coverband.astro-xxxx`，预览页即使照抄同样的类名也拿不到样式。曾经有两条路可选：抽成组件，或者挪进公共样式表。
**定案：抽成组件**。块连同 markup 移进 `src/components/`，页面改用组件，预览页 `import` 同一个。
作用域样式跟着组件走，选择器权重不变，层叠结果也不变。

已抽出（预览页第六节直接预览）：

| 组件 | 原先写在 | 用在 |
| --- | --- | --- |
| `index/YearGroup` + `index/IndexRow` | 两个目录页 | 随笔 / 项目目录页、标签页 |
| `project/Coverband` · `FileNote` · `LinkList` · `ProjectNav` | `projects/[slug].astro` | 项目页 |
| `article/TagRow` · `WakeCard` | `articles/[slug].astro` | 随笔页文末 |

仍留在页面里、只在索引表给实物入口的：晓线 `.dawn-glow`（整页效果）、标签页的结、
404 失线页（整页即一块）。

**抽组件时的验收**：改前留一份 `dist`，改后逐路由对比目标块子树的几何与计算样式
（1440 / 390 两档，含文档总高）。2026-10-07 这一批对照了两篇随笔、两个项目与关于页，
248 个元素零差异。注意两点：
- 页面里形如 `.about-section p` 的作用域规则**够不到组件里的元素**（组件有自己的作用域类）。
  所以 `.signal-title` 这类受页面规则影响的元素留在页面里，只把下面的列表抽出去。
- 采样方法与「先预热再采样」那条坑见 content-typography.md 第五节。

## 六、改完怎么验

1. `npm run build` —— 静态编译必须过（预览页是普通静态路由，没有额外构建条件）。
2. `npm run check` —— `astro check` 目前 0 错误，别把它弄红。
3. 活体抽查一条命令：

   ```bash
   npm run build && node design/.shot-styleguide.cjs
   ```

   它在 `design/.shots-styleguide/` 出 1440×900 的逐节截图与 `report.json`：两面的换面闸与
   强调色、令牌数值回填、缝线三变体的透明度与遮罩、任务清单的 `✓` / `○`、三栏字号行高对齐、
   叠影错位量。控制台与页面错误数应为 0。

4. 行内光景（`((浮起))` / `{{流过}}`，见 `docs/writing.md`）另有一条专项抽查：

   ```bash
   node design/.shot-inline-fx.cjs
   ```

   出 `design/.shots-inline-fx/` 两面截图与 `report.json`，并在 2× 下钉住两帧渐变位置
   （`sheen-pos0.png` / `sheen-pos50.png`）——**流光那种样式必须靠截图看**：计算值只能告诉你
   「字身是 transparent」，字是不是还在得看画面；两帧一模一样就说明渐变没生效。

采样时几处已知的坑（与既有脚本口径一致）：

- **自定义属性的计算值是未展开的字符串**：`--still` 读出来是 `calc(1 - 0.000)`，
  `--reality-mix` 才是数字。判「醒静梦动」要看 `--reality-mix` 或用后的属性值，别直接比 `--still`。
- 读伪元素要显式给第二个参数（`getComputedStyle(el, '::before')`），否则 `content` 恒为 `null`；
  读自定义属性要用连字符原名（驼峰一律返回空串）——两处都在
  `content-typography.md` 第五节记过。
- 采样前把 `--still` 置 0 并强制一次重排，否则 `.drift` / 引文的 `transform` 每次不同；
  但**验叠影时要先把这支内联 `--still` 撤掉**，否则错位量与不透明度恒为 0（醒面本该归零）。
- `[data-morph]` 元素会周期性「走神」乱码，同一版连采三次自身就抖的行不算差异。
- **站点默认落在梦面**（无 `sessionStorage` 档位时 `reality.ts` 走 `enterDream`），
  所以两面都要显式切，别指望初始态是醒面。
- 开屏有会话档位；预览页关了面纱，但站内其它页仍受 `xm-boot-seen` 影响，
  跨页对比时要先统一预热。
