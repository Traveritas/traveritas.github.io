# 边 · 参考调研（把「边」做成材料）

> 2026-11-02。给这张卡找边的做法：固定底图（冷灰 / 薄暮紫 / 深蓝 + 网点抖动）、衬线标题、
> 1.25px 线的星在左下，300×200。已经试过「一个边 + 一层半透明底」，差一口气。
>
> **筛选口径**：每条都要能回答「能不能用在这张 300×200 的卡上、代价多大」。
> 只在大画布 / 3D 场景里成立的，我照样列，但会写明为什么搬不过来。
>
> **这条任务真正的难点**：底图是三栏，左边近白、右边深蓝紫。**同一个边必须在这两种底上都立得住**——
> 我原来以为是「边不够好看」，做下来发现是「一层平涂的半透明底，无论边怎么做都像贴纸」。
> 证据在 `edge-lab.html` 那二十二格（11 个做法 × 明暗两栏），不是印象。
>
> **先量了一下底图**（brief 里写的是 3px）：`plate-1440.png` 是 **5px 一格**——5×5 方块里
> 97% 完全同色，2 / 3 / 4 / 6px 分别只有 74% / 53% / 37% / 13%（那 3% 是斜向光带经过了格子）。
> 所以下面凡牵涉网点的做法都按 5px 算。三栏实测色：冷灰 `#b9c6d9`、薄暮紫 `#312731`、深蓝 `#1d2745`。

---

## 0 · 结论三句

1. **最便宜又最有效的，不是边，是「面的值偏移」**：卡片底要跟着栏反号——亮栏做成稍微压暗的
   *薄暗片*，暗栏做成稍微提亮的 *薄亮片*，再在面上加一道极缓的上下梯度（1.5% → 8.5%）。
   四行 CSS，零 filter、零伪元素，`lab-win2-*.png` 是它的样子。
2. **边只需要两条 0.6px 的线**：上沿受光一条亮的，下沿落影一条暗的，外加一圈 0.5px 极淡的把形闭住。
   一旦四边等宽等亮，它立刻退回「描边」。
3. **真正决定它像不像材料的，是「同一个值关系换到另一栏还成不成立」**。所有靠 backdrop 采样的边
   （提亮环、玻璃模糊）在暗栏很好看，在亮栏直接变成白贴纸——`lab-a3/e-*.png` 是反例。

---

## 1 · 候选清单 12 条

| # | 名称 | 链接 | 技术 | 一句话 | 300×200 的代价 |
|---|---|---|---|---|---|
| 1 | squiggle 毛口边（Jack McDade / Daniel Jones） | [danieldarrenjones.com](https://danieldarrenjones.com/articles/how-to-make-rough-edges-with-css-and-svgs) | SVG filter | 1px 直线喂给 `feTurbulence`+`feDisplacementMap`，被位移成一条有毛口的线 | 一个静态 filter，几乎免费；**只套在边那层**，套整张卡字会跟着歪 |
| 2 | 同族演示（Ben Gammon） | [bengammon.co.uk](https://bengammon.co.uk/rough-css-borders-with-svg-filters/) | SVG filter | 同一招的另一份参数与说明页 | 同上（页内 CodePen 在无头浏览器里是灰框，见 `shots/bengammon-demo.png`） |
| 3 | Liquid Glass（Rahul / LogRocket） | [blog.logrocket.com](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg) | SVG filter + backdrop-filter | 一张 Figma 画的位移图 + `feDisplacementMap(scale 55)` 挂在 `backdrop-filter` 上，背后画面沿边被推开；再叠一张只有描边的镜面 PNG 当反光 | 重：要维护两张与控件同尺寸的 PNG；Firefox 不支持 `url()` 形式的 backdrop-filter |
| 4 | 纯 CSS 半调（leanrada） | [leanrada.com](https://leanrada.com/notes/pure-css-halftone) | CSS | 模糊点阵 `mix-blend-mode: screen` + `filter: contrast(999)` 当阈值，把面变成网点 | 便宜，但 `contrast(999)` 会压平整棵子树，只能做图层，不能做卡片 |
| 5 | 噪点渐变（CSS-Tricks / Jimmy Chion） | [css-tricks.com](https://css-tricks.com/grainy-gradients/) | SVG filter + CSS | `feTurbulence` 存成 SVG 贴图当背景，再 `contrast(170%) brightness(1000%)` 把噪点推成颗粒 | 一张 data-URI，零运行时成本；**我们的底图已经有网点，加了会打架** |
| 6 | 全息卡（simeydotme） | [css-tricks.com](https://css-tricks.com/holographic-trading-card-effect/) · [仓库](https://github.com/simeydotme/pokemon-cards-css) · [demo](https://poke-holo.simey.me/) | CSS（多层 + blend） | 三层箔面（`color-dodge` 彩虹 + `overlay` 眩光 + 1px 扫描线），全由指针 CSS 变量驱动；外圈是一层柔光不是线 | 纯 CSS，但 3 层 × 2 伪元素 + 指针 JS；`color-dodge` 在亮底上直接烧白 |
| 7 | 折射 / 色散 shader（Maxime Heckel） | [blog.maximeheckel.com](https://blog.maximeheckel.com/posts/refraction-dispersion-and-other-shader-light-effects) | WebGL | `refract()` 三次（R/G/B 各一个 IOR）得色散，再叠 N 个 sample 把分裂糊开 | **搬不过来**：得把背景变成纹理；底图能当纹理，卡片后面其它 DOM 不能 |
| 8 | `mask-composite` 环（Shadeed / jhey） | [ishadeed.com](https://ishadeed.com/article/css-masking) · [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-composite) | CSS mask | 两层 mask 相减抠出一圈，环里可以放任意渐变——边就能沿周长变亮变暗、中途归零 | 一个伪元素；Safari 要 `-webkit-mask-composite: xor` |
| 9 | `feMorphology` 描边（Codrops） | [tympanus.net](https://tympanus.net/codrops/2019/01/22/svg-filter-effects-outline-text-with-femorphology/) · [MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feMorphology) | SVG filter | 用 erode/dilate 从形状本身长出一圈，不用写第二条路径——线宽可以不是常数 | 便宜；但会糊掉 1.25px 这种细线的锐度（erode 1px 就没了一半） |
| 10 | 双层描边（`paint-order`） | [MDN paint-order](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/paint-order) | SVG | 先描边后填充，把外圈那条描边压到填充下面——一个字/一颗星得到「外一圈、里一块」两条边 | 零成本，改一个属性。**星就用它**：1.25px 线外再挂 0.5px 暗边不会吃掉笔画 |
| 11 | Bayer 抖动（Codrops 2025） | [tympanus.net](https://tympanus.net/codrops/2025/07/30/interactive-webgl-backgrounds-a-quick-guide-to-bayer-dithering/) | WebGL/GLSL | 8×8 Bayer 矩阵在片元里做有序抖动，把 8bit 渐变压成两个色，出「印刷」质感 | 只能做整屏背景；我们是静态底图，用不上，**但它的「有序」正是底图那层网点的做法** |
| 12 | 1px 不是 1 像素（hairline） | [w3c/csswg-drafts#3720](https://github.com/w3c/csswg-drafts/issues/3720) · [ICS: plus-lighter](https://ics.media/en/entry/7258) | CSS | `0.5px` 的边在高分屏上是 1 个物理像素、在低分屏上被凑成 1px；`plus-lighter` 是唯一「只加光、不改色相」的混合模式 | 这条决定了 1.25px 的线在 DPR 1 / 2 下是两种东西（详见 §3 边界条件） |

> 抓不到全文的两条（Cloudflare / 403）：Codrops 的两篇。代码按 MDN 与二手转述给，没在上面写「我读过全文」。

---

## 2 · 深读 5 条

### 2.1 squiggle：一条被噪点啃过的线

`shots/bengammon-demo.png`（原站的 CodePen 在无头浏览器里是灰框）· 本机复现：`shots/lab-rough-light.png` / `lab-rough-dark.png`

```html
<svg width="0" height="0" aria-hidden="true"><defs>
  <filter id="squiggle">
    <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="4"/>
    <feDisplacementMap in="SourceGraphic" scale="4"/>
  </filter>
</defs></svg>
```
```css
.squiggle { filter: url(#squiggle); }
```

- **边怎么来的**：不是画出来的，是**把画好的线揉歪**。`baseFrequency .05` 是低频（每 ~20px 一个起伏），
  所以是「手抖」，不是「毛刺」；`scale 4` 以 CSS px 为单位推开像素，最大位移 ±2px（scale 的一半），
  1px 的线最厚时能摊到 5px 左右。
- **面上的光**：没有。它只管边。
- **代价**：一个静态 filter，只算一次；会新建合成层，图层里的**文字也会被位移**（原站套在图片上，
  我们只能套在边那一层）。filter 区域要留边（`x/y/width/height`），不然位移到外面会被裁掉。
- **能不能搬**：**能，是今天就能用的一条**。我的复现里把参数改成高频 `baseFrequency .55 / numOctaves 2 /
  scale 1.6`，效果从「手抖」变成「油墨没上满」——1.25px 的线沿长度出现一点点粗细微差，立刻不像 UI 线了。
  见 `lab-rough-light.png`。

### 2.2 Liquid Glass：边是被掰弯的背景

`shots/logrocket-demo.png`（文章配的那张真玻璃图，正是它想复现的东西）· 廉价近似：`shots/lab-a5-dark.png`

```jsx
<filter id="liquid-glass-button">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blurred_source"/>
  <feImage href="/displacement-map.png" width={W} height={H} result="displacement_map"/>
  <feDisplacementMap in="blurred_source" in2="displacement_map" scale="55"
                     xChannelSelector="R" yChannelSelector="G" result="displaced"/>
</filter>
```
```css
/* 关键：不是 filter，是 backdrop-filter —— 被掰的是背后的画面 */
.glass-layer { backdrop-filter: url(#liquid-glass-button) brightness(150%); }
```

- **边怎么来的**：位移图（Figma 画的径向渐变 + 一圈比一圈更模糊的圆角矩形，128 = 不位移）编码了
  「每个像素往哪挪」，`feDisplacementMap` 照它掰背景。**边厚 = 位移量最大的那一圈**。
  再叠一张只有描边的镜面 PNG（左上亮、右下暗、透明度 ~50%）模糊后压上去，就是反光边。
- **面上的光**：靠那张 specular 图，不是实时光。
- **代价**：位移图是**跟控件同尺寸的固定资产**，300×200 就得配一张 300×200，改尺寸要重画；
  每张几十 KB；`backdrop-filter: url()` 在 Firefox 至今不支持，Safari 要前缀；
  而且 backdrop-filter 会强制它自己成为一个合成层，同页出现多个会掉帧。
- **能不能搬**：搬一半。整套要两张图 + 只在大尺寸成立，不值。
  但「**边 = 把背后的画面提亮**」这个念头可以只用一行 CSS 近似：
  `backdrop-filter: brightness(1.42) saturate(1.12)` 挂在一条 1.25px 的 mask 环上。
  我做了（`lab-a5-dark.png`）：暗栏上它很好看——**边采的是底图那块像素（连同网点一起提亮），
  所以亮度沿周长本来就不均匀**，这正是它比一条纯色线更像材料的原因。
  同一段代码到亮栏（`lab-a5-light.png`）就变成一圈白线——把近白的底再提亮，只能得到白。

### 2.3 纯 CSS 半调：一个面由点构成

`shots/leanrada-halftone.png` · `shots/leanrada-demo.png`（页内活的 demo）

```css
.halftone { position: relative; filter: brightness(.8) blur(3px) contrast(999); }
.halftone::after {
  position: absolute; inset: 0;
  background: radial-gradient(10px at center, black, white);
  background-size: 20px 20px;
  mix-blend-mode: screen;
}
```

- **边怎么来的**：没有边，讲的是整个面。两步：`screen`（把模糊点阵叠上去，亮的地方点小、
  暗的地方点密）+ 阈值（`contrast(999)`，`blur(3px)` 是表面张力，`brightness(.8)` 挪阈值）。
- **面上的光**：网点大小 = 明度。整个面就是「光用点来说」。
- **代价**：`contrast(999)` 是整棵子树一起压，文字进去就没了——它只能做图层。
  静态没问题；如果是逐帧动的，filter 每帧重算。
- **能不能搬**：**借原理，不借代码**。我们底图本来就是网点（一格 5px），卡上再撒一层会和底图打架
  （我试了，`lab-c-*.png`：角上直接出现第二套网格）。能借的是「阈值」这个概念——
  边要么二值（有/没有），要么按覆盖率分档，而不是一条均匀的灰线。

### 2.4 折射 / 色散：那个看着最厉害、根本搬不过来的

`shots/heckel-demo2.png`（首屏；正片 demo 在文内，是无头浏览器里截不到活的 WebGL 画布）

```glsl
vec3 refractVecR = refract(eyeVector, normal, iorRatioRed);
vec3 refractVecG = refract(eyeVector, normal, iorRatioGreen);
vec3 refractVecB = refract(eyeVector, normal, iorRatioBlue);
float R = texture2D(uTexture, uv + refractVecR.xy).r;
float G = texture2D(uTexture, uv + refractVecG.xy).g;
float B = texture2D(uTexture, uv + refractVecB.xy).b;
```

- **边怎么来的**：不是边，是整个透明体。法线 + 视线得折射向量，用它偏移采样；
  色散是**三个不同 IOR 各采一次**，再用 N 个 sample 叠加把 RGB 分裂糊开（否则边界是硬的三层）。
- **面上的光**：真实的、逐像素的。
- **代价**：WebGL。真正贵的地方不是算力，是**它要一张背景纹理**——只能把底图当纹理传进去。
  也就是说：底图能被折射，卡片后面那些 DOM 不能。要做对，等于把整页渲染进 canvas。
- **能不能搬**：不能。我把它的「色散」降到 CSS 里做过一次（两份 0.4px 偏移的星，
  `lab-b-dark-4x.png`），结论是**色散在 1.25px 的线上不存在**：1× 下看不见，
  4× 下也只是把线弄脏（`plus-lighter` 还会把三条叠成纯白）。要色散，线宽至少 3px，
  或者给一块面（标题描边、边的受光段）。

### 2.5 全息卡：边是「光溢出来」，不是一条线

`shots/pokeholo-demo.png`（[live demo](https://poke-holo.simey.me/)）

```css
/* 边：外圈不是线，是一层同色柔光 */
--card-glow: hsl(54, 87%, 63%);
/* 面：三层 */
.card__shine { filter: brightness(.85) contrast(2.75) saturate(.65); mix-blend-mode: color-dodge; }
.card__glare {
  background-image: radial-gradient(farthest-corner circle at var(--pointer-x) var(--pointer-y),
    hsla(0,0%,100%,.8) 10%, hsla(0,0%,100%,.65) 20%, hsla(0,0%,0%,.5) 90%);
  mix-blend-mode: overlay;
}
```
（完整值在仓库 `public/css/cards/base.css`；所有位移由 `--pointer-x/y`、`--background-x/y`、
`--pointer-from-center` 这几个变量驱动，指针一动全动。）

- **边怎么来的**：`box-shadow` 用按属性色的 `--card-glow` 做一层柔光 + 一圈 1px 的 `--card-edge`。
  视觉上边是「光从卡里溢出来」，所以卡的轮廓比一条线更软、更有量。
- **面上的光**：三层。彩虹箔（`color-dodge` 烧出来的）+ 跟着指针走的眩光（`overlay`）+ 1px 扫描线
  （`repeating-linear-gradient` + `background-blend-mode: overlay`）。
- **代价**：纯 CSS，但 3 层 × 2 个伪元素 + 指针跟踪；`color-dodge` 在亮底上直接烧成白块，
  所以它把卡都放在深色背景上——**我们左栏是近白的，这招在左栏会瞎**。
- **能不能搬**：**面光搬不过来（我们的调性不允许彩虹），边的念头可以**：
  外圈一层低饱和的同色柔光，比一条线更像材料。但发光色只能取底图亮部的同色（冷灰/薄暮紫），
  而且强度必须低到「说不清是边还是光」。

---

## 3 · 可借的三招

三招都落在 `design/mocks/refs/edge-lab.html`，可以直接开浏览器对着底图看。

### 招一 · 卡片是底图的「值偏移」，不是一层白膜

差一口气的根本原因在这里，不在边。平涂的半透明底 = 贴纸；它没有「面」。
**偏移方向必须随栏反号**：亮栏往下压，暗栏往上提。

```css
/* --ink 用底图暗部的那个色（我们：23 28 40） */
.card[data-plate='light'] {
  background: linear-gradient(180deg, rgb(23 28 40 / .015), rgb(23 28 40 / .085));
}
.card[data-plate='dark'] {
  background: linear-gradient(180deg, rgb(255 255 255 / .10), rgb(255 255 255 / .015));
}
```

数字：亮栏 1.5% → 8.5%，暗栏 10% → 1.5%，都是「上下差 3–4 个 L，肉眼不觉得是渐变，
但能觉得这块面有上下」。截图：`lab-win2-light.png` / `lab-win2-dark.png`（4×），
`lab-win2-light-1x.png`（1×，生产的真实观感）。

> 为什么要梯度：4× 下平涂底一眼是塑料片；加了 1.5%→8.5% 之后，网点在卡内的密度变化
> 和卡外的斜向光带接上了，卡就「躺」在底图上而不是「贴」在上面。

### 招二 · 边是两条 0.6px 的线，不是一圈

```css
.card {
  box-shadow:
    inset 0 .6px 0 rgb(255 255 255 / .42),  /* 上沿受光 */
    0 0 0 .5px rgb(23 28 40 / .14),         /* 整圈极淡，先把形闭住 */
    0 .6px 0 rgb(23 28 40 / .26);           /* 下沿落影 */
}
```
暗栏把那两条的明度反过来（上 .55 白、下 .28 黑）。**核心是「上亮下暗」这个次序，
不是任何具体色值**；四边等宽等亮 = 描边 = 现在这张。

要让它沿周长变化（迎光那段最亮、到背光归零），用 mask 环替掉 box-shadow：

```css
.card::before {
  content: ''; position: absolute; inset: -.6px; padding: 1.25px;
  border-radius: inherit; pointer-events: none;
  background: linear-gradient(150deg,
    rgb(255 255 255 / .55), rgb(255 255 255 / 0) 46%, rgb(23 28 40 / .28));
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
}
```
代价：多一个合成层，Safari 要前缀；好处是边中途可以真的归零——「边消失一段」比「边变淡」更像自然光。

### 招三 · 给 1.25px 的线一点微差（噪点咬边）

一条矢量线是**没有微差**的，这是它一眼被认成 UI 的地方。让它的粗细沿长度抖 0.2–0.6px：

```html
<svg width="0" height="0" aria-hidden="true"><defs>
  <filter id="bite" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="7"/>
    <feDisplacementMap in="SourceGraphic" scale="1.2"
                       xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>
```
```css
.card::before, .star { filter: url(#bite); }
```

参数怎么调：
- `baseFrequency` **.5–.8** = 油墨没上满（细碎的粗细微差）；**.05** = 手抖（原站那样，大尺度歪）。
- `scale` **1.2–1.6**。超过 2，圆角开始出豁口、1.25px 线会断成点。
- `seed` 固定，**不要动画**。抖动一帧一变就是电视雪花。
- filter 区域按 `-8%/116%` 留边，不然位移到外面的部分被裁。

截图：`lab-rough-light.png` / `lab-rough-dark.png`。

### 边界条件（这几条别当成招）

| 做法 | 在 300×200 上的实际结果 | 结论 |
|---|---|---|
| 5px 网点做整圈边框（`lab-c-*`） | 像打孔纸/代金券；点和底图网点不同相，角上出现第二套网格 | 只在「与底图同相位」时可用，且要做 100/50/25 三档覆盖率的抖动梯，不是一排等大的点 |
| 0.4px 双色散星（`lab-b-dark-4x`） | 1× 下看不见，4× 下只是线脏了 | 色散要 ≥3px 线宽或一块面才成立 |
| 提亮环 `backdrop-filter`（`lab-a3/a5`） | 暗栏成立（边是提亮的底图，网点跟着亮）；亮栏变成一圈白线 | 不是「自动适配」，得按栏给两套值 |
| 1.25px 的线本身（`lab-win2-light-1x.png` vs `-4x`） | DPR 1 上 1.25 CSS px = 1 行实 + 0.25 行淡，线是软的；DPR 2 上 = 2 行实 + 0.5 行淡，同一个 `stroke-width` 看起来粗一档 | 判断边成不成立，两种 DPR 都得看；别只在 4× 截图上拍板 |

---

## 4 · 一条别学：玻璃拟物一上高光，就变成 2010 年的 iOS

`shots/lab-e-light.png` · `shots/lab-e-dark.png`（我按最标准的配方做的：`backdrop-filter: blur(6px)` +
`inset 0 1px 0 rgba(255,255,255,.55)` + `border: 1px solid rgba(255,255,255,.35)` + 外投影）

翻车不是审美问题，是**两个机制踩在我们的底图上正好最糟**：

1. **blur 抹掉网点。** 卡内变成一块光滑的乳白面，卡外还是有网点的底图——
   它就不再是「同一张纸上的另一层」，而是「贴在上面的一张塑料膜」。这是最致命的一条：
   我们的底图是网点构成的，**任何 >0 的模糊都会让卡片换一种材料**。
   宁可用 `opacity` 压半透明，也不要 `blur`。
2. **整圈等宽的内高光**是 2010 年按钮的指纹。真实受光的边只在一侧最强，往另一侧归零；
   一条从头亮到尾、厚度一致的白色内高光，读起来是「凸起的塑料按钮」。

三条硬阈值（做的时候直接对）：
- 模糊半径必须 **0**；要柔就用一层低 alpha 的纯色，不要 blur。
- 内高光只能**分边**：只给上沿（或受光那侧），alpha ≤ .45，并在 20–40% 处归零。
- 描边白线不透明 ≤ **30%**；再高就是贴纸白边。

如果一定要「玻璃」：把 blur 换成「提亮环」——招二那个 1.25px 的 mask 环，环里挂 `backdrop-filter: brightness()`，
它保留了网点；然后**只放在暗栏**。

---

## 5 · 本机验证台

```bash
# 全部做法 × 明暗两栏
node design/mocks/refs/shot-el.cjs \
  "file:///<repo>/design/mocks/refs/edge-lab.html" lab-grid y:0 1440 1560 1

# 单片 4×（看像素）：v=now|a1|a2|a3|a5|win|win2|e|c|b|rough
node design/mocks/refs/shot-el.cjs \
  "file:///<repo>/design/mocks/refs/edge-lab.html?v=win2&bg=light&solo=1" \
  lab-win2-light y:0 340 240 4
```

- `edge-lab.html` 直接吃 `cards-r5/shared/plate-1440.png`，不改不盖；每格自己裁一块底图贴上来，
  所以卡片周围露出来的就是真底。
- 各格：`now`（现状 1px 边 + 白膜）、`a1`（box-shadow 双层）、`a2`（mask 定向环）、
  `a3`（提亮环）、`a5`（提亮环 + 同底对色）、`win`（面梯度 + 分边双线）、
  `win2`（反号填充 + 上亮下暗 = 招一+招二）、`e`（玻璃拟物，反面）、`c`（5px 网点收口）、
  `b`（亚像素色散）、`rough`（噪点咬边）。
- **4× 截图看的是像素，不是生产观感**。1× 的 `lab-win2-light-1x.png` 才是用户看到的；
  两个都要看，否则会做出「放大才成立」的边。

---

## 6 · 截图索引（`design/mocks/refs/shots/`）

| 文件 | 是什么 |
|---|---|
| `bengammon-demo.png` | squiggle 原帖；页内 CodePen 在无头浏览器里是灰框（交互才起） |
| `leanrada-halftone.png` / `leanrada-demo.png` | 纯 CSS 半调，标题图 + 活 demo |
| `logrocket-demo.png` | Liquid Glass 文章配图（真玻璃，看边上的色散） |
| `heckel-demo2.png` | 折射/色散文章首屏（正片是可交互 canvas，截不到活的） |
| `pokeholo-demo.png` | 全息卡 live demo，边是一层柔光 |
| `lab-*.png` | 本机把各招搬到我们底图上：`grid` 总览、其余单片 4×（`-1x` 那份是 1×） |

> 说明：CodePen / Shadertoy / 带交互的 canvas 在无头 Chrome 里截不到效果（要么灰框，要么首帧空白）。
> 这些地方我改成「贴关键代码 + 在本机用同一份参数复现」，复现图就是 `lab-*`。
