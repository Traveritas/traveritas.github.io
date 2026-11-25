/* 真正的标准：一格接一格地走，每一步「必须真的换了面」（相邻 IoU ≤ 阈值），
   同时「不许停在难看姿态」（分数 ≥ 门槛）。收势段几乎不变，于是它自然只取很少几格；
   开头那段变化快，就多取几格 —— 这正是「贪心，别均匀」该有的样子。
   末格钉死在 1（落定回正位）。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const samples = g.curve.samples;
const P = m.BAKE.shape;
const scoreAt = (u) => samples.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)).score;

const N = samples.length;
const US = samples.map((r) => r.u);
/* IoU 矩阵（相邻查询会反复用，先全算一遍，301×301/2 ≈ 45k 次，掩码 64 → 可能慢，用 40） */
const t0 = Date.now();
const SIZE = 40;
const masks = US.map((u) => m.__mask(P, u, SIZE));
const MI = masks[0].length;
function iou(i, j) {
  const a = masks[i], b = masks[j];
  let it = 0, un = 0;
  for (let k = 0; k < MI; k++) { if (a[k] && b[k]) it++; if (a[k] || b[k]) un++; }
  return un ? it / un : 1;
}
console.log('掩码算完', ((Date.now() - t0) / 1000).toFixed(1) + 's');

const PASS = 55, GOOD = 70;
function walk(TARGET) {
  const idx = [0];
  let i = 0;
  while (i < N - 1) {
    let j = i + 1;
    let found = -1;
    while (j < N) {
      if (US[j] === 1 && iou(i, j) > TARGET) { j = N; break; }      // 到末端还够不着就接到 1
      if (scoreAt(US[j]) >= PASS && iou(i, j) <= TARGET) { found = j; break; }
      if (US[j] >= 1) break;
      j++;
    }
    if (found < 0) { found = N - 1; }
    idx.push(found);
    i = found;
    if (idx.length > 40) break;
  }
  return idx;
}
for (const T of [0.90, 0.88, 0.86, 0.84, 0.82]) {
  const idx = walk(T);
  const sc = idx.map((i) => scoreAt(US[i]));
  const ious = idx.slice(1).map((j, k) => iou(idx[k], j));
  console.log('T=' + T, 'n=' + idx.length, 'min=' + Math.min(...sc), 'good=' + sc.filter((s) => s >= GOOD).length,
    'iou=' + Math.min(...ious).toFixed(3) + '..' + Math.max(...ious).toFixed(3));
  console.log('   us = [' + idx.map((i) => US[i].toFixed(4)).join(', ') + ']');
  console.log('   sc = [' + sc.join(', ') + ']');
  console.log('   iou= [' + ious.map((v) => v.toFixed(3)).join(', ') + ']');
}