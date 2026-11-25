/* 随机十条 + 导出 的快速验证（.shot.cjs 查的是常驻流程，这里查新加的那个按钮）
   node design/mocks/somewhere/toys/.shot-random.cjs */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('../server.cjs');

const OUT = path.join(__dirname, '.shots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(+(process.env.PORT || 5080));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && log.push(`[console] ${m.text()}`));

  await page.goto(`http://localhost:${port}/somewhere/toys/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);

  // 随机：连续三次，每次应该换一批、且每次都是 10 条
  const batches = [];
  for (let i = 0; i < 3; i++) {
    await page.click('#shuffle');
    await page.waitForTimeout(150);
    const ids = await page.$$eval('.card .id', (els) => els.map((e) => e.textContent));
    batches.push(ids);
  }
  console.log('三批随机：', batches.map((b) => b.length).join(' / '));
  const dup = batches[1].filter((x) => batches[0].includes(x));
  console.log('第一批与第二批重叠：', dup.length, dup.join(','));

  // 筛一下，随机应该只在筛出的范围里
  const chips = await page.$$('#fScene .chip');
  await chips[1].click();
  await page.waitForTimeout(200);
  await page.click('#shuffle');
  await page.waitForTimeout(150);
  const sceneIds = await page.$$eval('.card .id', (els) => els.map((e) => e.textContent));
  console.log('筛选后随机：', sceneIds.length, '条，前缀', [...new Set(sceneIds.map((s) => s[0]))].join(''));
  await page.screenshot({ path: path.join(OUT, 'toys-random.png') });

  await browser.close();
  await new Promise((r) => server.close(r));
  if (log.length) {
    console.error('✗ 控制台：', log.slice(0, 5).join(' | '));
    process.exit(1);
  }
  console.log('✓ 控制台干净');
})().catch((e) => {
  console.error('FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
