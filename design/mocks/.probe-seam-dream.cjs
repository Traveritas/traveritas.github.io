/* 梦态背景线上「小横线段阵列」取证：两态 × 放大裁片 × 层开关
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-dream.cjs */
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
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  const pin = async (face) => {
    await page.evaluateOnNewDocument(
      (f) => {
        try {
          sessionStorage.setItem('xm-reality', f);
          sessionStorage.setItem('xm-boot-seen', '1');
        } catch {}
      },
      face,
    );
  };

  const shot = async (name, url, face, { z = 2, clip = null } = {}) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await pin(face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file, clip: clip || undefined });
    console.log('shot', name, 'face=' + face);
  };

  // 视口正中 = 缝线/脑电轴心（50vh, 50vw）
  const C = { x: 340, y: 300, width: 760, height: 300 };

  await shot('dream-body', '/articles/', 'dream', { clip: C });
  await shot('wake-body', '/articles/', 'wake', { clip: C });
  await shot('dream-nofld', '/articles/?fld=off', 'dream', { clip: C });
  await shot('dream-noeeg', '/articles/?fld=off', 'dream', { clip: C }); // 对照：仅构块场关
  await shot('dream-home', '/?fld=off', 'dream', { clip: C });

  // 元素清单：梦态下这些层各自算出来的值
  const probe = async (url, face) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await pin(face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await sleep(2600);
    return page.evaluate(() => {
      const r = {};
      const esb = [...document.querySelectorAll('.esb')].map((el) => {
        const cs = getComputedStyle(el);
        const b = el.querySelector('b');
        const bs = b ? getComputedStyle(b) : null;
        return {
          transform: cs.transform,
          opacity: cs.opacity,
          right: el.getBoundingClientRect().right - el.getBoundingClientRect().left,
          bg: bs ? bs.backgroundImage.slice(0, 120) : null,
        };
      });
      r.esb = esb;
      r.echoPaths = [...document.querySelectorAll('.eeg-echo')].map((p) => p.getAttribute('d')?.slice(0, 60) || '');
      r.mainD = document.querySelector('.eeg-main')?.getAttribute('d')?.slice(0, 80) || '';
      r.groupOpacity = getComputedStyle(document.querySelector('.eeg-group') || document.body).opacity;
      r.still = getComputedStyle(document.documentElement).getPropertyValue('--still');
      r.mix = getComputedStyle(document.documentElement).getPropertyValue('--reality-mix');
      r.reality = document.body.dataset.reality || document.documentElement.dataset.reality || '';
      return r;
    });
  };
  const d = await probe('/articles/', 'dream');
  const w = await probe('/articles/', 'wake');
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify({ dream: d, wake: w }, null, 2));
  console.log('--- dream still/mix:', d.still, d.mix, 'reality=', d.reality);
  console.log('--- esb(dream):', JSON.stringify(d.esb, null, 1));
  console.log('--- echo d(dream):', d.echoPaths);
  console.log('--- main d(dream):', d.mainD);
  console.log('--- wake still/mix:', w.still, w.mix, 'main d:', w.mainD);
  console.log('--- errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
