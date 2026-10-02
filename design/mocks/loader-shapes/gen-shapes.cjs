// 开屏主形状候选：六个方向，各生成一枚蒙版 SVG（viewBox -100..100，只有填充面）
const fs = require('fs'), path = require('path');
const OUT = process.argv[2];
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const R = (a, b) => a + (b - a) * rnd();
const rad = (d) => (d * Math.PI) / 180;
const P = (r, deg, cx = 0, cy = 0) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const poly = (pts) => 'M' + pts.map((p) => p.map((v) => v.toFixed(2)).join(' ')).join('L') + 'Z';
const svg = (d, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><path fill="#000" d="${d}"${extra}/></svg>\n`;
const out = {};

/* 1 · 碎晶放射：偏心原点，九枚长短悬殊的细晶片放射出去，外围几枚脱离的碎片 */
seed = 11;
{
  const ox = 0, oy = 0; // 原点居中：开屏的星与放射中心重合
  let d = '';
  for (let i = 0; i < 9; i++) {
    const a = i * 40 + R(-14, 14) - 80;
    const L = [96, 58, 82, 44, 90, 66, 52, 78, 40][i];
    const w = R(6, 13);
    const r0 = R(3, 12);
    const tipA = a + R(-4, 4);
    d += poly([P(r0, a, ox, oy), P(r0 + L * 0.32, a - w, ox, oy), P(L, tipA, ox, oy), P(r0 + L * 0.28, a + w * R(0.5, 0.9), ox, oy)]);
  }
  for (let i = 0; i < 5; i++) {
    const a = R(0, 360), r = R(66, 88), s = R(4, 9), t = R(0, 360);
    const [cx, cy] = P(r, a, ox, oy);
    d += poly([P(s, t, cx, cy), P(s * 0.6, t + 130, cx, cy), P(s, t + 230, cx, cy)]);
  }
  out['s1-shard-burst'] = svg(d);
}

/* 2 · 十四度切片：八条长短厚薄不一的带子沿 14° 叠成一块菱状剪影（八阶） */
seed = 23;
{
  let d = '';
  const th = [7, 11, 15, 18, 16, 12, 9, 6];
  let y = -62;
  for (let i = 0; i < 8; i++) {
    const h = th[i], len = 70 + Math.sin(((i + 0.5) / 8) * Math.PI) * 95 + R(-12, 12);
    const x0 = -len / 2 + R(-14, 14);
    const c = Math.cos(rad(14)), s = Math.sin(rad(14));
    const rot = ([x, yy]) => [x * c - yy * s, x * s + yy * c];
    d += poly([[x0, y], [x0 + len, y], [x0 + len, y + h], [x0, y + h]].map(rot));
    y += h + R(3.5, 6.5);
  }
  out['s2-seam-strata'] = svg(d);
}

/* 3 · 光圈：七枚叶片绕一个偏转的七边形空洞，叶片外缘长短不齐（光学 / 显影） */
seed = 37;
{
  let d = '';
  const n = 7, hole = 26;
  for (let i = 0; i < n; i++) {
    const a = (i * 360) / n - 90, span = 360 / n;
    const ro = R(72, 96);
    d += poly([P(hole, a + 2), P(ro, a + 34), P(ro * R(0.86, 1), a + 34 + span - 6), P(hole, a + span - 1)]);
  }
  out['s3-aperture'] = svg(d);
}

/* 4 · 树脂滴：一团不规则的流体轮廓 + 三颗卫星液滴（与树脂纹理同源，「融化」） */
seed = 41;
{
  const harm = [2, 3, 5, 7].map((k) => [k, R(0, Math.PI * 2), R(3, 11) / Math.sqrt(k)]);
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const t = (i / 180) * Math.PI * 2;
    let r = 58;
    for (const [k, ph, amp] of harm) r += amp * Math.sin(k * t + ph) * 1.6;
    pts.push([r * Math.cos(t) * 1.08, r * Math.sin(t) * 0.92]);
  }
  let d = poly(pts);
  for (const [cx, cy, rr] of [[70, -52, 9], [84, -70, 4.5], [-74, 58, 6]]) {
    d += `M${cx - rr} ${cy}a${rr} ${rr} 0 1 1 ${2 * rr} 0a${rr} ${rr} 0 1 1 ${-2 * rr} 0Z`;
  }
  out['s4-resin-drop'] = svg(d);
}

/* 5 · 蚀月：大圆被另一圆咬去成月牙，再被一道 14° 的缝切成两半、稍稍错开 */
{
  const A = [0, 0, 82], B = [34, -14, 70];
  // 两圆交点
  const [x1, y1, r1] = A, [x2, y2, r2] = B;
  const dd = Math.hypot(x2 - x1, y2 - y1);
  const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd), h = Math.sqrt(r1 * r1 - a * a);
  const mx = x1 + (a * (x2 - x1)) / dd, my = y1 + (a * (y2 - y1)) / dd;
  const p1 = [mx + (h * (y2 - y1)) / dd, my - (h * (x2 - x1)) / dd];
  const p2 = [mx - (h * (y2 - y1)) / dd, my + (h * (x2 - x1)) / dd];
  const f = (p) => p.map((v) => v.toFixed(2)).join(' ');
  const crescent = `M${f(p1)}A${r1} ${r1} 0 1 0 ${f(p2)}A${r2} ${r2} 0 0 1 ${f(p1)}Z`;
  // 用 clipPath 把月牙沿 14° 切两半，下半错开
  const c = Math.cos(rad(14)), s = Math.sin(rad(14));
  const up = poly([[-200, -200], [200, -200], [200, 200 * s / c - 3], [-200, -200 * s / c - 3]]);
  const dn = poly([[-200, -200 * s / c + 3], [200, 200 * s / c + 3], [200, 200], [-200, 200]]);
  out['s5-eclipse'] =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><defs><clipPath id="u"><path d="${up}"/></clipPath><clipPath id="d"><path d="${dn}"/></clipPath></defs>` +
    `<path fill="#000" clip-path="url(#u)" d="${crescent}"/><g transform="translate(9 2.2)"><path fill="#000" clip-path="url(#d)" d="${crescent}"/></g>` +
    `<circle cx="58" cy="-58" r="5"/><circle cx="72" cy="-34" r="2.6"/></svg>\n`;
}

/* 6 · 星团：十几枚大小悬殊的三角与菱片，越近中心越密越大，像定格的一瞬迸散 */
seed = 59;
{
  let d = '';
  d += poly([P(30, -100), P(16, 20), P(34, 150)]);
  for (let i = 0; i < 16; i++) {
    const a = R(0, 360), r = Math.pow(R(0, 1), 0.8) * 88 + 8;
    const s = Math.max(4, 26 - r * 0.22) * R(0.6, 1.2), t = R(0, 360);
    const [cx, cy] = P(r, a);
    d += i % 3 === 0
      ? poly([P(s, t, cx, cy), P(s * 0.45, t + 90, cx, cy), P(s, t + 180, cx, cy), P(s * 0.45, t + 270, cx, cy)])
      : poly([P(s, t, cx, cy), P(s * 0.7, t + 125, cx, cy), P(s * 0.9, t + 235, cx, cy)]);
  }
  out['s6-scatter'] = svg(d);
}

for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(OUT, k + '.svg'), v);

/* 预览页：每个形状按开屏的「错版」那一帧叠三层（冷灰偏左上 / 树脂居中 / 斜线偏右下）+ 灰圆面 */
const cells = Object.keys(out).map((k, i) => `
<figure><div class="st">
  <i class="disc"></i><i class="ring"></i><i class="tick"></i>
  <i class="l solid" style="--m:url(${k}.svg)"></i>
  <i class="l resin" style="--m:url(${k}.svg)"></i>
  <i class="l hatch" style="--m:url(${k}.svg)"></i>
</div><figcaption>${i + 1} · ${['碎晶放射', '十四度切片', '光圈', '树脂滴', '蚀月', '星团'][i]}</figcaption></figure>`).join('');
fs.writeFileSync(path.join(OUT, 'shapes.html'), `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#ebe7e2;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:24px;font:13px/1.4 "Noto Serif SC",serif;color:#55565c}
figure{margin:0;display:flex;flex-direction:column;align-items:center}
.st{position:relative;width:340px;height:340px}
.st i{position:absolute;inset:0;display:block}
.disc{inset:3%!important;border-radius:50%;background:radial-gradient(circle at 38% 34%,#e3e5e7,#d3d7db 72%)}
.ring{inset:-8%!important;border-radius:50%;background:rgba(43,44,49,.24);-webkit-mask:radial-gradient(circle,transparent 66.4%,#000 66.6% 67%,transparent 67.2%)}
.tick{inset:-8%!important;border-radius:50%;background:repeating-conic-gradient(from -1deg,rgba(43,44,49,.6) 0 .7deg,transparent .7deg 90deg);-webkit-mask:radial-gradient(circle,transparent 64.4%,#000 64.6% 69.2%,transparent 69.4%)}
.l{-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
.solid{background:#a9b3bd;transform:translate(-18px,-4.5px) rotate(-1.2deg)}
.resin{background:url(../../../public/textures/resin.webp) 40% 50%/190% auto}
.hatch{background:repeating-linear-gradient(104deg,rgba(118,86,64,.6) 0 1px,transparent 1px 7px);mix-blend-mode:multiply;transform:translate(15px,3.8px) rotate(1.5deg)}
figcaption{margin-top:14px;letter-spacing:.12em}
</style>${cells}`);
