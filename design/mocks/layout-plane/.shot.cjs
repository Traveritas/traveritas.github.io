/* 无界平铺原型 · 截图
   node design/mocks/layout-plane/.shot.cjs   → design/mocks/layout-plane/.shots/
   只拍一部分：ONLY=start,far,hover,article,moment,mobile,dream,keys */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://localhost:4611/';

/* 把页面上所有动画冻在第 t 毫秒（setTimeout 排的遗忘涟漪不受影响，先等它跑完） */
const freezeAt = (page, t) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), t);
const resume = (page) => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

(async () => {
  const server = await start(4611);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const errors = [];
  const fresh = async (vp = { width: 1440, height: 900, deviceScaleFactor: 1 }, hash = '') => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewport(vp);
    await page.goto(URL + hash, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const setCam = (page, x, y) => page.evaluate((x, y) => { const p = window.__plane; p.cam.x = x; p.cam.y = y; p.render(); }, x, y);
  /* 起点加上 (fi, fj) 个周期（平面斜切过，横走一个周期屏上也会下沉一截） */
  const setRel = (page, fi, fj) => page.evaluate((fi, fj) => { const p = window.__plane; const o = p.offset(fi, fj); p.cam.x = p.start.x + o.x; p.cam.y = p.start.y + o.y; p.render(); }, fi, fj);
  /* 找一块指定档位的副本，把镜头移过去，返回它在屏幕上的中心 */
  const findCopy = (page, kinds, lvs, dx = 0, dy = 0) =>
    page.evaluate((kinds, lvs, dx, dy) => {
      const P = window.__plane;
      for (const [i, j] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [1, 2], [2, 1], [-1, 1]]) {
        const o = P.offset(i, j); P.cam.x = P.start.x + o.x; P.cam.y = P.start.y + o.y; P.render();
        const rec = [...P.nodes.values()].find((r) => !r.orig && kinds.includes(r.t.kind) && lvs.includes(r.s.lv) && r.i === i && r.j === j);
        if (!rec) continue;
        P.cam.x = rec.g.x + rec.g.w / 2 + dx; P.cam.y = rec.g.y + rec.g.h / 2 + dy; P.render();
        const r = rec.el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 3 };
      }
      return null;
    }, kinds, lvs, dx, dy);
  const centerOf = (page, route) =>
    page.evaluate((route) => {
      const P = window.__plane;
      const rec = [...P.nodes.values()].find((r) => r.orig && r.t.route === route);
      const r0 = rec.el.getBoundingClientRect();
      if (r0.top < 60 || r0.bottom > innerHeight - 20 || r0.left < 0 || r0.right > innerWidth) { P.cam.x = rec.g.x + rec.g.w / 2; P.cam.y = rec.g.y + rec.g.h / 2; P.render(); }
      const el = document.querySelector(`a.t.orig[href="#${route}"]`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, route);

  if (want('start')) {
    const p = await fresh();
    await shot(p, '01-start');
    await p.close();
  }

  if (want('far')) {
    const p = await fresh();
    // 真实拖拽一段，带惯性
    await p.mouse.move(1100, 600);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(1100 - i * 45, 600 - i * 22); await sleep(16); }
    await p.mouse.up();
    await sleep(1600);
    await shot(p, '02-pan-near');
    await setRel(p, 1.05, 0.55);
    await sleep(500);
    await shot(p, '03-pan-mid');
    await setRel(p, 2.1, 1.4);
    await sleep(500);
    await shot(p, '04-pan-far');
    await setRel(p, 3.4, 2.6);
    await sleep(500);
    await shot(p, '05-pan-farthest');
    await p.close();
  }

  if (want('hover')) {
    const p = await fresh();
    await setRel(p, 1.05, 0.55);
    await sleep(400);
    // 找一块 2 档的副本，悬停
    const pt = await findCopy(p, ['article', 'project', 'about'], [2], 380, 120);
    await sleep(400);
    if (pt) {
      await shot(p, '06-hover-before');
      await p.mouse.move(pt.x, pt.y);
      await sleep(700);
      await shot(p, '07-hover-after');
    }
    // 原件悬停
    await setRel(p, 0, 0);
    await sleep(300);
    const c = await centerOf(p, '/a/co-creation-notes');
    await p.mouse.move(c.x, c.y);
    await sleep(700);
    await shot(p, '08-hover-orig');
    await p.close();
  }

  if (want('article')) {
    const p = await fresh();
    const c = await centerOf(p, '/a/co-creation-notes');
    await p.mouse.click(c.x, c.y);
    await sleep(30);
    await freezeAt(p, 140);
    await shot(p, '10-article-open-140');
    await resume(p);
    await sleep(20);
    await freezeAt(p, 330);
    await shot(p, '11-article-open-330');
    await resume(p);
    await freezeAt(p, 520);
    await shot(p, '12-article-open-520');
    await resume(p);
    await sleep(1400);
    await shot(p, '13-article-settled');
    await p.evaluate(() => document.querySelector('.dt-scroll').scrollTo(0, 900));
    await sleep(300);
    await shot(p, '14-article-scrolled');
    await p.evaluate(() => document.querySelector('.dt-scroll').scrollTo(0, 0));
    await p.keyboard.press('Escape');
    await sleep(60);
    await freezeAt(p, 380);
    await shot(p, '15-article-close-380');
    await resume(p);
    await sleep(1200);
    await shot(p, '16-article-closed');
    await p.close();
  }

  if (want('moment')) {
    const p = await fresh();
    const c = await centerOf(p, '/m/2026-10-04-lacuna-dream/1');
    await p.mouse.click(c.x, c.y);
    await sleep(30);
    await freezeAt(p, 300);
    await shot(p, '20-moment-open-300');
    await resume(p);
    await sleep(1400);
    await shot(p, '21-moment-settled');
    await p.keyboard.press('Escape');
    await sleep(1300);
    // 从远处的副本打开：像素图一路被想起来
    const pt = await findCopy(p, ['img'], [2], 300, 100);
    await sleep(500);
    if (pt) {
      await shot(p, '22-moment-copy-before');
      await p.mouse.click(pt.x, pt.y);
      await sleep(30);
      await freezeAt(p, 380);
      await shot(p, '23-moment-copy-open-380');
      await resume(p);
      await sleep(1400);
      await shot(p, '24-moment-copy-settled');
    }
    await p.close();
  }

  if (want('project')) {
    const p = await fresh();
    const c = await centerOf(p, '/p/personal-website');
    await p.mouse.click(c.x, c.y);
    await sleep(30);
    await freezeAt(p, 300);
    await shot(p, '30-project-open-300');
    await resume(p);
    await sleep(1400);
    await shot(p, '31-project-settled');
    await p.close();
    const q = await fresh(undefined, '#/about');
    await sleep(1200);
    await shot(q, '32-about');
    await q.close();
  }

  if (want('dream')) {
    const p = await fresh();
    await p.click('#real-btn');
    await sleep(600);
    await shot(p, '40-dream');
    await p.click('#toc-btn');
    await sleep(600);
    await shot(p, '41-toc');
    await p.close();
  }

  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh(vp);
    await shot(p, '50-m-start');
    await setRel(p, 0.9, 0.7);
    await sleep(400);
    await shot(p, '51-m-far');
    await setRel(p, 0, 0);
    await sleep(300);
    const c = await p.evaluate(() => {
      const el = [...document.querySelectorAll('a.t.orig')].find((e) => { const r = e.getBoundingClientRect(); return r.left > 0 && r.right < innerWidth && r.top > 60 && r.bottom < innerHeight; });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: el.getAttribute('href') };
    });
    await p.touchscreen.tap(c.x, c.y);
    await sleep(40);
    await freezeAt(p, 320);
    await shot(p, '52-m-open-320');
    await resume(p);
    await sleep(1400);
    await shot(p, '53-m-detail');
    await p.close();
    const q = await fresh(vp, '#/m/2026-10-07-nexus-dev/1');
    await sleep(1200);
    await shot(q, '54-m-moment');
    await q.close();
  }

  if (want('nojs')) {
    const p = await browser.newPage();
    await p.setJavaScriptEnabled(false);
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(URL, { waitUntil: 'networkidle0' });
    await shot(p, '60-nojs');
    await p.close();
  }

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
