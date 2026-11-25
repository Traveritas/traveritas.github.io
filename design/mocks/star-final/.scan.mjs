/* 合成 · 离线读数（Node，不开浏览器）
   node design/mocks/star-final/.scan.mjs
   输出 .shots/scan.json，并把 summary 打到 stdout。

   它回答五件事：
     §1 合成的那一颗 path 数 / 片数 / 调子 / 凹口 / 支内落差；现役那一颗同样一套数
     §2 脊高两种读法（notes 的「脊高 ÷ 半宽」 vs star-t-smooth 代码里那一档）的落差
     §3 曲率两种转移规则（同一个 0.04 / 按半宽等比放大）的腰与尖角
     §4 八个体对角姿态两两 IoU（「停在哪一格都是同一张图」的复核）
     §5 四条候选翻动路径的难看账：等时 vs 提速后
   顺手生成提速表（warp），页面直接吃 scan.json 里的那张表。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  build,
  syncOpts,
  prodOpts,
  SYNC,
  halfW,
  stationAt,
  stations,
  chordLen,
  L_ISO,
  frames,
  M_REST,
  mYawPitch,
  mMul,
  mAxis,
  outlinePoly,
  rasterizePolys,
  rasterTone,
  frameDiff,
  maskIoU,
  measurePose,
  scoreOf,
  SCORE_W,
  A6_REF,
  GOOD,
  PASS,
  poseAt,
  TUMBLE,
  ISO,
  GROUNDS,
} from './src.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const r4 = (v) => +Number(v).toFixed(4);
const r3 = (v) => +Number(v).toFixed(3);

/* ── §1 两颗星的读数 ─────────────────────────────────────── */
const prod = build(prodOpts({}));
const sync = build(syncOpts({}));

const toneList = (res) =>
  [...new Set(res.paths.filter((p) => p.role !== 'hub').map((p) => p.tone ?? p.op))]
    .sort((a, b) => a - b)
    .map((v) => +Number(v).toFixed(3));

const summary = (res, name) => ({
  name,
  paths: res.stats.paths,
  cells: res.stats.cells,
  tones: toneList(res),
  toneCount: toneList(res).length,
  hubMode: res.stats.hubMode,
  notch: res.stats.notch,
  notchAt200: r3((res.stats.notch / 40) * 200),
  notchAt48: r3((res.stats.notch / 40) * 48),
  spineRawMin: res.stats.spineRawMin,
  spineMin: res.stats.spineMin,
  bytes: JSON.stringify(res.paths.map((p) => p.d)).length,
});

const s1 = {
  prod: summary(prod, '现役'),
  sync: summary(sync, '合成'),
  ratioPaths: r3(sync.stats.paths / prod.stats.paths),
  ratioBytes: null,
};
s1.ratioBytes = r3(s1.sync.bytes / s1.prod.bytes);

/* ── §2 脊高两种读法 ─────────────────────────────────────── */
const foldVariants = ['code', 'ratio'].map((mode) => {
  const r = build(syncOpts({ foldMode: mode }));
  const c = r.cfg;
  const st = { s: 0.45 * L_ISO(c.r), W: halfW(0.45, c) };
  const h = mode === 'ratio' ? c.fold * st.W : (c.fold * st.W) / 1.9;
  return {
    mode,
    foldAngleDeg: r3((Math.atan2(h, st.W) * 180) / Math.PI),
    paths: r.stats.paths,
    spineRawMin: r.stats.spineRawMin,
    spineMin: r.stats.spineMin,
    tones: toneList(r).length,
  };
});

/* ── §3 曲率怎么从 w=1.9 转到 w=4.16 ─────────────────────── */
function tipHalfAngle(cfg) {
  /* 尖端半角：投影里最后 0.3 单位那一小段的斜率（atan(ΔW / Δs)）。用投影长度 13.064，
     不是 r —— t-arc 的 8.3° 就是按投影量的。 */
  const a = stationAt(0.995, cfg);
  const Lp = stationAt(1, cfg).s;
  const ds = Lp - a.s;
  return r3((Math.atan2(a.W, ds) * 180) / Math.PI);
}
const wRef = 0.119;
const wNow = SYNC.halfWidth / SYNC.r;
const curveRows = [
  { id: 'none', label: '直边（现役那张风筝）', curve: 0 },
  { id: 'abs', label: '同一个 0.04（绝对值）', curve: 0.04 },
  { id: 'norm', label: '按 w/r 等比放大到 0.26', curve: r4(0.04 * Math.sqrt(wNow / wRef)) },
].map((it) => {
  const cfg = syncOpts({ curve: it.curve });
  const res = build(cfg);
  const wm = halfW(0.5, cfg);
  const wStraight = halfW(0.5, syncOpts({ curve: 0 }));
  return {
    ...it,
    waistPct: r3((wm / wStraight - 1) * 100),
    waistAt: r3(stationAt(0.5, cfg).s / cfg.r),
    tipHalfDeg: tipHalfAngle(cfg),
    notch: res.stats.notch,
    notchAt48: r3((res.stats.notch / 40) * 48),
    notchAt200: r3((res.stats.notch / 40) * 200),
    paths: res.stats.paths,
    spineRawMin: res.stats.spineRawMin,
  };
});
/* 参照：t-arc 在 w = 1.9 上量到的同一组数（口径对齐：同一个解析式） */
const arcRef = (() => {
  const base = { ...prodOpts({}), curve: 0, tS: [0, 0.2, 0.4, 0.58, 0.74, 0.88, 0.96] };
  const a = { ...base };
  const b = { ...base, curve: 0.04 };
  return {
    WmidStraight: r3(halfW(0.5, a)),
    WmidCurve: r3(halfW(0.5, b)),
    waistPct: r3((halfW(0.5, b) / halfW(0.5, a) - 1) * 100),
    waistAt: r3(stationAt(0.5, b).s / b.r),
    tipStraightDeg: tipHalfAngle(a),
    tipCurveDeg: tipHalfAngle(b),
  };
})();

/* ── §4 八个体对角姿态是不是同一张图 ─────────────────────── */
const cfgS = syncOpts({});
const diagMasks = [];
for (const sx of [1, -1])
  for (const sy of [1, -1])
    for (const sz of [1, -1]) {
      /* 视线落在 (±1,±1,±1)：用 dirToYawPitch 那一套，yaw 45/135/225/315，pitch ±35.264 */
      const yaw = (Math.atan2(sx, sz) * 180) / Math.PI;
      const pitch = (Math.asin(sy / Math.sqrt(3)) * 180) / Math.PI;
      const M = mYawPitch((yaw + 360) % 360, pitch);
      diagMasks.push({ dir: [sx, sy, sz], yaw: r3((yaw + 360) % 360), pitch: r3(pitch), mask: rasterizePolys(outlinePoly(cfgS, M, 16), 128) });
    }
let iouMin = 1;
let iouMax = 0;
let pairs = 0;
for (let i = 0; i < diagMasks.length; i++)
  for (let j = i + 1; j < diagMasks.length; j++) {
    const v = maskIoU(diagMasks[i].mask, diagMasks[j].mask);
    pairs++;
    iouMin = Math.min(iouMin, v);
    iouMax = Math.max(iouMax, v);
  }
const diagScores = diagMasks.map((d) => measurePose(cfgS, mYawPitch(d.yaw, d.pitch), 96).score);
/* 顺带：对称操作复核。物体自转 = 右乘（M_rest · R），与 poseAt 一致 */
const sym = [];
for (const [name, R] of [
  ['绕体 x 90°', mAxis([1, 0, 0], 90)],
  ['绕体 y 90°', mAxis([0, 1, 0], 90)],
  ['绕体 z 90°', mAxis([0, 0, 1], 90)],
  ['绕对角线 (1,1,1) 120°', mAxis([1, 1, 1], 120)],
  ['对照：绕体 x 45°', mAxis([1, 0, 0], 45)],
]) {
  const M = mMul(M_REST, R);
  const mask = rasterizePolys(outlinePoly(cfgS, M, 16), 128);
  sym.push({ op: name, iou: r4(maskIoU(mask, diagMasks[0].mask)), score: measurePose(cfgS, M, 96).score });
}
/* 视轴滚（左乘）也算一遍：那是「在屏幕里转」，剪影会变但分数不掉 —— 风车式的依据 */
for (const a of [15, 30, 45, 60]) {
  const M = mMul(mAxis([0, 0, 1], a), M_REST);
  const mask = rasterizePolys(outlinePoly(cfgS, M, 16), 128);
  sym.push({ op: `视轴滚 ${a}°`, iou: r4(maskIoU(mask, diagMasks[0].mask)), score: measurePose(cfgS, M, 96).score });
}

/* ── §5 翻动路径 ─────────────────────────────────────────── */
/**
 * 三条路径。翻动的「路径」= 三轴各转 90° 的整数倍，缓动用欠阻尼弹簧。
 * 差别只在「三轴什么时候起、正着转还是倒着转」——
 * 这三件事决定了它在中途会不会经过「一支正对镜头」的朝向。
 */
const CANDIDATES = [
  {
    id: 'naive',
    label: '三轴同起同止',
    note: '最直白的写法：三轴同时起、同时停、都转 90°。中途会撞上「两支正对镜头」的朝向。',
    sign: [1, -1, 1],
    span: [[0, 1], [0, 1], [0, 1]],
    k: 5,
    w: 6,
  },
  {
    id: 'stagger',
    label: '三轴错开（本页采用）',
    note: '三个轴仍都动，只是起止各错开 6–12%：第一轴晚起 12%、第二轴早停 12%。撞不上那几格。',
    sign: [-1, -1, 1],
    span: [[0.12, 1], [0, 0.88], [0.05, 0.95]],
    k: 7,
    w: 5,
  },
  {
    id: 'windmill',
    label: '绕视线 120°（对照）',
    note: '视线始终沿体对角线、星只在屏幕里转：分数全程满分，但剪影不换面 —— 是「转」不是「翻」。',
    sign: [0, 0, 0],
    span: [[0, 1], [0, 1], [0, 1]],
    k: 5,
    w: 6,
    diag: 120,
    /** 体空间里「映射到视 z」的那条轴 = 正位矩阵的逆作用在 (0,0,1) 上 */
    diagAxis: [-1, 1, 1],
  },
];

const springU = (p, k, w) =>
  (1 - Math.exp(-k * p) * Math.cos(w * p)) / (1 - Math.exp(-k) * Math.cos(w));

function matrixOf(u, c) {
  if (c.diag) return mMul(M_REST, mAxis(c.diagAxis, c.diag * springU(clamp01(u), c.k, c.w)));
  const a = [0, 1, 2].map((j) => {
    const [s0, s1] = c.span[j];
    const p = clamp01((u - s0) / (s1 - s0));
    return 90 * c.sign[j] * springU(p, c.k, c.w);
  });
  return mMul(M_REST, mMul(mAxis([0, 0, 1], a[2]), mMul(mAxis([0, 1, 0], a[1]), mAxis([1, 0, 0], a[0]))));
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const N = 300;
const cand = CANDIDATES.map((c) => {
  const rows = [];
  const masks = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const M = matrixOf(u, c);
    const m = measurePose(cfgS, M, 128);
    rows.push({ u: r4(u), score: m.score, balance: r4(m.balance), a6: r4(m.a6), aspect: r4(m.aspect) });
    /* 视觉差：剪影 IoU + 明暗平均差。只取每隔 5 帧的一对，够报中位数 */
    if (i % 5 === 0) masks.push({ u, tone: rasterTone(cfgS, M, 96) });
  }
  let ugly = 0;
  let mid = 0;
  let mn = 101;
  let mnU = 0;
  for (const r of rows) {
    if (r.score < PASS) ugly++;
    else if (r.score < GOOD) mid++;
    if (r.score < mn) {
      mn = r.score;
      mnU = r.u;
    }
  }
  const diffs = [];
  for (let i = 1; i < masks.length; i++) {
    const d = frameDiff(masks[i - 1].tone, masks[i].tone);
    diffs.push({ u: r3(masks[i].u), iou: d.iou, toneAbs: d.toneAbs });
  }
  diffs.sort((a, b) => a.iou - b.iou);
  const med = diffs[diffs.length >> 1];
  const worst = diffs[0];
  return {
    id: c.id,
    label: c.label,
    note: c.note,
    sign: c.sign,
    span: c.span,
    spring: { k: c.k, w: c.w },
    diag: c.diag || 0,
    steps: rows.length,
    ugly: r3((ugly / rows.length) * 100),
    mid: r3((mid / rows.length) * 100),
    good: r3(((rows.length - ugly - mid) / rows.length) * 100),
    min: mn,
    minU: r4(mnU),
    /** 中途相邻两帧（时钟上相隔 1/60 的 5 个采样）的中位剪影 IoU：越小 = 每步换的面越多 */
    midIoU: med.iou,
    worstIoU: worst.iou,
    worstU: worst.u,
    midToneAbs: med.toneAbs,
    /** 分数曲线，页面上画出来（每 3 个采样取一个，够密也够小） */
    curve: rows.filter((_, i) => i % 3 === 0).map((r) => r.score),
    /** 六格帧条 */
    strip: [0, 0.2, 0.4, 0.6, 0.8, 1].map((u) => ({ u, score: rows[Math.round(u * N)].score })),
  };
});

/* 终点的复核：每条路径都必须落在 100 分，且剪影与正位同一张 */
const ends = CANDIDATES.map((c) => {
  const M = matrixOf(1, c);
  const mask = rasterizePolys(outlinePoly(cfgS, M, 16), 128);
  return {
    id: c.id,
    angles: c.diag ? [0, 0, c.diag] : c.sign.map((s) => 90 * s),
    score: measurePose(cfgS, M, 128).score,
    iouRest: r4(maskIoU(mask, diagMasks[0].mask)),
  };
});

const shipped = cand.find((c) => c.id === 'stagger');
const naive = cand.find((c) => c.id === 'naive');
const DURATION = 1550;
const exposure = {
  shipped: { ugly: shipped.ugly, ms: r3((shipped.ugly / 100) * DURATION) },
  naive: { ugly: naive.ugly, ms: r3((naive.ugly / 100) * DURATION) },
  /** 两条路径各自「至少要多久才看得出是一次翻动」：帧条上的 Visual 差给不了这个，
      改用「中途相邻两帧的 IoU」估：越接近 1 越看不出在动 */
};

/* ── §6 代价 ─────────────────────────────────────────────── */
const t0 = process.hrtime.bigint();
let acc = 0;
for (let i = 0; i < 200; i++) acc += build(syncOpts({ m: poseAt(i / 200) })).paths.length;
const tBuild = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
const t1 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) measurePose(cfgS, poseAt(i / 200), 96);
const tScore = Number(process.hrtime.bigint() - t1) / 1e6 / 200;
const t2 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) build(prodOpts({ m: poseAt(i / 200) }));
const tBuildProd = Number(process.hrtime.bigint() - t2) / 1e6 / 200;

const out = {
  at: new Date().toISOString(),
  s1,
  foldVariants,
  curveRows,
  arcRef,
  diag: {
    pairs,
    iouMin: r4(iouMin),
    iouMax: r4(iouMax),
    scores: diagScores,
    masks: diagMasks.map((d) => ({ dir: d.dir, yaw: d.yaw, pitch: d.pitch })),
  },
  sym,
  cand,
  ends,
  exposure,
  duration: DURATION,
  cost: { msBuild: r3(tBuild), msBuildProd: r3(tBuildProd), msScore96: r3(tScore) },
  consts: { ISO, A6_REF, GOOD, PASS, SCORE_W, TUMBLE, grounds: Object.keys(GROUNDS) },
};
fs.writeFileSync(path.join(OUT, 'scan.json'), JSON.stringify(out, null, 2));

const brief = {
  paths: { prod: s1.prod.paths, sync: s1.sync.paths, ratio: s1.ratioPaths, bytesRatio: s1.ratioBytes },
  tones: { prod: s1.prod.tones, sync: s1.sync.tones },
  notch: { prod48: s1.prod.notchAt48, sync48: s1.sync.notchAt48, sync200: s1.sync.notchAt200 },
  spineRawMin: { prod: s1.prod.spineRawMin, sync: s1.sync.spineRawMin },
  fold: foldVariants,
  curve: curveRows,
  arcRef,
  diag: { iouMin: out.diag.iouMin, scores: diagScores },
  sym: sym.map((s) => `${s.op} iou ${s.iou} score ${s.score}`),
  cand: cand.map((c) => ({ id: c.id, ugly: c.ugly, mid: c.mid, min: c.min, midIoU: c.midIoU, midToneAbs: c.midToneAbs })),
  ends,
  exposure,
  cost: out.cost,
};
console.log(JSON.stringify(brief, null, 2));