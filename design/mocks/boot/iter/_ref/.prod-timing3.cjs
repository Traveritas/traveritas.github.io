const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  let last = '';
  for (let i = 0; i < 80; i++) {
    const s = await p.evaluate(() => {
      const h = document.documentElement;
      return { data: h.hasAttribute('data-grain-boot'), booted: h.classList.contains('booted'), ctl: !!window.__grainCtl, done: h.classList.contains('grain-boot-done') };
    }).catch(() => null);
    const key = JSON.stringify(s);
    if (key !== last) { console.log(Date.now() - t0, key); last = key; }
    if (s && s.done) break;
    await p.waitForTimeout(120);
  }
  console.log('errors', errs);
  await b.close();
})();
