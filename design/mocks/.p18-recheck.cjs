/* 在并行会话改动之后的当前 src 上复核关键行为（用它的 dev server :4321） */
const path = require('path');
const os = require('os');
const fs = require('fs');
const P = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = path.join(__dirname, '.shots-p18-recheck');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await P.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-recheck')}`],
  });
  const open = async (face) => {
    const pg = await b.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await pg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    if (face) await pg.evaluateOnNewDocument((f) => { try { sessionStorage.setItem('xm-reality', f); } catch (e) {} }, face);
    await pg.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60000 });
    await pg.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 6000)); // 等开屏 + 落定
    return { pg, errs };
  };
  const at = async (pg, sel, ms = 1500) => {
    await pg.evaluate((s) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); }, sel);
    await new Promise((r) => setTimeout(r, ms));
  };
  const rate = `(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    let last = el.getAttribute('d') || '', n = 0, at = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
      const d = el.getAttribute('d') || '';
      if (d !== last) { n++; at.push(Math.round(performance.now() - t0)); last = d; }
    }
    return { n, len: last.length, gaps: at.slice(1).map((v, i) => v - at[i]) };
  })`;

  /* 梦态 */
  const d = await open(null);
  await at(d.pg, '#ns-essays');
  await d.pg.screenshot({ path: path.join(OUT, 'dream-essays.png') });
  const dream = {};
  for (const s of ['.eeg-main', '.eeg-echo-1', '.eeg-echo-2', '.eeg-echo-3']) dream[s] = await d.pg.evaluate(`${rate}(${JSON.stringify(s)})`);
  dream.cutBg = await d.pg.evaluate(`(() => { const e = document.querySelector('.fld-cut'); return e ? getComputedStyle(e).backgroundColor : null; })()`);
  dream.rewind = await d.pg.evaluate(`(() => { const e = document.querySelector('.fld-rewind'); return e ? getComputedStyle(e).transform : null; })()`);
  dream.pan = await d.pg.evaluate(`getComputedStyle(document.querySelector('.fld-pan')).animationPlayState`);
  dream.errs = d.errs;
  await d.pg.close();

  /* 醒态 */
  const w = await open('wake');
  await at(w.pg, '#ns-essays');
  await w.pg.screenshot({ path: path.join(OUT, 'wake-essays.png') });
  const wake = {
    main: await w.pg.evaluate(`${rate}('.eeg-main')`),
    echoes: await w.pg.evaluate(`[...document.querySelectorAll('.eeg-echo')].map(e => (e.getAttribute('d') || '').length)`),
    esb: await w.pg.evaluate(`[...document.querySelectorAll('.esb')].map(e => getComputedStyle(e).opacity)`),
  };
  await at(w.pg, null, 0).catch(() => {});
  wake.errs = w.errs;
  /* 醒态首屏 */
  await w.pg.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 1200));
  await w.pg.screenshot({ path: path.join(OUT, 'wake-hero.png') });
  await w.pg.close();

  await b.close();
  const R = { dream, wake };
  fs.writeFileSync(path.join(__dirname, '.shots-p18-recheck.json'), JSON.stringify(R, null, 2));
  const f = (x) => (x ? `变 ${x.n} 次/3s  间隔 ${JSON.stringify((x.gaps || []).slice(0, 5))}  末长 ${x.len}` : 'null');
  console.log('梦态 主波      :', f(dream['.eeg-main']));
  console.log('梦态 echo-1 琥珀:', f(dream['.eeg-echo-1']));
  console.log('梦态 echo-2 灰  :', f(dream['.eeg-echo-2']));
  console.log('梦态 echo-3 暖沙:', f(dream['.eeg-echo-3']));
  console.log('梦态 .fld-cut bg:', dream.cutBg, '｜ rewind', dream.rewind, '｜ pan', dream.pan);
  console.log('醒态 主波      :', f(wake.main));
  console.log('醒态 残影 d 长度:', JSON.stringify(wake.echoes), '｜ 谱带 opacity', JSON.stringify(wake.esb));
  console.log('console errors: 梦', JSON.stringify(dream.errs), '醒', JSON.stringify(wake.errs));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
