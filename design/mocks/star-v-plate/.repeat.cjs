/* 测算的可重复性：同一套参数连跑三轮，看读数自己散多远。
   node design/mocks/star-v-plate/.repeat.cjs  →  .shots/repeat.json

   这一支存在的理由：页面上那张表如果读数是「跑一次得一个数」，
   它就没有资格被写进 notes。先量它自己的抖动，再决定哪些栏能引用。

   它抓到过一次真事故：wall-clock 计时（取平均、改成取中位数都一样）连跑三轮，
   18 个格子里 14 个抖超过 2 倍，最大 867 倍。
   换成 EXT_disjoint_timer_query_webgl2 之后 18/18 落进 1.05–1.31 倍。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const PORT = 9378;
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

(async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-plate/?once`;
  const profile = path.join(process.env.TEMP, 'chrome-rep-' + Date.now());
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--hide-scrollbars', '--use-angle=d3d11', '--force-color-profile=srgb',
    '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=2',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 80; i++) {
    try { await req('GET', '/json/version'); break; } catch { await sleep(250); }
  }
  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1200, height: 900, deviceScaleFactor: 2, mobile: false,
  });
  await send('Page.navigate', { url: base });
  await sleep(2500);

  const runs = [];
  for (let r = 0; r < 3; r++) {
    const out = await send('Runtime.evaluate', {
      expression: 'window.__star.measure({samples:24}).then(r => JSON.stringify(r)).catch(e => JSON.stringify({error: String(e && e.stack || e)}))',
      awaitPromise: true, returnByValue: true,
    });
    const parsed = JSON.parse(out.result.value);
    if (parsed.error) { console.error('measure threw:', parsed.error); process.exit(1); }
    runs.push(parsed);
    console.log(`run ${r + 1} done`);
  }

  /* 每个 (构造, 材质) 在三轮里的中位数 GPU 耗时，以及 max/min 之比 */
  const key = (x) => `${x.con}/${x.mat}`;
  const table = {};
  for (const run of runs) {
    for (const row of run.rows) {
      const k = key(row);
      (table[k] ??= { gpu: [], tris: row.tris, calls: row.calls }).gpu.push(row.gpu);
    }
  }
  const summary = Object.entries(table).map(([k, v]) => {
    const g = v.gpu.filter((x) => x != null);
    const spread = g.length ? Math.max(...g) / Math.max(0.0001, Math.min(...g)) : 0;
    return {
      key: k, tris: v.tris, calls: v.calls,
      gpuRuns: g.map((x) => +x.toFixed(3)),
      gpuSpread: +spread.toFixed(2),
      stable: spread < 1.5,
    };
  });

  fs.writeFileSync(path.join(__dirname, '.shots', 'repeat.json'), JSON.stringify({ summary }, null, 2));
  console.log('\nkey                 tris  gpu runs (ms)              spread  stable');
  for (const s of summary) {
    console.log(
      `${s.key.padEnd(18)} ${String(s.tris).padStart(5)}  ${s.gpuRuns.map((x) => x.toFixed(2).padStart(6)).join(' ')}  ${String(s.gpuSpread).padStart(6)}x  ${s.stable ? 'yes' : 'NO'}`,
    );
  }

  ws.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });