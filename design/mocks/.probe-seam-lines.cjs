/* 四条梦态线的横切放大：确认「两条有颜色 / 两条灰」各是哪条
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-lines.cjs */
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

  const snap = async (name, face, clip) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 6 });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + '/articles/?fld=off', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('snap', name);
  };

  // x 940..1260 处缝线 y≈505..585；四条线沿法向分布在其上下 ±45px
  await snap('L6-dream-lines', 'dream', { x: 940, y: 455, width: 320, height: 130 });
  console.log('done');
  await browser.close();
})();