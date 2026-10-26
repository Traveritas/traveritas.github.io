/* 一次性候选对比（跑完删）。 node _try.cjs */
const fs = require('fs');
const path = require('path');
const RAD = Math.PI / 180, SEAM = 14;

function build(cfg) {
  const {
    r0, g0, gr, n, w0, wExp, oExp, off,
    flat, flatten, drift,
    gapBase, gapSpread, gapsPerRing,   // gapsPerRing = [1,1,3]
    frag,        // 外环碎成几段（覆盖 gapsPerRing 的最后一环）
    core, coreR,
  } = cfg;
  const cx = 16 + off * Math.cos(SEAM * RAD);
  const cy = 16 + off * Math.sin(SEAM * RAD) - drift * (n - 1) / 2;
  const f = (x) => Math.round(x * 1000) / 1000;
  const rad = (k) => { let r = r0; for (let i = 1; i < k; i++) r += g0 * Math.pow(gr, i - 1); return r; };
  const wid = (k) => w0 * Math.pow(r0 / rad(k), wExp);
  const opa = (k) => Math.pow(r0 / rad(k), oExp);
  const out = [];
  const pt = (th, rx, ry, ox, oy) => [ox + rx * Math.cos(th * RAD), oy + ry * Math.sin(th * RAD)];

  for (let k = 1; k <= n; k++) {
    const r = rad(k);
    const rx = r, ry = r * (flat - flatten * (k - 1));
    const ox = cx, oy = cy + drift * (k - 1);
    let cnt = gapsPerRing[k - 1];
    if (k === n && frag) cnt = frag;
    const gw = 360 / cnt * (cnt === 1 ? 0.14 : cnt === 2 ? 0.16 : 0.30);
    const g = [];
    for (let j = 0; j < cnt; j++) g.push({ c: (gapBase + j * gapSpread + (k - 1) * 53) % 360, w: gw });
    g.sort((a, b) => a.c - b.c);
    const segs = [];
    for (let i = 0; i < g.length; i++) {
      const a = g[i].c + g[i].w / 2;
      let b = g[(i + 1) % g.length].c - g[(i + 1) % g.length].w / 2;
      if (i === g.length - 1) b += 360;
      segs.push([a, b]);
    }
    for (const [a1, a2] of segs) {
      const [x1, y1] = pt(a1, rx, ry, ox, oy), [x2, y2] = pt(a2, rx, ry, ox, oy);
      const d = a2 - a1 >= 359.9
        ? `M${f(ox - rx)} ${f(oy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(ox + rx)} ${f(oy)}A${f(rx)} ${f(ry)} 0 1 1 ${f(ox - rx)} ${f(oy)}`
        : `M${f(x1)} ${f(y1)}A${f(rx)} ${f(ry)} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
      out.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${f(wid(k))}" opacity="${f(opa(k))}"/>`);
    }
  }
  const gy = cy;
  if (core === 'dot') out.push(`<circle cx="${f(cx)}" cy="${f(gy)}" r="${coreR}" fill="currentColor"/>`);
  if (core === 'dash') out.push(`<path d="M${f(cx - coreR)} ${f(gy)}Q${f(cx)} ${f(gy - coreR * 0.62)} ${f(cx + coreR)} ${f(gy)}Q${f(cx)} ${f(gy + coreR * 0.62)} ${f(cx - coreR)} ${f(gy)}Z" fill="currentColor"/>`);
  return out.join('\n');
}

const base = { r0: 4.4, g0: 3.5, gr: 1.16, n: 3, w0: 2.35, wExp: 0.45, oExp: 0.72, off: 0.7, flat: 0.9, flatten: 0.025, drift: 1.05, gapBase: 202, gapSpread: 121, gapsPerRing: [1, 1, 1] };

const V = {
  'k': { ...base, core: 'dot', coreR: 1.05 },
  'l': { ...base, core: 'dash', coreR: 1.5 },
  'm': { ...base, core: 'none' },
  'n': { ...base, core: 'dash', coreR: 1.3, frag: 3 },
  'o': { ...base, core: 'none', frag: 3 },
  'p': { ...base, core: 'dot', coreR: 1.05, frag: 3 },
  'q': { ...base, core: 'dash', coreR: 1.4, frag: 4 },
  'r': { ...base, core: 'dash', coreR: 1.4, frag: 3, gapsPerRing: [1, 2, 1] },
  // 16px 粗版（2 环 + 外环碎 3 段）
  's16': { r0: 4.6, g0: 5.6, gr: 1.0, n: 2, w0: 3.0, wExp: 0.35, oExp: 0.6, off: 0.7, flat: 0.9, flatten: 0.04, drift: 1.0, gapBase: 202, gapSpread: 130, gapsPerRing: [1, 1], frag: 3, core: 'dash', coreR: 1.8 },
  't16': { r0: 4.4, g0: 6.0, gr: 1.0, n: 2, w0: 2.8, wExp: 0.35, oExp: 0.6, off: 0.7, flat: 0.9, flatten: 0.04, drift: 1.0, gapBase: 202, gapSpread: 130, gapsPerRing: [1, 1], frag: 3, core: 'dot', coreR: 1.5 },
};

const cards = Object.entries(V).map(([k, v]) => {
  const b = build(v);
  const dark = b.replace(/currentColor/g, '#e2e9f2');
  return `<div class="card">
  <div class="row">
    <div class="pl l"><svg viewBox="0 0 32 32" style="color:#232830">${b}</svg></div>
    <div class="pl d"><svg viewBox="0 0 32 32" style="color:#e2e9f2">${b}</svg></div>
  </div>
  <div class="row tiny">
    <span class="chip"><canvas width="16" height="16" data-bg="#0c0f18" data-svg="${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16">${dark}</svg>`)}"></canvas></span>
    <span class="chip"><canvas width="16" height="16" data-bg="#f0f3f6" data-svg="${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16">${b}</svg>`)}"></canvas></span>
    <span class="chip"><canvas width="24" height="24" data-bg="#0c0f18" data-svg="${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24">${dark}</svg>`)}"></canvas></span>
    <span class="chip"><canvas width="32" height="32" data-bg="#f0f3f6" data-svg="${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">${b}</svg>`)}"></canvas></span>
  </div>
  <b>${k}</b>
</div>`;
}).join('\n');

fs.writeFileSync(path.join(__dirname, '_try.html'), `<!doctype html><meta charset="utf-8">
<style>
body{background:#f0f3f6;font-family:system-ui;margin:0;padding:16px;display:flex;gap:14px;flex-wrap:wrap}
.card{border:1px solid #ccc;padding:9px;border-radius:4px;background:#fff}
.row{display:flex;gap:7px;align-items:center}
.pl{width:146px;height:146px;display:grid;place-items:center;border-radius:3px}
.pl svg{width:120px;height:120px}
.l{background:#f0f3f6}.d{background:#0c0f18}
.tiny{margin-top:7px;gap:8px}
.chip{display:inline-grid;place-items:center;line-height:0}
canvas{width:56px;height:56px;image-rendering:pixelated}
b{font:11px monospace;color:#666}
</style>${cards}
<script>
document.querySelectorAll('canvas').forEach(function(c){
  var img=new Image(); img.onload=function(){var x=c.getContext('2d');c.style.background=c.dataset.bg;x.imageSmoothingEnabled=false;x.drawImage(img,0,0,c.width,c.height);}; img.src='data:image/svg+xml;charset=utf-8,'+c.dataset.svg;
});
</script>`);
console.log('ok');
