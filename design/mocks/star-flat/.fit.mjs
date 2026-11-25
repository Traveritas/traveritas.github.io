/* 量偏差：把手绘星形的 path 与生成器的 path 都摊成折线，
   求对称最大距离（Hausdorff）。顺带扫 shoulder，看能不能对得更准。
   node design/mocks/star-flat/.fit.mjs */
import { starPath } from './star.js';

/* ── 路径摊平：M / L / C / Q / Z（绝对坐标）── */
export function flatten(d, seg = 96) {
  const toks = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const pts = [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  const num = () => parseFloat(toks[i++]);
  const P = () => { const p = [num(), num()]; return p; };
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M' || t === 'm') { cur = P(); start = cur; pts.push(cur); }
    else if (t === 'L' || t === 'l') { cur = P(); pts.push(cur); }
    else if (t === 'C' || t === 'c') {
      const c1 = P(), c2 = P(), e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg, v = 1 - u;
        pts.push([
          v*v*v*cur[0] + 3*v*v*u*c1[0] + 3*v*u*u*c2[0] + u*u*u*e[0],
          v*v*v*cur[1] + 3*v*v*u*c1[1] + 3*v*u*u*c2[1] + u*u*u*e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Q' || t === 'q') {
      const c1 = P(), e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg, v = 1 - u;
        pts.push([
          v*v*cur[0] + 2*v*u*c1[0] + u*u*e[0],
          v*v*cur[1] + 2*v*u*c1[1] + u*u*e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Z' || t === 'z') { pts.push(start); cur = start; }
  }
  return pts;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx*dx + dy*dy;
  let t = L ? ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t*dx), p[1] - (a[1] + t*dy));
}

/** 点集 A 到折线 B 的最大最近距离 */
function oneWay(A, B) {
  let max = 0, at = null;
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

/** 对称 Hausdorff */
export function deviation(dA, dB) {
  const A = flatten(dA), B = flatten(dB);
  const f = oneWay(A, B), g = oneWay(B, A);
  return f.max >= g.max
    ? { d: f.max, from: 'A', at: f.at }
    : { d: g.max, from: 'B', at: g.at };
}

/* ── 三份原件（居中到 0,0）── */
const ORIG = {
  cursor: 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z',
  boot: 'M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z',
  /* Ave 的 clip-path polygon 换到以中心为原点的坐标：50% 边长 50，肩 11 */
  ave: 'M0,-50L11,-11L50,0L11,11L0,50L-11,11L-50,0L-11,-11Z',
};
const TARGET = { cursor: { arm: 10, waist: 6.5 }, boot: { arm: 10, waist: 10 }, ave: { arm: 50, waist: 50 } };

for (const k of ['cursor', 'boot', 'ave']) {
  const t = TARGET[k];
  let best = { s: 0, d: Infinity };
  for (let s = 0.1; s <= 0.42; s += 0.0005) {
    const d = deviation(ORIG[k], starPath({ ...t, pinch: 1, shoulder: s })).d;
    if (d < best.d) best = { s, d };
  }
  const pick = { cursor: 0.232, boot: 0.232 }[k];
  console.log(
    `[${k}] best shoulder=${best.s.toFixed(4)} → dev ${best.d.toFixed(4)} u` +
      (pick ? `   | shoulder=${pick}: ${deviation(ORIG[k], starPath({ ...t, pinch: 1, shoulder: pick })).d.toFixed(4)} u` : ''),
  );
}

/* Ave 应该是 0（pinch 0 + shoulder .22 与八点多边形逐点相同） */
console.log('[ave exact]', deviation(ORIG.ave, starPath({ arm: 50, waist: 50, pinch: 0, shoulder: 0.22 })).d.toFixed(6), 'u');

/* 自由二次控制点能做到多准？（判断「要不要再加一个参数」） */
function bestFreeQuad(orig, arm, waist) {
  const A = flatten(orig);
  /* 只拟合 顶部→肩 那一段：取 A 中 x∈[0,..] 且 y 单调上升、止于肩点的部分不好切，
     改成：把整条路径按 8 段二次重画，控制点逐段做局部搜索 —— 只是估个下界 */
  let lo = 0, hi = 0;
  return null;
}