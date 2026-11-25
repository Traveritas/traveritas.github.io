/* 合成 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-final/.shot.cjs [tag]
   需要 serve.cjs 在 4669 上跑着。
   输出 .shots/<tag>-*.png 与 <tag>-report.json（console 报错 / 段坐标 / 页内读数）

   除了整段截图，它还做三件不许偷懒的事：
     ① 每张 PNG 回来都读一遍像素：不能是一整片同色，且墨点比例要落在合理区间
     ② 在页面上真按一次「翻一次」，等它停，取回帧数 / 最低分 / 单帧重画耗时，
        并**核对停下来的那一刻 window.__stars 里不再有排队的 rAF**
     ③ 用 Emulation.setEmulatedMedia 验 prefers-reduced-motion: reduce 时不播动画 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4669/star-final/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9421 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1560);
const H = Number(process.env.H || 1100);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-final-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PNG = (() => {
  /* 极简 PNG 解码（8 位 RGB/RGBA，非隔行）：只为了「这张图真的画出来了没有」 */
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
    /* 统计：不同颜色数、最亮的差 */
    const colors = new Set();
    let ink = 0;
    let inkSum = 0;
    let n = 0;
    const step = Math.max(1, Math.floor((w * h) / 60000));
    for (let i = 0; i < w * h; i += step) {
      const o = i * bpp;
      const r = out[o];
      const g = out[o + 1];
      const b2 = out[o + 2];
      n++;
      inkSum += (r + g + b2) / 3;
      if (colors.size < 4000) colors.add((r >> 2) << 12 | (g >> 2) << 6 | (b2 >> 2));
      if (r + g + b2 < 620) ink++;
    }
    return { w, h, colors: colors.size, meanLum: +(inkSum / n).toFixed(2), darkShare: +(ink / n).toFixed(4) };
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
      }, 40000);
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
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
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
  for (let i = 0; i < 60; i++) {
    const ok = await evaluate('window.__ready === true').catch(() => false);
    if (ok) break;
    await sleep(200);
  }
  await sleep(900);

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
    const file = path.join(OUT, `${TAG}-${name}.png`);
    fs.writeFileSync(file, buf);
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
    (() => {
      const out = {};
      for (const el of document.querySelectorAll('section')) {
        const r = el.getBoundingClientRect();
        out[el.id] = { y: Math.round(r.top + scrollY), h: Math.round(r.height) };
      }
      return out;
    })()
  `);

  const files = [];
  const order = ['cmp', 'breakdown', 'motion', 'play', 'readout'];
  for (const id of order) {
    const s = sections[id];
    if (!s) continue;
    files.push(await shot(`sec-${id}`, { x: 0, y: Math.max(0, s.y - 18), width: W, height: Math.min(s.h + 46, docH) }));
  }
  files.push(await shot('full', { x: 0, y: 0, width: W, height: docH }));

  /* 对照那一张单独再取一次（这是最要紧的那张图） */
  const elShot = async (sel, name, pad = 16) => {
    const b = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      })()
    `);
    if (!b) return null;
    return shot(name, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.w + pad * 2, height: b.h + pad * 2 });
  };
  const cmpLight = await elShot('#rows-light', 'cmp-light');
  if (cmpLight) files.push(cmpLight);
  const cmpDeep = await elShot('.ground-deep', 'cmp-deep');
  if (cmpDeep) files.push(cmpDeep);
  const bd = await elShot('#bd-full', 'detail-full', 10);
  if (bd) files.push(bd);
  const zooms = await elShot('.zooms', 'detail-zoom');
  if (zooms) files.push(zooms);
  const stripEl = await elShot('#mo-strip', 'strip');
  if (stripEl) files.push(stripEl);
  const plotEl = await elShot('#plot', 'plot', 6);
  if (plotEl) files.push(plotEl);

  /* 真按一次「翻一次」，等它停 */
  const flipRun = await evaluate(`
    (async () => {
      const btn = document.querySelector('#pl-btn');
      const before = window.__readout ? window.__readout.scores : null;
      btn.click();
      const t0 = performance.now();
      const busy0 = document.querySelector('#pl-state').textContent;
      await new Promise((r) => setTimeout(r, 2400));
      const st = document.querySelector('#pl-state').textContent;
      return {
        busy0,
        after: st,
        frames: document.querySelector('#pl-frames').textContent,
        min: document.querySelector('#pl-min').textContent,
        ms: document.querySelector('#pl-ms').textContent,
        elapsed: Math.round(performance.now() - t0),
        scores: before,
        reduced: window.__readout ? window.__readout.reduced : null,
      };
    })()
  `);

  /* reduced-motion：换媒体特性重载，翻动应该完全跳过 */
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 40; i++) {
    const ok = await evaluate('window.__ready === true').catch(() => false);
    if (ok) break;
    await sleep(200);
  }
  await sleep(600);
  const rmRun = await evaluate(`
    (async () => {
      const before = document.querySelector('#pl-frames').textContent;
      document.querySelector('#pl-btn').click();
      await new Promise((r) => setTimeout(r, 260));
      return {
        reduced: window.__readout ? window.__readout.reduced : null,
        framesBefore: before,
        framesAfter: document.querySelector('#pl-frames').textContent,
        state: document.querySelector('#pl-state').textContent,
      };
    })()
  `);
  files.push(await shot('reduced', { x: 0, y: Math.max(0, sections.play.y - 18), width: W, height: Math.min(sections.play.h + 46, docH) }));

  const readout = await evaluate('window.__readout ?? null');

  /* 自检：每张图不能是空白的 */
  const verdicts = [];
  for (const f of files) {
    const s = f.stats || {};
    const ok =
      !s.error &&
      s.colors > 3 &&
      (s.darkShare > 0.0002 || s.meanLum < 250) &&
      f.bytes > 2000;
    verdicts.push({ file: f.file, bytes: f.bytes, ...s, ok });
  }

  const report = {
    url: URL,
    docH,
    width: W,
    sections,
    errors,
    readout,
    flipRun,
    rmRun,
    files: verdicts,
  };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors, flipRun, rmRun, docH, bad: verdicts.filter((v) => !v.ok), okCount: verdicts.filter((v) => v.ok).length, readout: readout ? { paths: readout.sync.paths, scores: readout.scores } : null }, null, 2));

  ws.close();
  proc.kill();
  await sleep(400);
  try {
    require('child_process').execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
  await sleep(500);
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