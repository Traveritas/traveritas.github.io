// ⛔ 已退役（2026-10-07）：它校验的 ZONES 色板已从 src/data/night.ts 删除，本脚本留作存档，运行会报 ZONES parse failed。
// 过夜色板校准台（三段平台版）：解析 src/data/night.ts 的 ZONES，
// 逐段核验 ink/soft 对（7% 洗染后、梦/醒两态取小）bg 的 WCAG 对比度。
// 平台是读者久留的地方，三段都必须整段 ≥4.5:1。
// 段间那 0.35s 淡变必然经过对比度低谷（bg 与 ink 亮度交错），
// 那是换面本身的代价，静态校验覆盖不到、也不该覆盖。
// 用法：node design/.calib-night.cjs [候选JSON文件]
//   无参 = 校验当前入库三段；有参 = 校验候选段色（[["name","#bg","#ink","#soft"],...]）
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/data/night.ts'), 'utf8');
const BLOCK = /ZONES[^=]*=\s*\[([\s\S]*?)\]\s*;/.exec(src);
if (!BLOCK) throw new Error('ZONES parse failed');
const field = (b, k) => {
  const m = new RegExp(k + ":\\s*'([^']+)'").exec(b);
  return m && m[1];
};
const zones = (BLOCK[1].match(/\{(?:[^{}]|\{[^{}]*\})*\}/g) || [])
  .map((b) => ({
    name: field(b, 'name'),
    bg: field(b, 'bg'),
    ink: field(b, 'ink'),
    soft: field(b, 'soft'),
    line: field(b, 'line'),
  }))
  .filter((z) => z.name && z.bg && z.ink && z.soft);
if (!zones.length) throw new Error('ZONES parse failed: no zone matched');

let cand = null;
if (process.argv[2]) {
  cand = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map((r) => ({
    name: r[0], bg: r[1], ink: r[2], soft: r[3], line: r[4] || null,
  }));
}

const hex = (s) => (Array.isArray(s) ? s : [0, 2, 4].map((i) => parseInt(s.replace('#', '').slice(i, i + 2), 16)));
const lum = (rgb) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const mix = (a, b, t) => hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t));

// body 实际背景 = color-mix(in srgb, var(--bg) 93%, var(--wash) 7%)
const WASH = { dream: '8a5a30', wake: '556270' };
const washed = (bg, w) => mix(bg, WASH[w], 0.07);
// --line 是 16% 器线：叠在洗染后的 bg 上（装饰性发丝线，不按非文本 3:1 门限）
const overline = (line, bgw) => {
  const m = /rgba?\(([^)]+)\)/.exec(line || '');
  if (!m) return null;
  const p = m[1].split(',').map(Number);
  const a = p.length > 3 ? p[3] : 1;
  return p.slice(0, 3).map((v, i) => Math.round(v * a + bgw[i] * (1 - a)));
};

const P = cand || zones;
console.log((cand ? '== 候选三段 ==' : '== 当前入库三段 ==') + `  ${P.length} 段`);
const bad = [];
for (const z of P) {
  const r = {};
  for (const w of ['dream', 'wake']) {
    const bgw = washed(z.bg, w);
    r[w] = {
      ink: contrast(hex(z.ink), bgw),
      soft: contrast(hex(z.soft), bgw),
      line: z.line ? contrast(overline(z.line, bgw), bgw) : null,
    };
  }
  const ink = Math.min(r.dream.ink, r.wake.ink);
  const soft = Math.min(r.dream.soft, r.wake.soft);
  const line = r.dream.line && r.wake.line ? Math.min(r.dream.line, r.wake.line) : null;
  const ok = (v) => (v >= 4.5 ? '✓' : '✗');
  if (ink < 4.5 || soft < 4.5) bad.push(z.name);
  console.log(
    `  ${z.name.padEnd(6)} bg ${z.bg} ink ${z.ink} soft ${z.soft}` +
      `  ink ${ink.toFixed(2)} ${ok(ink)}  soft ${soft.toFixed(2)} ${ok(soft)}` +
      (line ? `  line ${line.toFixed(2)}（器线，参考）` : ''),
  );
}
console.log(
  bad.length
    ? `\n✗ ${bad.length} 段未达 4.5:1：${bad.join(' / ')}`
    : '\n✓ 三段 ink/soft 对（梦/醒两洗染态取小）均 ≥4.5:1',
);
