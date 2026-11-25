import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = path.join(process.env.TEMP, 'chrome-nb-mix-' + process.pid);
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9477', '--user-data-dir=' + profile, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) { try { wsUrl = (await (await fetch('http://127.0.0.1:9477/json/version')).json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map(); const evs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } else if (m.method) evs.push(m); });
const send = (a, b = {}, c) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, sessionId: c })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (a, b) => send(a, b, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
const evalx = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
  return r.result.value;
};
await S('Page.navigate', { url: 'http://localhost:4675/star-nexus-bake/' });
for (let i = 0; i < 90; i++) { if (await evalx('window.__ready===true')) break; await sleep(200); }
await sleep(700);
console.log('layers', JSON.stringify(await evalx(`[...document.querySelectorAll('#star .cb-layer')].map(e=>e.className)`)));
console.log('ops', JSON.stringify(await evalx(`[...document.querySelectorAll('#star .cb-layer')].map(e=>getComputedStyle(e).opacity)`)));
console.log('reality var', JSON.stringify(await evalx(`getComputedStyle(document.documentElement).getPropertyValue('--reality-mix')`)));
const r = await evalx(`(async () => {
  const d = document.querySelector('#star .cb-dream');
  const out = [];
  for (const v of [1, 0, 0.5]) {
    document.documentElement.style.setProperty('--reality-mix', String(v));
    await new Promise(r=>setTimeout(r,60));
    out.push({ v, op: getComputedStyle(d).opacity, mix: window.__crystalBake.state().mix, hasObserver: !!window.__crystalBake.star._onMix });
  }
  return out;
})()`);
console.log('sweep', JSON.stringify(r, null, 1));
const net404 = evs.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map((e) => e.params.response.url);
console.log('404', JSON.stringify(net404));
ws.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);