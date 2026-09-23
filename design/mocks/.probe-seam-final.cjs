/* 终局对照：缝线斜穿区 x600..1200 / y400..620，3× ；逐层隔离
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-final.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-probe-seam');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HIDE = (sel) => `(() => {
  const s = document.createElement('style');
  s.textContent = ${JSON.stringify(sel)} + '{display:none !important}';
  document.head.appendChild(s);
})()`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();

  const snap = async (name, face, { z = 3, clip, hide = [] } = {}) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + '/articles/?fld=off', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    for (const sel of hide) await page.evaluate(HIDE(sel));
    await sleep(2600);
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('snap', name, 'face=' + face, hide.length ? 'hide=' + hide.join(',') : '');
  };

  const C = { x: 600, y: 400, width: 600, height: 200 };
  await snap('f-dream-all', 'dream', { clip: C });
  await snap('f-wake-all', 'wake', { clip: C });
  await snap('f-dream-staveonly', 'dream', { clip: C, hide: ['.eeg'] });          // 缝线 + 四道谱带
  await snap('f-dream-mainonly', 'dream', { clip: C, hide: ['.echo-stave', '.eeg-echo'] }); // 缝线 + 主波
  await snap('f-dream-seamonly', 'dream', { clip: C, hide: ['.eeg-group'] });     // 只有缝线

  console.log('done');
  await browser.close();
})();
