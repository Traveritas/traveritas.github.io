/* ─────────────────────────────────────────────────────────────
 somewhere · r-D · 印在纸上

 整间屋子印在一张纸上：梦线以下是铜版画式的交叉排线，
 梦线以上只有流光——纸还在，只是那一半没上墨。

 排线不是纹理，是明暗。每一根线都钉在墙上（世界坐标 → 透视），
 方向跟着结构走：
   · 墙 —— 竖线（平行于墙角竖棱），墙角两侧加密，往下加密；
           墙脚那一段再加一层横线（平行于墙与地的交线）和一层斜线，
           于是最暗的地方是「交叉排线」，不是「一片黑」。
   · 地 —— 横线（平行于后墙），越往远处收得越紧；靠墙根与四角补竖线。
   · 顶 —— 两族正交的线按格的形状排，最暗，但留了一块擦版没擦净的浅区。
 ───────────────────────────────────────────────────────────── */
import { initFlow, options, clamp } from './shell2.js';
import { createRoom } from './room.js';
import { createApproach } from './approach.js';

const opt = options();
const DBG = new URLSearchParams(location.search).get('dbg') || '';

/* ══ 一套色：冷靛、略偏灰紫，亮芯压得很低（分区在这里不存在） ══ */
const theme = [
  [0.042, 0.044, 0.071],
  [0.088, 0.09, 0.136],
  [0.2, 0.195, 0.278],
  [0.56, 0.53, 0.64],
];

const flow = initFlow({
  canvas: document.getElementById('light'),
  theme,
  grain: [0.78, 0.26, 30],
  face: opt.face,
  px: opt.px,
  autoArrive: opt.autoArrive,
  dur: 3000,
});

const room = createRoom({ autoArrive: opt.autoArrive, dur: 3000, dream: 0.44 });
const approach = createApproach(document.body);
const stat = document.getElementById('stat');

/* ══════════════════════════════════════════════════════════════
   一 · 相机

   room.js 只给投影好的屏幕多边形，不给相机姿态。排线要钉在墙上，就必须知道
   「屏幕上这一点是哪一米的墙」，于是把视角反解回来。

   世界点的相机空间坐标（与 room.js 的 cam() 同一式，ψ 偏航、φ 俯仰）：
     x0 = x·s ,  y0 = y·s + oy − eye ,  z0 = z·s + oz
     x1 = x0·cosψ + z0·sinψ
     z1 = −x0·sinψ + z0·cosψ
     y' = y0·cosφ + z1·sinφ
     z' = −y0·sinφ + z1·cosφ
   盒子由小到大的过程里 s / oy / oz 已知（与 room.js 的 setSink 同式）。

   初始姿态直接取自 URL（room.js 的开场视角是 phase = 45°，每站 +90°），
   之后只做局部跟踪：视角是连续变的，局部搜索又快又不会跳到对称解上。
   ══════════════════════════════════════════════════════════════ */
const EYE = 1.34;
const NPL = 0.055;
const PHASE = Math.PI / 4;
const STEP = Math.PI / 2;

const CAM = {
  s: 1, oy: 0, oz: 0,
  co: 1, so: 0, cp: 1, sp: 0,
  yaw: PHASE, pitch: 0,
  F: 600, cx: 0, cy: 0,
  ok: false, lost: 0,
};

function initPose() {
  const q = new URLSearchParams(location.search);
  const v = +(q.get('view') || 0);
  CAM.yaw = PHASE + (v >= 1 && v <= 4 ? (v - 1) * STEP : 0);
  CAM.pitch = q.get('look') === 'up' ? 52 * (Math.PI / 180) : 0;
  setPose(CAM.yaw, CAM.pitch);
}

function boxAt(sink) {
  const k = 1 - sink;
  return { s: 0.46 + 0.54 * sink, oy: -0.9 * k, oz: -6.2 * k };
}

const vtmp = [0, 0, 0];

/* 世界 → 相机空间（与 room.js 的 cam() 同一式） */
function toView(p, out) {
  const x0 = p[0] * CAM.s;
  const y0 = p[1] * CAM.s + CAM.oy - EYE;
  const z0 = p[2] * CAM.s + CAM.oz;
  const x1 = x0 * CAM.co + z0 * CAM.so;
  const z1 = -x0 * CAM.so + z0 * CAM.co;
  out[0] = x1;
  out[1] = y0 * CAM.cp + z1 * CAM.sp;
  out[2] = -y0 * CAM.sp + z1 * CAM.cp;
  return out;
}

function setPose(yaw, pitch) {
  CAM.yaw = yaw;
  CAM.pitch = pitch;
  CAM.co = Math.cos(yaw);
  CAM.so = Math.sin(yaw);
  CAM.cp = Math.cos(pitch);
  CAM.sp = Math.sin(pitch);
}

/* 房间上的角点：八个体角（地/顶）加八处梦线端点。
   房间左右对称、前后不等（2W ≠ 2D），这组点把视角钉得住。 */
let CAND = [];
let CANDKEY = '';
function buildCand(W, H, D, Y) {
  const key = `${W.toFixed(3)}|${H}|${D.toFixed(3)}|${Y.toFixed(3)}`;
  if (key === CANDKEY) return;
  CANDKEY = key;
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, Y, H]) out.push([sx * W, y, sz * D]);
  CAND = out;
}

let verts = new Float32Array(512);
let nv = 0;

function gatherVerts(faces) {
  let k = 0;
  for (const f of faces) {
    for (let q = 0; q < 2; q++) {
      const poly = q ? f.above : f.below;
      for (let i = 0; i < poly.length; i++) {
        if (k > verts.length - 2) {
          nv = k;
          return;
        }
        verts[k++] = poly[i].x;
        verts[k++] = poly[i].y;
      }
    }
  }
  nv = k;
}

/* 残差：先用「相机空间里落在这一面背后的点」判退化。
   贴近平面（|z'| 很小）的面，投影会被放大到荒唐的数，这种解一律不要。
   然后在 16 个角点上算「投影点 ↔ 多边形顶点」的距离。 */
let PENALTY = 0;
function residual() {
  /* 1) 退化检查：房间的每一面都必须真的在相机前方附近 */
  let deg = 0;
  for (const w of CAND) {
    toView(w, vtmp);
    if (Math.abs(vtmp[2]) < 0.28) deg++;
  }
  PENALTY = deg * 3;
  if (deg) return 1e6 + deg;

  let sum = 0;
  for (let c = 0; c < CAND.length; c++) {
    toView(CAND[c], vtmp);
    const d = -vtmp[2];
    if (d < 0.12) continue;
    const sx = CAM.cx + (vtmp[0] * CAM.F) / d;
    const sy = CAM.cy - (vtmp[1] * CAM.F) / d;
    if (Math.abs(sx) > 1e5 || Math.abs(sy) > 1e5) return 1e6;
    let m = 1e18;
    for (let i = 0; i < nv; i += 2) {
      const dx = verts[i] - sx;
      const dy = verts[i + 1] - sy;
      const dd = dx * dx + dy * dy;
      if (dd < m) m = dd;
    }
    m = Math.sqrt(m);
    sum += m < 20 ? m : 20;
  }
  return sum;
}

function descend(yaw, pitch, step, rounds, radius) {
  let by = yaw;
  let bp = pitch;
  setPose(by, bp);
  let best = residual();
  let st = step;
  for (let r = 0; r < rounds; r++) {
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        if (!i && !j) continue;
        setPose(by + i * st, bp + j * st);
        const sc = residual();
        if (sc < best - 1e-4) {
          best = sc;
          by += i * st;
          bp += j * st;
        }
      }
    }
    st *= 0.45;
  }
  setPose(by, bp);
  return best;
}

/* 丢了一圈：粗扫一遍再收 */
function rescan() {
  let best = 1e18;
  let by = CAM.yaw;
  let bp = CAM.pitch;
  for (let i = 0; i < 24; i++) {
    const y = (i / 24) * Math.PI * 2 - Math.PI;
    for (let j = 0; j <= 8; j++) {
      const p = -0.18 + (j / 8) * 1.16;
      setPose(y, p);
      const sc = residual();
      if (sc < best) {
        best = sc;
        by = y;
        bp = p;
      }
    }
  }
  setPose(by, bp);
  descend(by, bp, 0.16, 5, 1);
}

function solveCam(W, H, D, Y, F, vw, vh) {
  CAM.F = F;
  CAM.cx = vw / 2;
  CAM.cy = vh / 2;
  buildCand(W, H, D, Y);
  if (!nv) return;
  if (!CAM.ok) initPose(), (CAM.ok = true);
  const r0 = descend(CAM.yaw, CAM.pitch, 0.02, 2, 1);
  if (r0 > 3.2) {
    CAM.lost++;
    if (CAM.lost > 2) {
      rescan();
      CAM.lost = 0;
    }
  } else {
    CAM.lost = 0;
  }
}

/* ══════════════════════════════════════════════════════════════
   二 · 纸

   一张静态纹理，随窗口重建。它只落在「纸」的范围里（梦线以下的墙与地、
   以及天花板），所以读起来是纸面，不是盖在整张画面上的滤镜。
   ══════════════════════════════════════════════════════════════ */
let TEX = null;
let TEXW = 0;
let TEXH = 0;

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTex(pw, ph) {
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const x = c.getContext('2d');
  const img = x.createImageData(pw, ph);
  const d = img.data;
  const rand = mulberry(20261103);

  /* 低频的厚薄（纸本身不匀）：用一个粗格插值出来 */
  const lw = Math.max(6, Math.round(pw / 46));
  const lh = Math.max(5, Math.round(ph / 46));
  const low = new Float32Array((lw + 2) * (lh + 2));
  for (let i = 0; i < low.length; i++) low[i] = rand();
  const sampleLow = (u, v) => {
    const fx = u * lw;
    const fy = v * lh;
    const ix = Math.min(lw, Math.max(0, Math.floor(fx)));
    const iy = Math.min(lh, Math.max(0, Math.floor(fy)));
    const tx = fx - ix;
    const ty = fy - iy;
    const i0 = iy * (lw + 2) + ix;
    const a = low[i0] + (low[i0 + 1] - low[i0]) * tx;
    const b = low[i0 + lw + 2] + (low[i0 + lw + 3] - low[i0 + lw + 2]) * tx;
    return a + (b - a) * ty;
  };

  for (let y = 0; y < ph; y++) {
    const v = y / ph;
    for (let i = 0; i < pw; i++) {
      const u = i / pw;
      const o = (y * pw + i) * 4;
      /* 细颗粒：纸纤维。亮的是纸面起毛，暗的是纤维之间的凹 */
      const fine = rand() - 0.5;
      /* 粗的云：整张纸的厚薄不匀 */
      const cloud = sampleLow(u * 1.8, v * 1.8) - 0.5;
      const g = fine * 0.6 + cloud * 0.9;
      if (g > 0) {
        d[o] = 152;
        d[o + 1] = 154;
        d[o + 2] = 184;
        d[o + 3] = Math.min(20, g * 56);
      } else {
        d[o] = 8;
        d[o + 1] = 9;
        d[o + 2] = 17;
        d[o + 3] = Math.min(30, -g * 86);
      }
    }
  }
  x.putImageData(img, 0, 0);
  TEX = c;
  TEXW = pw;
  TEXH = ph;
}

/* ══════════════════════════════════════════════════════════════
   三 · 墨

   浓度的唯一来源：0 = 纸（没上墨），1 = 实黑。
   线的疏密（间距）与线的轻重都从这里出来，于是六个面是同一支笔。
   ══════════════════════════════════════════════════════════════ */
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash2(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}
/* 版子没擦净：低频的浓淡。手印的纸不会处处一样 */
const mottle = (t, v, k) => 0.84 + 0.36 * vnoise(t * k + 3.1, v * k + 7.7);

/* 光从左上来：右墙迎着光、左墙背光。四个面各差一点 */
const BIAS = { back: 1.0, front: 0.88, right: 0.84, left: 1.1 };

/* 墙。u：0 在墙脚，1 在梦线；t：沿墙 0→1（两端是墙角） */
function inkWall(u, t, bias) {
  if (u < 0) u = 0;
  const g1 = 1 - clamp(u, 0, 1);
  /* 底子：越往下越沉 */
  let d = 0.035 + 0.5 * g1 * g1 * g1;
  /* 墙脚：墙与地的交界，全屋最实的一道 */
  d += 0.55 * Math.exp(-(((u - 0.07) / 0.075) ** 2));
  /* 墙角：这一项让线在角两侧密起来——「墙收在角里」，而不是平铺 */
  const near = Math.exp(-t / 0.085) + Math.exp(-(1 - t) / 0.085);
  d *= bias * (0.72 + 0.95 * near);
  /* 上端交给光：墨在梦线一带退干净（浸进去，不是被切开） */
  d *= 1 - smooth(0.74, 1.14, u) * 0.97;
  return clamp(d * mottle(t, u, 2.7), 0, 1);
}

/* 地。中间是一片留白，只有墙根与四角收墨 */
function inkFloor(t, v) {
  const ex = Math.abs(t * 2 - 1);
  const ez = Math.abs(v * 2 - 1);
  let d = 0.03 + 0.34 * ex ** 2.3 + 0.16 * ez ** 2.6;
  d *= 1 - smooth(0.9, 1.02, ex) * 0.15;
  return clamp(d * mottle(t, v, 2.3), 0, 1);
}

/* 天花板：印得最实的一块。但版子没擦净，偏一侧留了一块浅的，
   流光就从那儿透上来——抬头时人仍在光里，只是被纸盖住了大半 */
function inkCeil(t, v) {
  const ex = Math.abs(t * 2 - 1);
  const ez = Math.abs(v * 2 - 1);
  let d = 0.3 + 0.5 * Math.max(ex, ez) ** 1.3;
  const dx = (t - 0.4) / 0.32;
  const dz = (v - 0.54) / 0.28;
  const wob = 0.16 * Math.sin(t * 5.7 + 1.1) + 0.12 * Math.sin(v * 7.3 - 0.5) + 0.07 * Math.sin((t + v) * 10.9);
  const wipe = clamp(1 - (Math.sqrt(dx * dx + dz * dz) + wob), 0, 1);
  d *= 1 - 0.93 * wipe ** 0.65;
  return clamp(d * mottle(t, v, 3.1), 0, 1);
}

/* 墨浓 → 线距（米，世界尺度：于是它随透视收进去，而不是贴在屏幕上） */
function gapOf(d) {
  if (d <= 0.004) return 9;
  return 0.15 - 0.113 * Math.pow(d, 0.62);
}

/* ══════════════════════════════════════════════════════════════
   四 · 排线

   一族平行线 = 平面里一个方向 + 一路间距；间距由沿途的墨决定，
   于是「密」长在结构上（墙角、墙脚、四角），不是均匀铺满。
   每一根线再按段取墨，段与段之间会断——这是蚀刻线的样子。
   ══════════════════════════════════════════════════════════════ */
const INK = '8,9,17';
const NB = 8;
const NS = 10;

let G = null;
const bandSeg = [];
const bandInk = new Float64Array(NB);
const bandCnt = new Int32Array(NB);
for (let i = 0; i < NB; i++) bandSeg[i] = new Float32Array(4096);

function resetBands() {
  bandCnt.fill(0);
  bandInk.fill(0);
}

function flushBands(scale) {
  for (let b = 0; b < NB; b++) {
    const n = bandCnt[b];
    if (!n) continue;
    const seg = bandSeg[b];
    const ink = clamp(bandInk[b] / n, 0, 1);
    if (ink < 0.015) continue;
    G.beginPath();
    for (let i = 0; i < n; i++) {
      G.moveTo(seg[i * 4], seg[i * 4 + 1]);
      G.lineTo(seg[i * 4 + 2], seg[i * 4 + 3]);
    }
    G.strokeStyle = `rgba(${INK},${(0.13 + 0.3 * ink).toFixed(3)})`;
    G.lineWidth = (0.75 + 0.9 * ink) * scale;
    G.stroke();
  }
  resetBands();
}

/* 相机空间里的一段 → 裁近平面 → 进档 */
function push(a0, a1, a2, b0, b1, b2, band) {
  const ain = a2 < -NPL;
  const bin = b2 < -NPL;
  if (!ain && !bin) return;
  let xa = a0;
  let ya = a1;
  let za = a2;
  let xb = b0;
  let yb = b1;
  let zb = b2;
  if (!ain || !bin) {
    const t = (-NPL - za) / (zb - za);
    const cx = xa + (xb - xa) * t;
    const cy = ya + (yb - ya) * t;
    if (ain) {
      xb = cx;
      yb = cy;
      zb = -NPL;
    } else {
      xa = cx;
      ya = cy;
      za = -NPL;
    }
  }
  const da = -za;
  const db = -zb;
  if (da < 1e-4 || db < 1e-4) return;
  const sx0 = CAM.cx + (xa * CAM.F) / da;
  const sy0 = CAM.cy - (ya * CAM.F) / da;
  const sx1 = CAM.cx + (xb * CAM.F) / db;
  const sy1 = CAM.cy - (yb * CAM.F) / db;
  if (!isFinite(sx0) || !isFinite(sx1) || !isFinite(sy0) || !isFinite(sy1)) return;
  let seg = bandSeg[band];
  let k = bandCnt[band];
  if ((k + 1) * 4 > seg.length) return;
  seg[k * 4] = sx0;
  seg[k * 4 + 1] = sy0;
  seg[k * 4 + 2] = sx1;
  seg[k * 4 + 3] = sy1;
  bandCnt[band] = k + 1;
}

const pA = [0, 0, 0];
/* 平面坐标（米）→ 世界 */
function atM(P, mx, my, out) {
  out[0] = P.o[0] + P.ax[0] * mx + P.az[0] * my;
  out[1] = P.o[1] + P.ax[1] * mx + P.az[1] * my;
  out[2] = P.o[2] + P.ax[2] * mx + P.az[2] * my;
  return out;
}

/* 去掉浮点毛刺：cos(π/2) 不是 0 */
const snap = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);

/* 一族平行线。dir：平面（米）里的单位方向；inkAt(t,v)；minInk 以下不落笔 */
function family(P, dirx, diry, inkAt, minInk, stepK, wid) {
  const dx = snap(dirx);
  const dy = snap(diry);
  const nx = -dy;
  const ny = dx;
  const w = P.w;
  const h = P.h;

  /* 法向上的范围（四条边在这个方向上的投影） */
  const cs = [0, w * nx, h * ny, w * nx + h * ny];
  let c0 = Math.min(cs[0], cs[1], cs[2], cs[3]);
  let c1 = Math.max(cs[0], cs[1], cs[2], cs[3]);
  if (c1 - c0 < 1e-6) return;

  let c = c0 + 0.004;
  let guard = 0;
  while (c <= c1 && guard++ < 700) {
    const qx = nx * c;
    const qy = ny * c;

    /* 直线 q + u·d 夹进 [0,w]×[0,h] */
    let umin = -1e9;
    let umax = 1e9;
    let ok = true;
    if (dx !== 0) {
      let t1 = (0 - qx) / dx;
      let t2 = (w - qx) / dx;
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      umin = Math.max(umin, t1);
      umax = Math.min(umax, t2);
    } else if (qx < 0 || qx > w) ok = false;
    if (ok && dy !== 0) {
      let t1 = (0 - qy) / dy;
      let t2 = (h - qy) / dy;
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      umin = Math.max(umin, t1);
      umax = Math.min(umax, t2);
    } else if (ok && (qy < 0 || qy > h)) ok = false;

    if (!ok || umax - umin < 0.006) {
      c += 0.02;
      continue;
    }

    /* 沿线取几处墨，取最大的一处定间距：暗处线密 */
    let peak = 0;
    for (let s = 0; s <= 4; s++) {
      const u = umin + ((umax - umin) * s) / 4;
      const mi = inkAt(clamp((qx + dx * u) / w, 0, 1), clamp((qy + dy * u) / h, 0, 1));
      if (mi > peak) peak = mi;
    }

    if (peak < minInk) {
      c += gapOf(Math.max(peak, 0.004)) * stepK * 2.2;
      continue;
    }

    /* 逐段：一段一段地取墨、投影、进档。段与段之间浓度不同就自然断开 */
    let pa0 = 0;
    let pa1 = 0;
    let pa2 = 0;
    for (let i = 0; i <= NS; i++) {
      const u = umin + ((umax - umin) * i) / NS;
      atM(P, qx + dx * u, qy + dy * u, pA);
      toView(pA, vtmp);
      const b0 = vtmp[0];
      const b1 = vtmp[1];
      const b2 = vtmp[2];
      if (i > 0) {
        const um = umin + ((umax - umin) * (i - 0.5)) / NS;
        const mi = inkAt(clamp((qx + dx * um) / w, 0, 1), clamp((qy + dy * um) / h, 0, 1));
        if (mi >= minInk) {
          const band = Math.min(NB - 1, Math.max(0, Math.floor(mi * NB)));
          bandInk[band] += mi;
          bandCnt[band]++;
          push(pa0, pa1, pa2, b0, b1, b2, band);
        }
      }
      pa0 = b0;
      pa1 = b1;
      pa2 = b2;
    }
    c += gapOf(peak) * stepK;
  }
  void wid;
}

/* ══════════════════════════════════════════════════════════════
   五 · 版面：一面墙 / 地 / 顶 各自的坐标
   ══════════════════════════════════════════════════════════════ */
function plateOf(k, W, H, D) {
  switch (k) {
    case 'back':
      return { o: [-W, 0, -D], ax: [1, 0, 0], az: [0, 1, 0], w: 2 * W, h: H, wall: 1 };
    case 'front':
      return { o: [W, 0, D], ax: [-1, 0, 0], az: [0, 1, 0], w: 2 * W, h: H, wall: 1 };
    case 'right':
      return { o: [W, 0, -D], ax: [0, 0, 1], az: [0, 1, 0], w: 2 * D, h: H, wall: 1 };
    case 'left':
      return { o: [-W, 0, D], ax: [0, 0, -1], az: [0, 1, 0], w: 2 * D, h: H, wall: 1 };
    case 'floor':
      return { o: [-W, 0, -D], ax: [1, 0, 0], az: [0, 0, 1], w: 2 * W, h: 2 * D, wall: 0 };
    case 'ceil':
      return { o: [-W, H, -D], ax: [1, 0, 0], az: [0, 0, 1], w: 2 * W, h: 2 * D, wall: 0 };
    default:
      return null;
  }
}

const PAPER = '52,54,76';
const S = { W: 2.4, H: 3, D: 2.3, Y: 1.32 };

function pathPolys(list) {
  G.beginPath();
  let any = false;
  for (const p of list) {
    if (!p || p.length < 3) continue;
    any = true;
    for (let i = 0; i < p.length; i++) {
      if (i) G.lineTo(p[i].x, p[i].y);
      else G.moveTo(p[i].x, p[i].y);
    }
    G.closePath();
  }
  return any;
}

function paintFace(f) {
  const isCeil = f.k === 'ceil';
  const isFloor = f.k === 'floor';
  const polys = isCeil ? [f.above] : isFloor ? [f.below] : [f.below];
  const belowOk = polys.some((p) => p && p.length >= 3);
  if (!belowOk) return;
  const P = plateOf(f.k, S.W, S.H, S.D);
  if (!P) return;

  G.save();
  if (!pathPolys(polys)) {
    G.restore();
    return;
  }
  G.clip();

  const box = f.bbox;
  const bx = box.x0 - 4;
  const by = box.y0 - 4;
  const bw = box.x1 - box.x0 + 8;
  const bh = box.y1 - box.y0 + 8;

  /* ── 纸：梦线那一带还没有压实（光从纸背渗上来），往下才压成不透的纸 ── */
  if (!isCeil && !isFloor && f.line.length === 2) {
    const ly = Math.min(f.line[0].y, f.line[1].y);
    const ly2 = Math.max(f.line[0].y, f.line[1].y);
    const y0 = Math.max(ly, ly2) - 6; // 从梦线的下端起算
    const drop = Math.max(120, box.y1 - y0);
    const grad = G.createLinearGradient(0, y0 - 10, 0, y0 + drop * 0.52);
    grad.addColorStop(0, `rgba(${PAPER},0)`);
    grad.addColorStop(0.28, `rgba(${PAPER},0.34)`);
    grad.addColorStop(0.55, `rgba(${PAPER},0.82)`);
    grad.addColorStop(0.78, `rgba(${PAPER},0.93)`);
    grad.addColorStop(1, `rgba(${PAPER},0.95)`);
    G.fillStyle = grad;
  } else {
    G.fillStyle = `rgba(${PAPER},0.95)`;
  }
  G.fillRect(bx, by, bw, bh);

  if (DBG === 'faces') {
    const hue = { back: '#c33', front: '#3c3', right: '#33c', left: '#cc3', ceil: '#c3c', floor: '#3cc' }[f.k];
    G.globalAlpha = 0.3;
    G.fillStyle = hue;
    G.fillRect(bx, by, bw, bh);
    G.globalAlpha = 1;
    G.restore();
    return;
  }

  /* ── 墨 ── */
  G.lineCap = 'butt';
  const hOverY = S.H / S.Y;

  if (P.wall) {
    const bias = BIAS[f.k] || 0.95;
    const ink = (t, v) => inkWall(v * hOverY, t, bias);
    resetBands();
    /* 主族：竖线，平行于墙角竖棱 */
    family(P, 0, 1, ink, 0.045, 1, 1.1);
    flushBands(1);
    /* 次族：横线，平行于墙脚，只落在暗的下半截 */
    resetBands();
    family(P, 1, 0, ink, 0.3, 1.25, 0.9);
    flushBands(0.9);
    /* 三族：斜线，只补在最黑的地方（墙脚与墙角） */
    resetBands();
    family(P, Math.SQRT1_2, Math.SQRT1_2, ink, 0.46, 1.5, 0.85);
    family(P, Math.SQRT1_2, -Math.SQRT1_2, ink, 0.66, 1.55, 0.85);
    flushBands(0.85);
  } else if (isFloor) {
    resetBands();
    /* 主族：横线，平行于后墙，越远收得越紧 */
    family(P, 1, 0, inkFloor, 0.02, 1, 1.05);
    flushBands(1);
    resetBands();
    /* 次族：竖线，只在墙根与四角 */
    family(P, 0, 1, inkFloor, 0.16, 1.3, 0.9);
    flushBands(0.9);
  } else {
    resetBands();
    family(P, 1, 0, inkCeil, 0.02, 1, 1.05);
    family(P, 0, 1, inkCeil, 0.02, 1, 1.05);
    flushBands(1);
    resetBands();
    family(P, Math.SQRT1_2, Math.SQRT1_2, inkCeil, 0.62, 1.5, 0.8);
    flushBands(0.8);
  }

  /* 一面纸的边缘：纸被版子压过一点（往里一线亮、往外一线暗） */
  G.beginPath();
  const p0 = polys.find((p) => p && p.length >= 3);
  if (p0) {
    G.moveTo(p0[0].x, p0[0].y);
    for (let i = 1; i < p0.length; i++) G.lineTo(p0[i].x, p0[i].y);
    G.closePath();
    G.strokeStyle = 'rgba(200,200,228,0.05)';
    G.lineWidth = 1;
    G.stroke();
  }

  G.restore();
}

/* ══════════════════════════════════════════════════════════════
   六 · 梦线

   不是切开的线。纸在这里还是湿的：墨退干净、纸半透，
   只留一道压过的折痕（微微起伏、两处断口、一边亮一边暗）。
   ══════════════════════════════════════════════════════════════ */
function pressMark(a, b, k) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 8) return;
  const nx = -dy / len;
  const ny = dx / len;
  const N = 40;
  for (let pass = 0; pass < 2; pass++) {
    G.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const wob = Math.sin(i * 0.63 + 0.6) * 1.1 + Math.sin(i * 1.87) * 0.55 + Math.sin(i * 4.3) * 0.25;
      const off = (pass ? 1.9 : 0) + wob * 1.25;
      const cut = (t > 0.29 && t < 0.325) || (t > 0.64 && t < 0.663);
      if (cut) {
        pen = false;
        continue;
      }
      const gx = a.x + dx * t + nx * off;
      const gy = a.y + dy * t + ny * off;
      if (!pen) {
        G.moveTo(gx, gy);
        pen = true;
      } else G.lineTo(gx, gy);
    }
    G.strokeStyle = pass ? `rgba(6,7,14,${0.13 * k})` : `rgba(206,204,232,${0.13 * k})`;
    G.lineWidth = 1;
    G.stroke();
  }
}

/* 梦线以上：纸还在，只是没有墨。房间的轮廓被版子轻轻压过——只看得到压痕 */
function platemarkAbove(f, k) {
  const p = f.above;
  if (!p || p.length < 4) return;
  /* 只画这一面「自己那条」竖棱（1→2），四条棱各画一次，不会叠 */
  const a = p[1];
  const b = p[2];
  G.beginPath();
  G.moveTo(a.x, a.y);
  G.lineTo(b.x, b.y);
  G.strokeStyle = `rgba(206,206,236,${0.055 * k})`;
  G.lineWidth = 1;
  G.stroke();
  G.beginPath();
  G.moveTo(a.x + 1, a.y);
  G.lineTo(b.x + 1, b.y);
  G.strokeStyle = `rgba(4,5,12,${0.05 * k})`;
  G.stroke();
}

/* ══════════════════════════════════════════════════════════════
   七 · 挂钩
   ══════════════════════════════════════════════════════════════ */
room.onPaint((ctx) => {
  const { faces, g, sink, vw, vh, dreamY, W, H, D, F, quality } = ctx;
  if (sink <= 0.006) return;

  const b = boxAt(sink);
  CAM.s = b.s;
  CAM.oy = b.oy;
  CAM.oz = b.oz;
  S.W = W;
  S.H = H;
  S.D = D;
  S.Y = dreamY;

  gatherVerts(faces);
  solveCam(W, H, D, dreamY, F, vw, vh);

  G = g;
  resetBands();

  const wantW = Math.round(vw * quality);
  const wantH = Math.round(vh * quality);
  if (!TEX || TEXW !== wantW || TEXH !== wantH) buildTex(wantW, wantH);

  /* 纸的范围：梦线以下的墙与地，加天花板（抬头时那里是一整张纸，排线收得最密）。
     墙面的梦线以上不铺纸——那里该透出流光，是 BRIEF-R 的规矩。 */
  const paperPolys = [];
  for (const f of faces) {
    if (f.k === 'ceil') {
      if (f.above.length >= 3) paperPolys.push(f.above);
      continue;
    }
    if (f.below.length >= 3) paperPolys.push(f.below);
  }

  G.save();
  G.globalAlpha = clamp(sink * 1.15, 0, 1);
  if (TEX && paperPolys.length && pathPolys(paperPolys)) {
    G.clip();
    G.drawImage(TEX, 0, 0, vw, vh);
  }
  G.restore();

  for (const f of faces) paintFace(f);

  const k = clamp(sink * 1.15, 0, 1);
  for (const f of faces) {
    if (f.line.length === 2) pressMark(f.line[0], f.line[1], k);
  }
  for (const f of faces) {
    if (f.k !== 'ceil' && f.k !== 'floor') platemarkAbove(f, k);
  }

  G = null;
});

flow.onFrame((s) => {
  approach.update(s.sink, s.vw);
  stat.textContent = `${s.arrive.toFixed(2)} · 视角 ${document.documentElement.dataset.view} · ${Math.round(s.vw)}×${Math.round(s.vh)}`;
});

flow.start();
room.start();

/* 调试：把每帧的面状态挂出来（探针用，正式跑不受影响） */
if (DBG) {
  room.onPaint((ctx) => {
    window.__D = {
      CAM: { yaw: CAM.yaw, pitch: CAM.pitch, F: CAM.F, cx: CAM.cx, cy: CAM.cy },
      S: { ...S },
      faces: ctx.faces.map((f) => ({
        k: f.k,
        below: f.below.length,
        above: f.above.length,
        line: f.line.map((p) => [Math.round(p.x), Math.round(p.y)]),
        bbox: [f.bbox.x0, f.bbox.y0, f.bbox.x1, f.bbox.y1].map(Math.round),
        depth: +f.depth.toFixed(2),
      })),
      inkWall: (u, t, b) => inkWall(u, t, b),
      inkFloor,
      inkCeil,
      gapOf,
      plateOf,
      S2: S,
    };
  });
}
