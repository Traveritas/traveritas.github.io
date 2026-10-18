/* 浮游碎片 · 第三轮变体截图（外观 / 悬停 / 展开 / 装饰）
   node design/mocks/drift/.shot-v3.cjs                     → design/mocks/drift/.shots/v3/
   ONLY=looks,hovers,opens,decos   只拍某一类
   NAMES=facet,petal               只拍某几个变体（逗号分隔）
   SCENES=essay,project            装饰 / 外观用哪些场景
   变体名单直接问页面（DriftReg.names），不用在这里重复维护。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots', 'v3');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean);
const SCENES = (process.env.SCENES || 'essay,project,moment').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const pick = (list) => (NAMES.length ? list.filter((n) => NAMES.includes(n)) : list);
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
  const names = async (kind) => {
    const p = await fresh('?scene=essay');
    const n = await p.evaluate((k) => window.DriftReg.names[k], kind);
    await p.close();
    return n;
  };
  /* 找一块：lodWanted 档、离中心最近、足够不透明 */
  const findRec = (page, lods, kinds) => page.evaluate((lods, kinds) => {
    const d = window.__drift;
    const c = [...d.recs.values()].filter((r) => lods.includes(r.lod) && +r.el.style.opacity > 0.45 && (!kinds || kinds.includes(r.it.kind)) && r.x > 120 && r.x < innerWidth - 120 && r.y > 120 && r.y < innerHeight - 120)
      .sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2))[0];
    return c ? { x: c.x, y: c.y, key: c.key } : null;
  }, lods, kinds);
  const stats = async (page) => page.evaluate(() => {
    const d = window.__drift;
    return { frags: d.recs.size, decos: d.deco.count };
  });

  if (want('looks')) {
    for (const look of pick(await names('looks')))
      for (const scene of SCENES) {
        const p = await fresh(`?look=${look}&scene=${scene}`);
        await shot(p, `look-${look}-${scene}`);
        await p.close();
      }
  }

  if (want('hovers')) {
    for (const hv of pick(await names('hovers'))) {
      const p = await fresh(`?hover=${hv}`);
      const pt = await findRec(p, [2, 3]);
      if (!pt) { errors.push(`hover ${hv}: no target`); await p.close(); continue; }
      await p.mouse.move(pt.x - 60, pt.y - 30);
      await sleep(260);
      await shot(p, `hover-${hv}-a`);
      await p.mouse.move(pt.x + 30, pt.y - 10, { steps: 4 });
      await sleep(900);
      await shot(p, `hover-${hv}-b`);
      await p.close();
    }
  }

  if (want('opens')) {
    for (const mode of pick(await names('opens'))) {
      const p = await fresh(`?open=${mode}`);
      const pt = await findRec(p, [1, 2]);
      if (!pt) { errors.push(`open ${mode}: no target`); await p.close(); continue; }
      await p.mouse.move(pt.x, pt.y);
      await sleep(60);
      await p.mouse.click(pt.x, pt.y);
      let tPrev = 0;
      for (const t of [240, 560, 1000]) { await sleep(t - tPrev); tPrev = t; await shot(p, `open-${mode}-${t}`); }
      await sleep(1800);
      await shot(p, `open-${mode}-settled`);
      await p.keyboard.press('Escape');
      await sleep(300);
      await shot(p, `open-${mode}-close-300`);
      await sleep(1600);
      await shot(p, `open-${mode}-closed`);
      await p.close();
    }
  }

  if (want('decos')) {
    for (const dc of pick(await names('decos'))) {
      for (const scene of SCENES) {
        const p = await fresh(`?deco=${dc}&scene=${scene}`);
        await shot(p, `deco-${dc}-${scene}`);
        if (scene === SCENES[0]) {
          // 再拍一张拖动中的（看视差与迟滞）
          await p.mouse.move(1150, 600);
          await p.mouse.down();
          for (let i = 1; i <= 14; i++) { await p.mouse.move(1150 - i * 42, 600 - i * 12); await sleep(16); }
          await shot(p, `deco-${dc}-drag`);
          await p.mouse.up();
          const st = await stats(p);
          console.log(`deco ${dc} ${scene}`, JSON.stringify(st));
        }
        await p.close();
      }
    }
  }

  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
