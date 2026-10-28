const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://127.0.0.1:4671/?grain=0', { waitUntil: 'load', timeout: 20000 });
  await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => ({ booted: document.documentElement.classList.contains('booted'), title: getComputedStyle(document.querySelector('.w-home-title')).opacity, rs: document.readyState })));
  await p.screenshot({ path: 'design/mocks/boot/iter/_ref/.prod-modes/skip-grain.png', timeout: 30000 }).then(()=>console.log('shot ok')).catch(e=>console.log('shot fail', e.message));
  await b.close();
})();
