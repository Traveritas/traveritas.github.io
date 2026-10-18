/* 浮游碎片 · 方案截图（第四轮）
   node design/mocks/drift/.shot-scheme.cjs                 → design/mocks/drift/.shots/scheme/
   ONLY=schemes   NAMES=thaw,develop   SCENES=essay,project,moment

   一个方案拍一套：空间 → 聚焦（第一次点）→ 展开（第二次点）→ 收回 → 退出聚焦。
   名单问页面（DriftReg.names.schemes）。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots', 'scheme');
fs.mkdirSync(OUT, { recursive: true });
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean);
const SCENES = (process.env.SCENES || 'essay,project,moment').split(',').filter(Boolean);
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
  /* 挑一块：在屏内、够不透明；优先取中等距离的（看得出聚焦前后的差别） */
  const findRec = (page) => page.evaluate(() => {
    const d = window.__drift;
    const c = [...d.recs.values()].filter((r) => +r.el.style.opacity > 0.5 && r.x > 200 && r.x < innerWidth - 200 && r.y > 180 && r.y < innerHeight - 180)
      .sort((a, b) => (a.lod === 1 || a.lod === 2 ? 0 : 1) - (b.lod === 1 || b.lod === 2 ? 0 : 1) || Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2))[0];
    return c ? { x: Math.round(c.x), y: Math.round(c.y), lod: c.lod, key: c.key } : null;
  });
  const waitFocus = (page, ms = 4000) => page.waitForFunction('window.__drift.focusOn > 0.9 && !window.__drift.fx', { timeout: ms }).catch(() => {});
  const waitIdle = (page, ms = 5000) => page.waitForFunction('!window.__drift.fx', { timeout: ms }).catch(() => {});

  const names = NAMES.length ? NAMES : await (async () => {
    const p = await fresh('?scene=essay');
    const n = await p.evaluate(() => window.DriftReg.names.schemes);
    await p.close();
    return n;
  })();

  for (const sc of names) {
    // 三种光下的样子
    for (const scene of SCENES) {
      const p = await fresh(`?scheme=${sc}&scene=${scene}`);
      await shot(p, `scheme-${sc}-${scene}`);
      await p.close();
    }
    // 聚焦 → 展开 → 收回 → 退出
    const p = await fresh(`?scheme=${sc}&scene=${SCENES[0]}`);
    const pt = await findRec(p);
    if (!pt) { errors.push(`${sc}: no target`); await p.close(); continue; }
    await p.mouse.move(pt.x, pt.y);
    await sleep(80);
    await p.mouse.click(pt.x, pt.y);
    await waitFocus(p);
    await sleep(900);
    await shot(p, `scheme-${sc}-focus`);
    const st = await p.evaluate(() => ({ focus: !!window.__drift.focus, on: +window.__drift.focusOn.toFixed(2) }));
    console.log(`scheme ${sc}`, JSON.stringify(st), 'target lod', pt.lod);
    await p.mouse.click(720, 450);
    let tPrev = 0;
    for (const t of [240, 560, 1000]) { await sleep(t - tPrev); tPrev = t; await shot(p, `scheme-${sc}-open-${t}`); }
    await waitIdle(p);
    await sleep(1600);
    await shot(p, `scheme-${sc}-settled`);
    await p.keyboard.press('Escape');
    await sleep(320);
    await shot(p, `scheme-${sc}-close-300`);
    await sleep(1600);
    await shot(p, `scheme-${sc}-closed`);
    await p.keyboard.press('Escape');
    await sleep(500);
    await shot(p, `scheme-${sc}-unfocus`);
    await p.close();
  }

  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
  await browser.close();
  server.close();
})();
