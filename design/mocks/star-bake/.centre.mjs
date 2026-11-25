/* 中心与接缝的量化读数（离线，不开浏览器）
   node design/mocks/star-bake/.centre.mjs
   · 把烘出来的 400px 掩码按「离四档有多远」分类：落在四档上的像素、边缘抗锯齿像素、
     以及**两者都不是**的像素 —— 后者就是「三角形之间的抗锯齿细缝」，是上一轮 SVG 路线的病。
   · 再与 star-final 的 outlinePoly 剪影做 IoU（1px 差异应当只来自取景框 2.5r vs 2.3r）。
*/
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SF = await import(pathToFileURL(path.join(ROOT, 'design/mocks/star-final/src.js')).href);

const LEVELS = [0.1, 0.3733, 0.6467, 0.92].map((v) => Math.round(v * 255));
const TOL = 2;

function classify(alpha, W, H) {
  const N = W * H;
  /* 先找剪影边界（与透明相邻的像素），边界像素的抗锯齿是合法的 */
  const edge = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!alpha[i]) continue;
      let isEdge = false;
      for (let dy = -1; dy <= 1 && !isEdge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!alpha[ny * W + nx]) { isEdge = true; break; }
        }
      }
      edge[i] = isEdge ? 1 : 0;
    }
  }
  let covered = 0, onLevel = 0, offLevelInterior = 0, offLevelEdge = 0;
  let between = 0, outside = 0;
  const offHist = new Map();
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    if (!a) continue;
    covered++;
    const near = LEVELS.some((L) => Math.abs(a - L) <= TOL);
    if (near) { onLevel++; continue; }
    if (edge[i]) { offLevelEdge++; continue; }
    offLevelInterior++;
    offHist.set(a, (offHist.get(a) || 0) + 1);
    /* 这个「不在档上」的内点，是不是落在它四邻的**两档之间**（= 正常的两级过渡抗锯齿），
       还是**跑到两档之外**（= 假的深色/浅色细线，也就是上一轮 SVG 逐三角排序时的病）。
       这两件事观感完全不同，必须分开数。 */
    let lo = 255, hi = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x0(i, W) + dx, ny = y0f(i, W) + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const b = alpha[ny * W + nx];
        if (!b) continue;
        if (LEVELS.some((L) => Math.abs(b - L) <= TOL)) { if (b < lo) lo = b; if (b > hi) hi = b; }
      }
    }
    if (lo <= hi && a >= lo - TOL && a <= hi + TOL) between++;
    else outside++;
  }
  return {
    covered, onLevel,
    onLevelShare: +(onLevel / covered).toFixed(4),
    offLevelEdge, offLevelInterior,
    interiorSeamShare: +(offLevelInterior / Math.max(1, covered - offLevelEdge)).toFixed(5),
    /* 内点里「跑到两档之外」的数量 —— 这个数应当接近 0，若不是，就是假细线 */
    hairline: outside,
    hairlineShare: +(outside / Math.max(1, covered - offLevelEdge)).toFixed(5),
    between,
    offTop: [...offHist.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6),
  };
}
const x0 = (i, W) => i % W;
const y0f = (i, W) => (i / W) | 0;

const out = { levels: LEVELS, frames: [] };
for (const set of ['even16']) {
  for (const size of [400, 240]) {
    const dir = path.join(HERE, 'frames', set, String(size));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    for (const f of files.slice(0, 3)) {
      const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      const alpha = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) alpha[i] = data[i * 4 + 3];
      out.frames.push({ set, size, file: f, ...classify(alpha, W, H) });
    }
  }
}

/* 剪影 IoU vs star-final 的轮廓（同一姿态）。
   两件事必须对齐，否则这个数没有意义：
     · 覆盖率判据是 alpha > 0（不是 >127 —— 四档里有两档低于 127，
       用 >127 会把暗的两档当成「没盖住」，IoU 直接掉到 0.38。这是我第一版犯的错）；
     · 取景框：烘焙是 40 单位画框（半视高 20 = 1.25r），star-final 的 rasterizePolys
       默认半视高 1.15r。不把两者拉齐，差的就只是一个 8.7% 的缩放。 */
const silhouette = {};
for (const size of [400, 240]) {
  const polys = SF.outlinePoly(SF.SYNC, SF.M_REST, 24);
  const ref = SF.rasterizePolys(polys, size, 1.25);
  const { data, info } = await sharp(path.join(HERE, `frames/even16/${size}/even16-${size}-00.png`))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let inter = 0, uni = 0, onlyMine = 0, onlyRef = 0, cov = 0;
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3] > 0 ? 1 : 0;
    const r = ref[i] ? 1 : 0;
    if (a) cov++;
    if (a && r) inter++;
    if (a || r) uni++;
    if (a && !r) onlyMine++;
    if (!a && r) onlyRef++;
  }
  silhouette[size] = { iou: +(inter / uni).toFixed(4), covered: cov, onlyMine, onlyRef, refCovered: inter + onlyRef };
}
out.silhouette = silhouette;

/* 四档在三个底色上还能分出几档 */
const grounds = {
  light: { bg: [0xf0, 0xf3, 0xf6], ink: [0x23, 0x28, 0x30] },
  deep: { bg: [0x2a, 0x2b, 0x38], ink: [0xcf, 0xd2, 0xe2] },
  umber: { bg: [0x4f, 0x4a, 0x66], ink: [0x23, 0x28, 0x30] },
  'umber-pale': { bg: [0x4f, 0x4a, 0x66], ink: [0xee, 0xea, 0xf4] },
};
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const steps = {};
for (const [k, g] of Object.entries(grounds)) {
  const L = [0.1, 0.3733, 0.6467, 0.92].map((a) =>
    lum([0, 1, 2].map((ch) => g.bg[ch] + (g.ink[ch] - g.bg[ch]) * a)),
  );
  const gaps = L.slice(1).map((v, i) => +(v - L[i]).toFixed(2));
  steps[k] = { lums: L.map((v) => +v.toFixed(1)), gaps, minGap: +Math.min(...gaps.map(Math.abs)).toFixed(2) };
}
out.steps = steps;

fs.writeFileSync(path.join(HERE, '.shots/centre.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));