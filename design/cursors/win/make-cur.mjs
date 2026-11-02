import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/* 把纸刃 + 尾环（T3）打成 Windows 可用的 .cur（BMP/DIB，32 位带 alpha）。
   32 / 48 / 64 三档同装一个文件，热点固定在箭尖。
   用法：node design/cursors/win/make-cur.mjs
   输出：star-ring.cur + star-ring-{32,48,64}.png */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'arrow-t3.svg');
const OUT = path.join(here, 'star-ring.cur');
const HOT = { 32: [5, 4], 48: [8, 6], 64: [10, 8] };
const SIZES = [32, 48, 64];

function dib(rgba, w, h) {
  const xorRow = w * 4;
  const xor = Buffer.alloc(xorRow * h);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const i = (sy * w + x) * 4;
      const o = y * xorRow + x * 4;
      xor[o] = rgba[i + 2];
      xor[o + 1] = rgba[i + 1];
      xor[o + 2] = rgba[i];
      xor[o + 3] = rgba[i + 3];
    }
  }
  const maskRow = Math.ceil(w / 32) * 4;
  const mask = Buffer.alloc(maskRow * h);
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      if (rgba[(sy * w + x) * 4 + 3] < 128) mask[y * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(w, 4);
  head.writeInt32LE(h * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  head.writeUInt32LE(0, 16);
  head.writeUInt32LE(xor.length + mask.length, 20);
  head.writeInt32LE(0, 24);
  head.writeInt32LE(0, 28);
  head.writeUInt32LE(0, 32);
  head.writeUInt32LE(0, 36);
  return Buffer.concat([head, xor, mask]);
}

const images = [];
for (const size of SIZES) {
  const png = await sharp(SRC, { density: 288 }).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  fs.writeFileSync(path.join(here, `star-ring-${size}.png`), png);
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  images.push({ size, data, dib: dib(data, size, size) });
}

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(2, 2); // 2 = cursor
dir.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = [];
for (const im of images) {
  const e = Buffer.alloc(16);
  e.writeUInt8(im.size === 256 ? 0 : im.size, 0);
  e.writeUInt8(im.size === 256 ? 0 : im.size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(HOT[im.size][0], 4);
  e.writeUInt16LE(HOT[im.size][1], 6);
  e.writeUInt32LE(im.dib.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += im.dib.length;
}

fs.writeFileSync(OUT, Buffer.concat([dir, ...entries, ...images.map((i) => i.dib)]));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
