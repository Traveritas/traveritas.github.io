/* 「景深叠层」截图：node design/mocks/layout-depth/.shot-depth.cjs
   puppeteer-core 与 Chrome 的定位沿用 design/mocks/hours/.shot-hours.cjs。
   输出到 design/mocks/layout-depth/.shots/。ONLY=名字片段 可只拍一部分。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = 'http://127.0.0.1:4613/design/mocks/layout-depth/';

async function page(browser, vp, hash = '', opts = {}) {
  const p = await browser.newPage();
  await p.setViewport(vp);
  if (opts.rm) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (opts.nojs) await p.setJavaScriptEnabled(false);
  p.on('pageerror', (e) => console.log('  pageerror:', e.message));
  p.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text()));
  await p.goto(URL + hash, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await sleep(900);
  return p;
}
const st = (p) => p.evaluate(() => window.__depth.state());

async function shot(p, name) {
  if (ONLY && !name.includes(ONLY)) return;
  await p.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ✓', name);
}
async function goSettle(p, k) {
  await p.evaluate((k) => window.__depth.go(k, true), k);
  for (let i = 0; i < 40; i++) {
    await sleep(100);
    const s = await st(p);
    if (s.settled && s.focus === k) break;
  }
  await sleep(500);
}
/* 把相机钉在第 a 与 b 片之间的 t 处（滚动位置同步，免得被吸附拉走） */
async function camBetween(p, a, t) {
  await p.evaluate(({ a, t }) => {
    const s = window.__depth.state();
    window.scrollTo({ top: (a + t) * s.step, behavior: 'instant' });
  }, { a, t });
  await sleep(1600);
}

(async () => {
  const server = await start(4613);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader'],
  });
  try {
    const D = { width: 1440, height: 900, deviceScaleFactor: 1 };
    const M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

    console.log('desktop');
    let p = await page(browser, D);
    await shot(p, '01-first-view');
    await goSettle(p, 1);
    await shot(p, '02-article-focused');
    // 吸附会把半途的滚动拉回整片：截图时临时关掉吸附
    await p.addStyleTag({ content: 'html.js{scroll-snap-type:none !important}' });
    await camBetween(p, 1, 0.45);
    await shot(p, '03-mid-flight-a1-a2');
    await camBetween(p, 2, 0.35);
    await shot(p, '04-boundary-approach-fog');
    await camBetween(p, 2, 0.5);
    await shot(p, '05-boundary-in-fog');
    await camBetween(p, 2, 0.68);
    await shot(p, '06-boundary-after');
    await camBetween(p, 4, 0.5);
    await shot(p, '07-boundary-deep-to-rem');
    await p.close();

    p = await page(browser, D, '#fancytext');
    await sleep(600);
    await shot(p, '08-project-focused');
    await p.close();

    p = await page(browser, D, '#m-lacuna-dream');
    await sleep(600);
    await shot(p, '09-moment-focused');
    await p.close();

    p = await page(browser, D, '#m-nexus-dev');
    await sleep(600);
    await shot(p, '09b-moment4-focused');
    await p.close();

    p = await page(browser, D, '#about');
    await sleep(600);
    await shot(p, '09c-about-focused');
    await p.close();

    console.log('side view');
    p = await page(browser, D, '#co-creation-notes');
    await sleep(500);
    await p.evaluate(() => window.__depth.toSide());
    await sleep(420);
    await shot(p, '10-side-turning');
    await sleep(1600);
    await shot(p, '11-side-view');
    await p.evaluate(() => window.__depth.flyTo(6));
    await sleep(500);
    await shot(p, '12-side-flyback-mid');
    await sleep(1600);
    await shot(p, '13-side-flyback-landed');
    await p.close();

    console.log('detail');
    p = await page(browser, D, '#co-creation-notes');
    await sleep(500);
    p.evaluate(() => window.__depth.open(1));
    await sleep(260);
    await shot(p, '14-article-open-mid');
    await sleep(330);
    await shot(p, '15-article-open-resolving');
    await sleep(1200);
    await shot(p, '16-article-open-settled');
    await p.evaluate(() => document.querySelector('.r-scroll').scrollTop = 1500);
    await sleep(300);
    await shot(p, '17-article-reading-scrolled');
    await p.close();

    p = await page(browser, D, '#m-lacuna-dream');
    await sleep(500);
    p.evaluate(() => window.__depth.open(6));
    await sleep(560);
    await shot(p, '18-moment-open-resolving');
    await sleep(1400);
    await shot(p, '19-moment-open-settled');
    await p.close();

    p = await page(browser, D, '#personal-website/read');
    await sleep(2200);
    await shot(p, '20-project-open-settled');
    await p.close();

    console.log('mobile');
    p = await page(browser, M);
    await shot(p, '21-m-first-view');
    await goSettle(p, 1);
    await shot(p, '22-m-article');
    await p.addStyleTag({ content: 'html.js{scroll-snap-type:none !important}' });
    await camBetween(p, 2, 0.5);
    await shot(p, '23-m-boundary');
    await p.close();
    p = await page(browser, M, '#m-lacuna-dream');
    await sleep(600);
    await shot(p, '24-m-moment');
    await p.evaluate(() => window.__depth.toSide());
    await sleep(2200);
    await shot(p, '25-m-side');
    await p.close();
    p = await page(browser, M, '#co-creation-notes/read');
    await sleep(2200);
    await shot(p, '26-m-article-open');
    await p.close();

    console.log('reduced motion / no js');
    p = await page(browser, D, '', { rm: true });
    await p.addStyleTag({ content: 'html.js{scroll-snap-type:none !important}' });
    await camBetween(p, 1, 0.5);
    await shot(p, '27-rm-crossfade');
    await p.close();
    p = await page(browser, D, '', { nojs: true });
    await shot(p, '28-nojs');
    await p.close();
  } finally {
    await browser.close();
    server.close();
  }
})();
