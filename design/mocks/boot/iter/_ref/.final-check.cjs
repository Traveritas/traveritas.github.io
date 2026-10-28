const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 30000 });
  console.log('ctl ready', Date.now() - t0);
  await p.waitForFunction('document.documentElement.classList.contains("grain-boot-done")', { timeout: 30000 });
  console.log('done', Date.now() - t0);
  console.log('final', JSON.stringify(await p.evaluate(() => ({ booted: document.documentElement.classList.contains('booted'), data: document.documentElement.hasAttribute('data-grain-boot'), title: getComputedStyle(document.querySelector('.w-home-title')).opacity, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, ts: getComputedStyle(document.getElementById('ts')).opacity, seen: sessionStorage.getItem('xm-boot-seen') }))), 'errors', errs);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  console.log('reload', JSON.stringify(await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), ctl: !!window.__grainCtl, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity }))));
  await ctx.close(); await b.close();
})();
