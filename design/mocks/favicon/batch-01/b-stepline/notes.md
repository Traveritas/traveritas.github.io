# 阶缝 · Step Seam

`design/mocks/favicon/batch-01/b-stepline/` · 方向「结构」· 2026-10-22

---

## 1. 风格一句话

**把主页那根 14° 的阶梯发丝线折进方框，让台阶的下落本身成为标记的中轴** ——
两笔、无渐变、无外部资源；醒面是刻在纸上的一小段结构，梦面是靛夜里开始记不住自己的一条线。

## 2. 形从哪来

`_ref/home-1440.png` 里最独特的几何语言，就是那根**不是直线、而是一级一级台阶**的 14° 发丝线
（屏幕上的像素化斜线 / 楼梯）。这枚标记就取它的一段：

```
viewBox 0 0 32 32
横阶  M4 6 H16 V12 H28     踏面 12 · 竖步 6 · 弦 24×6 → atan(6/24) = 14.036°
中轴  M16 6 V27
stroke 4 · stroke-linecap: square · stroke-linejoin: miter
```

- **14.036° 与令牌同源**：`src/styles/tokens.css` 的 `--seam-angle: 14deg`。取 1:4 的整数格
  （24 横 6 竖）落在 32 格上，是 14.04°，不是"大概 14 度"。
- **为什么是这个形**：横阶读得出"一段正在下行的缝"，中轴给它一根竖直的骨。
  两笔加起来既像一枚站标（T），又是主页那根线的一个截面。
- **竖步与中轴共线**（本方向的结构要点）：台阶的竖步就是 T 的竖干，不是两根拼起来的。
  所以整枚只有 **两笔**，而且"下落"这件事同时是"轴"这件事。
- **量感**：竖步 6 = 线宽 4 的 1.5 倍。这是为 16px 定的——见第 4 节。
- 视觉外框 x 2–30 / y 4–29（28×25 / 32），四边留 2–4 单位的边距，在 16px 里是 1–2px。
- 页面里两处装饰性的阶梯（语境区的主页缩影、最下面那条长线）用的是**同一个 4:1 节奏**，
  所以整页只有一种几何。第一版我把它们写成了"先踏面后竖步"，那样是 12.8°，已修。

## 3. 醒 / 梦差在哪

**形完全不动**，只差三件事：

| | 醒 `--reality-mix: 1` | 梦 `0` |
|---|---|---|
| 墨色 | `#232830` on `#f0f3f6` | `#a195c1` on `#0c0f18`（薄暮紫） |
| 光 | 无 | 一层薄晕（`drop-shadow 0 0 6px rgba(161,149,193,.46)`） |
| 残影 | 合拢（`--echo: 0`，两笔重合 → 不可见） | 错位 2.4 / 32 单位，色 `#817ba3`，不透明度 .34 |

**为什么不做成两枚形**：简报要求"一眼看出是同一枚图标的两种状态"。这两态是同一段线
**被光照到 / 正在散去**的差别，不是换一个符号。

## 4. 16px 与单色下退化成什么

**16px（真实光栅，不是缩放的矢量）**：线宽 4 → **2px**，踏面 12 → **6px**，竖步 6 → **3px**。
竖步是线宽的 1.5 倍，所以那级台阶在 16px 下是**一次 3px 的明确错位**，而不是抗锯齿造成的抖动——
这是这枚形能在标签栏立住的关键数字，也是我四轮里唯一没被否掉的那组比例。
退化成：一个**左肩抬高一级的 T**，竖干落到框底。页面第三、五节都有 `canvas 16×16 → ×9 pixelated` 的真光栅。

**单色（`currentColor`）**：退化成「一道折 + 一竖」。因为竖步与中轴共线，只剩一色时
**台阶**与**轴**这两件事仍然同时读得出来；丢掉的只是「薄暮」与「残影」，形本身不掉。
`favicon.svg` 就是以 `currentColor` 打底的那一份。

## 5. 小巧思

**① 残影接在站点已有的 `--echo` 令牌上（主小巧思）。**
`tokens.css` 里有一对没人用的令牌：`--echo: 0`（叠影分离量）与 `--ghost-ink: #817ba3`。
我把它接给了这枚图标：梦面时标记会**渗出它自己的残影**，错位量直接读 `--echo`
（0 = 两笔完全重合、不可见，就是醒面；1 = 错位 2.4/32）。
于是这枚图标在梦面里"开始记不住自己"——和主页那个带消隐/残影的名字是同一种材质。
`index.html` 第七节给了一支滑杆，直接拖 `--echo` 看它从醒走到梦。
（别人一般会给图标加个发光，不会想到把它接到一枚已有的动效令牌上。）

**② 竖步与中轴共线。** 台阶的下落就是这根轴——所以整枚只有两笔，且"在往下走"和"立着一根骨"
是同一件事。这也让单色退让不塌（见第 4 节）。

**③ 名字的残影是同一层。** 语境区那格重画的主页缩影里，`Traveritas` 的残影与图标的残影
用的是同一套参数（色 `#817ba3`、小量错位），一眼能看出是同一层材质。

## 6. 两态怎么换（如果真上线）

`src/layouts/BaseLayout.astro` 现在是静态一条：

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

而 `<title>` 已经挂了 `data-wake` / `data-dream`（`Traveritas的个人网站` / `AveritA的昼梦叙集`），
`--reality-mix` 由 `reality.ts` 覆写。所以**在换 title 的同一处换 icon**：

```js
const link = document.querySelector('link[rel="icon"]');
const setIcon = (dream) => { link.href = dream ? '/favicon-dream.svg' : '/favicon.svg'; };
// 只在跨过 0.5 时换一次；别逐帧改 DOM（会一直重取图）
```

**一个我实测过的坑**：`favicon.svg` 里用 `@media (prefers-color-scheme: dark)` 换墨色，
它跟的是**系统主题**，不一定是**标签栏的深浅**。我两种 scheme 都截了图验证
（`shots/d0-verify-light.png` / `d0-verify-dark.png`）：文件本身合法、两种 scheme 下都按预期换墨，
但「系统浅色 + 浏览器深色标签栏」这个组合下，浅色墨会在深底上偏低对比。
所以更稳的是走上面的 JS 换 `link`（反正为了两态本来就要换），或在 `reality.ts` 里
顺手把标签栏深浅也判一次。

## 7. 风险 / 我不确定的地方

1. **字形读不读成 T**。16px 下那级台阶是明确的，但"是不是一个 T"取决于看的人——
   也可能被读成"一个带钩的 7"或"一面小旗"。我做了四轮共约 22 个候选（`_study*.html`），
   这是 16px 真光栅下最稳的一个；但这是个口味判断，不是可测的结论。
2. **`prefers-color-scheme` ≠ 标签栏主题**，见第 6 节。这是交付里我最不确定的一处工程细节。
3. **16px 下的残影**。真光栅里它只剩约 1px 错位，读作线条的轻微发虚，我认为不糊；
   但如果评审觉得 16px 该更干净，把 `--ghost-o` 在 16px 关掉即可（形不受影响）。
   我在 `index.html` 里给的是**带残影**的那一份，没有藏。
4. **梦面不加光晕**：光晕（`drop-shadow`）只在 ≥48px 出现。16px 加光晕只会脏。
5. **醒面墨色偏重**。`#232830`、2px 实线，在浅色标签栏里比常见 favicon 重。
   这是"结构"方向的取舍（要清楚、要像刻的），但如果觉得太黑，可以退到 `#3a4149`。
6. **语境区那格是手绘近似**，不是 `_ref/home-1440.png` 的引用（简报要求 index.html 无外部资源）。
   靛夜、半调网点、左上冷光、14° 阶梯线、三个入口的淡紫光点、左下小星的位置都照着放，
   但不是像素级还原。
7. 这枚标记**不编码 `AveritA` 的回文**。两态靠材质与光区分，不靠形。如果评审要"梦面形也变"，
   那是另一个方向，不在这一套里。

## 8. 实际跑过的截图命令

```bash
# 整页（交付的那一张）
node design/mocks/favicon/.shot.cjs \
  design/mocks/favicon/batch-01/b-stepline/index.html \
  design/mocks/favicon/batch-01/b-stepline/shots/sheet.png 1200 1500 --full
# → 1200×5064 @2x，无横向溢出，无页面报错

# 分区细看（本目录自带的小工具，按选择器逐块截）
node design/mocks/favicon/batch-01/b-stepline/shot-el.cjs \
  design/mocks/favicon/batch-01/b-stepline/index.html \
  design/mocks/favicon/batch-01/b-stepline/shots \
  "section:nth-of-type(1)=d1-hero" "section:nth-of-type(2)=d2-construct" \
  "section:nth-of-type(3)=d3-size" "section:nth-of-type(4)=d4-tabs" \
  "section:nth-of-type(5)=d5-mono" "section:nth-of-type(6)=d6-context" \
  ".faces=d7-faces"

# 交付的两枚 SVG 本体校验（当成 favicon 一样用 <img> 引，两种 scheme 各截一次）
node design/mocks/favicon/batch-01/b-stepline/shot-el.cjs \
  design/mocks/favicon/batch-01/b-stepline/_verify-svg.html \
  design/mocks/favicon/batch-01/b-stepline/shots --scheme=light "body=d0-verify-light"
node design/mocks/favicon/batch-01/b-stepline/shot-el.cjs \
  design/mocks/favicon/batch-01/b-stepline/_verify-svg.html \
  design/mocks/favicon/batch-01/b-stepline/shots --scheme=dark  "body=d0-verify-dark"

# 探索稿（前三轮的形之研究，已 Read 过）
node design/mocks/favicon/.shot.cjs design/mocks/favicon/batch-01/b-stepline/_study3.html \
  design/mocks/favicon/batch-01/b-stepline/shots/_study3.png 1560 1500 --full
node design/mocks/favicon/.shot.cjs design/mocks/favicon/batch-01/b-stepline/_study4.html \
  design/mocks/favicon/batch-01/b-stepline/shots/_study4.png 1560 1400 --full
```

**一个踩到的坑（值得记一笔）**：`favicon.svg` 第一版在 XML 注释里写了 `--seam-angle`、`--echo`
这些令牌名，注释里的 `--` 在 XML 里非法，**文件直接解析失败、当图片打不开**。
`shots/d0-verify-svg.png` 就是那一版（四张全是裂图）。改掉注释里的双连字符后才正常。
`index.html` 里内联 SVG 的同类注释没事（HTML 解析器宽容），但交付的独立 `.svg` 必须守 XML 规矩。

## 9. 文件

```
index.html           自包含单页（内联 SVG + CSS，双击能开，无外部资源）
favicon.svg          干净成品：currentColor 打底 + prefers-color-scheme 换墨
favicon-dream.svg    梦面变体：薄暮紫 + 残影错位
notes.md             本文件
shot-el.cjs          本目录的分区截图器（选择器逐块截，支持 --scheme）
_verify-svg.html     两枚 SVG 本体的校验页
_study.html _study2.html _study3.html _study4.html   形之研究（保留过程）
shots/
  sheet.png              整页（交付的那张）
  d0-verify-light.png    交付 SVG 本体 · light scheme
  d0-verify-dark.png     交付 SVG 本体 · dark scheme
  d0-verify-svg.png      踩坑存档：注释里含 -- 时的裂图
  d1-hero.png d2-construct.png d3-size.png d4-tabs.png d5-mono.png
  d6-context.png d7-faces.png
  _study.png _study2.png _study3.png _study4.png
```

只写了本目录里的文件。没有动 `public/favicon.svg`、`src/` 或其它目录，没有跑 `npm run build`。
