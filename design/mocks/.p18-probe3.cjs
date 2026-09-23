/* 探针 3：把「藏掉谱带/残影」前后的差异画成图，直接看 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(__dirname, '.shots-p18-site');
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
    } catch {
      /* ignore */
    }
  });
  await page.goto('http://localhost:4331/', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(3000);
  await page.evaluate(() => {
    const el = document.querySelector('#ns-essays');
    scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
  });
  await sleep(800);
  const a = await page.screenshot({ encoding: 'base64' });
  const state = await page.evaluate(() => ({
    zone: document.body.dataset.zone,
    scrollY: Math.round(scrollY),
    still: getComputedStyle(document.documentElement).getPropertyValue('--still'),
    mix: getComputedStyle(document.documentElement).getPropertyValue('--reality-mix'),
    esbOp: [...document.querySelectorAll('.esb')].map((e) => getComputedStyle(e).opacity),
    echoOp: [...document.querySelectorAll('.eeg-echo')].map((e) => getComputedStyle(e).opacity),
    echoD: [...document.querySelectorAll('.eeg-echo')].map((e) => (e.getAttribute('d') || '').length),
    mainLen: (document.querySelector('.eeg-main').getAttribute('d') || '').length,
  }));
  console.log('状态 A：', JSON.stringify(state));
  await page.evaluate(() => document.querySelectorAll('.eeg-echo,.echo-stave').forEach((e) => (e.style.display = 'none')));
  await sleep(500);
  const b = await page.screenshot({ encoding: 'base64' });
  const blank = await browser.newPage();
  await blank.setViewport({ width: 600, height: 400 });
  await blank.setContent('<title>d</title>');
  const out = await blank.evaluate(
    async (x, y) => {
      const load = async (s) => {
        const im = new Image();
        im.src = 'data:image/png;base64,' + s;
        await im.decode();
        return im;
      };
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      const c = document.createElement('canvas');
      c.width = ia.width;
      c.height = ia.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const A = ctx.getImageData(0, 0, c.width, c.height);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(ib, 0, 0);
      const B = ctx.getImageData(0, 0, c.width, c.height);
      const o = ctx.createImageData(c.width, c.height);
      let n = 0, maxd = 0;
      const hist = {};
      for (let i = 0; i < A.data.length; i += 4) {
        const d = Math.max(
          Math.abs(A.data[i] - B.data[i]),
          Math.abs(A.data[i + 1] - B.data[i + 1]),
          Math.abs(A.data[i + 2] - B.data[i + 2]),
        );
        if (d > 0) n++;
        if (d > maxd) maxd = d;
        hist[d] = (hist[d] || 0) + 1;
        o.data[i] = Math.min(255, d * 6);
        o.data[i + 1] = 0;
        o.data[i + 2] = Math.min(255, d * 2);
        o.data[i + 3] = 255;
      }
      const c2 = document.createElement('canvas');
      c2.width = c.width;
      c2.height = c.height;
      c2.getContext('2d').putImageData(o, 0, 0);
      return { n, maxd, hist, png: c2.toDataURL('image/png') };
    },
    a,
    b,
  );
  console.log('不同像素', out.n, '最大通道差', out.maxd);
  const hs = Object.entries(out.hist).sort((p, q) => p[0] - q[0]).slice(0, 12);
  console.log('差值直方图（前 12 档）', JSON.stringify(hs));
  fs.writeFileSync(path.join(OUT, 'probe-diff.png'), Buffer.from(out.png.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(OUT, 'probe-a.png'), Buffer.from(a, 'base64'));
  fs.writeFileSync(path.join(OUT, 'probe-b.png'), Buffer.from(b, 'base64'));
  console.log('写出 probe-a / probe-b / probe-diff');
  await browser.close();
})();
