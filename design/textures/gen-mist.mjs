/* 首屏梦面雾纹（public/textures/mist.webp）的生成脚本：node design/textures/gen-mist.mjs
   · 周期值噪声的 fBm（各倍频的格数都是整数 ⇒ 四边无缝，可横纵平铺）；
   · 只有大尺度的几层（雾是糊的，细节交给放大时的插值）；
   · 白色 + alpha ＝ 雾的浓度，经一道 smoothstep 拉开：大片空着、成团处才浓。
   页面上按 CSS 放大铺开、极慢平移（见 src/pages/index.astro 的 .ls-mist）。 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'node_modules/astro/package.json'));
const sharp = require('sharp');

const W = 512;
const H = 256; // 横向拉长的雾带：纹理本身就宽于高
const SEED = 7;
const OCT = [
  [3, 0.55],
  [6, 0.27],
  [12, 0.13],
  [24, 0.05],
]; // [格数, 权重]：横纵同格数、纹理宽 2 倍于高 ⇒ 每格横向拉长 2 倍，雾成带

let s = SEED;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function layer(gx, gy) {
  const g = Array.from({ length: gy }, () => Array.from({ length: gx }, rnd));
  return (x, y) => {
    const fx = (x / W) * gx;
    const fy = (y / H) * gy;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const a = g[y0 % gy][x0 % gx];
    const b = g[y0 % gy][(x0 + 1) % gx];
    const c = g[(y0 + 1) % gy][x0 % gx];
    const d = g[(y0 + 1) % gy][(x0 + 1) % gx];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
}

const layers = OCT.map(([n, w]) => [layer(n, n), w]);
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const buf = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    let v = 0;
    for (const [f, w] of layers) v += f(x, y) * w;
    const a = ss(0.36, 0.78, v);
    const i = (y * W + x) * 4;
    buf[i] = buf[i + 1] = buf[i + 2] = 255;
    buf[i + 3] = Math.round(a * 255);
  }

const out = path.join(root, 'public/textures/mist.webp');
await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 82, alphaQuality: 80 }).toFile(out);
console.log('→', path.relative(root, out));
