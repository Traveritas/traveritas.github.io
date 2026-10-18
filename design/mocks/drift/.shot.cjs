/* 浮游碎片 · 截图
   node design/mocks/drift/.shot.cjs   → design/mocks/drift/.shots/
   只拍一部分：ONLY=scenes,drag,zoom,open,mobile
   运动是 rAF 驱动的弹簧，不是 WAAPI——所以「中途」镜头靠真实时间点拍。 */
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
  const URL = `http://localhost:${server.address().port}/drift/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (vp = { width: 1440, height: 900, deviceScaleFactor: 1 }, q = '') => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
    await page.setViewport(vp);
    await page.goto(URL + q, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2400);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const stats = (page) => page.evaluate(() => {
    const d = window.__drift;
    const lods = [0, 0, 0, 0];
    let vis = 0;
    for (const r of d.recs.values()) { if (+r.el.style.opacity > 0.02) { vis++; lods[r.lod]++; } }
    return { recs: d.recs.size, visible: vis, lods, gl: !document.getElementById('light').classList.contains('no-gl') };
  });

  if (want('scenes')) {
    for (const s of ['essay', 'moment', 'project']) {
      const p = await fresh(undefined, `?scene=${s}`);
      await shot(p, `0${['essay', 'moment', 'project'].indexOf(s) + 1}-${s}`);
      console.log(s, JSON.stringify(await stats(p)));
      await p.close();
    }
  }

  if (want('drag')) {
    const p = await fresh();
    await p.mouse.move(1000, 520);
    await p.mouse.down();
    for (let i = 1; i <= 14; i++) { await p.mouse.move(1000 - i * 34, 520 - i * 12); await sleep(16); }
    await p.mouse.up();
    await sleep(90);
    await shot(p, '10-drag-mid');
    await sleep(1800);
    await shot(p, '11-drag-settled');
    await p.close();
  }

  if (want('zoom')) {
    const p = await fresh();
    await p.mouse.move(720, 450);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel({ deltaY: 120 }); await sleep(40); }
    await sleep(200);
    await shot(p, '20-push-mid');
    await sleep(1200);
    await shot(p, '21-pushed');
    for (let i = 0; i < 14; i++) { await p.mouse.wheel({ deltaY: -120 }); await sleep(40); }
    await sleep(1400);
    await shot(p, '22-pulled');
    await p.close();
  }

  if (want('open')) {
    const p = await fresh();
    // 点一块失焦的远处副本：镜头穿过去
    const pt = await p.evaluate(() => {
      const d = window.__drift;
      const cand = [...d.recs.values()].filter((r) => r.lod >= 2 && +r.el.style.opacity > 0.3).sort((a, b) => Math.hypot(a.x - 720, a.y - 450) - Math.hypot(b.x - 720, b.y - 450))[0]
        || [...d.recs.values()].find((r) => +r.el.style.opacity > 0.5);
      return { x: cand.x, y: cand.y };
    });
    await p.mouse.click(pt.x, pt.y);
    await sleep(260);
    await shot(p, '30-fly-mid');
    await sleep(700);
    await shot(p, '31-open-mid');
    await sleep(1200);
    await shot(p, '32-open-settled');
    await p.evaluate(() => document.querySelector('.rd-scroll').scrollTo(0, 700));
    await sleep(300);
    await shot(p, '33-reading-scrolled');
    await p.keyboard.press('Escape');
    await sleep(260);
    await shot(p, '34-close-mid');
    await sleep(1000);
    await shot(p, '35-closed');
    await p.close();

    const m = await fresh(undefined, '?scene=moment');
    const mp = await m.evaluate(() => {
      const d = window.__drift;
      const r = [...d.recs.values()].filter((r) => r.it.kind === 'img' && +r.el.style.opacity > 0.4).sort((a, b) => a.lod - b.lod)[0];
      return { x: r.x, y: r.y };
    });
    await m.mouse.click(mp.x, mp.y);
    await sleep(2200);
    await shot(m, '36-moment-open');
    await m.close();
  }

  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh(vp, '?scene=project');
    await shot(p, '50-m-project');
    const pt = await p.evaluate(() => {
      const r = [...window.__drift.recs.values()].filter((r) => +r.el.style.opacity > 0.5).sort((a, b) => a.lod - b.lod)[0];
      return { x: r.x, y: r.y };
    });
    await p.touchscreen.tap(pt.x, pt.y);
    await sleep(2400);
    await shot(p, '51-m-open');
    await p.close();
  }

  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
