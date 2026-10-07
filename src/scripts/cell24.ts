/* ─────────────────────────────────────────────────────────────
   24 胞体的三维切面（纯几何，无 DOM）
   关于页的晶体（nexus-slice.ts，着色）与线上那一列切片（about-slices.ts，线框）共用；
   构建时也在 about.astro 的 frontmatter 里跑，先画好醒面的那一列。
   ───────────────────────────────────────────────────────────── */

export type V3 = [number, number, number];
export type V4 = [number, number, number, number];

export interface Face {
  n: V3;
  d: number;
  pts: V3[];
  area: number;
}

/* ── 24 胞体：24 个半空间 a·x ≤ b ── */
const HALF: [V4, number][] = [];
for (let i = 0; i < 4; i++)
  for (const s of [1, -1]) {
    const a: V4 = [0, 0, 0, 0];
    a[i] = s;
    HALF.push([a, 1]);
  }
for (let m = 0; m < 16; m++) HALF.push([[m & 1 ? -1 : 1, m & 2 ? -1 : 1, m & 4 ? -1 : 1, m & 8 ? -1 : 1], 2]);

const dot4 = (a: V4, b: V4) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export function rot4(M: V4[], i: number, j: number, th: number) {
  const c = Math.cos(th),
    s = Math.sin(th);
  for (const col of M) {
    const xi = col[i],
      xj = col[j];
    col[i] = c * xi - s * xj;
    col[j] = s * xi + c * xj;
  }
}
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3) => mul(a, 1 / len(a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 截面 → 面列表：pts 是切面三维坐标里的凸多边形，n·x ≤ d 是它所在的半空间 */
export function section(n: V4, E: [V4, V4, V4], h: number): Face[] {
  const planes: { n: V3; d: number }[] = [];
  for (const [a, b] of HALF) {
    const p: V3 = [dot4(a, E[0]), dot4(a, E[1]), dot4(a, E[2])];
    const l = len(p);
    if (l < 1e-6) continue;
    planes.push({ n: mul(p, 1 / l), d: (b - h * dot4(a, n)) / l });
  }
  const faces: Face[] = [];
  for (let k = 0; k < planes.length; k++) {
    const P = planes[k];
    const helper: V3 = Math.abs(P.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(helper, P.n)),
      v = cross(P.n, u),
      o = mul(P.n, P.d),
      R = 8;
    let poly: V3[] = [
      add(o, add(mul(u, -R), mul(v, -R))),
      add(o, add(mul(u, R), mul(v, -R))),
      add(o, add(mul(u, R), mul(v, R))),
      add(o, add(mul(u, -R), mul(v, R))),
    ];
    for (let j = 0; j < planes.length && poly.length >= 3; j++) {
      if (j === k) continue;
      const Q = planes[j],
        out: V3[] = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i],
          B = poly[(i + 1) % poly.length];
        const da = dot(Q.n, A) - Q.d,
          db = dot(Q.n, B) - Q.d;
        if (da <= 1e-9) out.push(A);
        if (da <= 1e-9 !== db <= 1e-9) out.push(add(A, mul(sub(B, A), da / (da - db))));
      }
      poly = out;
    }
    if (poly.length < 3) continue;
    let area = 0;
    for (let i = 1; i + 1 < poly.length; i++) area += len(cross(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0])));
    if (area < 1e-7) continue; // 只丢真正退化的面：看得见时整片拿掉会闪
    faces.push({ n: P.n, d: P.d, pts: poly, area: area / 2 });
  }
  return faces;
}

/**
 * 某一刻的切面。e：长出来的进度（已缓动），1 ＝ 常态；tau：四维转动的内在时钟；d：梦度（已缓动）。
 * 常态：醒时切面贴近胞（八面体 + 极小截角），梦里在四维里转、往中心游移。
 * 长出来：法向先朝顶点 (1,1,0,0)/√2 偏 45°，偏移从「刚好擦到最远的顶点」推进到常态的偏移 ——
 * 截面从一个点出发，经一枚小立方体（24 胞体的顶点图形）连续长成常态的形状。
 */
export function sliceAt(e: number, tau: number, d: number): Face[] {
  const M: V4[] = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  if (e < 1) rot4(M, 0, 1, ((1 - e) * Math.PI) / 4);
  const a = d * e;
  rot4(M, 0, 1, a * (0.55 * Math.sin(tau * 0.21) + 0.25 * Math.sin(tau * 0.083 + 1.3)));
  rot4(M, 0, 2, a * (0.45 * Math.sin(tau * 0.157 + 2.1)));
  rot4(M, 0, 3, a * (0.35 * Math.sin(tau * 0.119 + 0.6)));
  rot4(M, 1, 2, a * tau * 0.05);
  let h = 0.9 - d * (0.38 + 0.3 * Math.sin(tau * 0.097 + 0.4));
  if (e < 1) {
    // 24 胞体的顶点是 (±1,±1,0,0) 的排列 ⇒ 支撑函数 ＝ 法向两个最大分量的绝对值之和
    const m = M[0].map(Math.abs).sort((x, y) => y - x);
    h = lerp(m[0] + m[1], h, Math.pow(e, 0.7));
  }
  return section(M[0], [M[1], M[2], M[3]], h);
}
