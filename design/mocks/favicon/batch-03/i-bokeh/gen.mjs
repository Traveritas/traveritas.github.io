/* ─────────────────────────────────────────────────────────────
   i-bokeh · 散景 —— 几何生成器

   规矩（全部由这里算，没有一个坐标是手抄的）：
     1. 六枚光斑落在一条 14° 的漂移带上（站点那根发丝线的角度）。
     2. 轴向位置 s 与侧向偏移 p 各自成一条采样曲线，把它们从直线打散成"一小片"。
     3. 离焦量 f = |s − s_f| / max 决定半径：r = r0 + span·f^0.75。
     4. 面亮度随 r 衰减（光量摊开）：α = a0 + (1−a0)·(r0/r)^2（醒） / ^1.7（梦）。
     5. 形状：越离焦越显出光圈叶的多边形（九叶）；f→0 是正圆。
     6. 互斥松弛：任意两枚不许相碰（留 0.45 的空隙）。
     7. 最后把整组按包围盒居中到 32×32 的框里。

   产出：favicon.svg / favicon-dream.svg / index.html（由 template.html 填）
   ───────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = (p) => path.join(HERE, p);

/* ── 1. 参数 ─────────────────────────────────────────────── */
const AX = (14 * Math.PI) / 180;      // 站点签名角
const UX = Math.cos(AX), UY = Math.sin(AX);
const NX = -Math.sin(AX), NY = Math.cos(AX);

const SEEDS = [
  // [沿轴 s, 侧向 p]
  [-9.0,  4.2],
  [-5.2, -3.6],
  [-1.6,  2.6],
  [ 1.8, -3.4],   // 在焦平面上（索引见 FOCUS）
  [ 5.0,  4.0],
  [ 8.6, -2.8],
];
const FOCUS = 3;
const R0 = 1.70;      // 对焦那一枚的半径
const SPAN = 2.00;    // 半径随离焦量的跨度
const EXP = 0.75;     // 半径—离焦曲线
const GAP = 0.45;     // 互斥松弛要留的空隙
const BLADES = 9;     // 光圈叶片数

/* ── 2. 位置与半径 ───────────────────────────────────────── */
const discs = SEEDS.map(([s, p], i) => ({
  i, s, p,
  x: 16 + s * UX + p * NX,
  y: 16 + s * UY + p * NY,
}));

const sf = discs[FOCUS].s;
const dmax = Math.max(...discs.map((d) => Math.abs(d.s - sf)));
discs.forEach((d) => {
  d.depth = Math.abs(d.s - sf);
  d.f = d.depth / dmax;
  d.r = R0 + SPAN * Math.pow(d.f, EXP);
  d.aWake = 0.30 + 0.70 * Math.pow(R0 / d.r, 2.0);
  d.aDream = 0.34 + 0.66 * Math.pow(R0 / d.r, 1.7);
});

/* ── 3. 互斥松弛（确定性的，按固定顺序推） ──────────────── */
for (let it = 0; it < 400; it++) {
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const A = discs[i], B = discs[j];
      let dx = B.x - A.x, dy = B.y - A.y;
      let dist = Math.hypot(dx, dy) || 1e-6;
      const need = A.r + B.r + GAP;
      if (dist < need) {
        const push = (need - dist) / 2;
        dx /= dist; dy /= dist;
        A.x -= dx * push; A.y -= dy * push;
        B.x += dx * push; B.y += dy * push;
      }
    }
    const d = discs[i];
    d.x = Math.min(32 - d.r - 0.9, Math.max(d.r + 0.9, d.x));
    d.y = Math.min(32 - d.r - 0.9, Math.max(d.r + 0.9, d.y));
  }
}

/* ── 4. 按包围盒居中 ─────────────────────────────────────── */
{
  const xs = discs.flatMap((d) => [d.x - d.r, d.x + d.r]);
  const ys = discs.flatMap((d) => [d.y - d.r, d.y + d.r]);
  const dx = 16 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = 16 - (Math.min(...ys) + Math.max(...ys)) / 2;
  discs.forEach((d) => { d.x += dx; d.y += dy; });
}

/* ── 5. 形状：越离焦越显出光圈叶 ─────────────────────────── */
// 九边形顶点按半径 r·1.035 摆，转角用二次贝塞尔倒角；f→0 时倒角到极限≈正圆。
function shapePath(cx, cy, r, f) {
  const R = r * 1.035;
  const round = 0.342 * (1 - 0.78 * f);       // 倒角占半边长度的比例
  const half = R * Math.sin(Math.PI / BLADES);
  const t = round * half;
  const rot = (-90 + (f * 11.6)) * Math.PI / 180;  // 每枚再转一点，免得九边对齐成一片
  const P = (k) => {
    const a = rot + (k * 2 * Math.PI) / BLADES;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const mix = (A, B, u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
  const n = (v) => Math.round(v * 100) / 100;
  let d = '';
  for (let k = 0; k < BLADES; k++) {
    const prev = P(k - 1), cur = P(k), next = P(k + 1);
    const inP = mix(cur, prev, t / Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
    const outP = mix(cur, next, t / Math.hypot(cur[0] - next[0], cur[1] - next[1]));
    if (k === 0) d += `M${n(inP[0])} ${n(inP[1])}`;
    else d += `L${n(inP[0])} ${n(inP[1])}`;
    d += `Q${n(cur[0])} ${n(cur[1])} ${n(outP[0])} ${n(outP[1])}`;
  }
  return d + 'Z';
}
discs.forEach((d) => { d.path = shapePath(d.x, d.y, d.r, d.f); });

/* ── 6. 圆整 ─────────────────────────────────────────────── */
const n2 = (v) => Math.round(v * 100) / 100;
const n3 = (v) => Math.round(v * 1000) / 1000;

/* ── 7. 输出：三个 SVG 组 ────────────────────────────────── */
const wakeBody = discs
  .map((d) => `<path d="${d.path}" opacity="${n2(d.aWake)}"/>`)
  .join('\n    ');

const dreamBody = discs
  .map((d) => {
    if (d.i === FOCUS) {
      return `<circle cx="${n2(d.x)}" cy="${n2(d.y)}" r="${n2(d.r * 2.6)}" fill="url(#b-halo)" opacity=".85"/>\n` +
             `    <path d="${d.path}" fill="url(#b-core)"/>`;
    }
    return `<circle cx="${n2(d.x)}" cy="${n2(d.y)}" r="${n2(d.r * 1.55)}" fill="url(#b-halo)" opacity="${n2(d.aDream * 0.9)}"/>\n` +
           `    <path d="${d.path}" fill="url(#b-ball)" opacity="${n2(d.aDream)}"/>`;
  })
  .join('\n    ');

const monoBody = discs
  .map((d) => `<path d="${d.path}" opacity="${n2(d.aWake)}"/>`)
  .join('\n    ');

const DEFS = `<defs>
  <radialGradient id="b-ball" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#a89cc9" stop-opacity=".62"/>
    <stop offset=".46" stop-color="#9a86c4" stop-opacity=".74"/>
    <stop offset=".80" stop-color="#cfc4e8" stop-opacity="1"/>
    <stop offset=".93" stop-color="#a195c1" stop-opacity=".42"/>
    <stop offset="1" stop-color="#a195c1" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="b-halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#9a86c4" stop-opacity=".34"/>
    <stop offset=".55" stop-color="#9a86c4" stop-opacity=".16"/>
    <stop offset="1" stop-color="#9a86c4" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="b-core" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#f4f1fc" stop-opacity="1"/>
    <stop offset=".42" stop-color="#e2dbf4" stop-opacity=".98"/>
    <stop offset=".82" stop-color="#b3a7d6" stop-opacity=".92"/>
    <stop offset="1" stop-color="#9a86c4" stop-opacity=".55"/>
  </radialGradient>
</defs>`;

/* ── 8. 成品：favicon.svg（醒面 · currentColor） ─────────── */
const faviconWake = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="散景 · 醒面">
  <title>散景 · 醒面</title>
  <style>
    .b{fill:currentColor}
    @media (prefers-color-scheme:dark){ .b{fill:#cdc6e6} }
  </style>
  <g class="b">
    ${wakeBody}
  </g>
</svg>
`;

const faviconDream = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="散景 · 梦面">
  <title>散景 · 梦面</title>
  ${DEFS}
  <g>
    ${dreamBody}
  </g>
</svg>
`;

fs.writeFileSync(OUT('favicon.svg'), faviconWake);
fs.writeFileSync(OUT('favicon-dream.svg'), faviconDream);

/* ── 9. 页面片段 ─────────────────────────────────────────── */
const SPRITE = `<defs>
  ${DEFS.replace(/^<defs>|<\/defs>$/g, '')}
</defs>
<g id="m-wake" fill="#232830">
  ${wakeBody}
</g>
<g id="m-dream">
  ${dreamBody}
</g>
<g id="m-mono" fill="currentColor">
  ${monoBody}
</g>`;

const TABLE = discs
  .map(
    (d) => `<tr><td>${d.i + 1}${d.i === FOCUS ? ' · 焦' : ''}</td><td>${n2(d.s)}</td><td>${n2(d.p)}</td>` +
      `<td>${n2(d.depth)}</td><td>${n3(d.f)}</td><td>${n2(d.r)}</td><td>${n2(d.aWake)}</td></tr>`
  )
  .join('');

/* 尺寸带 */
function band(theme) {
  const cells = [32, 24, 16].map((px) => {
    const a = `<svg viewBox="0 0 32 32" width="${px}" height="${px}" aria-hidden="true"><use href="#m-wake"/></svg>`;
    const b = `<svg viewBox="0 0 32 32" width="${px}" height="${px}" aria-hidden="true"><use href="#m-dream"/></svg>`;
    const sub = theme === 'dark' ? 'dark' : '';
    return `<div class="cell ${theme}"><span class="tag">${px}</span><div class="pair">${a}${b}</div>` +
      `<div class="pair sub ${sub}"><span class="tile t-wake" style="padding:${px > 24 ? 5 : px > 16 ? 4 : 3}px">${a}</span>` +
      `<span class="tile t-dream" style="padding:${px > 24 ? 5 : px > 16 ? 4 : 3}px">${b}</span></div></div>`;
  });
  return cells.join('');
}

/* 标签栏 */
function strip(theme) {
  const mode = theme === 'dark' ? 'm-dream' : 'm-wake';
  const name = theme === 'dark' ? 'AveritA' : 'Traveritas';
  return `<div class="strip ${theme}">
      <div class="tab active"><span class="fav"><svg viewBox="0 0 32 32" width="16" height="16" aria-hidden="true"><use href="#${mode}"/></svg></span><span class="ttl">${name}</span><span class="x">×</span></div>
      <div class="tab"><span class="fav ph"></span><span class="ttl">断章 · ESSAYS</span><span class="x">×</span></div>
      <div class="tab"><span class="fav ph"></span><span class="ttl">造物 · PROJECTS</span><span class="x">×</span></div>
      <div class="tab"><span class="fav ph"></span><span class="ttl">闪念 · MOMENTS</span><span class="x">×</span></div>
    </div><div class="winbody"></div>`;
}

/* 单色 */
const MONOS = [
  ['m1', '纸底 · 墨'],
  ['m2', '夜底 · 冷白'],
  ['m3', '淡紫底 · 深紫'],
  ['m4', '靛底 · 薄暮'],
]
  .map(
    ([cls, cap]) =>
      `<div class="mono ${cls}"><svg viewBox="0 0 32 32" width="88" height="88" aria-hidden="true"><use href="#m-mono"/></svg><span class="cap">${cap}</span></div>`
  )
  .join('');

/* 16px 放大镜 */
const MAGS = [
  ['wake', '#f0f3f6', 'light', '醒面 · 纸底'],
  ['dream', '#0c0f18', 'dark', '梦面 · 靛夜底'],
]
  .map(
    ([m, g, cls, cap]) =>
      `<div class="mag ${cls}" data-mag="${m}" data-ground="${g}"><span class="one"><svg viewBox="0 0 32 32" width="16" height="16" aria-hidden="true"><use href="#m-${m}"/></svg></span><span class="cap">${cap}</span></div>`
  )
  .join('');

/* 主视觉 */
const HERO = `<div class="plate light"><svg viewBox="0 0 32 32" width="176" height="176" aria-hidden="true"><use href="#m-wake"/></svg><span class="cap">WAKE · 醒</span></div>
    <div class="plate dark"><svg viewBox="0 0 32 32" width="176" height="176" aria-hidden="true"><use href="#m-dream"/></svg><span class="cap">DREAM · 梦</span></div>`;

/* 几何注解（放大 10 倍画，viewBox 320） */
const AX0 = 16, AY0 = 16;
const S = 10;
const annoDiscs = discs
  .map((d) => {
    const col = d.i === FOCUS ? '#9a86c4' : 'rgba(35,40,48,.42)';
    return `<circle cx="${n2(d.x * S)}" cy="${n2(d.y * S)}" r="${n2(d.r * S)}" fill="none" stroke="${col}" stroke-width="${d.i === FOCUS ? 2 : 1.2}" ${d.i === FOCUS ? '' : 'stroke-dasharray="4 4"'}/>
    <circle cx="${n2(d.x * S)}" cy="${n2(d.y * S)}" r="2.2" fill="${col}"/>
    <text x="${n2(d.x * S)}" y="${n2(d.y * S - d.r * S - 7)}" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="10.5" fill="${d.i === FOCUS ? '#7d6fae' : '#858f9d'}">${d.i + 1} · r${n2(d.r)}</text>`;
  })
  .join('\n    ');
const ANNO = `<line x1="${AX0 * S - 155}" y1="${AY0 * S - 155 * Math.tan(AX)}" x2="${AX0 * S + 155}" y2="${AY0 * S + 155 * Math.tan(AX)}" stroke="#a195c1" stroke-width="1" stroke-dasharray="7 5" opacity=".8"/>
    <text x="16" y="${16 * S - 140 * Math.tan(AX) - 6}" font-family="ui-monospace,Consolas,monospace" font-size="10" fill="#9a86c4">14°</text>
    ${annoDiscs}
    <text x="300" y="310" text-anchor="end" font-family="ui-monospace,Consolas,monospace" font-size="9.5" fill="#858f9d">viewBox 0 0 32 32 · ×10</text>`;

/* ── 10. 填模板 ──────────────────────────────────────────── */
let html = fs.readFileSync(OUT('template.html'), 'utf8');
const map = {
  SPRITE, TABLE, BAND_LIGHT: band('light'), BAND_DARK: band('dark'),
  STRIP_LIGHT: strip('light'), STRIP_DARK: strip('dark'),
  MONOS, MAGS, HERO, ANNO,
  R0: R0.toFixed(2), SPAN: SPAN.toFixed(2), GAP: GAP.toFixed(2),
};
for (const [k, v] of Object.entries(map)) html = html.split(`<!--${k}-->`).join(v);
fs.writeFileSync(OUT('index.html'), html);

/* ── 11. 自检 ────────────────────────────────────────────── */
let minGap = Infinity, worst = '';
for (let i = 0; i < discs.length; i++)
  for (let j = i + 1; j < discs.length; j++) {
    const A = discs[i], B = discs[j];
    const g = Math.hypot(B.x - A.x, B.y - A.y) - A.r - B.r;
    if (g < minGap) { minGap = g; worst = `${i + 1}-${j + 1}`; }
  }
console.log('discs:');
discs.forEach((d) =>
  console.log(`  ${d.i + 1}  (${n2(d.x)}, ${n2(d.y)})  r=${n2(d.r)}  f=${n3(d.f)}  aW=${n2(d.aWake)}  aD=${n2(d.aDream)}  16px 直径=${n2(d.r)}px`)
);
console.log(`最小间隙 ${n2(minGap)}（${worst}）· 16px 下 ${n2(minGap / 2)}px`);
console.log('✓ favicon.svg / favicon-dream.svg / index.html');
