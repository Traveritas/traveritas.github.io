# 浮游碎片 · 变体接口

四个维度各是一个可插拔的登记项，`?bg=` 之外的一切都在这里：`look`（碎片外观）、`hover`（悬停）、
`open`（点开）、`deco`（场景里的装饰）。每个变体是 `variants/` 下的一个独立文件，
加载时把自己登记进 `window.DriftReg`（`reg.js`），主程序只认注册表里的接口。

改完自己那一个文件就行，别去动 `drift.js` / `cards.js` / `deco.js` / `index.html` / `reg.js`。

## 怎么验

```bash
node design/mocks/drift/server.cjs            # http://localhost:4620/drift/?look=facet&scene=essay
ONLY=looks NAMES=facet node design/mocks/drift/.shot-v3.cjs     # → .shots/v3/
```

`ONLY=` 取 `looks,hovers,opens,decos`；`NAMES=` 逗号分隔变体名；`SCENES=essay,project,moment`。
脚本跑完会打印 `no errors` 或页面里的报错。**写完务必跑一次自己的那一类，并打开截图看**——
这个原型里「样式对不对」计算值答不了，只能看画面。

## 上下文

- 空间：镜头在 Z 上滚动；碎片分 5 层，层距 `GAP = 0.5`，z 周期 `D = 2.5`。
  `δ = 层到镜头的距离 ∈ (0, 2.5]`，屏上缩放 `s = G / δ`，`δ = 1` 是焦平面。
  `δ < 0.42` 看不见，`δ > 2.05` 往远处淡出。
- 失焦＝像素化：`|ln δ|` 分四档（`< 0.17` 清晰 / `< 0.42` 每像素 6 单位 / `< 0.8` 12 / 更远 24）。
  所以**任何画出来的东西最后都会被降采样成粗像素**——细节要在「世界单位」尺度上站得住，
  太细的线（1 单位以下）在远处会整个消失。
- 世界单位与 CSS px 的关系：焦平面上 1 单位 = 1px × `G`（`G = clamp(视口宽/1200, 0.5, 1)`）。
  卡片是 420×260、440×280、320×200 这一量级。
- 三个场景各有自己的墨色（`c`，见下）：随笔是浅色底（磨砂/浅玻璃最容易糊掉），
  项目是深靛底，瞬间是暮紫底。

## 公共助手（`DriftReg.*`）

| | |
| --- | --- |
| `hash(a, b) → 0..1` | 确定性随机 |
| `rgba([r,g,b], a)` | 颜色串 |
| `BAYER` | 4×4 有序抖动矩阵（0..15），做像素网点用 |
| `stepPath(ctx, x, y, w, h, s)` | 卡片/装饰共用的外形：四角像素阶梯，每级 `s` 单位 |
| `toLODs(canvas, w, h) → Promise<string[]>` | 一张画布 → 清晰档 + 三档像素化的 blob URL |
| `ink(scene)` | 该场景的墨色对象 |
| `LODS = [6, 12, 24]` | 三档的像素粒度（世界单位） |
| `dotEdge(ctx, x0, y0, x1, y1, seed, n, color, size)` | 沿框线撒抖动像素点，界定一块看不见的面 |
| `inject(id, css)` | 插一段 `<style>`（登记时写 `css:` 字段会自动插） |

场景墨色 `c` 的字段（`look` 用得到）：
`fill`（半透明底）· `fg`（主文字）· `soft`（次文字）· `faint`（弱文字）· `ink`（暖色强调）
· `lit` / `shade`（迎光边 / 背光边）· `glow`（`[r,g,b,a]` 漏光）· `slab`（厚玻璃底）
· `dark`（压暗边）· `paper`（相纸色）· `drop`（`[r,g,b]` 投影色）

---

## 1. `look` — 碎片外观

```js
DriftReg.look('facet', {
  label: '棱面',        // 变体面板上的名字（2–3 字）
  margin: 20,           // 画到卡片外的余量（世界单位）；0 = 不越界
  inset: 0,             // 正文往里收多少（花瓣那种外形用；矩形外观留 0）
  paper: false,         // true = 用相纸墨色（浅纸上的深墨）
  surface(ctx, it, c, M, reg) {},   // 画卡面
  css: '…',             // 可选：给 html[data-look='facet'] 写样式
});
```

- `it`：`{ scene, kind: 'article'|'project'|'img'|'note', ref, w, h, id, k?, no? }`。
  `w`/`h` 是内容区的世界单位尺寸；卡面画在 `(M, M) – (M+w, M+h)`，**中心不能动**。
- `ctx`：已按设备像素比缩放过，直接用世界单位画；`ctx.textBaseline = 'alphabetic'`。
- `c`：场景墨色（见上）。
- 画完卡面之后，`cards.js` 会把正文（标题、日期、描述、图）画在 `(M+inset, M+inset)` 起、
  `w - 2·inset` 宽的区域里。**所以卡面只要管「底子」**：形状、材质、边光、投影。
- 外形不必是矩形——`stepPath` 只是现成的一种；花瓣、棱面都可以自己 `beginPath()`。
  但正文是矩形排的，形状最好保证中间有一块干净的矩形区（否则用 `inset` 把正文收进去）。
- 远处只有 24 单位一个像素，所以**大结构比细节重要**：底色的深浅差、一道亮棱、一块暗角，
  比十条 1 单位的细线有用。

内置的四个（`frost` / `glow` / `slab` / `print`）在 `cards.js` 的 `surface()` 里，可以对照着看。

## 2. `hover` — 悬停

```js
DriftReg.hover('breathe', {
  label: '呼吸',
  css: 'html[data-hover="breathe"] .frag.hot { … }',
  clear: false,              // true = 悬停那份强制跳到清晰档
  gate(rec, api) → bool,     // 哪些碎片可以被悬停（默认只放 lod ≤ 1 的过）
  enter(rec, api) {}, leave(rec, api) {},
  scale(rec, api) → 1,       // 额外缩放倍数
  alpha(rec, a, api) → a,    // 改写不透明度
  lod(rec, lod, api) → lod,  // 改写像素档位（0 最清楚，3 最粗）
  tilt(rec, api) → {x, y},   // 3D 倾斜（度）
  neighbor(rec, hover, api) → {dx, dy},   // 邻近碎片在屏上的位移
  tick(dt, t, api) {},       // 每帧
});
```

- 只有悬停的那一块会带上 `.hot` 类；`rec.el` 是它的 DOM（可以写 CSS 变量、加类）。
- 未登记的钩子不会被调用。`clear` 对远处（lod 2/3）的碎片也生效。
- 默认的 `gate` 是 `lod ≤ 1`：远处只剩色块，悬停在那上面没有意义。要放宽就自己写一个
  （`gate: () => true` 最宽）。**别用 `lod` 钩子去偷偷把远处的碎片拉清楚来骗过门槛**——
  那是拿整片场景的景深线索换一次悬停。
- 现成的做法见 `drift.js` 里的 `pull` / `sweep` / `lean`，以及 `drift.css` 的
  `html[data-hover=…] .frag.hot` 那几条。
- `api`：`{ mouse:{x,y}, G, vw, vh, hoverRec, reading, scene, cam, t, recs, root, RM, reg }`
  （全是 getter，取的是活值）。

**注意**：`setHover` 只对「够清楚」（lod ≤ 1）或 `pull` 变体生效——这是 `drift.js` 里
`pointerover` 的既有判断。要放宽，在 `enter` 里也做不了，得让 `lod` 钩子先把档位拉回来。
另外悬停是一个「轻」的反馈：0.2–0.6s 进出，别做成一次演出。

## 3. `open` — 点开

```js
DriftReg.open('bloom', {
  label: '绽开',
  run(api) {},              // 被点中时调用；跑完自己调 api.openReader()
  closing(api) {},          // 可选：用户按 Esc / 点面板外，阅读层开始收回时
  closed(api) {},           // 可选：阅读层收完了（碎片 el 的 visibility 会被自动还原）
});
```

`api` 的成员：

| | |
| --- | --- |
| `rec` / `it` | 被点开的那块副本 / 它的条目数据 |
| `rectOf()` | 它此刻在屏上的矩形 `{left, top, width, height}`（它可能已经出了视口） |
| `hide()` / `show()` | 藏起 / 放出那块碎片（`openReader` 之前要 `hide()`） |
| `openReader(rect?, extra?)` | 打开阅读层。不传 `rect` 就从碎片原位长出来；`extra` 并进 reader 的 opts |
| `setFx(o)` / `clearFx()` | 设 / 清 `fx`：**其余碎片**的反应。`o` 里可给 `amt`（0→1 的进度，`goal` 由收回时自动置 0）、`cx`/`cy`、以及下面的钩子 |
| `fx` 钩子 | `target(rec, fx, api) → {dx, dy, s}`（挪动/缩放）、`lod(rec, lod, fx) → lod`、`alpha(rec, a, fx) → a`。`fx.amt` 是 0→1→0 的进度 |
| `flyTo(to, dur, done)` | 镜头飞到世界坐标 `to`（可只给 `{x, z}`，其余沿用） |
| `lodOf(delta)` / `rectScale(rec)` | 档位 / 当前缩放 |
| `G` / `vw` / `vh` / `cam` / `zT` / `scene` / `RM` / `reader` / `reg` | 活值 |

- `RM`（减动效）为真时**必须**直接到位，不要留动画。
- 收回的通用流程：`closing` → reader 收面板 → `closed`。`fx.goal = 0` 是默认行为，
  你自己的 `fx` 也是同一套（`amt` 会自己落回 0，`fx` 在 `amt < 0.01` 时自动清空）。
- 阅读面板宽 760、几乎满高，居中；内容排版已经做好了。**展开变体管的是「怎么从碎片到面板」**，
  不要重写正文样式。

现成的四个（`fly` / `grow` / `pixel` / `page`）在 `drift.js` 的 click 处理里。

## 4. `deco` — 场景里的装饰

```js
DriftReg.deco('motes', {
  label: '浮尘',
  perTile: 4,        // 每个平面周期里放几个
  spread: 1,         // 平面周期 × 这个数（>1 更稀，<1 更密）
  alpha: 0.5,        // 基础不透明度
  layers: null,      // 只铺在哪些层（默认全部 0–4）；远处的层更粗、更淡
  zBias: 0,          // 层级微调（正数更靠前，会压过碎片）
  rot: 0,            // 随机旋转幅度（度，±）
  sizeJitter: 0,     // 随机尺寸幅度（±比例）
  noSpring: false,   // true = 不做弹簧迟滞，直接跟镜头
  margin: 0,         // 画到形状外的余量
  shapes: [{ w: 8, h: 8, /* 自定义字段 */ }],
  paint(ctx, sh, env) {},                     // 把一个形状画进 (M,M)–(M+w,M+h)
  motion(d, t) → {dx, dy, rot, scale, alpha}, // 世界单位的漂移 + 旋转 / 缩放 / 透明度倍数
  css: '…',
});
```

- 装饰与碎片**共用同一套空间**：同样的层、z 周期、`δ`、缩放、失焦档、弹簧迟滞。
  所以装饰自动获得景深、像素化、视差与「分层落定」的手感——`motion` 只管它自己的飘。
- `d`（motion 的参数）：`{ key, p, l, c, i, j, delta, t, ... }`，`p` 是排法对象
  （`p.ph` 相位、`p.w1` 频率、`p.rot` 旋转、`p.size` 尺寸抖动）。
- `env`（paint 的参数）：`{ scene, ink, M, name }`。`scene` 变了会重画一次。
- 实例的排法由 `deco.js` 哈希决定，重复错开、不成网格。
- 每个实例是一个 `<div class="deco">`，`pointer-events: none`，`background-image` 换档。
  所以**每帧的 DOM 操作要克制**（几千个实例会掉帧）；`perTile` 3–6 是合理量级，
  大形状（环、光柱）用 1–2。
- 这是「空间本身是内容」的那一半：装饰不承担信息，负责尺度、纵深、材质与一点现实锚点
  （审美方向里的「现实物 = 认知锚点」：门、椅子、花、窗、楼梯、路灯、水杯、书……）。

---

## 5. `scheme` — 方案（一份设计原语串起三部分）

前四个维度各自独立，结果是四份互不相干的清单：一件东西可以配任意一种反应、任意一种展开。
**一份设计能成立，靠的是它内部自洽，不是它有多少个选项。**

方案反过来：它按**一个动词**切，一次给全「这件东西是什么 / 它被靠近时怎么动 / 它怎么变成可读的面 /
聚焦时它做什么」。材质是动词的材料，悬停是动词的第一次发生，展开是动词的完成——三部分不再是
三个决定，而是同一个决定的三个后果。

```js
DriftReg.scheme('thaw', {
  label: '霜化',
  look:  { margin: 20, inset: 0, paper: false, surface(ctx, it, c, M, reg) {}, css: '…' },
  hover: { css: '…', gate: () => true, enter, leave, tick, scale, alpha, lod, tilt, neighbor, clear },
  focus: { css: '…', on(rec, api), off(rec, api), tick(dt, t, api), yield(rec, on, api) → {dx, dy, lod, alpha} },
  open:  { css: '…', run(api), closing(api), closed(api) },
});
```

- 四段都可以是**字符串**（引用已经登记的 `look` / `hover` / `open` 名字）或**内联对象**
  （内部会登记成 `~<方案名>`）。四段都可以省略——省略的那一段回落到地址参数指定的默认值。
- 前三段的接口与上面第 1–3 节**完全一样**，不必重学。
- `?scheme=thaw` 会顶掉 `?look=` / `?hover=` / `?open=`；单轴参数仍然管用（方案是它们的组合器）。
  面板上点任一单轴会自动退出方案。

### 聚焦：所有方案共用的一步

**第一次点一块碎片 = 聚焦，第二次点才展开。** 聚焦由主程序做，方案不用重复实现：

1. 镜头飞到那块（560–900ms，按距离），让它落在**焦平面正中**——于是它变清楚（lod 0）。
2. 四道细线角从四方浮出来框住它（默认提示，屏幕空间，1px 不跟着缩放）。
3. 周围的碎片往外让开一点、退一档焦、暗下来。
4. 再点它一次才展开；点空处或 Esc 退出聚焦。收回阅读层后回到聚焦态，Esc 再退一层。

方案在 `focus` 里管的是**它自己那一块在聚焦态下做什么**：

| | |
| --- | --- |
| `on(rec, api)` / `off(rec, api)` | 镜头落定的那一刻 / 退出聚焦时。给 `.frag.focused` 写 CSS、或直接改 `rec.el` |
| `tick(dt, t, api)` | 每帧（`api.rec` 可能是 null，先判空） |
| `yield(rec, on, api)` | 周围的碎片让开多少。`on` 是 0→1 的进度；返回 `{dx, dy, lod, alpha}`，`dx/dy` 是屏上额外位移，`lod` 是额外加几档，`alpha` 是不透明度倍数。不写就用默认（径向推开 + 退一档 + 暗 30%） |

`api` 在 `focusApi` 里：`{ rec, it, on, G, vw, vh, cam, scene, rectOf(), lodOf(), rectScale(), unfocus(), open(), ui, root, RM, reg, scheme }`。
`api.ui` 是 `#focus` 那一层，要加自己的提示元素就往里塞（记得在 `off` 里清掉）。

**「世界为它让开」是这个空间里最像梦的一件事，鼓励积极用。** 悬停的倾斜、展开的长大、
聚焦的让位是同一个动作的三种用法——别让交互只发生在那一块碎片自己身上。

## 6. 审美：连续是默认，像素是选择

这个原型的空间（流光、装饰、推拉时的失焦分档）本来就是像素 / 定格的；**碎片本身不必跟着做像素风**。
「像素 / 定格感」与「精美的连续感」统一共存是这套设计的追求之一，而这两极最好分工：
**空间承担像素与定格，碎片承担精美与连续。**

所以默认把碎片画成连续的——真的霜、真的乳剂、真的镜面：平滑的渐变、细的颗粒、柔的边。
景深分档仍然在（那是距离线索，不是风格选择：近处是真、远处化进介质里），但**清晰档要经得起看**。

反过来，如果某个方案的主题真的需要像素或定格的语言（比如虚框的像素版、悬落里定格的摆动），
就用——要求是**它是为这个主题做的选择**，不是因为背景是像素的所以顺手也做成像素的。
