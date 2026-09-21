// 内页探索轮 · 图集截图（1440×900 首屏 + 关键状态）
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My Projects/personal-website/design/explore/';
const OUT = path.join(__dirname, '_shots');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const http = require('http');

async function shotOne(cfg, i) {
  const port = 9600 + i;
  const prof = path.join(OUT, '.prof-' + i);
  const ch = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 60; k++) {
    try { list = await getJSON(`http://127.0.0.1:${port}/json`); if (list && list.some(t => t.type === 'page')) break; }
    catch (e) { /* retry */ }
    await sleep(250);
  }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + cfg.page + (cfg.q || '') });
  await sleep(cfg.wait || 4500);
  if (cfg.js) { await send('Runtime.evaluate', { expression: cfg.js }); await sleep(cfg.settle || 1800); }
  const ev = await send('Runtime.evaluate', { expression: 'JSON.stringify({err: window.__swarmErr || null, h: document.documentElement.scrollHeight})' });
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, cfg.name + '.png');
  fs.writeFileSync(file, Buffer.from(cap.result.data, 'base64'));
  console.log(cfg.name, fs.statSync(file).size, (ev.result && ev.result.result && ev.result.result.value) || '');
  ws.close();
  try { ch.kill(); } catch (e) {}
  fs.rmSync(prof, { recursive: true, force: true });
  await sleep(300);
}

(async () => {
  const shots = [
    { name: 'essays-threadbound', page: 'essays-threadbound.html' },
    { name: 'essays-threadbound-leaf', page: 'essays-threadbound.html', js: `document.body.dataset.view='leaf'`, settle: 2200 },
    { name: 'projects-blueprint', page: 'projects-blueprint.html' },
    { name: 'projects-blueprint-sheet', page: 'projects-blueprint.html', js: `document.body.dataset.view='sheet'`, settle: 2400 },
    { name: 'seam-stitch', page: 'seam-stitch.html' },
    { name: 'seam-stitch-404', page: 'seam-stitch.html', q: '#lost' },
    { name: 'lab-greenhouse', page: 'lab-greenhouse.html' },
    { name: 'about-placard', page: 'about-placard.html' },
    { name: 'about-lucidity', page: 'about-lucidity.html' },
  ];
  for (let i = 0; i < shots.length; i++) {
    try { await shotOne(shots[i], i); }
    catch (e) { console.log(shots[i].name, 'FAILED:', e.message); }
  }
})();
