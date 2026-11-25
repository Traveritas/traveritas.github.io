/* ─────────────────────────────────────────────────────────────
   形状账 · 共用分析（第四轮 · design/mocks/star-v2/shape-stats.mjs）

   这个模块同时被两处 import：
     · shape-audit.mjs（node 里打印冷数字）
     · shape.js（?set=shape 的形状对照页）
   所以它不碰 node 内置模块，纯几何 + 纯数学。

   全部读数都从**真面表 + 真包含测试**算出，不是套公式：
     faces / facesPerArm        面表长度
     tips                       六个尖各自到原点的距离（沿 ±轴 二分求「还在并集里」的最远点）
     armSectionArea             三个轴各自在 s=0.5 处的横截面积（三列按根部面积归一，所以这组数应相同）
     ridgeAngles / lobeAngles   剪影里六个尖的角度位置与角间距 —— B 列「六芒星偏多少」就看这组
     visibleRidges              可见棱线：相邻两个像素看到的不是同一张面，那条界就是一条棱；
                                把所有实际出现过的「面—面」相邻对去重，就是眼里能数到的棱数
     notchOverTip               剪影内角半径 / 尖半径
     sixFoldDev                 剪影的六重对称破缺：max|r(θ)−r(θ+60°)| / mean(r)
     diffVsA                    与 A 列剪影的像素差（同画幅、同落定姿态）
     cubic                      绕 x / y / z 各转 90° 后，面表里有多少张面对不上（立方对称破缺数）
   ───────────────────────────────────────────────────────────── */
import { buildBlocksOpts, blocksInView, poseAt, mulView, RENDER, SHAPE, AREA_A } from './src.js';

const TAN = RENDER.tan;
const CAM = RENDER.camZ;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ── 四列 ────────────────────────────────────────────────────
   A  现役基准。B 三角截面。C 有两个子项：
        C·几何  = 扫 theta 选出来的那一档（规则：可见棱线最少且六尖偏差 ≤2%）
        C·棱宽  = 几何与 A 完全相同，只把 uEdgeW 从 0.026 调到 0.05
     C·棱宽 的 geometryKey 与 A 一样 —— 页面上必须标明「它只改棱的宽窄、不改几何」。 */
export const COLS = [
  { id: 'A', label: 'A · 现役菱形截面', kind: 'quad', theta: 45, edgeW: null, geo: 'quad45',
    sub: '4 面/支 · 24 面', note: '基准' },
  { id: 'B', label: 'B · 三角截面', kind: 'tri', theta: null, edgeW: null, geo: 'tri',
    sub: '3 面/支 · 18 面', note: '立方对称降到 120° 循环' },
  { id: 'C', label: 'C · 脊压平', kind: 'quad', theta: 15, edgeW: null, geo: 'quad15',
    sub: '4 面/支 · 24 面', note: 'theta=15°，第四轮按（可见棱最少的）规则选的；第五轮换了姿态后这条优势不成立了，见 notes' },
  { id: 'C2', label: 'C·棱宽 · 只改棱宽', kind: 'quad', theta: 45, edgeW: 0.05, geo: 'quad45',
    sub: '4 面/支 · 24 面（几何与 A 相同）', note: 'edgeW 0.026 → 0.05' },
];

export const blocksOf = (c) => buildBlocksOpts({ kind: c.kind, theta: c.theta ?? 45 });

/* ── 六个尖 ── */
function tipsOf(blocks) {
  const inside = (p) => {
    for (const fl of blocks) {
      let ok = true;
      for (const f of fl) if (dot3([f[0], f[1], f[2]], p) > f[3] + 1e-12) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  };
  const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return AX.map((d) => {
    let lo = 0;
    let hi = 2;
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (inside([d[0] * m, d[1] * m, d[2] * m])) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  });
}

/* ── 三个轴各自在 s=0.5 处的横截面积 ── */
function axisSectionAreas(blocks) {
  return [0, 1, 2].map((ax) => {
    const j = (ax + 1) % 3;
    const k = (ax + 2) % 3;
    const fl = blocks[ax];
    const inside = (p) => {
      for (const f of fl) if (dot3([f[0], f[1], f[2]], p) > f[3] + 1e-12) return false;
      return true;
    };
    const N = 720;
    const R = [];
    for (let m = 0; m < N; m++) {
      const th = (m / N) * Math.PI * 2;
      const c = [Math.cos(th), Math.sin(th)];
      let lo = 0;
      let hi = 3;
      for (let i = 0; i < 60; i++) {
        const md = (lo + hi) / 2;
        const p = [0, 0, 0];
        p[ax] = 0.5;
        p[j] = c[0] * md;
        p[k] = c[1] * md;
        if (inside(p)) lo = md;
        else hi = md;
      }
      R.push((lo + hi) / 2);
    }
    let a = 0;
    for (let m = 0; m < N; m++) a += 0.5 * R[m] * R[(m + 1) % N] * Math.sin((2 * Math.PI) / N);
    return +Math.abs(a).toFixed(6);
  });
}

/* ── 剪影 ── */
function coveredFn(view) {
  return (x, y) => {
    for (const faces of view) {
      let lo = -Infinity;
      let hi = Infinity;
      let ok = true;
      for (const f of faces) {
        const r = f[3] - f[0] * x - f[1] * y;
        if (Math.abs(f[2]) < 1e-9) {
          if (r < 0) { ok = false; break; }
        } else if (f[2] > 0) hi = Math.min(hi, r / f[2]);
        else lo = Math.max(lo, r / f[2]);
      }
      if (ok && lo <= hi) return true;
    }
    return false;
  };
}
/** 径向取样：r(θ)，θ 分 NS 份 */
function radial(view, NS = 1440) {
  const cov = coveredFn(view);
  const r = new Float64Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = (i / NS) * Math.PI * 2;
    let lo = 0;
    let hi = 1.4;
    for (let k = 0; k < 58; k++) {
      const m = (lo + hi) / 2;
      if (cov(Math.cos(a) * m, Math.sin(a) * m)) lo = m;
      else hi = m;
    }
    r[i] = (lo + hi) / 2;
  }
  return r;
}
/** 局部极大（尖）与局部极小（凹口）的角度位置 */
function extrema(r) {
  const N = r.length;
  const tips = [];
  const notches = [];
  const mean = r.reduce((a, b) => a + b, 0) / N;
  /* 芒尖要有「显著性」：比左右各 6° 内的最小半径高出 2% 才算。
     不设阈值的话，三角截面的剪影会在两个芒尖之间多报一处很浅的折痕
     （51° 处只比两侧高 0.2%），于是 B 会被数成 7 个峰。
     真正的芒尖在同样的量法下是 20%+ —— 两者差两个数量级，阈值不难取。 */
  const WIN = 12; // NS=1440 时 12 份 = 3°
  for (let i = 0; i < N; i++) {
    const c = r[i];
    let lo = Infinity;
    let isMax = true;
    for (let d = 1; d <= WIN; d++) {
      const a = r[(i - d + N) % N];
      const b = r[(i + d) % N];
      if (c < a || c <= b) { isMax = false; break; }
      lo = Math.min(lo, a, b);
    }
    if (isMax && (c - lo) / c >= 0.02) tips.push({ deg: (i / N) * 360, r: c });
    /* 凹口：局部极小，且明显低于均值 */
    const p = r[(i - 1 + N) % N];
    const n = r[(i + 1) % N];
    if (c <= p && c < n && c < mean * 0.95) notches.push({ deg: (i / N) * 360, r: c });
  }
  return { tips, notches };
}
/** 六重对称破缺：max |r(θ) − r(θ+60°)| / mean(r) */
function sixFoldDev(r) {
  const N = r.length;
  const step = Math.round(N / 6);
  let mx = 0;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(r[i] - r[(i + step) % N]);
    if (d > mx) mx = d;
    sum += r[i];
  }
  return { dev: +(mx / (sum / N)).toFixed(4), maxAbs: +mx.toFixed(4) };
}

/* ── 可见棱线 ── */
/**
 * 「数得到的棱线」：把画面上「相邻像素法线拐过 threshDeg 以上」的像素标出来，
 * 再做 8 连通分量 —— 每一条连线就是眼睛里真的数得到的一道折。
 *
 * 为什么不用「面—面相邻对」数：那会把 156° 的钝脊也算一条棱，而 156° 在画面上
 * 几乎看不出拐折（C 列正是靠把一组脊压钝来少棱的）。按连通分量数，钝到看不见的
 * 那一圈不会成形，于是这个数才对得上「棱的数量是不是少了一些」。
 */
function countableRidges(view, threshDeg = 12, minPx = 14, N = 340) {
  const COS = Math.cos((threshDeg * Math.PI) / 180);
  const nrm = new Float32Array(N * N * 3);
  const hit = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const px = ((x + 0.5) / N) * 2 - 1;
      const py = 1 - ((y + 0.5) / N) * 2;
      const W = [px * TAN * CAM, py * TAN * CAM];
      let bestT = Infinity;
      let bn = null;
      for (let k = 0; k < view.length; k++) {
        const faces = view[k];
        let t0 = -Infinity;
        let t1 = Infinity;
        let ni = -1;
        for (let i = 0; i < faces.length; i++) {
          const f = faces[i];
          const num = f[3] - (f[0] * W[0] + f[1] * W[1]);
          if (f[2] > 1e-7) t1 = Math.min(t1, num / f[2]);
          else if (f[2] < -1e-7) {
            const t = num / f[2];
            if (t > t0) { t0 = t; ni = i; }
          }
        }
        if (ni < 0 || t0 > t1 || t1 <= 1e-6) continue;
        if (t0 < bestT) { bestT = t0; bn = faces[ni]; }
      }
      if (!bn) continue;
      const kk = y * N + x;
      hit[kk] = 1;
      nrm[kk * 3] = bn[0];
      nrm[kk * 3 + 1] = bn[1];
      nrm[kk * 3 + 2] = bn[2];
    }
  const edge = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = y * N + x;
      if (!hit[k]) continue;
      const a0 = nrm[k * 3];
      const a1 = nrm[k * 3 + 1];
      const a2 = nrm[k * 3 + 2];
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const kk = yy * N + xx;
        if (!hit[kk]) continue;
        const d = a0 * nrm[kk * 3] + a1 * nrm[kk * 3 + 1] + a2 * nrm[kk * 3 + 2];
        if (d < COS) { edge[k] = 1; break; }
      }
    }
  const lab = new Int32Array(N * N).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < N * N; s++) {
    if (!edge[s] || lab[s] >= 0) continue;
    const id = sizes.length;
    let cnt = 0;
    stack.push(s);
    lab[s] = id;
    while (stack.length) {
      const k = stack.pop();
      cnt++;
      const x = k % N;
      const y = (k / N) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const kk = yy * N + xx;
          if (edge[kk] && lab[kk] < 0) { lab[kk] = id; stack.push(kk); }
        }
    }
    sizes.push(cnt);
  }
  const real = sizes.filter((v) => v >= minPx);
  let px = 0;
  for (let i = 0; i < edge.length; i++) px += edge[i];
  return { countable: real.length, edgePx: px };
}

function visibleRidges(view, N = 320, sharpDeg = 150) {
  /* d = cos(两面法线夹角)。面与面的二面角 = 180° − 法线夹角，
     所以「二面角 ≤ sharpDeg（够锐、看得见）」⇔「法线夹角 ≥ 180° − sharpDeg」
     ⇔ d ≤ cos(180° − sharpDeg)。 */
  const D_THRESH = Math.cos(((180 - sharpDeg) * Math.PI) / 180);
  const tagAt = (x, y) => {
    let bestT = Infinity;
    let tag = -1;
    for (let k = 0; k < view.length; k++) {
      const faces = view[k];
      let t0 = -Infinity;
      let t1 = Infinity;
      let ni = -1;
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        const num = f[3] - (f[0] * x + f[1] * y);
        if (f[2] > 1e-7) t1 = Math.min(t1, num / f[2]);
        else if (f[2] < -1e-7) {
          const t = num / f[2];
          if (t > t0) { t0 = t; ni = i; }
        }
      }
      if (ni < 0 || t0 > t1 || t1 <= 1e-6) continue;
      if (t0 < bestT) { bestT = t0; tag = k * 16 + ni; }
    }
    return tag;
  };
  const g = new Int32Array(N * N);
  const nrmArr = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = ((x + 0.5) / N) * 2 - 1;
      const ny = 1 - ((y + 0.5) / N) * 2;
      const wx = nx * TAN * CAM;
      const wy = ny * TAN * CAM;
      g[y * N + x] = tagAt(wx, wy);
      /* 同时记下这一像素看到的那张面的法向（算「锐不锐」用） */
      const t = g[y * N + x];
      if (t >= 0) {
        const k = (t / 16) | 0;
        const i = t % 16;
        const f = view[k][i];
        const p = (y * N + x) * 3;
        nrmArr[p] = f[0];
        nrmArr[p + 1] = f[1];
        nrmArr[p + 2] = f[2];
      }
    }
  /* 只把「拐得够狠」的相邻对算成一条棱：二面角 > sharpDeg 的钝脊在画面上
     几乎看不出折，不该算进「眼睛能数到的棱」。 */
  const pairs = new Set();
  const fset = new Set();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = g[y * N + x];
      if (a < 0) continue;
      fset.add(a);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= N || yy >= N) continue;
        const b = g[yy * N + xx];
        if (b < 0 || b === a) continue;
        const pa = (y * N + x) * 3;
        const pb = (yy * N + xx) * 3;
        const d = nrmArr[pa] * nrmArr[pb] + nrmArr[pa + 1] * nrmArr[pb + 1] + nrmArr[pa + 2] * nrmArr[pb + 2];
        if (d > D_THRESH) continue; // 二面角太大（钝脊）：在画面上看不出折，不算一条棱
        pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
  return { ridges: pairs.size, faces: fset.size };
}

/* ── 剪影掩码与像素差 ── */
function maskOf(view, N = 400) {
  const cov = coveredFn(view);
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = ((x + 0.5) / N) * 2 - 1;
      const ny = 1 - ((y + 0.5) / N) * 2;
      m[y * N + x] = cov(nx * TAN * CAM, ny * TAN * CAM) ? 1 : 0;
    }
  return m;
}
export function maskDiff(a, b) {
  let d = 0;
  let u = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) u++;
    if (a[i] !== b[i]) d++;
  }
  return { pct: +((d / Math.max(1, u)) * 100).toFixed(2), xor: d, union: u };
}

/* ── 立方对称破缺 ── */
function cubicBroken(blocks) {
  const key = (f) => f.map((v) => Math.round(v * 1e6)).join(',');
  const set = new Set(blocks.flat().map(key));
  const rots = {
    x: (f) => [f[0], -f[2], f[1], f[3]],
    y: (f) => [f[2], f[1], -f[0], f[3]],
    z: (f) => [-f[1], f[0], f[2], f[3]],
  };
  const out = {};
  for (const [n, R] of Object.entries(rots)) {
    let bad = 0;
    for (const f of blocks.flat()) if (!set.has(key(R(f)))) bad++;
    out[n] = bad;
  }
  return out;
}

/** 六个尖在**视空间的投影**（角度 / 径向 / 深度 / 到原点距离）。
    构造事实：三个凸块都是「方双锥/三锥」，极点必然落在体空间 ±轴 上；
    沿轴那张半平面的偏移是 1/L、法向的轴分量是 ±1/L，所以轴上的交点恒为 ±1。
    于是六尖 = M·(±e_ax) 再乘实测的尖长（theta 改的是截面，不改尖长 ——
    这一点 .probe/audit 的 tips 一直显示全是 1.0000，正是它）。
    「B 列六个尖分成两种」不发生在**距离**上，而发生在**每个尖周围的面形态**上；
    这里给出投影位置，面形态另由 cubic / 截面读数表达。 */
function tipProjection(blocks) {
  /* 用实测尖长（若截面让极点离开轴上，这里也能反映出来） */
  const tips = tipsOf(blocks);
  const V = poseAt(0);
  const M = mulView(V);
  const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return AX.map((a, i) => {
    const s = tips[i];
    const p = [
      M[0] * a[0] + M[1] * a[1] + M[2] * a[2],
      M[3] * a[0] + M[4] * a[1] + M[5] * a[2],
      M[6] * a[0] + M[7] * a[1] + M[8] * a[2],
    ].map((v) => v * s);
    return {
      deg: +(((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360).toFixed(3),
      rho: +Math.hypot(p[0], p[1]).toFixed(4),
      z: +p[2].toFixed(4),
      r: +Math.hypot(p[0], p[1], p[2]).toFixed(4),
    };
  }).sort((a, b) => a.deg - b.deg);
}

/** 每个尖的「面形态」：尖处汇合几张面 + 这些面绕轴的角度分布。
    BRIEF-4 说三角截面「六个尖会分成两种」—— 距离上并不会（六尖恒在 ±1），
    真正的分化在这里：尖周围那圈面的角分布。A 是 90/90/90/90（一种），
    C1 是 150/30/150/30（一种），B 是 120/120/120（一种）。
    所以「分成两种」在这套构造下**没有发生** —— 四列都是同一种，见 notes。 */
function tipFaceShape(blocks) {
  const j0 = (k) => (k + 1) % 3;
  const k0 = (k) => (k + 2) % 3;
  const out = [];
  for (let k = 0; k < 3; k++) {
    for (const s of [1, -1]) {
      const ax = [0, 0, 0];
      ax[k] = s;
      const at = blocks[k].filter((f) => dot3([f[0], f[1], f[2]], ax) > 1e-6);
      const angs = at.map((f) => (Math.atan2(f[k0(k)], f[j0(k)]) * 180) / Math.PI).sort((a, b) => a - b);
      const gaps = angs.map((a, i) => +(((angs[(i + 1) % angs.length] - a) + 360) % 360).toFixed(1));
      out.push({ ax: ax.join(''), faces: at.length, gaps });
    }
  }
  /* 「几种」= 把 gaps 四舍五入到 0.5° 后去重 */
  const kinds = new Set(out.map((o) => o.gaps.map((g) => Math.round(g * 2) / 2).join(',')));
  return { per: out, kinds: kinds.size };
}

/* ── 单列的完整读数 ── */
export function analyse(col) {
  const blocks = blocksOf(col);
  const view = blocksInView(blocks, poseAt(0));
  const faces = blocks.reduce((a, b) => a + b.length, 0);
  const tips = tipsOf(blocks);
  const r = radial(view);
  const { tips: tipPts, notches } = extrema(r);
  const vrg = visibleRidges(view);
  const cnt = countableRidges(view);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const notchR = Math.min(...r);
  const tipR = Math.max(...r);
  /* 尖的角间距（按投影角度排序后相邻差）—— A 列应全是 60° */
  const tdeg = tipPts.map((t) => t.deg).sort((a, b) => a - b);
  const gaps = tdeg.map((d, i) => +(((tdeg[(i + 1) % tdeg.length] - d + 360) % 360) || 0).toFixed(2));
  return {
    id: col.id,
    kind: col.kind,
    theta: col.theta,
    edgeW: col.edgeW,
    geo: col.geo,
    faces,
    facesPerArm: faces / 6,
    facesPerBlock: blocks[0].length,
    tips: tips.map((t) => +t.toFixed(4)),
    tipMin: +Math.min(...tips).toFixed(4),
    tipMax: +Math.max(...tips).toFixed(4),
    tipSpread: +(Math.max(...tips) - Math.min(...tips)).toFixed(4),
    armSectionArea: axisSectionAreas(blocks),
    tipCount: tipPts.length,
    notchCount: notches.length,
    tipProj: tipProjection(blocks),
    tipShape: tipFaceShape(blocks),
    lobeGaps: gaps,
    lobeGapSpread: +(Math.max(...gaps) - Math.min(...gaps)).toFixed(2),
    tipRadii: tipPts.map((t) => +t.r.toFixed(4)),
    notchOverTip: +(notchR / tipR).toFixed(4),
    /* 剪影峰读数（第五轮判据）：径向剖面的局部极大 = 芒尖 */
    peakCount: tipPts.length,
    peakDegs: tipPts.map((t) => +t.deg.toFixed(2)).sort((a, b) => a - b),
    peakGapMaxDev: +gaps.reduce((m, g) => Math.max(m, Math.abs(g - 60)), 0).toFixed(3),
    peakRadiusMaxDevPct: +(((tipR - Math.min(...tipPts.map((t) => t.r))) / tipR) * 100).toFixed(3),
    sixFoldDev: sixFoldDev(r).dev,
    visibleRidges: vrg.ridges,
    visibleFaces: vrg.faces,
    countableRidges: cnt.countable,
    ridgePx: cnt.edgePx,
    cubic: cubicBroken(blocks),
    /* 供页面画图用 */
    _blocks: blocks,
    _view: view,
    _mask: maskOf(view),
  };
}

/* ── theta 扫描（BRIEF 第四轮 ①） ── */
export const SWEEP_THETAS = [0, 15, 30, 45];
export function sweepTheta() {
  const base = analyse({ id: 'base', kind: 'quad', theta: 45, edgeW: null, geo: 'quad45' });
  const baseTips = base.tips;
  return SWEEP_THETAS.map((th) => {
    const dirs = th === 0 ? 2 : 4; // theta=0 时四条法向两两重合
    const a = analyse({ id: `θ${th}`, kind: 'quad', theta: th, edgeW: null, geo: `quad${th}` });
    const dev = Math.max(...a.tips.map((v, i) => Math.abs(v - baseTips[i])));
    const devPct = +((dev / baseTips[0]) * 100).toFixed(2);
    return {
      theta: th,
      distinctDirs: dirs,
      degenerate: dirs < 4,
      visibleRidges: a.visibleRidges,
      visibleFaces: a.visibleFaces,
      countableRidges: a.countableRidges,
      ridgePx: a.ridgePx,
      tipMin: a.tipMin,
      tipMax: a.tipMax,
      tipDeviationPct: devPct,
      notchOverTip: a.notchOverTip,
      sixFoldDev: a.sixFoldDev,
      cubic: a.cubic,
      pass: !(dirs < 4) && devPct <= 2,
    };
  });
}

/* ── 全表 ──
   第五轮起只出 **A / B / C 三列**（BRIEF-5：不许再新增变体，三列就是全部）。
   第四轮那个 C·棱宽 子项不在这一轮的表里 —— 它几何与 A 逐位相同，
   在「只看剪影」的判据下和 A 是同一列，没有信息量。 */
export function readings() {
  const cols = COLS.filter((c) => c.id !== 'C2').map(analyse);
  const aMask = cols[0]._mask;
  for (let i = 0; i < cols.length; i++) {
    cols[i].diffVsA = i === 0 ? 0 : maskDiff(aMask, cols[i]._mask).pct;
    cols[i].silhouetteIdenticalToA = i === 0 ? true : maskDiff(aMask, cols[i]._mask).xor === 0;
  }
  return { columns: cols, sweep: sweepTheta(), areaA: AREA_A, delta: DELTA_ROWS };
}

/* ── δ 扫描读数（第五轮 §1） ──────────────────────────────────
   这些数由 `delta-sweep.mjs` 离线算出（它要 tone.mjs 的 shade 来量明暗档数，
   而 tone.mjs 依赖 node —— 浏览器里跑不了）。硬编码成常量正是因为
   **绕视轴 roll 不改变任何一项**：五个 δ 的峰数 / 角间距 / 峰半径 / 明暗档数
   完全一致（δ=20 的剖面转 −20° 后与 δ=0 的最大差 = 0）。
   若哪天姿态不再是纯 roll，这张表必须重算，不能沿用。 */
export const DELTA_ROWS = [
  { delta: 0, peakCount: 6, gapMaxDev: 0, radiusMaxDevPct: 0.002, toneLevels: 2, tonePct: [0, 0, 0.1, 0.3, 0.7, 4.2, 54.7, 40.1], pick: true },
  { delta: 5, peakCount: 6, gapMaxDev: 0, radiusMaxDevPct: 0.002, toneLevels: 2, tonePct: [0, 0, 0.1, 0.3, 0.5, 4.1, 56.4, 38.5], pick: false },
  { delta: 10, peakCount: 6, gapMaxDev: 0, radiusMaxDevPct: 0.002, toneLevels: 2, tonePct: [0, 0.1, 0.1, 0.3, 0.6, 4.2, 57.8, 36.9], pick: false },
  { delta: 15, peakCount: 6, gapMaxDev: 0, radiusMaxDevPct: 0.002, toneLevels: 2, tonePct: [0, 0.1, 0.1, 0.3, 0.5, 4.7, 53.5, 40.8], pick: false },
  { delta: 20, peakCount: 6, gapMaxDev: 0, radiusMaxDevPct: 0.002, toneLevels: 2, tonePct: [0, 0.1, 0.1, 0.3, 0.5, 4.5, 51.8, 42.7], pick: false },
];