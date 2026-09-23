/* 醒态「零墨迹」复测：同一页、同一冻结帧，只切脑电层 有 / 无（RM 冻结）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-wake-diff.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-p19-verify');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('xm-reality', 'wake');
      sessionStorage.setItem('xm-boot-seen', '1');
    } catch {}
  });
  await page.goto(BASE + '/articles/?fld=off', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(2600);

  const shot = async (name) => {
    const b64 = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64'));
    return b64;
  };

  const withLayer = await shot('wake-diff-with');
  // 只切「残影」：主波在醒态本来就在画（它与缝线重叠，属于既有画面，不是这一层多加的）
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '.eeg .eeg-echo{display:none !important}';
    document.head.appendChild(s);
  });
  await sleep(300);
  const without = await shot('wake-diff-without');
  // 再撤回，看看图层回来时是否回到同一帧
  await page.evaluate(() =>
    document.querySelectorAll('head style').forEach((s) => {
      if (s.textContent.includes('.eeg-echo{display:none')) s.remove();
    }),
  );
  await sleep(300);
  const back = await shot('wake-diff-back');

  const diff = async (a, b) =>
    page.evaluate(
      async (a, b) => {
        const load = (d) =>
          new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = 'data:image/png;base64,' + d;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas');
        c.width = ia.width;
        c.height = ia.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(ia, 0, 0);
        const da = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(ib, 0, 0);
        const db = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let maxd = 0;
        let eq1 = 0;
        const where = [];
        for (let i = 0; i < da.length; i += 4) {
          let d = 0;
          for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(da[i + k] - db[i + k]));
          if (d > 0) {
            n++;
            if (d === 1) eq1++;
            if (d > maxd) maxd = d;
            if (where.length < 5) where.push({ x: (i / 4) % c.width, y: Math.floor(i / 4 / c.width), d });
          }
        }
        return { w: c.width, h: c.height, pixels: n, total: c.width * c.height, eq1, maxChannelDelta: maxd, sample: where };
      },
      a,
      b,
    );

  console.log('有层 vs 无层（同页同帧）:', JSON.stringify(await diff(withLayer, without)));
  console.log('有层 vs 回层（同页，验证可复现）:', JSON.stringify(await diff(withLayer, back)));
  await browser.close();
})();
