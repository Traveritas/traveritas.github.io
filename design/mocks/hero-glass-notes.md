# 首屏原型 · glass（树脂字）

页面：`/mock/hero-glass/`（`src/pages/mock/hero-glass.astro`，脚本 `src/scripts/proto/hero-glass.ts`）。
只改了开屏场 0，其余四幕与 `/new/` 相同。

## 思路

用「字形蒙版 + 图层」取代原来的波纹填充。醒和梦是两块被光照透的磨砂树脂，悬在线的两侧：

- **醒**：冷雾蓝，左上一道利落的细高光，字下一层很淡的冷影。整体清晰。
- **梦**：灰粉到淡金，高光化开，投影换成贴着字的一圈淡金光晕。整体柔软。
- **膜**：整字一张静止的 14° 渐变遮罩，越过线的那一侧淡成残影（醒的下沿、梦的上沿）。线自己的波仍由 Worker 画，字不再逐帧跟着波走。
- **双态**（`--still`）：梦面时醒字退远（变透），梦字变实。只在入梦检验按压时变化。

## 层次（每字 3 层）

1. `.gl-body`：用 `mask: var(--glyph)` 裁成字形，里面是静止的树脂底色渐变，再叠一张静止的 feTurbulence 磨砂颗粒（`::after`，soft-light）。
2. `.gl-drift`：本体里的子层，两团雾光斑，只做 `transform` 漂移（26s / 34s alternate）。
3. `.gl-rim`：一张静态图，内容是：
   - 字外的投影或光晕；
   - 字内沿往里渐淡的一圈透光（字形减去自身的模糊版，表现树脂的厚度）；
   - 左上细高光（字形减去自身的错位版）。

`--glyph` 和 `--rim` 由脚本 `glassArt()` 按字体实测，一次性画进与字框同尺寸的 canvas，转成 blob URL，解码完成后再挂上（`.ready`）。字框四周外扩 `--P = 0.12G`，给投影和光晕留位，所以膜的渐变百分比按 1.24G 的框重算过（线在法向约 69% / 32% 处）。

## 性能做法

- 删掉了 membranes / clipMembranes / 波纹贴图 / 30fps 的 `later()` 节拍。rAF 只在入场画线和滚动后跑，静置时完全不要帧。
- 不再有逐帧的 clip-path / mask / filter 写入。`feMorphology` 的 SVG 滤镜、`blur()`、`drop-shadow()` 全部去掉；模糊只在 canvas 里算一次。
- 入场的 `home-develop` 改为 opacity + transform（原来动 filter blur）。
- 实测（headless Chrome，1440×900，静置 3 秒，CDP Performance metrics）：RecalcStyle 0 次、Layout 0 次、Script 0ms、TaskDuration 约 6ms/3s；rAF 帧间隔 p50 16.7、p95 16.8、max 17.4ms。

## 截图

`design/mocks/_shots-hero/glass-v{1,2,3}-{d,m}-{wake,dream}.png`。v3 是当前版本。

- v1：本体太实，暗边加亮边读成斜面浮雕 / 金属字。
- v2：去掉暗边，加内沿透光，本体变透。磨砂亚克力感出来了，但醒字发白、偏弱。
- v3：醒字压回冷雾蓝，内沿光减弱。

## 已知问题 / 观感评价

- 安静、轻，和「磨砂玻璃 / 半透明树脂」对得上。但对比度偏低，远看有点像玻璃拟态的招牌字或产品 UI 浮雕，离「梦感」还差一层。
- 漂移光斑太克制，静帧里几乎看不出来，动起来也只是很缓的明暗起伏。可以加强，或者干脆去掉，省掉一层。
- 静态膜让「线切开字」的戏剧性弱了很多：线从字上掠过，字没有回应。如果要回应，可以在线附近加一条 transform 平移的光带（仍走合成层）。
- 600 字重的宋体在树脂质感下略显厚重，可试 500 或更细的字重。
- RealityGuide 浮层压在梦字右下（沿用 `/new/` 布局，未改）。
- 未运行 `npm run build`（按约定由父任务统一构建）；tsc 对原型文件无报错。
- 没有起自己的 dev server：Astro 7 限制单实例，已有共享 dev server 在 4321，截图用的就是它，我没有去停它。
