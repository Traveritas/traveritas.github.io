/* 紧裁片：3× 放大主线段，两态对照 + 逐层拆解
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-zoom.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-probe-seam');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HIDE_EEG = `(() => {
  const s = document.createElement('style');
  s.id = 'probe-hide';
  s.textContent = '.eeg-group{display:none !important}';
  document.head.appendChild(s);
})()`;
const HIDE_STAVE = `(() => {
  const s = document.createElement('style');
  s.id = 'probe-hide';
  s.textContent = '.echo-stave{display:none !important}';
  document.head.appendChild(s);
})()`;
const HIDE_ECHO = `(() => {
  const s = document.createElement('style');
  s.id = 'probe-hide';
  s.textContent = '.eeg-echo{display:none !important}';
  document.head.appendChild(s);
})()`;
const HIDE_SEAM = `(() => {
  const s = document.createElement('style');
  s.id = 'probe-hide';
  s.textContent = '.seam{display:none !important}';
  document.head.appendChild(s);
})()`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();

  const shot = async (name, url, face, { z = 3, clip, hide = null, freeze = false } = {}) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    if (hide) await page.evaluate(hide);
    await sleep(2600);
    if (freeze) {
      // 钉住一个确定帧：停掉 CSS 动画与 rAF 时间推进不可行，只求同一相位附近
      await page.evaluate(() => {
        document.querySelectorAll('.esb b, .eeg-echo').forEach((el) => {
          el.style.animationPlayState = 'paused';
        });
      });
      await sleep(200);
    }
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('shot', name, 'face=' + face, hide ? '(hidden)' : '');
  };

  // 版心右侧空处的主线段（避开正文），3× ⇒ 每 CSS px = 3 设备 px
  // 缝线过 (720,450)、14°：x=700 → y≈445，x=1220 → y≈575
  const Z = { x: 700, y: 395, width: 520, height: 190 };

  await shot('z-dream-all', '/articles/', 'dream', { z: 3, clip: Z });
  await shot('z-wake-all', '/articles/', 'wake', { z: 3, clip: Z });
  await shot('z-dream-nostave', '/articles/', 'dream', { z: 3, clip: Z, hide: HIDE_STAVE });
  await shot('z-dream-noecho', '/articles/', 'dream', { z: 3, clip: Z, hide: HIDE_ECHO });
  await shot('z-dream-seamonly', '/articles/', 'dream', { z: 3, clip: Z, hide: HIDE_EEG });
  await shot('z-wake-nostave', '/articles/', 'wake', { z: 3, clip: Z, hide: HIDE_STAVE });
  await shot('z-dream-nofld', '/articles/?fld=off', 'dream', { z: 3, clip: Z, hide: HIDE_STAVE });

  console.log('done');
  await browser.close();
})();
