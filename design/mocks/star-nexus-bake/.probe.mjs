/* 诊断：先确认三件事再动笔
   ① star-final 的姿态工具能在 Node 里直接用（M_REST 是否真是体对角视角）
   ② 我这条「三个正交方双锥求并」的八半空间写法是否真的围出方双锥
   ③ 体对角视角下六支投影半径与夹角 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve('D:/Documents/HTA/My Projects/personal-website');
const SF = await import(pathToFileURL(path.join(ROOT, 'design/mocks/star-final/src.js')).href);

console.log('ISO', SF.ISO, 'M_REST', SF.M_REST);
const fr = SF.frames(SF.M_REST);
console.log(
  'frames(M_REST) Lxy:',
  fr.map((f) => +f.Lxy.toFixed(4)).join(' '),
  'skipped:',
  fr.filter((f) => f.skip).length,
);

/* ② 方双锥半空间：极点轴 a，基半宽 B，锥高 H：s*u/B + r*w/H <= 1 */
function bipyramidPlanes(axis, B, H) {
  const u = [(axis + 1) % 3, (axis + 2) % 3];
  const out = [];
  for (const lat of u) {
    for (const s of [1, -1]) {
      for (const r of [1, -1]) {
        const n = [0, 0, 0];
        n[lat] = s / B;
        n[axis] = r / H;
        const len = Math.hypot(n[0], n[1], n[2]);
        out.push({
          n: n.map((v) => v / len),
          w: 1 / len,
        });
      }
    }
  }
  return out;
}
const pl = bipyramidPlanes(2, 0.34, 1);
const inside = (p, planes) => planes.every(({ n, w }) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2] <= w + 1e-9);
console.log('apex (0,0,1) in?', inside([0, 0, 1], pl));
console.log('equator corner (0.34,0.34,0) in?', inside([0.34, 0.34, 0], pl));
console.log('just outside (0.35,0.34,0) in?', inside([0.35, 0.34, 0], pl));
console.log('mid (0.17,0,0.5) in?', inside([0.17, 0, 0.5], pl));
console.log('side (0.2,0,0.4) in?', inside([0.2, 0, 0.4], pl), '(应 false: 0.2/0.34+0.4/1 =', (0.2 / 0.34 + 0.4).toFixed(3), ')');

/* ③ 体对角视角：把六轴投影出来，看半径与夹角 */
const zAxis = [0, 0, 1];
const axes = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
function mv(m, v) {
  return [0, 1, 2].map((r) => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);
}
const projRest = axes.map((a) => {
  const w = mv(SF.M_REST, a);
  const d = w[2];
  return [w[0], w[1], Math.hypot(w[0], w[1])].map((x) => +x.toFixed(4));
});
console.log('M_REST 下六轴世界向（x,y,|proj|）:', JSON.stringify(projRest));
const angs = projRest.map((p) => +(Math.atan2(p[1], p[0]) * 180 / Math.PI).toFixed(2));
console.log('screen angles:', angs.join(' '));
const gaps = angs.map((a, i) => {
  let d = angs[(i + 1) % 6] - a;
  while (d < 0) d += 360;
  return +d.toFixed(2);
});
console.log('consecutive gaps:', gaps.join(' '));