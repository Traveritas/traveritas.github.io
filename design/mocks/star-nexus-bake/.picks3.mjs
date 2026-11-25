/* 按「剪影变化」而不是「参数距离」选帧：从 u=0 起走，每一步往前找到第一处
   IoU(上一格, 这一处) ≤ 目标 的位置。收势阶段几乎不变，就不会被塞满。
   约束：每一格的分 ≥ PASS。最后一格钉死在 1（落定回正位）。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const samples = g.curve.samples;
const scoreAt = (u) => samples.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)).score;

/* 复用 bake.mjs 的内部函数不方便（没导出），这里用同口径重算 IoU */
const P = m.BAKE.shape;
const SF = await import('file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-final/src.js');

function walk(target, maxN = 40) {
  const us = [0];
  let u = 0;
  let guard = 0;
  while (u < 0.999 && us.length < maxN) {
    let next = null;
    for (let k = 1; k <= 400; k++) {
      const cand = Math.min(1, u + k * 0.0025);
      const sc = scoreAt(cand);
      if (sc < 55) continue; // 丑区不放
      const iou = m.__iou(P, us.at(-1), cand);
      if (iou <= target) { next = cand; break; }
      if (cand >= 1) { next = 1; break; }
    }
    if (next == null) next = 1;
    if (guard++ > 60) break;
    us.push(next);
    u = next;
  }
  if (us.at(-1) !== 1) us.push(1);
  return us;
}
for (const t of [0.90, 0.88, 0.85, 0.82, 0.80, 0.75]) {
  const us = walk(t);
  const sc = us.map(scoreAt);
  const ious = us.slice(1).map((u, i) => m.__iou(P, us[i], u));
  console.log('target', t, 'n=' + us.length, 'min=' + Math.min(...sc),
    'iou', Math.min(...ious).toFixed(3) + '..' + Math.max(...ious).toFixed(3),
    'us=' + us.map((v) => v.toFixed(3)).join(' '));
}