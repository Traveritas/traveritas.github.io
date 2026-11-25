/* 索引页冒烟测试（puppeteer/playwright 各版都行，这里用本机那份 playwright-core）
   node design/mocks/somewhere/toys/.shot.cjs
   出 .shots/toys-1.png（全部）· toys-filter.png（筛过）· toys-sel.png（选了几条）
   顺便把控制台错误打成非 0 退出——交付前必须跑一次。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('../server.cjs');

const OUT = path.join(__dirname, '.shots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(+(process.env.PORT || 5070));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') log.push(`[console] ${m.text()}`);
  });

  await page.goto(`http://localhost:${port}/somewhere/toys/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(500);

  const nAll = await page.$eval('#nAll', (e) => e.textContent);
  const nShown = await page.$eval('#nShown', (e) => e.textContent);
  console.log(`条目 ${nAll} · 显示 ${nShown}`);
  await page.screenshot({ path: path.join(OUT, 'toys-1.png'), fullPage: false });

  // 筛一个触发 + 选三条
  const chips = await page.$$('#fTrigger .chip');
  if (chips.length > 1) {
    await chips[1].click();
    await page.waitForTimeout(200);
    const n2 = await page.$eval('#nShown', (e) => e.textContent);
    console.log(`按触发筛后 ${n2}`);
    await page.screenshot({ path: path.join(OUT, 'toys-filter.png') });
    await page.click('#reset');
    await page.waitForTimeout(200);
  }

  const cards = await page.$$('.card');
  for (let i = 0; i < Math.min(3, cards.length); i++) await cards[i].click();
  await page.waitForTimeout(200);
  const nSel = await page.$eval('#nSel2', (e) => e.textContent);
  console.log(`已选 ${nSel}`);
  await page.screenshot({ path: path.join(OUT, 'toys-sel.png') });

  // 导出内容检查（不落盘）
  const md = await page.evaluate(() => asMarkdown());
  console.log(`导出 ${md.split('\n').length} 行`);

  await browser.close();
  await new Promise((r) => server.close(r));

  if (log.length) {
    console.error(`\n✗ 控制台 ${log.length} 条：`);
    log.slice(0, 10).forEach((l) => console.error('  ' + l));
    process.exit(1);
  }
  console.log('✓ 控制台干净');
})().catch((e) => {
  console.error('SMOKE FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
