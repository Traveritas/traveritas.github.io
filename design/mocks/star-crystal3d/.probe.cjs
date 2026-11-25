/* 临时探针：把页面的 console / 异常全部打出来
   node design/mocks/star-crystal3d/.probe.cjs */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4673/star-crystal3d/';
const DP = 9490;
const PROFILE = path.join(process.env.TEMP || '.', `chrome-probe-${process.pid}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + DP, '--user-data-dir=' + PROFILE,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 120; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json()).webSocketDebuggerUrl; break; } catch { await sleep(200); }
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map(); const logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Log.entryAdded') logs.push(`[${m.params.entry.level}/${m.params.entry.source}] ${m.params.entry.text}`);
    else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; logs.push('[exception] ' + d.text + ' ' + (d.exception?.description || '')); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');
  await S('Page.navigate', { url: URL });
  await sleep(4500);
  const ev = async (x) => (await S('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  console.log('ready =', await ev('window.__ready'));
  console.log('star  =', await ev('typeof window.__star'));
  console.log('stages=', await ev('window.__star ? Object.keys(window.__star.stages) : null'));
  console.log('cells =', await ev('window.__star ? window.__star.stages["light-a"].cells.length : null'));
  console.log('rect  =', await ev('(()=>{const c=document.querySelector("#light-a .cell");const r=c.getBoundingClientRect();return [r.width,r.height];})()'));
  console.log('hostR =', await ev('(()=>{const c=document.querySelector("#light-a");const r=c.getBoundingClientRect();return [r.width,r.height];})()'));
  console.log('canvas=', await ev('(()=>{const c=document.querySelector("#light-a canvas");return c?[c.width,c.height,c.dataset.opaque,c.style.width,c.style.height]:null;})()'));
  console.log('frames=', await ev('window.__star ? window.__star.frames() : null'));
  console.log('--- logs ---');
  console.log(logs.join('\n') || '(none)');
  ws.close(); proc.kill();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(500);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();