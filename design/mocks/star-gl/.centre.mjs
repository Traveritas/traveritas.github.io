/* 中心：深度缓冲 vs 画家算法 —— 逐像素判「露在最前面的到底是哪一片」。
   node design/mocks/star-gl/.centre.mjs  → .shots/centre.json

   两种光栅化：
     zb      逐三角形 z-buffer（GL 里真的发生的事）
     painter 逐三角形按支心 z、再按片心 z 排序，**不测深度**，后画的盖住先画的
   然后比「每个像素上露在最前面的片号」：
     wrongShare = 画家算法给出错误片的像素占比。这是「画家算法错在哪」的可数答案，
     不是从画面上猜的。

   另外报中心的**结构**读数（真 z-buffer 口径）：
     片数、最大一片占比、薄片数、四档量化后用了几档、调子跨度。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN, cfgOf, buildGeometry, M_REST, mApply } from './src.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '.shots');

function analyse(cfgIn, { size = 400, box = 12.5, discR = 2.5, steps = 4 } = {}) {
  const cfg = cfgOf(cfgIn);
  const g = buildGeometry(cfg);
  const sc = size / box;
  const c = size / 2;

  /* 每片的三角形范围已经由 buildGeometry 记下（tri0 / tri1） */
  const faces = g.faces;
  const nx = new Float32Array(size * size);
  const V = (i) => {
    const o = i * 3;
    const p = mApply(M_REST, [g.position[o], g.position[o + 1], g.position[o + 2]]);
    return [c + p[0] * sc, c - p[1] * sc, p[2]];
  };
  const triOf = new Int32Array(g.count / 3);
  for (let f = 0; f < faces.length; f++) for (let k = faces[f].tri0; k < faces[f].tri1; k++) triOf[k] = f;

  const zbuf = new Float32Array(size * size).fill(-1e9);
  const zbFace = new Int32Array(size * size).fill(-1);
  const pFace = new Int32Array(size * size).fill(-1);
  const fFace = new Int32Array(size * size).fill(-1);

  /* 画家序：支心 z（用每片法线的视空间 z 代表它所属那一支）→ 片心 z */
  const spikeZ = new Map();
  for (const f of faces) {
    const k = `${f.spike}`;
    const z = mApply(M_REST, f.n)[2];
    if (!spikeZ.has(k)) spikeZ.set(k, []);
    spikeZ.get(k).push(z);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const order = [...spikeZ.keys()].sort((a, b) => mean(spikeZ.get(a)) - mean(spikeZ.get(b)));
  const rank = new Map(order.map((k, i) => [k, i]));
  const painterTris = [...Array(g.count / 3).keys()].sort((a, b) => {
    const fa = faces[triOf[a]];
    const fb = faces[triOf[b]];
    return rank.get(`${fa.spike}`) - rank.get(`${fb.spike}`) || fa.mid[2] - fb.mid[2];
  });
  /* star-final 实际用的那一种：**按片平均 z 全局排序**（不分组）。
     它的 notes §5 说「按支排序在平风筝上恰好成立」，所以后来改成了逐片。这里两种都测。 */
  const painterTrisByFace = [...Array(g.count / 3).keys()].sort((a, b) => faces[triOf[a]].mid[2] - faces[triOf[b]].mid[2]);

  const draw = (t, onFront) => {
    const A = V(t * 3);
    const B = V(t * 3 + 1);
    const C = V(t * 3 + 2);
    const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(det) < 1e-9) return;
    const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const l1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / det;
        const l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * A[2] + l2 * B[2] + l3 * C[2];
        const id = y * size + x;
        onFront(id, z);
      }
  };
  for (let t = 0; t < g.count / 3; t++)
    draw(t, (id, z) => {
      if (z > zbuf[id]) {
        zbuf[id] = z;
        zbFace[id] = triOf[t];
      }
    });
  for (const t of painterTris) draw(t, (id) => (pFace[id] = triOf[t]));
  for (const t of painterTrisByFace) draw(t, (id) => (fFace[id] = triOf[t]));

  /* 中心那一圈 */
  const tones = g.faces.map((f) => Math.max(0, Math.min(1, mApply(M_REST, f.n)[0] * cfg.light[0] + mApply(M_REST, f.n)[1] * cfg.light[1] + mApply(M_REST, f.n)[2] * cfg.light[2])));
  let lo = Math.min(...tones);
  let hi = Math.max(...tones);
  lo -= 0.02;
  hi += 0.02;

  const rpx = discR * sc;
  let n = 0;
  let wrong = 0;
  let wrongFace = 0;
  const perFace = new Map();
  const vals = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy > rpx * rpx) continue;
      const id = y * size + x;
      if (zbFace[id] < 0) continue;
      n++;
      if (pFace[id] !== zbFace[id]) wrong++;
      if (fFace[id] !== zbFace[id]) wrongFace++;
      perFace.set(zbFace[id], (perFace.get(zbFace[id]) || 0) + 1);
      vals.push(tones[zbFace[id]]);
    }
  vals.sort((a, b) => a - b);
  const areas = [...perFace.values()].sort((a, b) => b - a);
  const bucket = new Array(steps).fill(0);
  for (const v of vals) {
    const u = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-4, hi - lo)));
    bucket[Math.min(steps - 1, Math.floor(u * steps))]++;
  }
  return {
    px: n,
    painterWrongShare: +(wrong / Math.max(1, n)).toFixed(3),
    painterWrongByFace: +(wrongFace / Math.max(1, n)).toFixed(3),
    faces: perFace.size,
    topShare: +(areas[0] / Math.max(1, n)).toFixed(3),
    slivers: areas.filter((a) => a / n < 0.005).length,
    tonesUsed: bucket.filter((v) => v / n > 0.02).length,
    spread: +(vals[vals.length - 1] - vals[0]).toFixed(3),
    bucket: bucket.map((v) => +(v / n).toFixed(3)),
  };
}

const rows = [];
for (const hw of [0.2, 0.26, 0.32]) for (const fold of [0.75, 1.0, 1.5]) rows.push({ hw, fold, ...analyse({ halfWidth: hw * 16, fold }) });
/* 「不收坡 + 六边截面」（star-final 那一档）作对照：证明八边不是随手换的 */
const six = { hw: 0.26, fold: 1.0, sides: 6, ...analyse({ halfWidth: 0.26 * 16, fold: 1.0, sides: 6 }) };
const four = { hw: 0.26, fold: 1.0, sides: 4, ...analyse({ halfWidth: 0.26 * 16, fold: 1.0, sides: 4 }) };

fs.writeFileSync(path.join(OUT, 'centre.json'), JSON.stringify({ at: new Date().toISOString(), discR: 2.5, box: 12.5, size: 400, rows, six, four }, null, 2));
for (const r of rows)
  console.log(
    `w ${r.hw.toFixed(2)} 脊 ${r.fold.toFixed(2)}  片 ${String(r.faces).padStart(2)}  顶 ${(r.topShare * 100).toFixed(0)}%  薄片 ${String(r.slivers).padStart(2)}  四档用 ${r.tonesUsed}  跨度 ${r.spread}  画家错(支序) ${(r.painterWrongShare * 100).toFixed(1)}% 画家错(逐片) ${(r.painterWrongByFace * 100).toFixed(1)}%`,
  );
console.log(`六边 w0.26 脊1.00  片 ${six.faces}  顶 ${(six.topShare * 100).toFixed(0)}%  薄片 ${six.slivers}  四档用 ${six.tonesUsed}  跨度 ${six.spread}  画家错 ${(six.painterWrongShare * 100).toFixed(1)}%`);
console.log(`四边 w0.26 脊1.00  片 ${four.faces}  顶 ${(four.topShare * 100).toFixed(0)}%  薄片 ${four.slivers}  四档用 ${four.tonesUsed}  跨度 ${four.spread}  画家错 ${(four.painterWrongShare * 100).toFixed(1)}%`);