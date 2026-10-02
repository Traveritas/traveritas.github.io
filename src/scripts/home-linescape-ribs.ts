/* ─────────────────────────────────────────────────────────────
   主页 · 开屏穹肋（静态层）
   几道极大的弧从画面外来，向圆（顶眼）汇聚并溶进它的光里：观者站在一座看不全的穹顶里。
   原型见 design/mocks/scene-linescape-vault-notes.md。
   静态：尺寸变化时在地形 Worker 里画两张离屏位图（醒 / 梦各一张），之后不再重画；地形每帧把它们
   当贴图铺在最底下（醒梦按梦度交叉淡化、滚动收拢时淡出、入场随天空淡入）。
   原先是两张独立的全屏 DOM 画布，压在天空之上、雾 / 地平线微光 / 圆光之下 —— 首屏因此多两张全屏图层，
   合成器每出一帧都要多铺两遍整屏。并进地形画布后，它到了那三层之上，所以落笔时把那三层在每一处
   的遮挡（veilAt）乘进不透明度：被雾与光盖住多少，就照旧淡多少。
   每道肋是一条带：两条边线 ＋ 一条极淡的外侧回声（同一根线的回声），由画面边缘的宽收到顶眼处的零；
   边线带极弱的同源波纹（静止），梦面量化成台阶，呼应梦面地形。
   ───────────────────────────────────────────────────────────── */

import { WAVE_AMP, sstep, waveAt, type Geo, type Orb } from './home-linescape-terrain';

/* [起点 x, y, 控制点 x, y（视口比例；起点在画外或落在地平线上）, 起点带宽 px, 不透明度, 波纹相位]
   终点都是圆心。间距、弧度刻意不等分（两道头顶的肋向两侧不对称地鼓，免得成一束放射线） */
type Rib = [number, number, number, number, number, number, number];
const RIBS_D: Rib[] = [
  [0.05, 0.33, 0.4, -0.34, 20, 0.85, 0.3], // 左：脚落在远处地平线上，拱过问句上方，再落向顶眼
  [0.66, -0.32, 0.52, 0.02, 24, 1, 1.9], // 头顶偏左：向左鼓
  [1.0, -0.3, 1.12, 0.0, 22, 0.9, 3.1], // 头顶偏右：向右鼓
  [1.22, 0.02, 1.15, 0.3, 18, 0.8, 4.4], // 右上：向下兜，几乎横着进圆
  [1.16, 0.64, 1.02, 0.47, 12, 0.6, 5.6], // 右：贴着地平线上方进来
];
const RIBS_M: Rib[] = [
  [-0.2, 0.34, 0.15, 0.34, 12, 0.7, 0.3], // 左：从画外地平线附近起身，低低地拱向圆
  [1.06, -0.1, 0.97, 0.16, 16, 1, 1.9], // 头顶：从右上角画外进来，避开页头导航
  [1.3, 0.32, 1.06, 0.38, 14, 0.85, 3.1],
  [1.2, 0.52, 1.0, 0.46, 9, 0.6, 4.4],
];
/* 两条边线 ＋ 一条外侧回声：[法向位置（× 带宽）, 不透明度倍数, 波纹相位延迟] */
const EDGES: [number, number, number][] = [
  [-0.5, 1, 0],
  [0.5, 0.7, 0.9],
  [1.15, 0.28, 1.7],
];

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/* 分段线性的不透明度剖面：[[位置, 不透明度], …]，位置递增 */
function ramp(stops: [number, number][], t: number) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, a1] = stops[i];
    if (t <= t1) {
      const [t0, a0] = stops[i - 1];
      return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
    }
  }
  return stops[stops.length - 1][1];
}
/* 下面的几何与色标逐项照抄 new.astro 的 CSS（开屏 pos 0 时 --glow 的不透明度 .8）——改那边要一起改 */
const GLOW_A = 0.8;
const GLOW_BAND = ramp.bind(null, [
  [0, 0],
  [0.45, 0.6 * GLOW_A],
  [0.53, GLOW_A],
  [0.7, 0.35 * GLOW_A],
  [1, 0],
]);
const SUN = ramp.bind(null, [
  [0, 0.55],
  [0.34, 0.32],
  [0.64, 0.12],
  [1, 0],
]);
const T14 = (14 * Math.PI) / 180;

/** 在 (x, y) 处，原先压在穹肋之上的三层（.atmo 两团雾、.ls-glow、.ls-sun）合起来剩下多少透光（1 ＝ 不遮），
    再除以地形画布底部那张遮罩（.ls-canvas 的 mask-image）—— 穹肋现在画在那张画布里，要把它抵回来 */
function veilAt(x: number, y: number, W: number, H: number, o: Orb) {
  const vm = Math.max(W, H) / 100;
  // 雾（.f1 左上、.f2 右下）：closest-side 径向渐变 --glow → 透明
  const fog = (cx: number, cy: number, rx: number, ry: number) =>
    GLOW_A * Math.max(0, 1 - Math.hypot((x - cx) / rx, (y - cy) / ry));
  const f1 = fog(15 * vm, 13 * vm, 35 * vm, 25 * vm);
  const f2 = fog(W - 8 * vm, H - 8 * vm, 30 * vm, 22 * vm);
  // 地平线微光：过视口中心、转 14° 的一条宽 26svh 的带，带内自上而下的渐变
  const v = ((x - W / 2) * -Math.sin(T14) + (y - H / 2) * Math.cos(T14)) / (0.26 * H) + 0.5;
  const glow = v > 0 && v < 1 ? GLOW_BAND(v) : 0;
  // 圆光：边长 3R 的方块里 closest-side 的径向渐变，地平线以下由 194° 的线性遮罩收掉
  const rr = Math.hypot(x - o.cx, y - o.cy) / (1.5 * o.R);
  let sun = 0;
  if (rr < 1) {
    const dx = Math.sin((194 * Math.PI) / 180);
    const dy = -Math.cos((194 * Math.PI) / 180);
    const t = 0.5 + ((x - o.cx) * dx + (y - o.cy) * dy) / (3 * o.R * (Math.abs(dx) + Math.abs(dy)));
    sun = SUN(rr) * (t < 0.51 ? 1 : t > 0.595 ? 0 : 1 - (t - 0.51) / 0.085);
  }
  const yr = y / H;
  const mask = yr < 0.58 ? 1 : 1 - (0.88 * (yr - 0.58)) / 0.42;
  return ((1 - f1) * (1 - f2) * (1 - glow) * (1 - sun)) / Math.max(0.12, mask);
}

/** 把一面（d：0 醒 / 1 梦）的穹肋画进离屏位图（尺寸 ＝ 视口 × dpr）。ink / light 为该面的线色与光色（rgb） */
export function drawRibs(cv: OffscreenCanvas, g: Geo, o: Orb, dpr: number, d: number, ink: number[], light: number[]) {
  const { W, H, mobile, nx, ny } = g;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.lineCap = 'round';
  const col = mix(mix(ink, light, 0.45), light, 0.35 * d);
  const lw = 0.6 + 0.25 * d;
  const q = d * 1.6;
  const amp = WAVE_AMP * 0.3;
  const hx = g.xy[0];
  const hy = g.xy[1];
  // 每段各有自己的不透明度与向光色；按（不透明度, 向光度）分桶攒成少数几条路径再描，免得几千次 stroke
  const buckets = new Map<string, Path2D>();
  const seg = (x0: number, y0: number, x1: number, y1: number, a: number, lit: number, thin: boolean) => {
    const k = `${Math.round(a * 64)}|${Math.round(lit * 6)}|${thin ? 1 : 0}`;
    let p = buckets.get(k);
    if (!p) buckets.set(k, (p = new Path2D()));
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
  };
  for (const [sx, sy, qx, qy, w0, al, phs] of mobile ? RIBS_M : RIBS_D) {
    const S = [sx * W, sy * H];
    const E = [o.cx, o.cy];
    const Q = [qx * W, qy * H];
    const L = Math.hypot(Q[0] - S[0], Q[1] - S[1]) + Math.hypot(E[0] - Q[0], E[1] - Q[1]);
    const n = Math.max(80, Math.round(L / 5));
    // 脚落在画内（地平线上）的肋：脚远而细，拱顶处最近最宽；从画外来的肋：画面边缘最宽
    const footIn = S[0] > 0 && S[0] < W && S[1] > 0 && S[1] < H;
    const prof = (t: number) =>
      footIn ? Math.min(1, 1.6 * Math.pow(Math.sin(Math.PI * t * 0.75), 0.9) * (1 - 0.7 * t)) : Math.pow(1 - t, 1.25);
    const P: number[] = [];
    const N: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const e = t * t;
      P.push(a * S[0] + b * Q[0] + e * E[0], a * S[1] + b * Q[1] + e * E[1]);
      const tx = 2 * (1 - t) * (Q[0] - S[0]) + 2 * t * (E[0] - Q[0]);
      const ty = 2 * (1 - t) * (Q[1] - S[1]) + 2 * t * (E[1] - Q[1]);
      const tl = Math.hypot(tx, ty) || 1;
      N.push(-ty / tl, tx / tl);
    }
    for (const [side, ka, lag] of EDGES) {
      let px = 0;
      let py = 0;
      let s = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x0 = P[2 * i];
        const y0 = P[2 * i + 1];
        if (i) s += Math.hypot(x0 - P[2 * i - 2], y0 - P[2 * i - 1]);
        const taper = prof(t);
        let wv = waveAt(s / 600, phs - lag, amp) * taper;
        if (q > 0.3) wv = Math.round(wv / q) * q;
        const off = side * w0 * taper + wv;
        const x = x0 + N[2 * i] * off;
        const y = y0 + N[2 * i + 1] * off;
        // 不透明度：画面边缘最实、向顶眼渐隐；进入圆的光里溶掉；地平线以下沉进雾；脚边也轻轻被雾吃掉
        const r = Math.hypot(x0 - o.cx, y0 - o.cy);
        const toEye = sstep((r - o.R * 0.98) / (o.R * 0.38));
        const below = (x0 - hx) * nx + (y0 - hy) * ny; // 正 ＝ 地平线以下
        const fogd = below > 0 ? Math.exp(-below / 30) : 1;
        const nearFoot = below > -40 ? 0.45 + 0.55 * sstep(-below / 40) : 1;
        const a = Math.min(
          1,
          0.42 * al * ka * (0.35 + 0.65 * (footIn ? taper : 1 - t)) * toEye * fogd * nearFoot * (1 - 0.2 * d) * veilAt(x, y, W, H, o),
        );
        if (i && a > 0.003) seg(px, py, x, y, a, 1 - toEye, ka < 0.5);
        px = x;
        py = y;
      }
    }
  }
  for (const [k, p] of buckets) {
    const [a, lit, thin] = k.split('|').map(Number);
    const cc = mix(col, light, (lit / 6) * 0.6);
    c.strokeStyle = `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${(a / 64).toFixed(3)})`;
    c.lineWidth = lw * (thin ? 0.8 : 1);
    c.stroke(p);
  }
}
