/* 浮游碎片 · 第二轮变体截图
   node design/mocks/drift/.shot-v2.cjs   → design/mocks/drift/.shots/v2/
   只拍一部分：ONLY=look,hover,open,bg,essay,panel */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots', 'v2');
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
  const fresh = async (q = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${q}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${q}: ${m.text()}`));
    await page.setViewport(vp);
    await page.goto(URL + q, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2400);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  /* 找一块：lodWanted 档、离中心最近、足够不透明 */
  const findRec = (page, lods, kinds) => page.evaluate((lods, kinds) => {
    const d = window.__drift;
    const c = [...d.recs.values()].filter((r) => lods.includes(r.lod) && +r.el.style.opacity > 0.45 && (!kinds || kinds.includes(r.it.kind)) && r.x > 120 && r.x < innerWidth - 120 && r.y > 120 && r.y < innerHeight - 120)
      .sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2))[0];
    return c ? { x: c.x, y: c.y, key: c.key } : null;
  }, lods, kinds);

  if (want('look')) {
    for (const look of ['frost', 'glow', 'slab', 'print'])
      for (const scene of ['essay', 'moment', 'project']) {
        const p = await fresh(`?look=${look}&scene=${scene}`);
        await shot(p, `look-${look}-${scene}`);
        await p.close();
      }
  }

  if (want('hover')) {
    for (const hv of ['pull', 'sweep', 'lean']) {
      const p = await fresh(`?hover=${hv}`);
      const pt = await findRec(p, hv === 'pull' ? [2, 3] : [0, 1]);
      if (!pt) { errors.push(`hover ${hv}: no target`); await p.close(); continue; }
      await p.mouse.move(pt.x - 60, pt.y - 30);
      await sleep(hv === 'sweep' ? 300 : 120);
      await shot(p, `hover-${hv}-a`);
      await p.mouse.move(pt.x + 40, pt.y - 20, { steps: 4 });
      await sleep(800);
      await shot(p, `hover-${hv}-b`);
      await p.close();
    }
  }

  if (want('open')) {
    for (const mode of ['fly', 'grow', 'pixel', 'page']) {
      const p = await fresh(`?open=${mode}`);
      const pt = await findRec(p, [1, 2]);
      if (!pt) { errors.push(`open ${mode}: no target`); await p.close(); continue; }
      await p.mouse.move(pt.x, pt.y);
      await sleep(60);
      await p.mouse.click(pt.x, pt.y);
      const mids = mode === 'fly' ? [300, 1100] : mode === 'pixel' ? [200, 560] : [240, 520];
      let tPrev = 0;
      for (const t of mids) { await sleep(t - tPrev); tPrev = t; await shot(p, `open-${mode}-${t}`); }
      await sleep(1800);
      await shot(p, `open-${mode}-settled`);
      await p.keyboard.press('Escape');
      await sleep(300);
      await shot(p, `open-${mode}-close-300`);
      await sleep(1400);
      await shot(p, `open-${mode}-closed`);
      await p.close();
    }
  }

  if (want('bg')) {
    for (const b of ['direct', 'ratio', 'heavy', 'stir']) {
      const p = await fresh(`?bg=${b}&scene=moment`);
      await p.mouse.move(1150, 600);
      await p.mouse.down();
      for (let i = 1; i <= 16; i++) { await p.mouse.move(1150 - i * 48, 600 - i * 14); await sleep(16); }
      await shot(p, `bg-${b}-drag`);
      await p.mouse.up();
      await sleep(600);
      await shot(p, `bg-${b}-after600`);
      const st = await p.evaluate(() => { const b = window.__drift.bg; return { stir: Math.hypot(b.stirX, b.stirY).toFixed(3), ox: b.ox.toFixed(1) }; });
      console.log(`bg ${b}`, JSON.stringify(st));
      await p.close();
    }
  }

  if (want('essay')) {
    const p = await fresh('?scene=essay');
    await shot(p, 'essay-start');
    await p.mouse.move(720, 450);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel({ deltaY: 120 }); await sleep(40); }
    await sleep(1400);
    await shot(p, 'essay-pushed');
    await p.close();
  }

  if (want('panel')) {
    const p = await fresh('?scene=project');
    await p.click('#vpanel .vp-toggle');
    await sleep(300);
    await shot(p, 'panel-open');
    await p.close();
  }

  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
