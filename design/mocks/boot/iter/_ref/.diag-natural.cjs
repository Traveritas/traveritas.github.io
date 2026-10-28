const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => console.log('CONSOLE', m.type(), m.text()));
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  for (const t of [1000, 2500, 5000]) {
    await p.waitForTimeout(t === 1000 ? 1000 : 1500 + (t === 5000 ? 1000 : 0));
    console.log(t, JSON.stringify(await p.evaluate(() => ({
      grain: window.__grainBoot,
      data: document.documentElement.hasAttribute('data-grain-boot'),
      wander: !!window.__wander,
      lightReady: window.__wander ? window.__wander.lightReady : null,
      ctl: !!window.__grainCtl,
      booted: document.documentElement.classList.contains('booted'),
      seen: sessionStorage.getItem('xm-boot-seen'),
      title: getComputedStyle(document.querySelector('.w-home-title')).opacity,
    }))));
  }
  await ctx.close(); await b.close();
})();
