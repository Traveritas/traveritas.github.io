/* 直接诊断：起一个 chrome，调 baking 页，看 (a) uniform 是否真的设进了 shader
   (b) 每个像素的 cov，(c) 中心那条视线的返回颜色。 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = path.join(process.env.TEMP, 'chrome-crystal-diag-' + process.pid);

const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9471', '--user-data-dir=' + profile,
  '--no-first-run', '--hide-scrollbars', '--use-angle=d3d11', '--disable-gpu-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9471/json/version')).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const ev = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

const { createRequire } = await import('node:module');
const req = createRequire(path.join(HERE, 'serve.cjs'));
const { start } = req(path.join(HERE, 'serve.cjs'));
const server = await start(0);
await S('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/star-nexus-bake/bake.html` });
for (let i = 0; i < 100; i++) { if (await ev('window.__ready === true').catch(() => false)) break; await sleep(150); }

const m = await import('file:///' + path.join(HERE, 'bake.mjs').replace(/\\/g, '/'));
const info = await ev('window.__crystal.info()');
console.log('GPU', JSON.stringify(info));

for (const dbg of [0, 1]) {
  const args = m.renderArgs(0, 0, 64, { bg: !dbg });
  args.dbg = !!dbg;
  const res = await ev(`(() => {
    window.__crystal.render(${JSON.stringify(args)});
    const c = document.getElementById('c');
    const g = c.getContext('webgl2');
    const px = new Uint8Array(c.width * c.height * 4);
    g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    let covSum = 0, alphaOnes = 0, centers = [];
    for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; covSum += a; if (a > 250) alphaOnes++; }
    const at = (x, y) => { const o = ((y * c.width) + x) * 4; return [px[o], px[o+1], px[o+2], px[o+3]]; };
    return { dbg: ${dbg ? 1 : 0}, w: c.width, meanAlpha: +(covSum / (px.length / 4)).toFixed(2), alphaOnes,
             center: at(32, 32), corner: at(2, 2), edge: at(32, 6), sample: at(16, 48) };
  })()`);
  console.log(JSON.stringify(res));
}
console.log('uniform check', JSON.stringify(await ev(`(() => {
  const c = document.getElementById('c'); const g = c.getContext('webgl2');
  return { err: g.getError(), w: c.width };
})()`)));

ws.close(); server.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);