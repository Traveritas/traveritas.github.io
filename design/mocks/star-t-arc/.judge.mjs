/* 判读图：候选档在 300px、两个底上并排，DPR 2。用来看「哪一道弯读成晶体」。
   node design/mocks/star-t-arc/.judge.mjs → .shots/judge-light.png / judge-deep.png / judge-spike.png */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { start } from './serve.cjs';
import { VARIANTS, singleSpikeMarkup, starMarkup } from './src.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '.shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9379;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SET = ['v0', 'b2', 'b3', 'c2', 'c3', 's2', 's3', 'd2'];
const pick = (id) => VARIANTS.find((v) => v.id === id);

function grid(bg, fg, hub, w = 320) {
  return `<div class="g" style="background:${bg};color:${fg}">${SET.map((id) => {
    const v = pick(id);
    return `<figure><div class="s" style="width:${w}px;height:${w}px">${starMarkup({ edge: v.edge })}</div>
      <figcaption>${v.name}</figcaption></figure>`;
  }).join('')}</div>`;
}

const page = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:13px system-ui,'Microsoft YaHei',sans-serif}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding:0}
figure{margin:0;padding:8px;text-align:center}
.s svg{width:100%;height:100%;display:block;overflow:visible}
.s{display:inline-block}
figcaption{font:12px ui-monospace,monospace;margin-top:6px;opacity:.72}
h2{font:500 15px 'Noto Serif SC',serif;margin:14px 16px 6px;color:#232830}
.sp{display:flex;gap:0;padding:0;background:#f0f3f6;color:#232830}
.sp figure{flex:1}
.sp .s{height:330px;width:100%}
.sp .s svg{width:100%;height:100%}
.hubfix circle{fill:var(--hub)}
.s svg circle{fill:var(--hub)}
</style>
<h2>浅底 200px 等价（实际 320px）</h2><div style="--hub:#9a86c4">${grid('#f0f3f6', '#2f3540')}</div>
<h2 style="color:#cfd2de">深底 #2a2b38</h2><div style="--hub:#9a86c4">${grid('#2a2b38', '#d3d6e2')}</div>
<h2>单支</h2><div class="sp" style="--hub:#9a86c4">${SET.map((id) => {
  const v = pick(id);
  return `<figure><div class="s">${singleSpikeMarkup({ edge: v.edge })}</div><figcaption>${v.name}</figcaption></figure>`;
}).join('')}</div>`;
fs.writeFileSync(path.join(DIR, '.judge.html'), page);

function req(method, p) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method }, (x) => {
      let d = '';
      x.on('data', (c) => (d += c));
      x.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    r.on('error', rej); r.end();
  });
}

/* Chrome 的渲染子进程不随主进程一起退，它们握着 profile 的锁 —— 必须整棵树杀 */
function killTree(cp) {
  return new Promise((res) => {
    if (process.platform === 'win32' && cp.pid) {
      spawn('taskkill', ['/pid', String(cp.pid), '/T', '/F'], { stdio: 'ignore' })
        .on('exit', () => res()).on('error', () => res());
    } else {
      try { cp.kill('SIGKILL'); } catch {}
      res();
    }
  });
}

const server = await start(0);
const base = `http://127.0.0.1:${server.address().port}/star-t-arc/`;
const profile = path.join(process.env.TEMP, 'chrome-judge-' + Date.now());
const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--force-color-profile=srgb',
  '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let up = false;
for (let i = 0; i < 100; i++) { try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); } }
if (!up) { console.error('chrome did not start'); process.exit(1); }

const t = await req('PUT', '/json/new?about:blank');
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pend = new Map();
const errs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1500, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: base + '.judge.html' });
await sleep(1400);
await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(path.join(OUT, 'judge.png'), Buffer.from(shot.data, 'base64'));
console.log('judge.png', errs.length ? errs : 'ok');

/* 单独裁三段 */
const rects = await send('Runtime.evaluate', {
  expression: `JSON.stringify([...document.querySelectorAll('h2')].map(h => {
    const el = h.nextElementSibling; const b = el.getBoundingClientRect();
    return { x: b.x + window.scrollX, y: b.y + window.scrollY, w: b.width, h: b.height };
  }))`,
  returnByValue: true,
});
const list = JSON.parse(rects.result.value);
const names = ['judge-light', 'judge-deep', 'judge-spike'];
for (let i = 0; i < list.length; i++) {
  const r = list[i];
  const s = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
  });
  fs.writeFileSync(path.join(OUT, `${names[i]}.png`), Buffer.from(s.data, 'base64'));
  console.log(names[i] + '.png');
}

ws.close(); server.close();
await killTree(chrome);
/* 再等一会儿，让文件锁松开 */
await sleep(600);
for (let i = 0; i < 6; i++) {
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (!fs.existsSync(profile)) break;
  await sleep(400);
}
process.exit(0);