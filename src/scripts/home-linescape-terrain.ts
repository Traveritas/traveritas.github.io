/* ─────────────────────────────────────────────────────────────
   主页开屏 · 线景的地形几何（Worker 与主线程共用）。
   Worker 用它逐帧画地形；主线程只在尺寸变化时用它算一次「锚点」——
   等高线标注（23:07 / 06:31）与测量点（版块入口）钉在哪一排、哪一处。
   锚点附近的波形被压平（calm），所以静止地形算出来的位置就是线实际所在：
   DOM 上的点与小字不必跟着波逐帧挪。
   ───────────────────────────────────────────────────────────── */

/* ── 与 eeg-wave.ts 同一条算式（主波的四个原始参数） ── */
export const TAU = Math.PI * 2;
const AMP = 3.6;
const FREQ = 0.5;
const SPD = 2.6;
export const waveAt = (u: number, ph: number, A: number) =>
  Math.sin(u * FREQ * TAU + ph * SPD) * A + Math.sin(u * FREQ * 2.7 + ph * 1.3) * A * 0.4;
export const WAVE_AMP = AMP;

export const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const sstep = (t: number) => {
  const u = cl(t);
  return u * u * (3 - 2 * u);
};

/* 透视：第 k 排的 t ∈ [T0, 1]，法向偏移 o ＝ Rm·t^G（远密近疏），透视比例 p ＝ t^G */
export const T0 = 0.1;
export const G = 2.7;
export const rowsFor = (mobile: boolean) => (mobile ? 20 : 24);

/* 缓丘：世界横坐标（视口宽的比例，0 ＝ 地平线中点）/ 半宽 / 所在的排（t） */
const MOUND_X = 0.12;
const MOUND_W = 0.3;
const MOUND_T = 0.5;

export interface Geo {
  W: number;
  H: number;
  mobile: boolean;
  xy: Float32Array;
  L: Float32Array;
  len: number;
  c: number; // 弧长中点
  Rm: number; // 地平线以下要铺到的最远法向距离
  tx: number; // 骨架首尾方向
  ty: number;
  nx: number; // 法线（朝下）
  ny: number;
}

export function makeGeo(W: number, H: number, mobile: boolean, xy: Float32Array): Geo {
  const n = xy.length / 2;
  const L = new Float32Array(n);
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(xy[2 * i] - xy[2 * i - 2], xy[2 * i + 1] - xy[2 * i - 1]);
  const ax = xy[0];
  const ay = xy[1];
  const dx = xy[2 * n - 2] - ax;
  const dy = xy[2 * n - 1] - ay;
  const l = Math.hypot(dx, dy) || 1;
  const tx = dx / l;
  const ty = dy / l;
  const nx = -ty;
  const ny = tx;
  let m = 0;
  for (const [x, y] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ])
    m = Math.max(m, (x - ax) * nx + (y - ay) * ny);
  return { W, H, mobile, xy, L, len: L[n - 1], c: L[n - 1] / 2, Rm: m * 1.04, tx, ty, nx, ny };
}

/** 骨架上弧长 s 处的点与法线 → out[0..3]；cur ＝ 游标（弧长单调递增时只往前走），返回新游标 */
export function frameAt(g: Geo, s: number, out: number[], cur = 1): number {
  const { xy, L } = g;
  const last = L.length - 1;
  if (cur > last || L[cur - 1] > s) cur = 1;
  while (cur < last && L[cur] < s) cur++;
  const j = cur;
  const i0 = j - 1;
  const seg = L[j] - L[i0] || 1;
  const t = cl((s - L[i0]) / seg);
  const dx = xy[2 * j] - xy[2 * i0];
  const dy = xy[2 * j + 1] - xy[2 * i0 + 1];
  const l = Math.hypot(dx, dy) || 1;
  out[0] = xy[2 * i0] + dx * t;
  out[1] = xy[2 * i0 + 1] + dy * t;
  out[2] = -dy / l;
  out[3] = dx / l;
  return cur;
}

export interface Row {
  t: number;
  p: number;
  o: number; // 静止时的法向偏移
  A: number; // 回声摆幅
  hill: number;
  lag: number;
  zw: number;
  step: number;
  width: number;
}

export function rowAt(g: Geo, k: number): Row {
  const K = rowsFor(g.mobile);
  const t = T0 + ((1 - T0) * k) / (K - 1);
  const p = Math.pow(t, G);
  return {
    t,
    p,
    o: g.Rm * p,
    A: (g.mobile ? 16 : 22) * p,
    hill: (g.mobile ? 64 : 118) * p,
    lag: 0.35 + 2.4 * p, // 越近读得越晚（秒）
    zw: t * 12, // 地势的纵向坐标按排走 ⇒ 山脊斜穿过排
    // 步长按这一排的屏上波长给（主波周期在世界里是 1200px，透视后 ×p）：一个周期 ≥12 个点
    step: cl(100 * p, 5, 22),
    width: 0.42 + 0.82 * Math.pow(p, 0.7),
  };
}

/** 地势（正 ＝ 隆起，画的时候取负 ⇒ 朝地平线方向抬起） */
export function hillAt(g: Geo, r: Row, xw: number): number {
  return (
    r.hill *
    (0.5 * Math.pow(0.5 + 0.5 * Math.sin(xw * 0.0011 + r.zw * 0.42 + 0.6), 1.8) +
      0.26 * Math.pow(0.5 + 0.5 * Math.sin(xw * 0.0027 - r.zw * 0.75 + 2.1), 2.2) +
      0.07 * Math.sin(xw * 0.0069 + r.zw * 1.6) +
      // 中景偏右一座缓丘
      1.25 * Math.exp(-(((xw - MOUND_X * g.W) / (MOUND_W * g.W)) ** 2) - ((r.t - MOUND_T) / 0.17) ** 2))
  );
}

export const worldX = (g: Geo, r: Row, s: number) => (s - g.c) / Math.max(0.05, r.p);

/* ── 锚点：钉在某一排上的一处（标注 / 测量点） ── */
export interface Anchor {
  k: number; // 第几排（-1 ＝ 地平线本身）
  s: number; // 沿骨架的弧长
  x: number; // 静止时的视口坐标
  y: number;
  gap: number; // >0 ＝ 线在此断开的半宽（标注）；0 ＝ 只压平不断开（测量点）
}

/** 锚点附近波形压平的半宽（px） */
export const CALM = 64;

/** 某一排在弧长 s 处的静止位置（波形压平、无量化） */
export function restPoint(g: Geo, k: number, s: number): [number, number] {
  const f = [0, 0, 0, 0];
  frameAt(g, s, f);
  if (k < 0) return [f[0], f[1]];
  const r = rowAt(g, k);
  const Y = r.o - hillAt(g, r, worldX(g, r, s));
  return [f[0] + f[2] * Y, f[1] + f[3] * Y];
}

/** 找一处离目标点 (X, Y) 最近的线：k ＝ -1 只在地平线上找；否则在 [k0, k1] 排里挑 */
export function findAnchor(g: Geo, X: number, Y: number, gap: number, k0 = -1, k1 = -1): Anchor {
  let best: Anchor = { k: -1, s: 0, x: 0, y: 0, gap };
  let bd = Infinity;
  const ks: number[] = [];
  if (k0 < 0) ks.push(-1);
  else for (let k = k0; k <= k1; k++) ks.push(k);
  for (const k of ks) {
    // 先按直线骨架估一个 s，再在附近细扫
    const o = k < 0 ? 0 : rowAt(g, k).o;
    const s0 = (X - g.xy[0] - g.nx * o) / (g.tx || 1);
    for (let s = s0 - 60; s <= s0 + 60; s += 2) {
      if (s < 0 || s > g.len) continue;
      const [x, y] = restPoint(g, k, s);
      const d = (x - X) ** 2 * 0.15 + (y - Y) ** 2;
      if (d < bd) {
        bd = d;
        best = { k, s, x, y, gap };
      }
    }
  }
  return best;
}

/* ── 天体（v=a）：同一根线绕成的一枚闭合大圆，下半截沉到地平线以下 ── */
export interface Orb {
  cx: number;
  cy: number;
  R: number;
  kFront: number; // 从这一排起（含）在圆之前经过、遮住它
}
export function orbOf(g: Geo): Orb {
  const R = g.mobile ? g.W * 0.31 : g.W * 0.15;
  const fx = g.mobile ? 0.66 : 0.745;
  // 圆心：地平线上 fx 处，再沿法线往天上抬 0.3R
  const s0 = (fx * g.W - g.xy[0]) / (g.tx || 1);
  const f = [0, 0, 0, 0];
  frameAt(g, s0, f);
  const cx = f[0] - g.nx * 0.3 * R;
  const cy = f[1] - g.ny * 0.3 * R;
  // 最先从圆前面经过的那一排：静止偏移 ≈ 0.32R（圆的下半截大半被它和更近的排挡住）
  const K = rowsFor(g.mobile);
  let kFront = K;
  for (let k = 0; k < K; k++)
    if (rowAt(g, k).o >= 0.32 * R) {
      kFront = k;
      break;
    }
  return { cx, cy, R, kFront };
}
