/* 单个探针页截图（快速迭代几何用）
   node design/mocks/star-v-flora/.quick.cjs "flower" "frost" "light" out-name */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9378;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const req = (method, p) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
          resolve(d);
        }
      });
    });
    r.on('error', reject);
    r.end();
  });

(async () => {
  const form = process.argv[2] || 'flower';
  const mat = process.argv[3] || 'frost';
  const ground = process.argv[4] || 'light';
  const name = process.argv[5] || 'quick';
  const page = process.argv[6] || '.probe.html';

  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-flora/`;
  const profile = path.join(process.env.TEMP, 'chrome-q-' + Date.now());
  const chrome = spawn(
    CHROME,
    [
      '--headless=new', '--hide-scrollbars', '--use-angle=d3d11', '--force-color-profile=srgb',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); }
  }
  if (!up) { console.error('chrome failed'); process.exit(1); }
  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errs.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 720, deviceScaleFactor: 1, mobile: false });
  const extra = process.env.Q || "";
  const url = `${base}${page}?form=${encodeURIComponent(form)}&mat=${mat}&ground=${ground}` + extra;
  await send('Page.navigate', { url });
  await sleep(2200);
  const pl = await send('Runtime.evaluate', {
    expression: `(() => { try { return JSON.stringify(window.__ok ?? null); } catch(e) { return 'ERR '+e.message; } })()`,
    returnByValue: true,
  });
  console.log('window.__ok =', pl.result.value);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  ws.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

