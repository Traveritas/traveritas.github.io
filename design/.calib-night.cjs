// 夜色板校准台：解析 src/data/night.ts 的 PALETTE，复刻 paletteAt/hexLerp，
// 密集扫描整夜 ink/soft 对（洗染后）body 背景的 WCAG 对比度。
// 用法：node design/.calib-night.cjs [候选JSON文件]
//   无参 = 扫当前入库色板；有参 = 扫候选停靠点（[["m","bg","ink","soft"],...]）
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/data/night.ts'), 'utf8');
const RANGE = /PALETTE\s*=\s*\[([^\]]+)\]/.exec(src)[1];
const stops = [...RANGE.matchAll(/\{\s*m:\s*(\d+),\s*bg:\s*'#([0-9a-f]{6})',\s*ink:\s*'#([0-9a-f]{6})',\s*soft:\s*'#([0-9a-f]{6})'/g)]
  .map((x) => ({ m: +x[1], bg: x[2], ink: x[3], soft: x[4] }));
if (!stops.length) throw new Error('PALETTE parse failed');

let cand = null;
if (process.argv[2]) {
  cand = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map((r) => ({
    m: r[0], bg: r[1].replace('#', ''), ink: r[2].replace('#', ''), soft: r[3].replace('#', ''),
  }));
}

const hex = (s) => (Array.isArray(s) ? s : [0, 2, 4].map((i) => parseInt(s.replace('#', '').slice(i, i + 2), 16)));
const lum = (rgb) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const lerp = (a, b, t) => a + (b - a) * t;
const mixHex = (a, b, t) => hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], t)));

// body 实际背景 = color-mix(in srgb, var(--bg) 93%, var(--wash) 7%)
const WASH = { dream: '8a5a30', wake: '556270' };
const washed = (bg, w) => mixHex(bg, WASH[w], 0.07);

const P = cand || stops;
// 换面护栏（与 src/scripts/night.ts 同算法）：ratio 不足沿所在侧推离 bg
function guard(c, bg, floor) {
  if (contrast(c, bg) >= floor) return c;
  const darken = lum(c) < lum(bg);
  let out = [...c];
  for (let i = 0; i < 12 && contrast(out, bg) < floor; i++) {
    out = darken ? out.map((v) => v * 0.75) : out.map((v) => v + (255 - v) * 0.3);
  }
  return out;
}
function paletteAt(m) {
  let i = 0;
  while (i < P.length - 2 && m > P[i + 1].m) i++;
  const a = P[i], b = P[i + 1] || a;
  const t = Math.min(1, Math.max(0, (m - a.m) / Math.max(b.m - a.m, 1)));
  const bg = mixHex(a.bg, b.bg, t);
  return {
    bg,
    ink: guard(mixHex(a.ink, b.ink, t), bg, 3.4),
    soft: guard(mixHex(a.soft, b.soft, t), bg, 3.0),
  };
}

const fmt = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const clock = (m) => { const t = 1387 + m; const h = Math.floor(t / 60) % 24, mm = Math.floor(t % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };

console.log((cand ? '== 候选色板 ==' : '== 当前入库色板 ==') + `  ${P.length} 站`);
console.log('停靠点自检（ink/soft 对洗染后 bg，两态取小）：');
for (const s of P) {
  const r = {};
  for (const w of ['dream', 'wake']) {
    const bgw = washed(s.bg, w);
    r[w] = { ink: contrast(hex(s.ink), bgw), soft: contrast(hex(s.soft), bgw) };
  }
  const ink = Math.min(r.dream.ink, r.wake.ink), soft = Math.min(r.dream.soft, r.wake.soft);
  console.log(
    `  m${String(s.m).padStart(3)} ${clock(s.m)} bg ${fmt(hex(s.bg))} ink ${fmt(hex(s.ink))} soft ${fmt(hex(s.soft))}  ink ${ink.toFixed(2)} ${ink >= 4.5 ? '✓' : '✗'}  soft ${soft.toFixed(2)} ${soft >= 4.5 ? '✓' : '✗'}`,
  );
}

console.log('\n整夜路径扫描（步长 0.25 分，两态取小）——违例区间：');
const band = (m0, m1, arr) => arr.filter((x) => x.m >= m0 && x.m <= m1);
let violInk45 = [], violInk3 = [], violSoft45 = [], violSoft3 = [];
for (let m = 0; m <= 444; m += 0.25) {
  const pal = paletteAt(m);
  let ink = 1e9, soft = 1e9;
  for (const w of ['dream', 'wake']) {
    const bgw = washed(pal.bg, w);
    ink = Math.min(ink, contrast(pal.ink, bgw));
    soft = Math.min(soft, contrast(pal.soft, bgw));
  }
  if (ink < 4.5) violInk45.push({ m, v: ink });
  if (ink < 3) violInk3.push({ m, v: ink });
  if (soft < 4.5) violSoft45.push({ m, v: soft });
  if (soft < 3) violSoft3.push({ m, v: soft });
}
const ranges = (arr) => {
  const out = [];
  for (const x of arr) {
    const last = out[out.length - 1];
    if (last && x.m - last.m1 <= 0.5) { last.m1 = x.m; last.min = Math.min(last.min, x.v); }
    else out.push({ m0: x.m, m1: x.m, min: x.v });
  }
  return out;
};
const report = (name, arr) => {
  const rs = ranges(arr);
  if (!rs.length) return console.log(`  ${name}: 无违例`);
  console.log(`  ${name}: ${rs.length} 段，共 ${rs.reduce((a, r) => a + r.m1 - r.m0, 0).toFixed(1)} 分`);
  for (const r of rs) console.log(`    ${clock(r.m0)}(m${r.m0}) – ${clock(r.m1)}(m${r.m1})  最低 ${r.min.toFixed(2)}:1`);
};
report('ink < 4.5', violInk45);
report('ink < 3.0', violInk3);
report('soft < 4.5', violSoft45);
report('soft < 3.0', violSoft3);
