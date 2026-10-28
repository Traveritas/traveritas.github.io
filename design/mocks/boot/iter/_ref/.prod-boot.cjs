const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.prod-boot');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  // 1) deterministic
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  t0 = Date.now();
  await p.goto('http://127.0.0.1:4671/?grain=1&grain-pause=1', { waitUntil: 'networkidle' });
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
  await p.evaluate(() => window.__grainCtl.pause());
  for (const ms of [0, 160, 400, 900, 1300, 1600]) {
    await p.evaluate(m => window.__grainCtl.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(OUT, `p-${String(ms).padStart(4,'0')}.png`) });
  }
  const attrs = await p.evaluate(() => ({
    toolbar: !!document.querySelector('astro-dev-toolbar'),
    data: document.documentElement.hasAttribute('data-grain-boot'),
    booted: document.documentElement.classList.contains('booted'),
    done: document.documentElement.classList.contains('grain-boot-done'),
  }));
  console.log('attrs', JSON.stringify(attrs), 'errors', [...new Set(errs)]);
  await p.close();

  // 2) natural playback timing + final
  const q = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const qerrs = [];
  q.on('pageerror', e => qerrs.push(e.message));
  q.on('console', m => m.type() === 'error' && qerrs.push(m.text()));
  const nav = Date.now();
  await q.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  const marks = [];
  let last = '';
  for (let i = 0; i < 80; i++) {
    const s = await q.evaluate(() => {
      const h = document.documentElement;
      return {
        booted: h.classList.contains('booted'),
        data: h.hasAttribute('data-grain-boot'),
        ctl: !!window.__grainCtl,
        done: h.classList.contains('grain-boot-done'),
      };
    }).catch(() => null);
    const key = s ? JSON.stringify(s) : 'err';
    if (key !== last) { marks.push([Date.now() - nav, s]); last = key; }
    if (s && s.done) break;
    await q.waitForTimeout(100);
  }
  console.log('marks', JSON.stringify(marks));
  await q.waitForTimeout(1500);
  await q.screenshot({ path: path.join(OUT, 'prod-final.png') });
  console.log('final', JSON.stringify(await q.evaluate(() => ({
    brand: document.querySelector('.w-home-brand')?.textContent,
    eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity,
    ts: getComputedStyle(document.getElementById('ts')).opacity,
    title: getComputedStyle(document.querySelector('.w-home-title')).opacity,
  }))), 'errors', [...new Set(qerrs)]);
  await b.close();
})();
