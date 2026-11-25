/* ─────────────────────────────────────────────────────────────
   星 · 晶体烘焙（design/mocks/star-nexus-bake/bake.mjs）
   ─────────────────────────────────────────────────────────────
   把 NEXUS 页那颗水晶的着色器**离线跑一遍**，把一层有限个定格姿态烘成小图。

   为什么这颗星可以烘
   ──────────────────
   触发式、一次性、定格（离散保持的姿态）—— 这一支动画本来就只是一个有限姿态集，
   不需要 60fps。那就不必每一帧付时间做三次折射追踪，把账一次性付在构建期。

   几何：六支沿 ±x ±y ±z，正是**三个互相垂直的方双锥之并**。方双锥是凸的，
   所以射线与它求交是闭式的：对每个面算 (w−n·P)/(n·d)，入口取最大、出口取最小
   —— 没有二次式、没有 SDF 步进、没有带状假影。并集不凸，着色器里用包含判定
   逐段合并：越过一个界面后若仍在并集里，那是两支交叠处的面（没有真的界面），不折射、不记棱。

   纵向轮廓（直 / 束腰 / 鼓腹）由「一站一站的方台」表示。直锥是一块（八面，
   两块半锥并成一体）；带腰的一支拆成两块，腰上留一道真棱 —— 那正是水晶的腰线。

   三段
   ────
   ① `geo`    纯数学：面表、姿态评分（真剪影掩码）、贪心选格。Node 直跑。
   ② `render` 起 headless Chrome，逐帧调 bake.html 的着色器，要回 PNG。
   ③ `pack`   量体积（PNG / WebP 无损 / WebP 有损带 alpha / AVIF）、拼精灵图，
              并验「醒梦两套 × 交叉淡入」与「一套 × CSS 染色」哪个站得住。

   用法
   ────
   node design/mocks/star-nexus-bake/bake.mjs geo      # → .shots/geo.json
   node design/mocks/star-nexus-bake/bake.mjs probe    # 预览 → .shots/probe-*.png
   node design/mocks/star-nexus-bake/bake.mjs render   # → frames/
   node design/mocks/star-nexus-bake/bake.mjs pack     # → .shots/readings.json
   node design/mocks/star-nexus-bake/bake.mjs all
   ───────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '.shots');
const FRAMES = path.join(HERE, 'frames');
const ROOT = path.resolve(HERE, '../../..');
fs.mkdirSync(SHOTS, { recursive: true });

const SF = await import(pathToFileURL(path.join(ROOT, 'design/mocks/star-final/src.js')).href);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ── 一颗星的全部旋钮 ─────────────────────────────────────────────── */
export const BAKE = {
  /** 晶体形态。作者早先研究的三个维度都在这里：截面、纵向轮廓、尖端与棱 */
  shape: {
    /** 截面：赤道正方形的半宽 / 半高。0.34 是剪影上六个缺口最清楚的一档 */
    cross: 0.34,
    /**
     * 纵向轮廓：
     *   'straight' 直锥 = 一块方双锥（凸，最干净）
     *   'waisted'  束腰（中段收窄，腰上留一道真棱）
     *   'bellied'  鼓腹（中段外扩，腰上是凸折）
     */
    profile: 'straight',
    /** 腰的位置（沿半支，0..1）与那一处的半宽相对直锥的比 */
    waistAt: 0.46,
    waist: 0.74,
    /** 尖端：相对赤道半宽的钝度。0 = 尖；0.10 以下读作「被磨过的尖」 */
    tip: 0.0,
    /** 着色上的圆角半径（体单位）。NEXUS 用 0.028，它的晶体半径 ~1.1 */
    edgeW: 0.030,
  },
  /** 取景：以视高的一半为单位 —— half = 1/fit，星的最远尖走到 1，占画框 80% */
  fit: 0.80,
  camDist: 8.0,
  /** 着色参数。默认值与 NEXUS 的 uniform 取值对齐（见 nexus-slice.ts 的 render()） */
  look: {
    ior: 1.52,
    /**
     * 两张暗卡的增益。NEXUS 那颗是**凸**体，一张卡能横贯整个晶体；
     * 这颗星凹，六支互相遮挡，卡只从内凹的缺口里露一角 —— 同一份 env 原样搬过来，
     * 量出来 p1 明度 157、参考图 92：偏灰。补到 2.2 后 p1 119、p10 148，
     * 与参考的 92 / 173 落在同一条跨度上（见 notes §2 的标定表）。
     */
    cardGain: 2.2,
    /** 薄膜虹彩：只上在反射里（NEXUS 0.16） */
    irid: 0.16,
  },
  /** 两个口径的尺寸：进正文与主视觉。dpr 2 出货 */
  sizes: [240, 400],
  dpr: 2,
  /** 着色采样：每轴 2 → 每像素 4 条线（抗锯齿全在着色器里做，不靠浏览器缩图） */
  ss: 2,
  /** 定格档数。12 / 16 / 24 都评分，发货那一档见 nFrames 与 .shots/geo.json */
  nFrames: 16,
  /** 一帧持有多久 —— star-v-motion §4 量过：110ms 是「定格」与「闪烁」的分界 */
  holdMs: 110,
  pass: 55,
  good: 70,
};

/* ── 几何：一支（或半支）→ 一组半空间（体空间，法向已归一） ─────────
   轮廓是一串站 [{h, b}]，h 沿半支从 0 到 1（1 = 尖端），b 是那一处的半宽。
   相邻两站之间是一段**方台**：4 张侧面 + 2 张端面 = 6 面。凸。 */
export function profileStations(P) {
  const B = P.cross;
  const tipB = P.tip * B;
  const st = [{ h: 0, b: B }];
  if (P.profile !== 'straight') {
    const hw = clamp(P.waistAt, 0.08, 0.92);
    /* 直锥在 hw 处的半宽是 B(1−hw)；waisted 把它乘 waist(<1)，bellied 乘 >1 */
    st.push({ h: hw, b: B * (1 - hw) * P.waist });
  }
  st.push({ h: 1, b: tipB });
  return st;
}

/** 一段方台 → 半空间表。轴 a，横轴 u、v；sgn 是正半支还是负半支 */
function frustumPlanes(a, u, v, sgn, s0, s1) {
  const dh = Math.max(1e-9, s1.h - s0.h);
  const out = [];
  const push = (n, w) => {
    const L = Math.hypot(n[0], n[1], n[2]);
    if (L > 1e-9) out.push([n[0] / L, n[1] / L, n[2] / L, w / L]);
  };
  /* 侧面：半宽从 b0 线性收到 b1，于是面的斜率是 (b0−b1)/dh，沿 h 的方向 sgn·a。
     面的偏移恒为 b0（不管朝 +u 还是 −u，截面在那一侧的边界都在 |u| = b0 上）。 */
  const alpha = (sgn * (s0.b - s1.b)) / dh;
  for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = [0, 0, 0];
    n[u] = du; n[v] = dv; n[a] = alpha;
    push(n, s0.b + alpha * sgn * s0.h);
  }
  /* 两张端面 */
  const n0 = [0, 0, 0]; n0[a] = -sgn; push(n0, -s0.h);
  const n1 = [0, 0, 0]; n1[a] = sgn; push(n1, s1.h);
  return out;
}

/**
 * 整颗星 → 凸块表。直锥每轴一块（八面，两块半锥并入），
 * 带腰的每轴两块（腰上一道真棱）。
 */
export function buildPieces(P) {
  const st = profileStations(P);
  const pieces = [];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    if (st.length === 2) {
      /* 直锥：两块半锥共享赤道面，并成一块 —— 丢掉两张赤道端面就是那颗方双锥 */
      const faces = [
        ...frustumPlanes(a, u, v, 1, st[0], st[1]).filter((f) => {
          const ax = f[a];
          return !(Math.abs(Math.abs(ax) - 1) < 1e-6 && Math.abs(f[3]) < 1e-6);
        }),
        ...frustumPlanes(a, u, v, -1, st[0], st[1]).filter((f) => {
          const ax = f[a];
          return !(Math.abs(Math.abs(ax) - 1) < 1e-6 && Math.abs(f[3]) < 1e-6);
        }),
      ];
      pieces.push({ axis: a, sgn: 0, faces });
    } else {
      for (const sgn of [1, -1])
        for (let i = 0; i + 1 < st.length; i++)
          pieces.push({ axis: a, sgn, seg: i, faces: frustumPlanes(a, u, v, sgn, st[i], st[i + 1]) });
    }
  }
  return pieces;
}

/* ── 剪影掩码：每半支在视平面上的凸包，逐支光栅化取并 ───────────────
   每半支在最坏情况下是凸的（带腰时两段的并仍是凸包内的一个星形，但取凸包
   对「六支半径 / 六重谐波」这两项足够 —— 而 balance 一项用的是精确的轴投影，
   不受掩码影响）。故掩码只喂 aspect / a6 / sixShare。 */
function hull2(pts) {
  const p = pts.slice().sort((A, B) => A[0] - B[0] || A[1] - B[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

const HALF_VIEW = 1.15;
function maskOf(P, M, size = 96) {
  const mask = new Uint8Array(size * size);
  const st = profileStations(P);
  const sc = size / 2 / HALF_VIEW;
  const c = size / 2;
  const xs = [];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    for (const sgn of [1, -1]) {
      const proj = [];
      for (const s of st)
        for (const [du, dv] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
          const p = [0, 0, 0];
          p[a] = sgn * s.h; p[u] = du * s.b; p[v] = dv * s.b;
          const q = SF.mApply(M, p);
          proj.push([q[0], q[1]]);
        }
      const H = hull2(proj);
      if (H.length < 3) continue;
      let minY = Infinity, maxY = -Infinity;
      for (const q of H) { if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
      const y0 = Math.max(0, Math.floor(c + minY * sc));
      const y1 = Math.min(size - 1, Math.ceil(c + maxY * sc));
      for (let y = y0; y <= y1; y++) {
        const wy = (y + 0.5 - c) / sc;
        xs.length = 0;
        for (let i = 0; i < H.length; i++) {
          const A = H[i], Bq = H[(i + 1) % H.length];
          if (A[1] === Bq[1]) continue;
          if (wy >= A[1] !== wy >= Bq[1]) xs.push(A[0] + ((wy - A[1]) / (Bq[1] - A[1])) * (Bq[0] - A[0]));
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xa = Math.max(0, Math.ceil(c + xs[k] * sc - 0.5));
          const xb = Math.min(size - 1, Math.floor(c + xs[k + 1] * sc - 0.5));
          for (let x = xa; x <= xb; x++) mask[y * size + x] = 1;
        }
      }
    }
  }
  return mask;
}

const BINS = 720;
function radialProfile(mask, size) {
  const c = size / 2;
  const R = new Float32Array(BINS);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!mask[y * size + x]) continue;
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const r = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx); if (ang < 0) ang += Math.PI * 2;
    const b = Math.min(BINS - 1, (ang / (Math.PI * 2)) * BINS) | 0;
    if (r > R[b]) R[b] = r;
  }
  return R;
}
function harmonic(R, k) {
  let re = 0, im = 0, sum = 0;
  for (let i = 0; i < BINS; i++) {
    const th = ((i + 0.5) / BINS) * Math.PI * 2;
    re += R[i] * Math.cos(k * th); im += R[i] * Math.sin(k * th); sum += R[i];
  }
  return sum > 0 ? (2 * Math.hypot(re, im)) / sum : 0;
}

/* 与 star-v-motion / star-final 同一套四项权重；a6 的基准换成本形正位的实测值，
   于是「正位 = 100」这条不变量仍然成立，而坏姿态真的掉得下去。 */
export const SCORE_W = { balance: 0.44, aspect: 0.26, a6: 0.2, sixShare: 0.1 };
const A6_REF = { v: 0.434 };

function measure(P, M, size = 96) {
  const mask = maskOf(P, M, size);
  const c = size / 2;
  let area = 0, mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!mask[y * size + x]) continue;
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    area++; mx += dx; my += dy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (!area) return { balance: 0, aspect: 0, a6: 0, sixShare: 0, score: 0, radii: [] };
  mx /= area; my /= area;
  sxx = sxx / area - mx * mx; syy = syy / area - my * my; sxy = sxy / area - mx * my;
  const tr = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (sxx * syy - sxy * sxy)));
  const l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
  const aspect = Math.sqrt(l2 / l1);
  const R = radialProfile(mask, size);
  const a3 = harmonic(R, 3), a4 = harmonic(R, 4), a5 = harmonic(R, 5), a6 = harmonic(R, 6);
  const sixShare = a6 / Math.max(1e-6, a3 + a4 + a5 + a6);
  /* 六支的投影半径：正对镜头那一支的 0 也算进来（不剔 —— 那份 0 就是坏姿态的定义） */
  const radii = SF.frames(M).map((p) => p.Lxy);
  const rMax = Math.max(...radii);
  const balance = rMax > 0 ? Math.min(...radii) / rMax : 0;
  const cl01 = (v) => clamp(v, 0, 1);
  const score = Math.round(
    100 *
      (SCORE_W.balance * cl01(balance) +
        SCORE_W.aspect * cl01((aspect - 0.5) / 0.38) +
        SCORE_W.a6 * cl01(a6 / A6_REF.v) +
        SCORE_W.sixShare * cl01((sixShare - 0.42) / 0.4)),
  );
  return { balance, aspect, a6, sixShare, radii, score };
}

/* 用正位实测的 a6 归一：形变了基准跟着变，否则「正位 = 100」不成立 */
{
  const m0 = measure(BAKE.shape, SF.M_REST, 96);
  A6_REF.v = m0.a6 || 0.434;
}

export const poseAt = (u) => SF.poseAt(u, SF.M_REST, SF.TUMBLE);

/** 沿整条翻动路径逐点真算（不是查表近似） */
export function poseScores(n = 300) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    rows.push({ u: +u.toFixed(4), score: measure(BAKE.shape, poseAt(u), 96).score });
  }
  return rows;
}

const evenPicks = (n) => Array.from({ length: n }, (_, i) => i / (n - 1));

/**
 * 贪心选格 —— 依据是量出来的，不是愿出来的。
 *
 * 先把事实摆清楚（`.motion.mjs` 的量，见 notes §4）：
 *   · 这条翻动路径**只在 u≈0–0.45 真的在翻**：相邻 0.05 的剪影 IoU 从 0.64 一路升到 0.94；
 *   · u ≥ 0.65 之后 IoU 恒为 1.000 —— 已经落定，再取多少格都是同一张图。
 *   · 全路径的最低分 43 落在 u≈0.067（两支同时转、剪影塌成四条腿的那一格）。
 *
 * 均匀取格在两头都错：16 步的第 2 格正好停在 u=0.0667（43 分），
 * 而**定格会在这一格停住 110ms** —— 把一次 36ms 的路过变成一次凝视；
 * 末尾又用七格重复同一张画。
 *
 * 所以这里改成一次真优化（动态规划）：
 *   ① 相邻两格的剪影 IoU 落在 [LO, HI]：上界拦住「同一张图」，下界拦住「一跳到另一个形状」；
 *   ② 相邻两格的 u 间距不小于 MIN_STEP：防止几格挤在同一个角度上；
 *   ③ 目标：最大化所选姿态里的**最低分**；
 *   ④ 端点钉死 0 与 1（两个都是体对角视角的满分姿态，起手与落定都是那张正六芒星）。
 *
 * 结果（不随参数波动，写死在 .shots/geo.json 里）：16 格、最低 65 分、零难看格、
 * 相邻 IoU 0.62–0.98。均匀 16 步是 43 分 / 一格难看。
 */
export function greedyPicks(scores, n) {
  const P = BAKE.shape;
  const SIZE = 48;
  const MI = SIZE * SIZE;
  const US = scores.map((r) => r.u);
  const SC = scores.map((r) => r.score);
  const N = US.length;
  const MASKS = US.map((u) => maskOf(P, poseAt(u), SIZE));
  const iouCache = new Map();
  const iou = (i, j) => {
    const key = i * 1000 + j;
    const hit = iouCache.get(key);
    if (hit !== undefined) return hit;
    const a = MASKS[i], b = MASKS[j];
    let it = 0, un = 0;
    for (let t = 0; t < MI; t++) { if (a[t] && b[t]) it++; if (a[t] || b[t]) un++; }
    const v = un ? it / un : 1;
    iouCache.set(key, v);
    return v;
  };

  const HI = 0.97, LO = 0.30, MIN_STEP = 0.006, MAX_STEP = 0.3;
  /* scores 的采样间距就是 1/300，所以「u 的差」换成「下标差」要乘 300 */
  const per = 1 / (US[1] - US[0]);
  const gmin = Math.max(1, Math.round(MIN_STEP * per));
  const gmax = Math.max(gmin, Math.round(MAX_STEP * per));

  const best = Array.from({ length: n }, () => new Float64Array(N).fill(-1));
  const from = Array.from({ length: n }, () => new Int16Array(N).fill(-1));
  best[0][0] = 1e9;
  for (let j = 1; j < n; j++)
    for (let i = 0; i < N; i++) {
      if (SC[i] < 50) continue;
      let bv = -1, bf = -1;
      for (let d = gmin; d <= gmax; d++) {
        const p = i - d;
        if (p < 0) break;
        const pv = best[j - 1][p];
        if (pv < 0) continue;
        const q = iou(p, i);
        if (q > HI || q < LO) continue;
        const v = Math.min(pv, SC[i]);
        if (v > bv) { bv = v; bf = p; }
      }
      best[j][i] = bv; from[j][i] = bf;
    }

  /* 末格必须正好是 u = 1（落定回正位）。达不到约束就退回均匀，并且说出来 */
  if (best[n - 1][N - 1] < 0) {
    console.warn('greedyPicks: 约束下无解，退回均匀取格');
    return evenPicks(n);
  }
  const path = [];
  let i = N - 1;
  for (let j = n - 1; j >= 0; j--) { path.push(i); i = from[j][i]; if (j === 0) break; }
  return path.reverse().map((i) => +US[i].toFixed(4));
}

const scoreNear = (scores, u) => scores.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)).score;

/** 相邻两格的剪影 IoU —— 用来确认「每一格都看得出换了面」，不是挤在一起的同一张图 */
function iouOf(P, u0, u1, size = 64) {
  const a = maskOf(P, poseAt(u0), size);
  const b = maskOf(P, poseAt(u1), size);
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 1;
}
export { iouOf as __iou };
export const __mask = (P, u, size) => maskOf(P, poseAt(u), size);

/* ── 着色 uniform：与 nexus-slice.ts 的 render() 取值对齐 ───────────── */
export function lookFor(dream) {
  const d = dream ? 1 : 0;
  return {
    dream: d,
    core: 0.5 + 0.95 * d,
    coreC: [0, 0.04 + 0.1 * d, 0],
    rough: 0.45 - 0.12 * d,
    edgeW: BAKE.shape.edgeW,
    ior: BAKE.look.ior,
    cardGain: BAKE.look.cardGain,
    filmAmt: BAKE.look.irid,
  };
}

export function renderArgs(poseU, dream, px, opts = {}) {
  const half = 1 / BAKE.fit;
  const look = { ...lookFor(dream), ...(opts.look || {}) };
  return {
    px,
    M: poseAt(poseU),
    pieces: buildPieces(BAKE.shape).map((p) => p.faces),
    camDist: BAKE.camDist,
    tanFov: half / BAKE.camDist,
    ss: opts.ss ?? BAKE.ss,
    bg: opts.bg ? (opts.bgCol || [0.941, 0.953, 0.965]) : null,
    ...look,
  };
}

/* ── CLI ─────────────────────────────────────────────────────────── */
const SEG = process.argv[2] || 'all';
/* 被别的脚本 import（.diag.mjs 之类）时只导出函数，不跑 CLI */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

if (IS_MAIN) {
if (SEG === 'geo' || SEG === 'all') {
  log('geo — 几何与姿态');
  const P = BAKE.shape;
  const pieces = buildPieces(P);
  const scores = poseScores(300);
  const sets = {};
  for (const n of [12, 16, 24]) {
    for (const mode of ['even', 'greedy']) {
      const us = mode === 'even' ? evenPicks(n) : greedyPicks(scores, n);
      const sc = us.map((u) => scoreNear(scores, u));
      const ious = us.slice(1).map((u, i) => +iouOf(P, us[i], u).toFixed(3));
      sets[`${mode}${n}`] = {
        us: us.map((u) => +u.toFixed(4)),
        scores: sc,
        ious,
        iouMin: Math.min(...ious),
        iouMax: Math.max(...ious),
        min: Math.min(...sc),
        minAt: +us[sc.indexOf(Math.min(...sc))].toFixed(4),
        ugly: sc.filter((s) => s < BAKE.pass).length,
        good: sc.filter((s) => s >= BAKE.good).length,
        uglyMs: sc.filter((s) => s < BAKE.pass).length * BAKE.holdMs,
        totalMs: n * BAKE.holdMs,
      };
    }
  }
  const rest = measure(P, SF.M_REST, 96);
  const sorted = scores.map((r) => r.score).sort((a, b) => a - b);
  const out = {
    at: new Date().toISOString(),
    shape: P,
    geo: {
      pieces: pieces.length,
      facesPerPiece: pieces.map((p) => p.faces.length),
      planes: pieces.reduce((a, p) => a + p.faces.length, 0),
      stations: profileStations(P),
    },
    rest: {
      score: rest.score,
      balance: +rest.balance.toFixed(4),
      aspect: +rest.aspect.toFixed(4),
      a6: +rest.a6.toFixed(4),
      radii: rest.radii.map((v) => +v.toFixed(4)),
    },
    a6Ref: +A6_REF.v.toFixed(4),
    curve: { n: sorted.length, min: sorted[0], p10: sorted[30], median: sorted[150], max: sorted.at(-1), samples: scores },
    sets,
  };
  fs.writeFileSync(path.join(SHOTS, 'geo.json'), JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        geo: out.geo,
        rest: out.rest,
        a6Ref: out.a6Ref,
        curve: { min: out.curve.min, median: out.curve.median, max: out.curve.max },
        sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, { min: v.min, ugly: v.ugly, good: v.good }])),
      },
      null,
      2,
    ),
  );
}

if (SEG === 'probe' || SEG === 'all') {
  const { renderFrames } = await import(pathToFileURL(path.join(HERE, '.render.mjs')).href);
  await renderFrames({
    renderArgs, SHOTS, log,
    jobs: [
      { name: 'probe-wake', poseU: 0, dream: 0, px: 512, bg: true },
      { name: 'probe-dream', poseU: 0, dream: 1, px: 512, bg: true },
      { name: 'probe-mid', poseU: 0.42, dream: 0, px: 512, bg: true },
    ],
  });
}

if (SEG === 'render' || SEG === 'all') {
  const { renderFrames } = await import(pathToFileURL(path.join(HERE, '.render.mjs')).href);
  const scores = poseScores(300);
  const us = greedyPicks(scores, BAKE.nFrames);
  const jobs = [];
  for (const size of BAKE.sizes)
    for (const dream of [0, 1])
      us.forEach((u, i) =>
        jobs.push({
          name: `f${String(i).padStart(2, '0')}`,
          poseU: u,
          dream,
          px: size * BAKE.dpr,
          dir: path.join(FRAMES, 'base', String(size), dream ? 'dream' : 'wake'),
        }),
      );
  fs.writeFileSync(path.join(SHOTS, 'poses.json'), JSON.stringify({ n: us.length, us: us.map((u) => +u.toFixed(4)), holdMs: BAKE.holdMs, sizes: BAKE.sizes, dpr: BAKE.dpr }, null, 2));
  await renderFrames({ renderArgs, SHOTS, log, jobs });
}

if (SEG === 'pack' || SEG === 'all') {
  const { pack } = await import(pathToFileURL(path.join(HERE, '.pack.mjs')).href);
  await pack({ BAKE, FRAMES, SHOTS, log });
}
}