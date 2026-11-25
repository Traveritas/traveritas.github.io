/* 星 · 深度 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-gl/.shot.cjs [tag]
   需要 serve.cjs 在 4670 上跑着。
   输出 .shots/<tag>-*.png 与 <tag>-report.json

   它做四件不许偷懒的事：
     ① 每张 PNG 回来都自己解一遍像素：不能是一整片同色，墨点比例要落在合理区间
     ② 真按一次「翻一次」，等它停，取回帧数；再 window.__star.probeIdle(2000) 取证「零帧」
     ③ 用 Emulation.setEmulatedMedia 验 prefers-reduced-motion: reduce 下不播动画
     ④ 单独拍两张单要素图（对照表、九格中心），这是这一轮真正要判的东西 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4670/star-gl/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9470 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1560);
const H = Number(process.env.H || 1100);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-gl-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PNG = (() => {
  const zlib = require('zlib');
  return (buf) => {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
    let off = 8;
    let w = 0;
    let h = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === 'IHDR') {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
      } else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      off += 12 + len;
    }
    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { w, h, unsupported: true };
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = colorType === 6 ? 4 : 3;
    const stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++];
      const line = raw.slice(p, p + stride);
      p += stride;
      const cur = out.slice(y * stride, (y + 1) * stride);
      const prev = y ? out.slice((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= bpp ? prev[x - bpp] : 0;
        let v = line[x];
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[x] = v & 0xff;
      }
    }
    const colors = new Set();
    let ink = 0;
    let lumSum = 0;
    let n = 0;
    const step = Math.max(1, Math.floor((w * h) / 60000));
    for (let i = 0; i < w * h; i += step) {
      const o = i * bpp;
      const r = out[o];
      const g = out[o + 1];
      const b2 = out[o + 2];
      n++;
      lumSum += (r + g + b2) / 3;
      if (colors.size < 6000) colors.add(((r >> 2) << 12) | ((g >> 2) << 6) | (b2 >> 2));
      if (r + g + b2 < 620) ink++;
    }
    return { w, h, colors: colors.size, meanLum: +(lumSum / n).toFixed(2), darkShare: +(ink / n).toFixed(4) };
  };
})();

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    this.events = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { res, rej } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (this.waiting.has(id)) {
          this.waiting.delete(id);
          rej(new Error('timeout ' + method));
        }
      }, 60000);
    });
  }
}

async function launch() {
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--remote-debugging-port=' + DP,
      '--user-data-dir=' + PROFILE,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu-sandbox',
      '--force-device-scale-factor=1',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DP}/json/version`);
      const j = await r.json();
      return { proc, wsUrl: j.webSocketDebuggerUrl };
    } catch {
      await sleep(200);
    }
  }
  throw new Error('chrome 没能起来');
}

(async () => {
  const { proc, wsUrl } = await launch();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Network.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  await S('Page.navigate', { url: URL });
  let readyOk = false;
  for (let i = 0; i < 100; i++) {
    const ok = await evaluate('window.__ready === true').catch(() => false);
    if (ok) {
      readyOk = true;
      break;
    }
    await sleep(200);
  }
  await sleep(1000);

  const errors = cdp.events
    .filter(
      (e) =>
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Network.responseReceived' && e.params.response.status >= 400),
    )
    .map((e) => {
      if (e.method === 'Network.responseReceived') return `HTTP ${e.params.response.status} ${e.params.response.url}`;
      if (e.method === 'Log.entryAdded') return `${e.params.entry.source}: ${e.params.entry.text}`;
      const d = e.params.exceptionDetails;
      return `exception: ${d.text} ${d.exception?.description || ''}`;
    });

  const shot = async (name, box) => {
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), buf);
    let stats = null;
    try {
      stats = PNG(buf);
    } catch (e) {
      stats = { error: String(e.message) };
    }
    return { file: `${TAG}-${name}.png`, bytes: buf.length, stats };
  };

  const docH = await evaluate('document.documentElement.scrollHeight');
  const sections = await evaluate(`
    (() => { const o = {}; for (const el of document.querySelectorAll('section')) { const r = el.getBoundingClientRect(); o[el.id || ('s' + Object.keys(o).length)] = { y: Math.round(r.top + scrollY), h: Math.round(r.height) }; } return o; })()
  `);

  const elBox = async (sel) =>
    evaluate(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; })()
    `);

  const files = [];
  const order = ['cmp', 'centre', 'motion', 'cost', 'discipline'];
  for (const id of order) {
    const s = sections[id];
    if (!s) continue;
    files.push(await shot(`sec-${id}`, { x: 0, y: Math.max(0, s.y - 14), width: W, height: Math.min(s.h + 40, docH - Math.max(0, s.y - 14)) }));
  }
  files.push(await shot('full', { x: 0, y: 0, width: W, height: Math.min(docH, 12000) }));

  /* 单要素：这两个是这一轮真正要判的 */
  const cmpL = await elBox('#cmp-light');
  if (cmpL) files.push(await shot('cmp-light', { x: Math.max(0, cmpL.x - 26), y: Math.max(0, cmpL.y - 26), width: cmpL.w + 52, height: cmpL.h + 52 }));
  const cmpD = await elBox('#cmp-deep');
  if (cmpD) files.push(await shot('cmp-deep', { x: Math.max(0, cmpD.x - 26), y: Math.max(0, cmpD.y - 26), width: cmpD.w + 52, height: cmpD.h + 52 }));
  const pair = await elBox('.centre-pair');
  if (pair) files.push(await shot('centre-pair', { x: Math.max(0, pair.x - 10), y: Math.max(0, pair.y - 10), width: pair.w + 20, height: pair.h + 40 }));
  const sw = await elBox('#c-sweep');
  if (sw) files.push(await shot('centre-sweep', { x: Math.max(0, sw.x - 10), y: Math.max(0, sw.y - 10), width: sw.w + 20, height: sw.h + 20 }));
  const plot = await elBox('.plotbox');
  if (plot) files.push(await shot('plot', { x: Math.max(0, plot.x - 8), y: Math.max(0, plot.y - 8), width: plot.w + 16, height: plot.h + 16 }));
  const strip = await elBox('#m-strip');
  if (strip) files.push(await shot('strip', { x: Math.max(0, strip.x - 8), y: Math.max(0, strip.y - 8), width: strip.w + 16, height: strip.h + 16 }));

  /* 真按一次，等它停，再取证零帧 */
  const flipRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      document.querySelector('#m-btn').click();
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 2600));
      const after = window.__star.frames();
      const st = window.__star.state();
      const proof = await window.__star.probeIdle(2000);
      return { before, after, drawn: after - before, elapsed: Math.round(performance.now() - t0), state: st, proof };
    })()
  `);
  await sleep(300);
  files.push(await shot('after-flip', { x: 0, y: Math.max(0, sections.discipline.y - 14), width: W, height: Math.min(sections.discipline.h + 40, docH) }));

  /* reduced-motion */
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 80; i++) {
    const ok = await evaluate('window.__ready === true').catch(() => false);
    if (ok) break;
    await sleep(200);
  }
  await sleep(700);
  const rmRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      document.querySelector('#d-btn').click();
      await new Promise((r) => setTimeout(r, 500));
      const st = window.__star.state();
      return { before, after: window.__star.frames(), raf: st.disc.raf, reduced: st.disc.reduced, glRm: window.__gl.rmRun };
    })()
  `);

  const readout = await evaluate('JSON.parse(JSON.stringify({ gl: window.__gl, glRmRun: window.__gl.rmRun }))');

  const verdicts = [];
  for (const f of files) {
    const s = f.stats || {};
    const ok = !s.error && s.colors > 3 && (s.darkShare > 0.0002 || s.meanLum < 250) && f.bytes > 2000;
    verdicts.push({ file: f.file, bytes: f.bytes, ...s, ok });
  }

  const report = { url: URL, readyOk, docH, width: W, height: H, sections, errors, readout, flipRun, rmRun, files: verdicts };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        readyOk,
        errors,
        docH,
        flipRun,
        rmRun,
        okCount: verdicts.filter((v) => v.ok).length,
        bad: verdicts.filter((v) => !v.ok),
        files: verdicts.map((v) => v.file),
      },
      null,
      2,
    ),
  );

  ws.close();
  proc.kill();
  await sleep(400);
  try {
    require('child_process').execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
  await sleep(600);
  for (let i = 0; i < 8; i++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
      break;
    } catch {
      await sleep(400);
    }
  }
  process.exit(0);
})().catch(async (e) => {
  console.error('FAIL', e);
  try {
    require('child_process').execSync(`taskkill /F /T /PID ${process.pid}`, { stdio: 'ignore' });
  } catch {}
  process.exit(1);
});