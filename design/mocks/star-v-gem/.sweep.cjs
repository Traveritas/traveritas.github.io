/* 视角扫描：星芒双锥在 0–90° 的倾倒里，六芒星这个读感还剩多少
   node design/mocks/star-v-gem/.sweep.cjs → .shots/50-sweep.png
   一行一瓶倾角，用来定「摆」的幅度上限。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9464;
const OUT = path.join(__dirname, '.shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(m, u) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: u, method: m }, (x) => {
      let d = '';
      x.on('data', (c) => (d += c));
      x.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    r.on('error', rej);
    r.end();
  });
}

const HTML = (angles) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>倾角扫描</title><style>
  :root{--bg:#f0f3f6;--fg:#232830;--fg-soft:#56606d;--fg-faint:#858f9d;
    --font-mono:'IBM Plex Mono',ui-monospace,Consolas,monospace;--font-body:system-ui,'Microsoft YaHei UI',sans-serif;}
  *{box-sizing:border-box}html,body{margin:0}
  body{background:var(--bg);color:var(--fg);font-family:var(--font-body);padding:40px 36px 60px}
  h1{font-size:15px;font-weight:500;letter-spacing:.04em;margin:0 0 6px}
  p{font-size:12.5px;color:var(--fg-soft);margin:0 0 22px;max-width:44em;line-height:1.7}
  .grid{display:flex;flex-wrap:wrap;gap:14px}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px}
  .cell canvas{display:block;border-radius:4px}
  .cell span{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;color:var(--fg-faint)}
</style></head><body>
<h1>倾角扫描 · 星芒双锥</h1>
<p>从正对到侧对，每 10° 一格（200px）。看的是「六个尖」在哪个角度之后不再成立，
以及侧到多少度时体量开始压过剪影。这个读数是「摆」的幅度上限的出处。</p>
<div class="grid" id="g"></div>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>
<script type="module">
import { GemLayer } from '/star-v-gem/src.js';
const angles = ${JSON.stringify(angles)};
for (const a of angles) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const cv = document.createElement('canvas');
  cell.appendChild(cv);
  const sp = document.createElement('span');
  sp.textContent = a + '°';
  cell.appendChild(sp);
  document.getElementById('g').appendChild(cell);
  const layer = new GemLayer(cv, { geo: 'starBi', mat: 'crystal', bg: 'light', size: 200, euler: [a, 9, 0] });
  layer.freeze(0);
}
</script></body></html>`;

(async () => {
  const server = await start(0);
  fs.writeFileSync(path.join(__dirname, '.sweep.html'), HTML([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]));
  const base = `http://127.0.0.1:${server.address().port}/star-v-gem/.sweep.html`;
  const profile = path.join(process.env.TEMP, 'chrome-gem-sweep-' + Date.now());
  const ch = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--use-angle=d3d11',
    '--force-color-profile=srgb', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 80; i++) { try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); } }
  if (!up) { console.error('no chrome'); process.exit(1); }
  const t = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m.result); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base });
  await sleep(2600);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, '50-sweep.png'), Buffer.from(shot.data, 'base64'));
  console.log('50-sweep.png written');
  ws.close(); ch.kill(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });