/* ─────────────────────────────────────────────────────────────
   Phase 18 站点落地 · 截图（主会话用）
   醒/梦两态 × 首页首屏 / 首页正文段 / 内页 / 移动端
   用法：先 npm run dev -- --port 4331，再 node design/mocks/.p18-site.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4331';
const OUT = path.resolve(__dirname, '.shots-p18-site');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* dev server 首次编译 / HMR 会在装载中途整页重载，把 evaluate 打断；
   凡是跨「导航可能发生」的读取都套一层重试 */
const retry = async (fn, n = 4) => {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === n - 1) throw e;
      await sleep(600);
    }
  }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });

  /* 进页前钉住两态与快版开屏（reality.ts 在 initReality 里读 sessionStorage 闩锁） */
  const pin = async (face) => {
    await page.evaluateOnNewDocument(
      (f) => {
        try {
          sessionStorage.setItem('xm-reality', f);
          sessionStorage.setItem('xm-boot-seen', '1');
        } catch {
          /* ignore */
        }
      },
      face,
    );
  };

  // 预热：dev server 首次编译会给所有客户端发一次整页重载
  await page.goto(BASE + '/articles/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(3000);

  const shot = async (name, url, face, { w = 1440, h = 900, anchor = null } = {}) => {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await pin(face);
    await retry(async () => {
      await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
    });
    await sleep(2600);
    if (anchor) {
      await retry(async () => {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
        }, anchor);
      });
      await sleep(1200);
    }
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file });
    console.log('shot', name, 'face=' + face, 'scrollY=', await retry(() => page.evaluate(() => Math.round(scrollY))));
  };

  await shot('home-wake', '/', 'wake');
  await shot('home-dream', '/', 'dream');
  await shot('body-wake', '/', 'wake', { anchor: '#ns-essays' });
  await shot('body-dream', '/', 'dream', { anchor: '#ns-essays' });
  await shot('articles-wake', '/articles/', 'wake');
  await shot('articles-dream', '/articles/', 'dream');
  await shot('mobile-dream', '/', 'dream', { w: 390, h: 844 });

  console.log('--- errors:', errs.length ? errs.slice(0, 10) : 'none');
  await browser.close();
})();
