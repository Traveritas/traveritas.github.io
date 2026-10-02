/* 原型 quiet 首屏截图：node design/mocks/.shot-hero-quiet.cjs [base]
   base 默认 http://localhost:4321（astro dev）。输出 design/mocks/_shots-hero/quiet-*.png */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-hero');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  });
  for (const v of ['1', '2']) {
    for (const reality of ['dream', 'wake']) {
      for (const [tag, w, h, mobile] of VIEWS) {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
        await page.evaluateOnNewDocument((r) => {
          try {
            sessionStorage.setItem('xm-reality', r);
            localStorage.setItem('xm-reality-guided-v2', '1');
          } catch {}
        }, reality);
        page.on('pageerror', (e) => console.log('pageerror', e.message));
        await page.goto(`${BASE}/mock/hero-quiet/?v=${v}`, { waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 6000));
        const file = path.join(OUT, `quiet-v${v}-${reality}-${tag}.png`);
        await page.screenshot({ path: file });
        console.log(file);
        await page.close();
      }
    }
  }
  await browser.close();
})();
