/* ─────────────────────────────────────────────────────────────
   Ave 的占位头像：一小块像素流光（世界还没定稿时的那一面）。
   · 光影的算法与背景那层流光同源（src/scripts/wander/light.js 的域扭曲 fbm、
     同一个 5px 像素格与 Bayer 抖动量化），但调色板是她自己的：
     黑白灰打底、不要黑，紫与蓝只做薄薄一层色偏——醒面偏雾蓝，梦面偏薄暮紫。
     不按本页夜色取区：她不是背景的一小块，是背景前的一小块别的。
   · 只在 Ave 露面时动（约 15 帧/秒）；收起就停。减少动效时只画一帧。
   ───────────────────────────────────────────────────────────── */

import { wakeMix } from './reality';
import { reducedMotion } from './lib';

type Rgb = [number, number, number];

/** 像素格（与背景一致） */
const CELL = 5;
/** 头像这一块对应流光里多大一片：太小只见一团单色，太大就碎 */
const SPAN = 0.62;
const FPS = 15;

/* 她自己的四档：暗面 · 灰面 · 微光 · 亮芯。没有黑色——整块落在中浅灰到白之间，
   紫与蓝只做很薄的色偏：梦面偏薄暮紫，醒面偏雾蓝。 */
const WAKE: Rgb[] = [
  [0.46, 0.53, 0.6], // 暗面：中浅灰（蓝偏）
  [0.63, 0.72, 0.81], // 灰面
  [0.79, 0.9, 0.98], // 微光：雾蓝
  [0.92, 0.95, 1.0], // 亮芯：近白
];
const DREAM: Rgb[] = [
  [0.46, 0.44, 0.56], // 暗面：中浅灰（紫偏）
  [0.64, 0.6, 0.78], // 灰面
  [0.83, 0.79, 0.95], // 微光：薄暮紫
  [0.93, 0.91, 0.99], // 亮芯：近白
];

/* 抖动强度 · 亮芯强度 · 量化阶数（这一块小、浅色少，阶数取密一点，免得颗粒成块） */
const GRAIN: [number, number, number] = [0.7, 0.55, 32];

/* ── 与 light.js 着色器逐行对应 ── */
const fract = (x: number) => x - Math.floor(x);
function h21(x: number, y: number) {
  x = fract(x * 123.34);
  y = fract(y * 456.21);
  const d = x * (x + 45.32) + y * (y + 45.32);
  x += d;
  y += d;
  return fract(x * y);
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = h21(ix, iy);
  const b = h21(ix + 1, iy);
  const c = h21(ix, iy + 1);
  const d = h21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a + (d - c - b + a) * ux) * uy;
}
function fbm(x: number, y: number) {
  let a = 0.5;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x, y);
    // mat2(0.8, -0.6, 0.6, 0.8) * p（GLSL 列主序）
    const nx = 0.8 * x + 0.6 * y;
    const ny = -0.6 * x + 0.8 * y;
    x = nx * 2.03 + 11.7;
    y = ny * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}
function field(x: number, y: number, t: number) {
  const qx = fbm(x, y + t * 0.05);
  const qy = fbm(x + 5.2 - t * 0.04, y + 1.3 - t * 0.04);
  const rx = fbm(x + 2 * qx + 1.7 + t * 0.03, y + 2 * qy + 9.2 + t * 0.03);
  const ry = fbm(x + 2 * qx + 8.3 - t * 0.025, y + 2 * qy + 2.8 - t * 0.025);
  return fbm(x + 1.9 * rx, y + 1.9 * ry);
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function colorize(P: Rgb[], gy: number, v: number, out: number[]) {
  const [c0, c1, c2, c3] = P;
  const k1 = smooth(0.08, 0.5, v);
  const k2 = smooth(0.5, 0.86, v);
  const band = smooth(0.6, 0.74, v) * (1 - smooth(0.78, 0.94, v)) * 0.58 * gy;
  const k3 = smooth(0.84, 1, v) * gy;
  for (let i = 0; i < 3; i++) {
    let c = c0[i] + (c1[i] - c0[i]) * k1;
    c += (c2[i] - c) * k2;
    c += c3[i] * band;
    c += (c3[i] - c) * k3;
    out[i] = c;
  }
}

export function createAveFlow(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const [gx, gy, Lq] = GRAIN;
  const pal: Rgb[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const seed = Math.random() * 40; // 每次来访光落的位置不同
  let t = Math.random() * 60;
  let raf = 0;
  let last = 0;
  let img: ImageData | null = null;
  let raw: Float32Array | null = null;
  const rgb = [0, 0, 0];
  /* 自适应曝光：逐帧把这十格见方里的明暗推到调色板的两端再跟上去。
     不加这一下，光挪开的那几秒整块就退成一片暗，看不出是她的颜色 */
  let lo = 0.12;
  let hi = 0.7;

  function size() {
    const n = Math.max(4, Math.round(canvas.getBoundingClientRect().width / CELL)) || 10;
    if (canvas.width !== n) {
      canvas.width = canvas.height = n;
      img = null;
      raw = new Float32Array(n * n);
    }
    return n;
  }

  function draw() {
    const n = size();
    img ??= ctx!.createImageData(n, n);
    raw ??= new Float32Array(n * n);
    const f = wakeMix();
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 3; i++) pal[k][i] = DREAM[k][i] + (WAKE[k][i] - DREAM[k][i]) * f;

    // 一遍：取场值。主光的旁边再叠一层更细的场：光铺得平的那几秒里，
    // 整块也不会糊成一片同色（只给一点起伏，不抢主光）
    let mn = 1;
    let mx = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = ((x + 0.5) / n - 0.5) * SPAN;
        const w = (0.5 - (y + 0.5) / n) * SPAN;
        const main = Math.min(1, Math.max(0, (field(u * 0.72 + seed, w * 0.72 + seed * 0.37, t) - 0.3) / 0.42));
        // 细的一层绕着中值起伏，只加纹理、不抬高整块的平均亮度
        const fine = field(u * 2.1 + seed * 0.6 + 31, w * 2.1 + seed * 0.2 + 17, t * 1.6) - 0.47;
        const v = Math.min(1, Math.max(0, main + fine * 0.55));
        raw[y * n + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    // 定标的上下沿慢一步跟着走（免得帧与帧之间跳），并给一个最小跨度：
    // 整块本来都平的时候，不至于把一点噪声放大成满屏斑
    const K = 0.12;
    lo += (mn - lo) * K;
    hi += (mx - hi) * K;
    const span = Math.max(0.18, hi - lo);

    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // 定标之后再轻轻一压：平的块里也有明有暗，不至于糊成一片同色
        const v = smooth(0.1, 0.92, Math.min(1, Math.max(0, (raw[y * n + x] - lo) / span)));
        colorize(pal, gy, v, rgb);
        const o = (y * n + x) * 4;
        const b = (bayer(x, y) - 0.5) * gx;
        for (let i = 0; i < 3; i++) d[o + i] = (Math.floor(rgb[i] * Lq + 0.5 + b) / Lq) * 255;
        d[o + 3] = 255;
      }
    }
    ctx!.putImageData(img, 0, 0);
  }

  function frame(ts: number) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 1000 / FPS) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts;
    t += dt * (1 - 0.45 * wakeMix()); // 醒时慢一些（同背景）
    draw();
  }

  return {
    start() {
      if (raf) return;
      if (reducedMotion()) return draw();
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
