/* 星 · 晶体 · 测算（CDP 直连）
   node design/mocks/star-v-gem/.bench.cjs   → design/mocks/star-v-gem/.shots/cost.json
   在真实的页面上下文里跑 src.js 的 measure()，结果写文件，顺便打印一张表。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9462;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    r.on('error', reject);
    r.end();
  });
}

const MAT = { crystal: '近白晶面', resin: '磨砂树脂', edge: '淡彩棱线', refract: '折射' };
const GEO = {
  octa: '正八面体', octaCut: '截顶八面体', bud: '六棱双锥', stella: '星形八面体',
  blunt: '截角六尖体', starBi: '星芒双锥', slab: '星形棱板',
};

(async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-gem/?mat=crystal`;
  const profile = path.join(process.env.TEMP, 'chrome-gem-bench-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--use-angle=d3d11', '--force-color-profile=srgb',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 80; i++) {
    try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); }
  }
  if (!up) { console.error('chrome did not start'); process.exit(1); }

  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve } = pending.get(m.id);
      pending.delete(m.id);
      resolve(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pending.set(i, { resolve });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  await send('Page.enable');
  await send('Page.navigate', { url: base });
  await sleep(3000);

  /* 页面里那几张静态格子表是画完就停的，但活动画布（05 节）一直在 rAF 上跑，
     会跟测算抢 GPU。先停掉它，读数才有意义。 */
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cs = document.querySelectorAll('canvas');
      return 'canvas count ' + cs.length;
    })()`,
    returnByValue: true,
  }).then((r) => console.log(r.result.value));

  /* 用 __gem 暴露的口子把两张活动画布停掉 */
  await send('Runtime.evaluate', {
    expression: `(() => { if (!window.__gem || !window.__gem.stopLive) return 'no stopLive'; window.__gem.stopLive(); return 'stopped'; })()`,
    returnByValue: true,
  }).then((r) => console.log('live layers: ' + r.result.value));

  /* 跑三轮取中位数，抑制一次性的噪声 */
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const r = await send('Runtime.evaluate', {
      expression: 'window.__gem.measure({ size: 480 }).then(r => JSON.stringify(r))',
      awaitPromise: true,
      returnByValue: true,
    });
    runs.push(JSON.parse(r.result.value));
    console.log(`run ${i + 1} done`);
  }

  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const keyed = {};
  for (const run of runs) {
    for (const row of run.rows) {
      const k = `${row.geo}|${row.mat}`;
      (keyed[k] ||= []).push(row);
    }
  }
  const rows = Object.entries(keyed).map(([k, list]) => {
    const [geo, mat] = k.split('|');
    return {
      geo, mat,
      cpu: +med(list.map((r) => r.cpu)).toFixed(3),
      gpu: +med(list.map((r) => r.gpu)).toFixed(3),
      calls: list[0].calls,
      tris: list[0].tris,
      perSec110: +(med(list.map((r) => r.gpu)) * 1000 / 110).toFixed(2),
    };
  });

  const out = { size: 480, dpr: 1, rows, perHold: runs[0].perHold };
  fs.writeFileSync(path.join(OUT, 'cost.json'), JSON.stringify(out, null, 2));

  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('几何', 12) + pad('材质', 12) + pad('提交', 9) + pad('合成', 9) + pad('calls', 7) + pad('tris', 7) + 'ms/s@110');
  for (const r of rows) {
    console.log(pad(GEO[r.geo], 12) + pad(MAT[r.mat], 12) + pad(r.cpu, 9) + pad(r.gpu, 9) + pad(r.calls, 7) + pad(r.tris, 7) + r.perSec110);
  }

  ws.close();
  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
