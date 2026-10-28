const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:4670/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => {
    document.getElementById('bootveil')?.remove();
    document.documentElement.classList.add('booted','w-ready');
  });
  for (const t of [0, 1500, 3000, 6000]) {
    if (t) await p.waitForTimeout(t === 1500 ? 1500 : t === 3000 ? 1500 : 3000);
    const info = await p.evaluate(() => {
      const b = document.querySelector('.w-home-brand');
      const k = document.querySelector('.w-home-kicker span');
      const cs = getComputedStyle(document.documentElement);
      return {
        brand: b?.textContent, brandCls: b?.className,
        kicker: k?.textContent,
        face: document.documentElement.dataset.face,
        wscene: document.documentElement.dataset.wscene,
        wview: document.documentElement.dataset.wview,
        dark: document.documentElement.dataset.dark,
        t: document.documentElement.dataset.t,
        htmlCls: document.documentElement.className,
      };
    });
    console.log(JSON.stringify(info));
  }
  await p.screenshot({ path: 'design/mocks/boot/iter/_ref/real-home/.shots/home-desktop-settled.png' });
  await b.close();
})();
