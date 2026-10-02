/* ─────────────────────────────────────────────────────────────
   主页开屏 · 线景的地形离屏绘制（原型见 design/mocks/scene-linescape-notes.md）。
   全站那条脑电线（Eeg.astro 的 Worker）在开屏是地平线；这里在它下方画一整片
   「同一根线的回声」：一排排与地平线平行的线，按地面透视由远到近 ——
     · 远处（贴着地平线）线细、密、淡，波长被透视压短，几乎融进雾里；
     · 近处线粗、间距大、起伏大；画面下沿由画布上一张静止的 CSS 遮罩淡出。
   每一排的波形就是主线的那条算式（几何在 home-linescape-terrain.ts，与主线程共用），
   只是读得更晚：越近的一排相位越落后 ⇒ 波从地平线一排排传到眼前。
   近处的山脊遮住远处的线（destination-out 擦掉每排以下的一条带，擦到 9 成）。
   梦态：同一片地形换一种读法 —— 每排按格量化、零阶保持，起伏变成一级级台地。

   两个变体（天空里只留一样东西，且都与线有关）：
     · a「线圈 + 光」：同一根线绕成的一枚闭合大圆，下半截沉到地平线以下，
       近处的排从它前面经过、把它遮住；圆后一团柔光（CSS 预渲染），经过光里的线略被照亮。
       圆在地形上有倒影 —— 错开一截，且圆轻轻浮动时倒影纹丝不动。
     · b「回声飘起」：最远的几排越过地平线，继续向天空极淡地延伸、渐隐（蜃景）。
   锚点（等高线标注 / 测量点）：附近的波形压平；标注处线断开一小段，留给 DOM 上的小字。
   预算：30fps；行数 ≤ 34、步长按透视给、视口裁剪，一帧约 5–8k 点。
   绘制：这里只把每帧整理成绘制列表，真正落笔在 home-linescape-gl.ts（首选 WebGL2，退路 Canvas 2D）；
   GPU 跟不上时先降帧、再停在静帧（见下方「帧率与降级」）。
   ───────────────────────────────────────────────────────────── */

import {
  CALM,
  TAU,
  WAVE_AMP,
  cl,
  frameAt,
  hillAt,
  makeGeo,
  restPoint,
  orbOf,
  rowAt,
  rowsFor,
  sstep,
  waveAt,
  worldX,
  type Anchor,
  type Geo,
  type Orb,
} from './home-linescape-terrain';
import { Scene, make2d, makeGl, type Backend, type Grad } from './home-linescape-gl';
import { SLOT, slotWait } from './frame-slot';
import { drawRibs } from './home-linescape-ribs';

interface Colors {
  umber: string;
  amber: string;
  wake: string;
  dream: string;
}
/* 配色：醒 / 梦两端各一组 rgb（home-linescape.ts 的 PAL）；缺省沿用全站强调色 */
export interface Pal {
  nearW: number[];
  nearD: number[];
  farW: number[];
  farD: number[];
  lightW: number[];
  lightD: number[];
  accentD: number[];
}

type Msg =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      W: number;
      H: number;
      dpr: number;
      mobile: boolean;
      d: number;
      colors: Colors;
      still: boolean;
      origin: number;
      variant: 'a' | 'b';
      pal?: Pal | null;
    }
  | { type: 'size'; W: number; H: number; dpr: number; mobile: boolean }
  | { type: 'mix'; d: number; colors: Colors }
  /* xy ＝ 地平线（主线骨架，视口坐标）；fold ＝ 收拢度 0 展开 … 1 收回成单根线；
     boot ＝ 主线程揭幕时刻（performance.now，ms；NaN ＝ 还没揭幕）；anchors ＝ 锚点 */
  | { type: 'state'; xy: Float32Array; fold: number; boot: number; anchors: Anchor[] }
  /* 测量点激活：k / s ＝ 该点所在的排与弧长（k < 0 ＝ 收起）；pulse ＝ 这一下要不要散一圈涟漪 */
  | { type: 'focus'; k: number; s: number; pulse: boolean }
  /* 开屏姿态的地平线（静止形状）：穹肋按它画，只在尺寸变化时来一次 */
  | { type: 'rest'; xy: Float32Array }
  | { type: 'perf' }
  | { type: 'hidden'; hidden: boolean };

let canvas: OffscreenCanvas;
let pal: Pal | null = null;
let gfx: Backend | null = null;
const scene = new Scene();
let W = 0;
let H = 0;
let dpr = 1;
let mobile = false;
let variant: 'a' | 'b' = 'a';
let d = 0;
let colors: Colors;
let still = false;
let hidden = false;
let mainOrigin = 0;
let geo: Geo | null = null;
let orb: Orb | null = null;
let anchors: Anchor[] = [];
let fold = 0;
let boot = NaN;
let running = false;
let timer = 0;
let perfSum = 0;
let perfN = 0;
let perfMax = 0;
let NPT = 0; // 每帧点数（截图脚本读）

/* 测量点激活：那一排整条被点亮（淡入 / 淡出），点下去的那一下从点上散一圈涟漪 ——
   被透视压扁的环沿地形扩散，经过的线被轻轻顶起。都在这里随帧画，主线程只发一条消息 */
let hiK = -1;
let hiOn = false;
let hiT = -1e9;
let puK = -1;
let puS = 0;
let puT = -1e9;
const PULSE = 1.6; // s

/* 圆的回声圈：[向内收(px), 读波延迟(s), 波幅倍数, 不透明度倍数, 线宽, 偏向光色]
   主圈最实；内侧两圈细而淡、波更晚到，像同一根线在圆上绕了几次；最外一圈极淡、几乎不动，像光晕的边 */
const ORB_ECHO: [number, number, number, number, number, number][] = [
  [0, 0, 1, 1, 1, 0],
  [5, 0.6, 0.8, 0.55, 0.75, 0.3],
  [11, 1.3, 0.6, 0.32, 0.6, 0.6],
  [-7, 2.1, 0.35, 0.22, 0.6, 1],
];

/* 主线程时钟（ms）：入场节拍、波的秒针都与主线程（以及主线那个 Worker）对齐 */
const mainNow = () => performance.timeOrigin + performance.now() - mainOrigin;

function parse(c: string): number[] {
  const m = c.match(/\d+(\.\d+)?/g);
  if (c.startsWith('rgb') && m) return m.slice(0, 3).map(Number);
  const x = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const rgba = (c: number[], a: number) => [c[0], c[1], c[2], cl(a)];

/* 光的颜色：醒面一线冷蓝（不是白 —— 浅底上白线会直接消失），梦面琥珀 */
const LIGHT_W = [104, 128, 164];

/* 圆环倒影：沿地平线错开（视口宽的比例） */
const REFL_SLIP_D = 0.1;
const REFL_SLIP_M = 0.16;

function geoReady() {
  if (!xyLast) return;
  geo = makeGeo(W, H, mobile, xyLast);
  orb = variant === 'a' ? orbOf(geo) : null;
}
let xyLast: Float32Array | null = null;

/* 穹肋：两张静态离屏位图（醒 / 梦），尺寸变化时按开屏姿态的地平线重画一次（home-linescape-ribs.ts） */
let ribW: OffscreenCanvas | null = null;
let ribD: OffscreenCanvas | null = null;
let ribVer = 0;
let ribKey = '';
let xyRest: Float32Array | null = null;
function ribsReady() {
  if (!xyRest || !pal || variant !== 'a' || typeof OffscreenCanvas !== 'function') return;
  const k = `${W}x${H}@${dpr}|${mobile}|${Array.prototype.join.call(xyRest.subarray(0, 4))}`;
  if (k === ribKey) return;
  ribKey = k;
  const g = makeGeo(W, H, mobile, xyRest);
  const o = orbOf(g);
  ribW ??= new OffscreenCanvas(1, 1);
  ribD ??= new OffscreenCanvas(1, 1);
  drawRibs(ribW, g, o, dpr, 0, pal.nearW, pal.lightW);
  drawRibs(ribD, g, o, dpr, 1, pal.nearD, pal.lightD);
  ribVer++;
}

/* 某一排上的锚点：calm ＝ 压平系数（0 压平 … 1 原样），inGap ＝ 是否落在标注的断口里 */
function anchorAt(list: Anchor[], s: number): [number, boolean] {
  let calm = 1;
  let gap = false;
  for (const a of list) {
    const ds = s - a.s;
    calm *= 1 - Math.exp(-((ds / CALM) ** 2));
    if (a.gap > 0 && Math.abs(ds) < a.gap) gap = true;
  }
  return [calm, gap];
}

/* 把这一帧整理成绘制列表（画家顺序：远排先画，近排的擦除带盖掉它下面的远排） */
function build(now: number) {
  const S = scene;
  S.reset();
  NPT = 0;
  if (!geo || fold >= 0.999) return;
  const g = geo;
  S.nx = g.nx;
  S.ny = g.ny;

  const ph = now / 1000;
  const since = Number.isNaN(boot) ? -1 : (now - boot) / 1000;
  // 入场：线从中心往两端画出（约 1.3s）之后，地形从地平线一排排往下铺开
  const unfold = still ? 1 : since < 0 ? 0 : sstep((since - 1.05) / 2.4);
  const skyIn = still ? 1 : since < 0 ? 0 : sstep((since - 2.0) / 2.2);
  const open = 1 - sstep(fold);

  // 穹肋垫在最底下：入场随天空淡入，收拢时淡出（原 CSS --rib ＝ (1 − sstep(fold))²），醒梦交叉淡化
  if (ribW && ribD) {
    const ra = skyIn * open * open;
    S.ops.push({ t: 'img', src: ribW, ver: ribVer, a: ra * (1 - d) });
    S.ops.push({ t: 'img', src: ribD, ver: ribVer, a: ra * d });
  }

  const ink = pal ? mix(pal.nearW, pal.nearD, d) : parse(colors.umber);
  const far = pal ? mix(pal.farW, pal.farD, d) : mix(parse(colors.wake), parse(colors.dream), d);
  const amber = pal ? pal.accentD : parse(colors.amber);
  const light = pal ? mix(pal.lightW, pal.lightD, d) : mix(LIGHT_W, amber, d);

  const K = rowsFor(mobile);
  const f = [0, 0, 0, 0];
  const { nx, ny, tx, ty } = g;

  // 激活排的亮度（0 … 1）
  let hf = 0;
  if (hiK >= 0) {
    hf = still ? (hiOn ? 1 : 0) : hiOn ? sstep((now - hiT) / 600) : 1 - sstep((now - hiT) / 420);
    if (!hiOn && hf <= 0) hiK = -1;
  }
  // 涟漪：环的半径 / 起伏 / 环宽；环心 ＝ 点在静止地形上的位置
  const pt = (now - puT) / 1000;
  const rip = !still && puK >= 0 && pt >= 0 && pt < PULSE;
  let rR = 0;
  let rA = 0;
  let rpx = 0;
  let rpy = 0;
  if (rip) {
    const u = pt / PULSE;
    rR = 24 + (mobile ? 200 : 320) * (1 - (1 - u) ** 3);
    rA = 7 * (1 - u) ** 1.6;
    [rpx, rpy] = restPoint(g, puK, puS);
  }
  const RW = 34;
  const SQ = 2.6; // 透视压扁：法向距离放大 ⇒ 环在地面上是扁的

  /* ── a：圆环与它的倒影 ── */
  const orbPolys: number[] = [];
  let lightGrad: [number, number, number] | null = null;
  if (orb) {
    // 浮动只留极轻的呼吸（原 ±4px 显得晃）
    const bob = still ? 0 : Math.sin(ph * 0.33) * 1.2;
    const cx = orb.cx;
    const cy = orb.cy + bob - fold * 30;
    const R = orb.R;
    // 圆周 ＝ 同一根线：沿圆周的弧长当 u，波形与主线同一条算式；
    // 首尾按弧长线性交叉淡化（waveAt 不是 2π 周期的，直接绕一圈会在接缝处错开）
    const C = TAU * R;
    const U = C / 600;
    // 波幅压到主线的约三分之一：圆是远处的东西，只该微微颤
    const amp = WAVE_AMP * (0.22 + 0.36 * d);
    const n = Math.max(120, Math.round(C / 6));
    // 几圈回声：与地形一样是同一根线的回声 —— 向内依次收一点、读波更晚、更淡
    for (let j = 0; j < ORB_ECHO.length; j++) {
      const [dr, lag, ka] = ORB_ECHO[j];
      const pj = ph - lag;
      const rj = R - dr * (1 + d * 0.6);
      orbPolys.push(S.begin());
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * TAU;
        const u = (th / TAU) * U;
        const b = i / n;
        const w = ((1 - b) * waveAt(u, pj, amp) + b * waveAt(u - U, pj, amp)) * ka;
        const r = rj + w;
        S.add(cx + Math.cos(th) * r, cy + Math.sin(th) * r, i ? 2 : 1);
      }
      NPT += n;
    }
    lightGrad = [orb.cx, orb.cy, R * 1.45];

    // 倒影：圆心按地平线镜像（落到地面上按透视压扁），再沿地平线错开 —— 用的是不浮动的圆心
    const dist = (orb.cx - g.xy[0]) * nx + (orb.cy - g.xy[1]) * ny; // 负 ＝ 在地平线上方
    const slip = (mobile ? REFL_SLIP_M : REFL_SLIP_D) * W;
    const ex = R * 0.92;
    const ey = R * 0.24;
    S.ring = {
      x: orb.cx - 2.2 * dist * nx + tx * slip,
      y: orb.cy - 2.2 * dist * ny + ty * slip,
      rot: (14 * Math.PI) / 180,
      ox: ex + 4.5,
      oy: ey + 2.6,
      ix: Math.max(0.5, ex - 4.5),
      iy: Math.max(0.5, ey - 2.6),
    };
  }
  const drawOrb = () => {
    const base = (0.34 + 0.08 * d) * skyIn * open;
    orbPolys.forEach((p, j) => {
      const [, , , al, lw, lit] = ORB_ECHO[j];
      S.ops.push({ t: 'line', p, w: lw, c: rgba(mix(ink, light, 0.25 + lit * (0.3 + 0.4 * d)), base * al) });
    });
  };

  // 锚点按排分组
  const byRow = new Map<number, Anchor[]>();
  for (const a of anchors) {
    if (a.k < 0) continue;
    const l = byRow.get(a.k);
    if (l) l.push(a);
    else byRow.set(a.k, [a]);
  }

  for (let k = 0; k < K; k++) {
    if (orb && k === orb.kFront) drawOrb(); // 圆立在这一深度：更近的排从它前面经过
    const r = rowAt(g, k);
    const { t, p, hill, lag, width } = r;
    // 入场：远的先到，近的后到；收拢：所有排一起贴回地平线
    const ek = sstep(unfold * 1.6 - (k / (K - 1)) * 0.6);
    if (ek <= 0.001) continue;
    const o = r.o * ek * open;
    const A = r.A * (1 + 0.5 * d);
    const q = d * (1.2 + 7 * p); // 梦态量化格（px）
    // 雾：远处淡入地平线；整体再乘入场 / 收拢
    const fog = sstep((t - 0.1) / 0.42);
    const alpha = (0.08 + 0.66 * fog) * ek * open * open;
    if (alpha < 0.004) continue;
    const col = mix(far, ink, sstep(p * 1.6));
    const al = byRow.get(k) ?? [];

    const pi = S.begin();
    const p0 = S.np;
    let lastY = NaN;
    let minX = 1e9;
    let maxX = -1e9;
    let maxY = -1e9;
    /* 视口裁剪：每排近乎一条斜直线，只进出视口一次 —— 进之前的点只记住最后一个当起笔，
       出去之后再画一个点就收笔 */
    const M = 24;
    let inside = false;
    let px = 0;
    let py = 0;
    let pY = 0;
    let has = false;
    let pen = false; // 标注断口：抬笔
    const add = (X: number, Yv: number, draw: boolean) => {
      S.add(X, Yv, draw ? (pen ? 2 : 1) : 0);
      pen = draw;
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Yv > maxY) maxY = Yv;
    };
    let cur = 1;
    let s = 0;
    while (s <= g.len + r.step) {
      const ss = Math.min(s, g.len);
      cur = frameAt(g, ss, f, cur);
      const [calm, inGap] = al.length ? anchorAt(al, ss) : [1, false];
      const xw = worldX(g, r, ss);
      let y = waveAt(xw / 600, ph - lag, A) * calm - hillAt(g, r, xw);
      y *= ek * open;
      if (rip) {
        const Y0 = o + y;
        const ex = f[0] + f[2] * Y0 - rpx;
        const ey = f[1] + f[3] * Y0 - rpy;
        const dd = Math.hypot(ex * tx + ey * ty, (ex * nx + ey * ny) * SQ);
        y -= rA * Math.exp(-(((dd - rR) / RW) ** 2));
      }
      if (q > 0.3 && calm > 0.5) y = Math.round(y / q) * q;
      const Y = o + y;
      const X = f[0] + f[2] * Y;
      const Yv = f[1] + f[3] * Y;
      const inNow = X > -M && X < W + M && Yv > -M && Yv < H + M;
      if (inNow && !inside) {
        if (has) {
          add(px, py, true); // 入画前的最后一个点当起笔，线从画框外进来
          lastY = pY;
        }
        inside = true;
      }
      if (inside) {
        if (q > 0.3 && calm > 0.5 && !Number.isNaN(lastY) && Math.abs(Y - lastY) > 0.01) {
          // 梦态：零阶保持 —— 先沿旧高度走到这一格，再竖直落到新高度（台地）
          add(f[0] + f[2] * lastY, f[1] + f[3] * lastY, !inGap);
        }
        add(X, Yv, !inGap);
        lastY = Y;
        if (!inNow) break; // 出画：收笔
      }
      px = X;
      py = Yv;
      pY = Y;
      has = true;
      // 锚点附近步子收细（断口边缘与压平段要落得准）
      let near = false;
      for (const a of al) if (Math.abs(ss - a.s) < CALM * 2.2) near = true;
      s += near ? 3 : r.step;
    }
    if (S.np - p0 < 2) continue;
    NPT += S.np - p0;

    /* 遮挡：只擦本排以下一条带（厚度 ＝ 这一排可能的最大起伏 + 余量）—— 能被它挡住的
       也只有这条带里的远排（以及 a 里圆环沉下去的那半截） */
    S.ops.push({ t: 'band', p: pi, band: hill * 1.1 + A * 2.2 + 14, a: 0.9 * ek });

    // 描线：a 里经过圆后那团光的线略被照亮（以光心为圆心的径向渐变，越近越偏光色、略提亮）
    let grad: Grad | null = null;
    if (lightGrad && maxX > lightGrad[0] - lightGrad[2] && minX < lightGrad[0] + lightGrad[2]) {
      const [lx, ly, lr] = lightGrad;
      grad = {
        x: lx,
        y: ly,
        r: lr,
        s: [
          rgba(mix(col, light, 0.62), alpha * 1.25 + 0.06 * skyIn),
          rgba(mix(col, light, 0.3 * skyIn), alpha * 1.1),
          rgba(col, alpha),
        ],
      };
    }
    S.ops.push({ t: 'line', p: pi, w: width, c: rgba(col, alpha), g: grad });
    // 激活的那一排：整条换成光色、略粗（标注断口照旧留白）
    if (k === hiK && hf > 0.001)
      S.ops.push({ t: 'line', p: pi, w: width + 0.7, c: rgba(mix(ink, light, 0.55), (0.3 + 0.5 * hf) * hf * ek * open) });

    /* 倒影（a）：地形线穿过倒影环带的那几小段 —— 梦面被照亮（琥珀），醒面反而断开
       （只剩一圈空缺）。醒面没有异色（reality.ts 把 --amber 混成冷灰），倒影便以「缺席」出现 */
    if (S.ring && orb && skyIn > 0.01 && maxY > orb.cy && minX < orb.cx + orb.R * 3 && maxX > orb.cx - orb.R * 2) {
      S.ops.push({ t: 'line', p: pi, w: width + 1.2, c: [0, 0, 0, 0.92 * skyIn], ring: true, out: true });
      if (d > 0.02)
        S.ops.push({
          t: 'line',
          p: pi,
          w: width + 0.4,
          c: rgba(amber, Math.min(0.95, alpha * 1.3 + 0.2) * skyIn * d),
          ring: true,
        });
    }
  }
  if (orb && orb.kFront >= K) drawOrb();
  // 涟漪的环本身：极淡的一道光色细线，与地形的起伏同步扩散
  if (rip) {
    const u = pt / PULSE;
    const rot = Math.atan2(ty, tx);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const p = S.begin();
    const n = 96;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * TAU;
      const ex = Math.cos(th) * rR;
      const ey = (Math.sin(th) * rR) / SQ;
      S.add(rpx + ex * cr - ey * sr, rpy + ex * sr + ey * cr, i ? 2 : 1);
    }
    S.ops.push({ t: 'line', p, w: 0.8, c: rgba(light, 0.32 * (1 - u) ** 1.5 * open) });
  }
}

function paint(now: number) {
  if (!gfx) return;
  build(now);
  gfx.draw(scene);
}

/* ── 帧率与降级 ──
   常态约 30fps：与脑电 Worker 共用出帧时隙（frame-slot.ts），两张画布在同一个 vsync 上提交。
   若 GPU 跟不上（帧间隔长期 > 50ms ⇒ 不到 20fps），先降到约 15fps（隔一个时隙出一帧，仍与脑电同拍），
   仍跟不上就停在静帧：地形不再流动，只在滚动 / 醒梦 / 点按时重画一帧。
   揭幕后 4s 内（页面本身还在忙）与切回前台的那一帧不计 */
const PERIOD = [SLOT, 2 * SLOT];
let level = 0;
let lastT = 0;
let slowMs = 0;
let frozen = false;
function pace(t: number) {
  const dt = lastT ? t - lastT : 0;
  lastT = t;
  if (!dt || dt > 1000) return;
  const since = Number.isNaN(boot) ? -1 : (mainNow() - boot) / 1000;
  if (since < 4) return;
  slowMs = dt > 50 + PERIOD[Math.min(level, 1)] - SLOT ? slowMs + dt : Math.max(0, slowMs - dt);
  if (slowMs < 2000) return;
  slowMs = 0;
  level++;
  if (level >= 2) frozen = true;
}

function loop() {
  timer = 0;
  if (!running || frozen) return;
  if (!hidden) {
    const a = performance.now();
    pace(a);
    paint(mainNow());
    const ms = performance.now() - a;
    perfSum += ms;
    perfN++;
    if (ms > perfMax) perfMax = ms;
  }
  timer = setTimeout(() => {
    if (typeof self.requestAnimationFrame === 'function') self.requestAnimationFrame(loop);
    else loop();
  }, slotWait(PERIOD[Math.min(level, 1)])) as unknown as number;
}
function setRunning(on: boolean) {
  if (still || frozen) {
    running = on;
    paint(mainNow());
    return;
  }
  if (on === running) return;
  running = on;
  if (on) loop();
  else paint(mainNow()); // 收拢到底：画一帧空白就停
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    canvas = m.canvas;
    // 首选 WebGL2；拿不到（或建着色器出错）就退到 Canvas 2D
    try {
      gfx = makeGl(canvas);
    } catch {
      gfx = null;
    }
    if (!gfx)
      try {
        gfx = make2d(canvas);
      } catch {
        gfx = null;
      }
    if (!gfx) return;
    d = m.d;
    colors = m.colors;
    still = m.still;
    mainOrigin = m.origin;
    mobile = m.mobile;
    variant = m.variant;
    pal = m.pal ?? null;
    W = m.W;
    H = m.H;
    dpr = m.dpr;
    gfx.resize(W, H, dpr);
    return;
  }
  if (!gfx) return;
  if (m.type === 'size') {
    mobile = m.mobile;
    W = m.W;
    H = m.H;
    dpr = m.dpr;
    gfx.resize(W, H, dpr);
    geoReady();
    if (!running || frozen) paint(mainNow());
  } else if (m.type === 'focus') {
    const now = mainNow();
    if (m.k >= 0) {
      hiK = m.k;
      hiOn = true;
      hiT = now;
      if (m.pulse) {
        puK = m.k;
        puS = m.s;
        puT = now;
      }
    } else if (hiOn) {
      hiOn = false;
      hiT = now;
    }
    if (!running || frozen) paint(now);
  } else if (m.type === 'mix') {
    d = m.d;
    colors = m.colors;
    if (!running || frozen) paint(mainNow());
  } else if (m.type === 'state') {
    xyLast = m.xy;
    anchors = m.anchors ?? [];
    geoReady();
    fold = m.fold;
    boot = m.boot;
    setRunning(fold < 0.999);
    if (!running || frozen) paint(mainNow());
  } else if (m.type === 'rest') {
    xyRest = m.xy;
    ribsReady();
    if (!running || frozen) paint(mainNow());
  } else if (m.type === 'perf') {
    // 截图脚本用：报告并清零每帧绘制耗时（gl ＝ 是否走 WebGL2；level ＝ 降级档）
    self.postMessage({
      type: 'perf',
      pts: NPT,
      avg: perfN ? perfSum / perfN : 0,
      max: perfMax,
      n: perfN,
      gl: gfx?.kind === 'gl',
      level,
    });
    perfSum = 0;
    perfN = 0;
    perfMax = 0;
  } else if (m.type === 'hidden') {
    hidden = m.hidden;
    lastT = 0;
  }
};
