const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.accept-b2');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/2-grain/b-flow/`;
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const get = async (url, rm, ms) => {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => m.type()==='error' && errs.push(m.text()));
    if (rm) await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    if (!rm) {
      await p.waitForFunction('window.__boot && window.__boot.ready');
      await p.evaluate(() => window.__boot.pause());
      await p.evaluate(m => window.__boot.seek(m), ms);
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    await new Promise(r => setTimeout(r, 600));
    await p.screenshot({ path: path.join(OUT, (rm ? 'reduced' : 'end') + '.png') });
    const info = await p.evaluate(() => ({ dot: document.querySelector('.boot-dot') ? getComputedStyle(document.querySelector('.boot-dot')).opacity : null, cv: document.querySelector('.boot-face') ? getComputedStyle(document.querySelector('.boot-face')).opacity : null }));
    await p.close();
    return info;
  };
  console.log('end', await get(base, false, 2000));
  console.log('reduced', await get(base, true));
  // print 首帧
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + '?print=1', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction('window.__boot && window.__boot.ready');
  await p.evaluate(() => { window.__boot.pause(); window.__boot.seek(0); });
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(OUT, 'print-0.png') });
  await p.close();
  console.log('errors', [...new Set(errs)]);
  await b.close(); server.close();
})();

