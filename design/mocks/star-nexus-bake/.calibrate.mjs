/* 标定：在几个 cardGain / edgeW / rough 上各渲一张，量「晶体像素」的明度分位，
   与 NEXUS 参考的 p1/p10/med/p90 对照。目标不是逐像素相同（形状不同），
   而是**明暗跨度**对得上：参考 p1 92 / med 209，星若 p1 157 就是偏灰。 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '.shots');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sharp = (await import('sharp')).default;
const m = await import('file:///' + path.join(HERE, 'bake.mjs').replace(/\\/g, '/'));

const profile = path.join(process.env.TEMP, 'chrome-crystal-cal-' + process.pid);
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9473', '--user-data-dir=' + profile,
  '--no-first-run', '--hide-scrollbars', '--use-angle=d3d11', '--disable-gpu-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9473/json/version')).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) { const { res, rej } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (a, b) => send(a, b, sessionId);
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
for (let i = 0; i < 120; i++) { if (await ev('window.__ready === true').catch(() => false)) break; await sleep(150); }

function lumStats(buf, info, bg = [240, 243, 246]) {
  const { width: W, height: H, channels: C } = info;
  const L = [];
  for (let p = 0; p < W * H; p++) {
    const a = C === 4 ? buf[p * C + 3] / 255 : 1;
    const r = buf[p * C], g = buf[p * C + 1], b = buf[p * C + 2];
    if (a < 0.6) continue;
    const d = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
    if (d < 8) continue;
    L.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  L.sort((x, y) => x - y);
  const q = (p) => +(L[Math.floor(p * (L.length - 1))] ?? 0).toFixed(1);
  return { n: L.length, p1: q(0.01), p5: q(0.05), p10: q(0.1), med: q(0.5), p90: q(0.9), p99: q(0.99) };
}

/* 参考图的读数 */
const REF = path.resolve(HERE, '../../../public/nexus-slice/wake.webp');
{
  const { data, info } = await sharp(REF).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log('NEXUS  ', JSON.stringify(lumStats(data, info)));
}
const REF_DREAM = path.resolve(HERE, '../nexus-stage/dream.png');
{
  const { data, info } = await sharp(REF_DREAM).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log('NEXUS梦', JSON.stringify(lumStats(data, info)));
}

const variants = [];
for (const cardGain of [1.0, 1.6, 2.2, 3.0])
  for (const edgeW of [0.030, 0.045])
    variants.push({ cardGain, edgeW });

for (const v of variants) {
  const args = m.renderArgs(0, 0, 512, { bg: true, look: { cardGain: v.cardGain, edgeW: v.edgeW } });
  const url = await ev(`window.__crystal.render(${JSON.stringify(args)})`);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  const f = path.join(SHOTS, `cal-c${v.cardGain}-e${v.edgeW}.png`);
  fs.writeFileSync(f, buf);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log(`card ${v.cardGain} edge ${v.edgeW}`.padEnd(24), JSON.stringify(lumStats(data, info)));
}

ws.close(); server.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(600);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);