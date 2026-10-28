const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto('http://localhost:4640/design/mocks/boot/iter/5-night/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'design/mocks/boot/iter/_ref/board/five-compare-top.png' });
  console.log('errors', [...new Set(errs)]);
  const imgs = await p.evaluate(() => [...document.images].map(i => [i.getAttribute('src'), i.complete, i.naturalWidth]));
  console.log(JSON.stringify(imgs));
  await b.close();
})();
