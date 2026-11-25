/* 选帧的最终依据（.motion.mjs 量出来的事实）：
   u≈0–0.45 是**真的在翻**的那一段（相邻 0.05 的 IoU 从 0.64 到 0.94），
   u≥0.65 已经落定（IoU 1.00），再往后取多少格都是同一张图。
   所以：把注意力全押在 0–0.45，落定段只留几格做收势。

   贪心的具体做法：从 0 起，每一步沿 u 往前找第一处「IoU 落到目标以下」的位置；
   同时不许停在 55 分以下。落定段用更大的步长直接跨。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const P = m.BAKE.shape;
const samples = g.curve.samples;
const scoreAt = (u) => samples.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) ? b : a)).score;
const SIZE = 48;
const MI = SIZE * SIZE;
const maskAt = (u) => m.__mask(P, u, SIZE);
const iouAB = (a, b) => { let it = 0, un = 0; for (let i = 0; i < MI; i++) { if (a[i] && b[i]) it++; if (a[i] || b[i]) un++; } return un ? it / un : 1; };

/* 先算一格 0.0025 的密采样掩码 */
const US = [];
for (let i = 0; i <= 400; i++) US.push(i / 400);
const MASKS = US.map(maskAt);

function greedy(target, pass = 55) {
  const idx = [0];
  let i = 0;
  while (i < US.length - 1) {
    let step = 1;
    /* 往后走，找到第一处 IoU ≤ target（且分数够） */
    while (i + step < US.length - 1) {
      const j = i + step;
      const ok = scoreAt(US[j]) >= pass && iouAB(MASKS[i], MASKS[j]) <= target;
      if (ok) break;
      step++;
    }
    i = Math.min(i + step, US.length - 1);
    idx.push(i);
    if (idx.length > 40) break;
  }
  if (US[idx.at(-1)] !== 1) idx.push(US.length - 1);
  return idx;
}

for (const T of [0.70, 0.75, 0.78, 0.80, 0.83, 0.86]) {
  const idx = greedy(T);
  const us = idx.map((i) => US[i]);
  const sc = us.map(scoreAt);
  const ious = us.slice(1).map((u, k) => iouAB(MASKS[idx[k]], MASKS[idx[k + 1]]));
  console.log('T=' + T, 'n=' + us.length, 'min=' + Math.min(...sc),
    'iouRange=' + Math.min(...ious).toFixed(3) + '..' + Math.max(...ious).toFixed(3),
    'maxGap=' + Math.max(...us.slice(1).map((u, k) => u - us[k])).toFixed(3));
  console.log('   us = [' + us.map((v) => v.toFixed(4)).join(', ') + ']');
  console.log('   sc = [' + sc.join(', ') + ']');
  console.log('   io = [' + ious.map((v) => v.toFixed(3)).join(', ') + ']');
}