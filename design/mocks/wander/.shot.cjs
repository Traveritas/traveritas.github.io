/* 漫游 / 检索 · 截图
   node design/mocks/wander/.shot.cjs            → design/mocks/wander/.shots/
   ONLY=explore,hover,togrid,grid,find,read,toexplore,wipe,mobile,many   只拍一部分

   过渡的中间帧：把页面的时钟停住（__w.freeze），再一帧帧往前推（__w.advance），
   所以拍到的是确定的那一帧，不是软件渲染下碰运气。阅读面板用的是 WAAPI，按 getAnimations 定位。 */
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

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/wander/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (qs = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${qs}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs}: ${m.text()}`));
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
    await page.goto(URL + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__w', { timeout: 20000 });
    await sleep(2600);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const freeze = (page) => page.evaluate(() => window.__w.freeze());
  const adv = (page, ms) => page.evaluate((m) => window.__w.advance(m), ms);
  /* 停住时钟后再推进一段，让浏览器画一帧 */
  const frameAt = async (page, ms, name) => { await adv(page, ms); await sleep(120); await shot(page, name); };
  /* 屏幕中央附近、够清楚的一扇（漫游） */
  const clearRec = (page) => page.evaluate(() => {
    const r = [...window.__w.recs.values()].filter((v) => v.lod === 0 && v.a > 0.6 && v.x > 260 && v.x < innerWidth - 260 && v.y > 200 && v.y < innerHeight - 200)
      .sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2))[0];
    return r ? { x: Math.round(r.x), y: Math.round(r.y), w: r.it.w * r.s, h: r.it.h * r.s } : null;
  });

  if (want('explore')) {
    for (const s of ['essay', 'moment', 'project']) {
      const p = await fresh(`?view=explore&scene=${s}`);
      await shot(p, `01-explore-${s}`);
      await p.close();
    }
  }

  if (want('hover')) {
    const p = await fresh('?view=explore&scene=project');
    const r = await clearRec(p);
    if (r) {
      await p.mouse.move(r.x + r.w * 0.36, r.y - r.h * 0.3, { steps: 6 });
      await sleep(900);
      await shot(p, '02-hover-explore');
    }
    await p.close();
  }

  if (want('togrid')) {
    const p = await fresh('?view=explore&scene=moment');
    await freeze(p);
    await p.evaluate(() => window.__w.toGrid());
    for (const ms of [160, 220, 260, 300, 400]) await frameAt(p, ms, `03-togrid-${[160, 380, 640, 940, 1340][[160, 220, 260, 300, 400].indexOf(ms)]}`);
    await p.evaluate(() => window.__w.resume());
    await sleep(800);
    await shot(p, '03-togrid-settled');
    await p.close();
  }

  if (want('grid')) {
    const p = await fresh('?view=grid');
    await sleep(600);
    await shot(p, '04-grid');
    const v = await p.evaluate(() => { const g = [...window.__w.GE.values()].find((x) => x.it.scene === 'moment' && x.order === 0); return { x: g.x, y: g.y, w: g.it.w * g.s, h: g.it.h * g.s }; });
    await p.mouse.move(v.x + v.w * 0.3, v.y - v.h * 0.25, { steps: 6 });
    await sleep(800);
    await shot(p, '05-grid-hover');
    await p.mouse.move(150, 700, { steps: 8 });
    await sleep(1100);
    await shot(p, '05b-grid-hover-left');
    await p.mouse.move(1250, 760, { steps: 8 });
    await sleep(1100);
    await shot(p, '05c-grid-hover-right');
    await p.close();
  }

  if (want('find')) {
    const p = await fresh('?view=grid&many=1');
    await sleep(600);
    await shot(p, '06-grid-many');
    await p.mouse.move(720, 600);
    await p.mouse.wheel({ deltaY: 900 });
    await sleep(1200);
    await shot(p, '07-grid-many-scrolled');
    await p.evaluate(() => window.__w.setQuery('显影')); // 检索框先拿掉了，等工具区
    await sleep(1400);
    await shot(p, '08-find');
    await p.close();
  }

  if (want('read')) {
    const p = await fresh('?view=grid');
    await sleep(500);
    const v = await p.evaluate(() => { const g = [...window.__w.GE.values()].find((x) => x.it.scene === 'essay' && x.order === 0); return { x: g.x, y: g.y }; });
    await p.mouse.click(v.x, v.y);
    await sleep(80);
    // 面板长大的中途：WAAPI 停在 340ms
    await p.evaluate(() => document.querySelectorAll('.rd *, .rd').forEach((el) => el.getAnimations().forEach((a) => { a.pause(); a.currentTime = 340; })));
    await sleep(150);
    await shot(p, '09-read-grow');
    await p.evaluate(() => document.querySelectorAll('.rd *, .rd').forEach((el) => el.getAnimations().forEach((a) => a.play())));
    await sleep(1400);
    await shot(p, '10-read');
    await p.evaluate(() => document.querySelector('.rd-scroll').scrollTop = 900);
    await sleep(300);
    await shot(p, '11-read-scrolled');
    await p.keyboard.press('ArrowRight');
    await sleep(900);
    await shot(p, '12-read-next');
    await p.keyboard.press('Escape');
    await sleep(1300);
    await shot(p, '13-read-closed');
    await p.close();
    // 漫游里点开
    const e = await fresh('?view=explore&scene=moment');
    const r = await clearRec(e);
    if (r) {
      await e.mouse.click(r.x, r.y);
      await sleep(1500);
      await shot(e, '14-read-explore');
    }
    await e.close();
  }

  if (want('toexplore')) {
    const p = await fresh('?view=grid');
    await sleep(600);
    await freeze(p);
    await p.evaluate(() => window.__w.toExplore('project'));
    for (const [ms, t] of [[180, 180], [220, 400], [260, 660], [500, 1160]]) await frameAt(p, ms, `15-toexplore-${t}`);
    await p.evaluate(() => window.__w.resume());
    await sleep(900);
    await shot(p, '15-toexplore-settled');
    await p.close();
  }

  if (want('wipe')) {
    const p = await fresh('?view=explore&scene=essay');
    await freeze(p);
    await p.evaluate(() => window.__w.setScene('moment'));
    for (const [ms, t] of [[300, 300], [250, 550], [600, 1150]]) await frameAt(p, ms, `16-wipe-${t}`);
    await p.close();
  }

  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh('?view=explore&scene=essay', vp);
    await shot(p, '20-m-explore');
    await freeze(p);
    await p.evaluate(() => window.__w.toGrid());
    await frameAt(p, 420, '21-m-togrid-420');
    await p.evaluate(() => window.__w.resume());
    await sleep(2000);
    await shot(p, '21-m-grid');
    await p.evaluate(() => { window.__w.scroll[0].target = 900; });
    await sleep(1200);
    await shot(p, '21-m-grid-scrolled');
    await p.close();
  }

  if (want('many')) {
    const p = await fresh('?view=explore&scene=project&many=1');
    await shot(p, '22-many-explore');
    await p.close();
  }

  await browser.close();
  server.close();
  console.log(errors.length ? errors.join('\n') : 'no errors');
})();
