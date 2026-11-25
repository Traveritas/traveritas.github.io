/* 量偏差：把手绘星形的 path 与生成器的 path 都摊成折线，求对称 Hausdorff。
   输出 .measure.json 供 index.html 直接引用（页面上的读数与这里是同一份数）。
   node design/mocks/star-flat/.measure.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starPath, knotPath, PRESETS } from './star.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ── 路径摊平（M/L/C/Q/Z，绝对坐标；站内路径都是这种写法）── */
export function flatten(d, seg = 128) {
  const toks = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const pts = [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  const num = () => parseFloat(toks[i++]);
  const P = () => [num(), num()];
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M' || t === 'm') { cur = P(); start = cur; pts.push(cur); }
    else if (t === 'L' || t === 'l') { cur = P(); pts.push(cur); }
    else if (t === 'C' || t === 'c') {
      const c1 = P(), c2 = P(), e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg, v = 1 - u;
        pts.push([
          v * v * v * cur[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * e[0],
          v * v * v * cur[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Q' || t === 'q') {
      const c1 = P(), e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg, v = 1 - u;
        pts.push([
          v * v * cur[0] + 2 * v * u * c1[0] + u * u * e[0],
          v * v * cur[1] + 2 * v * u * c1[1] + u * u * e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Z' || t === 'z') { pts.push(start); cur = start; }
  }
  return pts;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function oneWay(A, B) {
  let max = 0;
  let at = null;
  for (const p of A) {
    let best = Infinity;
    for (let k = 0; k < B.length; k++) {
      const d = segDist(p, B[k], B[(k + 1) % B.length]);
      if (d < best) best = d;
    }
    if (best > max) { max = best; at = p; }
  }
  return { max, at };
}

/** 对称 Hausdorff（形状偏差的标准量法） */
export function deviation(dA, dB) {
  const A = flatten(dA);
  const B = flatten(dB);
  const f = oneWay(A, B);
  const g = oneWay(B, A);
  return f.max >= g.max ? { d: f.max, at: f.at, from: 'orig' } : { d: g.max, at: g.at, from: 'gen' };
}

/* ── 四份原件 ── */
const ORIG = {
  cursor: {
    label: 'Cursor.astro',
    d: 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z',
    arm: 10,
  },
  boot: {
    label: 'BootVeil.astro',
    d: 'M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z',
    arm: 10,
  },
  /* Ave 的 --ave-star 是 50×50 盒里的 clip-path polygon，换成以中心为原点：
     (0,-50) (11,-11) (50,0) (11,11) (0,50) (-11,11) (-50,0) (-11,-11)。
     shoulder = 11/50 = 0.22 */
  ave: {
    label: 'Ave.astro',
    d: 'M0,-50L11,-11L50,0L11,11L0,50L-11,11L-50,0L-11,-11Z',
    arm: 50,
  },
};

/* ── 生成器的对应复刻 ── */
const GEN = {
  cursor: { preset: 'spire', o: { arm: 10, waist: 6.5, pinch: 1, shoulder: 0.214, turn: 0.024 } },
  boot: { preset: 'equal', o: { arm: 10, waist: 10, pinch: 1, shoulder: 0.246, turn: 0.03 } },
  ave: { preset: 'facet', o: { arm: 50, waist: 50, pinch: 0, shoulder: 0.22 } },
};

const out = { measuredAt: new Date().toISOString(), items: [] };
for (const k of Object.keys(ORIG)) {
  const orig = ORIG[k];
  const g = GEN[k];
  const gen = starPath(g.o);
  const dev = deviation(orig.d, gen);
  out.items.push({
    key: k,
    label: orig.label,
    arm: orig.arm,
    preset: g.preset,
    params: g.o,
    origD: orig.d,
    genD: gen,
    dev: dev.d,
    /* 以 arm 为分母的相对偏差；换算成 200px 显示尺寸就是 px */
    devPctArm: (dev.d / orig.arm) * 100,
    devPxAt200: (dev.d / orig.arm) * 100,
    at: dev.at,
    from: dev.from,
  });
}

/* ── 一份预设能不能顶三份原件：arm / waist 由原件自己给（那是比例，本来就是三个值），
      只让 pinch / shoulder / turn 走预设 ── */
const ASPECT = { cursor: 6.5, boot: 10, ave: 50 };
out.presets = {};
for (const preset of ['spire', 'equal', 'facet', 'tick']) {
  const p = PRESETS[preset];
  out.presets[preset] = Object.keys(ORIG).map((k) => {
    const o = { ...p, arm: ORIG[k].arm, waist: ASPECT[k] };
    return { key: k, dev: +((deviation(ORIG[k].d, starPath(o)).d / o.arm) * 100).toFixed(3) };
  });
}

/* 通用默认（不指定任何预设）：pinch 1 / shoulder 0.232 / turn 0.026 */
out.defaults = Object.keys(ORIG).map((k) => {
  const o = { arm: ORIG[k].arm, waist: ASPECT[k] };
  return { key: k, dev: +((deviation(ORIG[k].d, starPath(o)).d / o.arm) * 100).toFixed(3) };
});

/* ── 结：Cursor 的 M0,-7L4.6,0L0,7L-4.6,0Z ── */
out.knot = {
  orig: 'M0,-7L4.6,0L0,7L-4.6,0Z',
  gen: knotPath(7),
  dev: deviation('M0,-7L4.6,0L0,7L-4.6,0Z', knotPath(7)).d,
};

fs.writeFileSync(path.join(HERE, '.measure.json'), JSON.stringify(out, null, 2));

for (const it of out.items) {
  console.log(
    `${it.label.padEnd(16)} ${String(it.dev.toFixed(4)).padStart(8)} u  = ${it.devPctArm.toFixed(2)}% arm  (worst ${it.from})`,
  );
}
console.log('knot dev', out.knot.dev.toFixed(6), 'u');
console.log('默认参数（pinch 1 · shoulder .232 · turn .026）逐原件：');
console.log('  ', out.defaults.map((r) => `${r.key} ${r.dev}%`).join(' · '));
console.log('预设横向对照（% arm）：');
for (const [p, rows] of Object.entries(out.presets)) {
  console.log('  ', p.padEnd(6), rows.map((r) => `${r.key} ${r.dev}`).join(' · '));
}