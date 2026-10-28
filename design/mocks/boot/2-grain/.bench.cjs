/* 采样成本基准：决定 canvas 基础分辨率（PX）与 fbm 倍频数 */
const P = new Uint8Array(512);
const G = new Float32Array(256);
let s = 1337;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 256; i++) G[i] = rnd();
for (let i = 0; i < 256; i++) P[i] = i;
for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; }
for (let i = 0; i < 256; i++) P[256 + i] = P[i];

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const X = xi & 255, Y = yi & 255;
  const p0 = P[X], p1 = P[X + 1];
  const n00 = G[P[p0 + Y]], n10 = G[P[p1 + Y]], n01 = G[P[p0 + Y + 1]], n11 = G[P[p1 + Y + 1]];
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}
const OCT = 3;
function fbm(x, y) {
  let a = 0.5, sum = 0;
  for (let i = 0; i < OCT; i++) {
    sum += a * vnoise(x, y);
    const nx = (0.8 * x - 0.6 * y) * 2.03 + 11.7;
    y = (0.6 * x + 0.8 * y) * 2.03 + 11.7;
    x = nx; a *= 0.5;
  }
  return sum * 1.1428;
}
function field(x, y, t) {
  const q0 = fbm(x, y + t * 0.05);
  const q1 = fbm(x + 5.2, y + 1.3 - t * 0.04);
  return fbm(x + 1.7 * q0, y + 1.7 * q1 + 2.0);
}

function run(W, H, cell, label) {
  let acc = 0;
  const t0 = process.hrtime.bigint();
  const N = 30;
  for (let k = 0; k < N; k++) {
    const t = k * 0.05;
    for (let cy = 0; cy < H; cy += cell) {
      for (let cx = 0; cx < W; cx += cell) {
        const ux = (cx + cell * 0.5 - 0.5 * W) / H;
        const uy = (cy + cell * 0.5 - 0.5 * H) / H;
        acc += field(ux * 0.55, uy * 0.55, t);
      }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`${label} ${W}x${H} cell=${cell} → ${(W / cell | 0)}×${(H / cell | 0)} 格  ${ms.toFixed(2)} ms/帧  (${acc > 0 ? '' : 'x'})`);
}
for (const [w, h] of [[240, 150], [288, 180], [180, 113], [65, 141], [78, 169]]) {
  for (const cell of [14, 7, 3, 1]) run(w, h, cell, '');
}