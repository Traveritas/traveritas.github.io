/* 成品对照图：星（400 静帧）与 NEXUS 参考同尺度并排。
   node design/mocks/star-nexus-bake/.sidebyside.mjs → .shots/side-by-side.png */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sharp = (await import('sharp')).default;
const SHOTS = path.join(HERE, '.shots');
const A = path.join(HERE, 'frames/rest-400-wake.png');
const B = path.resolve(HERE, '../../../public/nexus-slice/wake.webp');
const BG = { r: 240, g: 243, b: 246 };

const trimmed = async (f) => {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      if (data[p + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

const S = 520;
const crop = async (f, b) =>
  sharp(f)
    .extract({ left: b.x0, top: b.y0, width: b.w, height: b.h })
    .resize(S, S, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .png()
    .toBuffer();

const bA = await trimmed(A);
const bB = await trimmed(B);
await sharp({ create: { width: S * 2 + 24, height: S, channels: 3, background: BG } })
  .composite([
    { input: await crop(A, bA), left: 0, top: 0 },
    { input: await crop(B, bB), left: S + 24, top: 0 },
  ])
  .png()
  .toFile(path.join(SHOTS, 'side-by-side.png'));
console.log('side-by-side →', path.join(SHOTS, 'side-by-side.png'));