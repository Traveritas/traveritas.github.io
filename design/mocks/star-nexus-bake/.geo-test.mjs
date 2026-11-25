/* 在 Node 里复现一遍入口求交：屏幕中心那条视线应当打中这颗星。
   如果这里都对，问题就在着色器；这里不对，问题在面表。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
process.argv[2] = 'noop'; // 别让 bake.mjs 跑 CLI
const m = await import(ROOT + 'bake.mjs');
const { buildPieces, BAKE, poseAt } = m;
const g = JSON.parse(fs.readFileSync(new URL('./.shots/geo.json', import.meta.url), 'utf8'));
const SF = await import('file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-final/src.js');

const pieces = buildPieces(BAKE.shape);
console.log('pieces', pieces.length, 'faces', pieces.map((p) => p.faces.length).join(','));
console.log('piece0 faces:');
for (const f of pieces[0].faces) console.log('   ', f.map((v) => v.toFixed(4)).join(' '));

/* 相机与射线 */
const M = poseAt(0);
const t = [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
const cam = [t[2] * 8, t[5] * 8, t[8] * 8];
const rd = [t[0] * 0 + t[1] * 0 + t[2] * -1, t[3] * 0 + t[4] * 0 + t[5] * -1, t[6] * 0 + t[7] * 0 + t[8] * -1];
console.log('cam', cam.map((v) => +v.toFixed(3)), 'rd', rd.map((v) => +v.toFixed(3)));

function entry(ro, rd) {
  let best = 1e9, which = -1;
  for (let k = 0; k < pieces.length; k++) {
    let t0 = -1e9, t1 = 1e9;
    for (const f of pieces[k].faces) {
      const dn = f[0] * rd[0] + f[1] * rd[1] + f[2] * rd[2];
      const num = f[3] - (f[0] * ro[0] + f[1] * ro[1] + f[2] * ro[2]);
      if (dn > 1e-7) { const tt = num / dn; if (tt < t1) t1 = tt; }
      else if (dn < -1e-7) { const tt = num / dn; if (tt > t0) t0 = tt; }
    }
    if (t0 > t1 || t1 <= 1e-6) continue;
    if (t0 < best) { best = t0; which = k; }
  }
  return { best, which };
}
const e = entry(cam, rd);
console.log('entry', e);
console.log('hit point', cam.map((v, i) => +(v + rd[i] * e.best).toFixed(3)));

/* 顺便看看二十个方向 */
let hits = 0;
for (let a = 0; a < 16; a++) {
  const ang = (a / 16) * Math.PI * 2;
  const d = [Math.cos(ang) * 0.3, Math.sin(ang) * 0.3, -1];
  const dn = Math.hypot(...d);
  const r2 = d.map((v) => v / dn);
  const e2 = entry(cam, r2);
  if (e2.which >= 0) hits++;
}
console.log('16 个斜方向里打中的：', hits);

/* 点在体内吗（星心） */
const inPiece = (p, k) => pieces[k].faces.every((f) => f[0] * p[0] + f[1] * p[1] + f[2] * p[2] <= f[3] + 1e-9);
console.log('原点在块里:', pieces.map((_, k) => inPiece([0, 0, 0], k)).join(','));
console.log('原点+0.1x 在块里:', pieces.map((_, k) => inPiece([0.1, 0, 0], k)).join(','));