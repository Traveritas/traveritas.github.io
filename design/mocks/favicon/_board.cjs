/* ─────────────────────────────────────────────────────────────
   batch 对照板：把一套风格方向的成品排在一页上看。
   自动扫每个风格目录里的 favicon.svg + index.html + notes.md，不需要登记。
   用法：node design/mocks/favicon/_board.cjs [batch 目录名 = batch-01]

   每枚图标都放在自己的 <iframe srcdoc> 里渲染：
   同一个文档里内联多枚 SVG，会让它们的 id / class / <style> 互相覆盖
   （id="p"、.up{} 这类短名字几乎必然撞），对照板会显示成"别的图标的样子"。
   隔离之后每枚都按它自己文件里的样子出。
   ───────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const batch = process.argv[2] || 'batch-01';
const dir = path.join(ROOT, batch);

const slugs = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
  .map((d) => d.name)
  .filter((s) => fs.existsSync(path.join(dir, s, 'favicon.svg')))
  .sort();

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function readSvg(file) {
  let src = fs.readFileSync(file, 'utf8').trim();
  src = src.replace(/^<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '');
  return src;
}

/* 一枚图标 = 一个独立文档。ink 给 currentColor 用；文件自己写了 :root 色的，以文件为准。 */
function frame(svg, ink, bg) {
  const doc =
    `<!doctype html><meta charset="utf-8"><style>` +
    `html,body{margin:0;height:100%;background:${bg};color:${ink};overflow:hidden}` +
    `svg{display:block;width:100%;height:100%}` +
    `</style>` +
    svg;
  return `<iframe class="f" scrolling="no" srcdoc="${escAttr(doc)}"></iframe>`;
}

/* 从 notes.md 里抓第一句有内容的话当一句话说明 */
function oneLiner(slug) {
  const f = path.join(dir, slug, 'notes.md');
  if (!fs.existsSync(f)) return '';
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    if (t.length < 8) continue;
    // 跳过元信息行（slug / 日期 / 批次），那些不是风格说明
    if (/batch-\d|slug|20\d\d-\d\d-\d\d|mockup/i.test(t)) continue;
    return t.replace(/[*`]/g, '').slice(0, 150);
  }
  return '';
}

const NIGHT = '#141828';
const NIGHT_INK = '#e6e2ee';
const DAY = '#f0f3f6';
const DAY_INK = '#232830';

const cards = slugs.map((slug) => {
  const d = path.join(dir, slug);
  const svg = readSvg(path.join(d, 'favicon.svg'));
  const dreamPath = path.join(d, 'favicon-dream.svg');
  const dream = fs.existsSync(dreamPath) ? readSvg(dreamPath) : null;
  const sheet = fs.existsSync(path.join(d, 'shots', 'sheet.png')) ? 'shots/sheet.png' : null;
  // 对照板就写在 batch 目录里，所以所有相对路径都要相对这个目录算
  const rel = (p) => path.relative(dir, path.join(d, p)).replace(/\\/g, '/');

  const dreamRow = dream
    ? `<figure class="night">${frame(dream, NIGHT_INK, NIGHT)}<figcaption>128 · 梦</figcaption></figure>
       <figure class="day">${frame(dream, DAY_INK, DAY)}<figcaption>128 · 梦 · 昼</figcaption></figure>`
    : `<figure class="night"><div class="dream-missing">梦面只做在 mockup 里<br>（没有独立文件）</div><figcaption>128 · 梦</figcaption></figure>
       <figure class="day"><div class="dream-missing">梦面只做在 mockup 里<br>（没有独立文件）</div><figcaption>128 · 梦 · 昼</figcaption></figure>`;

  return `
  <section class="card">
    <header>
      <h2>${esc(slug)}</h2>
      <p class="line">${esc(oneLiner(slug))}</p>
    </header>
    <div class="stages">
      <figure class="night">${frame(svg, NIGHT_INK, NIGHT)}<figcaption>128 · 夜</figcaption></figure>
      <figure class="day">${frame(svg, DAY_INK, DAY)}<figcaption>128 · 昼</figcaption></figure>
    </div>
    <div class="stages">${dreamRow}</div>
    <div class="strip">
      <div class="tabsim light">${frame(svg, '#3c4043', '#dee1e6')}<span class="ttl">Traveritas</span><span class="x">×</span></div>
      <div class="tabsim dark">${frame(svg, '#e8eaed', '#202124')}<span class="ttl">Traveritas</span><span class="x">×</span></div>
    </div>
    <div class="pxtitle">真 16px · 放大 5 倍（按浏览器读 favicon 的方式：直接引 .svg 文件）</div>
    <div class="pxrow">
      <div class="pxtile light"><img class="px" src="${rel('favicon.svg')}" width="16" height="16" alt=""></div>
      <div class="pxtile dark"><img class="px" src="${rel('favicon.svg')}" width="16" height="16" alt=""></div>
      ${dream
        ? `<div class="pxtile light"><img class="px" src="${rel('favicon-dream.svg')}" width="16" height="16" alt=""></div>
           <div class="pxtile dark"><img class="px" src="${rel('favicon-dream.svg')}" width="16" height="16" alt=""></div>`
        : `<div class="pxtile light"><span class="na">无梦面文件</span></div><div class="pxtile dark"><span class="na">无梦面文件</span></div>`}
    </div>
    <p class="pxnote">深栏那两格发黑不是图坏了：SVG 里的换墨靠 <code>prefers-color-scheme</code>，它跟的是<b>系统主题</b>，不是标签栏深浅。这张板是在系统浅色下截的，所以深栏里仍用深墨。真上线时得用 JS 换 <code>&lt;link rel="icon"&gt;</code>。</p>
    <nav class="links">
      <a href="${rel('index.html')}">打开 mockup</a>
      ${sheet ? `<a href="${rel(sheet)}">整页截图</a>` : ''}
      <a href="${rel('notes.md')}">设计说明</a>
      <a href="${rel('favicon.svg')}">favicon.svg</a>
    </nav>
  </section>`;
});

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>标签页图标 · ${esc(batch)} 对照板</title>
<style>
  :root{ --night:#0c0f18; --day:#f0f3f6; --lav:#a195c1; --faint:#8a94a2; }
  *{box-sizing:border-box}
  body{
    margin:0;padding:44px 40px 72px;background:var(--night);color:#e6e2ee;
    font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;
    background-image:radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px);
    background-size:5px 5px;
  }
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 6px;color:#f1edf6}
  .sub{margin:0 0 40px;color:var(--faint);font-size:13px;line-height:1.9;max-width:72ch}
  .grid{display:grid;grid-template-columns:repeat(${slugs.length},1fr);gap:26px;align-items:start}
  .card{border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:22px 20px 18px;background:rgba(255,255,255,.022)}
  .card h2{margin:0 0 8px;font-size:15px;font-weight:600;letter-spacing:.06em;color:#fff}
  .card .line{margin:0 0 20px;font-size:12px;line-height:1.85;color:#a9a4bd;min-height:4.2em}
  .stages{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
  .stages figure{margin:0}
  .stages figcaption{font-size:10.5px;color:var(--faint);letter-spacing:.08em;margin-top:6px;text-align:center}
  .f{display:block;width:100%;aspect-ratio:1;border:0;border-radius:10px;background:transparent}
  .dream-missing{aspect-ratio:1;border-radius:10px;display:grid;place-items:center;font-size:10.5px;line-height:1.7;color:#6f6a84;text-align:center;padding:12px;background:rgba(255,255,255,.03)}
  .strip{display:grid;gap:8px;margin-top:12px}
  .tabsim{display:flex;align-items:center;gap:9px;height:34px;padding:0 10px;border-radius:8px 8px 0 0;font-size:12.5px}
  .tabsim.light{background:#dee1e6;color:#3c4043}
  .tabsim.dark{background:#202124;color:#e8eaed}
  .tabsim .f{width:16px;height:16px;aspect-ratio:auto;flex:none;border-radius:0}
  .tabsim .ttl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tabsim .x{margin-left:auto;opacity:.5;font-size:14px}
  .links{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
  .pxtitle{margin:16px 0 6px;font-size:10px;letter-spacing:.1em;color:#6f6a84}
  .pxrow{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .pxtile{aspect-ratio:1;border-radius:6px;display:grid;place-items:center}
  .pxtile.light{background:#dee1e6}
  .pxtile.dark{background:#202124}
  .pxtile .px{width:80px;height:80px;image-rendering:pixelated;display:block}
  .pxtile .na{font-size:9px;color:#6f6a84}
  .pxnote{margin:8px 0 0;font-size:10px;line-height:1.75;color:#6f6a84}
  .pxnote code{font-family:ui-monospace,Consolas,monospace;font-size:9.5px;color:#8f89a8}  .links a{font-size:11.5px;color:var(--lav);text-decoration:none;border:1px solid rgba(161,149,193,.32);border-radius:999px;padding:3px 10px}
  .links a:hover{background:rgba(161,149,193,.14)}
</style>
</head>
<body>
  <h1>标签页图标 · ${esc(batch)} 对照板</h1>
  <p class="sub">三个风格方向各做各的，互不参照。上排是成品在夜间底 / 昼面底，中排是梦态。下面两条是把它放进真实标签栏的样子。点开各套的 mockup 看尺寸带、单色退让与语境格。</p>
  <div class="grid">${cards.join('\n')}</div>
</body>
</html>`;

const out = path.join(dir, '_board.html');
fs.writeFileSync(out, html);
console.log(`✓ ${path.relative(process.cwd(), out)}  （${slugs.length} 套：${slugs.join(' / ')}）`);
