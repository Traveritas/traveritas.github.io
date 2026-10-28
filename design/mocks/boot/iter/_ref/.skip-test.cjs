const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text()));
  console.log('goto');
  await p.goto('http://127.0.0.1:4671/?grain=0', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('loaded');
  await p.waitForTimeout(2000);
  console.log('state', await p.evaluate(() => ({ rs: document.readyState, booted: document.documentElement.classList.contains('booted'), data: document.documentElement.hasAttribute('data-grain-boot'), w: !!window.__wander, ctl: !!window.__grainCtl })));
  console.log('shot');
  await p.screenshot({ path: 'design/mocks/boot/iter/_ref/.prod-modes/skip-test.png', timeout: 15000 }).catch(e => console.log('SHOTERR', e.message));
  console.log('done');
  await b.close();
})();
