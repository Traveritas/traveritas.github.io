/* .faces.mjs —— BRIEF-3 要的「可见面数」与姿态偏移角（离线）
   node design/mocks/star-v2/.faces.mjs

   「可见面」的算法与着色器同口径：对画幅里每条视线找并集的入口面
   （那就是这一像素真正被看到的那张面），统计一共出现过多少张不同的面。
   不是「法线朝前的面数」——那会把被别的支挡住的面也算进去。
*/
import { buildBlocks, blocksInView, poseAt, RENDER, OFFSET, OFFSET_U, REST } from './src.js';

const TAN = RENDER.tan;
const CAM = RENDER.camZ;
const BLOCKS = buildBlocks();
const PX = 320;

/** 一条视线打出后，最终被看到的是哪一张面（−1 = 没打中） */
function firstFace(view, ro, rd) {
  let bestT = Infinity;
  let tag = -1;
  for (let k = 0; k < view.length; k++) {
    const faces = view[k];
    let t0 = -Infinity;
    let t1 = Infinity;
    let ni = -1;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const dn = f[0] * rd[0] + f[1] * rd[1] + f[2] * rd[2];
      const num = f[3] - (f[0] * ro[0] + f[1] * ro[1] + f[2] * ro[2]);
      if (dn > 1e-7) {
        const t = num / dn;
        if (t < t1) t1 = t;
      } else if (dn < -1e-7) {
        const t = num / dn;
        if (t > t0) {
          t0 = t;
          ni = i;
        }
      }
    }
    if (ni < 0 || t0 > t1 || t1 <= 1e-6) continue;
    if (t0 < bestT) {
      bestT = t0;
      tag = k * 8 + ni;
    }
  }
  return tag;
}

function visibleFaces(u) {
  const view = blocksInView(BLOCKS, poseAt(u));
  const seen = new Set();
  const area = new Map();
  let hit = 0;
  const ro = [0, 0, CAM];
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const nx = ((x + 0.5) / PX) * 2 - 1;
      const ny = 1 - ((y + 0.5) / PX) * 2;
      const d = [nx * TAN, ny * TAN, -1];
      const L = Math.hypot(d[0], d[1], d[2]);
      const tag = firstFace(view, ro, [d[0] / L, d[1] / L, d[2] / L]);
      if (tag < 0) continue;
      hit++;
      seen.add(tag);
      area.set(tag, (area.get(tag) || 0) + 1);
    }
  }
  const shares = [...area.values()].map((v) => (v / hit) * 100).sort((a, b) => b - a);
  /* 「可辨明暗的档数」：把各面的平均亮度分成 6 级，数有料的级数 */
  return { u, faces: seen.size, areaShare: +((hit / (PX * PX)) * 100).toFixed(2), shares: shares.map((s) => +s.toFixed(1)) };
}

/* 姿态偏移角：OFFSET 相对单位阵的旋转角 */
function rotAngle(R) {
  const tr = R[0] + R[4] + R[8];
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
}
/* OFFSET 的旋转轴与其到体对角线 (1,1,1)/√3 的夹角 */
function offsetAxis() {
  const R = OFFSET;
  const v = [R[7] - R[5], R[2] - R[6], R[3] - R[1]];
  const L = Math.hypot(v[0], v[1], v[2]);
  return L < 1e-12 ? [1, 0, 0] : [v[0] / L, v[1] / L, v[2] / L];
}
const ax = offsetAxis();
const diag = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const axisToDiag = (Math.acos(Math.max(-1, Math.min(1, ax[0] * diag[0] + ax[1] * diag[1] + ax[2] * diag[2]))) * 180) / Math.PI;

const u0 = visibleFaces(0);
const u05 = visibleFaces(0.5);
const u02 = visibleFaces(OFFSET_U);

console.log('落定姿态（第三轮）');
console.log('  OFFSET = R(a(u0), 2πu0)，u0 =', OFFSET_U);
console.log('  旋转角        ', rotAngle(OFFSET).toFixed(3), '°');
console.log('  旋转轴        ', ax.map((v) => v.toFixed(4)).join(', '));
console.log('  轴到体对角(1,1,1) 夹角', axisToDiag.toFixed(2), '°');
console.log('  poseAt(0) 与 poseAt(1) 逐位相同：',
  poseAt(0).every((v, i) => v === poseAt(1)[i]));
console.log('  poseAt(1) 与落定帧（同一函数）相同：', poseAt(1).every((v, i) => v === poseAt(0)[i]));
console.log('');
console.log('可见面数（同一个并集、同一个相机，只换姿态）');
console.log('  u = 0     （新落定）', u0.faces, '面 · 占画布', u0.areaShare + '% · 各面占比', u0.shares.join(' / '));
console.log('  u = 0.5              ', u05.faces, '面 · 占画布', u05.areaShare + '% · 各面占比', u05.shares.join(' / '));
console.log('  u = 0.2（原第二格）  ', u02.faces, '面 · 占画布', u02.areaShare + '%');
console.log('');
console.log('对照：第二轮的正位（体对角）', visibleFaces(0).faces, '面 —— 但那是 OFFSET 之前的姿态，见 notes。');

if (process.argv.includes('--json')) {
  console.log('JSON ' + JSON.stringify({ offsetDeg: rotAngle(OFFSET), axisToDiag, u0, u05, u02 }));
}