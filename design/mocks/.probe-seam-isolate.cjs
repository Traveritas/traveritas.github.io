/* 逐层单独渲染 + 4× 放大：确定「小横线段阵列」出自哪一层
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-isolate.cjs */
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

  const snap = async (name, url, face, { z = 4, clip, hide = null } = {}) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    for (const sel of [].concat(hide || [])) await page.evaluate(HIDE(sel));
    await sleep(2600);
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('snap', name, 'face=' + face, 'hide=' + JSON.stringify(hide));
  };

  // 4× 紧裁：缝线过 (720,450)、14° ⇒ x 740..1040 → y 455..530
  const Z4 = { x: 740, y: 400, width: 300, height: 140 };

  await snap('i4-dream-staveonly', '/articles/?fld=off', 'dream', { z: 4, clip: Z4, hide: '.eeg' });
  await snap('i4-dream-mainonly', '/articles/?fld=off', 'dream', { z: 4, clip: Z4, hide: ['.echo-stave', '.eeg-echo'] });
  await snap('i4-dream-echoonly', '/articles/?fld=off', 'dream', { z: 4, clip: Z4, hide: ['.echo-stave', '.eeg-main'] });
  await snap('i4-wake-all', '/articles/?fld=off', 'wake', { z: 4, clip: Z4 });

  console.log('done');
  await browser.close();
})();
