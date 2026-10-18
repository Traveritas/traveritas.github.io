/* 试色候选的对比度核对（跑在 node 里，不用起站点）
   node design/accent-contrast.cjs            看十个候选，并列出各自定下来要填的值
   node design/accent-contrast.cjs 6fa39d     只看一个（色值或色相角都行）

   算法来自试色脚手架（`?accent=` 那一版，已拆掉）：给一个种子色，把强调色那一族整体转到它的
   色相上，每个色留自己的浓度比例，再把明度解回「原来的相对亮度」。WCAG 相对亮度 + 对比度。
   阈值：正文类 ≥4.5，小标签 / 焦点类 ≥3。

   ── 强调色那一族现在落在这四处（要再换色就改这几处，值由本脚本印出） ──
   1  src/styles/tokens.css        --amber / --umber / --ghost-ink / --dream
   2  src/scripts/reality.ts       ACCENT 四行，每行的第一个色（梦端；醒面的冷灰不动）
   3  src/styles/wander.css        --w-ink 四处：essay / moment / project / home，另加第 479 行栏头那处
   4  src/scripts/wander/faces.js  INK 三个场景的 ink 与 chip
   下面每个候选都直接印出这四处该填的值。
   ───────────────────────────────────────────────────────────── */

const REFERENCE = '#d9a05b';
const REF_RGB = [217, 160, 91];

const PRESETS = [
  ['琥珀（原色）', '#d9a05b'],
  ['陶土', '#bf7050'],
  ['石榴', '#c0737e'],
  ['藕荷', '#c98fa8'],
  ['薄暮', '#9a86c4'],
  ['靛青', '#6f7fc0'],
  ['霜蓝', '#86a8c8'],
  ['雾青', '#6fa39d'],
  ['苔绿', '#8a9a68'],
  ['松烟', '#6e8f88'],
];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function parseColor(s) {
  const t = String(s).trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^#?([0-9a-f]{3})$/.exec(t);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  throw new Error(`认不出这个色：${s}`);
}
function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(((h * 60) % 360) + 360) % 360, s, l];
}
function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
  return seg.map((v) => Math.round((v + m) * 255));
}
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function solveL(h, s, target) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hslToRgb([h, s, mid])) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const refHsl = rgbToHsl(REF_RGB);
function seedRgb(raw) {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return hslToRgb([Number(raw), refHsl[1], refHsl[2]]);
  return parseColor(raw);
}
function makeShift(raw) {
  const t = rgbToHsl(seedRgb(raw));
  return { dh: t[0] - refHsl[0], satMul: t[1] / refHsl[1], lumaMul: luminance(seedRgb(raw)) / luminance(REF_RGB) };
}
function shift(src, sh) {
  const [h, s] = rgbToHsl(src);
  if (s < 0.06) return src;
  const nh = h + sh.dh, ns = clamp(s * sh.satMul, 0, 1);
  return hslToRgb([nh, ns, solveL(nh, ns, clamp(luminance(src) * sh.lumaMul, 0, 1))]);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/* 要核对的「字 / 底」对：色号与底都取自站内实测 */
const PAIRS = [
  ['amber 昼底', '#d9a05b', '#f0f3f6', 3],
  ['umber 昼底', '#765640', '#f0f3f6', 4.5],
  ['umber 浅梦底', '#765640', '#e1e7ef', 4.5],
  ['w-ink 随笔', '#765640', '#c6ced9', 4.5],
  ['w-ink 项目', '#c9a77e', '#0d1524', 4.5],
  ['w-ink 瞬间', '#e0aa86', '#1d1729', 4.5],
  ['w-ink 主页', '#d6b28c', '#0e0f1d', 4.5],
  ['hour-ink 深眠', null, '#0d1524', 4.5],
];

/* 要写死时，这几处就是下面印出来的值。chip 那三条按 [r, g, b, a] 印，a 原样不动 */
const LITERALS = [
  ['tokens.css  --amber', '#d9a05b'],
  ['tokens.css  --umber', '#765640'],
  ['tokens.css  --ghost-ink', '#b98f74'],
  ['tokens.css  --dream', '#c2a382'],
  ['wander.css  --w-ink essay', '#765640'],
  ['wander.css  --w-ink moment', '#e0aa86'],
  ['wander.css  --w-ink project', '#c9a77e'],
  ['wander.css  --w-ink home', '#d6b28c'],
  ['wander.css  .w-rh home', '#c9b49c'],
  ['faces.js    ink essay', '#765640'],
  ['faces.js    ink moment', '#e0aa86'],
  ['faces.js    ink project', '#c9a77e'],
  ['faces.js    chip essay', '#765640', 0.32],
  ['faces.js    chip moment', '#e0aa86', 0.34],
  ['faces.js    chip project', '#c9a77e', 0.34],
];

const arg = process.argv.slice(2)[0];
const rows = (arg ? [[arg, arg]] : PRESETS).map(([name, seed]) => [name, seed, makeShift(seed)]);

console.log('阈值：正文类 ≥4.5，小标签 / 焦点类 ≥3。   ! = 低于阈值   · = 勉强（距阈值 0.6 以内）\n');
console.log('候选'.padEnd(16) + PAIRS.map((p) => p[0].replace('w-ink ', '').replace(' 昼底', '').padEnd(10)).join(''));
for (const [name, , sh] of rows) {
  const cells = PAIRS.map(([, src, bg, min]) => {
    const fg = src === null ? mix(shift([118, 86, 64], sh), [255, 255, 255], 0.52) : shift(parseColor(src), sh);
    const c = contrast(fg, parseColor(bg));
    const flag = c < min ? '!' : c < min + 0.6 ? '·' : ' ';
    return `${c.toFixed(1)}${flag}`.padEnd(10);
  });
  console.log(name.padEnd(16) + cells.join(''));
}

for (const [name, seed, sh] of rows) {
  console.log(`\n── ${name}（${seed}）定下来要填的值 ──`);
  for (const [label, src, alpha] of LITERALS) {
    const out = shift(parseColor(src), sh);
    console.log(`  ${label.padEnd(28)} ${alpha === undefined ? hex(out) : `[${out.join(', ')}, ${alpha}]`}`);
  }
}
console.log('\n（tokens.css 的 --amber 换成上表第一行；reality.ts 的 ACCENT_BASE 四行梦端与 tokens.css 那四个值同源，照抄即可。）');
