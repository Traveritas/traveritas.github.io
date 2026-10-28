const { start } = require('../../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'design/mocks/boot/iter/_ref/.accept-b');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/iter/2-grain/b-flow/`;
  const b = await chromium.launch({ channel: 'chrome' });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction('window.__boot && window.__boot.ready');
  await p.evaluate(() => window.__boot.pause());
  const info = [];
  for (const ms of [0, 80, 160, 240, 320, 560, 1000, 1560, 1990, 2000]) {
    await p.evaluate(m => window.__boot.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await new Promise(r => setTimeout(r, 100));
    await p.screenshot({ path: path.join(OUT, `b-${String(ms).padStart(4,'0')}.png`) });
    /* 采样四角 + 中心 + 网点层透明度 */
    const s = await p.evaluate(() => {
      const c = document.querySelector('.boot-face');
      const dot = document.querySelector('.boot-dot');
      let px = null;
      if (c) {
        const g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const at = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i+1], d[i+2]]; };
        px = { tl: at(1,1), tr: at(c.width-2,1), c: at(c.width>>1, c.height>>1), bl: at(1,c.height-2), br: at(c.width-2,c.height-2) };
      }
      return { px, dot: dot ? getComputedStyle(dot).opacity : null, brand: getComputedStyle(document.querySelector('.h-brand')).opacity, kicker: getComputedStyle(document.querySelector('.h-kicker')).opacity };
    });
    info.push([ms, s]);
  }
  console.log(JSON.stringify(info, null, 1));
  console.log('errors', [...new Set(errs)]);
  await b.close(); server.close();
})();

