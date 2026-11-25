/**
 * 偏差量法（页面与 CLI 共用同一份）
 *
 * 把两条 path 都摊成闭合折线，取对称 Hausdorff（双向最大最近距离）——
 * 形状比较只能用这个：两次写法连曲线段数都对不上，谈不上逐点对应。
 *
 * 最近距离用一张均匀网格加速（48×48 格），所以 512 段/曲线在浏览器里也够快。
 * 单位一律是 path 单位（u）；换成显示像素：1 u = 显示高度 / (2·arm)。
 */
import { starPath } from './star.js';

/** 路径摊平：M / L / C / Q / Z，绝对坐标，每条曲线切 seg 份 */
export function flatten(d, seg = 512) {
  const toks = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const pts = [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  const num = () => parseFloat(toks[i++]);
  const P = () => [num(), num()];
  while (i < toks.length) {
    const t = toks[i++];
    if (t === 'M' || t === 'm') {
      cur = P();
      start = cur;
      pts.push(cur);
    } else if (t === 'L' || t === 'l') {
      cur = P();
      pts.push(cur);
    } else if (t === 'C' || t === 'c') {
      const c1 = P();
      const c2 = P();
      const e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg;
        const v = 1 - u;
        pts.push([
          v * v * v * cur[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * e[0],
          v * v * v * cur[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Q' || t === 'q') {
      const c1 = P();
      const e = P();
      for (let k = 1; k <= seg; k++) {
        const u = k / seg;
        const v = 1 - u;
        pts.push([
          v * v * cur[0] + 2 * v * u * c1[0] + u * u * e[0],
          v * v * cur[1] + 2 * v * u * c1[1] + u * u * e[1],
        ]);
      }
      cur = e;
    } else if (t === 'Z' || t === 'z') {
      pts.push(start);
      cur = start;
    }
  }
  return pts;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = a[0] + t * dx - p[0];
  const qy = a[1] + t * dy - p[1];
  return Math.sqrt(qx * qx + qy * qy);
}

/** 把闭合折线装进均匀网格（每段塞进它包围盒覆盖的所有格） */
function grid(poly) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const N = 48;
  const cell = Math.max(x1 - x0, y1 - y0, 1e-6) / N;
  const map = new Map();
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % n];
    const i0 = Math.floor((Math.min(a[0], b[0]) - x0) / cell);
    const i1 = Math.floor((Math.max(a[0], b[0]) - x0) / cell);
    const j0 = Math.floor((Math.min(a[1], b[1]) - y0) / cell);
    const j1 = Math.floor((Math.max(a[1], b[1]) - y0) / cell);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const key = i + ',' + j;
        let arr = map.get(key);
        if (!arr) map.set(key, (arr = []));
        arr.push(k);
      }
  }
  return { poly, map, cell, x0, y0, N };
}

/** 点到网格里那张折线的最短距离（按切比雪夫环外扩，满足下界即停） */
function nearest(g, p) {
  const { poly, map, cell, x0, y0 } = g;
  const ci = Math.floor((p[0] - x0) / cell);
  const cj = Math.floor((p[1] - y0) / cell);
  let best = Infinity;
  const seen = new Set();
  for (let r = 0; r <= 96; r++) {
    const iLo = ci - r;
    const iHi = ci + r;
    const jLo = cj - r;
    const jHi = cj + r;
    for (let i = iLo; i <= iHi; i++) {
      for (let j = jLo; j <= jHi; j++) {
        if (r > 0 && i !== iLo && i !== iHi && j !== jLo && j !== jHi) continue; // 只看这一环
        const arr = map.get(i + ',' + j);
        if (!arr) continue;
        for (const k of arr) {
          if (seen.has(k)) continue;
          seen.add(k);
          const d = segDist(p, poly[k], poly[(k + 1) % poly.length]);
          if (d < best) best = d;
        }
      }
    }
    if (best <= r * cell) break; // 环外的点距离必 ≥ r·cell
  }
  return best;
}

function oneWay(A, gB) {
  let max = 0;
  let at = null;
  for (const p of A) {
    const d = nearest(gB, p);
    if (d > max) {
      max = d;
      at = p;
    }
  }
  return { max, at };
}

/**
 * 对称 Hausdorff：{ d, at, from }
 * from = 'orig' 表示最远的那点落在原件上（原件被复刻漏掉了一块）。
 */
export function deviation(dA, dB, seg = 512) {
  const A = flatten(dA, seg);
  const B = flatten(dB, seg);
  const f = oneWay(A, grid(B));
  const g = oneWay(B, grid(A));
  return f.max >= g.max ? { d: f.max, at: f.at, from: 'orig' } : { d: g.max, at: g.at, from: 'gen' };
}

/* ── 三份手绘原件（照抄源码，一个数没改）── */
export const ORIGINALS = [
  {
    key: 'cursor',
    label: 'Cursor.astro',
    note: '竖 10 · 横 6.5 · 曲边',
    arm: 10,
    waist: 6.5,
    d: 'M0,-10C0.5,-3 2,-0.9 6.5,0C2,0.9 0.5,3 0,10C-0.5,3 -2,0.9 -6.5,0C-2,-0.9 -0.5,-3 0,-10Z',
    fit: { arm: 10, waist: 6.5, pinch: 1, shoulder: 0.214, turn: 0.024 },
    preset: 'spire',
  },
  {
    key: 'boot',
    label: 'BootVeil.astro',
    note: '1 : 1 · 曲边',
    arm: 10,
    waist: 10,
    d: 'M0,-10C0.7,-2.6 2.6,-0.7 10,0C2.6,0.7 0.7,2.6 0,10C-0.7,2.6 -2.6,0.7 -10,0C-2.6,-0.7 -0.7,-2.6 0,-10Z',
    fit: { arm: 10, waist: 10, pinch: 1, shoulder: 0.246, turn: 0.03 },
    preset: 'equal',
  },
  {
    key: 'ave',
    label: 'Ave.astro',
    /* --ave-star 是 50×50 盒里的 polygon(50% 0, 61% 39%, …)，换成以中心为原点 */
    note: '1 : 1 · 直边',
    arm: 50,
    waist: 50,
    d: 'M0,-50L11,-11L50,0L11,11L0,50L-11,11L-50,0L-11,-11Z',
    fit: { arm: 50, waist: 50, pinch: 0, shoulder: 0.22, turn: 0 },
    preset: 'facet',
  },
];

/** 逐条算「原件 vs 复刻」，附 200px 显示尺寸下的像素偏差 */
export function wall(displayPx = 200, seg = 512) {
  return ORIGINALS.map((o) => {
    const genD = starPath(o.fit);
    const { d: dev, at, from } = deviation(o.d, genD, seg);
    /* 1 u = displayPx / (2·arm) 像素 */
    const pxPerUnit = displayPx / (2 * o.arm);
    return {
      key: o.key,
      label: o.label,
      note: o.note,
      arm: o.arm,
      waist: o.waist,
      preset: o.preset,
      fit: o.fit,
      origD: o.d,
      genD,
      dev,
      at,
      from,
      pxPerUnit,
      devPctArm: (dev / o.arm) * 100,
      devPctHeight: (dev / (2 * o.arm)) * 100,
      devPx: dev * pxPerUnit,
    };
  });
}