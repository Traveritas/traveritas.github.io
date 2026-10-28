/* 真实首页参考截图（给接入方案与 mock 终帧对照用）
   node design/mocks/boot/iter/_ref/real-home/.shot-real.cjs
   需要 Astro dev server 在 http://127.0.0.1:4670/（`npx astro dev --port 4670`）。
   等旧开屏演完（或直接摘掉 #bootveil），等 WebGL 流光开始画，再截静置帧。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:4670/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const shot = async (name, vp) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    /* 直接摘掉开屏面纱，比等 3.5s 稳；class 保留真实路径里的 booted/w-ready */
    await page.evaluate(() => {
      document.getElementById('bootveil')?.remove();
      document.documentElement.classList.add('booted', 'w-ready');
      document.documentElement.dataset.bootSkip = '';
    });
    /* 等流光真的画出来：canvas 有 WebGL2 上下文且非全黑 */
    await page.waitForFunction(
      () => {
        const c = document.getElementById('w-light');
        return !!(c && c.width && (c.getContext('webgl2') || c.getContext('webgl')));
      },
      { timeout: 20000 },
    ).catch(() => errors.push(`${name}: w-light 没起来`));
    await sleep(1500);
    /* 梦态大字每秒轮转一个词；等到 AveritA 那一刻再截，别截到轮转中途 */
    await page
      .waitForFunction(() => document.querySelector('.w-home-brand')?.textContent === 'AveritA', { timeout: 12000 })
      .catch(() => errors.push(`${name}: 没等到 AveritA`));
    await sleep(80);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    /* 大字那扇反相窗的细节 */
    const brand = await page.$('.w-home-brand-box');
    if (brand) await brand.screenshot({ path: path.join(OUT, `${name}-brand.png`) });
    /* 只留流光：方便对比 mock 的颗粒（去掉 DOM 字与 UI） */
    await page.evaluate(() => {
      for (const sel of ['.w-home', '#w-stage', '#w-heads', '.w-chrome', '#site-eeg-group', '#w-veil']) {
        const el = document.querySelector(sel);
        if (el) el.style.visibility = 'hidden';
      }
    });
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, `${name}-flow.png`) });
    await page.close();
  };

  await shot('home-desktop', { width: 1440, height: 900 });
  await shot('home-mobile', { width: 390, height: 844 });

  await browser.close();
  if (errors.length) {
    console.log('--- 报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  console.log('shot done →', path.relative(process.cwd(), OUT));
})();
