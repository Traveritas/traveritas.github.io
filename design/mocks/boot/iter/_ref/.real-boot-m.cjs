const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.real-boot-m');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('http://127.0.0.1:4670/?grain=1&grain-pause=1', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
  await p.evaluate(() => { document.querySelector('astro-dev-toolbar')?.remove(); window.__grainCtl.pause(); });
  for (const ms of [0, 300, 900, 1600]) {
    await p.evaluate(m => window.__grainCtl.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, `m-${String(ms).padStart(4,'0')}.png`) });
  }
  console.log(JSON.stringify(await p.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    data: document.documentElement.hasAttribute('data-grain-boot'),
    booted: document.documentElement.classList.contains('booted'),
  }))));
  console.log('errors', [...new Set(errs)]);
  await b.close();
})();
