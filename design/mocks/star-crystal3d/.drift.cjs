/* 漂移 vs 静止：同一格在两个时刻各拍一张，逐像素比。
   回答「一点点转动到底买到了什么」—— 不能靠眼睛看两张 240px 的图说「好像有点不一样」。
   node design/mocks/star-crystal3d/.drift.cjs → .shots/drift.json + .shots/drift-pair.png */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4673/star-crystal3d/';
const DP = 9600 + Math.floor(Math.random() * 60);
const OUT = path.join(__dirname, '.shots');
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-drift-${process.pid}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function decode(buf) {
  let off = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const t = buf.toString('ascii', off + 4, off + 8);
    const d = buf.slice(off + 8, off + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const line = raw.slice(p, p + stride); p += stride;
    const cur = out.slice(y * stride, (y + 1) * stride), prev = y ? out.slice((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

function diff(A, B) {
  const n = Math.min(A.data.length, B.data.length);
  let changed = 0, total = 0, sum = 0, maxd = 0;
  for (let i = 0; i < n; i += A.bpp) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    total++; sum += d; if (d > 6) changed++; if (d > maxd) maxd = d;
  }
  return {
    px: total,
    changedPct: +((changed / total) * 100).toFixed(2),
    meanAbs: +(sum / total).toFixed(2),
    maxAbs: maxd,
  };
}

(async () => {
  const proc = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox',
    '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 150; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json()).webSocketDebuggerUrl; break; } catch { await sleep(200); } }
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
  await S('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 120; i++) { try { const r = await S('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true }); if (r.result.value) break; } catch {} await sleep(200); }
  await sleep(1500);

  const ev = async (x) => (await S('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  const boxes = await ev(`
    (() => { const o = {}; document.querySelectorAll('#drift-stage .cell').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      o[i] = { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) }; });
      return o; })()
  `);
  const grab = async (b) => decode(Buffer.from((await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...b, scale: 1 } })).data, 'base64'));

  /* A：两颗都不动，隔 700ms 各拍一次 —— 这应当是 0，用来证明「差异不是噪声」 */
  const still0 = await grab(boxes[0]);
  await sleep(700);
  const still1 = await grab(boxes[0]);
  const noise = diff(still0, still1);
  const driftStill0 = await grab(boxes[1]);
  await sleep(700);
  const driftStill1 = await grab(boxes[1]);
  const noiseR = diff(driftStill0, driftStill1);

  /* B：开漂移，再隔 700ms 各拍一次 */
  await ev('window.__star.drift.on()');
  await sleep(400);
  const d0 = await grab(boxes[1]);
  await sleep(700);
  const d1 = await grab(boxes[1]);
  await ev('window.__star.drift.off()');
  const moved = diff(d0, d1);

  const stillLeft = await grab(boxes[0]);
  const stillRight = await grab(boxes[1]);
  const pairDiff = diff(stillLeft, stillRight);

  const out = { noise, noiseRight: noiseR, drift: moved, leftVsRight: pairDiff, boxes };
  fs.writeFileSync(path.join(OUT, 'drift.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close(); proc.kill();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(500);
  for (let i = 0; i < 6; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });