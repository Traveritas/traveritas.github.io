/* 临时检视页（不属交付物）
   用法: node design/mocks/icons/batch-01/b-hairline/.inspect.cjs small|big
   产物写到系统临时目录，不进 shots/ */
const fs = require('fs');
const os = require('os');
const path = require('path');
const g = require('./.gen.cjs');

const CSS = `
:root{--bg:#f0f3f6;--fg:#232830;--fg-soft:#56606d;--fg-faint:#858f9d;--dream:#9389ae;--night:#171a21;--night-fg:#c9d0da;--night-dream:#a99fc4}
body{margin:0;background:var(--bg);color:var(--fg);font:12px/1.6 system-ui,'Microsoft YaHei',sans-serif}
.ico{position:relative;display:inline-grid;place-items:center;line-height:0;color:var(--fg-soft)}
.ico.dream{color:var(--dream)}
.ico .ic{width:100%;height:100%;display:block;position:relative;z-index:1}
.ico .mist{position:absolute;inset:4%;border-radius:50%;pointer-events:none;opacity:0;
  background:radial-gradient(circle,currentColor 0%,transparent 66%);filter:blur(2.5px)}
.ico.dream .mist{opacity:.17}
.ico .ghost{opacity:.34}
.ico .t{stroke-opacity:.45}
.ico.pen-small .ic{stroke-width:1.12}
.ico.pen-small .t{stroke-opacity:1}
.ico.s128{width:128px;height:128px}
.ico.s24{width:24px;height:24px}
.ico.s16{width:16px;height:16px}
.wrap{padding:14px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.cell{border:1px solid rgba(35,40,48,.1);padding:6px;text-align:center}
.cell .m{font:10px/1.4 ui-monospace,Consolas,monospace;color:var(--fg-faint);margin-top:4px}
.row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(35,40,48,.08);flex-wrap:wrap}
.row .tag{font:10px/1.4 ui-monospace,Consolas,monospace;color:var(--fg-faint);width:120px}
.night{background:var(--night);color:var(--night-fg)}
.night .ico{color:var(--night-fg)}
.night .ico.dream{color:var(--night-dream)}
.mono .ico{color:var(--fg)}
.mono .ico.dream{color:var(--fg)}
.zgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.zcell{border:1px solid rgba(35,40,48,.1);padding:8px}
.zcell .m{font:10px/1.4 ui-monospace,Consolas,monospace;color:var(--fg-faint);margin-bottom:6px}
.fil .ic{stroke-width:1px}
.fil .ic path{vector-effect:non-scaling-stroke}
.fil .t{stroke-opacity:.45}
`;

const mode = process.argv[2] || 'small';

let body = '';
if (mode === 'small') {  const row = (pen, size, dream, cls = '') =>
    g.ICONS.map((i) => g.cell(i.id, { pen, size, dream, cls })).join('');
  body = `
  <div class="wrap">
    <div class="row"><span class="tag">16px 小样笔 醒</span>${row('small', 16, false)}</div>
    <div class="row"><span class="tag">16px 小样笔 梦</span>${row('small', 16, true)}</div>
    <div class="row night"><span class="tag">16px 小样笔 醒</span>${row('small', 16, false)}</div>
    <div class="row night"><span class="tag">16px 小样笔 梦</span>${row('small', 16, true)}</div>
    <div class="row"><span class="tag">24px 主笔 醒</span>${row('main', 24, false)}</div>
    <div class="row"><span class="tag">24px 主笔 梦</span>${row('main', 24, true)}</div>
    <div class="row mono"><span class="tag">单色 16px 醒</span>${row('small', 16, false, 'mono')}</div>
    <div class="row mono"><span class="tag">单色 16px 梦</span>${row('small', 16, true, 'mono')}</div>
  </div>`;
} else if (mode === 'zoom') {
  const pair = (id) =>
    `<div class="zcell"><div class="m">${id} · 原比例（线宽随框）</div>${g.cell(id, { size: 160 })}</div>
     <div class="zcell"><div class="m">${id} · 非等比线宽（真 1px 发丝）</div><div class="fil">${g.cell(id, { size: 160 })}</div></div>`;
  body = `<div class="wrap"><div class="zgrid">${pair('switch')}${pair('home')}${pair('mark')}</div></div>`;
} else {
  body = `<div class="wrap"><div class="grid">${g.ICONS.map(
    (i) => `<div class="cell">${g.cell(i.id, { size: 128, dream: false })}${g.cell(i.id, {
      size: 128,
      dream: true,
    })}<div class="m">${i.id}</div></div>`
  ).join('')}</div></div>`;
}

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>inspect ${mode}</title><style>${CSS}</style></head><body>${body}</body></html>`;
const out = path.join(os.tmpdir(), `b-hairline-inspect-${mode}.html`);
fs.writeFileSync(out, html, 'utf8');
console.log(out);
