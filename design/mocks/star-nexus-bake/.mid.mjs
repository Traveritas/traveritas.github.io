/* 颜色方案验证：真渲一帧 dream=0.5 的中间态，看「两套图交叉淡入」与它差多少。
   这一步决定：能不能只发一套 + CSS 染色。
   —— 若中间态落在两套图的线性插值附近（差 < 2/255），两套交叉淡入就够，够平滑；
   —— 若 CSS 的一个仿射映射（每通道 a·v+b）能把醒面推到梦面（残差 < 2/255），
      那就只发一套。
   这里同时渲中间态并量两件事。 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '.shots');
const FRAMES = path.join(HERE, 'frames');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sharp = (await import('sharp')).default;
const m = await import('file:///' + path.join(HERE, 'bake.mjs').replace(/\\/g, '/'));

const profile = path.join(process.env.TEMP, 'chrome-crystal-col-' + process.pid);
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9475', '--user-data-dir=' + profile,
  '--no-first-run', '--hide-scrollbars', '--use-angle=d3d11', '--disable-gpu-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9475/json/version')).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) { const { res, rej } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
});
const send = (a, b = {}, c) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: a, params: b, sessionId: c })); });
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

const poses = JSON.parse(fs.readFileSync(path.join(SHOTS, 'poses.json'), 'utf8'));
fs.mkdirSync(path.join(FRAMES, 'mid'), { recursive: true });

/* 三档中间态：dream = 0.25 / 0.5 / 0.75 */
const DREAM_AT = [0.25, 0.5, 0.75];
for (const size of poses.sizes) {
  for (let i = 0; i < poses.us.length; i++) {
    for (const dm of DREAM_AT) {
      const a = m.renderArgs(poses.us[i], 0, size * poses.dpr, {});
      /* 直接改 dream 的着色参数：NEXUS 的全部 dream 相关项都吃这一个数 */
      a.dream = dm;
      a.core = 0.5 + 0.95 * dm;
      a.coreC = [0, 0.04 + 0.1 * dm, 0];
      a.rough = 0.45 - 0.12 * dm;
      const url = await ev(`window.__crystal.render(${JSON.stringify(a)})`);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      fs.writeFileSync(path.join(FRAMES, 'mid', `${size}-${String(i).padStart(2, '0')}-d${Math.round(dm * 100)}.png`), buf);
    }
  }
}

/* 量：① 中间态 vs 两套线性插值；② 仿射映射醒→梦的残差 */
const result = [];
for (const size of poses.sizes) {
  const raw = async (f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = [];
  const D = [];
  for (let i = 0; i < poses.us.length; i++) {
    W.push(await raw(path.join(FRAMES, 'base', String(size), 'wake', `f${String(i).padStart(2, '0')}.png`)));
    D.push(await raw(path.join(FRAMES, 'base', String(size), 'dream', `f${String(i).padStart(2, '0')}.png`)));
  }
  const midErr = {};
  for (const dm of DREAM_AT) {
    let mx = 0, sum = 0, n = 0;
    for (let i = 0; i < poses.us.length; i++) {
      const M = await raw(path.join(FRAMES, 'mid', `${size}-${String(i).padStart(2, '0')}-d${Math.round(dm * 100)}.png`));
      const A = W[i], B = D[i];
      for (let p = 0; p < A.info.width * A.info.height; p++) {
        const aw = A.data[p * 4 + 3] / 255, ad = B.data[p * 4 + 3] / 255, am = M.data[p * 4 + 3] / 255;
        if (aw < 0.6 || ad < 0.6 || am < 0.6) continue;
        for (let c = 0; c < 3; c++) {
          /* 两套交叉淡入在 dm 处：按 alpha 加权的线性混合 */
          const lin = A.data[p * 4 + c] * aw * (1 - dm) + B.data[p * 4 + c] * ad * dm;
          const den = aw * (1 - dm) + ad * dm;
          const got = den > 1e-4 ? lin / den : 0;
          const err = Math.abs(got - M.data[p * 4 + c]);
          if (err > mx) mx = err;
          sum += err; n++;
        }
      }
    }
    midErr['d' + Math.round(dm * 100)] = { max: +mx.toFixed(1), mean: +(sum / Math.max(1, n)).toFixed(2) };
  }
  result.push({ size, midErr });
}
console.log(JSON.stringify(result, null, 2));

/* 落定帧（u=1，wake）另存一份给页面首屏用 */
for (const size of poses.sizes) {
  for (const mood of ['wake', 'dream']) {
    const src = path.join(FRAMES, 'base', String(size), mood, `f${String(poses.us.length - 1).padStart(2, '0')}.png`);
    fs.copyFileSync(src, path.join(FRAMES, `rest-${size}-${mood}.png`));
  }
}
console.log('rest 帧已另存');

ws.close(); server.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
await sleep(600);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);