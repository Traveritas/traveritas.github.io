/* 开屏 mock 截图模板（复制进自己目录，改名 .shot.cjs 再改 TODO）
   node design/mocks/boot/<方向>/.shot.cjs  → design/mocks/boot/<方向>/.shots/

   关键：开屏是时间驱动的，截图必须确定 —— 走页面自己暴露的 window.__boot：
     __boot.pause()      停住时钟
     __boot.seek(ms)     把开屏推到第 ms 毫秒（含 CSS 动画与 canvas 画面）
     __boot.resume()     继续
   每 seek 之后等两帧再截图。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname); // TODO 目录名（如 1-line）
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 每个方向自己填：帧名 → 毫秒 */
const FRAMES = [
  ['00-start', 0],
  ['01', 300],
  ['02', 700],
  ['03', 1100],
  ['04', 1500],
  ['05-end', 2000],
];

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (qs = '', vp = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${qs}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs}: ${m.text()}`));
    await page.goto(URL + qs, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  /* TODO 桌面：逐帧 */
  const d = await fresh();
  for (const [name, ms] of FRAMES) await at(d, ms, name);
  await d.close();

  /* TODO 手机：中段 + 终帧 */
  const m = await fresh('', { width: 390, height: 844 });
  await at(m, FRAMES[Math.floor(FRAMES.length / 2)][1], 'm-mid');
  await at(m, FRAMES[FRAMES.length - 1][1], 'm-end');
  await m.close();

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  }
  console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
})();