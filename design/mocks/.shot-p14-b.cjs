/* p14-b 自验收工具：仓库根静态服务器 + CDP 截图 + PNG 像素实测 + 帧时压测
   独占调试端口 9802（HTTP 用 9822）。Node 24 自带 WebSocket 与 zlib。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = 'D:/Documents/HTA/My Projects/personal-website';
const OUT = path.join(ROOT, 'design/mocks/.shots-p14-b');
const PORT = 9802, HTTP_PORT = 9822;
const URL_BASE = `http://127.0.0.1:${HTTP_PORT}/design/mocks/p14-b-sampled-eeg.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) =>
  new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
  });

/* ── 静态服务器（root = 仓库根，no-store） ── */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.avif': 'image/avif', '.webp': 'image/webp' };
const ROOT_RES = path.resolve(ROOT);
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.resolve(ROOT, '.' + p);
  if (!f.startsWith(ROOT_RES)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(data);
  });
});

/* ── 最小 PNG 解码 / 编码（8bit，非隔行） ── */
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bd = 8, ct = 6; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4;
  const bpp = (ch * bd) / 8, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, x = line[i];
      let v = x;
      if (f === 1) v = x + a; else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) { CRC_T = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function encodePNG(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const lum = (r, g, b) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const px = (img, x, y) => { const i = y * img.w * img.ch + x * img.ch; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
/* 区域统计：区域 = {x,y,w,h} */
function regionStats(img, r, ref) {
  let maxL = -1, minL = 2, maxAt = null, minAt = null, sum = 0, n = 0, diffMax = -1, diffPix = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = px(img, x, y), L = lum(c[0], c[1], c[2]);
      sum += L; n++;
      if (L > maxL) { maxL = L; maxAt = [x, y, c]; }
      if (L < minL) { minL = L; minAt = [x, y, c]; }
      if (ref) {
        const c2 = px(ref, x, y);
        const dl = Math.abs(L - lum(c2[0], c2[1], c2[2]));
        if (dl > diffMax) diffMax = dl;
        if (dl > 0.0025) diffPix++;
      }
    }
  }
  return { mean: sum / n, maxL, minL, maxAt, minAt, diffMax, diffPix, n };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, '.chrome')}`,
    '--window-size=1440,900', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON(`http://127.0.0.1:${PORT}/json`); if (list && list.some((t) => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} server.close(); return; }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.screencastFrame') {      // 保活：headless 里没有帧消费方时 rAF 会整段停发
      ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
      return;
    }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (m, p = {}) => new Promise((r) => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable'); await send('Runtime.enable');
  const evalJS = async (expr, awaitP = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: awaitP });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  /* 站点 scroll-behavior:smooth——截图必须瞬时落位，否则抓在飞行途中 */
  const jump = async (expr) => {
    await evalJS(`(function(){var de=document.documentElement,sv=de.style.scrollBehavior;
      de.style.scrollBehavior='auto'; ${expr}; de.style.scrollBehavior=sv; return scrollY})()`);
    await sleep(260);
  };
  const scrollFix = async (s) => {
    if (s.scrollId) return jump(`var e=document.getElementById('${s.scrollId}');
      scrollTo(0, Math.round(e.getBoundingClientRect().top + scrollY - ${s.offset || 120}))`);
    if (s.scrollTo != null) return jump(`scrollTo(0, ${s.scrollTo})`);
  };

  const shots = {};
  async function shot(s) {
    // 每一张都显式落定尺寸与减动设置（否则上一张的覆盖会漏到下一张）
    await send('Emulation.setDeviceMetricsOverride',
      { width: s.vw || 1440, height: s.vh || 900, deviceScaleFactor: s.dsf || 1, mobile: !!s.mobile });
    await send('Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: s.rm ? 'reduce' : 'no-preference' }] });
    await send('Page.navigate', { url: URL_BASE + (s.q ? '?' + s.q : '') });
    await sleep(700);
    await evalJS('document.fonts.ready.then(()=>1)', true);
    await sleep(s.wait || 900);
    await scrollFix(s);
    if (s.prep) await s.prep();
    let cap;
    if (s.full) {
      const h = await evalJS('document.documentElement.scrollHeight');
      cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1440, height: Math.min(h, 12000), scale: 0.34 } });
    } else {
      cap = await send('Page.captureScreenshot', { format: 'png' });
    }
    const buf = Buffer.from(cap.result.data, 'base64');
    const file = path.join(OUT, s.n + '.png');
    fs.writeFileSync(file, buf);
    const st = await evalJS('JSON.stringify(window.__p14.state())');
    const sy = await evalJS('Math.round(scrollY)');
    shots[s.n] = { buf, file };
    console.log('·', s.n, buf.length, 'scrollY=' + sy, st || '');
    return buf;
  }

  /* ═══ 截图矩阵（截图一律 ?ui=0&freeze=1 隐藏调试件、定格环境动画） ═══ */
  const BASE = 'ui=0&freeze=1';
  await shot({ n: '01-deep-dream', q: `${BASE}&zone=deep&mix=0`, scrollTo: 620 });
  await shot({ n: '02-deep-wake', q: `${BASE}&zone=deep&mix=1`, scrollTo: 620 });
  await shot({ n: '03-light-dream', q: `${BASE}&zone=light&mix=0`, scrollTo: 0 });
  await shot({ n: '04-light-wake', q: `${BASE}&zone=light&mix=1`, scrollTo: 0 });
  await shot({ n: '05-paper-dream', q: `${BASE}&zone=paper&mix=0`, scrollId: 'ns-dawn', offset: 60 });
  await shot({ n: '06-content-dream', q: `${BASE}&zone=deep&mix=0`, scrollId: 'ns-article', offset: 96 });
  await shot({ n: '07-mobile390-dream', q: `${BASE}&zone=deep&mix=0`, vw: 390, vh: 844, mobile: true, scrollTo: 0 });
  await shot({ n: '08-rm-wake', q: `${BASE}&zone=light`, rm: true, scrollTo: 0 });
  await shot({ n: '09-baseline-off', q: `${BASE}&zone=deep&mix=0&eeg=off`, scrollTo: 620 });
  await shot({ n: '10-quant-4px', q: `${BASE}&zone=deep&mix=0&q=4`, scrollTo: 620 });
  await shot({ n: '11-quant-8px', q: `${BASE}&zone=deep&mix=0&q=8`, scrollTo: 620 });
  await shot({ n: '12-quant-2px', q: `${BASE}&zone=deep&mix=0&q=2`, scrollTo: 620 });
  await shot({ n: '13-mid-hold-045', q: `${BASE}&zone=deep&mix=0.45`, scrollTo: 620 });
  await shot({ n: '14-light-dream-q4', q: `${BASE}&zone=light&mix=0&q=4`, scrollTo: 620 });
  await shot({ n: '15-paper-dream-q4', q: `${BASE}&zone=paper&mix=0&q=4`, scrollId: 'ns-dawn', offset: 60 });
  await shot({ n: '16-live-legacy-wake', q: `${BASE}&zone=deep&mix=1&legacy=1`, scrollTo: 620 });
  await shot({ n: '17-addon-off', q: `${BASE}&zone=deep&mix=0&q=4&addon=off`, scrollTo: 620 });
  await shot({ n: '18-fullpage', q: 'ui=0&freeze=1', full: true, wait: 1600 });

  /* ═══ 实测①：波形统计（同一相位 PH 1.4 定格） ═══ */
  const stat = async (q, label) => {
    await send('Page.navigate', { url: URL_BASE + '?' + q });
    await sleep(700); await evalJS('document.fonts.ready.then(()=>1)', true); await sleep(600);
    const d = await evalJS("document.getElementById('eeg-main').getAttribute('d')");
    // 采样点 = 每个 H/L/V 命令的落点（H 只改 x，V 只改 y，L 是斜升）
    const ys = []; let cx = 0, cy = 0, first = true;
    for (const m of d.matchAll(/([MLHV])(-?\d+(?:\.\d+)?)(?:[ ](-?\d+(?:\.\d+)?))?/g)) {
      const c = m[1], a = +m[2], b = m[3] === undefined ? null : +m[3];
      if (c === 'M') { cx = a; cy = b; }
      else if (c === 'L') { cx = a; cy = b; }
      else if (c === 'H') { cx = a; }
      else if (c === 'V') { cy = a; }
      ys.push({ x: +cx.toFixed(1), y: +cy.toFixed(1), c });
      first = false;
    }
    void first;
    let flat = 0, runs = [], run = 1, corners = 0;
    for (let i = 1; i < ys.length; i++) {
      const dy = Math.abs(ys[i].y - ys[i - 1].y);
      if (dy < 0.05) { flat++; run++; } else { runs.push(run); run = 1; corners++; }
    }
    runs.push(run);
    const meanRun = runs.reduce((a, b) => a + b, 0) / runs.length;
    const zone = await evalJS('document.body.dataset.zone');
    const st = await evalJS('JSON.stringify(window.__p14.state())');
    console.log(`STAT ${label} zone=${zone} ${st}`);
    console.log(`     采样点=${ys.length} 持平段占比=${(flat / (ys.length - 1) * 100).toFixed(1)}%` +
      ` 转角数=${corners} 平均水平段=${meanRun.toFixed(2)}（采样格 26px）` +
      ` y跨度=${(Math.max(...ys.map((p) => p.y)) - Math.min(...ys.map((p) => p.y))).toFixed(1)}px 路径串=${d.length}字符`);
    return { samples: ys.length, flatPct: +(flat / (ys.length - 1) * 100).toFixed(1), corners,
      meanRun: +meanRun.toFixed(2), pathChars: d.length };
  };
  const sW = await stat('ui=0&freeze=1&zone=deep&mix=1', 'wake-legacy-equal');
  const sD = await stat('ui=0&freeze=1&zone=deep&mix=0&q=6', 'dream-q6');
  const s4 = await stat('ui=0&freeze=1&zone=deep&mix=0&q=4', 'dream-q4');
  const s8 = await stat('ui=0&freeze=1&zone=deep&mix=0&q=8', 'dream-q8');
  const s2 = await stat('ui=0&freeze=1&zone=deep&mix=0&q=2', 'dream-q2');
  const sMid = await stat('ui=0&freeze=1&zone=deep&mix=0.45', 'mid-hold-0.45');
  const sL = await stat('ui=0&freeze=1&zone=deep&mix=1&legacy=1', 'legacy(真站点现状)');

  /* ═══ 实测②：背景层亮度（三段 · 层像素 = 与关层帧的差分；再加「只算本稿新增」一列） ═══ */
  const INK = { light: [38, 44, 51], deep: [229, 224, 210], paper: [85, 80, 63] };  // = ZONES[i].ink
  const lumReport = [];
  const load = async (q, zn, sc, sid) => {
    await send('Page.navigate', { url: URL_BASE + '?' + q });
    await sleep(650); await evalJS('document.fonts.ready.then(()=>1)', true); await sleep(700);
    await scrollFix({ scrollId: sid, offset: sid === 'ns-dawn' ? 60 : 96, scrollTo: sid ? undefined : sc });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    return decodePNG(Buffer.from(cap.result.data, 'base64'));
  };
  /* 差分可视化：把「线本体」「本稿新增」分别染成青 / 品红压在同一帧上，
     供肉眼确认新增件落在哪里、有多轻 */
  const diffViz = (on, noAdd, off, r) => {
    const w = r.w, h = r.h, out = Buffer.alloc(w * h * 3);
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const A = px(on, r.x + x, r.y + y), B = px(noAdd, r.x + x, r.y + y), C = px(off, r.x + x, r.y + y);
      let o = (y * w + x) * 3;
      out[o] = A[0]; out[o + 1] = A[1]; out[o + 2] = A[2];
      if (!near(A, C)) { out[o] = 40; out[o + 1] = 200; out[o + 2] = 220; }      // 线本体
      if (!near(A, B)) { out[o] = 235; out[o + 1] = 40; out[o + 2] = 200; }      // 本稿新增
    }
    return encodePNG(w, h, out);
  };
  const layerStats = (on, off, r) => {
    const hist = [];
    for (let y = r.y; y < r.y + r.h; y += 2) for (let x = r.x; x < r.x + r.w; x += 2) {
      const c = px(off, x, y); hist.push(lum(c[0], c[1], c[2]));
    }
    hist.sort((a, b) => a - b);
    let lo = 2, hi = -1, cnt = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const a = px(on, x, y), b = px(off, x, y);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 4) continue;
      cnt++; const L = lum(a[0], a[1], a[2]);
      if (L > hi) hi = L; if (L < lo) lo = L;
    }
    return { Lbg: hist[Math.floor(hist.length / 2)], lo, hi, cnt };
  };
  /* 三分：main = 脑电线本体（on vs off，off 里没有）；addon = 本稿新增
      （残影 + 锚点光环：on vs addon=off，且 off 帧在那点与原帧一致） */
  const splitStats = (on, noAdd, offImg, r) => {
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 4;
    let mCnt = 0, mLo = 2, mLoPx = null, mHi = -1, aCnt = 0, aLo = 2, aHi = -1, aLoPx = null;
    let bg = 0, bgN = 0, mFlat = 2, mFlatHi = -1, aFlat = 2, aFlatHi = -1, mFlatPx = null, aFlatPx = null;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const A = px(on, x, y), B = px(noAdd, x, y), C = px(offImg, x, y);
      const L = lum(A[0], A[1], A[2]), Lb = lum(C[0], C[1], C[2]);
      if (!near(A, C)) { mCnt++; if (L < mLo) { mLo = L; mLoPx = [x, y, A]; } if (L > mHi) mHi = L; }
      if (!near(A, B)) { aCnt++; if (L < aLo) { aLo = L; aLoPx = [x, y, A]; } if (L > aHi) aHi = L; }
      if (near(A, C) && near(A, B)) { bg += L; bgN++; }
    }
    /* 「净底」子集：底色基准取直方图众数（一屏里最多的那一种亮度 = 底色）。
       线的净底判据 = 关层帧在该点是底色；新增的净底判据 = 关新增帧（＝线上
       现状那一条线）在该点是底色——否则残影压在主线上时会被记到主线的重量里 */
    const hist2 = new Map();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const C = px(offImg, x, y), b = Math.round(lum(C[0], C[1], C[2]) * 100);
      hist2.set(b, (hist2.get(b) || 0) + 1);
    }
    let modeB = 0, modeN = -1;
    for (const [k, v] of hist2) if (v > modeN) { modeN = v; modeB = k; }
    const LbgFlat = modeB / 100;
    const nearBg = (c) => Math.abs(lum(c[0], c[1], c[2]) - LbgFlat) <= 0.015;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const A = px(on, x, y), B = px(noAdd, x, y), C = px(offImg, x, y);
      const L = lum(A[0], A[1], A[2]);
      if (!near(A, C) && nearBg(C)) { if (L < mFlat) { mFlat = L; mFlatPx = [x, y, C]; } if (L > mFlatHi) mFlatHi = L; }
      if (!near(A, B) && nearBg(B) && near(C, B)) { if (L < aFlat) { aFlat = L; aFlatPx = [x, y, C]; } if (L > aFlatHi) aFlatHi = L; }
    }
    return { main: { cnt: mCnt, lo: mLo, hi: mHi, loPx: mLoPx, flatLo: mFlat, flatHi: mFlatHi, flatPx: mFlatPx },
      addon: { cnt: aCnt, lo: aLo, hi: aHi, loPx: aLoPx, flatLo: aFlat, flatHi: aFlatHi, flatPx: aFlatPx },
      Lbg: bg / Math.max(bgN, 1), LbgFlat: LbgFlat };
  };
  for (const [zn, sc, sid] of [['deep', 620, null], ['light', 0, null], ['paper', null, 'ns-dawn']]) {
    const qq = `ui=0&freeze=1&zone=${zn}&mix=0&q=4`;
    const r = { x: 200, y: 380, w: 1000, h: 260 };
    const on = await load(qq, zn, sc, sid);
    const off = await load(qq + '&eeg=off', zn, sc, sid);
    const noAdd = await load(qq + '&addon=off', zn, sc, sid);
    const sp = splitStats(on, noAdd, off, r);
    fs.writeFileSync(path.join(OUT, `viz-${zn}-layers.png`), diffViz(on, noAdd, off, r));
    const Link = lum(...INK[zn]);
    const share = (L) => +((Math.abs(L - sp.Lbg) / Math.abs(Link - sp.Lbg)) * 100).toFixed(1);
    const shareFlat = (L) => +((Math.abs(L - sp.LbgFlat) / Math.abs(Link - sp.LbgFlat)) * 100).toFixed(1);
    lumReport.push({ zone: zn, 底色: +sp.Lbg.toFixed(4), 墨色: +Link.toFixed(4),
      脑电线: { 全图区间: [+sp.main.lo.toFixed(4), +sp.main.hi.toFixed(4)], 净底上区间: [+sp.main.flatLo.toFixed(4), +sp.main.flatHi.toFixed(4)],
        净底上对比占比: Math.max(shareFlat(sp.main.flatLo), shareFlat(sp.main.flatHi)), 净底上峰值比墨色: +(Math.max(sp.main.flatLo, sp.main.flatHi) / Link).toFixed(3) },
      本稿新增: { 全图区间: [+sp.addon.lo.toFixed(4), +sp.addon.hi.toFixed(4)], 净底上区间: [+sp.addon.flatLo.toFixed(4), +sp.addon.flatHi.toFixed(4)],
        净底上对比占比: Math.max(shareFlat(sp.addon.flatLo), shareFlat(sp.addon.flatHi)), 净底上峰值比墨色: +(Math.max(sp.addon.flatLo, sp.addon.flatHi) / Link).toFixed(3) } });
    console.log(`LUM ${zn} 底色=${sp.Lbg.toFixed(4)} 净底众数=${sp.LbgFlat.toFixed(2)} 墨=${Link.toFixed(4)}` +
      ` | 线(全图) ${sp.main.lo.toFixed(4)}–${sp.main.hi.toFixed(4)} | 线(净底) ${sp.main.flatLo.toFixed(4)}–${sp.main.flatHi.toFixed(4)}` +
      ` 对比占比=${Math.max(shareFlat(sp.main.flatLo), shareFlat(sp.main.flatHi))}% 峰值/墨=${(Math.max(sp.main.flatLo, sp.main.flatHi) / Link).toFixed(3)}` +
      ` 最暗点@${sp.main.flatPx ? sp.main.flatPx[0] + ',' + sp.main.flatPx[1] + ' rgb(' + sp.main.flatPx[2] + ')' : '-'}` +
      ` | 新增(全图) ${sp.addon.lo.toFixed(4)}–${sp.addon.hi.toFixed(4)} | 新增(净底) ${sp.addon.flatLo.toFixed(4)}–${sp.addon.flatHi.toFixed(4)}` +
      ` 对比占比=${Math.max(shareFlat(sp.addon.flatLo), shareFlat(sp.addon.flatHi))}% 峰值/墨=${(Math.max(sp.addon.flatLo, sp.addon.flatHi) / Link).toFixed(3)}` +
      ` 最暗点@${sp.addon.flatPx ? sp.addon.flatPx[0] + ',' + sp.addon.flatPx[1] + ' rgb(' + sp.addon.flatPx[2] + ')' : '-'}`);
  }

  /* ═══ 实测③：8× CPU 降速下滚动 5s 的帧时（有层 vs 无层） ═══ */
  await send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  // 开一路极小的 screencast：headless 没有帧消费方时 rAF 会整段停发，测出来的就不是页面的帧时
  await send('Page.startScreencast', { format: 'jpeg', quality: 1, maxWidth: 80, maxHeight: 50, everyNthFrame: 1 });
  const perfOf = async (q, label, ms) => {
    await send('Page.navigate', { url: URL_BASE + '?' + q });
    await sleep(900); await evalJS('document.fonts.ready.then(()=>1)', true); await sleep(1200);
    const r = await evalJS(`window.__p14.perf(${ms || 5000}).then(r=>JSON.stringify(r))`, true);
    const o = JSON.parse(r);
    console.log(`PERF ${label} ${r}`);
    return o;
  };
  const pDream = await perfOf('ui=0&zone=deep&mix=0&q=4', '有层·梦态q4(5s)');
  const pLive = await perfOf('ui=0&zone=deep&mix=1&legacy=1', '有层·真站点现状(5s)');
  const pOff = await perfOf('ui=0&zone=deep&mix=0&eeg=off', '无层基线(5s)');
  // 交替三轮 15s：单轮方差比差异本身大（同机同参两次可差 15%），取三轮中位
  const tri = { dream: [], off: [], live: [] };
  for (let i = 0; i < 3; i++) {
    tri.dream.push(await perfOf('ui=0&zone=deep&mix=0&q=4', `有层·梦态q4(15s 第${i + 1}轮)`, 15000));
    tri.live.push(await perfOf('ui=0&zone=deep&mix=1&legacy=1', `有层·真站点现状(15s 第${i + 1}轮)`, 15000));
    tri.off.push(await perfOf('ui=0&zone=deep&mix=0&eeg=off', `无层基线(15s 第${i + 1}轮)`, 15000));
  }
  const med = (a, k) => { const s = a.map((x) => x[k]).sort((x, y) => x - y); return s[1]; };
  const pack = (a) => ({ p50: med(a, 'p50'), p95: med(a, 'p95'), max: med(a, 'max'), avg: med(a, 'avg'),
    frames: med(a, 'frames'), p95原始: a.map((r) => r.p95), max原始: a.map((r) => r.max),
    frames原始: a.map((r) => r.frames) });
  const perfSum = { 梦态q4: pack(tri.dream), 真站点现状: pack(tri.live), 无层: pack(tri.off) };
  console.log('PERF 汇总 ' + JSON.stringify(perfSum));
  await send('Page.stopScreencast');
  const benchMed = async (q, label) => {
    await send('Page.navigate', { url: URL_BASE + '?' + q });
    for (let i = 0; i < 40; i++) {           // 8× 降速下装载会慢到数秒，等脚本就位再测
      if (await evalJS('!!window.__p14')) break;
      await sleep(500);
    }
    await sleep(600);
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(JSON.parse(await evalJS('JSON.stringify(window.__p14.bench(200))')));
    runs.sort((a, b) => a.perDrawMs - b.perDrawMs);
    const med = runs[2];
    console.log(`BENCH ${label} 中位 ${med.perDrawMs}ms/帧 顶点${med.samples} 路径${med.pathLen}字符 ` +
      `(5 次: ${runs.map((r) => r.perDrawMs).join(' / ')})`);
    return med;
  };
  const benchOn = await benchMed('ui=0&zone=deep&mix=0&q=4', '梦态 q4');
  const benchDreamStep = await benchMed('ui=0&zone=deep&mix=0', '梦态（含跳变档，默认）');
  const benchLive = await benchMed('ui=0&zone=deep&mix=1&legacy=1', '真站点现状（醒面平滑）');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });

  /* ═══ 25% 缩略 + 线区特写（Node 内做面积平均降采样，逐字节写 PNG） ═══ */
  const crop = (img, r, f = 1) => {
    const w = Math.max(1, Math.round(r.w * f)), h = Math.max(1, Math.round(r.h * f));
    const out = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, r.x + Math.floor(x / f)), sy = Math.min(img.h - 1, r.y + Math.floor(y / f));
      const i = sy * img.w * img.ch + sx * img.ch, o = (y * w + x) * 3;
      out[o] = img.data[i]; out[o + 1] = img.data[i + 1]; out[o + 2] = img.data[i + 2];
    }
    return { w, h, ch: 3, data: out };
  };
  const scale = (img, f) => {                       // 面积平均降采样
    const w = Math.max(1, Math.round(img.w * f)), h = Math.max(1, Math.round(img.h * f));
    const out = Buffer.alloc(w * h * 3), step = 1 / f;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const x0 = Math.floor(x * step), x1 = Math.min(img.w, Math.ceil((x + 1) * step));
      const y0 = Math.floor(y * step), y1 = Math.min(img.h, Math.ceil((y + 1) * step));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = yy * img.w * img.ch + xx * img.ch;
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
      const o = (y * w + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
    return { w, h, ch: 3, data: out };
  };
  const write = (name, img) => fs.writeFileSync(path.join(OUT, name + '.png'), encodePNG(img.w, img.h, img.data));
  const D = (n) => decodePNG(shots[n].buf);
  const BAND = { x: 0, y: 330, w: 1440, h: 170 };   // 线带：横贯全宽的实景
  const CROP = { x: 120, y: 250, w: 520, h: 210 };  // 近景
  const bands = { wake: D('02-deep-wake'), q4: D('10-quant-4px'), q8: D('11-quant-8px'),
    q2: D('12-quant-2px'), mid: D('13-mid-hold-045'), live: D('16-live-legacy-wake'), dream: D('01-deep-dream') };
  for (const k of Object.keys(bands)) {
    const b = crop(bands[k], BAND, 1);
    write('20-band-' + k, b);
    write('21-band25pct-' + k, scale(b, 0.25));                 // 缩到 25%：E 的验收线
    write('22-band2x-' + k, crop(bands[k], CROP, 2));           // 2× 近景：看台阶
  }
  write('23-full-deep-dream-25pct', scale(D('01-deep-dream'), 0.25));
  write('24-full-deep-off-25pct', scale(D('09-baseline-off'), 0.25));
  write('25-full-light-wake-25pct', scale(D('04-light-wake'), 0.25));
  write('26-full-light-dream-25pct', scale(D('03-light-dream'), 0.25));
  write('27-layers-viz-deep', decodePNG(fs.readFileSync(path.join(OUT, 'viz-deep-layers.png'))));

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ wake: { ...sW, d: undefined }, dream6: { ...sD, d: undefined },
    dream4: { ...s4, d: undefined }, dream8: { ...s8, d: undefined }, dream2: { ...s2, d: undefined },
    midHold: { ...sMid, d: undefined }, legacy: { ...sL, d: undefined },
    lum: lumReport,
    perf: { 梦态q4_5s: pDream, 真站点现状_5s: pLive, 无层_5s: pOff, 十五秒三轮: perfSum },
    bench: { 梦态q4: benchOn, 梦态默认: benchDreamStep, 真站点现状: benchLive } }, null, 1));
  console.log('swarmErr:', await evalJS('window.__swarmErr'));

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(500);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
  server.close();
})();
