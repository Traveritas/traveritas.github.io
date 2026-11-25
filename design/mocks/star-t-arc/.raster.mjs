/* 真实栅格检验：48 / 96 px 在 DPR 1 下究竟是什么（放大 12 倍最近邻来看）。
   node design/mocks/star-t-arc/.raster.mjs → .shots/raster.png + raster.json
   不靠 SVG 图片解码：直接用 src.js 的段表在 canvas 上重画，然后数像素。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { start } from './serve.cjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '.shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9380;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SET = [['v0', '直'], ['c2', '凹 0.04'], ['s3', 'S 0.020'], ['b3', '凸 0.06']];
/* 每档一套放大倍数，让四格的像素盒一样宽（48px 用 12×、96px 用 6×），
   这样两张图并排时「小的更糊」是看得见的，而不是被不同的放大倍数抵消掉 */
const SIZES = [[48, 10], [96, 5]];

const page = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fonts/noto/font.css"><style>
body{margin:0;background:#f0f3f6;font:12px ui-monospace,monospace;color:#232830}
.row{display:flex;gap:0;align-items:flex-start;padding:10px 0 0 10px}
.cell{padding:0 14px 10px 0;text-align:center}
.cv{image-rendering:pixelated;display:block;background:#f0f3f6;border:1px solid #d8dde4}
.lbl{font-size:11px;color:#56606d;margin-top:5px;line-height:1.5}
.tag{font-size:11px;color:#232830;text-align:left;padding:2px 0 0 10px;letter-spacing:.04em}
</style><div id="host"></div>
<script type="module">
import * as A from './src.js';
const SET = ${JSON.stringify(SET)};
const SIZES = ${JSON.stringify(SIZES)};
const host = document.getElementById('host');
const out = {};
const SCALE = 12;

function drawStar(ctx, size, edge, ink) {
  const p = { ...A.BASE, edge };
  const k = size / A.BASE.box;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);
  const spikes = A.spikes(p);
  for (const sp of spikes) {
    const segs = A.spikeSegs(sp, p);
    ctx.beginPath();
    ctx.moveTo(segs[0].a[0], segs[0].a[1]);
    for (const s of segs) {
      if (s.kind === 'q' && !s.__straight) ctx.quadraticCurveTo(s.c[0], s.c[1], s.b[0], s.b[1]);
      else ctx.lineTo(s.b[0], s.b[1]);
    }
    ctx.closePath();
    const op = 0.38 + (0.5 * (sp.z + 1)) / 2;
    ctx.globalAlpha = op;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ink;
    ctx.fill('nonzero');
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0, 0, p.hub, 0, Math.PI * 2);
  ctx.fillStyle = '#9a86c4';
  ctx.fill();
  ctx.restore();
}

/* 凹口：从中心每 3° 打一条射线，量到「墨迹第一次断掉」的距离；取 60° 内的最小值 */
function notchPx(alpha, size) {
  const at = (x, y) => {
    const i = (y * size + x) * 4;
    return alpha[i + 3];
  };
  let best = Infinity;
  for (let a = 0; a < 60; a += 1) {
    const rad = (a * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    let far = 0;
    for (let t = 0.5; t < size / 2; t += 0.2) {
      const x = Math.round(size / 2 + dx * t);
      const y = Math.round(size / 2 + dy * t);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      if (at(x, y) > 24) far = t; else break;
    }
    best = Math.min(best, far);
  }
  return best;
}

for (const [size, scale] of SIZES) {
  const row = document.createElement('div');
  row.className = 'row';
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = size + ' px（放大 ' + scale + '×）';
  const cells = document.createElement('div');
  cells.className = 'row';
  cells.style.padding = '0';
  for (const [id, name] of SET) {
    const v = A.VARIANTS.find((q) => q.id === id);
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const octx = off.getContext('2d', { willReadFrequently: true });
    drawStar(octx, size, v.edge, '#2f3540');
    const px = notchPx(octx.getImageData(0, 0, size, size).data, size);

    const cv = document.createElement('canvas');
    cv.className = 'cv';
    cv.width = cv.height = size * scale;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, size, size, 0, 0, cv.width, cv.height);

    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = name + ' · 凹口 ' + px.toFixed(1) + ' px';
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.append(cv, lbl);
    cells.append(cell);
    out[size + ':' + id] = { name, notchPx: +px.toFixed(2) };
  }
  row.append(tag, cells);
  row.style.display = 'block';
  tag.style.padding = '0 0 6px 10px';
  host.append(row);
}
window.__raster = out;
window.__ready = true;
</script>`;
fs.writeFileSync(path.join(DIR, '.raster.html'), page);

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
const profile = path.join(process.env.TEMP, 'chrome-raster-' + Date.now());
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
await send('Emulation.setDeviceMetricsOverride', { width: 2200, height: 1300, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base + '.raster.html' });
for (let i = 0; i < 40; i++) {
  const r = await send('Runtime.evaluate', { expression: '!!window.__ready', returnByValue: true });
  if (r.result.value) break;
  await sleep(200);
}
const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__raster || null)', returnByValue: true });
const data = r.result.value ? JSON.parse(r.result.value) : null;
if (!data) { console.error('raster did not run', errs); }
const rect = await send('Runtime.evaluate', {
  expression: 'JSON.stringify((()=>{const b=document.body.getBoundingClientRect();return {w:Math.ceil(b.width),h:Math.ceil(b.height)};})())',
  returnByValue: true,
});
const box = JSON.parse(rect.result.value);
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: box.w, height: Math.max(1, box.h), scale: 1 },
});
fs.writeFileSync(path.join(OUT, 'raster.png'), Buffer.from(shot.data, 'base64'));
fs.writeFileSync(path.join(OUT, 'raster.json'), JSON.stringify({ data, errs }, null, 2));
console.log('raster.png', JSON.stringify(data, null, 2), errs.length ? errs : 'ok');

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