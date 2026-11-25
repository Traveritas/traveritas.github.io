import { flatten, deviation } from './.fit-lib.mjs';

export { flatten, deviation };

/* 候选族：每 1/4 两段二次曲线，肩点 (s,-s)，控制点 (α, -2s) / (2s, -α)
   s = shoulder·A，α = point·A —— 两个归一化参数 */
const n = (v) => Math.round(v * 1000) / 1000;

export function path2(A, W, s, a) {
  const S = Math.abs(s), Al = Math.abs(a);
  const tips = [[0, -A], [W, 0], [0, A], [-W, 0]];
  const sh = [[S, -S], [S, S], [-S, S], [-S, -S]];
  let d = '';
  for (let i = 0; i < 4; i++) {
    const t0 = tips[i], t1 = tips[(i + 1) % 4], p = sh[i];
    const sg = (v) => (v === 0 ? 0 : Math.sign(v));
    const cx = (x) => (x === 0 ? Al * 1 : sg(x) * 0); // 占位，下面按象限算
    // 尖端 t0 的控制点：沿尖端轴往外推到 2S，再沿切向推 Al
    const c0 = t0[0] === 0 ? [Al * sg(t1[0]), sg(t0[1]) * 2 * S] : [sg(t0[0]) * 2 * S, Al * sg(t1[1])];
    const c1 = t1[0] === 0 ? [Al * sg(t0[0]), sg(t1[1]) * 2 * S] : [sg(t1[0]) * 2 * S, Al * sg(t0[1])];
    d += (i === 0 ? 'M' : 'L') + t0.join(',');
    d += 'Q' + c0.map(n).join(',') + ' ' + p.join(',');
    d += 'Q' + c1.map(n).join(',') + ' ' + t1.join(',');
  }
  return d + 'Z';
}

const ORIG = {
  cursor: 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z',
  boot: 'M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z',
};
const T = { cursor: { A: 10, W: 6.5 }, boot: { A: 10, W: 10 } };

for (const k of ['cursor', 'boot']) {
  const { A, W } = T[k];
  let best = { s: 0, a: 0, d: Infinity };
  for (let s = 0.12; s <= 0.36; s += 0.002)
    for (let a = 0.0; a <= 0.12; a += 0.002) {
      const d = deviation(ORIG[k], path2(A, W, s * A, a * A)).d;
      if (d < best.d) best = { s, a, d };
    }
  console.log(`[${k}] shoulder=${best.s.toFixed(3)} point=${best.a.toFixed(3)} → ${best.d.toFixed(4)} u`);
}

/* 联合最优：两个形状共用一组归一化参数 */
let joint = { s: 0, a: 0, d: Infinity };
for (let s = 0.16; s <= 0.32; s += 0.002)
  for (let a = 0.0; a <= 0.1; a += 0.002) {
    let m = 0;
    for (const k of ['cursor', 'boot']) {
      const { A, W } = T[k];
      m = Math.max(m, deviation(ORIG[k], path2(A, W, s * A, a * A)).d);
    }
    if (m < joint.d) joint = { s, a, d: m };
  }
console.log(`[joint] shoulder=${joint.s.toFixed(3)} point=${joint.a.toFixed(3)} → worst ${joint.d.toFixed(4)} u`);
for (const k of ['cursor', 'boot']) {
  const { A, W } = T[k];
  console.log(`   ${k}: ${deviation(ORIG[k], path2(A, W, joint.s * A, joint.a * A)).d.toFixed(4)} u`);
}