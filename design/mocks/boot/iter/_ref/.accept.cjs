/* Lead 验收：六候选的 ready / 报错 / seek 确定性 / 终帧 vs 静置 */
const fs = require('fs');
const path = require('path');
const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const OUT = path.join(__dirname, '.accept');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = [
  ['2-grain/a-step', 2000],
  ['2-grain/b-flow', 2000],
  ['2-grain/c-hybrid', 2000],
  ['5-night/a-afterimage', 2200],
  ['5-night/b-opening', 2260],
  ['5-night/c-pool', 2220],
];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const report = {};

  for (const [rel, total] of CASES) {
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
    await page.goto(base + rel + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 15000 }).catch(() => errors.push('ready timeout'));
    const api = await page.evaluate(() => ({
      total: window.__boot.total,
      hasSeek: typeof window.__boot.seek === 'function',
      hasPause: typeof window.__boot.pause === 'function',
    }));
    await page.evaluate(() => window.__boot.pause());
    /* seek 确定性：同一时刻两次截图应一致（容差交给像素比较） */
    for (const [name, ms] of [['mid-a', Math.round(total * 0.45)], ['mid-b', Math.round(total * 0.62)], ['end', total]]) {
      await page.evaluate((m) => window.__boot.seek(m), ms);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await sleep(120);
      await page.screenshot({ path: path.join(OUT, `${rel.replace(/\//g, '-')}-${name}.png`) });
    }
    await page.evaluate(() => window.__boot.seek(0));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, `${rel.replace(/\//g, '-')}-start.png`) });
    await page.close();

    /* 静置对照：?noboot=1 */
    const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await p2.goto(base + rel + '/?noboot=1', { waitUntil: 'networkidle' });
    await p2.evaluate(() => document.fonts.ready);
    await sleep(800);
    await p2.screenshot({ path: path.join(OUT, `${rel.replace(/\//g, '-')}-noboot.png`) });
    await p2.close();

    report[rel] = { total, api, errors: [...new Set(errors)] };
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();
