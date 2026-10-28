const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.prod-boot2');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  let last = '';
  for (let i = 0; i < 100; i++) {
    const s = await p.evaluate(() => {
      const h = document.documentElement;
      return { data: h.hasAttribute('data-grain-boot'), booted: h.classList.contains('booted'), ctl: !!window.__grainCtl, done: h.classList.contains('grain-boot-done'), t: window.__grainCtl ? window.__grainCtl.ready : null };
    }).catch(() => null);
    const key = JSON.stringify(s);
    if (key !== last) { console.log(Date.now() - t0, key); last = key; }
    if (s && s.done) break;
    await p.waitForTimeout(150);
  }
  await p.screenshot({ path: path.join(OUT, 'natural-final.png'), timeout: 30000 }).catch(e => console.log('shot fail', e.message));
  console.log('final', JSON.stringify(await p.evaluate(() => ({ title: getComputedStyle(document.querySelector('.w-home-title')).opacity, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, ts: getComputedStyle(document.getElementById('ts')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity, seen: sessionStorage.getItem('xm-boot-seen') }))), 'errors', errs);
  await b.close();
})();
