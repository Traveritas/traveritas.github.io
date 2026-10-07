/* ─────────────────────────────────────────────────────────────
   关于页 · 线上的切片列（纯几何，无 DOM；原型：design/mocks/nexus-stage/）
   同一枚 24 胞体在别处的切面，线框，沿切面线左右各排五枚，往外渐小渐淡：
     左边是它「长出来」之前（点 → 小立方 → 八面体），右边是它梦里会换成的形。
   中间那枚晶体只是这一串里「此刻」的一枚。
   about.astro 的 frontmatter 在构建时按醒面画好（无脚本也在）；梦里由 about-decor.ts 每帧重画。
   尺寸都以晶体边长（--size）为单位，CSS 里乘回去。
   ───────────────────────────────────────────────────────────── */

import { sliceAt, add, mul, sub, type Face } from './cell24';

export interface SliceSpec {
  side: -1 | 1;
  /** 从内往外第几枚（0 贴着晶体） */
  i: number;
  /** 中心离晶体中心的距离 / 盒子边长，单位都是 --size */
  o: number;
  w: number;
  /** 长出度、四维时刻、梦度（常态参数；梦里在此基础上走） */
  e: number;
  tau: number;
  d: number;
  /** 线条不透明度 */
  a: number;
}

/** 一枚切片的盒子边长 ＝ 投影比例 × VIEW（viewBox 宽） */
export const VIEW = 2.6;
const LEFT_E = [0.9, 0.72, 0.5, 0.3, 0.12]; // 由内往外：越来越接近「一个点」
const RIGHT_TAU = [3, 9, 15, 22, 30];

export const SLICES: SliceSpec[] = (() => {
  const out: SliceSpec[] = [];
  for (const side of [-1, 1] as const) {
    let c = 0.72; // 第一枚的内缘：晶体半宽 + 一点空
    for (let i = 0; i < 5; i++) {
      const k = Math.pow(0.84, i),
        sc = 0.22 * k;
      c += sc * 0.9;
      out.push({
        side,
        i,
        o: c,
        w: sc * 0.48 * VIEW,
        e: side < 0 ? LEFT_E[i] : 1,
        tau: side < 0 ? 0 : RIGHT_TAU[i],
        d: side < 0 ? 0 : 0.55 + 0.1 * i,
        a: 0.62 * Math.pow(0.72, i),
      });
      c += sc * 0.9 + 0.05 * k;
    }
  }
  return out;
})();

/** 线框：朝前的面与朝后的面分两条 path（后面的更淡）。坐标在 viewBox [-VIEW/2, VIEW/2]² 里 */
export function wire(faces: Face[], yaw: number) {
  let c = [0, 0, 0] as Face['n'],
    n = 0;
  for (const f of faces)
    for (const p of f.pts) {
      c = add(c, p);
      n++;
    }
  c = mul(c, 1 / Math.max(1, n));
  // 与晶体同一套姿态：竖向拉高 1.28、偏航 yaw、略俯视
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(0.09),
    sp = Math.sin(0.09);
  const P = (p: Face['n']) => {
    const [x, y0, z] = sub(p, c);
    const y = y0 * 1.28;
    const X = cy * x - sy * z,
      Z = sy * x + cy * z;
    return `${X.toFixed(3)} ${(-(cp * y - sp * Z)).toFixed(3)}`;
  };
  let front = '',
    back = '';
  for (const f of faces) {
    const nZ = sp * f.n[1] + cp * (sy * f.n[0] + cy * f.n[2]);
    const d = 'M' + f.pts.map(P).join('L') + 'Z';
    if (nZ > 0) front += d;
    else back += d;
  }
  return { front, back };
}

/** 某枚切片在时刻 t、梦度 d（0..1，已缓动）下的线框；醒面 t = d = 0 */
export function slicePaths(s: SliceSpec, t = 0, d = 0) {
  const faces = sliceAt(s.e, s.tau + d * t * 0.6, Math.min(1, s.d + d * 0.3));
  if (faces.length < 4) return { front: '', back: '' };
  return wire(faces, 0.4 + s.i * 0.5 * s.side + d * t * 0.08);
}
