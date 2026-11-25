/* 相邻姿态到底「变了多少」：用剪影 IoU 和六轴方位角一起看，找出 u 轴上真正在变的那几段。 */
import fs from 'node:fs';
const ROOT = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-nexus-bake/';
const m = await import(ROOT + 'bake.mjs');
const SF = await import('file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/star-final/src.js');
const P = m.BAKE.shape;
const size = 48;
for (const u of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const M = SF.poseAt(u, SF.M_REST, SF.TUMBLE);
  const fr = SF.frames(M);
  const angs = fr.map((f) => +f.ang.toFixed(0));
  const mask = m.__mask(P, u, size);
  let n = 0; for (const v of mask) n += v;
  console.log('u=' + u.toFixed(2), 'area=' + n, 'angs=' + angs.join(','), 'radii=' + fr.map((f) => f.Lxy.toFixed(2)).join(','));
}
console.log('--- 相邻 IoU（步长 0.05）');
const us = Array.from({ length: 21 }, (_, i) => i / 20);
const masks = us.map((u) => m.__mask(P, u, size));
const iou = (a, b) => { let it = 0, un = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) it++; if (a[i] || b[i]) un++; } return un ? it / un : 1; };
console.log(us.slice(1).map((u, i) => u.toFixed(2) + ':' + iou(masks[i], masks[i + 1]).toFixed(2)).join(' '));