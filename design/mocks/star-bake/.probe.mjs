/* 临时探针：看 .bake.html 在 headless Chrome 里为什么没起来 */
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = createRequire(path.join(HERE, 'serve.cjs'));
const { start } = req(path.join(HERE, 'serve.cjs'));
const server = await start(0);
const port = server.address().port;
const profile = path.join(process.env.TEMP, `chrome-probe-${process.pid}`);
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9433', '--user-data-dir=' + profile, '--use-angle=d3d11', '--no-first-run', '--disable-gpu-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 100; i++) {
  try {
    wsUrl = (await (await fetch('http://127.0.0.1:9433/json/version')).json()).webSocketDebuggerUrl;
    break;
  } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
const events = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { res } = waiting.get(m.id); waiting.delete(m.id); res(m.result ?? m.error); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; waiting.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
await S('Page.navigate', { url: `http://127.0.0.1:${port}/star-bake/.bake.html` });
await sleep(4000);
const ev = await S('Runtime.evaluate', { expression: 'JSON.stringify({ready: window.__ready, hasBake: !!window.__bake})', returnByValue: true });
console.log('EVAL', JSON.stringify(ev));
for (const e of events) {
  if (e.method === 'Log.entryAdded') console.log('LOG', e.params.entry.level, e.params.entry.text);
  if (e.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(e.params.exceptionDetails).slice(0, 600));
  if (e.method === 'Network.responseReceived') console.log('NET', e.params.response.status, e.params.response.url);
  if (e.method === 'Runtime.consoleAPICalled') console.log('CONSOLE', e.params.type, JSON.stringify(e.params.args).slice(0, 400));
}
ws.close(); server.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(400);
process.exit(0);