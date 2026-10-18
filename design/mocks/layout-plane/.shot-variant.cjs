/* 变体截图：给任意 ?rule / ?detail / ?skin / ?mech 组合拍一套标准镜头
   node design/mocks/layout-plane/.shot-variant.cjs "<查询串>" <输出目录名> [额外镜头脚本.cjs]
   例：node .shot-variant.cjs "?skin=b2" b2-nocard
   → .shots/b2-nocard/*.png；最后一行打印 "no errors" 或页面里的报错。
   服务开在随机端口，多个变体可以同时拍。
   额外镜头脚本：module.exports = async (h) => { const p = await h.fresh(); ...; await h.shot(p, '90-mine'); }
   h 里有 fresh(viewport?, hash?) · shot(page, name) · sleep(ms) · freezeAt(page, ms) · resume(page)
         setRel(page, 周期i, 周期j) · findCopy(page, kinds, 档位[]) · centerOf(page, route) · mouse 操作用 page.mouse */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [QUERY = '', NAME = 'variant', EXTRA] = process.argv.slice(2);
const OUT = path.join(__dirname, '.shots', NAME);
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freezeAt = (page, t) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), t);
const resume = (page) => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/${QUERY}`;
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
  const setRel = (page, fi, fj) => page.evaluate((fi, fj) => { const p = window.__plane; const o = p.offset(fi, fj); p.cam.x = p.start.x + o.x; p.cam.y = p.start.y + o.y; p.render(); }, fi, fj);
  const findCopy = (page, kinds, lvs) =>
    page.evaluate((kinds, lvs) => {
      const P = window.__plane;
      for (const [i, j] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 0], [1, 2], [2, 1], [-1, 1]]) {
        const o = P.offset(i, j); P.cam.x = P.start.x + o.x; P.cam.y = P.start.y + o.y; P.render();
        const rec = [...P.nodes.values()].find((r) => !r.orig && kinds.includes(r.t.kind) && r.s && lvs.includes(r.s.lv) && r.i === i && r.j === j);
        if (!rec) continue;
        P.cam.x = rec.g.x + rec.g.w / 2; P.cam.y = rec.g.y + rec.g.h / 2; P.render();
        const r = rec.el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 3 };
      }
      return null;
    }, kinds, lvs);
  const centerOf = (page, route) =>
    page.evaluate((route) => {
      const P = window.__plane;
      const rec = [...P.nodes.values()].find((r) => r.orig && r.t.route === route);
      const r0 = rec.el.getBoundingClientRect();
      if (r0.top < 60 || r0.bottom > innerHeight - 20 || r0.left < 0 || r0.right > innerWidth) { P.cam.x = rec.g.x + rec.g.w / 2; P.cam.y = rec.g.y + rec.g.h / 2; P.render(); }
      const r = rec.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, route);
  const h = { fresh, shot, sleep, freezeAt, resume, setRel, findCopy, centerOf, browser, URL };

  if (want('plane')) {
    const p = await fresh();
    await shot(p, '01-start');
    await setRel(p, 1.05, 0.55); await sleep(500); await shot(p, '02-mid');
    await setRel(p, 2.1, 1.4); await sleep(500); await shot(p, '03-far');
    const pt = await findCopy(p, ['article', 'project', 'about'], [2]);
    await sleep(400);
    if (pt) { await p.mouse.move(pt.x, pt.y); await sleep(700); await shot(p, '04-hover-copy'); }
    await p.close();
  }
  if (want('article')) {
    const p = await fresh();
    const c = await centerOf(p, '/a/co-creation-notes');
    await p.mouse.click(c.x, c.y);
    await sleep(30);
    for (const t of [140, 330, 520]) { await freezeAt(p, t); await shot(p, `10-article-open-${t}`); await resume(p); await sleep(20); }
    await sleep(1400);
    await shot(p, '13-article-settled');
    await p.evaluate(() => { const s = document.querySelector('.dt-scroll'); s && s.scrollTo(0, 900); });
    await sleep(300);
    await shot(p, '14-article-scrolled');
    await p.keyboard.press('Escape');
    await sleep(60);
    await freezeAt(p, 380); await shot(p, '15-article-close-380'); await resume(p);
    await sleep(1200);
    await shot(p, '16-article-closed');
    await p.close();
  }
  if (want('moment')) {
    const p = await fresh();
    const c = await centerOf(p, '/m/2026-10-04-lacuna-dream/1');
    await p.mouse.click(c.x, c.y);
    await sleep(1500);
    await shot(p, '20-moment-settled');
    await p.keyboard.press('Escape');
    await sleep(1300);
    const pt = await findCopy(p, ['img'], [2]);
    await sleep(500);
    if (pt) {
      await p.mouse.click(pt.x, pt.y);
      await sleep(30); await freezeAt(p, 380); await shot(p, '21-moment-copy-open-380'); await resume(p);
      await sleep(1400); await shot(p, '22-moment-copy-settled');
    }
    await p.close();
  }
  if (want('project')) {
    const p = await fresh();
    const c = await centerOf(p, '/p/personal-website');
    await p.mouse.click(c.x, c.y);
    await sleep(1500);
    await shot(p, '30-project-settled');
    await p.close();
  }
  if (want('dream')) {
    const p = await fresh();
    await p.click('#real-btn');
    await sleep(600);
    await shot(p, '40-dream');
    await p.close();
  }
  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh(vp);
    await shot(p, '50-m-start');
    const c = await centerOf(p, '/a/co-creation-notes');
    await p.touchscreen.tap(c.x, c.y);
    await sleep(1500);
    await shot(p, '51-m-detail');
    await p.close();
  }
  if (EXTRA) await require(path.resolve(EXTRA))(h);

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
