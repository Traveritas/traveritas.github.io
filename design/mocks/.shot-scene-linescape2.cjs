/* 原型 linescape 第二轮截图：node design/mocks/.shot-scene-linescape2.cjs [tag] [base]
   两个变体（?v=a / ?v=b）× 醒 / 梦 × 桌面 / 窄屏，都带 &pins=1（测量点平时只是点与小字）；
   另截测量点展开态（桌面 hover、窄屏点按），并测两个变体静置 3 秒的主线程开销与 Worker 每帧耗时。
   输出 design/mocks/_shots-scene/linescape2-<tag>-<v>-<reality>-<d|m>.png（tag 为空则不带）。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || '';
const BASE = process.argv[3] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });
const name = (s) => path.join(OUT, `linescape2-${TAG ? TAG + '-' : ''}${s}.png`);

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--enable-gpu-rasterization'],
  });
  const open = async (v, reality, w, h, mobile) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument((r) => {
      try {
        sessionStorage.setItem('xm-reality', r);
        localStorage.setItem('xm-reality-guided-v2', '1');
      } catch {}
    }, reality);
    page.on('pageerror', (e) => console.log('pageerror', v, reality, e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('console', v, reality, m.text()));
    await page.goto(`${BASE}/mock/scene-linescape/?v=${v}&pins=1`, { waitUntil: 'networkidle0' });
    await sleep(7500);
    return page;
  };
  for (const v of ['a', 'b']) {
    for (const reality of ['wake', 'dream']) {
      for (const [tag, w, h, mobile] of VIEWS) {
        const page = await open(v, reality, w, h, mobile);
        const file = name(`${v}-${reality}-${tag}`);
        await page.screenshot({ path: file });
        console.log(file);
        if (tag === 'd' && reality === 'wake') {
          const cdp = await page.target().createCDPSession();
          await cdp.send('Performance.enable');
          const get = async () =>
            Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
          await page.evaluate(() => window.__lsPerf && window.__lsPerf());
          const a = await get();
          await sleep(3000);
          const b = await get();
          console.log(
            'idle3s',
            v,
            JSON.stringify({
              recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
              layouts: b.LayoutCount - a.LayoutCount,
              scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1),
              recalcMs: +((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000).toFixed(1),
              taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1),
            }),
          );
          console.log('workerPaint', v, JSON.stringify(await page.evaluate(() => window.__lsPerf && window.__lsPerf())));
          // 测量点展开：桌面 hover 「随笔」
          if (v === 'a') {
            const dot = await page.$('.pin-articles .pin-dot');
            if (dot) {
              await dot.hover();
              await sleep(900);
              await page.screenshot({ path: name('pins-hover-d') });
              console.log(name('pins-hover-d'));
            }
          }
        }
        if (tag === 'm' && reality === 'wake' && v === 'a') {
          const dot = await page.$('.pin-projects .pin-dot');
          if (dot) {
            await dot.tap();
            await sleep(900);
            await page.screenshot({ path: name('pins-tap-m') });
            console.log(name('pins-tap-m'));
          }
        }
        await page.close();
      }
    }
  }
  await browser.close();
})();
