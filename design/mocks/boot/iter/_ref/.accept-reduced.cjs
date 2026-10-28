const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/`;
  const b = await chromium.launch({ channel: 'chrome' });
  for (const c of ['2-grain/a-step','2-grain/b-flow','2-grain/c-hybrid']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(base + c + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 700));
    await p.screenshot({ path: path.join('design/mocks/boot/iter/_ref/.accept', c.replace('/','-') + '-reduced.png') });
    await p.close();
  }
  await b.close(); server.close();
  console.log('ok');
})();

