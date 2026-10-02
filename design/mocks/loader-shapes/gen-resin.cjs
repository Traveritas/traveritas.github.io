// 开屏晶片里的树脂纹理：域扭曲 fbm，低饱和醒梦配色，偶有一线琥珀。
// 用法：node gen-resin.cjs <输出目录>  → resin.png（512²）；站上用的是转成 WebP 的 public/textures/resin.webp
// （在 Chrome 里 canvas.toDataURL('image/webp', 0.86) 转的，270 KB → 21 KB）
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const OUT = process.argv[2];

/* ── ② 树脂纹理 ── */
const N = 512;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v; };
const fbm = (x, y) => { let s = 0, amp = 0.5; for (let i = 0; i < 5; i++) { s += amp * vnoise(x, y); x = x * 2.02 + 3.1; y = y * 2.02 + 1.7; amp *= 0.5; } return s; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const STOPS = [[0, hex('#cdb9b6')], [0.3, hex('#e2d3cd')], [0.5, hex('#c8b097')], [0.68, hex('#b4bcc5')], [0.85, hex('#e9e6e3')], [1, hex('#f6f2ee')]];
const ramp = (t) => { t = Math.max(0, Math.min(1, t)); for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], k = (t - t0) / (t1 - t0); return c0.map((v, j) => v + (c1[j] - v) * k); } return STOPS[STOPS.length - 1][1]; };
const raw = Buffer.alloc((N * 3 + 1) * N);
const amber = hex('#d9a05b');
for (let y = 0; y < N; y++) {
  raw[y * (N * 3 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    const u = (x / N) * 3, v = (y / N) * 3;
    const qx = fbm(u, v), qy = fbm(u + 5.2, v + 1.3);
    const rx = fbm(u + 4 * qx + 1.7, v + 4 * qy + 9.2), ry = fbm(u + 4 * qx + 8.3, v + 4 * qy + 2.8);
    let t = fbm(u + 3.5 * rx, v + 3.5 * ry);
    t = (t - 0.25) / 0.5;
    let c = ramp(t);
    // 极少处一线琥珀：扭曲最剧烈的地方
    const g = Math.max(0, (rx - 0.68) * 7) * 0.45;
    c = c.map((val, j) => val + (amber[j] - val) * Math.min(g, 0.5));
    const o = y * (N * 3 + 1) + 1 + x * 3;
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, dd) => { const l = Buffer.alloc(4); l.writeUInt32BE(dd.length); const td = Buffer.concat([Buffer.from(t), dd]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.join(OUT, 'resin.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
