// p7 波图集缩略图：1440×900 JPG → design/index-shots/
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/';
const OUT = path.resolve(__dirname, 'index-shots');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

async function shotOne(cfg, i) {
  const port = 9800 + i;
  const prof = path.join(OUT, '.p7-' + i);
  const ch = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON(`http://127.0.0.1:${port}/json`); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log(cfg.name, 'devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + cfg.page });
  await sleep(cfg.wait || 5000);
  const ev = await send('Runtime.evaluate', { expression: 'JSON.stringify({err: window.__swarmErr || null, h: document.documentElement.scrollHeight, hidden: document.hidden})' });
  const cap = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  const file = path.join(OUT, cfg.name + '.jpg');
  fs.writeFileSync(file, Buffer.from(cap.result.data, 'base64'));
  console.log(cfg.name, fs.statSync(file).size, (ev.result && ev.result.result && ev.result.result.value) || '');
  ws.close();
  try { ch.kill(); } catch (e) {}
  await sleep(350);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
}

(async () => {
  const shots = [
    { name: 'p7-first-stitch', page: 'p7-first-stitch.html', wait: 5500 },
    { name: 'p7-vestibule', page: 'p7-vestibule.html', wait: 5500 },
    { name: 'p7-verify', page: 'p7-verify.html', wait: 5500 },
    { name: 'p7-doorcheck', page: 'p7-doorcheck.html', wait: 5500 },
    { name: 'p7-dawnline', page: 'p7-dawnline.html', wait: 6000 },
    { name: 'p7-hypnogram', page: 'p7-hypnogram.html', wait: 7500 },
  ];
  for (let i = 0; i < shots.length; i++) {
    try { await shotOne(shots[i], i); }
    catch (e) { console.log(shots[i].name, 'FAILED:', e.message); }
  }
})();
