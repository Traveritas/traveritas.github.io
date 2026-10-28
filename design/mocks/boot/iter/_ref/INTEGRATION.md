# 开屏迭代 · 真实页面接入调研（Lead）

调查日期：2026-10-28。目的：二（从粗到细）与五（夜与星）两条线的候选，将来接进真站时要动哪里、怎么动、代价是什么。
**本文件只是方案，不代表已经改 `src/`。**

---

## 0. 一句话结论

- **二**：最便宜的接法不是把 mock 的 2D 画布满屏叠上去，而是**把「格大小 / 量化阶」直接喂给真站已有的 WebGL 流光**（`src/scripts/wander/light.js`）。它本来就是 1/5 分辨率 + Bayer 抖动 + 量化；开屏只是让这两个数从粗走到细。零新增渲染管线、零新增请求。
- **五**：作为一层 `position: fixed; z-index: 200` 的开屏层叠在真实首页上，只动 `transform / opacity`，最后整层摘掉。需要新增一个「开屏期接管首页入场」的小接口（线 reveal / 大字 focus / `booted` 时刻），否则首页那两段入场会在开屏底下白演。
- 两者都必须接管 `boot.ts` + `BootVeil.astro` 的职责：**什么时候打 `html.booted`、什么时候摘层、不放开屏时怎么兜底**。

---

## 1. 真站现状（事实）

### 1.1 开屏链路

| 位置 | 事实 |
|---|---|
| `src/layouts/BaseLayout.astro:186` | 主页现在传 `boot={false}`（`src/pages/index.astro`），改用 `GrainBoot`；其余页仍用默认 `boot`，会话首访放旧碎晶开屏；样式预览 `boot={false}` |
| `src/components/chrome/BootVeil.astro:42-54` | 首帧前内联脚本决定放不放：`prefers-reduced-motion` / `sessionStorage['xm-boot-seen']` / 站内 View Transition → `data-boot-skip` |
| `src/scripts/boot.ts` | `initBoot()` 等 3 个纹理 + 字体 + 页面首帧稳定（上限 1200ms）→ 加 `.go` 起播；`.go + 1450ms` 打 `html.booted`；`.go + 2350ms` 摘掉整层 |
| 实测（本机 dev，1440×900，旧开屏） | `w-ready` ≈ 1.89s；`booted` ≈ 3.34s；开屏摘除 ≈ 4.13s（dev 环境，仅作数量级参考） |
| `html.booted` 的消费者 | `reality.ts:571`（**booted 后 120ms 入梦**）、`ave.ts:726`（旁白开嗓）、`Seam.astro`（缝线画出）、`RealityGuide`、`gate-arrive`、旧首页 `home-linescape`/`home-storyboard` |

### 1.2 首页入场（wander）

| 位置 | 事实 |
|---|---|
| `src/scripts/wander/wander.js:1868` | `root.classList.add('w-ready')` 在 wander 初始化末尾，**立刻**加，不等开屏 |
| `src/styles/wander.css:444` | 大字：`html.w-ready[data-wview='home'] .w-home-brand-box { animation: w-home-focus 1.6s … }`（模糊 14px → 清楚，0–60% 保持透明到不透明） |
| `src/scripts/wander/wander.js:861,890` | 脑电线：`revealT0 = now() + 300`，`reveal = (now − revealT0) / 2200`，经 `setEegSpine({ … reveal })` 从中心往两端画出 |
| `wander.js:1107` | `eegAmp` 从 0 爬到 1，约 0.7s |
| `wander.js:1873` | **WebGL 着色器在 `requestIdleCallback` 里才编译**（≈0.9s 主线程；timeout 1500ms）——开屏期正好可以盖住它 |
| `wander.js:1831` | 大字「反相窗」`#w-win` 由 `createInverse` 每帧从 `#w-light` 拷一小块、反相、按字形遮罩；换梦态词会重新烘一张字形 |
| `reality.ts:564-579` | **默认入梦**（无 `sessionStorage` 的 wake 时）：`booted` 后 120ms `enterDream`；梦态大字在 `brand.ts` 里每秒轮转一个词（AveritA / VeritaA / EritaaV / …，每 7 步停 3s），标题不是静态的 |

### 1.3 首页材料

- 底色 `#0e0f1d`；三池夜色：随笔 `#c6ced9` 系、瞬间 `#1d1729` 系、项目 `#0d1524` 系；紫光在 `70% 10%`。
- 流光：`#w-light`，WebGL2，画布 = 视口 / 5（1440×900 → 288×180），CSS `image-rendering: pixelated` 上采样；`GRAIN.home = [1, 0.3, 26]`（抖动强度 / 亮芯 / 26 阶），4×4 Bayer 索引锁在画布像素上。
- 大字是流光的「反相窗」，梦态每秒换词；三栏头挂在线下；左下时刻；右下 GitHub / RSS / NEXUS；底部「下沉」。
- 真首页截图（摘掉旧 bootveil 后拍）：`design/mocks/boot/iter/_ref/real-home/.shots/`
  - `home-desktop.png` / `home-mobile.png`：整页静置（大字可能在梦态轮转中途，属正常）
  - `home-desktop-flow.png`：只留流光的颗粒与网点（供二对齐用）
  - 注：**mock 里的假首页是替身**，真首页的流光比假首页的静态渐变暗得多、也更稀疏；五的终帧必须按真首页设计。

---

## 2. 二的接入方案（从粗到细）

> **2026-10-28 实装（用户选定 B「连续收细」，并按澄清改成「起始超粗」而不是叠纯色层）：**
>
> 已经接进 `src/`，没有覆盖层。改动：
> - `src/pages/index.astro`：`boot={false}`；`<head>` 内联脚本在首帧前判定放不放，播放时设 `window.__grainBoot` + `html[data-grain-boot]`；4.5s 兜底防死幕（2026-10-28 已改成 12s 撤幕 + 加载幕，见 §7）。
> - `src/components/chrome/GrainBoot.astro`：开屏期藏住首页的字 / 栏头 / 底部 / 工具星 / 光标 / 舞台，并压掉 `w-home-focus` 动画；结束加 `html.grain-boot-done` 防补演。
> - `src/scripts/grain-boot.ts`：时间轴（0–120ms 一整块 → 120–1400ms 对数式收细到 5px / 26 阶；文字 420–1300；线 560–1380；`booted` 1350；1600 摘层）。`?grain-pause=1` 是验收用的暂停口，`window.__grainCtl` 可 `seek`。
> - `src/scripts/wander/light.js`：shader 加 `uCell / uLv / uDither / uGrainOn`；开屏时每个像素只取**所在块的中心**（块比视口大时取视口中心），一个块一个颜色，等价于真正低分辨率渲染，不额外叠层。日常 `uGrainOn=0` 走原路径，逐像素不变。
> - `src/scripts/wander/wander.js`：`setGrain / setReveal / finishReveal / lightReady / startLightNow`；开屏期 `bootLineOpacity=0` 藏住脑电群；`grain` 每帧交给 `light.draw`。
> - `src/scripts/boot.ts`：检测到 `window.__grainBoot` 时直接 return，由 GrainBoot 接管 `html.booted`。
>
> **实测口径**：起始格 = `max(vw, vh) × 1.2` 屏 px（1440×900 时 1728px，整屏一格）；约 160–230ms 第一次分裂；粗段 `uLv=16`（避免暗部 3 阶发蓝）、`uDither=0`，随收细长到 26 阶 / dither 1。终帧段不再有开屏网点，和首页自己的一张网重合。
>
> **已知问题 / 待观察**：
> 1. 首帧前要等 wander init 与 WebGL 着色器编译（本机 headless SwiftShader 约 5s；真实 GPU 上按旧记录约 1s）。这期间页面是一整块暗夜；旧开屏则在同一段显示碎晶 loader。若真实设备上太长，可以考虑把编译挪到更早的 idle 或做一个极简的静态首帧。
> 2. 单个块的颜色是块中心的点采样，不是盒均值；1024ms 前的块很大时，极少数情况下色相会跨量化阶轻微跳一格（当前 `uLv=16` 已把一跳压到 1/16）。
> 3. ~~文字在粗块还没收完时就开始对焦（420ms 起）~~ → 第二版把界面放进同一张格，见下一条。
> 4. `AGENTS.md` / `docs/design/content-typography.md` 还在描述旧 BootVeil；主页开屏已经换成 GrainBoot，文档待同步。
> 5. 主页目前沿用「本会话首访才放」的判定（`sessionStorage['xm-boot-seen']`）；`?grain=1` 强制重播，`?grain=0` 关闭。（2026-10-28 同日改为每次进主页都放，见 §7）


> **2026-10-28 实装 · 第二版「整个界面」（用户：不要只有背景收细，整个界面一起收细）：**
>
> 第一版只有背景（流光）在收细，界面的字与线一直清晰——粗格还在时字已经锐利地立着。
> 第二版把界面也交给同一张格：
> - `src/scripts/grain-raster.ts`（新）：把字、栏头、时刻、出口、底注与脑电线重画进一张
>   「视口 ÷ 格」大小的画布——文字在 `1/cell` 变换下 `fillText`（等于真的按这个分辨率渲染），
>   脑电线把 worker 的 `#site-eeg-canvas` 用 `drawImage` 缩下来（面积平均，细线断成点）。
>   墨色：走 `background-clip: text` 的那类字（`data-ink-auto`，wander/ink.js）取它横向渐变的平均色。
>   大字不走墨色：它是流光的「反相窗」，栅格里把 `#w-win` 那片光缩进格子、`invert + hue-rotate`，
>   再用一张单独累积的字形遮罩蒙上去（遮罩不能逐字 `destination-in`——后一个字母会把前一个清掉）。
>   画布原点 = 视口左上、格宽 = 背景格宽 → 界面里的每个块正好落在流光的那一块上。
> - `src/components/chrome/GrainBoot.astro`：新增 `#grain-ui`（`image-rendering: pixelated`，只在 `html[data-grain-boot]` 下显示）；
>   栅格期真界面 `visibility: hidden`（透明度仍由脚本逐帧写，栅格拿它当「字有多亮」），交接段 `html.grain-handover` 放回来。
> - `src/scripts/grain-boot.ts`：`TOTAL 1600 → 1780`；`RISE1 = 1720` 收细到 5px；`REVEAL_AT 1350 → 1480`；
>   交接 1540–1762：栅格 opacity 1→0、真界面 `blur 3px → 0`。`?grain-pause=1` / `window.__grainCtl.seek()` 照旧可验收。
>
> **实测**（本机 1440×900，headless 与 headed 各一轮）：开屏期 rAF 中位 16.7ms、p90 16.8ms，与 `?grain=0` 静置时一致；
> 交接段的 6 个 `blur` 层与每帧的栅格重画都没有掉帧。栅格重画本身 0.2–0.4ms/帧（headless）。移动端 390×844@3x 无横向溢出。
>
> **代价 / 已知取舍**：
> 1. 字号比格小的字（栏头、时刻、出口）在这个分辨率下根本不存在，最后 ~500ms 才浮出来；这是物理，不是接缝。
> 2. 大字在格宽 ≈ 1–2 倍字高时是一条光带（约 700–1250ms），之后才成为方块字——同样是低分辨率的必然。
>    若嫌这一段像加载条，可在格宽 > 90px 时把 `brandA` 再压一档（`grain-boot.ts`）。
> 3. 不进栅格的：栏头前的琥珀点（伪元素）、底注下那根细竖线、NEXUS 的小菱形图标、工具星/光标（开屏期本来藏着）——
>    它们在交接时一次性出现。
> 4. `#w-heads` 是整屏盒子：`blur` 要挂在三个 `.w-rh` 上，不要挂在整屏（那等于每帧过滤一张 1440×900 的层）。
> 5. ~~`wander.js` 的「反相窗」没建起来~~ → **2026-10-28 已修**：根因是 `8cff727`（perf(wander)，10-27 21:44）
>    把 `createLight()` 挪到入场编排之后，而 `createInverse` 仍在「建窗这一刻 `light` 必须是活的」上判定，
>    于是 `win === null`、`html.w-win` 从不加、大字退回普通墨色（`#w-win` 停在 300×150）。
>    修法：主页的光在入场前就编译（主页没有要抢首屏的卡），建窗改成「等光就绪的懒建」，由渲染循环每帧问一次；
>    栅格里的大字也改成把那只窗画进格子（反相 + 字形遮罩；遮罩要一次画完再蒙，不能逐字 `destination-in`）。
> 6. 开屏栅格依赖 `#site-eeg-canvas`（worker 渲染端）。若落到 SVG 兜底，那一段线不进栅格，会一直是细的。


### 2.1 为什么不能把 mock 画布直接叠上去

- mock 是 2D 画布 + 积分图盒式降采样（见 `design/mocks/boot/iter/2-grain/_shared/grain.js`），每帧 0.6–1.3ms（桌面实测，288×180）；首帧建场 16–22ms（手机 ×4 估算 60–90ms）。
- 真站已经有一条 WebGL 流光管线在跑。再叠一层 2D 画布 = 两套渲染、两份构图，交接时任何一点流场/色差都会被看见。
- 真站的开屏还应该**顺便把 shader 编译藏掉**——如果开屏自己就是 shader，这笔「白等」就变成了演出。

### 2.2 推荐接法：给 `light.js` 加「格 / 阶」两个 uniform

`light.js` 的 fragment shader 里已经有：

```glsl
float Lq = gr.z;
col = floor(col * Lq + 0.5 + (bayer(fc0) - 0.5) * gr.x) / Lq;
```

开屏只需要再加两层：

1. **格**：把 `flowV` / `poolW` 的采样坐标吸附到 `cell` 格子的中心（`fc = (floor(fc0 / cell) + 0.5) * cell`），再走原来的上色；`col` 的写入区域自然就成块。
2. **阶**：`Lq` 从 3 走到 26（或者 `uLv` 直接给当前阶数），`gr.x`（抖动强度）随细度从 0 到 1，避免粗格子里的网点打架。

接口建议：

```js
light.draw({
  ...,                      // 现有参数
  grain: { cell: 48, lv: 3, dither: 0 }, // cell 单位 = 屏幕 px；lv = 量化阶；dither = 0..1
});
```

`createLight` 的返回值加一个 `setGrain({cell, lv, dither})` 或把 `grain` 塞进 `draw()`；
`wander.js` 每帧把开屏给出的三个数传进去；开屏结束后 `grain` 回到 `{ cell: 5, lv: 26, dither: 1 }`（= `GRAIN.home`）并停止传。

**代价**：shader 里多 2 个 uniform、多几行算术；每次 draw 还是同一个 draw call。没有新画布、没有新请求、没有 CPU 逐像素。

**风险 / 需要实测的点**：
- 吸附格子 = 点采样，不是盒式平均。格子边界移动时，块内颜色会跳（mock 里连续版改用盒式平均就是为了压这个）。所以要再选一个：
  - **4-tap 平均**：格中心 + 四角各算一次 field/pool（成本 ~4× 或只在粗段开），跳跃会明显变小；
  - **只做离散跳级**（a-step）：格子尺寸只在几个固定值之间切，点采样不会「沸腾」，这是最省也最稳的接法；
  - **两段式**：粗段（cell ≥ 14px）离散跳级，细段（cell ≤ 14px）连续收细；细段点采样的跳变被更小的格子盖住，几乎看不见。
- `flowV` 里的 fbm 是 4 倍频、域扭曲两段，4-tap 会明显变贵；建议 coarse 段用降倍频（mock 用 2–3 倍频）并复用结果。
- `#w-win` 反相窗读的是 `#w-light` 的小块；开屏期大字若还是糊的，窗可以跟着糊 —— 这是加分项，不必额外处理，只要开屏不要在大字还没对焦时把它露出来。

### 2.3 备选：mock 的 2D 画布叠层

只在「不想碰 shader」时用：把 grain.js 搬进一个 `BootGrain` 组件，画布 288×180 上采样，盖在 `#w-light` 上；结束前 200ms 淡出到真 `#w-light`。
- 优点：不改 light.js；mock 已验证。
- 缺点：两套流场构图必须逐像素对齐（真站流光在漂移、有 wind、鼠标交互），淡出那 200ms 会露馅；手机首帧建场 60–90ms 会顶掉开屏首帧。
- 若坚持这条路，建议**把真 `#w-light` 先隐藏，开屏结束时直接交还**，不做叠化；接缝靠「同构图 + 同配色 + 同一时刻」而不是靠淡出。

### 2.4 接管首页入场（二也要）

- 大字：开屏期加 `html[data-boot] .w-home-brand-box { animation: none; }`，由开屏时间轴写 `filter: blur()/opacity`（或写一个 CSS 变量，用 `@property` 插值），走完最后一拍交回 `w-ready` 的静置。
- 脑电线：把 `revealT0` 改成可注入（如 `window.__wanderBoot.line`，或 init 参数），开屏时间轴直接给 `reveal`；不要让它自己在幕后画完。
- 时刻 / 栏头 / 下沉：同理，开屏期用 `opacity` 压住，按时间轴放；`wander.js` 的其余入场本来就没有 CSS 动画，只需要开屏在收尾时把 opacity 归 1。

---

## 3. 五的接入方案（夜与星）

### 3.1 层与构图

- 开屏层 `position: fixed; inset: 0; z-index: 200; pointer-events: none; contain: strict;` 叠在 `.w-host` 之上（旧 bootveil 也是 200，层序不变）。
- 颜色/元素尽量从真站的材料里长出来：`#0e0f1d`、三池夜色、`--amber #9a86c4`、14° 轴、5px 网点；不新增纹理请求。
- 开屏期间首页照常初始化（`w-ready`、WebGL 编译、字体），只是被 layer 盖住；**不要**为了开屏去延迟首页的初始化——那会把开屏时长加到真正的可见时间上。
- 最后一拍：layer 的 opacity 到 0 / 或整层 `remove()`，屏幕上的东西**必须已经**是真首页的静置态（大字、线、栏头、时刻都在）。

### 3.2 接管入场

- `w-ready` 仍由 wander 加（它只控制大字 focus 的 CSS）；开屏期用 `html[data-boot]` 压制这条 CSS，改由开屏时间轴驱动；开屏结束时移除 `data-boot`，让 `w-ready` 那条规则接管（此时 `animation` 会重播！需要处理：加一个 `html.boot-revealed` 类，把 CSS 动画彻底关掉，或让开屏在最后一帧手动把 `filter/opacity` 写成静置态，再移除 `data-boot` 并加 `html[data-boot-done]` 抑制动画）。
- 线：同二的方案，`revealT0` / `reveal` 可注入；开屏给最后一段，别让它在幕底下演。
- `booted`：开屏「开始让出」的那一刻打上（对应旧 boot 的 T_OPEN），让 `reality.ts` 的入梦、Ave、Seam 等按原时序接上；**不要等到 layer 摘掉才打**——否则梦态大字会在最后一拍才开始变。
- 若开屏的最后一拍要接「梦态 AveritA」，需要把 `booted` 提前约 120ms（reality.ts 的 enterDream 延迟），或者在开屏里自己把 `data-morph` 文本先摆到梦态词。建议前者：更接近现有链路。

### 3.3 不放开屏 / 无 JS / 减弱动效

- `prefers-reduced-motion`、`xm-boot-seen`（非主页）、站内 View Transition：沿用 `BootVeil` 首帧前的内联判定，直接不加开屏层、直接打 `booted`（`boot.ts:55` 的现有兜底逻辑保留）。
- 无 JS：开屏层默认不出现（只在 JS 加 `data-boot` 后才显示），不要留死幕；`initBoot` 找不到元素时立刻 `booted`。
- 不要新增整屏 `mask` / `filter` / 大 `backdrop-filter`；所有运动尽量 `transform / opacity`。五的候选如果用了模糊光斑，用静态渐变 + opacity，不要逐帧重算。

---

## 4. 统一生命周期（两版共用）

```
[首帧前内联脚本]  判定放不放 → data-boot-skip（不放）/ 无标记（默认）
[很短：< 1 帧]    放：加 data-boot、建 layer（纯 CSS/SVG，不等任何资源）
[0 – T_reveal]    开屏演出；首页照常 init（w-ready、字体、shader 编译在幕下完成）
[T_reveal]        打 html.booted（reality 入梦 / Ave / Seam 接上）；首页开始揭幕
[T_reveal – T_end] 开屏层退开 / 淡出；首页入场由开屏时间轴或自身 CSS 接完
[T_end]           移除 layer、移除 data-boot；若用 shader grain，恢复到 GRAIN.home
```

时间建议：`T_reveal = 1450–1650ms`，`T_end = 1950–2250ms`（与旧版 1450 / 2350 同一量级；比旧版更快、且不等纹理）。
`boot.ts` 里现在的 1200ms 资源等待 + settle 全部可以删掉；新开屏从脚本执行到的第一帧就开始（但仍要等字体才启动文字入场，最多 1500ms，这点沿用 mock 的 `document.fonts.ready`）。

---

## 5. 验收清单（接入后逐条验）

- [ ] 首访主页：开屏 → 首页静置，中间没有一块颜色跳、没有一帧「遮罩撤掉的空夜」。
- [ ] 返主页（站内跳转）：走 View Transition 余像，**不**再放开屏（沿用 `BootVeil.astro:50-53`）。
- [ ] 子页：会话首访行为与现在一致；不放开屏的页面直接 `booted`。
- [ ] `prefers-reduced-motion: reduce`：不放开屏，首帧就是首页静置；无 JS：无死幕。
- [ ] 性能：新增网络请求 = 0；LCP 候选仍是首页大字（不能是开屏元素）；开屏期帧间隔中位 ≤ 17ms；主线程不出现新的长任务（shader 编译除外，它在开屏期）。
- [ ] 大字：开屏最后一拍是真首页的清晰态；梦态轮转在 `booted` 后按原时序开始；反相窗 `#w-win` 不落后（窗里的字形与字同步）。
- [ ] 脑电线：开屏最后一段接管 reveal，静置时与底部「下沉」/栏头位置不打架。
- [ ] 移动端 390×844：开屏层不产生横向滚动；touch 不被拦截（`pointer-events: none`）。
- [ ] 开屏结束 layer 从 DOM 摘掉（不留合成层、不留 `will-change`）。
- [ ] `npm run build` 通过；改到的 `.astro/.ts/.js` 有对应 `astro check` / 手测。

---

## 6. 参考

- 真首页截图：`design/mocks/boot/iter/_ref/real-home/.shots/`（README 见同目录）
- 旧版规范：`design/mocks/boot/_shared/BRIEF.md`
- 二的 mock：`design/mocks/boot/iter/2-grain/`（对比页 + NOTES 由 grain-iter 产出）
- 五的 mock：`design/mocks/boot/iter/5-night/`（对比页 + NOTES 由 night-iter 产出）
- 相关代码：`src/scripts/wander/light.js`、`wander.js`、`src/styles/wander.css`、`src/components/chrome/BootVeil.astro`、`src/scripts/boot.ts`、`src/scripts/reality.ts`、`src/scripts/brand.ts`

---

## 7. 2026-10-28 · 加载幕与开门条件（慢加载时看到的是发白空页，不是「没有开屏」）

**实测出来的问题**（`dist/` 用「把 .js 每次延迟 6s」的静态服务器托起来，headless Chrome 采样）：
0–4.6s 整页是浅灰 `#f0f3f6`。首页地面全靠 WebGL 流光，流光要等脚本与编译；开屏期 CSS 又把
`#w-light` 藏起来——于是那段时间是一张发白的空页，首页的字（`#ece8f2`）压在上面几乎看不见。
4.5s 的旧兜底还会在脚本到达前摘掉 `data-grain-boot`：先露出这版白页，脚本到了再放一次残缺开屏
（栅格层已 `display:none`、真界面没藏），然后写 `xm-boot-seen`——同会话再刷就不放了，只能用 `?grain=1`。
快网也一样：开屏前 1.2–1.9s 是浅灰空白。

**现在**：
- `src/pages/index.astro`（`<head>` 内联）：首帧前给 `<html>` 加 `data-boot-load`，并把一条
  `html[data-boot-load] #boot-load{display:block !important}` 追加进 `<head>`。元素的样式全内联，
  不等样式表；元素默认 `display:none`，无脚本时不会留一块永久纯色，所以盖住它要 `!important`。
  同时给 `html` 写夜色底色，样式表到之前也不白闪。兜底从「4.5s 破坏性摘幕」改成「12s 撤幕 +
  `window.__grainLate`」；撤幕时一并摘 `data-grain-boot`、补 `booted`。
- `src/components/chrome/GrainBoot.astro`：新增 `#boot-load`——`#0e0f1d` 纯色、`position:fixed`、
  `z-index:300`（高于 BootVeil 200 / 光标 240）、`pointer-events:none`；CSS 里只有撤幕的 0.26s
  opacity 过渡（RM 下关掉）。
- `src/scripts/grain-boot.ts`：撤幕时机＝开门条件——wander 就绪（≤6s）+ 流光编译完（≤4s）+
  字体到位（≤2.5s）。顺序是「先写开屏第 0 帧 → 再淡幕」，所以「纯色 → 一整块夜」之间没有空帧。
  不放演出的访问（RM / `?grain=0`）也走这道幕，只是等地面就绪就揭。
  `bail()` 不再写 `xm-boot-seen`——这次没放成，下次还放。
- `src/styles/wander.css`：`html.w-on[data-hour='home'] body{background:#0e0f1d}`。幕之后、流光之前
  的兜底地面（脚本起来了但流光没有时不再是浅灰）。没有脚本时不生效，目录照常可读。
- 验收口：`?grain=1` 已无必要（每次进主页都放，留着也无害）；`?grain=0` 不放演出、`?load=0` 连幕也不盖、`?grain-pause=1` 停在第 0 帧。

**实测（headless SwiftShader，1440×900，`dist/`）**：
- 正常网：0–1.2s 纯夜色幕 → 1.2s 流光就绪 → 1.75s 开屏起播（幕同帧开始淡）→ 3.3s 收场，`xm-boot-seen` 落盘。
- `.js` 每次延迟 2.5s：0–5.9s 纯夜色幕（不再发白）→ 6.1s 开屏 → 8.0s 收场。
- `.js` 每次延迟 6s：0–12s 纯夜色幕 → 12.4s 兜底撤幕、页面亮起、`__grainLate`＝true；13s 地面出现；
  迟到的脚本只补类、不再补放，`xm-boot-seen` 不写。

**取舍**：
1. 幕与开屏第 0 帧同色，淡出几乎看不出边界；以后要加「加载中」的内容，挂进 `#boot-load` 即可。
2. 开屏改为每次进主页都放（2026-10-28 同日，用户要求；`xm-boot-seen` 主页不再读，仍写给其它页的 BootVeil）；幕则是「加载未完成」时在。
3. 幕只挂在主页（GrainBoot）；其它页的会话首访开屏仍是旧的浅色 `BootVeil`。
4. 门里等字体最多 2.5s：字体慢不会让幕一直等；起播后字体到了栅格会再量一次（原逻辑）。
