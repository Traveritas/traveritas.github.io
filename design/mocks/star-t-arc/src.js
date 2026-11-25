/**
 * 醒梦 · 六芒星 · 弧线力度（profile curvature）
 * ─────────────────────────────────────────────────────────────
 * 只改一件事：每一支风筝的两条侧边（尖端 → 内角）从直线变成曲线。
 * 其余全部照 `src/scripts/toolstar.ts` 的 `drawStar()`：
 *
 *   支：A = −n·1.9 ｜ B = 端点 (r·u) ｜ C = +n·1.9 ｜ D = −u·1.4     （u 是支方向，n 是法向）
 *   深度：opacity = 0.38 + 0.5·(z+1)/2，远的淡、近的实
 *   中心：半径 1.7 的实心圆（`ts-hub`，站内是 --amber）
 *
 * ── 弧线怎么插值（照 design/mocks/star-flat/star.js 的做法）──
 * star-flat 的 `pinch` 是「控制点 = 弦中点 ⇒ 尖峰位置」的插值量：pinch = 0 时边是直线，
 * pinch = 1 时是内凹弧。这里把同一个插值写成有符号的一份：控制点落在弦中点沿法向推出
 * `off · 弦长` 的地方，`off > 0` 往外鼓（凸），`off < 0` 往里收（凹），`off = 0` 回到直线。
 * 所以「直 / 凸 / 凹」是同一个参数的三个取值，不是三套写法。
 *
 * 一条边可以拆成若干段二次曲线。段数 > 1 时，结点**不能**随手落在弦上——那样结点处
 * 切线会断，200px 下能看见一道折。这里按「结点处两侧切线共线」解出结点相对弦的外移量：
 *
 *   W[i]  第 i 段弦长（全弦归一）      D[i]  第 i 段控制点法向外移（全弦归一）
 *   u[i]  第 i 个内部结点的半外移      e[i] = 2u[i]
 *   结点 i 处：W[i]·(u[i+1] − u[i] + D[i+1]) = W[i+1]·(u[i] − u[i−1] − D[i])
 *
 * 这是一个三对角方程组，u[0] = u[n+1] = 0，用 Thomas 法一次解完。
 * 全部 D = 0 时解出全 0 —— 曲线退化回直线，与现役那颗逐点相同（`.probe.mjs` 验过）。
 */

export const DEG = Math.PI / 180;

/** 现役那颗星的几何（`drawStar()` 里的 lite 值），一字未改 */
export const BASE = {
  r: 16, // 支长（体单位）
  halfWidth: 1.9, // 支在原点处的半宽
  tail: 1.4, // 支尾越过原点往回伸
  hub: 1.7, // 中心圆芯半径
  yaw: 45,
  pitch: 35.264,
  box: 40, // viewBox 边长：Toolstar.astro 是 -20 -20 40 40
};

/* ── 姿势 ────────────────────────────────────────────────── */

const AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * 六支的屏幕方向。投影式与 `drawStar()` 逐字相同（先绕竖直轴 yaw，再压 pitch）。
 * 45 / 35.264 是唯一让六支投影等长的姿势 —— 见 star-v-motion/notes.md。
 */
export function spikes(p = BASE) {
  const o = { ...BASE, ...p };
  const yaw = o.yaw * DEG;
  const pit = o.pitch * DEG;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pit);
  const sp = Math.sin(pit);
  const out = [];
  for (const [ax, ay, az] of AXES) {
    for (const s of [1, -1]) {
      const x0 = ax * s;
      const y0 = ay * s;
      const z0 = az * s;
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      const x = x1 * o.r;
      const y = -y2 * o.r;
      const L = Math.hypot(x, y);
      out.push({ x, y, z: z2, ux: x / L, uy: y / L, rp: L });
    }
  }
  out.sort((a, b) => a.z - b.z);
  return out;
}

/* ── 曲线：一阶连续的二次曲线链 ─────────────────────────── */

function solveTridiag(lo, di, up, rhs) {
  const n = di.length;
  const cp = new Array(n);
  const dp = new Array(n);
  for (let i = 0; i < n; i++) {
    const m = i === 0 ? di[0] : di[i] - lo[i] * cp[i - 1];
    cp[i] = i === n - 1 ? 0 : up[i] / m;
    dp[i] = (rhs[i] - (i === 0 ? 0 : lo[i] * dp[i - 1])) / m;
  }
  const x = new Array(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/**
 * 一条带弧的边，从 P 到 T，按 knots 拆成 knots.length + 1 段二次曲线。
 *
 * @param {[number,number]} P  起点
 * @param {[number,number]} T  终点
 * @param {number[]} knots     内部结点参数（0 < t < 1，升序）
 * @param {number[]} offs      各段控制点沿 nOut 的外移（单位 = 弦长；正 = 远离轴）
 * @param {[number,number]} nOut  『外』是哪一边（单位向量）
 * @returns {{a:[number,number], c:[number,number], b:[number,number]}[]}
 */
export function chainEdge(P, T, knots, offs, nOut) {
  const L = Math.hypot(T[0] - P[0], T[1] - P[1]) || 1;
  const kn = knots || [];
  const n = kn.length;
  const ts = [0, ...kn, 1];
  const W = [0];
  for (let i = 1; i <= n + 1; i++) W[i] = ts[i] - ts[i - 1];
  const D = [0];
  for (let i = 1; i <= n + 1; i++) D[i] = (Number(offs?.[i - 1]) || 0) * L;

  const u = new Array(n + 2).fill(0);
  if (n > 0) {
    const lo = [];
    const di = [];
    const up = [];
    const rhs = [];
    for (let i = 1; i <= n; i++) {
      lo.push(-W[i + 1]);
      di.push(-(W[i] + W[i + 1]));
      up.push(W[i]);
      rhs.push(-(W[i] * D[i + 1] + W[i + 1] * D[i]));
    }
    const sol = solveTridiag(lo, di, up, rhs);
    for (let i = 1; i <= n; i++) u[i] = sol[i - 1];
  }

  const K = [P];
  for (let i = 1; i <= n; i++) {
    const t = ts[i];
    const e = 2 * u[i];
    K.push([
      P[0] + (T[0] - P[0]) * t + nOut[0] * e,
      P[1] + (T[1] - P[1]) * t + nOut[1] * e,
    ]);
  }
  K.push(T);

  const segs = [];
  for (let i = 1; i <= n + 1; i++) {
    const a = K[i - 1];
    const b = K[i];
    const c = [
      (a[0] + b[0]) / 2 + nOut[0] * D[i],
      (a[1] + b[1]) / 2 + nOut[1] * D[i],
    ];
    segs.push({ a, c, b });
  }
  // 全直时把控制点吸附到中点，保证 d 与现役那颗逐字相同
  for (const s of segs) {
    s.__straight =
      Math.abs(s.c[0] - (s.a[0] + s.b[0]) / 2) < 1e-9 &&
      Math.abs(s.c[1] - (s.a[1] + s.b[1]) / 2) < 1e-9;
  }
  return segs;
}

/* ── 一支的轮廓 ─────────────────────────────────────────── */

/**
 * @param {object} sp   spikes() 的一项
 * @param {object} o    几何 + 曲线
 * @param {{knots:number[], offs:number[]}} o.edge 侧边曲线
 * @returns {{kind:'q'|'l', a:[number,number], c?:[number,number], b:[number,number]}[]}
 */
export function spikeSegs(sp, o) {
  const p = { ...BASE, ...o };
  const w = p.halfWidth;
  const u = [sp.ux, sp.uy];
  /* n 的符号取成让 A 就是 drawStar() 的第一个点 —— 只有这样「直」那一档才与现役逐字相同 */
  const n = [sp.uy, -sp.ux];
  const A = [-n[0] * w, -n[1] * w];
  const C = [n[0] * w, n[1] * w];
  const B = [u[0] * sp.rp, u[1] * sp.rp];
  const Dp = [-u[0] * p.tail, -u[1] * p.tail];
  const edge = p.edge || { knots: [], offs: [0] };

  // 零弯：直接写成现役那张四角风筝，多一点、少一点都和 drawStar() 逐字相同
  if (isStraight(edge)) {
    return [
      { kind: 'l', a: A, b: B },
      { kind: 'l', a: B, b: C },
      { kind: 'l', a: C, b: Dp },
      { kind: 'l', a: Dp, b: A },
    ];
  }

  // 左翼：A → B，外侧是 −n
  const left = chainEdge(A, B, edge.knots, edge.offs, [-n[0], -n[1]]);
  // 右翼：C → B，外侧是 +n；走到 B 之后整条倒过来，接到 C
  const right = chainEdge(C, B, edge.knots, edge.offs, [n[0], n[1]]);

  const segs = [];
  for (const s of left) segs.push({ kind: 'q', a: s.a, c: s.c, b: s.b, __straight: s.__straight });
  for (let i = right.length - 1; i >= 0; i--) {
    const s = right[i];
    segs.push({ kind: 'q', a: s.b, c: s.c, b: s.a, __straight: s.__straight });
  }
  segs.push({ kind: 'l', a: C, b: Dp });
  segs.push({ kind: 'l', a: Dp, b: A });
  return segs;
}

export const isStraight = (edge) =>
  !edge || !edge.offs || edge.offs.every((v) => Math.abs(Number(v) || 0) < 1e-9);

const fmt = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const PT = (p) => fmt(p[0]) + ' ' + fmt(p[1]);

/** 段表 → path d */
export function segsToD(segs) {
  let d = 'M' + PT(segs[0].a);
  for (const s of segs) {
    if (s.kind === 'q' && !s.__straight) d += 'Q' + PT(s.c) + ' ' + PT(s.b);
    else d += 'L' + PT(s.b);
  }
  return d + 'Z';
}

/** 段表 → 折线（量测用） */
export function segsToPoints(segs, steps = 14) {
  const out = [];
  for (const s of segs) {
    if (s.kind === 'l' || s.__straight) {
      out.push(s.a, s.b);
      continue;
    }
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      out.push([
        mt * mt * s.a[0] + 2 * mt * t * s.c[0] + t * t * s.b[0],
        mt * mt * s.a[1] + 2 * mt * t * s.c[1] + t * t * s.b[1],
      ]);
    }
  }
  out.push(segs[segs.length - 1].b);
  return out;
}

/** 一整颗星：{ paths: [{d, z, op}], hub } */
export function buildStar(o = {}) {
  const p = { ...BASE, ...o };
  const paths = spikes(p).map((sp) => ({
    d: segsToD(spikeSegs(sp, p)),
    z: sp.z,
    op: 0.38 + (0.5 * (sp.z + 1)) / 2,
    ux: sp.ux,
    uy: sp.uy,
  }));
  return { paths, hub: p.hub, p };
}

/**
 * 单独一支：只画一支风筝，把它转到竖直朝上、放大铺满自己的框。
 * 用来「看清那道弯」——整颗星上六支互相遮挡，200px 下看不出边是怎么弯的。
 *
 * 长度用投影后的 13.064（= r·cos(pitch)·√2），不是 r —— 这样它的比例就是屏幕上真实那一支的比例。
 */
export function singleSpikeMarkup(o = {}) {
  const p = { ...BASE, ...o };
  const sp = { ux: 0, uy: -1, rp: p.r * Math.cos(p.pitch * DEG) * Math.SQRT2, z: 0 };
  const segs = spikeSegs(sp, p);
  const pts = segsToPoints(segs, 20);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of pts) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    miny = Math.min(miny, y); maxy = Math.max(maxy, y);
  }
  const pad = 0.6;
  const w = Math.max(maxx - minx, maxy - miny) + pad * 2;
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  return `<svg viewBox="${(cx - w / 2).toFixed(3)} ${(cy - w / 2).toFixed(3)} ${w.toFixed(3)} ${w.toFixed(3)}" aria-hidden="true"><path d="${segsToD(segs)}" fill="currentColor"/></svg>`;
}

/** SVG 字符串（与 drawStar() 同构，只是 d 换了、多一层 hub） */
export function starMarkup(o = {}) {
  const st = buildStar(o);
  const box = st.p.box;
  /* zoom：给 (中, 半宽) 就把画框收到中心那一块 —— 400px 下看中心细节用 */
  const [x, y, w] = st.p.zoom
    ? st.p.zoom
    : [-box / 2, -box / 2, box];
  let s = `<svg viewBox="${x} ${y} ${w} ${w}" aria-hidden="true">`;
  for (const q of st.paths) {
    s += `<path d="${q.d}" fill="currentColor" fill-opacity="${(() => {
      const r = Math.round(q.op * 1000) / 1000;
      return r.toFixed(3);
    })()}"/>`;
  }
  if (st.p.hub) s += `<circle r="${st.hub}" class="hub"/>`;
  return s + '</svg>';
}

/* ── 量测 ───────────────────────────────────────────────── */

/** 单位 → 像素：viewBox 40 单位铺满 size */
export const pxPerUnit = (size) => size / BASE.box;

/** 射线与折线求进入距离的（凸/星形）最大值 —— 原点在每支内部，故取最远的那个交点 */
function rayExit(poly, dx, dy) {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a[0] * ey - a[1] * ex) / den; // 射线参数
    const s = (a[0] * dy - a[1] * dx) / den; // 段参数
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

/**
 * 剪影的极径剖面 R(θ)：六支的并集沿每一条射线最远到哪。
 * 原点在每支内部 ⇒ R(θ) = max over 六支（这是剪影，不是并集边界的一般解，但这里够用）。
 */
export function silhouetteProfile(o = {}, thetaN = 1440) {
  const p = { ...BASE, ...o };
  const polys = spikes(p).map((sp) => segsToPoints(spikeSegs(sp, p)));
  const R = new Float64Array(thetaN);
  let mn = Infinity;
  let mnI = 0;
  for (let i = 0; i < thetaN; i++) {
    const a = (i / thetaN) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = 0;
    for (const poly of polys) r = Math.max(r, rayExit(poly, dx, dy));
    R[i] = r;
    if (r < mn) {
      mn = r;
      mnI = i;
    }
  }
  return { R, thetaN, notch: mn, notchDeg: (mnI / thetaN) * 360 };
}

/** 凹口半径（体单位 / 给定尺寸下的像素） */
export function notch(o = {}) {
  const { notch: u } = silhouetteProfile(o);
  return { u, px: (size) => u * pxPerUnit(size) };
}

/** 中心区里的「交叠道数」：距原点 radius 以内，任意两支的轮廓互相穿过几次 */
export function centreCrossings(o = {}, radius = 3.2) {
  const p = { ...BASE, ...o };
  const polys = spikes(p).map((sp) => segsToPoints(spikeSegs(sp, p)));
  const inside = (pt) => Math.hypot(pt[0], pt[1]) <= radius;
  let n = 0;
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const A = polys[i];
      const B = polys[j];
      for (let a = 0; a < A.length; a++) {
        const p1 = A[a];
        const p2 = A[(a + 1) % A.length];
        if (!inside(p1) && !inside(p2)) continue;
        for (let b = 0; b < B.length; b++) {
          const q1 = B[b];
          const q2 = B[(b + 1) % B.length];
          if (!inside(q1) && !inside(q2)) continue;
          const d1x = p2[0] - p1[0];
          const d1y = p2[1] - p1[1];
          const d2x = q2[0] - q1[0];
          const d2y = q2[1] - q1[1];
          const den = d1x * d2y - d1y * d2x;
          if (Math.abs(den) < 1e-12) continue;
          const s = ((q1[0] - p1[0]) * d2y - (q1[1] - p1[1]) * d2x) / den;
          const t = ((q1[0] - p1[0]) * d1y - (q1[1] - p1[1]) * d1x) / den;
          if (s > 1e-6 && s < 1 - 1e-6 && t > 1e-6 && t < 1 - 1e-6) {
            const x = p1[0] + d1x * s;
            const y = p1[1] + d1y * s;
            if (Math.hypot(x, y) <= radius) n++;
          }
        }
      }
    }
  }
  return n;
}

/** 中心区的墨量（六支覆盖次数对半径的积分，粗粒度格点） */
export function centreLoad(o = {}, radius = 3.2, step = 0.12) {
  const p = { ...BASE, ...o };
  const polys = spikes(p).map((sp) => segsToPoints(spikeSegs(sp, p)));
  const inPoly = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  let cover = 0;
  let cells = 0;
  for (let x = -radius; x <= radius; x += step) {
    for (let y = -radius; y <= radius; y += step) {
      if (x * x + y * y > radius * radius) continue;
      cells++;
      for (const poly of polys) if (inPoly(poly, x, y)) cover++;
    }
  }
  return cells ? cover / cells : 0;
}

/* ── 变体 ───────────────────────────────────────────────── */

/**
 * 一个变体 = 一组侧边曲线参数。`offs` 的单位是「弦长的几分之几」，正 = 外鼓。
 * 单段时它就是 star-flat 的 pinch 换成有符号版。
 */
export const VARIANTS = [
  { id: 'v0', fam: '直', name: '直', edge: { knots: [], offs: [0] }, note: '现役：零弯' },

  { id: 'b1', fam: '凸', name: '凸 0.02', edge: { knots: [], offs: [0.02] } },
  { id: 'b2', fam: '凸', name: '凸 0.04', edge: { knots: [], offs: [0.04] } },
  { id: 'b3', fam: '凸', name: '凸 0.06', edge: { knots: [], offs: [0.06] } },
  { id: 'b4', fam: '凸', name: '凸 0.09', edge: { knots: [], offs: [0.09] } },
  { id: 'b5', fam: '凸', name: '凸 0.13', edge: { knots: [], offs: [0.13] } },

  { id: 'c1', fam: '凹', name: '凹 0.02', edge: { knots: [], offs: [-0.02] } },
  { id: 'c2', fam: '凹', name: '凹 0.04', edge: { knots: [], offs: [-0.04] } },
  { id: 'c3', fam: '凹', name: '凹 0.06', edge: { knots: [], offs: [-0.06] } },
  { id: 'c4', fam: '凹', name: '凹 0.09', edge: { knots: [], offs: [-0.09] } },
  { id: 'c5', fam: '凹', name: '凹 0.13', edge: { knots: [], offs: [-0.13] } },

  /* S：结点 0.62 处由凹转凸 —— 腰收在偏根那头，尖端附近拉开一点 */
  { id: 's1', fam: 'S', name: 'S 0.010', edge: { knots: [0.62], offs: [-0.02, 0.01] } },
  { id: 's2', fam: 'S', name: 'S 0.015', edge: { knots: [0.62], offs: [-0.03, 0.015] } },
  { id: 's3', fam: 'S', name: 'S 0.020', edge: { knots: [0.62], offs: [-0.04, 0.02] } },
  { id: 's4', fam: 'S', name: 'S 0.030', edge: { knots: [0.62], offs: [-0.05, 0.03] } },
  { id: 's5', fam: 'S 后段', name: 'S 0.70', edge: { knots: [0.86], offs: [-0.04, 0.02] }, note: '转点更靠尖端' },

  /* 尖端：腰部已收（凹 0.04），只在最后一段外鼓出一点「露珠」 */
  { id: 'd1', fam: '尖端', name: '露珠 0.02', edge: { knots: [0.9], offs: [-0.035, 0.02] } },
  { id: 'd2', fam: '尖端', name: '露珠 0.04', edge: { knots: [0.86], offs: [-0.045, 0.04] } },
  { id: 'd3', fam: '尖端', name: '露珠 0.06', edge: { knots: [0.86], offs: [-0.05, 0.06] } },
  { id: 'd4', fam: '尖端', name: '硬尖（对照）', edge: { knots: [0.86], offs: [-0.03, -0.01] }, note: '腰部收窄、尖端更锐' },
];

export const byId = (id) => VARIANTS.find((v) => v.id === id) || VARIANTS[0];

/* ── 挂到页面 ───────────────────────────────────────────── */

/** 往一个容器里放一颗 200px（或任意尺寸）的星 */
export function mountStar(el, o = {}, size = 200) {
  el.innerHTML = starMarkup(o);
  const svg = el.firstElementChild;
  if (svg) {
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
  }
  return svg;
}

/** 铺一张格子：cells = [{v: 变体, size}] */
export function mountGrid(el, items, size = 200) {
  el.innerHTML = '';
  for (const it of items) {
    const cell = document.createElement('figure');
    cell.className = 'cell';
    const box = document.createElement('div');
    box.className = 'cell-star';
    box.style.width = box.style.height = it.size || size + 'px';
    mountStar(box, it.v.edge ? { edge: it.v.edge } : it.o || {}, it.size || size);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<span class="cn">${it.label ?? it.v?.name ?? ''}</span>${
      it.sub ? `<span class="sub">${it.sub}</span>` : ''
    }`;
    cell.append(box, cap);
    el.append(cell);
  }
}

if (typeof window !== 'undefined') {
  window.StarArc = {
    BASE,
    spikes,
    chainEdge,
    spikeSegs,
    segsToD,
    buildStar,
    starMarkup,
    silhouetteProfile,
    notch,
    centreCrossings,
    centreLoad,
    pxPerUnit,
    VARIANTS,
    mountStar,
    mountGrid,
  };
}