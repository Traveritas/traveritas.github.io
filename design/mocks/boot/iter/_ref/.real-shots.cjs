const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'design/mocks/boot/iter/_ref/real-boot');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto('http://127.0.0.1:4671/?grain=1&grain-pause=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 30000 });
  await p.evaluate(() => window.__grainCtl.pause());
  for (const ms of [0, 160, 400, 700, 900, 1200, 1600]) {
    await p.evaluate(m => window.__grainCtl.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(OUT, `boot-${String(ms).padStart(4,'0')}.png`), timeout: 30000 });
  }
  console.log('errors', errs);
  await b.close();
})();
