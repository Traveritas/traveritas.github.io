/* 全屏两态对照 + 各层几何读数
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-geom.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-probe-seam');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();

  const open = async (url, face) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
  };

  for (const face of ['dream', 'wake']) {
    await open('/articles/?fld=off', face);
    const g = await page.evaluate(() => {
      const out = {};
      const seam = document.querySelector('.seam');
      out.seam = seam ? { rect: seam.getBoundingClientRect().toJSON(), t: getComputedStyle(seam).transform, op: getComputedStyle(seam).opacity } : null;
      const main = document.querySelector('.eeg-main');
      if (main) {
        const b = main.getBBox();
        out.mainBBox = { x: b.x, y: b.y, w: b.width, h: b.height };
        out.mainLen = (main.getAttribute('d') || '').length;
        out.mainD = (main.getAttribute('d') || '').slice(0, 200);
      }
      const gEl = document.querySelector('.eeg svg g');
      out.gTransform = gEl ? gEl.getAttribute('transform') : null;
      // 页面上 y≈466 那条横线是谁
      out.hlines = [...document.querySelectorAll('body *')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, cls: el.className && el.className.toString().slice(0, 40), y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) };
        })
        .filter((r) => r.h <= 3 && r.w > 800 && r.y > 400 && r.y < 560)
        .slice(0, 8);
      out.booted = document.documentElement.classList.contains('booted');
      out.draw = getComputedStyle(document.querySelector('.seam')).getPropertyValue('--draw');
      return out;
    });
    fs.writeFileSync(path.join(OUT, 'geom-' + face + '.json'), JSON.stringify(g, null, 2));
    console.log('=== ' + face + ' ===');
    console.log('booted', g.booted, 'draw', g.draw, 'seam.op', g.seam.op, 'seam.t', g.seam.t);
    console.log('mainBBox', JSON.stringify(g.mainBBox), 'dlen', g.mainLen);
    console.log('hlines', JSON.stringify(g.hlines));
    await page.screenshot({ path: path.join(OUT, 'full-' + face + '.png') });
  }
  await browser.close();
})();
