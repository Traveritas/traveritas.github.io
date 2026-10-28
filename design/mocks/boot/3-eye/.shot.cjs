/* 开屏 mock 3 · 合上又睁开 —— 截图
   node design/mocks/boot/3-eye/.shot.cjs → design/mocks/boot/3-eye/.shots/

   全程走页面暴露的 window.__boot（时间轴写在 JS 里，seek 是确定的重画）。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOTAL_MS = 2240;
/* 帧名 → 毫秒：安静 / 闭的中段 / 收成一条缝 / 停 / 睁三档 / 落地 */
const FRAMES = [
  ['00-quiet', 180], // 暖白的一片安静，圆面与两道弧在里面
  ['01-gather', 620], // 闭：材质朝中心收，四周压上一层很浅的冷
  ['02-seam', 900], // 收成一条 14° 的缝，缝里是夜
  ['03-hold', 1040], // 停一拍：缝里那点微光
  ['04-open-early', 1240], // 睁的起步：孔沿法向一点点
  ['05-open-mid', 1460], // 睁的中段：夜从缝里铺开，首页在露
  ['06-open-late', 1700], // 睁的后段：幕退到边上、已经变冷
  ['07-end', TOTAL_MS], // 落地：假首页静置的样子
];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (vp, dsf = 1) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dsf });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(100);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  /* 桌面逐帧 */
  const d = await fresh({ width: 1440, height: 900 });
  for (const [name, ms] of FRAMES) await at(d, ms, name);
  await d.close();

  /* 手机：安静 / 缝 / 睁的中段 / 落地 */
  const m = await fresh({ width: 390, height: 844 }, 2);
  await at(m, 180, 'm-00-quiet');
  await at(m, 1040, 'm-01-seam');
  await at(m, 1560, 'm-02-open');
  await at(m, TOTAL_MS, 'm-03-end');
  await m.close();

  /* 减动效：直接落首页，不该留死幕 */
  const rc = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const r = await rc.newPage();
  r.on('pageerror', (e) => errors.push(`reduced: ${e.message}`));
  await r.goto(base, { waitUntil: 'networkidle' });
  await r.evaluate(() => document.fonts.ready);
  await sleep(400);
  await r.screenshot({ path: path.join(OUT, 'r-reduced-motion.png') });
  await rc.close();

  /* 无 JS：不该留一块死幕 */
  const nc = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const n = await nc.newPage();
  await n.goto(base, { waitUntil: 'networkidle' });
  await sleep(400);
  await n.screenshot({ path: path.join(OUT, 'r-nojs.png') });
  await nc.close();

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
})();