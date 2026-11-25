/* 临时探针：在页面里跑一段 JS，把内部状态打出来（不属于交付物，随时删） */
const path = require('path');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const file = process.argv[2] || 'r-D.html?arrive=1';
const expr = process.argv[3] || '1';

(async () => {
  const server = await start(+(process.env.PORT || 4664));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const log = [];
  page.on('pageerror', (e) => log.push('[pageerror] ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'log') log.push(`[${m.type()}] ${m.text()}`);
  });
  await page.goto(`http://localhost:${port}/somewhere/${file}`, { waitUntil: 'load' });
  await page.waitForTimeout(4200);
  const out = await page.evaluate(expr).catch((e) => 'EVAL ERR ' + e.message);
  console.log(JSON.stringify({ out, log }, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
})().catch((e) => {
  console.error('PROBE FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
