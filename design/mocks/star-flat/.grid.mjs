import { starPath, PRESETS } from './star.js';
import { deviation } from './.lib.mjs';

const O = {
  cursor: { d: 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z', arm: 10, waist: 6.5 },
  boot: { d: 'M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z', arm: 10, waist: 10 },
  ave: { d: 'M0,-50L11,-11L50,0L11,11L0,50L-11,11L-50,0L-11,-11Z', arm: 50, waist: 50 },
};

for (const k of ['cursor', 'boot']) {
  const o = O[k];
  let best = { s: 0, t: 0, d: 9e9 };
  for (let s = 0.18; s <= 0.30; s += 0.002)
    for (let t = -0.02; t <= 0.08; t += 0.002) {
      const d = deviation(o.d, starPath({ arm: o.arm, waist: o.waist, pinch: 1, shoulder: s, turn: t })).d;
      if (d < best.d) best = { s: +s.toFixed(3), t: +t.toFixed(3), d };
    }
  console.log(k, 'best shoulder', best.s, 'turn', best.t, '→', (best.d / o.arm * 100).toFixed(3), '% arm', `(${best.d.toFixed(4)} u)`);
}

/* 单一默认参数在各原件上的表现 */
for (const [s, t] of [[0.232, 0.026], [0.23, 0.024], [0.23, 0.03], [0.232, 0]]) {
  const r = Object.keys(O).map((k) => `${k} ${(deviation(O[k].d, starPath({ arm: O[k].arm, waist: O[k].waist, pinch: 1, shoulder: s, turn: t })).d / O[k].arm * 100).toFixed(2)}%`);
  console.log(`default shoulder=${s} turn=${t}:`, r.join(' · '));
}

/* turn=0 时（严格尖端切线）两原件分别最优 shoulder */
for (const k of ['cursor', 'boot']) {
  const o = O[k];
  let best = { s: 0, d: 9e9 };
  for (let s = 0.18; s <= 0.30; s += 0.001) {
    const d = deviation(o.d, starPath({ arm: o.arm, waist: o.waist, pinch: 1, shoulder: s, turn: 0 })).d;
    if (d < best.d) best = { s: +s.toFixed(3), d };
  }
  console.log(k, 'turn=0 best shoulder', best.s, '→', (best.d / o.arm * 100).toFixed(3), '%');
}