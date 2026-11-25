/* 尺寸阶梯的代价：同一构造在 64/96/144/240 上的 GPU 时间
   node design/mocks/star-v-plate/.sizes.cjs  →  .shots/size-cost.json

   为什么单独一支：构造是填充率主导的，代价应当随像素数接近线性增长。
   实测若不是线性，说明瓶颈在别处（双面透明材质的分层叠加）。
   判据是「每百万像素的毫秒数」，不是绝对毫秒 —— 只有那个数才和尺寸无关。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const PORT = 9380;
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
  const profile = path.join(process.env.TEMP, 'chrome-sz-' + Date.now());
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

  const out = await send('Runtime.evaluate', {
    expression: 'window.__star.measureSizes({}).then(r => JSON.stringify(r)).catch(e => JSON.stringify({error: String(e && e.stack || e)}))',
    awaitPromise: true, returnByValue: true,
  });
  const rows = JSON.parse(out.result.value);
  if (rows.error) { console.error(rows.error); process.exit(1); }

  fs.writeFileSync(path.join(__dirname, '.shots', 'size-cost.json'), JSON.stringify(rows, null, 2));

  console.log('con      size   gpu ms   px(M)   ms per Mpx');
  for (const r of rows) {
    const mpx = r.pixels / 1e6;
    console.log(
      `${r.con.padEnd(8)} ${String(r.size).padStart(4)}  ${(r.gpu ?? 0).toFixed(3).padStart(7)}  ${mpx.toFixed(3).padStart(6)}  ${((r.gpu ?? 0) / mpx).toFixed(2).padStart(10)}`,
    );
  }

  ws.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });