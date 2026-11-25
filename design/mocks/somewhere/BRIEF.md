# somewhere · 场景原型简报

**给五位并行的作者。只写 `design/mocks/somewhere/` 里你自己的文件，不要动别人的、不要动 `shell.*` / `light.js` / `server.cjs` / `shot.cjs`。**

---

## 这是什么

Traveritas 的个人站（Astro 纯静态，审美母题是《醒梦》：「在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？」——神秘 / 朦胧 / 安静 / 磨砂玻璃 / 大留白 / 低饱和微温）要在**首页检索页再往下**接一片新空间，地址 `/somewhere/`。到了这里，检索的三栏必须不存在了，只剩一片整的空间。用户要的是**一个可以做很多小交互、让访客玩半天、而且以后能随时往里加东西**的地方，参考 Cameron's World 的密度感，但**不要它的怀旧/Geocities/脏乱语法**——这个站是安静的。

这一轮**只做整体场景，不做小交互**。小东西之后再加。所以你要交付的是：从三栏转场进来之后，**这片空间本身长什么样、怎么动、怎么走**，完成度要高到可以直接上线的观感。

---

## 已经给你搭好的底子（直接用，不要重写）

`shell.js` 导出：

```js
import { initWorld, options, poisson, rng, clamp, lerp, ease, outQuart } from './shell.js';

const opt = options();            // 读地址参数：?arrive / ?arrive=900 / ?face=wake / ?px=4
const world = initWorld({
  canvas: document.getElementById('light'),
  themes: { sky: [c0,c1,c2,c3], band: [c0,c1,c2,c3], ground: [c0,c1,c2,c3] }, // 每色 [r,g,b] 0–1
  grain: [[抖动, 亮芯, 量化阶], …],   // 可选；默认 [0.9, 0.3, 26]
  horizon: 0.58,                     // 地平线在视口高度哪里
  autoArrive: opt.autoArrive,        // 截图用
  face: opt.face,
  px: opt.px,
  wind: false,                       // 上边那一带要不要那阵风
});
world.onFrame((s) => { /* 每帧 */ });
world.start();

world.project(x, y, z);  // → { x, y, s, blur, d }  屏幕位置、缩放、失焦量 0–1
world.cam;               // { x, y, z, vx, vy }，拖拽/滚轮已接好；z 越小越近
world.pointer;           // { x, y, nx, ny, inside, down }
world.vw / world.vh / world.horizonY;
```

- 背景是**正式站那支流光着色器**（`light.js` = `src/scripts/wander/light.js` 的副本），不能换。你只能换它的**三段调色**（`themes`）与像素格（`px`）。
- 转场：进来时是检索的样子（两条 14° 的缝分三栏），滚一下/上划/按方向键 → 两条缝收拢、转 90°，落成「天 / 地平线那一带光 / 地」，三栏消失。这一段已做好，你**不要重做**，只在转完之后接着画你的东西。
- `s.arrive` 是 0→1 的转场进度，转场期间请把自己的东西淡入或让它从远处浮上来。

## 运行与截图

```bash
node design/mocks/somewhere/server.cjs          # http://localhost:4640/somewhere/
node design/mocks/somewhere/shot.cjs s-A.html a "1500,4000,8000"   # → .shots/a-1.png …
SHOT_W=1440 SHOT_H=900 node …                   # 换视口
PORT=4660 node …                                # 并行跑时各人自选一个不冲突的端口（4640 会撞）
```

**交付前必须自己跑一遍截图并亲眼看过**：`.shots/<tag>.report.json` 里 `log` 必须为空（favicon 的 404 已处理）。至少要四张：转场中、转完、往里走之后、窄屏 390×844（`SHOT_W=390 SHOT_H=844`）。GL 是软件渲染（swiftshader），很慢，别指望 60fps，但也不要把页面做成一帧几百个 DOM。

---

## 五份场景（各自独立，互不参考期间不要偷看）

| 文件 | 方向 | 一句话 |
| --- | --- | --- |
| `s-A.html` | 远处的地形 | … |
| `s-B.html` | 靠近才成形 | … |
| `s-C.html` | 一条很长的路 | … |
| `s-D.html` | 可以往下沉 | … |
| `s-E.html` | 一处可以住进去的室内 | … |

（具体写在各人的 prompt 里）

## 硬约束

1. **同一个流光场**：背景只用 `shell.js` 给的 `initWorld`，不许自己再起第二个 WebGL context、不许换背景系统。你自己的东西画在它**上面**（DOM 或 canvas 都行，但一个 WebGL 就够了——要么用 DOM/Canvas2D，要么把 Three.js 摆进这个 canvas 之上时不许再建第二个 GL 上下文导致它掉帧）。
2. **安静**：这片空间不是游乐场。密度可以高，**颜色不许乱**——用低饱和、同一色族里的偏移，亮部很少。禁高饱和撞色、禁彩虹、禁渐变按钮、禁贴纸感。
3. **字体**：中文用 `Noto Serif SC`（已挂好 `--font-display`），小字用 `--font-mono`。**不要引入新字体**。
4. **文案红线**（来自仓库 `AGENTS.md`，逐条遵守）：
   - 禁「针、缝、穿针、针脚、八针、缝合」等生活化/手作语汇（注意：**缝线这个几何概念可以画，但不要用这个字去命名你的东西**）。
   - 禁直白出戏：「这是梦 / 你在做梦 / 快醒了 / 读起来像梦话」。
   - 禁官僚审计与财务台账词汇：「账目 / 台账 / 案号 / 待立项 / 构想条目 / 相关档案 / 可核验」。
   - 禁程序员中二：「白昼写代码，夜里构筑世界 / 活跃坐标 / 占用公网地址 / 代码变成落雪」。
   - 梦态可以浪漫空灵、可以有知觉悖论，但要纯净透明，不要阴暗猎奇。
5. **正文可读性**：真要有字的地方，字必须真的能看清（对比度够）；纯装饰层 `aria-hidden`。
6. **性能**：转场结束后稳态要轻。DOM 节点数控制在几百以内；远处的东西只是像素或低分辨率画布上的点，不要每个都给 DOM + filter。`prefers-reduced-motion` 下停掉自走动画（`shell.js` 已处理转场时长）。
7. **不许联网**：不许 CDN、不许 webfont 拉取。`three.min.js` 已 vendor 在 `/vendor/three.min.js`（r149），要用就用它。
8. **不许改 `src/`**。这一轮只在 `design/mocks/somewhere/` 里。

## 交付

一份 `s-X.html`（必要时配 `s-X.js` / `s-X.css`，都带上你的字母前缀）+ `.shots/` 里的截图 + 在 `docs/` 以外**不要**写文件。结束时报：做了什么、怎么走、哪里还差、截图路径、控制台是否干净。
