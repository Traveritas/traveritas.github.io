const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto('http://localhost:4640/design/mocks/boot/iter/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'design/mocks/boot/iter/_ref/board/board-full.png', fullPage: true });
  const imgs = await p.evaluate(() => [...document.images].map(i => ({src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth})));
  console.log('errors', [...new Set(errs)]);
  console.log(JSON.stringify(imgs, null, 1));
  await b.close();
})();
