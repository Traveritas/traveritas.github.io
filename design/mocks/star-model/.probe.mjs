/* 离线几何账（不开浏览器）：node design/mocks/star-model/.probe.mjs [--mc=64]
   产出 .shots/probe.json。所有数字都从三维几何直接量，不经过任何投影（除了明确标注 projected 的两栏）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 裸 "three" 由仓库根的 node_modules 解析（不算在工作区外写文件）；只在打包时用到的
   GLTFExporter 在 Node 里被 import 也不会立刻碰 DOM —— 它到 parse() 才碰。 */
const M = await import('./src.js');

const mcArg = process.argv.find((a) => a.startsWith('--mc='));
const MC = mcArg ? Number(mcArg.slice(5)) : 64;

const rows = [];
const push = (group, key, label, cfg, extra = {}) => {
  const t0 = performance.now();
  const r = M.readouts(cfg, { mc: MC });
  const ms = +(performance.now() - t0).toFixed(0);
  const row = {
    group,
    key,
    label,
    w: r.cfg.w,
    wIn: +(r.wIn != null ? r.wIn : r.cfg.w).toFixed(6),
    prof: r.cfg.prof,
    fillet: r.cfg.fillet,
    tipR: r.cfg.tipR,
    shade: r.cfg.shade,
    ms,
    tris: r.tris,
    verts: r.verts,
    rings: r.rings,
    section: r.section,
    wEff: r.wEff,
    /* fill = 归一化前支尖实际走到的位置 E（1 表示理想尖点，0.93 表示被圆头吃掉 7%） */
    fill: +(1 / r.stretch).toFixed(4),
    cut: r.cut,
    stretch: r.stretch,
    waistRatio: r.waistRatio,
    waistAt: r.waistAt,
    angMid: r.angMid,
    ang90: r.ang90,
    angTip: r.angTip,
    filletR: r.filletR,
    filletShare: r.filletShare,
    tipBallR: r.tipBallR,
    secMaxR: r.secMaxR,
    notch3D: r.notch3D,
    vol: r.vol,
    overlapShare: r.overlapShare,
    toneLo: r.toneLo,
    toneHi: r.toneHi,
    projNotch: r.projNotch,
    projNotchRel: r.projNotchRel,
    ...extra,
  };
  rows.push(row);
  console.log(
    group.padEnd(6),
    label.padEnd(10),
    `tris=${String(r.tris).padStart(5)} wEff=${r.wEff.toFixed(3)} fill=${(1 / r.stretch).toFixed(3)}`,
    `notch3D=${r.notch3D.toFixed(3)} vol=${r.vol.toFixed(3)} ov=${r.overlapShare.toFixed(2)}`,
    `angMid=${r.angMid} filletR=${r.filletR} ${ms}ms`,
  );
};

/* 1 基准与结构 */
push('base', 'win', '基准', M.WIN);
push('base', 'flatwin', '基准·平法线', { ...M.WIN, shade: 'flat' });

/* 2 粗细 */
for (const v of M.SWEEPS.thick) push('thick', String(v.w), v.label, v.cfg);
/* 3 平滑 */
for (const v of M.SWEEPS.smooth) push('smooth', v.key, v.label, v.cfg);
/* 4 弧线 */
for (const v of M.SWEEPS.arc) push('arc', v.key, v.label, v.cfg);

/* 5 边界：极细、极粗 */
for (const w of [0.12, 0.5, 0.62]) push('edge', String(w), `粗细 ${w}`, { ...M.WIN, w });

/* 对称性：只验基准与两档平滑 */
const sym = {};
for (const cfg of [
  ['win', M.WIN],
  ['hard', M.SWEEPS.smooth[0].cfg],
  ['soft', M.SWEEPS.smooth[3].cfg],
  ['belly', { ...M.WIN, prof: 'belly' }],
]) {
  const { positions } = M.buildStar(cfg[1]);
  sym[cfg[0]] = M.symmetryCheck({ positions });
}

/* 剪影：体对角视角下的极径剖面。六支都投影到同一个半径（√(2/3)=0.8165），
   六个尖之间是内凹的缺口 —— 记「每 60° 扇区的最大半径」与「内角半径」。 */
const sil = {};
for (const cfg of [
  ['win', M.WIN],
  ['hard', M.SWEEPS.smooth[0].cfg],
  ['soft', M.SWEEPS.smooth[3].cfg],
  ['straight', { ...M.WIN, prof: 'straight' }],
]) {
  const { positions } = M.buildStar(cfg[1]);
  const S = 384;
  const m = M.silhouetteMask({ positions }, M.ISO, S);
  const c0 = S / 2;
  const R = new Float32Array(720);
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    for (let s = 1; s < S; s++) {
      const x = Math.round(c0 + Math.cos(a) * s);
      const y = Math.round(c0 + Math.sin(a) * s);
      if (x < 0 || y < 0 || x >= S || y >= S) break;
      if (m.mask[y * S + x]) R[i] = s;
    }
  }
  /* 六个尖：每个 60° 扇区里取最大；扇区边界错开 30° 让尖落在扇区正中 */
  const peaks = [];
  for (let k = 0; k < 6; k++) {
    let best = 0;
    let bi = 0;
    for (let i = 0; i < 120; i++) {
      const idx = (Math.round((k * 120 + i + 60) % 720) + 720) % 720;
      if (R[idx] > best) {
        best = R[idx];
        bi = idx;
      }
    }
    peaks.push(+(best / m.k).toFixed(4));
  }
  /* R(θ) 与 R(θ+120°) 的最大差 —— 应为 0（点集在绕体对角线的 C3 下逐点不变；
     注意不是 60°：三正轴与三负轴只在 120° 下才互相换位，剪影因此只有三重的精确对称） */
  let dev = 0;
  for (let i = 0; i < 720; i++) dev = Math.max(dev, Math.abs(R[i] - R[(i + 240) % 720]));
  sil[cfg[0]] = {
    tipR: peaks,
    tipSpread: +(Math.max(...peaks) - Math.min(...peaks)).toFixed(4),
    rotDev: +(dev / m.k).toFixed(4),
    notch: +M.maskNotch(m).toFixed(4),
    notchOverTip: +(M.maskNotch(m) / (Math.max(...peaks) || 1)).toFixed(3),
  };
}

/* 投影里的内角半径 / 支尖投影半径 —— 只用来跟 drawStar() 对账（现役 w=0.119 实测 0.19） */
const ratio = rows
  .filter((r) => ['thick', 'smooth', 'arc', 'base'].includes(r.group))
  .map((r) => ({
    group: r.group,
    key: r.key,
    projNotch: +r.projNotch.toFixed(4),
    projRel: +(r.projNotch / 0.8165).toFixed(3),
  }));

const out = {
  at: new Date().toISOString(),
  mc: MC,
  win: M.WIN,
  rows,
  sym,
  sil,
  ratio,
};
fs.mkdirSync(path.join(HERE, '.shots'), { recursive: true });
fs.writeFileSync(path.join(HERE, '.shots', 'probe.json'), JSON.stringify(out, null, 2));
console.log('\n对称性：', JSON.stringify(sym));
console.log('剪影：', JSON.stringify(sil));
console.log('→ .shots/probe.json');