/* 掩码 → PNG（调试用）。不给库，手写 PNG 编码 */
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer ?? rgba, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

/** 把若干掩码并排拼成一张（白底黑星，带 1px 分隔线） */
export function tileMasks(items, { cell = 96, gap = 6 } = {}) {
  const cols = Math.min(items.length, Math.ceil(Math.sqrt(items.length * 1.6))) || 1;
  const rows = Math.ceil(items.length / cols);
  const W = cols * (cell + gap) - gap;
  const H = rows * (cell + gap) - gap;
  const out = Buffer.alloc(W * H * 4, 255);
  items.forEach((it, i) => {
    const cx = (i % cols) * (cell + gap);
    const cy = Math.floor(i / cols) * (cell + gap);
    const m = it.mask;
    const s = it.size;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const sx = Math.floor((x / cell) * s);
        const sy = Math.floor((y / cell) * s);
        const v = m[sy * s + sx] ? 0 : 255;
        const o = ((cy + y) * W + cx + x) * 4;
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
  });
  return { rgba: out, W, H };
}