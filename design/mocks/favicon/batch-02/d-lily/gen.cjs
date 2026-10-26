/* ─────────────────────────────────────────────────────────────
   花 · d-lily —— 几何生成器
   用法： node gen.cjs
   产出： favicon.svg（独立成品） + index.html（自包含单页，几何已内联）

   为什么用生成器：这朵花的「抖」不是手摆的，是一条可复述的规则——
   五个花瓣的角位移 / 长度 / 偏斜各自是三条采样正弦。规则在，但眼睛
   读不出是哪条，正是「似乎有某种规则，只是暂时无法理解」。
   改一个系数，全组重排。数字全部由这里算，不手抄。
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const CX = 16, CY = 16;
const R0 = 2.6;            // 花瓣根部半径
const L0 = 9.6;            // 基准瓣长
const W0 = 4.35;           // 基准瓣宽
const BW0 = 3.7;           // 瓣根弦宽（>相邻根部弧距，故五瓣在花心处互叠成实心）

const r2 = (n) => Math.round(n * 100) / 100;

/* 三条采样正弦 —— 这就是「规则」 */
const jit = (k) => 4.6 * Math.sin(1.9 * k + 1.15) + 1.7 * Math.cos(3.3 * k); // 角位移 ±6°
const lenM = (k) => 1 + 0.14 * Math.sin(1.7 * k + 0.8);                       // 瓣长 ±14%
const biasF = (k) => 0.13 * Math.sin(1.25 * k + 2.3);                         // 左右不对称 ±13%

const angleOf = (k) => 72 * k + jit(k);          // 0 = 上，顺时针
const lenOf = (k, m) => L0 * lenM(k) * (m || 1);
const widOf = (k, m) => W0 * Math.pow(lenM(k), 0.35) * (m || 1);

/* 单瓣轮廓：平瓣根 + 宽肩 + 尖梢，左右按 bias 各自偏斜 */
function petalPath(k, o) {
  const L = lenOf(k, o.lenM);
  const W = widOf(k, o.widM);
  const BW = BW0 * (o.baseM || 1) * (o.widM || 1) * 0.97;
  const bias = biasF(k);
  const b = CY - (o.r0 === undefined ? R0 : o.r0);
  const hwL = (W / 2) * (1 + bias * 0.85);
  const hwR = (W / 2) * (1 - bias * 0.85);
  const tipx = CX + W * bias * 0.55;
  const bl = CX - BW / 2 + bias * BW * 0.35;
  const br = CX + BW / 2 + bias * BW * 0.35;
  const P = (x, y) => r2(x) + ' ' + r2(y);
  return [
    'M' + P(bl, b),
    'C' + P(CX - hwL * 0.99, b - L * 0.17) + ' ' + P(CX - hwL, b - L * 0.38) + ' ' + P(CX - hwL, b - L * 0.58),
    'C' + P(CX - hwL, b - L * 0.80) + ' ' + P(CX - hwL * 0.30, b - L * 0.94) + ' ' + P(tipx, b - L),
    'C' + P(CX + hwR * 0.30, b - L * 0.94) + ' ' + P(CX + hwR, b - L * 0.80) + ' ' + P(CX + hwR, b - L * 0.58),
    'C' + P(CX + hwR, b - L * 0.38) + ' ' + P(CX + hwR * 0.99, b - L * 0.17) + ' ' + P(br, b),
    'Z',
  ].join(' ');
}

/* 瓣中脊：细梭形（作为遮罩里的「洞」，即磨砂瓣上的一道折痕） */
function veinPath(k, o) {
  const L = lenOf(k, o.lenM);
  const W = widOf(k, o.widM);
  const bias = biasF(k);
  const b = CY - (o.r0 === undefined ? R0 : o.r0);
  const by = b - L * 0.11;
  const ey = b - L * 0.79;
  const bx = CX + W * bias * 0.18;
  const ex = CX + W * bias * 0.80;
  const bw = 0.75;
  const dy = by - ey;
  const P = (x, y) => r2(x) + ' ' + r2(y);
  return [
    'M' + P(bx, by),
    'C' + P(bx - bw, by - dy * 0.28) + ' ' + P(ex - bw * 0.30, ey + dy * 0.20) + ' ' + P(ex, ey),
    'C' + P(ex + bw * 0.30, ey + dy * 0.20) + ' ' + P(bx + bw, by - dy * 0.28) + ' ' + P(bx, by),
    'Z',
  ].join(' ');
}

/* 内层三瓣：落在五个外层瓣的空档中点上（间距天然不均） */
const WHORL = [
  { a: (angleOf(0) + angleOf(1)) / 2 + 2.5, len: 4.7, wid: 2.6, bias: 0.10 },
  { a: (angleOf(2) + angleOf(3)) / 2 - 3.5, len: 5.0, wid: 2.75, bias: -0.12 },
  { a: (angleOf(4) + angleOf(0) + 360) / 2 + 4.0 - 360, len: 4.5, wid: 2.5, bias: 0.08 },
];

function whorlPath(p) {
  const b = CY - (R0 - 0.35);
  const L = p.len, W = p.wid, hwL = (W / 2) * (1 + p.bias * 0.8), hwR = (W / 2) * (1 - p.bias * 0.8);
  const tipx = CX + W * p.bias * 0.5;
  const bl = CX - W * 0.42 + p.bias * W * 0.3;
  const br = CX + W * 0.42 + p.bias * W * 0.3;
  const P = (x, y) => r2(x) + ' ' + r2(y);
  return [
    'M' + P(bl, b),
    'C' + P(CX - hwL, b - L * 0.22) + ' ' + P(CX - hwL, b - L * 0.42) + ' ' + P(CX - hwL, b - L * 0.60),
    'C' + P(CX - hwL, b - L * 0.82) + ' ' + P(CX - hwL * 0.28, b - L * 0.94) + ' ' + P(tipx, b - L),
    'C' + P(CX + hwR * 0.28, b - L * 0.94) + ' ' + P(CX + hwR, b - L * 0.82) + ' ' + P(CX + hwR, b - L * 0.60),
    'C' + P(CX + hwR, b - L * 0.42) + ' ' + P(CX + hwR, b - L * 0.22) + ' ' + P(br, b),
    'Z',
  ].join(' ');
}

/* ── 四种形态 ─────────────────────────────────────────────────
   wake  : 醒 · 纸面刻出来的冷灰花
   dream : 梦 · 磨砂瓣，边缘化开，花心一点薄暮光，第三瓣正在离开
   mono  : 单墨退让
   hard  : 16px 用的「硬花」——瓣短而阔、花心孔加大、去内层、去中脊
   注意：ink 写 '@grad' 时，落到本形态自己 defs 里的 <radialGradient id="{key}-grad">
   （不要手写死 id —— 之前写死 url(#gD) 而 defs 里叫 k-dream-grad，引用悬空，
   整层花瓣在浏览器里直接不画，只剩花心那点光）。 */
const P6 = { lenM: 0.94, widM: 1.18, baseM: 1.2, r0: 2.5, aperture: 2.5, whorl: 0, veins: false, leave: 0 };

const MODES = {
  wake:  { id: 'm-wake',  ink: '#2b323c', whorlOp: 0.42, aperture: 2.30, whorl: 1, veins: true,  leave: 0,    glow: false },
  dream: { id: 'm-dream', ink: '@grad', whorlOp: 0.50, aperture: 2.30, whorl: 1, veins: true,  leave: 2.15, glow: true },
  mono:  { id: 'm-mono',  ink: 'currentColor', whorlOp: 0.42, aperture: 2.30, whorl: 1, veins: true, leave: 0,  glow: false },
  hard:  { id: 'm-hard',  ink: '#2b323c', whorlOp: 0,    aperture: 2.50, whorl: 0, veins: false, leave: 0,    glow: false, p: P6 },
  /* 16px 的梦面：同一套「硬花」几何，但保留磨砂材质与花心那点光。
     站点标签栏默认给梦面，所以 16px 的梦面必须有自己的一版，不能只拿默认花缩小。 */
  harddream: { id: 'm-harddream', ink: '@grad', whorlOp: 0, aperture: 2.50, whorl: 0, veins: false, leave: 0, glow: true, p: P6 },
};

function slotTr(k, mode) {
  const a = angleOf(k);
  const o = mode.p || {};
  const tw = k === 2 ? (mode.leave ? 5.5 : 1.5) : (k === 4 ? -2.2 : 0);
  let tr = '';
  if (mode.leave && k === 2) {
    const rad = (a * Math.PI) / 180;
    tr += 'translate(' + r2(Math.sin(rad) * mode.leave) + ' ' + r2(-Math.cos(rad) * mode.leave) + ') ';
  }
  tr += 'rotate(' + r2(a) + ' ' + CX + ' ' + CY + ')';
  return { outer: tr, inner: 'rotate(' + r2(tw) + ' ' + CX + ' ' + r2(CY - (o.r0 === undefined ? R0 : o.r0)) + ')' };
}

/* 生成一个 <g> 形态（含自己的 defs） */
function buildShape(mode, key) {
  const o = mode.p || {};
  const maskId = key + '-mask';
  const gradId = key + '-grad';
  const glowId = key + '-glow';
  const ink = mode.ink === '@grad' ? 'url(#' + gradId + ')' : mode.ink;

  let petals = '';
  let whorls = '';
  let veins = '';

  for (let k = 0; k < 5; k++) {
    const tr = slotTr(k, mode);
    const p = petalPath(k, o);
    petals += '<g transform="' + tr.outer + '"><g transform="' + tr.inner + '"><path d="' + p + '"/></g></g>';
    if (mode.veins) veins += '<g transform="' + tr.outer + '"><g transform="' + tr.inner + '"><path d="' + veinPath(k, o) + '"/></g></g>';
  }
  if (mode.whorl) {
    WHORL.forEach((w, i) => {
      const tw = i === 1 ? 3 : -2;
      whorls +=
        '<g transform="rotate(' + r2(w.a) + ' ' + CX + ' ' + CY + ')"><g transform="rotate(' + tw + ' ' + CX + ' ' + r2(CY - R0 + 0.35) + ')">' +
        '<path d="' + whorlPath(w) + '"/></g></g>';
    });
  }

  const defs = [
    '<defs>',
    '<mask id="' + maskId + '" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">',
    '<rect x="0" y="0" width="32" height="32" fill="#fff"/>',
    '<circle cx="16" cy="16" r="' + r2(o.aperture === undefined ? mode.aperture : o.aperture) + '" fill="#000"/>',
    veins.replace(/<path /g, '<path fill="#000" '),
    '</mask>',
  ];
  if (mode.glow) {
    defs.push(
      '<radialGradient id="' + gradId + '" gradientUnits="userSpaceOnUse" cx="16" cy="16" r="14.2">',
      '<stop offset="0.06" stop-color="#b9aede" stop-opacity="0.66"/>',
      '<stop offset="0.46" stop-color="#9a86c4" stop-opacity="0.34"/>',
      '<stop offset="0.86" stop-color="#7d6fae" stop-opacity="0.13"/>',
      '<stop offset="1" stop-color="#6f61a0" stop-opacity="0.05"/>',
      '</radialGradient>',
      '<radialGradient id="' + glowId + '" gradientUnits="userSpaceOnUse" cx="16" cy="16" r="6.4">',
      '<stop offset="0" stop-color="#d8cff0" stop-opacity="0.95"/>',
      '<stop offset="0.38" stop-color="#a195c1" stop-opacity="0.42"/>',
      '<stop offset="1" stop-color="#a195c1" stop-opacity="0"/>',
      '</radialGradient>'
    );
  }
  defs.push('</defs>');

  let out = defs.join('');
  out += '<g class="fl">';
  out += '<g class="petals" mask="url(#' + maskId + ')">';
  if (whorls) out += '<g class="whorl" fill="' + ink + '" fill-opacity="' + mode.whorlOp + '">' + whorls + '</g>';
  out += '<g class="ring" fill="' + ink + '">' + petals + '</g>';
  out += '</g>';
  if (mode.glow) {
    out += '<circle cx="16" cy="16" r="6.4" fill="url(#' + glowId + ')"/>';
    out += '<circle cx="16" cy="16" r="1.0" fill="#efeafb" opacity="0.92"/>';
  }
  out += '</g>';
  return out;
}

/* ── 页面用：把五种形态塞进一个隐藏 svg 的 defs，之后到处 <use> ── */
const KEYS = { wake: 'wake', dream: 'dream', mono: 'mono', hard: 'hard', harddream: 'harddream' };
let defsMarkup = '';
Object.keys(KEYS).forEach((name) => {
  defsMarkup += '<g id="m-' + name + '">' + buildShape(MODES[name], 'k-' + name) + '</g>';
});

const icon = (name, px) =>
  '<svg class="ic" viewBox="0 0 32 32" width="' + px + '" height="' + px + '" aria-hidden="true"><use href="#m-' + name + '"/></svg>';

/* ── 独立成品 favicon.svg ───────────────────────────────────
   单墨（currentColor）可退；并自带 prefers-color-scheme 暗色适配：
   暗色浏览器主题下自动翻成冷白薄暮紫，并在花心点亮——同一枚，不用换文件。 */
function buildFavicon() {
  const m = MODES.wake;
  const o = {};
  const maskId = 'fl-mask';
  const glowId = 'fl-glow';
  let petals = '', veins = '';
  for (let k = 0; k < 5; k++) {
    const tr = slotTr(k, m);
    petals += '<g transform="' + tr.outer + '"><g transform="' + tr.inner + '"><path d="' + petalPath(k, o) + '"/></g></g>';
    veins += '<g transform="' + tr.outer + '"><g transform="' + tr.inner + '"><path fill="#000" d="' + veinPath(k, o) + '"/></g></g>';
  }
  let whorls = '';
  WHORL.forEach((w, i) => {
    whorls +=
      '<g transform="rotate(' + r2(w.a) + ' 16 16)"><g transform="rotate(' + (i === 1 ? 3 : -2) + ' 16 ' + r2(CY - R0 + 0.35) + ')">' +
      '<path d="' + whorlPath(w) + '"/></g></g>';
  });
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="花">',
    '<title>花</title>',
    '<style>',
    '  .ink{fill:currentColor}',
    '  .whorl{fill:currentColor;fill-opacity:.42}',
    '  .glow,.eye{opacity:0}',
    '  @media (prefers-color-scheme:dark){',
    '    .ink{fill:#cdc6e6}',
    '    .whorl{fill:#a195c1;fill-opacity:.34}',
    '    .glow,.eye{opacity:1}',
    '  }',
    '</style>',
    '<defs>',
    '<mask id="' + maskId + '" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">',
    '<rect x="0" y="0" width="32" height="32" fill="#fff"/>',
    '<circle cx="16" cy="16" r="2.3" fill="#000"/>',
    veins,
    '</mask>',
    '<radialGradient id="' + glowId + '" gradientUnits="userSpaceOnUse" cx="16" cy="16" r="6.4">',
    '<stop offset="0" stop-color="#d8cff0" stop-opacity=".95"/>',
    '<stop offset="0.38" stop-color="#a195c1" stop-opacity=".40"/>',
    '<stop offset="1" stop-color="#a195c1" stop-opacity="0"/>',
    '</radialGradient>',
    '</defs>',
    '<g mask="url(#' + maskId + ')">',
    '<g class="whorl">' + whorls + '</g>',
    '<g class="ink">' + petals + '</g>',
    '</g>',
    '<circle class="glow" cx="16" cy="16" r="6.4" fill="url(#' + glowId + ')"/>',
    '<circle class="eye" cx="16" cy="16" r="1.0" fill="#efeafb" opacity=".92"/>',
    '</svg>',
  ].join('\n');
}

/* ── 几何注解数据（页面上列出来，供验收） ── */
const geomRows = [0, 1, 2, 3, 4]
  .map((k) => {
    const a = angleOf(k);
    const prev = k === 0 ? angleOf(4) - 360 : angleOf(k - 1);
    return { k, a: r2(a), gap: r2(a - prev), len: r2(lenOf(k, 1)), wid: r2(widOf(k, 1)), bias: r2(biasF(k)) };
  });

const html = require('./template.cjs')({ defsMarkup, icon, geomRows });

fs.writeFileSync(path.join(__dirname, 'favicon.svg'), buildFavicon());
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
console.log('✓ favicon.svg  ·  index.html');
geomRows.forEach((r) => console.log('  瓣' + (r.k + 1) + '  ' + r.a + '°  间隔 ' + r.gap + '°  长 ' + r.len + '  宽 ' + r.wid + '  偏 ' + r.bias));
