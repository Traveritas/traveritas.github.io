/**
 * 截图 + 自检（CDP，不依赖 puppeteer）
 *   node design/mocks/star-nexus-bake/.shot.cjs [tag]
 * 需要 serve.cjs 在 4675 上跑着。
 *
 * 除了整段截图，还验四件不许偷懒的事：
 *   ① 每张 PNG 读回像素：不能是一整片同色、字节数要够
 *   ② 真按一次「翻一次」，等落定，核对定时器/rAF 归零
 *   ③ 静置诊断：1.2s 内的帧数只来自诊断自身
 *   ④ 精灵图与落定帧真的能取到（HTTP 200）、播放时 background-position 真的在变
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4675/star-nexus-bake/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9461 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1360);
const H = Number(process.env.H || 1000);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-nb-shot-${process.pid}`);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PNG = (() => {
  const zlib = require('zlib');
  return (buf) => {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
    let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      off += 12 + len;
    }
    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { w, h, unsupported: true };
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = colorType === 6 ? 4 : 3, stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++];
      const line = raw.slice(p, p + stride); p += stride;
      const cur = out.slice(y * stride, (y + 1) * stride);
      const prev = y ? out.slice((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
        let v = line[x];
        if (f === 1) v += a; else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        cur[x] = v & 0xff;
      }
    }
    const colors = new Set();
    let sum = 0, n = 0, ink = 0;
    const step = Math.max(1, Math.floor((w * h) / 60000));
    for (let i = 0; i < w * h; i += step) {
      const o = i * bpp;
      const r = out[o], g = out[o + 1], b2 = out[o + 2];
      n++; sum += (r + g + b2) / 3;
      if (colors.size < 4000) colors.add((r >> 2) << 12 | (g >> 2) << 6 | (b2 >> 2));
      if (r + g + b2 < 620) ink++;
    }
    return { w, h, colors: colors.size, meanLum: +(sum / n).toFixed(2), darkShare: +(ink / n).toFixed(4) };
  };
})();

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
      setTimeout(() => { if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error('timeout ' + method)); } }, 40000);
    });
  }
}

async function launch() {
  const proc = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
    '--use-angle=d3d11', '--disable-gpu-sandbox', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json(); return { proc, wsUrl: j.webSocketDebuggerUrl }; }
    catch { await sleep(200); }
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
  for (let i = 0; i < 90; i++) {
    if (await evaluate('window.__ready === true').catch(() => false)) { readyOk = true; break; }
    await sleep(200);
  }
  if (!readyOk) {
    console.error('页面没到 __ready。');
    for (const e of cdp.events.slice(-30)) {
      if (e.method === 'Runtime.exceptionThrown')
        console.error('  EXC', (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text || '').slice(0, 700));
      if (e.method === 'Log.entryAdded') console.error('  LOG', e.params.entry.level, e.params.entry.text);
      if (e.method === 'Network.responseReceived' && e.params.response.status >= 400)
        console.error('  NET', e.params.response.status, e.params.response.url);
    }
    throw new Error('__ready 超时');
  }
  await sleep(1200);

  const errors = cdp.events
    .filter((e) =>
      (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Network.responseReceived' && e.params.response.status >= 400))
    .map((e) => {
      if (e.method === 'Network.responseReceived') return `HTTP ${e.params.response.status} ${e.params.response.url}`;
      if (e.method === 'Log.entryAdded') return `${e.params.entry.source}: ${e.params.entry.text}`;
      const d = e.params.exceptionDetails;
      return `exception: ${d.text} ${d.exception?.description || ''}`;
    })
    .filter((s) => !s.includes('favicon'));

  const shot = async (name, box) => {
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), buf);
    let stats;
    try { stats = PNG(buf); } catch (e) { stats = { error: String(e.message) }; }
    return { file: `${TAG}-${name}.png`, bytes: buf.length, stats };
  };

  const docH = await evaluate('document.documentElement.scrollHeight');
  const sections = await evaluate(`
    (() => { const out = {};
      for (const el of document.querySelectorAll('section')) {
        const r = el.getBoundingClientRect();
        out[el.id] = { y: Math.round(r.top + scrollY), h: Math.round(r.height) };
      } return out; })()`);

  const files = [];
  for (const id of ['core', 'cmp', 'motion', 'size', 'disc']) {
    const s = sections[id];
    if (!s) continue;
    files.push(await shot(`sec-${id}`, { x: 0, y: Math.max(0, s.y - 24), width: W, height: Math.min(s.h + 60, docH - Math.max(0, s.y - 24)) }));
  }
  files.push(await shot('full', { x: 0, y: 0, width: W, height: docH }));

  const elShot = async (sel, name, pad = 16) => {
    const b = await evaluate(`
      (() => { const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null; const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    if (!b) return null;
    return shot(name, { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.w + pad * 2, height: b.h + pad * 2 });
  };
  const starShot = await elShot('#star', 'star', 20);
  if (starShot) files.push(starShot);
  const cmpShot = await elShot('.cmp', 'cmp-pair', 22);
  if (cmpShot) files.push(cmpShot);
  const stripShot = await elShot('#strip', 'strip', 12);
  if (stripShot) files.push(stripShot);

  /* 真按一次，并采样播放过程中的 background-position */
  const playRun = await evaluate(`
    (async () => {
      const el = document.querySelector('#star .cb-wake');
      const before = window.__crystalBake.state();
      const pos0 = getComputedStyle(el).backgroundPosition;
      document.querySelector('#btn').click();
      await new Promise((r) => setTimeout(r, 260));
      const mid = window.__crystalBake.state();
      const pos1 = getComputedStyle(el).backgroundPosition;
      await new Promise((r) => setTimeout(r, 2200));
      const after = window.__crystalBake.state();
      const pos2 = getComputedStyle(el).backgroundPosition;
      return { before, mid, after, pos0, pos1, pos2,
               timersAlive: after.timers, rafAlive: after.raf,
               readout: document.querySelector('#readout').textContent };
    })()`);
  files.push(await shot('play', { x: 0, y: Math.max(0, sections.motion.y - 24), width: W, height: Math.min(sections.motion.h + 60, docH) }));

  /* 静置 1.2s 再读一次：要全零 */
  const idleRun = await evaluate(`
    (async () => {
      const s0 = window.__crystalBake.state();
      await new Promise((r) => setTimeout(r, 1200));
      const s1 = window.__crystalBake.state();
      return { s0, s1, same: JSON.stringify(s0) === JSON.stringify(s1) };
    })()`);

  /* 醒梦：改 --reality-mix，看梦层透明度真的跟着变。
     必须给 MutationObserver 一拍的时间（它是微任务之后的回调），
     所以这里用 setTimeout 而不是 rAF —— 上一版用两层 rAF 读出来永远是初值。 */
  const mixRun = await evaluate(`
    (async () => {
      const d = document.querySelector('#star .cb-dream');
      const out = [];
      for (const v of [1, 0, 0.5]) {
        document.documentElement.style.setProperty('--reality-mix', String(v));
        await new Promise((r) => setTimeout(r, 80));
        out.push({ v, layerOpacity: getComputedStyle(d).opacity, mix: window.__crystalBake.state().mix });
      }
      document.documentElement.style.setProperty('--reality-mix', '1');
      return out;
    })()`);

  /* reduced-motion 复跑 */
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await S('Page.navigate', { url: URL });
  for (let i = 0; i < 90; i++) { if (await evaluate('window.__ready === true').catch(() => false)) break; await sleep(200); }
  await sleep(900);
  const rmRun = await evaluate(`
    (async () => {
      const before = window.__crystalBake.state();
      document.querySelector('#btn').click();
      await new Promise((r) => setTimeout(r, 300));
      const after = window.__crystalBake.state();
      return { reduced: before.reduced, frameBefore: before.frame, frameAfter: after.frame,
               busy: after.busy, timersAlive: after.timers, readout: document.querySelector('#readout').textContent };
    })()`);
  files.push(await shot('rm', { x: 0, y: Math.max(0, sections.core.y - 24), width: W, height: Math.min(sections.core.h + 60, docH) }));

  const verdicts = files.map((f) => {
    const s = f.stats || {};
    const ok = !s.error && s.colors > 3 && f.bytes > 2000;
    return { file: f.file, bytes: f.bytes, ...s, ok };
  });

  const report = {
    url: URL, docH, width: W, sections, errors,
    play: playRun, idle: idleRun, mix: mixRun, reducedMotion: rmRun,
    files: verdicts,
  };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    errors, play: playRun, idle: idleRun, mix: mixRun, rm: rmRun, docH,
    bad: verdicts.filter((v) => !v.ok).map((v) => v.file),
    okCount: verdicts.filter((v) => v.ok).length, total: verdicts.length,
  }, null, 2));

  ws.close(); proc.kill();
  await sleep(400);
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  await sleep(600);
  for (let i = 0; i < 8; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); break; } catch { await sleep(400); } }
  process.exit(0);
})().catch(async (e) => {
  console.error('FAIL', e);
  try { execSync(`taskkill /F /T /PID ${process.pid}`, { stdio: 'ignore' }); } catch {}
  process.exit(1);
});