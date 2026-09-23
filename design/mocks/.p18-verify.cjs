/* ─────────────────────────────────────────────────────────────
   Phase 18 · 独立复核（主会话用）
   只验用户这一轮点名的四条，全部现算：
     1) 醒 = 正常运动（连续、~28px/s、14°）；梦 = 原地浮动（有界、无累积）
     2) 切换位移 ≈ ∓260px，且漂了很久之后仍然不变
     3) 脑电：梦态 1Hz（主波 d 每秒只变一次）；醒态仍是线上那种 30fps 连续
     4) 醒态脑电与「无层」逐像素一致（并进来的东西没有污染醒面）
   用法：node design/mocks/.p18-verify.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p18-constructs-and-echo';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const serve = () =>
  new Promise((res) => {
    const s = http.createServer((req, r) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (r.writeHead(403), r.end());
      fs.readFile(p, (e, d) => {
        if (e) return (r.writeHead(404, { 'Cache-Control': 'no-store' }), r.end('nf'));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });

const SQ = '.fld-sq';
const posOf = (idx) =>
  `(() => { const e = document.querySelectorAll('${SQ}')[${idx}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), t: performance.now() }; })()`;

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-verify')}`],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const goto = async (q) => {
    await page.goto(`${base}${FILE}.html?ui=0&zone=deep&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => { const el = document.querySelector('#ns-essays'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); });
    await new Promise((r) => setTimeout(r, 300));
  };

  /* ── 1 · 醒 vs 梦的运动性质：同一块在 0/3/6s 的位置 + 10s 内的跨度 ── */
  const motion = async (face) => {
    await goto(`face=${face}`);
    const idx = await page.evaluate(
      `(() => { const es = document.querySelectorAll('${SQ}'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 300 && r.top > 200 && r.left < 760 && r.top < 520 && r.width > 60) return i; } return 0; })()`,
    );
    const samples = [];
    for (const w of [0, 3000, 3000]) { if (w) await new Promise((r) => setTimeout(r, w)); samples.push(await page.evaluate(posOf(idx))); }
    const span = { x: [], y: [] };
    await goto(`face=${face}`);
    for (let i = 0; i < 11; i++) { const p = await page.evaluate(posOf(idx)); span.x.push(p.x); span.y.push(p.y); await new Promise((r) => setTimeout(r, 1000)); }
    return {
      net: [0, 1, 2].map((i) => (i === 0 ? 0 : +Math.hypot(samples[i].x - samples[0].x, samples[i].y - samples[0].y).toFixed(2))),
      dir: +((Math.atan2(samples[2].y - samples[0].y, samples[2].x - samples[0].x) * 180) / Math.PI).toFixed(2),
      spanX: +(Math.max(...span.x) - Math.min(...span.x)).toFixed(2),
      spanY: +(Math.max(...span.y) - Math.min(...span.y)).toFixed(2),
      distinct: new Set(span.x.map((v) => v.toFixed(1))).size,
    };
  };
  const wakeM = await motion('wake');
  const dreamM = await motion('dream');

  /* ── 2 · 切换位移：立刻按 vs 漂 20s 后按 ── */
  const switchOnce = async (dir) => {
    await page.evaluate(() => window.__p15.setMix(1));
    await new Promise((r) => setTimeout(r, 150));
    const idx = await page.evaluate(`(() => { const es = document.querySelectorAll('${SQ}'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 300 && r.top > 200 && r.left < 760 && r.top < 520 && r.width > 60) return i; } return 0; })()`);
    const a = await page.evaluate(posOf(idx));
    await page.evaluate(() => window.__p15.setMix(0));
    await new Promise((r) => setTimeout(r, 150));
    const b = await page.evaluate(posOf(idx));
    return { dx: +(b.x - a.x).toFixed(2), dy: +(b.y - a.y).toFixed(2), len: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(1) };
  };
  await goto('face=wake');
  await new Promise((r) => setTimeout(r, 1500));
  const sw1 = await switchOnce();
  await new Promise((r) => setTimeout(r, 6000));
  await page.evaluate(() => window.__p15.setMix(1));
  await new Promise((r) => setTimeout(r, 25000));
  const sw2 = await switchOnce();

  /* ── 3 · 脑电：主波 d 的变化节拍（醒 / 梦各 3.2s，每 100ms 轮询） ── */
  const eegBeat = async (face) => {
    await goto(`face=${face}`);
    const r = await page.evaluate(
      `(async () => {
        const el = document.querySelector('.eeg-main');
        const t0 = performance.now(); const out = []; let last = el.getAttribute('d');
        while (performance.now() - t0 < 3200) {
          await new Promise((r) => setTimeout(r, 60));
          const d = el.getAttribute('d');
          if (d !== last) { out.push(Math.round(performance.now() - t0)); last = d; }
        }
        return { changes: out.length, at: out.slice(0, 8), gaps: out.slice(1).map((v, i) => v - out[i]) };
      })()`,
    );
    return r;
  };
  const eegW = await eegBeat('wake');
  const eegD = await eegBeat('dream');

  /* ── 4 · 醒态：并进来的层 vs 无层，逐像素 ── */
  const shotOf = async (q) => {
    await goto(q);
    return page.screenshot({ encoding: 'base64', captureBeyondViewport: false });
  };
  const a1 = await shotOf('face=wake');
  const a2 = await shotOf('face=wake&bg=off&eeg=off');
  const DIFF = `async (a, b) => {
    const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
    const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      for (let k = 0; k < 3; k++) { const df = Math.abs(da[i + k] - db[i + k]); if (df > 1) { n++; break; } if (df > max) max = df; }
    }
    return { diffPx: n, ofPx: da.length / 4, maxCh: max };
  }`;
  const wakeVsOff = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + a1)},${JSON.stringify('data:image/png;base64,' + a2)})`);

  await browser.close();
  server.close();
  const out = { wakeMotion: wakeM, dreamMotion: dreamM, switchImmediate: sw1, switchAfter25s: sw2, eegWake: eegW, eegDream: eegD, wakeLayerVsOff: wakeVsOff, errs };
  fs.writeFileSync(path.join(__dirname, '.shots-p18-verify.json'), JSON.stringify(out, null, 2));
  console.log('1 · 醒态 0/3/6s 净位移', wakeM.net, 'px  方向', wakeM.dir, '°  10s 跨度 x/y', wakeM.spanX, '/', wakeM.spanY, '  位置去重', wakeM.distinct);
  console.log('    梦态 0/3/6s 净位移', dreamM.net, 'px  方向', dreamM.dir, '°  10s 跨度 x/y', dreamM.spanX, '/', dreamM.spanY, '  位置去重', dreamM.distinct);
  console.log('2 · 切换位移  立刻按', JSON.stringify(sw1), '  漂 25s 后按', JSON.stringify(sw2), '  长度差', +(sw2.len - sw1.len).toFixed(1), 'px');
  console.log('3 · 主波 d 变化节拍  醒:', eegW.changes, '次/3.2s  间隔', JSON.stringify(eegW.gaps.slice(0, 5)));
  console.log('                     梦:', eegD.changes, '次/3.2s  时刻', JSON.stringify(eegD.at), '  间隔', JSON.stringify(eegD.gaps.slice(0, 5)));
  console.log('4 · 醒态 有层 vs 无层: 不同像素', wakeVsOff.diffPx, '/', wakeVsOff.ofPx, ' 最大通道差', wakeVsOff.maxCh);
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'console errors: none');
  console.log('\n已写 design/mocks/.shots-p18-verify.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
