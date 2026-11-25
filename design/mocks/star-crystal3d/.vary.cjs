/* 临时：拍 .vary.html 的一屏
   node design/mocks/star-crystal3d/.vary.cjs "m=geo" out.png */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const Q = process.argv[2] || 'm=geo';
const OUTNAME = process.argv[3] || 'vary.png';
const PORT = process.env.PORT || 4673;
const URL = `http://localhost:${PORT}/star-crystal3d/.vary.html?${Q}`;
const DP = 9500 + Math.floor(Math.random() * 80);
const OUT = path.join(__dirname, '.shots');
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-vary-${process.pid}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox',
    '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 150; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json()).webSocketDebuggerUrl; break; } catch { await sleep(200); } }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map(); const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(m.params.entry.text);
    else if (m.method === 'Runtime.exceptionThrown') logs.push('[ex] ' + m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1320, height: 1200, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 100; i++) { try { const r = await S('Runtime.evaluate', { expression: 'window.__v && window.__v.ready === true', returnByValue: true }); if (r.result.value) break; } catch {} await sleep(200); }
  await sleep(1200);
  const h = (await S('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value;
  const w = (await S('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth', returnByValue: true })).result.value;
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, 4000), scale: 1 } });
  fs.writeFileSync(path.join(OUT, OUTNAME), Buffer.from(data, 'base64'));
  console.log('saved', OUTNAME, w, h, logs.length ? logs.join('\n') : '');
  ws.close(); proc.kill();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(500);
  for (let i = 0; i < 6; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });