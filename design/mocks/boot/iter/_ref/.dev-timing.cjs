const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:4670/?grain=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 30000 }).catch(e => console.log('timeout', e.message));
  console.log('ctl ready at', Date.now() - t0, JSON.stringify(await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), light: window.__wander?.lightReady }))));
  await p.waitForFunction('document.documentElement.classList.contains("grain-boot-done")', { timeout: 30000 }).catch(e => console.log('done timeout'));
  console.log('done at', Date.now() - t0);
  await b.close();
})();
