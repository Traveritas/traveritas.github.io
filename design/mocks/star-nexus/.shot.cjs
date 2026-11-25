/* 星 · 晶体 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-nexus/.shot.cjs [tag]
   需要 serve.cjs 在 4674 上跑着。
   输出 .shots/<tag>-*.png 与 <tag>-report.json

   它做五件不许偷懒的事：
     ① 每张 PNG 回来都自己解一遍像素：不能是一整片同色；给出颜色数 / 平均亮度 / 暗点比例
     ② 真按一次「翻一次」，等它停下，取回帧数；再 __star.probeIdle(2000) 取证「零帧」
     ③ 用 Emulation.setEmulatedMedia 验 prefers-reduced-motion: reduce
     ④ 单独拍每一节的主图，而不是只拍一张长图
     ⑤ 把主星那一格单独裁出来存一份，用来跟 nexus-slice/wake.webp 并排看
   每一张都会被读回像素；读不出内容就报 ok:false 并把读数写进 report。 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4674/star-nexus/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9574 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 1000);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-nexus-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function stats(buf) {
  const img = decodePNG(buf);
  if (img.unsupported) return { w: img.w, h: img.h, unsupported: true };
  const { w, h, bpp, data } = img;
  const colors = new Set();
  let lum = 0;
  let n = 0;
  let dev = 0;
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

/** 只看星星本身：跟底色偏开的那一片的平均色与色域（判「是不是灰的」） */
function inkStats(buf) {
  const img = decodePNG(buf);
  if (img.unsupported) return { unsupported: true };
  const { w, h, bpp, data } = img;
  const bg = [data[(3 * w + 3) * bpp], data[(3 * w + 3) * bpp + 1], data[(3 * w + 3) * bpp + 2]];
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let lo = 255;
  let hi = 0;
  let sat = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp;
    const d = Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);
    if (d <= 12) continue;
    n++;
    r += data[o];
    g += data[o + 1];
    b += data[o + 2];
    const l = (data[o] + data[o + 1] + data[o + 2]) / 3;
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
    sat += Math.max(data[o], data[o + 1], data[o + 2]) - Math.min(data[o], data[o + 1], data[o + 2]);
  }
  if (!n) return { share: 0 };
  return {
    share: +((n / (w * h)) * 100).toFixed(2),
    mean: `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`,
    lumLo: Math.round(lo),
    lumHi: Math.round(hi),
    /** 平均色度：>12 就明显带色，<6 就读成灰 */
    chroma: +(sat / n).toFixed(1),
  };
}

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const FAST = process.env.FAST === '1';
const SKIP_COST = process.env.SKIP_COST === '1' || FAST;
const SNAP = [
  ['#solid .cell', '01-crystal'],
  ['#versus .cell', '02-versus-star'],
  ['#shape .rows > div:nth-child(1)', '03-thick'],
  ['#shape .rows > div:nth-child(2)', '04-arc'],
  ['#shape .rows > div:nth-child(3)', '05-round'],
  ['#wake .stage', '06-wake-dream'],
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
  await sleep(1600);

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
    let ink;
    try {
      st = stats(buf);
      ink = inkStats(buf);
    } catch (e) {
      st = { error: String(e.message) };
      ink = { error: String(e.message) };
    }
    return { file: `${TAG}-${name}.png`, bytes: buf.length, ...st, ink };
  };

  const box = (sel) =>
    evaluate(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) }; })()
    `);

  const files = [];
  for (const [id, name] of SNAP) {
    if (!wanted(name)) continue;
    const b = await box(id);
    if (!b) continue;
    const pad = 10;
    files.push(await shot(name, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 }));
  }

  /* 主星那一格再单独存一份，与 wake.webp 同尺寸（对照用） */
  if (wanted('07')) {
    const b = await box('#solid .cell');
    if (b) files.push(await shot('07-main-square', b));
  }

  const env = await evaluate('({renderer: window.__star.renderer(), fallback: window.__star.fallback(), caps: window.__star.caps, cells: window.__star.cells.length})');

  /* 真按一次，等它停，再取证零帧 */
  const flipRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      window.__star.flip();
      await new Promise((r) => setTimeout(r, 3000));
      const after = window.__star.frames();
      const st = window.__star.state();
      const proof = await window.__star.probeIdle(2000);
      const pose = window.__star.pose();
      return { before, after, drawn: after - before, state: st, proof, pose };
    })()
  `);
  await sleep(300);
  if (wanted('08')) {
    const b = await box('#solid .cell');
    if (b) files.push(await shot('08-after-flip', b));
  }

  /* 醒度：拉到梦端再拍一张，证明星真的换调 */
  await evaluate('window.__star.setMix(0)');
  await sleep(700);
  if (wanted('09')) {
    const b = await box('#wake .stage');
    if (b) files.push(await shot('09-dream', b));
  }
  await evaluate('window.__star.setMix(1)');
  await sleep(800);
  if (wanted('10')) {
    const b = await box('#versus');
    if (b) files.push(await shot('10-versus-pair', b));
  }

  const cost = SKIP_COST ? null : await evaluate('window.__star.measure({frames:40, blocks:5})');

  /* reduced-motion */
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 100; i++) {
    try {
      if (await evaluate('window.__ready === true')) break;
    } catch {}
    await sleep(200);
  }
  await sleep(1000);
  const rmRun = await evaluate(`
    (async () => {
      const before = window.__star.frames();
      const r = window.__star.flip();
      const state = window.__star.state();
      const proof = await window.__star.probeIdle(900);
      return { before, after: window.__star.frames(), start: r, state, proof };
    })()
  `);

  const verdicts = files.map((f) => ({
    ...f,
    ok: !f.error && f.colors > 6 && f.deviate > 0.004 && f.bytes > 1800,
  }));

  const report = { url: URL, readyOk, width: W, height: H, env, errors, flipRun, rmRun, cost, files: verdicts };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        readyOk,
        env,
        errors,
        flipRun,
        rmRun: { before: rmRun.before, after: rmRun.after, start: rmRun.start, raf: rmRun.state.raf, reduce: rmRun.state.reduce, proof: rmRun.proof },
        cost,
        okCount: verdicts.filter((v) => v.ok).length,
        bad: verdicts.filter((v) => !v.ok).map((v) => v.file),
        files: verdicts.map((v) => ({ f: v.file, colors: v.colors, dev: v.deviate, lum: v.meanLum, corner: v.corner, ink: v.ink, ok: v.ok })),
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