/* ─────────────────────────────────────────────────────────────
   Ave 的占位头像：从背景那层像素流光里取一小块（src/scripts/wander/light.js 的着色器，
   在这里用 canvas 2D 逐格重算——只有 10×10 格，不值得为它再开一个 WebGL 上下文）。
   · 同一套域扭曲 fbm、同一套调色板（按本页的夜色取区，醒 / 梦按醒度混合）、
     同一个 5px 像素格与 Bayer 抖动量化。
   · 只在 Ave 露面时动（约 15 帧/秒）；收起就停。减少动效时只画一帧。
   ───────────────────────────────────────────────────────────── */

import { DREAM, GRAIN, WAKE } from './wander/light.js';
import { wakeMix } from './reality';
import { reducedMotion } from './lib';

type Rgb = [number, number, number];
type Region = 'essay' | 'moment' | 'project' | 'home';

/** 像素格（与背景一致） */
const CELL = 5;
/** 头像这一块对应背景里多大一片光（uv 跨度）：太小只见一团单色，太大就碎 */
const SPAN = 0.62;
const FPS = 15;

/* 本页的夜色 → 背景的哪一区（见 BaseLayout 的 HOURS 与 hours.css） */
const HOUR_REGION: Record<string, Region> = { shallow: 'essay', rem: 'moment', deep: 'project' };

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
  const region: Region = HOUR_REGION[document.documentElement.dataset.hour ?? ''] ?? 'home';
  const [gx, gy, Lq] = GRAIN[region] as [number, number, number];
  const pal: Rgb[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const seed = Math.random() * 40; // 每次来访取光的位置不同
  let t = Math.random() * 60;
  let raf = 0;
  let last = 0;
  let img: ImageData | null = null;
  const rgb = [0, 0, 0];

  function size() {
    const n = Math.max(4, Math.round(canvas.getBoundingClientRect().width / CELL)) || 10;
    if (canvas.width !== n) {
      canvas.width = canvas.height = n;
      img = null;
    }
    return n;
  }

  function draw() {
    const n = size();
    img ??= ctx!.createImageData(n, n);
    const f = wakeMix();
    for (let k = 0; k < 4; k++)
      for (let i = 0; i < 3; i++) pal[k][i] = DREAM[region][k][i] + (WAKE[region][k][i] - DREAM[region][k][i]) * f;
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = ((x + 0.5) / n - 0.5) * SPAN;
        const w = (0.5 - (y + 0.5) / n) * SPAN;
        const v = Math.min(1, Math.max(0, (field(u * 0.72 + seed, w * 0.72 + seed * 0.37, t) - 0.3) / 0.42));
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
