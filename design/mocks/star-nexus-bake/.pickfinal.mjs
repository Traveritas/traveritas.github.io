import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const P = m.BAKE.shape;
const S = g.curve.samples;
const N = S.length;
const sc = S.map((r) => r.score);
const US = S.map((r) => r.u);
const SIZE = 48, MI = SIZE * SIZE;
const MASKS = US.map((u) => m.__mask(P, u, SIZE));
const cache = new Map();
const iou = (i, j) => {
  const k = i * 1000 + j;
  let v = cache.get(k);
  if (v !== undefined) return v;
  const a = MASKS[i], b = MASKS[j];
  let it = 0, un = 0;
  for (let t = 0; t < MI; t++) { if (a[t] && b[t]) it++; if (a[t] || b[t]) un++; }
  v = un ? it / un : 1;
  cache.set(k, v);
  return v;
};
const per = 300;
function dp(k, iouMax, gapMax) {
  const gmin = 1, gmax = Math.round(gapMax * per);
  const best = Array.from({ length: k }, () => new Float64Array(N).fill(-1));
  const from = Array.from({ length: k }, () => new Int16Array(N).fill(-1));
  best[0][0] = 1e9;
  for (let j = 1; j < k; j++)
    for (let i = 0; i < N; i++) {
      let bv = -1, bf = -1;
      for (let d = gmin; d <= gmax; d++) {
        const p = i - d;
        if (p < 0) break;
        const pv = best[j - 1][p];
        if (pv < 0) continue;
        if (iou(p, i) > iouMax) continue;
        const v = Math.min(pv, sc[i]);
        if (v > bv) { bv = v; bf = p; }
      }
      best[j][i] = bv; from[j][i] = bf;
    }
  if (best[k - 1][N - 1] < 0) return null;
  const idx = [];
  let i = N - 1;
  for (let j = k - 1; j >= 0; j--) { idx.push(i); i = from[j][i]; if (j === 0) break; }
  return idx.reverse();
}
const out = [];
for (const k of [8, 10, 12, 14, 16, 18])
  for (const iouMax of [0.90, 0.93, 0.95, 0.97, 0.99])
    for (const gapMax of [0.10, 0.14, 0.20, 0.30]) {
      const idx = dp(k, iouMax, gapMax);
      if (!idx) continue;
      const s2 = idx.map((i) => sc[i]);
      const us = idx.map((i) => US[i]);
      const io = idx.slice(1).map((j, t) => iou(idx[t], j));
      out.push({
        k, iouMax, gapMax, min: Math.min(...s2),
        ugly: s2.filter((v) => v < 55).length,
        good: s2.filter((v) => v >= 70).length,
        ioMin: Math.min(...io), ioMax: Math.max(...io),
        gapU: Math.max(...us.slice(1).map((u, t) => u - us[t])),
        us, s: s2,
      });
    }
out.sort((a, b) => b.min - a.min || a.ioMax - b.ioMax);
console.log('可行解', out.length);
const seen = new Set();
for (const r of out) {
  const key = r.k + '|' + r.min + '|' + r.ioMax.toFixed(2);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`k=${r.k} 相邻IoU<=${r.iouMax} 步长<=${r.gapMax} → min=${r.min} 难看=${r.ugly} 可停=${r.good} IoU=${r.ioMin.toFixed(2)}..${r.ioMax.toFixed(2)} 最大跳=${r.gapU.toFixed(2)}`);
  console.log('   us=[' + r.us.map((v) => v.toFixed(3)).join(', ') + ']');
  console.log('   sc=[' + r.s.join(', ') + ']');
  if (seen.size >= 14) break;
}
