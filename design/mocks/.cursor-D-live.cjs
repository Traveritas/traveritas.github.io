/* 方案 D 真手势自验（自验辅助，非交付物）
   node design/mocks/.cursor-D-live.cjs
   全用真事件（真悬停 / 真移动 / 真长按 / 真点按 / 真拖动 / 真滚动），
   不用 ?state=。同时把关键的几拍截成 live-*.png 存进 .shots-cursor-D/。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-cursor-D');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const T0 = [];

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
  const PORT = server.address().port;
  const base = `http://127.0.0.1:${PORT}/design/mocks/cursor-D-double-image.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-cursor-D-live')}`],
  });
  const errs = [];
  async function open(q, dpr) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr || 1 });
    await p.goto(base + q, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));
    return p;
  }
  const probe = (p) => p.evaluate(() => {
    const s = document.getElementById('cursor-slot');
    const c = document.querySelector('#cursor-slot .cd-copy');
    const h = document.querySelector('#cursor-slot .cd-hot');
    if (!h || !c) return null;
    const rc = c.getBoundingClientRect(), rh = h.getBoundingClientRect();
    return {
      st: window.__cur.report().state, face: document.body.dataset.reality,
      cls: s.className, slotOp: getComputedStyle(s).opacity,
      gap: [+(rc.left - rh.left).toFixed(2), +(rc.top - rh.top).toFixed(2)],
      d: +Math.hypot(rc.left - rh.left, rc.top - rh.top).toFixed(2),
      op: +getComputedStyle(c).opacity, rn: window.__curD ? window.__curD.get().rn : null,
    };
  });
  const gotoLab = async (p) => {
    await p.mouse.move(700, 420, { steps: 6 });
    await p.mouse.move(760, 470, { steps: 6 });
    await p.evaluate(() => {
      const el = document.querySelector('#cursor-lab');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    });
    await new Promise((r) => setTimeout(r, 400));
  };
  const shot = (p, name, clip) => p.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip: { ...clip, x: clip.x + 738 - 738 }, captureBeyondViewport: true } : {}) });

  /* ── A · 真悬停：每种元素只靠 pointerover 委托认出状态 ── */
  console.log('=== A · 真悬停（无 ?state=） ===');
  {
    const p = await open('?ui=0&probe=1');
    const spots = [
      ['空白（首屏纸面）', 760, 470, null],
      ['链接（文字链 1）', 452, 200, null],
      ['链接（文字链 3 GitHub）', 730, 200, null],
      ['正文段落', 700, 330, null],
      ['单行输入框', 545, 700, null],
      ['多行输入 textarea', 900, 700, null],
      ['可拖元素', 980, 860, null],
    ];
    for (const [label, x, y] of spots) {
      // 用元素真实位置驱动：先把目标元素滚到视口内，再悬停其中心
      await p.mouse.move(400, 300, { steps: 4 });
      await p.mouse.move(x, y, { steps: 8 });
      await new Promise((r) => setTimeout(r, 450));
      const r = await probe(p);
      console.log('  ' + label.padEnd(22), JSON.stringify(r));
    }
    // 真悬停：按元素中心逐个来（先滚到该元素）
    for (const [label, sel] of [['文字链 · 全部随笔', '.lab-chain a:nth-child(1)'], ['正文 · 段落 2', '.lab-prose p:nth-child(2)'], ['输入框 · text', '#lab-text'], ['可拖元素', '.lab-drag'], ['站点导航 · 关于', '.site-nav a:nth-child(3)'], ['入口卡 · GitHub', '#ns-dawn .wake-anchor:nth-child(1)']]) {
      const box = await p.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) window.scrollTo(0, r.top + scrollY - innerHeight / 2);
        const r2 = el.getBoundingClientRect();
        return [+(r2.left + r2.width / 2).toFixed(1), +(r2.top + r2.height / 2).toFixed(1)];
      }, sel);
      if (!box) { console.log('  (missing) ' + sel); continue; }
      await p.mouse.move(box[0] - 20, box[1] - 16, { steps: 6 });
      await p.mouse.move(box[0], box[1], { steps: 6 });
      await new Promise((r) => setTimeout(r, 500));
      console.log('  ' + label.padEnd(22), JSON.stringify(await probe(p)));
    }
    await p.close();
  }

  /* ── B · 真移动：残余在动 ── */
  console.log('\n=== B · 真移动（残余 = 本帧未追上的位移） ===');
  {
    for (const mix of [1, 0]) {
      const p = await open(`?ui=0&probe=1&mix=${mix}`, 8);
      await gotoLab(p);
      // 连续快移：边走边采样
      const samples = [];
      await p.mouse.move(560, 350, { steps: 2 });
      for (let i = 0; i < 6; i++) {
        await p.mouse.move(560 + i * 40, 350 + i * 22, { steps: 2 });
        samples.push(await p.evaluate(() => {
          const c = document.querySelector('#cursor-slot .cd-copy'), h = document.querySelector('#cursor-slot .cd-hot');
          const rc = c.getBoundingClientRect(), rh = h.getBoundingClientRect();
          return [+Math.hypot(rc.left - rh.left, rc.top - rh.top).toFixed(2), +getComputedStyle(c).opacity];
        }));
      }
      await p.mouse.move(760, 470, { steps: 2 });
      await p.screenshot({ path: path.join(OUT, `live-move-mix${mix}.png`), clip: { x: 760 - 22 + (await p.evaluate(() => scrollX)), y: 470 - 15 + (await p.evaluate(() => scrollY)), width: 44, height: 30 }, captureBeyondViewport: true });
      console.log(`  mix=${mix} 快移中 d/op 采样`, JSON.stringify(samples.slice(0, 4)));
      // 停下后按时间采样褪去过程
      const decay = [];
      const t0 = Date.now();
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 180));
        decay.push([Date.now() - t0, ...(await p.evaluate(() => {
          const c = document.querySelector('#cursor-slot .cd-copy'), h = document.querySelector('#cursor-slot .cd-hot');
          const rc = c.getBoundingClientRect(), rh = h.getBoundingClientRect();
          return [+Math.hypot(rc.left - rh.left, rc.top - rh.top).toFixed(2), document.getElementById('cursor-slot').className.includes('is-rest') ? 'css' : 'js'];
        }))]);
      }
      console.log(`  mix=${mix} 停下后(ms,d,owner)`, JSON.stringify(decay));
      await p.close();
    }
  }

  /* ── C · 真长按 → 闩锁 ── */
  console.log('\n=== C · 真长按（1300ms 回梦 / 2200ms 入醒）与闩锁 ===');
  {
    const p = await open('?ui=0&probe=1&mix=1', 8);
    await gotoLab(p);
    await p.mouse.down();
    const marks = [300, 700, 1100];
    for (const m of marks) {
      await new Promise((r) => setTimeout(r, m === 300 ? 300 : 400));
      console.log('  长按 ' + String(m).padStart(4) + 'ms', JSON.stringify(await probe(p)));
    }
    await p.screenshot({ path: path.join(OUT, 'live-hold2300.png'), clip: { x: 760 - 30, y: 470 - 20 + 1323, width: 60, height: 40 }, captureBeyondViewport: true });
    await new Promise((r) => setTimeout(r, 200));   // ≈1300ms：闩锁
    console.log('  闩锁后       ', JSON.stringify(await probe(p)));
    await p.screenshot({ path: path.join(OUT, 'live-latch.png'), clip: { x: 760 - 30, y: 470 - 20 + 1323, width: 60, height: 40 }, captureBeyondViewport: true });
    await new Promise((r) => setTimeout(r, 300));
    console.log('  闩锁 +300ms  ', JSON.stringify(await probe(p)));
    await p.mouse.up();
    await new Promise((r) => setTimeout(r, 900));
    console.log('  松手 +900ms  ', JSON.stringify(await probe(p)));
    // 回梦再长按 2200 入醒
    await p.mouse.down();
    await new Promise((r) => setTimeout(r, 1000));
    console.log('  回梦 长按 1s ', JSON.stringify(await probe(p)));
    await new Promise((r) => setTimeout(r, 1250));
    console.log('  回梦 闩锁    ', JSON.stringify(await probe(p)));
    await p.mouse.up();
    await p.close();
  }

  /* ── D · 真点按 / 真拖动 / 真滚动 ── */
  console.log('\n=== D · 真点按 / 真拖动 / 真滚动 ===');
  {
    const p = await open('?ui=0&probe=1&mix=1', 1);
    await gotoLab(p);
    await p.mouse.down(); await new Promise((r) => setTimeout(r, 60)); await p.mouse.up();
    await new Promise((r) => setTimeout(r, 60));
    console.log('  点按 +60ms  ', JSON.stringify(await probe(p)));
    await new Promise((r) => setTimeout(r, 320));
    console.log('  点按 +380ms ', JSON.stringify(await probe(p)));
    // 拖动
    const box = await p.evaluate(() => {
      const el = document.querySelector('.lab-drag');
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) window.scrollTo(0, r.top + scrollY - innerHeight / 2);
      const r2 = el.getBoundingClientRect();
      return [+(r2.left + 24).toFixed(1), +(r2.top + 24).toFixed(1)];
    });
    await p.mouse.move(box[0], box[1], { steps: 6 });
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) await p.mouse.move(box[0] + i * 18, box[1] + i * 10, { steps: 2 });
    await new Promise((r) => setTimeout(r, 200));
    console.log('  拖动中      ', JSON.stringify(await probe(p)));
    await p.mouse.up();
    await new Promise((r) => setTimeout(r, 400));
    console.log('  拖完        ', JSON.stringify(await probe(p)));
    // 滚动
    await p.evaluate(() => window.scrollBy(0, 120));
    await new Promise((r) => setTimeout(r, 80));
    console.log('  滚动 +80ms  ', JSON.stringify(await probe(p)));
    await new Promise((r) => setTimeout(r, 500));
    console.log('  滚动 +580ms ', JSON.stringify(await probe(p)));
    await p.close();
  }

  await browser.close();
  server.close();
  console.log('\nconsole/page errors:', errs.length, errs);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
