/* Phase 18 · 站点落地独立复核（跑在 npm run preview 的生产构建上） */
const path = require('path');
const os = require('os');
const fs = require('fs');
const P = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const BASE = process.argv[2] || 'http://127.0.0.1:4399';
const OUT = path.join(__dirname, '.shots-p18-site-verify');
fs.mkdirSync(OUT, { recursive: true });
const SQ = '.fld-sq';

const DIFF = `async (a, b) => {
  const L = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
  const [A, B] = await Promise.all([L(a), L(b)]);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
  const db = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0, mx = 0;
  for (let i = 0; i < da.length; i += 4) { for (let k = 0; k < 3; k++) { const f = Math.abs(da[i + k] - db[i + k]); if (f > 1) { n++; break; } if (f > mx) mx = f; } }
  return { diffPx: n, ofPx: da.length / 4, maxCh: mx };
}`;

(async () => {
  const browser = await P.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-site')}`],
  });

  const open = async (url, face, w = 1440, h = 900) => {
    const pg = await browser.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    if (face) await pg.evaluateOnNewDocument((f) => { try { sessionStorage.setItem('xm-reality', f); } catch (e) {} }, face);
    await pg.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await pg.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1600)); // 让入梦/闩锁落定
    return { pg, errs };
  };
  const at = async (pg, sel) => {
    await pg.evaluate((s) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); }, sel);
    await new Promise((r) => setTimeout(r, 1200));
  };
  const shot = async (pg, name) => { await pg.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  shot', name); return pg.screenshot({ encoding: 'base64' }); };

  const R = {};

  /* ── 首页：首屏（below → 场应被纸遮住）+ 正文段 ── */
  {
    const { pg, errs } = await open(`${BASE}/`, 'wake');
    const hero = await pg.screenshot({ encoding: 'base64' });
    await shot(pg, '01-home-hero-wake');
    await at(pg, '#ns-essays');
    const w1 = await shot(pg, '02-home-essays-wake');
    /* 醒态：同一块 0/3/6s 位移（单向漂移） */
    const idx = await pg.evaluate(`(() => { const es = document.querySelectorAll('${SQ}'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 200 && r.top > 150 && r.left < 900 && r.top < 600 && r.width > 50) return i; } return 0; })()`);
    const pos = () => pg.evaluate((i) => { const e = document.querySelectorAll('.fld-sq')[i].getBoundingClientRect(); return { x: +e.left.toFixed(2), y: +e.top.toFixed(2) }; }, idx);
    const a0 = await pos(); await new Promise((r) => setTimeout(r, 6000)); const a1 = await pos();
    R.wakeDrift6s = { dx: +(a1.x - a0.x).toFixed(2), dy: +(a1.y - a0.y).toFixed(2), len: +Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(2), ang: +((Math.atan2(a1.y - a0.y, a1.x - a0.x) * 180) / Math.PI).toFixed(2), pxPerS: +(Math.hypot(a1.x - a0.x, a1.y - a0.y) / 6).toFixed(2) };
    /* 醒态：脑电 d 变化次数（3.2s） */
    R.eegWakeChanges = await pg.evaluate(`(async () => { const el = document.querySelector('.eeg-main'); let last = el.getAttribute('d'), n = 0; const t0 = performance.now(); while (performance.now() - t0 < 3200) { await new Promise(r => requestAnimationFrame(r)); if (el.getAttribute('d') !== last) { n++; last = el.getAttribute('d'); } } return n; })()`);
    /* 醒态：主波字符数（应与线上原样一致） */
    R.wakeMainLen = await pg.evaluate(`document.querySelector('.eeg-main').getAttribute('d').length`);
    R.wakeEchoPresent = await pg.evaluate(`(() => { const a = [...document.querySelectorAll('.eeg-echo')].map(e => (e.getAttribute('d') || '').length); const esb = [...document.querySelectorAll('.esb')].map(e => getComputedStyle(e).opacity); return { echoLen: a, esbOpacity: esb }; })()`);
    /* 醒态：有层 vs ?fld=off */
    const wOff = await (async () => { const p2 = await open(`${BASE}/?fld=off`, 'wake'); await at(p2.pg, '#ns-essays'); const s = await p2.pg.screenshot({ encoding: 'base64' }); await p2.pg.close(); return s; })();
    R.wakeLayerVsOff = await pg.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + w1)},${JSON.stringify('data:image/png;base64,' + wOff)})`);
    const w2 = await pg.screenshot({ encoding: 'base64' });
    R.wakeCtrl = await pg.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + w1)},${JSON.stringify('data:image/png;base64,' + w2)})`);
    R.homeErrs = errs;
    await pg.close();
  }

  /* ── 首页：梦态 ── */
  {
    const { pg, errs } = await open(`${BASE}/`, null);
    await at(pg, '#ns-essays');
    await shot(pg, '03-home-essays-dream');
    R.rewindTransform = await pg.evaluate(`(() => { const e = document.querySelector('.fld-rewind'); return e ? getComputedStyle(e).transform : null; })()`);
    const idx = await pg.evaluate(`(() => { const es = document.querySelectorAll('${SQ}'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 200 && r.top > 150 && r.left < 900 && r.top < 600 && r.width > 50) return i; } return 0; })()`);
    const pos = () => pg.evaluate((i) => { const e = document.querySelectorAll('.fld-sq')[i].getBoundingClientRect(); return { x: +e.left.toFixed(2), y: +e.top.toFixed(2) }; }, idx);
    const xs = [], ys = [];
    for (let i = 0; i < 4; i++) { const p = await pos(); xs.push(p.x); ys.push(p.y); await new Promise((r) => setTimeout(r, 1000)); }
    R.dreamDrift = { xSpan: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), ySpan: +(Math.max(...ys) - Math.min(...ys)).toFixed(2), net3s: +Math.hypot(xs[3] - xs[0], ys[3] - ys[0]).toFixed(2), panState: await pg.evaluate(`getComputedStyle(document.querySelector('.fld-pan')).animationPlayState`) };
    R.eegDreamChanges = await pg.evaluate(`(async () => { const el = document.querySelector('.eeg-main'); let last = el.getAttribute('d'), n = 0, at = []; const t0 = performance.now(); while (performance.now() - t0 < 3200) { await new Promise(r => requestAnimationFrame(r)); const d = el.getAttribute('d'); if (d !== last) { n++; at.push(Math.round(performance.now() - t0)); last = d; } } const e = [...document.querySelectorAll('.eeg-echo')].map(p => (p.getAttribute('d') || '').length); return { n, at, gaps: at.slice(1).map((v, i) => v - at[i]), echoLen: e, distinctEcho: new Set([...document.querySelectorAll('.eeg-echo')].map(p => p.getAttribute('d'))).size, mainVsEcho: e.filter(l => l === el.getAttribute('d').length).length }; })()`);
    R.cutFill = await pg.evaluate(`(() => { const e = document.querySelector('.fld-cut'); return e ? { bg: getComputedStyle(e).backgroundColor, shadow: getComputedStyle(e).boxShadow, opacity: getComputedStyle(e).opacity } : null; })()`);
    R.dreamErrs = errs;
    await pg.close();
  }

  /* ── 内页：随笔列表 ── */
  {
    const { pg, errs } = await open(`${BASE}/articles/`, 'wake');
    await shot(pg, '04-articles-wake');
    await pg.close();
    const d = await open(`${BASE}/articles/`, null);
    await shot(d.pg, '05-articles-dream');
    R.articlesErrs = errs.concat(d.errs);
  }

  /* ── 移动端梦态 ── */
  {
    const { pg } = await open(`${BASE}/`, null, 390, 844);
    await at(pg, '#ns-essays');
    await shot(pg, '06-mobile-dream');
    R.mobileBlocks = await pg.evaluate(`document.querySelectorAll('${SQ}').length`);
    await pg.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, '.shots-p18-site-verify.json'), JSON.stringify(R, null, 2));
  console.log('\n' + JSON.stringify(R, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
