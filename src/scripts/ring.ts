/* ─────────────────────────────────────────────────────────────
   塌缩圈 · 默认画面（普通页面：正文页、标签页、入口页……）
   自己有画面的页（漫游 / 检索那片空间）不用这一张：它们在 reality.ts 里 setRingRenderer 接过去，
   在自己的着色器与窗里画同一个级别函数。

   一张盖住视口的画布，一格 = 基础格 B（2 CSS px），最近邻放大。
   每 8×8 基础格是一块（16px），每块一个级别 L = clamp(floor(min((r − d)/step, 4) + bayer − shift), 0, 4)：
     L 0 什么也不画；L 1–4 的格是 2 / 4 / 8 / 16px，块里装的总是整格。
   取色：页面底色（body 的计算背景）往暗处挪 L 档、往要去的那一面的强调色偏一点，每格再按自己的
   位置抖一点明度（色阶抖动——不抖的话粗格和细格是同一块平色，看不出「粗」）；
   不透明度随级别涨：前沿一带是半透明的细格（字还透得出来），圈心近乎实心。
   只在圈开着时画；每帧整张写一次 putImageData（1440×900 时 720×450，约 2–4ms）。
   ───────────────────────────────────────────────────────────── */

import type { Ring } from './reality';

const B = 2; // 基础格（CSS px）
const BLOCK = 8; // 一块的基础格数
const ALPHA = [0, 0.34, 0.58, 0.8, 0.93];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/* 要去的那一面的偏色（梦暖琥珀 / 醒冷灰） */
const TINT = { dream: [217, 160, 91], wake: [150, 162, 176] } as const;

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function parseColor(s: string): [number, number, number] | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (v.length > 3 && v[3] === 0) return null;
  return [v[0], v[1], v[2]];
}

export function createDomRing() {
  let cv: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let img: ImageData | null = null;
  let px: Uint32Array | null = null;
  let W = 0;
  let H = 0;
  let shown = false;
  let base: [number, number, number] = [200, 200, 205];

  function ensure() {
    const w = Math.ceil(innerWidth / B);
    const h = Math.ceil(innerHeight / B);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'fx-ring';
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText =
        'position:fixed;inset:0;width:100vw;height:100vh;z-index:205;pointer-events:none;image-rendering:pixelated;display:none';
      document.body.appendChild(cv);
      ctx = cv.getContext('2d');
    }
    if (w !== W || h !== H) {
      W = cv.width = w;
      H = cv.height = h;
      img = ctx!.createImageData(W, H);
      px = new Uint32Array(img.data.buffer);
    }
  }
  /* 底色：body 的计算背景；透明就往上找 html，再不行用夜色令牌 --bg */
  function readBase() {
    const cs = getComputedStyle(document.body);
    base =
      parseColor(cs.backgroundColor) ??
      parseColor(getComputedStyle(document.documentElement).backgroundColor) ??
      parseColor(`rgb(${cs.getPropertyValue('--bg')})`) ??
      base;
  }

  return function draw(ring: Ring) {
    if (!ring.on) {
      if (shown && cv) cv.style.display = 'none';
      shown = false;
      return;
    }
    ensure();
    if (!shown) {
      readBase();
      cv!.style.display = 'block';
      shown = true;
    }
    const data = px!;
    data.fill(0);
    const cx = ring.x / B;
    const cy = ring.y / B;
    const step = ring.step / B;
    const r = ring.r / B;
    const tint = TINT[ring.to];
    const bx1 = Math.ceil(W / BLOCK);
    const by1 = Math.ceil(H / BLOCK);
    for (let by = 0; by < by1; by++) {
      for (let bx = 0; bx < bx1; bx++) {
        const mx = bx * BLOCK + BLOCK / 2;
        const my = by * BLOCK + BLOCK / 2;
        const d = Math.hypot(mx - cx, my - cy);
        if (d > r) continue;
        const L = Math.max(0, Math.min(ring.levels, Math.floor(Math.min((r - d) / step, ring.levels) + BAYER[(by & 3) * 4 + (bx & 3)] - ring.shift)));
        if (L <= 0) continue;
        const cs = 1 << (L - 1); // 格边长（基础格）
        const a = ALPHA[L];
        const dark = 1 - 0.035 * L;
        const tk = 0.05 * L;
        for (let gy = 0; gy < BLOCK; gy += cs) {
          for (let gx = 0; gx < BLOCK; gx += cs) {
            const X = bx * BLOCK + gx;
            const Y = by * BLOCK + gy;
            const j = (hash(X >> (L - 1), Y >> (L - 1)) - 0.5) * 0.05 * L;
            const k = dark + j;
            const R = Math.max(0, Math.min(255, (base[0] + (tint[0] - base[0]) * tk) * k));
            const G = Math.max(0, Math.min(255, (base[1] + (tint[1] - base[1]) * tk) * k));
            const Bc = Math.max(0, Math.min(255, (base[2] + (tint[2] - base[2]) * tk) * k));
            const A = Math.round(a * 255);
            // ImageData 是小端 RGBA → Uint32 = A<<24 | B<<16 | G<<8 | R（预乘不需要：putImageData 收的是直通 alpha）
            const v = ((A << 24) | (Math.round(Bc) << 16) | (Math.round(G) << 8) | Math.round(R)) >>> 0;
            const ye = Math.min(H, Y + cs);
            const xe = Math.min(W, X + cs);
            for (let y = Y; y < ye; y++) {
              const row = y * W;
              for (let x = X; x < xe; x++) data[row + x] = v;
            }
          }
        }
      }
    }
    ctx!.putImageData(img!, 0, 0);
  };
}
