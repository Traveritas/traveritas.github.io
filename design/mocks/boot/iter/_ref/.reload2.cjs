const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  console.log('first', JSON.stringify(await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), done: document.documentElement.classList.contains('grain-boot-done'), seen: sessionStorage.getItem('xm-boot-seen'), title: getComputedStyle(document.querySelector('.w-home-title')).opacity, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, ts: getComputedStyle(document.getElementById('ts')).opacity }))));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  console.log('reload', JSON.stringify(await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), ctl: !!window.__grainCtl, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity }))));
  await ctx.close(); await b.close();
})();
