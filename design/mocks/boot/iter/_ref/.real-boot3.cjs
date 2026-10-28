const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.real-boot3');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('http://127.0.0.1:4670/?grain=1&grain-pause=1', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
  await p.evaluate(() => window.__grainCtl.pause());
  const frames = [0, 120, 160, 240, 400, 700, 1000, 1300, 1500, 1600];
  for (const ms of frames) {
    await p.evaluate(m => window.__grainCtl.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(OUT, `g-${String(ms).padStart(4,'0')}.png`) });
    if ([0,160,400,700,1300,1600].includes(ms)) {
      const s = await p.evaluate(() => {
        const c = document.getElementById('w-light');
        const g = c.getContext('webgl2');
        const out = [];
        for (const [x,y] of [[20,20],[c.width-20,20],[c.width>>1,c.height>>1],[20,c.height-20],[c.width-20,c.height-20]]) {
          const b1 = new Uint8Array(4); g.readPixels(x, y, 1, 1, g.RGBA, g.UNSIGNED_BYTE, b1); out.push(Array.from(b1.slice(0,3)));
        }
        return { samples: out, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, brand: getComputedStyle(document.querySelector('.w-home-brand-box')).opacity, cursor: getComputedStyle(document.getElementById('cursor-slot')).opacity, data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted') };
      });
      console.log(ms, JSON.stringify(s));
    }
  }
  console.log('errors', [...new Set(errs)]);
  await b.close();
})();
