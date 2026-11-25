/* 索引页分区截图（给挑选用：每个方向一张，看排布与内容）
   node design/mocks/somewhere/toys/.shot-sections.cjs */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('../server.cjs');

const OUT = path.join(__dirname, '.shots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(+(process.env.PORT || 5090));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && log.push(`[console] ${m.text()}`));

  await page.goto(`http://localhost:${port}/somewhere/toys/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(500);

  /* 每个方向筛一次、拍一张；F–J 各 25 条正好一屏 */
  const letters = ['F', 'G', 'H', 'I', 'J'];
  const chips = await page.$$('#fScene .chip');
  const map = await Promise.all(chips.map((c) => c.textContent()));
  for (const L of letters) {
    const i = map.findIndex((t) => t.trim().startsWith(L + ' ·'));
    if (i < 0) {
      console.log(`${L}: 没有这个筛选`);
      continue;
    }
    await (await page.$$('#fScene .chip'))[i].click();
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
    const n = await page.$eval('#nShown', (e) => e.textContent);
    await page.screenshot({ path: path.join(OUT, `sec-${L}.png`) });
    console.log(`${L}: ${n} 条 → sec-${L}.png`);
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  if (log.length) {
    console.error('✗', log.slice(0, 5).join(' | '));
    process.exit(1);
  }
  console.log('✓ 控制台干净');
})().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
