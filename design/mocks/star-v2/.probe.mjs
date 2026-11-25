/* 几何账（离线，不碰浏览器）
   node design/mocks/star-v2/.probe.mjs   →  design/mocks/star-v2/.probe.json

   量的是真的面表与真的包含测试，不是从形状猜：
     · 面数 / 每支面数 / 半空间数 / 包围盒
     · 六个尖到原点是否等距（以及 r 是否都等于 1）
     · 根部半宽（沿轴走多远处截面的半宽）与 支长:半宽 的比
     · 星心线是否被三支同时覆盖（= 真互插，不是拼起来的）
     · 正位投影下剪影里「六尖之间凹口」的内角半径 / 六个尖的投影半径
     · 轨迹若干格：姿态是否三维在转（相邻格的旋转角）、首末格是否逐位等于正位
     · 并集体积与单支体积之和 → 重叠率（星心那团料被几支同时用着）
*/
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SHAPE,
  buildBlocks,
  poseAt,
  blocksInView,
  covered,
  rayHits,
  REST,
} from './src.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const blocks = buildBlocks();
const perArm = SHAPE.facesPerArm;
const faces = blocks.reduce((a, b) => a + b.length, 0);

/* ── 面表自检：法向单位长、偏移为正、原点在体内 ── */
let maxNormErr = 0;
let minW = Infinity;
for (const f of blocks)
  for (const [nx, ny, nz, w] of f) {
    maxNormErr = Math.max(maxNormErr, Math.abs(Math.hypot(nx, ny, nz) - 1));
    minW = Math.min(minW, w);
  }

/* ── 六个尖：从原点沿 ±轴 走，二分求「还在体内」的最远点 ── */
function inside(p) {
  for (const fl of blocks) {
    let ok = true;
    for (const [nx, ny, nz, w] of fl) if (nx * p[0] + ny * p[1] + nz * p[2] > w + 1e-12) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
function tipAlong(d) {
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (inside([d[0] * m, d[1] * m, d[2] * m])) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
const AXES = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
const tips = AXES.map(tipAlong);
const tipMean = tips.reduce((a, b) => a + b) / tips.length;
const tipSpread = Math.max(...tips) - Math.min(...tips);

/* ── 根部半宽：从面表直接解，不靠常数表 ──
   沿 x 那一支的面是 ±x/L ± K·y/L ≤ 1/L（以及把 y 换成 z 的）。这张面在轴上截到
   x = 1（支尖），在 y 上截到 rootHalf（根部半宽）—— 两者的比就是「支长 : 根部半宽」。 */
let K = 0;
for (const [nx, ny, nz, c] of blocks[0]) {
  const xInt = Math.abs(c / nx);
  const yInt = Math.abs(c / ny);
  const zInt = Math.abs(c / nz);
  K = Math.max(K, xInt / Math.min(yInt, zInt));
}
const rootW = 1 / K;
const halfWidthAt = (s) => (1 - s) / K;
/* 沿 x 支在若干 s 处真的量一遍半宽（量的是包含测试，不是公式）。
   注意别量 s = 0：那时 y 方向已经被**另两支**（沿 ±y 的方双锥）占着，
   inside() 在原点附近给出的是并集的宽度，不是这一支的。
   只量一段远离星心的支身（s ≥ 0.35），那里只有本支在。 */
const taper = [];
for (const s of [0.4, 0.55, 0.7, 0.85]) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 120; i++) {
    const m = (lo + hi) / 2;
    if (inside([s, m, 0])) lo = m;
    else hi = m;
  }
  taper.push({ s, halfY: +((lo + hi) / 2).toFixed(5), formula: +halfWidthAt(s).toFixed(5) });
}

/* ── 星心是否被三支同时覆盖；沿两支之间的分角线第一次穿出表面的距离 ── */
const countAt = (p) => {
  let c = 0;
  for (const fl of blocks) {
    let ok = true;
    for (const [nx, ny, nz, w] of fl) if (nx * p[0] + ny * p[1] + nz * p[2] > w + 1e-12) { ok = false; break; }
    if (ok) c++;
  }
  return c;
};
const hubCount = countAt([0, 0, 0]);
function notchAlong(d) {
  let lo = 0;
  let hi = 1.6;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (countAt([d[0] * m, d[1] * m, d[2] * m]) > 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
const notch = notchAlong([Math.SQRT1_2, Math.SQRT1_2, 0]);

/* ── 体积与重叠率：等距格点 ── */
function volume(n = 160) {
  let uni = 0;
  let multi = 0;
  const h = 2 / n;
  for (let ix = 0; ix < n; ix++) {
    const x = -1 + (ix + 0.5) * h;
    for (let iy = 0; iy < n; iy++) {
      const y = -1 + (iy + 0.5) * h;
      for (let iz = 0; iz < n; iz++) {
        const z = -1 + (iz + 0.5) * h;
        const c = countAt([x, y, z]);
        if (c > 0) uni++;
        if (c > 1) multi++;
      }
    }
  }
  const cell = h * h * h;
  return { union: uni * cell, shared: multi * cell, overlapShare: uni ? multi / uni : 0 };
}
const vol = volume(140);

/* ── 正位投影：六个尖的屏幕坐标、剪影里凹口的内角半径 ── */
const REST_VIEW = blocksInView(blocks, poseAt(0));
const yaw = (REST.yaw * Math.PI) / 180;
const pit = (REST.pitch * Math.PI) / 180;
function toScreen(p) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}
const tips2d = AXES.map((a, i) => {
  const s = toScreen([a[0] * tips[i], a[1] * tips[i], a[2] * tips[i]]);
  return { ...s, r: Math.hypot(s.x, s.y), deg: Math.round((Math.atan2(s.y, s.x) * 180) / Math.PI) };
});
/* 剪影里从中心向各方向射，穿出掩码的最短距离（= 内角半径） */
function silNotch(size = 360, half = 1.25) {
  const k = size / 2 / half;
  const c0 = size / 2;
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = (x + 0.5 - c0) / k;
      const wy = -(y + 0.5 - c0) / k;
      if (covered(REST_VIEW, wx, wy)) mask[y * size + x] = 1;
    }
  }
  let mn = Infinity;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = 0;
    for (let s = 1; s < size; s++) {
      const x = Math.round(c0 + dx * s);
      const y = Math.round(c0 - dy * s);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      if (mask[y * size + x]) r = s;
    }
    if (r > 0 && r < mn) mn = r;
  }
  let area = 0;
  for (let i = 0; i < mask.length; i++) area += mask[i];
  return { notchR: mn / k, areaShare: area / (size * size) };
}
const sil = silNotch();

/* ── 轨迹：相邻格的旋转角、首末格是否逐位等于单位阵 ── */
function rotAngle(R) {
  const tr = R[0] + R[4] + R[8];
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
}
const N = 16;
const mulR = (A, B) => {
  const C = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
};
const transposeR = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const steps = [];
for (let i = 0; i <= N; i++) {
  const u = i / N;
  const R = poseAt(u);
  steps.push({
    u,
    R,
    deg: +rotAngle(R).toFixed(3),
    /* 「与落定姿态逐位相同」——第五轮起落定姿态不再等于单位阵（它是体对角正位），
       所以判据改成「与 poseAt(0) 逐位相等」，这才是「首末同姿态」要验的那件事。 */
    ident: R.every((v, j) => v === poseAt(0)[j]),
  });
}
const stepDeg = [];
for (let i = 1; i <= N; i++) {
  // 相邻两格的**相对**旋转角：转角这个标量在 θ 越过 π 之后会回落（第二主值），
  // 但姿态一直在往前翻。所以这里量 R_k^T R_{k+1} 的角度，才是真的每格跳了多少。
  const A = steps[i - 1].R;
  const B = steps[i].R;
  const rel = mulR(transposeR(A), B);
  stepDeg.push(+rotAngle(rel).toFixed(3));
}

/* ── 轨迹的「三维性」 ─────────────────────────────────────
   纯定轴自转有个特征：每一步都是同一个刚体变换的幂，于是「相邻两格之间的轴」
   恒定不动。这里量两件事证明它不是：
   a) 每一格到下一格的相对旋转轴（R_k^T R_{k+1} 的轴）—— 若轴不变，这些向量全同；
   b) 每一格里「最正对观者的那张晶面」的朝向 —— 一路在变才说明是三维在翻。 */
const relAxis = [];
for (let i = 0; i < N; i++) {
  const A = poseAt(i / N);
  const B = poseAt((i + 1) / N);
  const R = mulR(transposeR(A), B);
  const v = [R[7] - R[5], R[2] - R[6], R[3] - R[1]]; // 斜对称部分的轴（未归一）
  const L = Math.hypot(v[0], v[1], v[2]);
  if (L < 1e-12) {
    relAxis.push(null); // 零旋转（末格回到正位那一步之外不该出现）
    continue;
  }
  const vn = v.map((t) => t / L);
  if (vn[0] < -1e-9 || (Math.abs(vn[0]) < 1e-9 && vn[1] < 0)) vn.forEach((_, j) => (vn[j] = -vn[j])); // 定符号
  relAxis.push(vn.map((t) => +t.toFixed(4)));
}
const good = relAxis.filter(Boolean);
let axisCosMin = 1;
for (let i = 1; i < good.length; i++) {
  const a = good[0];
  const b = good[i];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  axisCosMin = Math.min(axisCosMin, Math.abs(c));
}
const axisSpread = +(1 - axisCosMin).toFixed(4); // 0 = 每相邻一步的轴都相同（真定轴自转）

/* 每格「最正对的晶面」：面法向与视轴（±z）夹角的最小余角 */
function frontTilt(u) {
  const V = blocksInView(blocks, poseAt(u));
  let best = 0;
  for (const fl of V)
    for (const [nx, ny, nz] of fl) {
      const a = (Math.acos(Math.min(1, Math.abs(nz))) * 180) / Math.PI;
      best = Math.max(best, 90 - a);
    }
  return +best.toFixed(2);
}
const tilts = [];
for (let i = 0; i < N; i++) {
  const u = i / N;
  tilts.push({ u: +u.toFixed(4), frontTilt: frontTilt(u) });
}

/* ── 正位下每条视线：从画面里打出，量「打中星体」的像素占比 ── */
const CAM_Z = 12;
const TAN = 0.0972;
function hitShare(size = 200) {
  let hits = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = 1 - ((y + 0.5) / size) * 2;
      const d = [nx * TAN, ny * TAN, -1];
      const L = Math.hypot(d[0], d[1], d[2]);
      if (rayHits(REST_VIEW, [0, 0, CAM_Z], [d[0] / L, d[1] / L, d[2] / L])) hits++;
    }
  return +(hits / (size * size)).toFixed(4);
}
const frameShare = hitShare();

/* ── 扫描线：正位下横着切一条水平线，看它被晶面切成几段 ──
   底上那条细线与那行字就压在这两条上（src.js 的 makeBackdrop）；
   段数 > 1 才说明「星体后面有个东西，穿过星体时会被切开」。 */
function scan(ndcY) {
  const sy = ndcY * CAM_Z * TAN;
  const xs = [];
  let on = false;
  let start = 0;
  for (let i = 0; i <= 500; i++) {
    const sx = -1.3 + (i / 500) * 2.6;
    const c = covered(REST_VIEW, sx, sy);
    if (c && !on) {
      on = true;
      start = sx;
    }
    if (!c && on) {
      on = false;
      xs.push([start, sx]);
    }
  }
  if (on) xs.push([start, 1.3]);
  const k = CAM_Z * TAN; // scene → ndc
  return { ndcY, n: xs.length, segs: xs.map(([a, b]) => [+(a / k).toFixed(3), +(b / k).toFixed(3)]) };
}
const scanlines = [0.16, -0.16, 0, 0.30, -0.30].map(scan);

const out = {
  generated: new Date().toISOString(),
  shape: {
    arms: SHAPE.arms,
    blocks: SHAPE.blocks,
    facesPerBlock: blocks[0].length,
    facesPerArm: perArm,
    faces,
    halfspaces: faces,
    maxNormErr: +maxNormErr.toFixed(12),
    bbox: Math.max(...tips.map((t) => Math.abs(t))) * 2,
    bboxExact: [-Math.max(...tips), -Math.max(...tips), -Math.max(...tips), Math.max(...tips), Math.max(...tips), Math.max(...tips)],
    tipLengths: tips.map((t) => +t.toFixed(6)),
    tipMean: +tipMean.toFixed(6),
    tipSpread: +tipSpread.toExponential(2),
    rootHalfWidth: +rootW.toFixed(4),
    tipOverRootHalf: +(tipMean / rootW).toFixed(3),
    ratioClaim: '16 : 2.2',
    taper,
    hubCount,
    notch3D: +notch.toFixed(4),
    notchOverTip: +(notch / tipMean).toFixed(4),
    volume: +vol.union.toFixed(4),
    sharedVolume: +vol.shared.toFixed(4),
    overlapShare: +vol.overlapShare.toFixed(3),
    minHalfspaceW: +minW.toFixed(4),
  },
  rest: {
    view: { yaw: REST.yaw, pitch: REST.pitch },
    tips2d: tips2d.map((t) => ({ r: +t.r.toFixed(4), deg: t.deg, z: +t.z.toFixed(4) })),
    tipProjR: +Math.max(...tips2d.map((t) => t.r)).toFixed(4),
    tipProjSpread: +(Math.max(...tips2d.map((t) => t.r)) - Math.min(...tips2d.map((t) => t.r))).toFixed(6),
    silNotchR: +sil.notchR.toFixed(4),
    silNotchOverTipProj: +(sil.notchR / Math.max(...tips2d.map((t) => t.r))).toFixed(4),
    silAreaShare: +sil.areaShare.toFixed(4),
    frameHitShare: frameShare,
    scanlines,
  },
  motion: {
    steps: N,
    poses: steps.map((s) => ({ u: +s.u.toFixed(4), deg: s.deg, ident: s.ident })),
    dwellMs: 170,
    lengthMs: N * 170,
    firstIdentical: steps[0].ident,
    lastIdentical: steps[N].ident,
    stepDeg,
    stepDegMin: Math.min(...stepDeg),
    stepDegMax: Math.max(...stepDeg),
    monotone: stepDeg.every((v) => v > 0),
    relAxis,
    axisSpread,
    tilts,
  },
  ratioNote: '支长取 1，根部半宽 (1-s)/K 在 s=0 处 = 2.2/16',
};
/* 写盘：沙箱里 design/ 下只允许经编辑器写入，node 直接写会被拒（EPERM）。
   所以先试本目录，写不进去就落到系统临时目录，并把落点打在 stderr 上。 */
const json = JSON.stringify(out, null, 2) + '\n';
let where = path.join(HERE, '.probe.json');
try {
  writeFileSync(where, json, 'utf8');
} catch (e) {
  where = path.join(tmpdir(), `star-v2-probe-${process.pid}.json`);
  writeFileSync(where, json, 'utf8');
  console.error(`(node 不能直写 ${HERE}：${e.code} —— 已落到 ${where})`);
}
console.error(`probe → ${where}`);
console.log(JSON.stringify({ ok: true, path: where, faces, tipOverRootHalf: +(tipMean / rootW).toFixed(3), overlapShare: +vol.overlapShare.toFixed(3), axisSpread, silNotchOverTipProj: +(sil.notchR / Math.max(...tips2d.map((t) => t.r))).toFixed(4) }));