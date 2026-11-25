/* 临时作业：连续跑三次 measureVariants，看每档的稳定区间 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { start } = require('./serve.cjs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9375;
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

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

(async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-crystal/`;
  const profile = path.join(process.env.TEMP, 'chrome-bench-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--use-angle=d3d11', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { await req('GET', '/json/version'); break; } catch { await sleep(250); }
  }
  const t = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: base + '?pose=2' });
  await sleep(2800);

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'window.__star.measure().then(r => JSON.stringify(r))',
      awaitPromise: true, returnByValue: true,
    });
    runs.push(JSON.parse(r.result.value));
    await sleep(400);
  }

  /* 三档各自的 gpu 中位数 / 区间 */
  const summary = {};
  for (const v of ['cheap', 'refract', 'resin']) {
    const gpu = runs.map((r) => r.rows.find((x) => x.variant === v));
    const vals = gpu.map((g) => g.gpu).sort((a, b) => a - b);
    summary[v] = {
      gpuMedian: vals[1],
      gpuRange: [vals[0], vals[2]],
      cpuMedian: gpu.map((g) => g.cpu).sort((a, b) => a - b)[1],
      calls: gpu[0].calls,
      tris: gpu[0].tris,
      programs: gpu[0].programs,
      opaque: gpu[0].opaque,
      samples: gpu.map((g) => g.samples),
    };
  }
  console.log(JSON.stringify({ summary, stepPlan: runs[1].stepPlan, dpr: runs[1].dpr, size: runs[1].size }, null, 1));

  ws.close(); chrome.kill(); server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });