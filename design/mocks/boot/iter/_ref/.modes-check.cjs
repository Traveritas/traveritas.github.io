const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const URL = 'http://127.0.0.1:4671/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  // reduced
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', e => console.log('reduced ERR', e.message));
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(URL, { waitUntil: 'load', timeout: 20000 });
    await p.waitForTimeout(1000);
    console.log('reduced', JSON.stringify(await p.evaluate(() => ({
      data: document.documentElement.hasAttribute('data-grain-boot'),
      booted: document.documentElement.classList.contains('booted'),
      grain: !!window.__grainBoot,
      title: getComputedStyle(document.querySelector('.w-home-title')).opacity,
      brand: document.querySelector('.w-home-brand')?.textContent,
      reality: document.body.dataset.reality,
      light: getComputedStyle(document.getElementById('w-light')).opacity,
      rs: document.readyState,
    }))));
    await p.close();
  }
  // no-js
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load', timeout: 20000 });
    await p.waitForTimeout(600);
    const html = await p.content();
    console.log('nojs: title in html?', html.includes('Traveritas'), 'bootveil?', html.includes('bootveil'), 'len', html.length);
    await ctx.close();
  }
  await b.close();
})();
