/* 首页首屏可读性：梦态摆幅翻倍后，脑电束有没有扫到字（冻结帧 · 本层 有 vs 无）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p20-hero.cjs [标签] */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const TAG = process.argv[2] || 'x';
const OUT = path.resolve(__dirname, '.shots-p20-gain');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOXES = ['.ch-wake', '.ch-dream', '.ghost-char', '.note-ink', '.vsub', '.hero-scroll'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  const run = async (face) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2800);
    // 冻结构图与脑电：rAF 循环据此不再重绘，两次截图因此是同一帧
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';
      document.head.appendChild(s);
    });
    await sleep(600);
    const boxes = await page.evaluate((sels) => {
      const o = {};
      const r = document.querySelector('.container-wide')?.getBoundingClientRect();
      o['__近缝线带(±40px 绕缝线)'] = null;
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        o[s] = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      }
      void r;
      return o;
    }, BOXES);
    const a = await page.screenshot({ encoding: 'base64' });
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '.eeg-group{display:none !important}';
      document.head.appendChild(s);
    });
    await sleep(200);
    const b = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(OUT, `hero-${face}-${TAG}.png`), Buffer.from(a, 'base64'));
    const res = await page.evaluate(
      async (a, b, boxes) => {
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
        const lin = (v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const L = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
        const out = {};
        for (const s in boxes) {
          const bx = boxes[s];
          if (!bx) continue;
          let n = 0;
          let maxDL = 0;
          let minUnderL = 1; // 本层落墨处「底下那张图」的最暗值：若很暗 ⇒ 线压在了字上
          for (let y = bx.y; y < bx.y + bx.h; y++) {
            for (let x = bx.x; x < bx.x + bx.w; x++) {
              if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
              const i = (y * c.width + x) * 4;
              let dmax = 0;
              for (let k = 0; k < 3; k++) dmax = Math.max(dmax, Math.abs(da[i + k] - db[i + k]));
              if (dmax > 0) {
                n++;
                maxDL = Math.max(maxDL, Math.abs(L(da[i], da[i + 1], da[i + 2]) - L(db[i], db[i + 1], db[i + 2])));
                minUnderL = Math.min(minUnderL, L(db[i], db[i + 1], db[i + 2]));
              }
            }
          }
          out[s] = { px: n, box: bx.w * bx.h, maxDeltaL: +maxDL.toFixed(4), minUnderL: +minUnderL.toFixed(4) };
        }
        return out;
      },
      a,
      b,
      boxes,
    );
    return res;
  };

  for (const face of ['dream', 'wake']) {
    const r = await run(face);
    console.log(`[${TAG}] 首页首屏 · 本层贡献（${face}）：`);
    for (const k in r) console.log('   ', k.padEnd(38), JSON.stringify(r[k]));
  }
  console.log(`[${TAG}] --- errors:`, errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
