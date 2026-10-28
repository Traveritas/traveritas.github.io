/* Lead 审阅用：2-grain 三候选同刻截图（不是交付件）
   node design/mocks/boot/iter/_ref/grain-review.cjs */
const path = require('path');
const fs = require('fs');
const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(__dirname, '.grain-review');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = ['a-step', 'b-flow', 'c-hybrid'];
const T = [0, 300, 550, 800, 1100, 1400, 1750, 1990];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/2-grain/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  for (const v of V) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${v}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${v}: ${m.text()}`));
    await page.goto(base + v + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 }).catch(() => errors.push(`${v}: ready timeout`));
    await page.evaluate(() => window.__boot.pause());
    for (const ms of T) {
      await page.evaluate((m) => window.__boot.seek(m), ms);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(90);
      await page.screenshot({ path: path.join(OUT, `${v}-${String(ms).padStart(4, '0')}.png`) });
    }
    const st = await page.evaluate(() => window.__boot.stats && window.__boot.stats());
    console.log(v, JSON.stringify(st));
    await page.close();
  }
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  for (const v of V) {
    await m.goto(base + v + '/', { waitUntil: 'networkidle' });
    await m.evaluate(() => document.fonts.ready);
    await m.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 }).catch(() => {});
    await m.evaluate(() => window.__boot.pause());
    for (const ms of [0, 800, 1400, 1990]) {
      await m.evaluate((x) => window.__boot.seek(x), ms);
      await m.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(90);
      await m.screenshot({ path: path.join(OUT, `m-${v}-${String(ms).padStart(4, '0')}.png`) });
    }
  }
  await browser.close();
  server.close();
  if (errors.length) console.log('--- 报错 ---\n' + [...new Set(errors)].join('\n'));
  console.log('done', OUT);
})();
