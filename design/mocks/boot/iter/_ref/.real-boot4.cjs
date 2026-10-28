const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.real-boot4');
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
  await p.evaluate(() => { document.querySelector('astro-dev-toolbar')?.remove(); window.__grainCtl.pause(); });
  await p.screenshot({ path: path.join(OUT, 'r-0000.png') });
  await p.evaluate(() => window.__grainCtl.resume());
  for (const ms of [300, 600, 900, 1200, 1500, 1700, 2200, 3200]) {
    await p.waitForTimeout(ms - (ms === 300 ? 0 : ([300,600,900,1200,1500,1700,2200,3200][[300,600,900,1200,1500,1700,2200,3200].indexOf(ms)-1])));
    await p.screenshot({ path: path.join(OUT, `r-${String(ms).padStart(4,'0')}.png`) });
  }
  const final = await p.evaluate(() => ({
    data: document.documentElement.hasAttribute('data-grain-boot'),
    booted: document.documentElement.classList.contains('booted'),
    done: document.documentElement.classList.contains('grain-boot-done'),
    brand: document.querySelector('.w-home-brand')?.textContent,
    eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity,
    ts: getComputedStyle(document.getElementById('ts')).opacity,
    cursor: getComputedStyle(document.getElementById('cursor-slot')).opacity,
    title: getComputedStyle(document.querySelector('.w-home-title')).opacity,
    kicker: getComputedStyle(document.querySelector('.w-home-kicker')).opacity,
    heads: getComputedStyle(document.getElementById('w-heads')).opacity,
    light: getComputedStyle(document.getElementById('w-light')).opacity,
    ctl: !!window.__grainCtl,
  }));
  console.log('final', JSON.stringify(final));
  console.log('errors', [...new Set(errs)]);
  await b.close();
})();
