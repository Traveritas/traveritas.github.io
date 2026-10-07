import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { candidates, groups } from './candidates-round4.mjs';

// One self-contained file also works when opened directly from the filesystem.
const dataUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const esc = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const icon = (candidate, size, cls = '') => `<img class="icon ${cls}" src="${esc(dataUrl(candidate.svg))}" width="${size}" height="${size}" alt="" draggable="false">`;
const glyph = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
const tab = (candidate, theme) => `<div class="tab-strip ${theme}"><span class="fake-tab">${icon(candidate,16)}<span>醒梦 · Traveritas</span>${glyph}</span><span class="tab-plus" aria-hidden="true">+</span></div>`;
const selected = candidates[0];

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="color-scheme" content="light">
  <title>A0 像素微芒原版 · 三组变体</title>
  <link id="preview-favicon" rel="icon" type="image/svg+xml" href="${esc(dataUrl(selected.svg))}">
  <style>
    :root{color-scheme:light;--paper:#edeeec;--ink:#353637;--muted:#6a6c6b;--line:#cfd2d0;--accent:#776088;--panel:#f7f8f6;--dark:#29262e}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.6}button,a,input{font:inherit}button,a{-webkit-tap-highlight-color:transparent}button{color:inherit;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #9673ae;outline-offset:4px}img{display:block;flex-shrink:0}button{border:0}button:disabled{cursor:default}a{color:inherit;text-underline-offset:4px}main{max-width:1536px;margin:auto;padding:42px 48px 34px}
    .intro{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:25px}h1{font-weight:500;font-size:32px;letter-spacing:.06em;line-height:1.2;margin:0 0 12px}.intro p{margin:0;color:var(--muted);max-width:640px}.palette{display:flex;gap:6px;align-items:center;padding-bottom:4px}.swatch{width:22px;height:22px;border-radius:50%;border:1px solid #756c8426}.palette-label{font-size:12px;color:var(--muted);margin-right:7px}
    .comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 20px;align-items:stretch}.selection{padding:16px 20px;border:1px solid var(--line);display:flex;align-items:center;gap:20px;background:#f5f2f7}.chosen-art{width:48px;height:48px;flex:0 0 48px}.chosen-art img{width:48px;height:48px}.selected-copy{flex:1;min-width:0}.selected-copy strong{font-weight:600;display:block;font-size:16px}.selected-copy p{font-size:12px;color:var(--muted);margin:3px 0 0}.download{font-size:12px;white-space:nowrap}.toolbar{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted)}.toolbar label{display:flex;align-items:center;gap:6px;cursor:pointer}.toolbar input{accent-color:var(--accent);width:15px;height:15px;margin:0}.scale-note{padding:0 8px;color:#655371}
    .gallery{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.candidate{min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:5px;overflow:hidden;position:relative}.candidate[aria-checked="true"]{border-color:#897097;box-shadow:0 0 0 1px #897097}.choose{padding:13px 13px 11px;background:none;width:100%;text-align:left;display:flex;align-items:center;gap:9px}.number{color:#8b7f95;font-size:11px;font-variant-numeric:tabular-nums}.name{font-weight:600;font-size:14px}.chosen-mark{margin-left:auto;width:14px;height:14px;border:1px solid #c0b4cb;border-radius:50%;display:grid;place-items:center}.candidate[aria-checked="true"] .chosen-mark{background:#897097;border-color:#897097}.candidate[aria-checked="true"] .chosen-mark:after{content:"";width:5px;height:5px;background:#f9f6fc;border-radius:50%}
    .native-title{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);padding:0 12px 7px}.tab-strip{height:39px;display:flex;align-items:flex-end;padding:6px 6px 0;gap:8px;overflow:hidden}.tab-strip.light{background:#dee0e6;color:#42424c}.tab-strip.dark{background:#202025;color:#ebeaed}.fake-tab{height:33px;padding:0 10px;display:flex;align-items:center;gap:8px;min-width:0;flex:1;border-radius:7px 7px 0 0;white-space:nowrap;font:11px/1.1 "Segoe UI","Microsoft YaHei",sans-serif}.fake-tab>span{overflow:hidden;text-overflow:ellipsis;flex:1}.fake-tab>svg{flex-shrink:0;color:#86808e}.light .fake-tab{background:#fff}.dark .fake-tab{background:#34323a}.tab-plus{align-self:center;font-size:16px;color:#8c8692}.tab-strip+.tab-strip{margin-top:4px}.sizes{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:11px 12px 0}.size-pair{display:flex;align-items:center;justify-content:space-evenly;gap:8px;height:58px;border-radius:3px}.size-pair.light{background:#fff;border:1px solid #ece7ee}.size-pair.dark{background:var(--dark)}.size-pair .large{width:48px;height:48px}.size-pair img{width:32px;height:32px}.sizes-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);padding:4px 13px 0}.description{margin:10px 12px 13px;font-size:11px;line-height:1.6;color:var(--muted);min-height:35px}.details{margin-top:25px;border-top:1px solid var(--line);padding-top:14px;display:flex;gap:24px;justify-content:space-between;color:var(--muted);font-size:12px}.details p{margin:0;max-width:830px}.reset{background:none;padding:0;text-decoration:underline;text-underline-offset:4px;color:var(--muted);white-space:nowrap}
    .group-heading{grid-column:1/-1;display:flex;align-items:baseline;gap:18px;margin-top:6px;scroll-margin-top:20px}.group-heading h2{font-size:18px;font-weight:500;margin:0}.group-heading p{font-size:12px;color:var(--muted);margin:0}.group-heading:not(:first-child){margin-top:17px}.group-nav{display:flex;gap:18px;margin-top:12px;font-size:12px}.group-nav a{text-decoration-color:#a8b0aa}.style-name{color:#6b6e6b;font-size:11px;margin:0 12px 10px;padding-bottom:8px;border-bottom:1px solid #dde0dc}.candidate{cursor:pointer}.silhouette .icon{filter:brightness(0) saturate(100%) opacity(.66)}.silhouette .dark .icon{filter:brightness(0) invert(1) opacity(.85)}.native-only .sizes,.native-only .sizes-labels{display:none}.native-only .description{margin-top:13px}.native-only .candidate{align-self:start}noscript{display:block;padding:10px;background:#eee6f0;margin-bottom:15px}
    @media(min-width:1500px){.fake-tab{font-size:12px}.gallery{gap:18px}.candidate .choose{padding-top:16px;padding-bottom:14px}.size-pair{height:68px}.description{font-size:12px;margin-top:13px}.sizes{padding-top:15px}}
    @media(max-width:1150px){main{padding:32px 28px}.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.comparison{grid-template-columns:1fr}.toolbar{justify-content:flex-start}.intro{align-items:flex-start}.palette-label{display:none}}
    @media(max-width:690px){main{padding:26px 16px}.intro{display:block;margin-bottom:20px}h1{font-size:26px}.intro p{font-size:12px}.palette{margin-top:16px}.palette-label{display:inline}.gallery{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.selection{padding:13px;gap:12px}.chosen-art,.chosen-art img{width:36px;height:36px;flex-basis:36px}.selected-copy strong{font-size:14px}.selected-copy p{font-size:11px}.download{font-size:11px}.toolbar{gap:14px}.scale-note{padding:0}.choose{padding:12px 10px}.name{font-size:13px}.native-title{padding:0 9px 7px}.tab-strip{padding-left:4px;padding-right:4px;gap:4px}.fake-tab{padding:0 6px;gap:6px;font-size:10px}.tab-plus{display:none}.fake-tab>svg{display:none}.sizes{padding:10px 8px 0;gap:5px}.size-pair{gap:0}.size-pair .large{width:40px;height:40px}.size-pair img{width:24px;height:24px}.sizes-labels{padding-inline:9px;font-size:9px}.description{margin:10px 9px 12px;font-size:10px;min-height:32px}.details{display:block}.reset{margin-top:10px}.selected-copy{min-width:100px}.desktop-size{display:none}.mobile-size{display:inline!important}}
  </style>
</head>
<body>
<main>
  <header class="intro">
    <div><h1>三组变体</h1><p>每组一枚原版，四枚变体。保留喜欢的形状，比较细节如何改变小尺寸里的感觉。</p><nav class="group-nav" aria-label="跳至图标组">${groups.map(g=>`<a href="#${g.anchor}">${g.name}</a>`).join('')}</nav></div>
    <div class="palette" aria-label="配色：墨紫、灰绿、银白、灰樱粉、丁香紫"><span class="palette-label">明暗与色彩</span>${['#4B375D','#5C7872','#F2EDF3','#D9B8CE','#B6A0CE'].map(c=>`<span class="swatch" style="background:${c}" title="${c}"></span>`).join('')}</div>
  </header>
  <noscript>十五个候选都可直接查看。启用 JavaScript 后，可以切换当前标签页的图标。</noscript>
  <section class="comparison" aria-label="预览设置">
    <div class="selection"><div class="chosen-art" id="chosen-art">${icon(selected,48)}</div><div class="selected-copy"><strong id="chosen-name">A0 像素微芒原版</strong><p id="selection-status" aria-live="polite">已放入当前标签页，点击候选即可切换。</p></div><a id="download" class="download" href="${esc(dataUrl(selected.svg))}" download="A0-像素微芒原版.svg">下载 SVG</a></div>
    <div class="toolbar"><span class="scale-note" id="scale-note">浏览器缩放请保持 100%</span><label><input id="native-only" type="checkbox">只看 16px</label><label><input id="silhouette" type="checkbox">查看单色轮廓</label></div>
  </section>
  <div class="gallery" role="radiogroup" aria-label="选择标签页图标">
    ${candidates.map((c,i)=>`${i===0||candidates[i-1].group!==c.group?`<div class="group-heading" id="${c.group}"><h2>${groups.find(g=>g.id===c.group).name}</h2><p>${groups.find(g=>g.id===c.group).note}</p></div>`:''}<article class="candidate" role="radio" aria-checked="${i===0}" aria-label="${c.id} ${c.name}" tabindex="${i===0?'0':'-1'}" data-id="${c.id}">
      <button class="choose" type="button" tabindex="-1" aria-label="预览 ${c.id} ${c.name}"><span class="number">${c.id}</span><span class="name">${c.name}</span><span class="chosen-mark" aria-hidden="true"></span></button>
      <p class="style-name">${c.style}</p>
      <div class="native-title"><span>标签栏 · 实际大小</span><span>16px</span></div>
      ${tab(c,'light')}${tab(c,'dark')}
      <div class="sizes"><div class="size-pair light">${icon(c,32)}${icon(c,48,'large')}</div><div class="size-pair dark">${icon(c,32)}${icon(c,48,'large')}</div></div>
      <div class="sizes-labels"><span class="desktop-size">32 / 48px · 浅底</span><span class="desktop-size">32 / 48px · 深底</span><span class="mobile-size" style="display:none">24 / 40px · 浅底</span><span class="mobile-size" style="display:none">24 / 40px · 深底</span></div>
      <p class="description">${c.description}</p>
    </article>`).join('')}
  </div>
  <footer class="details"><p>A0、B0、C0 完整保留第三轮原稿。点击候选即可放到当前标签页；每款在深浅底使用同一份 SVG。</p><button type="button" class="reset" id="reset">重置预览</button></footer>
</main>
<script>
  const choices = ${JSON.stringify(candidates.map(c=>({id:c.id,name:c.name,url:dataUrl(c.svg)})))};
  const cards = [...document.querySelectorAll('.candidate')];
  function choose(id, focus = false) {
    const choice = choices.find(c => c.id === id);
    if (!choice) return;
    cards.forEach(card => { const selected = card.dataset.id === id; card.setAttribute('aria-checked', String(selected)); card.tabIndex = selected ? 0 : -1; if (selected && focus) card.focus(); });
    document.querySelector('#preview-favicon').href = choice.url;
    document.querySelector('#chosen-art img').src = choice.url;
    document.querySelector('#chosen-name').textContent = choice.id + ' ' + choice.name;
    document.querySelector('#selection-status').textContent = '已放入当前标签页，点击候选即可切换。';
    document.title = choice.id + ' ' + choice.name + ' · 三组变体';
    const download = document.querySelector('#download'); download.href = choice.url; download.download = choice.id + '-' + choice.name + '.svg';
  }
  cards.forEach((card, index) => {
    card.addEventListener('click', () => choose(card.dataset.id));
    card.addEventListener('keydown', event => {
      const offset = {ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
      if (offset) { event.preventDefault(); choose(choices[(index + offset + choices.length) % choices.length].id, true); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); choose(choices[event.key === 'Home' ? 0 : choices.length - 1].id, true); }
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); choose(card.dataset.id); }
    });
  });
  for (const id of ['native-only','silhouette']) document.getElementById(id).addEventListener('change', event => document.querySelector('.gallery').classList.toggle(id, event.target.checked));
  document.querySelector('#reset').addEventListener('click', () => { for (const id of ['native-only','silhouette']) { document.getElementById(id).checked = false; document.querySelector('.gallery').classList.remove(id); } choose(choices[0].id); });
</script>
</body>
</html>`;

await writeFile(new URL('../favicon-opal-preview.html', import.meta.url), html, 'utf8');
await mkdir(new URL('./svg-round4/', import.meta.url), { recursive: true });
for (const candidate of candidates) await writeFile(new URL(`./svg-round4/${candidate.id}.svg`, import.meta.url), candidate.svg, 'utf8');
console.log(`Created ${candidates.length} candidates: ${fileURLToPath(new URL('../favicon-opal-preview.html', import.meta.url))}`);
