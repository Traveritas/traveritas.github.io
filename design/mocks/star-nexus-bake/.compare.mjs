/* 对照：把烘出来的星与 NEXUS 的参考图并排、同尺度，并量两件事
   ① 醒 / 梦两套的逐像素差（决定「烘两套」是否划算）
   ② 星 vs 参考：色域与明度分布（判「是不是同一材料」）
   node design/mocks/star-nexus-bake/.compare.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SHOTS = path.join(HERE, '.shots');
const sharp = (await import('sharp')).default;

const REF = path.join(ROOT, 'public/nexus-slice/wake.webp');

const raw = async (f) => (await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));

/** 只统计「晶体像素」：与底色差得够多的那些 */
function stats(buf, info, bg = [240, 243, 246]) {
  const { width: W, height: H, channels: C } = info;
  let n = 0, sum = [0, 0, 0], lum = [], sat = [];
  const hist = new Map();
  for (let p = 0; p < W * H; p++) {
    const a = C === 4 ? buf[p * 4 + 3] / 255 : 1;
    const r = buf[p * C], g = buf[p * C + 1], b = buf[p * C + 2];
    const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    if (a < 0.5 || d < 6) continue;
    n++;
    sum[0] += r; sum[1] += g; sum[2] += b;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum.push(L);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat.push(mx > 0 ? (mx - mn) / mx : 0);
    const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    hist.set(q, (hist.get(q) || 0) + 1);
  }
  lum.sort((x, y) => x - y);
  sat.sort((x, y) => x - y);
  const q = (p) => lum[Math.floor(p * (lum.length - 1))];
  let hueSpread = 0;
  for (const c of [0, 1, 2]) hueSpread += 0; // 占位
  return {
    px: n,
    rgb: sum.map((v) => +(v / Math.max(1, n)).toFixed(1)),
    lum: { p1: +q(0.01).toFixed(1), p10: +q(0.1).toFixed(1), med: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), p99: +q(0.99).toFixed(1) },
    satMed: +sat[Math.floor(0.5 * (sat.length - 1))].toFixed(4),
    colors: hist.size,
  };
}

const out = {};
const probeWake = path.join(SHOTS, 'probe-wake.png');
const probeDream = path.join(SHOTS, 'probe-dream.png');
for (const [k, f] of [['starWake', probeWake], ['starDream', probeDream], ['nexus', REF]]) {
  const { data, info } = await raw(f);
  out[k] = { file: path.relative(HERE, f), w: info.width, h: info.height, ...stats(data, info) };
}

/* ① 醒 / 梦逐像素差 */
{
  const a = await raw(probeWake);
  const b = await raw(probeDream);
  let mx = 0, sum = 0, n = 0;
  for (let p = 0; p < a.info.width * a.info.height; p++)
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[p * 4 + c] - b.data[p * 4 + c]);
      if (d > mx) mx = d;
      sum += d; n++;
    }
  out.wakeDreamDiff = { max: mx, mean: +(sum / n).toFixed(3) };
}

/* ② 并排一张：星裁到与参考相同的晶体外接框，各占 480 */
async function trimmed(f) {
  const img = sharp(f).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const bg = [240, 243, 246];
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const p = y * info.width + x;
      const a = data[p * 4 + 3];
      const d = Math.abs(data[p * 4] - bg[0]) + Math.abs(data[p * 4 + 1] - bg[1]) + Math.abs(data[p * 4 + 2] - bg[2]);
      if (a > 40 && d > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const bA = await trimmed(probeWake);
const bB = await trimmed(REF);
const S = 460;
const crop = async (f, b) =>
  sharp(f).extract({ left: b.x0, top: b.y0, width: b.w, height: b.h }).resize(S, S, { fit: 'contain', background: { r: 240, g: 243, b: 246, alpha: 1 } }).png().toBuffer();
const imgA = await crop(probeWake, bA);
const imgB = await crop(REF, bB);
await sharp({ create: { width: S * 2 + 24, height: S + 40, channels: 4, background: { r: 240, g: 243, b: 246, alpha: 1 } } })
  .composite([
    { input: imgA, left: 0, top: 40 },
    { input: imgB, left: S + 24, top: 40 },
  ])
  .png()
  .toFile(path.join(SHOTS, 'cmp-ref.png'));

out.bboxes = { star: bA, nexus: bB };
fs.writeFileSync(path.join(SHOTS, 'compare.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));