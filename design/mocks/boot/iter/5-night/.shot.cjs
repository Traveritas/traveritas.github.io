/* 开屏 mock 5 · 迭代版 · 三候选截图
   node design/mocks/boot/iter/5-night/.shot.cjs
   → .shots/<候选>/<帧>.png（桌面 8 + 手机 4 + 减动效 1）+ .shots/_baseline-home.png（?noboot=1 对照）

   开屏的时间轴全在页面的 JS 里（Web Animations），window.__boot.seek(ms) 是确定的重画。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  {
    dir: 'a-afterimage',
    total: 2200,
    desk: [
      ['00-night', 0],
      ['01-flash', 320],
      ['02-rings', 900],
      ['03-afterimage', 1250],
      ['04-ridge', 1500],
      ['05-drawn', 1750],
      ['06-lift', 1990],
      ['06b-handoff', 2035],
      ['07-end', 2200],
    ],
    mob: [
      ['m-00-night', 0],
      ['m-01-rings', 900],
      ['m-02-ridge', 1600],
      ['m-03-end', 2200],
    ],
  },
  {
    dir: 'b-opening',
    total: 2260,
    desk: [
      ['00-night', 0],
      ['01-cut', 450],
      ['02-open', 750],
      ['03-breath', 1050],
      ['04-wide', 1250],
      ['05-recede', 1600],
      ['06-heal', 1950],
      ['06b-handoff', 2055],
      ['07-end', 2260],
    ],
    mob: [
      ['m-00-night', 0],
      ['m-01-open', 750],
      ['m-02-recede', 1250],
      ['m-03-end', 2260],
    ],
  },
  {
    dir: 'c-pool',
    total: 2220,
    desk: [
      ['00-night', 0],
      ['01-fall', 380],
      ['02-fall2', 780],
      ['03-impact', 1000],
      ['04-ripple', 1350],
      ['05-pools', 1650],
      ['06-rise', 1950],
      ['06b-handoff', 2050],
      ['07-end', 2220],
    ],
    mob: [
      ['m-00-night', 0],
      ['m-01-impact', 900],
      ['m-02-pools', 1500],
      ['m-03-end', 2220],
    ],
  },
];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (dir, vp, opts = {}) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, ...opts });
    page.on('pageerror', (e) => errors.push(`${dir}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${dir}: ${m.text()}`));
    await page.goto(base + dir + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, dir, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(110);
    const outDir = path.join(OUT, dir);
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  };

  for (const c of CANDIDATES) {
    const d = await fresh(c.dir, { width: 1440, height: 900 });
    for (const [name, ms] of c.desk) await at(d, c.dir, ms, name);
    await d.close();

    const m = await fresh(c.dir, { width: 390, height: 844 });
    for (const [name, ms] of c.mob) await at(m, c.dir, ms, name);
    await m.close();

    /* 减少动态效果：直接落首页，连一帧夜都不该有 */
    const r = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await r.goto(base + c.dir + '/', { waitUntil: 'networkidle' });
    await r.evaluate(() => document.fonts.ready);
    await sleep(400);
    const state = await r.evaluate(() => ({
      boot: getComputedStyle(document.getElementById('boot')).display,
      skip: document.documentElement.hasAttribute('data-boot-skip'),
      ready: window.__boot && window.__boot.ready,
    }));
    await r.screenshot({ path: path.join(OUT, c.dir, 'r-reduced.png') });
    await r.close();
    console.log(`${c.dir} · reduced: #boot display=${state.boot} skip=${state.skip} ready=${state.ready}`);
  }

  /* 无 JS：开屏层永远不出现（拿 A 验一次就够） */
  const nj = await browser.newPage({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  await nj.goto(base + 'a-afterimage/', { waitUntil: 'networkidle' });
  await sleep(300);
  await nj.screenshot({ path: path.join(OUT, 'a-afterimage', 'r-nojs.png') });
  await nj.close();

  /* 对照：同一假首页静置（?noboot=1） */
  const b = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await b.goto(base + 'a-afterimage/?noboot=1', { waitUntil: 'networkidle' });
  await b.evaluate(() => document.fonts.ready);
  await sleep(400);
  await b.screenshot({ path: path.join(OUT, '_baseline-home.png') });
  await b.close();

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  const n = fs.readdirSync(OUT, { recursive: true }).filter((f) => String(f).endsWith('.png')).length;
  console.log(`shot done → ${path.relative(process.cwd(), OUT)} · ${n} 张 png`);
})();

