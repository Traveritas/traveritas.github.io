#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   h-ripple 生成器 —— 「水面的圆」
   环由衰减曲线算出，没有一个是手抄的坐标。改 CFG 任一系数，整枚重排。

   五条规矩：
     1 半径    r(k) = r(k-1) + g0 * gr^(k-1)          间距按几何级数放宽
     2 线宽    w(k) = w0 * (r0/r(k))^0.60             点源波振幅 ∝ 1/√r，取 0.60 让它掉得稍快
     3 浓度    o(k) = (r0/r(k))^0.78                  最外环"几乎化尽"
     4 碎片    第 k 环有 k 道缺口，缺口宽 gw(k) = gw0 * (r(k)/r0)^0.60
               —— 数在增、宽也在增：波前走得越远，越容易断。
               最内环只有一道 18° 的细缝，所以它仍读作"一个圆"，不是一段弧。
     5 光      每环的墨沿 14° 轴做一次线性衰减（左上 0.55 → 右下 1.0）
               —— 主页唯一的光源在左上，水面就只在那半边亮

   圆心沿 14° 偏离几何中心 OFF；环再沿同一条轴拉长 3%。
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const RAD = Math.PI / 180;
const SEAM = 14;
const OFF = 0.85;

const CFG = {
  cx: 16 + OFF * Math.cos(SEAM * RAD),
  cy: 16 + OFF * Math.sin(SEAM * RAD),
  ex: 1.03,
  ey: 0.97,
  r0: 4.3,
  g0: 3.9,
  gr: 1.13,
  n: 3,
  w0: 2.2,
  wExp: 0.6,
  oExp: 0.78,
  gw0: 18,
  gwExp: 0.6,
  gJit: 0.1,
  glintA: 1.9,
  glintH: 0.5,
  lightA: 1, // 14° 轴正向（右下）的墨量
  lightB: 0.55, // 14° 轴负向（左上）的墨量
  /* 缺口方位（度，手定）。规矩：相邻两环的缺口不落在同一条半径上。 */
  gapAngles: [
    [128],
    [216, 340],
    [58, 172, 286],
  ],
};

const f = (n) => String(Math.round(n * 1000) / 1000);

function radiusOf(k) {
  let r = CFG.r0;
  for (let i = 1; i < k; i++) r += CFG.g0 * Math.pow(CFG.gr, i - 1);
  return r;
}
const widthOf = (k) => CFG.w0 * Math.pow(CFG.r0 / radiusOf(k), CFG.wExp);
const opacityOf = (k) => Math.pow(CFG.r0 / radiusOf(k), CFG.oExp);
const gapWidthOf = (k) => CFG.gw0 * Math.pow(radiusOf(k) / CFG.r0, CFG.gwExp);

/* 缺口的方位与宽度 */
function gapsOf(k) {
  const base = gapWidthOf(k);
  return CFG.gapAngles[k - 1].map((c, j) => ({
    c,
    w: base * (1 + CFG.gJit * Math.sin(2.7 * j + k * 1.3)),
  }));
}

/* 由缺口反推「还留着墨」的弧段 */
function inkArcs(gaps) {
  const g = gaps.slice().sort((a, b) => a.c - b.c);
  const out = [];
  for (let i = 0; i < g.length; i++) {
    const a = g[i].c + g[i].w / 2;
    const nb = g[(i + 1) % g.length];
    let b = nb.c - nb.w / 2;
    if (i === g.length - 1) b += 360;
    out.push([a, b]);
  }
  return out;
}

const RINGS = [];
for (let k = 1; k <= CFG.n; k++) {
  RINGS.push({
    k,
    r: radiusOf(k),
    w: widthOf(k),
    op: opacityOf(k),
    gaps: gapsOf(k),
    arcs: inkArcs(gapsOf(k)),
  });
}

function pt(th, rx, ry, cx, cy) {
  const t = th * RAD, p = SEAM * RAD;
  return [
    cx + rx * Math.cos(t) * Math.cos(p) - ry * Math.sin(t) * Math.sin(p),
    cy + rx * Math.cos(t) * Math.sin(p) + ry * Math.sin(t) * Math.cos(p),
  ];
}

function arcPath(cx, cy, r, a1, a2) {
  const rx = r * CFG.ex, ry = r * CFG.ey;
  const [x1, y1] = pt(a1, rx, ry, cx, cy);
  const [x2, y2] = pt(a2, rx, ry, cx, cy);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${f(x1)} ${f(y1)}A${f(rx)} ${f(ry)} ${SEAM} ${large} 1 ${f(x2)} ${f(y2)}`;
}

/* 落点：一道很短的反光，不是实心圆点。两头收尖，沿 14° 躺着。 */
function glintPath() {
  const { cx, cy, glintA: a, glintH: h } = CFG;
  return `M${f(cx - a)} ${f(cy)}Q${f(cx)} ${f(cy - 2 * h)} ${f(cx + a)} ${f(cy)}` +
    `Q${f(cx)} ${f(cy + 2 * h)} ${f(cx - a)} ${f(cy)}Z`;
}
const GLINT_XF = () => `rotate(${SEAM} ${f(CFG.cx)} ${f(CFG.cy)})`;

/* 梦面：每环各退一点，方向各不相同（沿 14° 反向 / 垂直于它 / 再沿 14° 反向） */
const DREAM_SHIFT = [
  [0.16, 194],
  [0.34, 284],
  [0.58, 194],
];

function ringPaths(mode) {
  const out = [];
  for (const ring of RINGS) {
    let dx = 0, dy = 0;
    if (mode === 'dream') {
      const [d, deg] = DREAM_SHIFT[ring.k - 1];
      dx = d * Math.cos(deg * RAD);
      dy = d * Math.sin(deg * RAD);
    }
    for (let [a1, a2] of ring.arcs) {
      let r = ring.r, o = ring.op;
      if (mode === 'dream' && ring.k === CFG.n) {
        r += 0.5;            // 最外环外推
        o *= 0.72;           // 再淡一层
        if (a2 - a1 < 70) {  // 最短那一段再断开、转开
          const mid = (a1 + a2) / 2;
          a1 = mid + 7;
          a2 = mid + (a2 - mid) + 4;
          o *= 0.55;
        }
      }
      out.push(
        `<path class="rg" d="${arcPath(CFG.cx + dx, CFG.cy + dy, r, a1, a2)}"` +
        ` fill="none" stroke="${mode === 'dream' ? 'url(#rg-lt-d)' : 'url(#rg-lt-w)'}"` +
        ` stroke-width="${f(ring.w)}" stroke-linecap="butt" opacity="${f(o)}"/>`
      );
    }
  }
  return out.join('\n');
}

/* 光：沿 14° 轴的线性衰减 */
function lightDefs(mode) {
  const c = mode === 'dream' ? '#b8abdb' : 'currentColor';
  const id = mode === 'dream' ? 'rg-lt-d' : 'rg-lt-w';
  const L = 26;
  const [x1, y1] = pt(SEAM + 180, L, L, CFG.cx, CFG.cy);
  const [x2, y2] = pt(SEAM, L, L, CFG.cx, CFG.cy);
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}">` +
    `<stop offset="0" stop-color="${c}" stop-opacity="${CFG.lightB}"/>` +
    `<stop offset="1" stop-color="${c}" stop-opacity="${CFG.lightA}"/>` +
    `</linearGradient>`;
}

const BLOOM =
  `<radialGradient id="rg-bloom" gradientUnits="userSpaceOnUse"` +
  ` cx="${f(CFG.cx)}" cy="${f(CFG.cy)}" r="9.2">` +
  `<stop offset="0" stop-color="#d8cff0" stop-opacity=".70"/>` +
  `<stop offset=".38" stop-color="#a195c1" stop-opacity=".26"/>` +
  `<stop offset="1" stop-color="#9a86c4" stop-opacity="0"/>` +
  `</radialGradient>`;

const WAKE_BODY =
  `<defs>${lightDefs('wake')}</defs>\n` +
  `${ringPaths('wake')}\n` +
  `<path class="gl" d="${glintPath()}" fill="currentColor" transform="${GLINT_XF()}"/>`;

const DREAM_BODY =
  `<defs>${lightDefs('dream')}${BLOOM}</defs>\n` +
  `<circle cx="${f(CFG.cx)}" cy="${f(CFG.cy)}" r="9.2" fill="url(#rg-bloom)"/>\n` +
  `${ringPaths('dream')}\n` +
  `<path class="gl" d="${glintPath()}" fill="#efeafb" transform="${GLINT_XF()}"/>`;

/* 成品：单枚。醒面几何；暗色浏览器主题下自己翻成薄暮（换的是渐变引用，不是改描边色） */
const STANDALONE_WAKE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="水面的圆">
<title>水面的圆</title>
<style>
.rg{stroke:url(#rg-lt-w)}.gl{fill:currentColor}
@media (prefers-color-scheme:dark){.rg{stroke:url(#rg-lt-d)}.gl{fill:#efeafb}}
</style>
<defs>${lightDefs('wake')}${lightDefs('dream')}</defs>
${ringPaths('wake')}
<path class="gl" d="${glintPath()}" transform="${GLINT_XF()}"/>
</svg>
`;

const STANDALONE_DREAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="水面的圆 · 梦面">
<title>水面的圆 · 梦面</title>
<style>.rg{stroke:url(#rg-lt-d)}.gl{fill:#efeafb}</style>
<defs>${lightDefs('dream')}${BLOOM}</defs>
<circle cx="${f(CFG.cx)}" cy="${f(CFG.cy)}" r="9.2" fill="url(#rg-bloom)"/>
${ringPaths('dream')}
<path class="gl" d="${glintPath()}" transform="${GLINT_XF()}"/>
</svg>
`;

fs.writeFileSync(path.join(DIR, 'favicon.svg'), STANDALONE_WAKE);
fs.writeFileSync(path.join(DIR, 'favicon-dream.svg'), STANDALONE_DREAM);

/* ── 页面 ────────────────────────────────────────────────── */
const sprite =
  `<svg width="0" height="0" style="position:absolute;left:-9999px" aria-hidden="true"><defs>\n` +
  `<symbol id="ripple-wake" viewBox="0 0 32 32">\n${WAKE_BODY}\n</symbol>\n` +
  `<symbol id="ripple-dream" viewBox="0 0 32 32">\n${DREAM_BODY}\n</symbol>\n` +
  `</defs></svg>`;

const pct = (v) => ((v / 32) * 100).toFixed(2) + '%';
const circles = RINGS.map((o) =>
  `<i class="dc" style="left:${pct(CFG.cx - o.r)};top:${pct(CFG.cy - o.r)};width:${pct(2 * o.r)};height:${pct(2 * o.r)}"></i>`
).join('\n');

const labels = RINGS.map((o) => {
  const ang = 232 + o.k * 22;
  const [x, y] = pt(ang, (o.r + 1.6) * CFG.ex, (o.r + 1.6) * CFG.ey, CFG.cx, CFG.cy);
  return `<b class="dl" style="left:${pct(x)};top:${pct(y)}">r${o.k} · ${o.r.toFixed(2)}</b>`;
}).join('\n');

const diag =
  `<div class="diagbox">
  <i class="daxis"></i>
  ${circles}
  <svg class="ico diagico" viewBox="0 0 32 32" style="color:#232830"><use href="#ripple-wake"/></svg>
  ${labels}
</div>`;

const table = RINGS.map((o) => {
  const g = o.gaps.map((x) => `${x.w.toFixed(0)}°@${x.c}°`).join(' ');
  return `<tr><td>r${o.k}</td><td>${o.r.toFixed(2)}</td><td>${o.w.toFixed(2)}</td><td>${o.op.toFixed(2)}</td><td>${o.gaps.length}</td><td>${g}</td></tr>`;
}).join('\n');

const tpl = fs.readFileSync(path.join(DIR, 'page.template.html'), 'utf8');
fs.writeFileSync(
  path.join(DIR, 'index.html'),
  tpl.split('%%SPRITE%%').join(sprite).split('%%DIAG%%').join(diag).split('%%TABLE%%').join(table)
);

/* ── 自检 ───────────────────────────────────────────────── */
function bbox(mode) {
  let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
  for (const ring of RINGS) {
    let dx = 0, dy = 0;
    if (mode === 'dream') {
      const [d, deg] = DREAM_SHIFT[ring.k - 1];
      dx = d * Math.cos(deg * RAD); dy = d * Math.sin(deg * RAD);
    }
    for (const [a1, a2] of ring.arcs) {
      let r = ring.r;
      if (mode === 'dream' && ring.k === CFG.n) r += 0.5;
      for (let t = a1; t <= a2; t += 0.5) {
        const [x, y] = pt(t, r * CFG.ex, r * CFG.ey, CFG.cx + dx, CFG.cy + dy);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  const pad = CFG.w0 / 2;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad].map((v) => v.toFixed(2)).join(' / ');
}

console.log('环：' + RINGS.map((o) => `r${o.k}=${o.r.toFixed(2)} w=${o.w.toFixed(2)} o=${o.op.toFixed(2)} gaps=${o.gaps.length}`).join('  '));
console.log('圆心 ' + CFG.cx.toFixed(3) + ', ' + CFG.cy.toFixed(3));
console.log('包围盒 醒 = ' + bbox('wake'));
console.log('包围盒 梦 = ' + bbox('dream'));
console.log('写入 favicon.svg / favicon-dream.svg / index.html');
