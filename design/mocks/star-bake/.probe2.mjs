/* 临时探针：读 index.html 的 console / 异常 */
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
const profile = path.join(process.env.TEMP, `chrome-probe2-${process.pid}`);
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9434', '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 100; i++) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9434/json/version')).json()).webSocketDebuggerUrl; break; } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map(); const events = [];
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
await S('Page.navigate', { url: `http://127.0.0.1:${port}/star-bake/` });
await sleep(6000);
const ev = await S('Runtime.evaluate', { expression: 'JSON.stringify({ready: window.__ready, hasStar: !!window.__star, readout: !!window.__readout})', returnByValue: true });
console.log('EVAL', JSON.stringify(ev));
for (const e of events) {
  if (e.method === 'Log.entryAdded') console.log('LOG', e.params.entry.level, e.params.entry.text);
  if (e.method === 'Runtime.exceptionThrown') console.log('EXC', (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text || '').slice(0, 900));
  if (e.method === 'Network.responseReceived' && e.params.response.status >= 400) console.log('NET', e.params.response.status, e.params.response.url);
  if (e.method === 'Runtime.consoleAPICalled' && e.params.type !== 'log') console.log('CONSOLE', e.params.type, JSON.stringify(e.params.args).slice(0, 600));
}
ws.close(); server.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(400);
process.exit(0);