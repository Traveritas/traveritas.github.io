/* 居中后的构图检查：束 / 缝线 / 束+缝线（3×，左侧空处）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-look.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-p19-verify');
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
    console.log('snap', name, hide.length ? 'hide=' + hide.join(',') : '');
  };

  // 左侧空处：束中心从 (100,295) 到 (600,420)
  const C = { x: 100, y: 245, width: 500, height: 225 };
  await snap('look-dream-bundle', 'dream', { clip: C, hide: ['.seam'] });     // 只留四条波
  await snap('look-dream-seam', 'dream', { clip: C, hide: ['.eeg-group'] });  // 只留缝线
  await snap('look-dream-both', 'dream', { clip: C });                         // 四条波 + 缝线
  await snap('look-wake-both', 'wake', { clip: C });
  console.log('done');
  await browser.close();
})();
