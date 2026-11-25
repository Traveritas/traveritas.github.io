/* 纯数值读数：面/边的份额、面数、倒角带在像素上的宽度、三条轴的读数。
   node design/mocks/star-v-slab/.numbers.mjs  → .shots/numbers.json（同时打到 stdout）

   不需要浏览器：buildGeometry / poseReadout / edgeShare 都不碰 DOM 与 GL。
   three 从仓库根的 node_modules 解析。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATES, CAND_ORDER, edgeShare, bevelBandPx, poseReadout, AXIS_ORDER,
  starOutline, triCount,
} from './src.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = {};

/* ── 1. 六个候选：面数、边缘份额、正对时的厚度感 ── */
out.candidates = CAND_ORDER.map((k) => {
  const c = CANDIDATES[k];
  const es = edgeShare(c.kind, c.p);
  return {
    key: k,
    label: c.label,
    tris: es.tris,
    trisViaCount: triCount(k),
    frontShare: es.frontShare,
    edgeShare: es.edgeShare,
    p: c.p,
  };
});

/* ── 2. 厚度扫描：直挤出 vs 倒角板 ── */
out.thicknessSweep = [0.06, 0.12, 0.2, 0.3].map((t) => ({
  thick: t,
  slab: edgeShare('slab', { thick: t }),
  bevel: edgeShare('bevel', { thick: t, bevelW: 0.1, bevelD: 0.55, bevelSteps: 2 }),
}));

/* ── 3. 倒角带宽 vs 倒角深 ── */
out.bevelSweep = [0.03, 0.07, 0.1, 0.16].map((w) => ({
  bevelW: w,
  bandAt200: bevelBandPx(w, 200),
  bandAt400: bevelBandPx(w, 400),
  bandAt64: bevelBandPx(w, 64),
  bandAt96: bevelBandPx(w, 96),
  bandAt144: bevelBandPx(w, 144),
  bandAt240: bevelBandPx(w, 240),
  shares: [0.3, 0.55, 0.8, 1.0].map((d) => ({
    bevelD: d,
    ...edgeShare('bevel', { thick: 0.12, bevelW: w, bevelD: d, bevelSteps: 3 }),
  })),
}));

/* ── 4. 三条轴：正面读得多久、什么时候塌成透镜 ── */
out.axes = AXIS_ORDER.map((a) => {
  const r = poseReadout({ axis: a, steps: 12 });
  return {
    axis: a,
    meanFace: r.meanFace,
    readable: r.readable,
    minFace: r.minFace,
    minShort: r.minShort,
    stillStar: r.stillStar,
    collapses: r.collapses,
    collapsedDir: r.collapsedDir,
    rows: r.rows,
  };
});

/* ── 5. 截面 ── */
out.outlines = {};
for (const cross of ['equal', 'spire', 'facet']) {
  const o = starOutline(cross);
  out.outlines[cross] = { vertices: o.pts.length, kind: o.kind };
}

/* ── 6. 步数 × 保持时长：一圈多长 ── */
out.clock = [8, 12, 16, 24].map((steps) => {
  const rows = [80, 110, 120, 150].map((hold) => ({
    hold,
    cycleMs: +(steps * hold + hold * 2.2).toFixed(0),
    drawsPerSec: +(1000 / hold).toFixed(1),
  }));
  return { steps, rows };
});

fs.mkdirSync(path.join(HERE, '.shots'), { recursive: true });
fs.writeFileSync(path.join(HERE, '.shots', 'numbers.json'), JSON.stringify(out, null, 2));

console.log('── 候选（三分之四视 pitch16/yaw24）──');
for (const c of out.candidates) {
  console.log(
    `${c.key.padEnd(10)} tris ${String(c.tris).padStart(4)}  正面 ${c.frontShare.toFixed(3)}  边侧 ${c.edgeShare.toFixed(3)}`,
  );
}

console.log('\n── 厚度扫描 ──');
for (const r of out.thicknessSweep) {
  console.log(
    `thick ${r.thick.toFixed(2)}  直挤出边侧 ${r.slab.edgeShare.toFixed(3)}  倒角板边侧 ${r.bevel.edgeShare.toFixed(3)}`,
  );
}

console.log('\n── 倒角带宽（px，星宽占画格 86.8%）──');
for (const r of out.bevelSweep) {
  console.log(
    `bevelW ${r.bevelW.toFixed(2)}  64:${String(r.bandAt64).padStart(5)}  96:${String(r.bandAt96).padStart(5)}  144:${String(r.bandAt144).padStart(5)}  200:${String(r.bandAt200).padStart(5)}  240:${String(r.bandAt240).padStart(5)}  400:${String(r.bandAt400).padStart(5)}`,
  );
}

console.log('\n── 倒角深 × 倒角宽（边侧份额）──');
for (const r of out.bevelSweep) {
  const cells = r.shares.map((s) => `${s.bevelD.toFixed(2)}:${s.edgeShare.toFixed(3)}`).join('  ');
  console.log(`bevelW ${r.bevelW.toFixed(2)}  ${cells}`);
}

console.log('\n── 三条轴（12 步）──');
for (const a of out.axes) {
  console.log(
    `${a.axis.padEnd(4)} 正面均 ${a.meanFace.toFixed(3)}  可读 ${a.readable}/12  最短边 ${a.minShort.toFixed(3)}  仍是星 ${a.stillStar}/12  塌成透镜 ${a.collapses}${a.collapses ? '（' + a.collapsedDir + '向）' : ''}`,
  );
}

console.log('\n→ .shots/numbers.json');