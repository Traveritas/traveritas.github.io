/* 星 · 晶体折射 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-crystal3d/.shot.cjs [tag]
   需要 serve.cjs 在 4673 上跑着。
   输出 .shots/<tag>-*.png 与 <tag>-report.json

   它做四件不许偷懒的事：
     ① 每张 PNG 回来都自己解一遍像素：不能是一整片同色；给出颜色数 / 平均亮度 / 暗点比例
     ② 真按一次「翻一次」，等它停下，取回帧数；再 __star.probeIdle(2000) 取证「零帧」
     ③ 用 Emulation.setEmulatedMedia 验 prefers-reduced-motion: reduce
     ④ 单独拍每一节的主图（这一轮要判的东西），而不是只拍一张长图
   每一张都会被读回像素；读不出内容就报 ok:false 并把读数写进 report。 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4673/star-crystal3d/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9473 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1520);
const H = Number(process.env.H || 1080);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-c3d-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 自带 PNG 解码：只要 8-bit RGB/RGBA。返回色彩统计，用来证明「这张不是空白」。 */
function decodePNG(buf) {
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
  return { w, h, bpp, data: out };
}

/** 统计：颜色数、平均亮度、与四角底色的偏离、星内占位 */
function stats(buf) {
  const img = decodePNG(buf);
  if (img.unsupported) return { w: img.w, h: img.h, unsupported: true };
  const { w, h, bpp, data } = img;
  const colors = new Set();
  let lum = 0;
  let n = 0;
  let dev = 0; // 与四角均值的偏差像素数
  const corner = (() => {
    const picks = [
      [3, 3],
      [w - 4, 3],
      [3, h - 4],
      [w - 4, h - 4],
    ].map(([x, y]) => {
      const o = (y * w + x) * bpp;
      return [data[o], data[o + 1], data[o + 2]];
    });
    return [0, 1, 2].map((k) => Math.round(picks.reduce((a, p) => a + p[k], 0) / picks.length));
  })();
  const step = Math.max(1, Math.floor((w * h) / 90000));
  for (let i = 0; i < w * h; i += step) {
    const o = i * bpp;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    n++;
    lum += (r + g + b) / 3;
    if (colors.size < 8000) colors.add(((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2));
    if (Math.abs(r - corner[0]) + Math.abs(g - corner[1]) + Math.abs(b - corner[2]) > 12) dev++;
  }
  return {
    w,
    h,
    colors: colors.size,
    meanLum: +(lum / n).toFixed(2),
    corner: `rgb(${corner.join(',')})`,
    deviate: +(dev / n).toFixed(4),
  };
}

/* ONLY=01,05 只拍一部分；SKIP_COST=1 跳过测算；FAST=1 等同 ONLY 默认集 + SKIP_COST */
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const FAST = process.env.FAST === '1';
const SKIP_COST = process.env.SKIP_COST === '1' || FAST;
const SNAP = [
  ['#light-a', '01-mat-light'],
  ['#light-c', '02-mat-400'],
  ['#light-b', '03-mat-refract'],
  ['#deep-a', '04-mat-deep'],
  ['#lights', '05-light-cols'],
  ['#wake-stage', '06-wake'],
  ['#endpoints', '07-endpoints'],
  ['#tumble-stage', '08-tumble'],
  ['#drift-stage', '09-drift'],
  ['#c-table', '10-cost-table'],
  ['#spine-bars', '11-spine-bars'],
];
const wanted = (name) => (ONLY.length ? ONLY.some((p) => name.startsWith(p)) : true);

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
      }, 90000);
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
  for (let i = 0; i < 150; i++) {
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
  for (let i = 0; i < 120; i++) {
    try {
      if (await evaluate('window.__ready === true')) {
        readyOk = true;
        break;
      }
    } catch {}
    await sleep(200);
  }
  await sleep(1400);

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
      const d = e.params.exceptionThrown?.exceptionDetails || e.params.exceptionDetails;
      return `exception: ${d?.text} ${d?.exception?.description || ''}`;
    });

  const shot = async (name, box) => {
    const { data } = await S('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: Math.max(2, box.width), height: Math.max(2, box.height), scale: 1 },
    });
    const buf = Buffer.from(data, 'base64');
    const file = path.join(OUT, `${TAG}-${name}.png`);
    fs.writeFileSync(file, buf);
    let st;
    try {
      st = stats(buf);
    } catch (e) {
      st = { error: String(e.message) };
    }
    return { file: `${TAG}-${name}.png`, bytes: buf.length, ...st };
  };

  const docH = await evaluate('document.documentElement.scrollHeight');
  const sections = await evaluate(`
    (() => { const o = {}; for (const el of document.querySelectorAll('section')) {
      const r = el.getBoundingClientRect(); o[el.id] = { y: Math.round(r.top + scrollY), h: Math.round(r.height) }; } return o; })()
  `);
  const box = (sel) =>
    evaluate(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) }; })()
    `);

  const files = [];

  /* ── 这张是这一轮的主图：五档 × 两种底色 ── */
  for (const [id, name] of SNAP) {
    if (!wanted(name)) continue;
    const b = await box(id);
    if (!b) continue;
    const pad = 14;
    files.push(await shot(name, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 }));
  }

  /* 单颗 400px 的正位特写：判断「一张脸到底亮不亮」用的 */
  if (wanted('12')) {
    const c400 = await box('#light-c .cell:nth-child(2)');
    if (c400) files.push(await shot('12-crystal-400', c400));
  }

  /* ── 真按一次，等它停，再取证零帧 ── */
  const flipRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      window.__star.flip();
      await new Promise((r) => setTimeout(r, 2500));
      const after = window.__star.frames();
      const st = window.__star.state();
      const proof = await window.__star.probeIdle(2000);
      const pose = window.__star.pose();
      return { before, after, drawn: after - before, state: st, proof, pose };
    })()
  `);
  await sleep(300);
  const tsec = sections.hold;
  if (tsec && wanted('13')) files.push(await shot('13-after-flip', { x: 0, y: Math.max(0, tsec.y - 10), width: W, height: Math.min(tsec.h + 30, docH) }));

  /* ── 漂移 vs 静止：跑 1.5 秒，看两格像素差 ── */
  const driftRun = await evaluate(`
    (async () => {
      window.__star.drift.on();
      await new Promise((r) => setTimeout(r, 1500));
      const frames = window.__star.drift.frames();
      window.__star.drift.off();
      return { frames };
    })()
  `);

  /* ── 醒度：拉到梦端再拍一张，证明星真的换调 ── */
  await evaluate('window.__star.setMix(0)');
  await sleep(500);
  const wsec = sections.wake;
  if (wsec && wanted('14')) files.push(await shot('14-dream-mix', { x: 0, y: Math.max(0, wsec.y - 10), width: W, height: Math.min(wsec.h + 30, docH) }));
  const palDream = await evaluate('window.__star.palette("light", 0)');
  await evaluate('window.__star.setMix(1)');
  await sleep(300);
  const palWake = await evaluate('window.__star.palette("light", 1)');

  /* ── 代价 ── */
  const cost = SKIP_COST ? [] : await evaluate('window.__star.measure({size:480, frames:40, blocks:5})');
  const lightRows = await evaluate('window.__star.lightRepo');

  /* ── reduced-motion ── */
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 100; i++) {
    try {
      if (await evaluate('window.__ready === true')) break;
    } catch {}
    await sleep(200);
  }
  await sleep(900);
  const rmRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      const r = window.__star.flip();
      const state = window.__star.state();
      const proof = await window.__star.probeIdle(800);
      return { before, after: window.__star.frames(), start: r, state, proof };
    })()
  `);

  const verdicts = files.map((f) => ({
    ...f,
    ok: !f.error && f.colors > 6 && f.deviate > 0.004 && f.bytes > 1800,
  }));

  const report = { url: URL, readyOk, docH, width: W, height: H, sections, errors, flipRun, driftRun, rmRun, palDream, palWake, cost, lightRows, files: verdicts };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        readyOk,
        errors,
        docH,
        flipRun,
        driftRun,
        rmRun: { before: rmRun.before, after: rmRun.after, start: rmRun.start, raf: rmRun.state.raf, reduce: rmRun.state.reduce, proof: rmRun.proof },
        palDream,
        palWake,
        okCount: verdicts.filter((v) => v.ok).length,
        bad: verdicts.filter((v) => !v.ok),
        files: verdicts.map((v) => ({ f: v.file, colors: v.colors, dev: v.deviate, lum: v.meanLum, corner: v.corner, ok: v.ok })),
      },
      null,
      2,
    ),
  );

  ws.close();
  proc.kill();
  await sleep(400);
  try {
    execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {}
  await sleep(700);
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
    execSync(`taskkill /F /T /PID ${process.pid}`, { stdio: 'ignore' });
  } catch {}
  process.exit(1);
});