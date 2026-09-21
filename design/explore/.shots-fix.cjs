// 修正三张状态截图：随笔书叶（注入正文）/ 图纸展开图（滚动到内容）/ 404（强制落定动画终值）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My Projects/personal-website/design/explore/';
const OUT = path.join(__dirname, '_shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function shotOne(cfg, i) {
  const port = 9700 + i;
  const prof = path.join(OUT, '.fxprof-' + i);
  const ch = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 60; k++) {
    try { list = await getJSON(`http://127.0.0.1:${port}/json`); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + cfg.page });
  await sleep(cfg.wait || 4500);
  await send('Runtime.evaluate', { expression: cfg.js });
  await sleep(cfg.settle || 2400);
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, cfg.name + '.png');
  fs.writeFileSync(file, Buffer.from(cap.result.data, 'base64'));
  console.log(cfg.name, fs.statSync(file).size);
  ws.close();
  try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
}

(async () => {
  const ESSAY_OPEN = `(function(){var b=[].slice.call(document.querySelectorAll('button,a')).find(function(x){return /开站/.test(x.textContent||'')});if(b){b.click();return 'ok'}return 'nobtn'})()`;
  const SHEET_SCROLL = `(function(){document.body.dataset.view='sheet';var s=document.getElementById('sheetScroll');if(s){s.scrollTop=s.scrollHeight*0.42}return s?s.scrollTop:'noscroll'})()`;
  const LOST_FORCE = `(function(){document.documentElement.classList.remove('boot');document.documentElement.style.setProperty('--draw','1');var v=document.getElementById('view-lost');if(v){v.hidden=false}document.body.dataset.view='lost';[].forEach.call(document.querySelectorAll('.lost-main > *'),function(e){e.style.animation='none';e.style.opacity=1;e.style.transform='none'});window.scrollTo(0,0);return 'ok'})()`;
  const shots = [
    { name: 'essays-threadbound-leaf', page: 'essays-threadbound.html', js: ESSAY_OPEN, settle: 2600 },
    { name: 'projects-blueprint-sheet', page: 'projects-blueprint.html', js: SHEET_SCROLL, settle: 2600 },
    { name: 'seam-stitch-404', page: 'seam-stitch.html', js: LOST_FORCE, settle: 2000 },
  ];
  for (let i = 0; i < shots.length; i++) {
    try { await shotOne(shots[i], i); }
    catch (e) { console.log(shots[i].name, 'FAILED:', e.message); }
  }
})();
