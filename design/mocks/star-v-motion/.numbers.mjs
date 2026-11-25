/* 姿态与运动的总读数。
   node design/mocks/star-v-motion/.numbers.mjs  → .shots/numbers.json + 若干 PNG 条

   约定（与 src.js 里 three 的写法逐字一致）：
     world→view  M = Rx(pitch)·Ry(yaw)        「从哪个方向看」
     物体自转 R 之后，视线坐标 = M·R          —— 转的是物体，不是镜头
     绕视轴滚 roll 则是 M 左边乘 Rz           —— 屏幕上原地转一圈
   两处「乘在左边」的错都踩过了：把 R 乘在 M 左边等于转镜头，
   分数曲线会凭空失去 90° 周期性。这一条记在 notes.md。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStar, rasterize, rasterizeM, measure, measureMask, scoreOf,
  mul3, rotAxis, viewMatrix, tipsM, maskIoU, GOOD, PASS,
} from './posecore.mjs';
import { writePNG, tileMasks } from './.png.mjs';

/* 必须用 fileURLToPath：URL.pathname 会把空格编码成 %20，
   path.join 之后就在仓库外造出一棵同名镜像目录（踩过一次，已清理）。 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const mesh = buildStar();

const ISO = viewMatrix(45, 35.264);
const spin = (axis, deg, base = ISO) => mul3(base, rotAxis(axis, deg));
const roll = (deg, base = ISO) => mul3(rotAxis([0, 0, 1], deg), base);

function read(matrix, size = 144) {
  const { mask } = rasterizeM(mesh, matrix, { size });
  const res = measureMask(mesh, mask, size, 0, 0, { matrix });
  return { ...res, score: scoreOf(res), mask };
}

/* ── 0. 对称性：这颗星的剪影在什么转动下不变 ── */
const sym = {};
{
  const a = read(ISO);
  for (const [name, axis] of [['体 x', [1, 0, 0]], ['体 y', [0, 1, 0]], ['体 z', [0, 0, 1]]]) {
    const b = read(spin(axis, 90));
    sym[name] = { score: b.score, iou: +maskIoU(a.mask, b.mask).toFixed(4) };
  }
  /* 绕体对角线 120°：八面体的三重轴 */
  const c = read(spin([1, 1, 1], 120));
  sym['体对角 (1,1,1) 120°'] = { score: c.score, iou: +maskIoU(a.mask, c.mask).toFixed(4) };
  sym.control = { label: '绕体 x 45°（非对称操作）', score: read(spin([1, 0, 0], 45)).score, iou: +maskIoU(a.mask, read(spin([1, 0, 0], 45)).mask).toFixed(4) };
}
console.log('剪影的对称性（90° / 120° 一转是否回到自己）');
Object.entries(sym).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} score ${String(v.score ?? '').padStart(3)}  IoU ${v.iou}${v.label ? '  ' + v.label : ''}`));

/* ── 1. 姿态地图：yaw × pitch，3° 一格（0–90 已含全部不同看法）── */
const axisDeg = [];
for (let a = 0; a <= 90; a += 3) axisDeg.push(a);
const grid = [];
for (const pitch of axisDeg) {
  const row = [];
  for (const yaw of axisDeg) {
    const r = read(viewMatrix(yaw, pitch), 120);
    row.push({ yaw, pitch, score: r.score, balance: r.balance, aspect: r.aspect, a6: r.a6, sixShare: r.sixShare, fill: r.fill, rMin: r.rMin, rMax: r.rMax });
  }
  grid.push({ pitch, cells: row });
}
const flat = grid.flatMap((r) => r.cells);
const sc = flat.map((c) => c.score).sort((a, b) => a - b);
const q = (p) => sc[Math.min(sc.length - 1, Math.floor(p * sc.length))];
const goodTiles = flat.filter((c) => c.score >= GOOD);
console.log(`\n姿态地图 ${flat.length} 格（3° 一格）：min ${sc[0]} p10 ${q(0.1)} 中位 ${q(0.5)} p90 ${q(0.9)} max ${sc[sc.length - 1]}`);
console.log(`  >=70：${goodTiles.length} 格（${((goodTiles.length / flat.length) * 100).toFixed(0)}%）；<40：${flat.filter((c) => c.score < 40).length} 格`);
/* 好格子都落在哪？按「离最近的体对角点的角度距离」分组 */
const DIAG_DIRS = [];
for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) DIAG_DIRS.push([sx / Math.sqrt(3), sy / Math.sqrt(3), sz / Math.sqrt(3)]);
function angToDiag(yaw, pitch) {
  const m = viewMatrix(yaw, pitch);
  const d = [-m[6], -m[7], -m[8]];
  let best = 180;
  for (const g of DIAG_DIRS) {
    const dot = d[0] * g[0] + d[1] * g[1] + d[2] * g[2];
    const a = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    if (a < best) best = a;
  }
  return best;
}
const goodAngles = goodTiles.map((c) => angToDiag(c.yaw, c.pitch));
const badAngles = flat.filter((c) => c.score < 40).map((c) => angToDiag(c.yaw, c.pitch));
const stat = (a) => ({ n: a.length, min: +Math.min(...a).toFixed(1), max: +Math.max(...a).toFixed(1), mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) });
console.log(`  好格到最近体对角视线的角度：${JSON.stringify(stat(goodAngles))}`);
console.log(`  坏格到最近体对角视线的角度：${JSON.stringify(stat(badAngles))}`);

/* ── 2. 好姿态带 ───────────────────────────── ── */
function band(axis) {
  const rows = [];
  for (let t = -45; t <= 45; t += 1) {
    const r = read(spin(axis, t), 120);
    rows.push({ t, score: r.score, bal: r.balance });
  }
  const g = rows.filter((r) => r.score >= GOOD).map((r) => r.t);
  const p = rows.filter((r) => r.score >= PASS).map((r) => r.t);
  return { rows, good: [Math.min(...g), Math.max(...g)], pass: [Math.min(...p), Math.max(...p)] };
}
const bX = band([1, 0, 0]);
const bY = band([0, 1, 0]);
console.log(`\n好姿态带（iso 起，逐度）绕体 x：>=70 ${bX.good[0]}°…${bX.good[1]}°；>=55 ${bX.pass[0]}°…${bX.pass[1]}°`);
console.log(`                        绕体 y：>=70 ${bY.good[0]}°…${bY.good[1]}°；>=55 ${bY.pass[0]}…${bY.pass[1]}`);

/* ── 3. 运动 ──
   每一条都表示成一串「被停住的姿态矩阵」，页面照这串画。 */
const MOTIONS = {
  hinge: { label: '绕单轴的定格翻面', kind: 'spin', axis: [1, 0, 0], note: '第一版那条运动' },
  yaw: { label: '绕竖直轴的分步自转', kind: 'spin', axis: [0, 1, 0] },
  osc: { label: '摆动（不完成一圈）', kind: 'osc', axis: [0, 1, 0], amp: 18 },
  windmill: { label: '风车式（绕对角线）', kind: 'roll' },
  ladder: { label: '跳格换面（只停好姿态）', kind: 'ladder' },
  settle: { label: '落定（转一次就停）', kind: 'settle' },
};

/** 八个体对角视线的朝向矩阵 —— 跳格换面的落脚点 */
const DIAG_VIEWS = DIAG_DIRS.map((d) => {
  const pitch = (Math.asin(d[1]) * 180) / Math.PI;
  let yaw = (Math.atan2(-d[0], -d[2]) * 180) / Math.PI;
  if (yaw < 0) yaw += 360;
  return viewMatrix(yaw, pitch);
});

function framesOf(name, steps) {
  const spec = MOTIONS[name];
  if (spec.kind === 'spin') {
    const out = [];
    for (let k = 0; k < steps; k++) out.push(spin(spec.axis, (360 / steps) * k));
    return out;
  }
  if (spec.kind === 'roll') {
    const out = [];
    for (let k = 0; k < steps; k++) out.push(roll((360 / steps) * k));
    return out;
  }
  if (spec.kind === 'osc') {
    /* 去程 steps/2 格、回程 steps/2 格，端点各只停一次 */
    const n = Math.max(2, Math.round(steps / 2));
    const out = [];
    for (let k = 0; k <= n; k++) out.push(spin(spec.axis, (spec.amp * k) / n));
    for (let k = n - 1; k >= 1; k--) out.push(spin(spec.axis, (spec.amp * k) / n));
    return out;
  }
  if (spec.kind === 'ladder') {
    /* 在 8 个体对角视线里走：每一格都是满分姿态，格子之间的大转身根本不渲染。
       顺序刻意不走「最近邻」，而是绕一圈 —— 观感上就是同一个剪影在换面。 */
    const order = [0, 1, 3, 2, 6, 7, 5, 4];
    return order.slice(0, Math.max(4, Math.min(8, Math.round(steps / 12) * 4 || 8))).map((i) => DIAG_VIEWS[i]);
  }
  if (spec.kind === 'settle') {
    /* 从偏 40° 收进 iso：前三格还在带外（有意的「落定」过程），最后一格停住 */
    return [spin([0, 1, 0], -34), spin([0, 1, 0], -22), spin([0, 1, 0], -11), ISO];
  }
  return [ISO];
}

function readFrames(name, steps) {
  const mats = framesOf(name, steps);
  return mats.map((m, k) => {
    const r = read(m, 120);
    return { k, score: r.score, balance: r.balance, aspect: r.aspect, a6: r.a6, matrix: m.map((v) => +v.toFixed(5)), mask: r.mask };
  });
}

const motionOut = {};
console.log('\n运动读数（每格都是被停住、真会被看到的姿态）');
for (const name of Object.keys(MOTIONS)) {
  const steps = 12;
  const rows = readFrames(name, steps);
  let iou = 0;
  for (let i = 0; i < rows.length; i++) iou += maskIoU(rows[i].mask, rows[(i + 1) % rows.length].mask);
  iou /= rows.length;
  const scores = rows.map((r) => r.score);
  motionOut[name] = {
    label: MOTIONS[name].label, steps, n: rows.length,
    mean: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
    min: Math.min(...scores), max: Math.max(...scores),
    badFrac: +(rows.filter((r) => r.score < PASS).length / rows.length).toFixed(3),
    offFrac: +(rows.filter((r) => r.score < GOOD).length / rows.length).toFixed(3),
    meanIoU: +iou.toFixed(3),
    scores, poses: rows.map(({ mask, ...r }) => r), masks: rows.map((r) => r.mask),
  };
  const o = motionOut[name];
  console.log(`  ${name.padEnd(9)} ${String(o.n).padStart(3)} 格  均 ${String(o.mean).padStart(5)}  最低 ${String(o.min).padStart(3)}  低于55 ${(o.badFrac * 100).toFixed(0)}%  低于70 ${(o.offFrac * 100).toFixed(0)}%  相邻IoU ${o.meanIoU}  [${o.scores.join(' ')}]`);
}

/* ── 4. 定格粒度 ── */
const grain = [];
for (const name of ['hinge', 'yaw', 'osc', 'windmill', 'ladder']) {
  for (const steps of [6, 8, 12, 16, 24]) {
    const rows = readFrames(name, steps);
    let iou = 0;
    for (let i = 0; i < rows.length; i++) iou += maskIoU(rows[i].mask, rows[(i + 1) % rows.length].mask);
    iou /= rows.length;
    let minIoU = 1;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const v = maskIoU(rows[i].mask, rows[j].mask);
        if (v < minIoU) minIoU = v;
      }
    }
    const scores = rows.map((r) => r.score);
    grain.push({ motion: name, steps, n: rows.length, mean: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1), min: Math.min(...scores), meanIoU: +iou.toFixed(3), minIoU: +minIoU.toFixed(3) });
  }
}
console.log('\n步数粒度（相邻IoU 越高＝定格越读不出变化）');
grain.forEach((g) => console.log(`  ${g.motion.padEnd(9)} ${String(g.steps).padStart(2)} 步 ${String(g.n).padStart(3)} 格  均 ${String(g.mean).padStart(5)} 最低 ${String(g.min).padStart(3)} 相邻IoU ${g.meanIoU} 最像的一对 ${g.minIoU}`));

/* ── 5. 点名角度 ── */
const fatal = [
  { yaw: 0, pitch: 0, why: '正对一支：三支藏起来' },
  { yaw: 45, pitch: 0, why: '水平看：竖直那一对正对镜头' },
  { yaw: 45, pitch: 90, why: '俯视一支' },
  { yaw: 0, pitch: 45, why: '半路' },
  { yaw: 30, pitch: 30, why: '偏得对称' },
  { yaw: 15, pitch: 15, why: '偏得不对称' },
  { yaw: 45, pitch: 20, why: '俯仰不足' },
  { yaw: 45, pitch: 35.264, why: '体对角（iso）' },
  { yaw: 45, pitch: 55.264, why: '俯仰过头' },
].map((p) => {
  const r = read(viewMatrix(p.yaw, p.pitch), 144);
  return { ...p, score: r.score, balance: r.balance, aspect: r.aspect, a6: r.a6, sixShare: r.sixShare, fill: r.fill, radii: tipsM(viewMatrix(p.yaw, p.pitch)).map((t) => +t.radius.toFixed(3)) };
});
console.log('\n点名角度');
fatal.forEach((f) => console.log(`  (${String(f.yaw).padStart(3)},${String(f.pitch).padStart(3)}) ${String(f.score).padStart(3)} 分  bal ${f.balance.toFixed(3)}  a6 ${f.a6.toFixed(3)}  半径 ${f.radii.join('/')} — ${f.why}`));

/* ── 输出 ── */
const payload = {
  generatedAt: new Date().toISOString(),
  convention: 'M = Rx(pitch)·Ry(yaw) 世界→视；物体自转 M·R；视轴滚 Rz·M',
  shape: { waist: 0.3, chamfer: 0.34, stations: 'z 0/0.16/0.42/0.68/0.86 × r 0.52/1.00/0.72/0.38/0.16' },
  symmetry: sym,
  gridAxis: axisDeg,
  grid,
  distribution: { min: sc[0], p10: q(0.1), median: q(0.5), p90: q(0.9), max: sc[sc.length - 1], good: goodTiles.length, bad: flat.filter((c) => c.score < 40).length, tiles: flat.length },
  diagAngle: { good: stat(goodAngles), bad: stat(badAngles) },
  bands: { x: { good: bX.good, pass: bX.pass, rows: bX.rows }, y: { good: bY.good, pass: bY.pass, rows: bY.rows } },
  motions: Object.fromEntries(Object.entries(motionOut).map(([k, v]) => [k, {
    label: MOTIONS[k].label, kind: MOTIONS[k].kind, steps: v.steps, n: v.n,
    mean: v.mean, min: v.min, max: v.max, badFrac: v.badFrac, offFrac: v.offFrac,
    meanIoU: v.meanIoU, scores: v.scores,
    /* 每格的矩阵要留（页面与 notes 都要能复现那一格），掩码不留 */
    poses: v.poses,
  }])),
  grain,
  fatal,
};
fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(payload));
/* 页面要用的瘦身版：去掉每格的逐格读数，只留分数与四档读数 —— 
   完整 data 还在上面的 numbers.json（7 MB，那些是给复核用的）。 */
const slim = {
  distribution: payload.distribution,
  diagAngle: payload.diagAngle,
  bands: payload.bands,
  grain: payload.grain,
  fatal: payload.fatal,
  symmetry: payload.symmetry,
  gridAxis: payload.gridAxis,
  grid: payload.grid.map((r) => ({
    pitch: r.pitch,
    cells: r.cells.map((c) => [c.score, c.balance, c.aspect, c.a6]),
  })),
  motions: Object.fromEntries(Object.entries(payload.motions).map(([k, v]) => [k, {
    label: v.label, kind: v.kind, steps: v.steps, n: v.n, mean: v.mean, min: v.min,
    max: v.max, badFrac: v.badFrac, offFrac: v.offFrac, meanIoU: v.meanIoU, scores: v.scores,
    poses: v.poses.map((p) => ({ k: p.k, score: p.score, balance: p.balance, matrix: p.matrix })),
  }])),
};
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(slim));
console.log(`wrote numbers.json (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB) + data.json (${(JSON.stringify(slim).length / 1024).toFixed(0)} KB)`);

/* PNG 条：姿态地图 + 每条运动的帧 */
const items = flat.map((c) => ({ mask: rasterize(mesh, c.yaw, c.pitch, { size: 120 }).mask, size: 120 }));
{
  const { rgba, W, H } = tileMasks(items, { cell: 84, gap: 3 });
  writePNG(path.join(OUT, 'map-all.png'), W, H, rgba);
  console.log(`map-all.png ${W}x${H}`);
}
for (const [name, o] of Object.entries(motionOut)) {
  const { rgba, W, H } = tileMasks(o.masks.map((m) => ({ mask: m, size: 120 })), { cell: 84, gap: 3 });
  writePNG(path.join(OUT, `motion-${name}.png`), W, H, rgba);
  console.log(`motion-${name}.png ${W}x${H}  分数 ${o.min}..${o.max}`);
}