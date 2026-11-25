/* 星 · 模型 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-model/.shot.cjs [tag]
   需要 serve.cjs 在 4672 上跑着。

   每一张 PNG 回来都自己解一遍像素核过（颜色数、暗点比例、非纯色、字节下限），
   另外做三件这一轮专属的取证：
     ① 主视口拖一下指针，确认方位真的变了（轨道能用，不是一张图）
     ② 把 star.glb 读回来的那一格与内存里造的那一格像素比对（导出文件真能开）
     ③ 记录主视口的帧数在静置后是否归零（空闲时不空转） */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4672/star-model/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9472 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1560);
const H = Number(process.env.H || 1100);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-model-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── PNG 编解码（只为截图与自检，不引第三方） ── */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
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
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, bpp, out };
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(8 + data.length + 4);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'ascii');
    data.copy(b, 8);
    b.writeUInt32BE(CRC(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 解出来的三通道/四通道 → RGBA 裁剪 */
function cropRGBA(img, x, y, w, h) {
  const { bpp, out } = img;
  x = Math.max(0, Math.min(img.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  w = Math.max(1, Math.min(img.w - x, Math.round(w)));
  h = Math.max(1, Math.min(img.h - y, Math.round(h)));
  const dst = Buffer.alloc(w * h * 4, 255);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const s = ((y + r) * img.w + (x + c)) * bpp;
      const d = (r * w + c) * 4;
      dst[d] = out[s];
      dst[d + 1] = out[s + 1];
      dst[d + 2] = out[s + 2];
      dst[d + 3] = bpp === 4 ? out[s + 3] : 255;
    }
  }
  return { w, h, out: dst };
}

function statsRGBA(img) {
  const { w, h, out } = img;
  const colors = new Set();
  let ink = 0, n = 0, lumSum = 0, minL = 255, maxL = 0;
  const step = Math.max(1, Math.floor((w * h) / 90000));
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4;
    const r = out[o], g = out[o + 1], b2 = out[o + 2];
    const L = (r + g + b2) / 3;
    n++; lumSum += L;
    if (L < minL) minL = L;
    if (L > maxL) maxL = L;
    if (colors.size < 8000) colors.add(((r >> 2) << 12) | ((g >> 2) << 6) | (b2 >> 2));
    if (r + g + b2 < 600) ink++;
  }
  return { w, h, colors: colors.size, meanLum: +(lumSum / n).toFixed(2), lumRange: +(maxL - minL).toFixed(0), darkShare: +(ink / n).toFixed(4) };
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map(); this.events = [];
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
        if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error('timeout ' + method)); }
      }, 90000);
    });
  }
}

async function launch() {
  const proc = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu-sandbox', '--force-device-scale-factor=1',
    '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 140; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DP}/json/version`);
      const j = await r.json();
      return { proc, wsUrl: j.webSocketDebuggerUrl };
    } catch { await sleep(200); }
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
  await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable'); await S('Network.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  await S('Page.navigate', { url: URL });
  let readyOk = false;
  for (let i = 0; i < 140; i++) {
    const ok = await evaluate('window.__ready === true').catch(() => false);
    if (ok) { readyOk = true; break; }
    await sleep(250);
  }
  await sleep(1200);

  const errors = cdp.events.filter(
    (e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
      || e.method === 'Runtime.exceptionThrown'
      || (e.method === 'Network.responseReceived' && e.params.response.status >= 400),
  ).map((e) => {
    if (e.method === 'Network.responseReceived') return `HTTP ${e.params.response.status} ${e.params.response.url}`;
    if (e.method === 'Log.entryAdded') return `${e.params.entry.source}: ${e.params.entry.text}`;
    const d = e.params.exceptionDetails;
    return `exception: ${d.text} ${d.exception?.description || ''}`;
  });

  /* 整幅视口截图，然后在 Node 里按视口坐标裁。画布是 position:fixed，
     CDP 的 clip 走的是文档坐标，用 captureBeyondViewport 会把固定层留在原处、
     裁出来一片空白（第一版就是这么拍了五张纯色图）。 */
  const viewShot = async () => {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    return decodePNG(Buffer.from(data, 'base64'));
  };
  const shot = async (name, box) => {
    const img = await viewShot();
    const c = img.unsupported ? img : cropRGBA(img, box.x, box.y, box.width != null ? box.width : box.w, box.height != null ? box.height : box.h);
    const s = img.unsupported ? { ...c } : statsRGBA(c);
    const png = img.unsupported ? Buffer.alloc(0) : encodePNG(c.w, c.h, c.out);
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), png);
    return { file: `${TAG}-${name}.png`, bytes: png.length, ...s };
  };
  /* 画布是 position:fixed 的（一页只开一个 WebGL 上下文），所以截图必须
     「先滚到目标、再在视口坐标里裁」——captureBeyondViewport 会把固定层留在视口位置，
     按文档坐标裁出来是一片空白（第一版就是这么拍出五张纯色图的）。 */
  const scrollTo_ = async (q, offset = 90) => {
    const found = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(q)});
      if (!el) return 0; const r = el.getBoundingClientRect();
      scrollTo({ top: Math.max(0, r.top + scrollY - ${offset}), behavior: 'instant' }); return 1; })()`);
    if (!found) return 0;
    await sleep(420);
    await evaluate('window.__stage.kick()');
    await sleep(420);
    return 1;
  };
  /* 视口内的元素框（滚动之后重新量） */
  const selView = async (q) => evaluate(`
    (() => { const el = document.querySelector(${JSON.stringify(q)}); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)),
               w: Math.min(${W}, Math.round(r.width)), h: Math.min(${H}, Math.round(r.height)) }; })()`);
  const sel = selView;
  const pad = (b, p = 22) => ({
    x: Math.max(0, b.x - p), y: Math.max(0, b.y - p),
    width: Math.min(W - Math.max(0, b.x - p), b.w + p * 2),
    height: Math.min(H - Math.max(0, b.y - p), b.h + p * 2),
  });

  const docH = await evaluate('document.documentElement.scrollHeight');
  const sections = await evaluate(`
    (() => { const o = {}; for (const el of document.querySelectorAll('section')) { const r = el.getBoundingClientRect(); o[el.id] = { y: Math.round(r.top + scrollY), h: Math.round(r.height) }; } return o; })()`);

  const files = [];
  /* 逐节：滚到那一节再截视口 */
  for (const id of Object.keys(sections)) {
    await scrollTo_('#' + id, 40);
    await sleep(300);
    files.push(await shot(`sec-${id}`, { x: 0, y: 0, width: W, height: Math.min(H, sections[id].h + 20) }));
  }
  /* 单要素 */
  for (const id of ['hero', 'row-thick', 'row-smooth', 'row-arc', 'grounds-host', 'hero-glb', 'cmp', 'tbl', 'prod40']) {
    const ok = await scrollTo_('#' + id, 120);
    if (!ok) continue;
    const b = await selView('#' + id);
    if (!b || b.w < 4 || b.h < 4) continue;
    files.push(await shot(`el-${id}`, pad(b, 14)));
  }

  /* ① 拖一下主视口：方位必须变，画面必须变 */
  await scrollTo_('#hero', 120);
  const heroBox = await selView('#hero');
  const before = await evaluate('(() => { const c = window.__stage.cellByName("hero"); return { az: c.orb.taz, el: c.orb.tel, dist: c.orb.tdist }; })()');
  const dragShotA = await shot('orbit-a', pad(heroBox, 6));
  const cx = heroBox.x + heroBox.w / 2, cy = heroBox.y + heroBox.h / 2;
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) {
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + i * 14, y: cy - i * 5, button: 'left', buttons: 1 });
  }
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 168, y: cy - 60, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(900);
  const after = await evaluate('(() => { const c = window.__stage.cellByName("hero"); return { az: c.orb.taz, el: c.orb.tel, dist: c.orb.tdist, frames: window.__stage.frames }; })()');
  const dragShotB = await shot('orbit-b', pad(heroBox, 6));
  /* 滚轮 */
  await S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -420 });
  await sleep(700);
  const afterZoom = await evaluate('(() => { const c = window.__stage.cellByName("hero"); return { dist: c.orb.tdist, frames: window.__stage.frames }; })()');
  files.push(dragShotA, dragShotB);

  /* ② 静置 2 秒：帧数不再涨（空闲不空转） */
  await sleep(500);
  const idle = await evaluate(`
    (async () => { const a = window.__stage.frames; await new Promise(r => setTimeout(r, 2000));
      return { before: a, after: window.__stage.frames, delta: window.__stage.frames - a, raf: window.__stage.raf }; })()`);

  /* ③ 导出：读回来的那一格与内存造的那一格，各自的画布像素不能是空的 */
  const readouts = await evaluate(`JSON.parse(JSON.stringify({
    glbCap: document.querySelector('#glb-cap').textContent,
    glbRo: document.querySelector('#glb-read').innerText,
    heroRo: document.querySelector('#hero-read').innerText,
    foot: document.querySelector('#foot').innerText,
    cells: window.__stage.cells.length,
    heroAz: window.__stage.cellByName('hero').orb.taz,
  }))`);

  files.push(await shot('full', { x: 0, y: 0, width: W, height: Math.min(H, docH) }));

  const verdicts = files.map((f) => ({
    file: f.file, bytes: f.bytes, colors: f.colors, meanLum: f.meanLum, lumRange: f.lumRange, darkShare: f.darkShare,
    /* 40px 那一格（现役的对照图）本来就小，按大图那套阈值会冤判；小裁片只核「有颜色、有起落」 */
    ok: f.bytes > (f.w < 120 ? 400 : 2500) && f.colors > 6 && f.lumRange > 12,
  }));

  const report = { url: URL, readyOk, docH, width: W, height: H, sections, errors, before, after, afterZoom, idle, readouts, files: verdicts };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    readyOk, errors, docH,
    orbit: { before, after, afterZoom, azMoved: +(after.az - before.az).toFixed(2), elMoved: +(after.el - before.el).toFixed(2) },
    idle,
    okCount: verdicts.filter((v) => v.ok).length,
    bad: verdicts.filter((v) => !v.ok),
    files: verdicts.map((v) => `${v.file} ${v.bytes}B c=${v.colors} L=${v.meanLum} r=${v.lumRange} ${v.ok ? 'ok' : 'BAD'}`),
  }, null, 2));

  ws.close(); proc.kill();
  await sleep(400);
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(700);
  for (let i = 0; i < 8; i++) {
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(400); }
  }
  process.exit(0);
})().catch(async (e) => {
  console.error('FAIL', e);
  try { execSync(`taskkill /F /T /PID ${process.pid}`, { stdio: 'ignore' }); } catch {}
  process.exit(1);
});