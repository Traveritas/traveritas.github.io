/* ─────────────────────────────────────────────────────────────
   几何与读数：三轴六芒星的厚度扫描
   ─────────────────────────────────────────────────────────────
   这一份只放「数学 + SVG」：姿势、风筝、深度透明度、凹口半径。
   页面（index.html 里的内联模块）拿它铺图，Node 侧的 probe-notch.mjs 拿它做读数。

   与 src/scripts/toolstar.ts 的 drawStar() 同源：同样的 yaw/pitch 旋转，同样的
   四角风筝（两侧各 halfWidth、端点、越原点 notch 的支尾），同样的
   fill-opacity = opacityFar + (opacityNear − opacityFar)·(z+1)/2。
   唯一被这条轴改动的是 halfWidth。
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;

/** 支长（用户单位）。工具条的 viewBox 是 −20..20，即 40 单位 */
export const R0 = 16;
export const VIEWBOX = 40;

/** 正等轴视角 = asin(1/√3)。工具条里写死的字面量是 35.264 */
export const ISO = { yaw: 45, pitch: 35.264 };

/** 现役那一组（drawStar() 的默认值） */
export const PROD = { halfWidth: 1.9, notch: 1.4, opacityFar: 0.38, opacityNear: 0.88 };

/** 要扫的粗细：halfWidth / r */
export const RATIOS = [0.08, 0.12, 0.16, 0.2, 0.26, 0.32, 0.4, 0.5, 0.62];

/** 简报点名的三个「最好」 —— 页面第二段用（先按读数定，见 notes.md） */
export const BEST = [0.2, 0.26, 0.32];

/* ── 姿势 ─────────────────────────────────────────────────── */
/** 六个轴端点 ±x ±y ±z 投影到屏幕。z = +1 最近 */
export function tips({ yaw = ISO.yaw, pitch = ISO.pitch, r = R0 } = {}) {
  const y = yaw * DEG;
  const p = pitch * DEG;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  const out = [];
  for (const [ax, ay, az] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) {
    for (const s of [1, -1]) {
      const x0 = ax * s;
      const y0 = ay * s;
      const z0 = az * s;
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp;
      const z2 = y0 * sp + z1 * cp;
      out.push({ x: x1 * r, y: -y2 * r, z: z2 });
    }
  }
  return out;
}

/* ── 一支风筝 ─────────────────────────────────────────────── */
/**
 * 四个角（屏幕坐标，与 drawStar() 的 M L L L Z 一一对应）：
 *   A = −n·w      （原点左侧，n 是支的法向）
 *   B = 端点
 *   C = +n·w      （原点右侧）
 *   D = −u·notch  （支尾，越过原点往回伸）
 */
export function kite(tip, halfWidth, notch = PROD.notch) {
  const L = Math.hypot(tip.x, tip.y);
  const ux = tip.x / L;
  const uy = tip.y / L;
  return {
    u: [ux, uy],
    len: L,
    z: tip.z,
    A: [-uy * halfWidth, ux * halfWidth],
    B: [tip.x, tip.y],
    C: [uy * halfWidth, -ux * halfWidth],
    D: [-ux * notch, -uy * notch],
  };
}

/** 六支，按 z 从远到近排（和 drawStar() 的 sort 一样，近的压在上面） */
export function kites({ halfWidth = PROD.halfWidth, notch = PROD.notch, yaw, pitch, r = R0 } = {}) {
  return tips({ yaw, pitch, r })
    .map((t) => kite(t, halfWidth, notch))
    .filter((k) => k.len >= 0.6)
    .sort((a, b) => a.z - b.z);
}

/** 风筝四点 → path d（两位数，与 drawStar() 同精度） */
export function kiteD(k) {
  const f = (n) => n.toFixed(2);
  return `M${f(k.A[0])} ${f(k.A[1])}L${f(k.B[0])} ${f(k.B[1])}L${f(k.C[0])} ${f(k.C[1])}L${f(k.D[0])} ${f(k.D[1])}Z`;
}

/** 现役的深度透明度：两块透明，不是渐变（见 star-solid/notes.md） */
export function opacityOf(z, { opacityFar = PROD.opacityFar, opacityNear = PROD.opacityNear } = {}) {
  return opacityFar + ((opacityNear - opacityFar) * (z + 1)) / 2;
}

/* ── 并集：星形域 ─────────────────────────────────────────── */
/* 每张风筝都严格包含原点（原点落在 A–C 这条对角线上），六张的并集因此是
   关于原点的星形域 —— 一条从原点出发的射线只出射一次，R(θ) 良定义。 */
function inQuad(q, px, py) {
  let hit = false;
  const pts = [q.A, q.B, q.C, q.D];
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 并集在方向 th（弧度）上的出射距离 R(θ) —— 从小往外找括区间，再二分 */
export function radialAt(ks, th, { hiMax = 40 } = {}) {
  const cx = Math.cos(th);
  const cy = Math.sin(th);
  const covered = (t) => ks.some((q) => inQuad(q, t * cx, t * cy));
  // 括区间：先找一个「还没覆盖」的 hi（并集是星形域，覆盖沿射线单调）
  let hi = 1;
  while (covered(hi)) {
    hi *= 2;
    if (hi > hiMax) return 0;
  }
  let lo = 0;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (covered(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 凹口半径：剪影上相邻两支之间那个内角，离星心多远。
 * 六重对称 ⇒ 只需扫 [0°, 60°]，取 R(θ) 的最小值（= 内角所在的那条半径）。
 */
export function notchRadius(opts = {}, { step = 0.05 } = {}) {
  const ks = kites(opts);
  let min = Infinity;
  let atDeg = 0;
  let max = 0;
  for (let deg = 0; deg <= 60 + 1e-9; deg += step) {
    const v = radialAt(ks, deg * DEG);
    if (v < min) {
      min = v;
      atDeg = deg;
    }
    if (v > max) max = v;
  }
  return { notch: min, atDeg, tip: max };
}

/** 用户单位 → 某个画布尺寸下的像素（viewBox 40 单位铺满画布） */
export const px = (units, size) => (units * size) / VIEWBOX;

/**
 * 六重谐波幅度 a6 / 平均半径 —— 剪影有多「六芒」。
 * 与 star-v-motion 的 a6 同义（那里用极径剖面的六重谐波），这里归一化到 0..1：
 * 0 是正圆，越接近 1 越像六支尖角。
 */
export function sixFold(opts = {}, { n = 720 } = {}) {
  const ks = kites(opts);
  let sum = 0;
  const rs = [];
  for (let i = 0; i < n; i++) {
    const v = radialAt(ks, (i / n) * Math.PI * 2);
    rs.push(v);
    sum += v;
  }
  const mean = sum / n;
  if (mean <= 0) return 0;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    re += rs[i] * Math.cos(6 * th);
    im += rs[i] * Math.sin(6 * th);
  }
  return (2 * Math.hypot(re, im)) / n / mean;
}

/** 剪影面积占「半径 13.064 的正圆」的比例 —— 说明「胖」到什么程度 */
export function fillRatio(opts = {}) {
  const ks = kites(opts);
  const N = 240;
  const ext = 20;
  let hit = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = -ext + (2 * ext * (i + 0.5)) / N;
      const y = -ext + (2 * ext * (j + 0.5)) / N;
      if (ks.some((q) => inQuad(q, x, y))) hit++;
    }
  }
  const area = hit * ((2 * ext) / N) ** 2;
  const tipR = Math.max(...ks.map((k) => k.len));
  return area / (Math.PI * tipR * tipR);
}

/* ── SVG ──────────────────────────────────────────────────── */
/**
 * 一颗星摊平成 SVG 片段。
 * center: true 时附上那枚中心圆（工具条里的 .ts-hub，1.7 单位、--amber）。
 */
export function starMarkup(opts = {}, { center = true, hubR = 1.7 } = {}) {
  const ks = kites(opts);
  const parts = ks.map(
    (k) => `<path d="${kiteD(k)}" fill="currentColor" fill-opacity="${opacityOf(k.z, opts).toFixed(3)}"/>`,
  );
  if (center && hubR > 0) {
    // 两段半圆弧：比 <circle> 少一个闭合节点，仍是正圆
    const f = (n) => n.toFixed(2);
    parts.push(
      `<path d="M${f(-hubR)} 0A${f(hubR)} ${f(hubR)} 0 1 0 ${f(hubR)} 0A${f(hubR)} ${f(hubR)} 0 1 0 ${f(-hubR)} 0Z" fill="var(--amber)" fill-opacity="1"/>`,
    );
  }
  return parts.join('');
}

/** 一棵 <svg>：40 单位 viewBox，size 是 CSS 像素 */
export function starSvg(size, opts = {}, { center = true, hubR = 1.7, cls = '' } = {}) {
  return `<svg class="star ${cls}" width="${size}" height="${size}" viewBox="-20 -20 40 40" aria-hidden="true">${starMarkup(opts, { center, hubR })}</svg>`;
}