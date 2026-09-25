/* 方案 D 自验辅助（非交付物，只自用）
   node design/mocks/.cursor-D-check.cjs [mode]
     mode: scan | rest | degrade | state   （默认全跑）
   自带静态服务器（随机端口），不抢 8151。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'cursor-D-double-image';
const MODE = process.argv[2] || 'all';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, r2) => {
      const p0 = decodeURIComponent(req.url.split('?')[0]);
      if (p0 === '/favicon.ico') return (r2.writeHead(204), r2.end());
      const p = path.join(ROOT, p0);
      fs.readFile(p, (e, d) => {
        if (e) return (r2.writeHead(404), r2.end('nf'));
        r2.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        r2.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-cursor-D-check')}`],
  });
  const errs = [];
  async function page(q) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await p.goto(base + q, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));
    return p;
  }
  /* 光标层当前读数：inline transform / opacity（自验脚本里读样式，不是光标层在读） */
  async function layer(p) {
    return p.evaluate(() => {
      const hot = document.querySelector('#cursor-slot .cd-hot');
      const copy = document.querySelector('#cursor-slot .cd-copy');
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const m = (el) => { if (!el) return null; const t = el.style.transform.match(/translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/); return t ? [+t[1], +t[2]] : null; };
      const hr = hot ? hot.getBoundingClientRect() : null;
      const cr = copy ? copy.getBoundingClientRect() : null;
      return {
        slotClass: document.getElementById('cursor-slot').className, slotOp: getComputedStyle(document.getElementById('cursor-slot')).opacity,
        bodyClass: document.body.className,
        hotTf: m(hot), copyTf: m(copy),
        copyInlineOp: copy ? copy.style.opacity : null,
        copyAnim: copy ? cs(copy).animationName : null,
        copyOp: copy ? +(cr.width ? cs(copy).opacity : 0) : null,
        gap: hr && cr ? { dx: +(cr.left - hr.left).toFixed(2), dy: +(cr.top - hr.top).toFixed(2), dist: +Math.hypot(cr.left - hr.left, cr.top - hr.top).toFixed(2) } : null,
        hotRect: hr ? [+hr.left.toFixed(1), +hr.top.toFixed(1)] : null,
        els: document.getElementById('cursor-slot').querySelectorAll('*').length,
        willChange: cs(document.getElementById('cursor-slot')).willChange,
        childWill: hot ? cs(hot).willChange + ' / ' + cs(copy).willChange : null,
      };
    });
  }

  if (MODE === 'all' || MODE === 'scan' || MODE === 'targets') {
    console.log('\n=== scan: 光标落点(760,470) 在不同滚动目标下压到什么 ===');
    const list = MODE === 'targets'
      ? ['#cursor-lab', '.lab .sec-head', '.lab-intro', '.lab-grid', '.lab-cell:nth-child(1)', '.lab-cell:nth-child(2)',
        '.lab-cell:nth-child(3)', '.lab-cell:nth-child(4)', '.lab-cell:nth-child(5)', '.lab-cell:nth-child(6)',
        '.lab-cap', '.lab-chain', '.lab-note', '.lab-prose', '.lab-prose p:nth-child(2)', '.lab-prose p:last-child',
        '.lab-field', '#lab-text', '#lab-area', '.lab-drag', '#lab-hold', '.lab-hold-hint', '.lab-prose p:first-child', '.lab-field label']
      : ['#cursor-lab', '.lab-prose', '#lab-text', '#lab-area', '.lab-drag', '#lab-hold', '.lab-chain', '.lab-cell'];
    for (const sel of list) {
      const p = await page('?ui=0&probe=1');
      await p.mouse.move(700, 420, { steps: 6 });
      await p.mouse.move(760, 470, { steps: 6 });
      await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      }, sel);
      await new Promise((r) => setTimeout(r, 400));
      const info = await p.evaluate(() => {
        const el = document.elementFromPoint(760, 470);
        const d = (s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return [+r.top.toFixed(0), +r.bottom.toFixed(0)]; };
        return {
          under: el ? (el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' "' + (el.textContent || '').trim().slice(0, 18) + '"') : 'null',
          prose: d('.lab-prose'), chain: d('.lab-chain'), input: d('#lab-text'), drag: d('.lab-drag'), hold: d('#lab-hold'), scrollY: Math.round(window.scrollY),
        };
      });
      console.log(String(sel).padEnd(12), '->', JSON.stringify(info));
      await p.close();
    }
  }

  if (MODE === 'all' || MODE === 'rest') {
    console.log('\n=== rest: 静息 rAF / will-change / 热点偏差 ===');
    for (const q of ['?ui=0&probe=1&mix=1', '?ui=0&probe=1&mix=0', '?ui=0&probe=1&mix=0&zone=deep', '?ui=0&probe=1&mix=0&zone=paper']) {
      const p = await page(q);
      await p.mouse.move(700, 420, { steps: 8 });
      await p.mouse.move(760, 470, { steps: 8 });
      await p.mouse.move(762, 471, { steps: 2 });   // 末次抖动，测收敛
      await new Promise((r) => setTimeout(r, 1500));
      const a = await p.evaluate(() => window.__cur.report());
      await new Promise((r) => setTimeout(r, 5000));
      const b = await p.evaluate(() => window.__cur.report());
      const L = await layer(p); const D = await p.evaluate(() => window.__curD && window.__curD.get());
      console.log(q);
      console.log('  rAF 5s 内增量 =', b.rafTotal - a.rafTotal, '（累计', b.rafTotal, '· 面板近5s', b.rafLast5s, '）· 元素', b.slotElements);
      console.log('  热点偏差', JSON.stringify(b.hotspot), '· will-change(槽位)', JSON.stringify(b.willChange));
      console.log('  layer', JSON.stringify(L));
      await p.close();
    }
  }

  if (MODE === 'all' || MODE === 'state') {
    console.log('\n=== state: 12 项强制态的两影几何（gap = 副本相对正点的错位） ===');
    const S = ['rest', 'move', 'hover-link', 'hover-text', 'input', 'drag', 'click', 'hold1300', 'hold2200', 'latch', 'scroll', 'leave'];
    for (const mix of [1, 0]) {
      console.log('-- mix=' + mix + ' --');
      for (const s of S) {
        const p = await page(`?ui=0&probe=1&mix=${mix}&state=${s}`);
        await p.mouse.move(700, 420, { steps: 8 });
        await p.mouse.move(760, 470, { steps: 8 });
        await new Promise((r) => setTimeout(r, 1400));
        const L = await layer(p); const D = await p.evaluate(() => window.__curD && window.__curD.get());
        console.log(String(s).padEnd(11), 'gap', JSON.stringify(L.gap), 'copyOp', L.copyOp, 'anim', L.copyAnim,
          'DBG', JSON.stringify(D),
          'slot', L.slotClass || '(none)', 'reported', (await p.evaluate(() => window.__cur.report())).state);
        await p.close();
      }
    }
  }

  if (MODE === 'all' || MODE === 'degrade') {
    console.log('\n=== degrade ===');
    // ?cursor=off
    let p = await page('?ui=0&probe=1&cursor=off');
    await p.mouse.move(700, 420, { steps: 8 }); await p.mouse.move(760, 470, { steps: 8 });
    await new Promise((r) => setTimeout(r, 600));
    console.log('cursor=off  body="' + (await p.evaluate(() => document.body.className)) + '"  layer=' + JSON.stringify(await layer(p)));
    await p.close();
    // ?reduced=1
    p = await page('?ui=0&probe=1&reduced=1');
    await p.mouse.move(700, 420, { steps: 8 }); await p.mouse.move(760, 470, { steps: 8 });
    await new Promise((r) => setTimeout(r, 600));
    console.log('reduced=1   body="' + (await p.evaluate(() => document.body.className)) + '"  layer=' + JSON.stringify(await layer(p)));
    await p.close();
    // forced-colors
    p = await page('?ui=0&probe=1');
    const cdp = await p.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });
    await new Promise((r) => setTimeout(r, 250));
    const fcMatch = await p.evaluate(() => matchMedia('(forced-colors: active)').matches);
    await p.mouse.move(700, 420, { steps: 8 }); await p.mouse.move(760, 470, { steps: 8 });
    await new Promise((r) => setTimeout(r, 600));
    console.log('forced-colors matchMedia=' + fcMatch + '  body="' + (await p.evaluate(() => document.body.className)) + '"  slotDisplay=' + (await p.evaluate(() => getComputedStyle(document.getElementById('cursor-slot')).display)) + '  computedCursor=' + (await p.evaluate(() => getComputedStyle(document.body).cursor)));
    await p.close();
    // touch
    p = await page('?ui=0&probe=1');
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, hasTouch: true, isMobile: false });
    await p.mouse.move(700, 420, { steps: 8 }); await p.mouse.move(760, 470, { steps: 8 });
    await new Promise((r) => setTimeout(r, 300));
    const before = await p.evaluate(() => document.body.className);
    await p.touchscreen.tap(760, 470);
    await new Promise((r) => setTimeout(r, 400));
    const after = await p.evaluate(() => document.body.className);
    const rp = await p.evaluate(() => window.__cur.report());
    console.log('touch: mouse 后 "' + before + '" → tap 后 "' + after + '"  lastPointerType=' + rp.lastPointerType + ' fxCursorOn=' + rp.fxCursorOn + ' layer=' + JSON.stringify(await layer(p)));
    await p.close();
  }

  await browser.close();
  server.close();
  console.log('\nconsole/page errors:', errs.length, errs.length ? errs : '');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
