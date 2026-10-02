/* 原型 linescape 首屏截图：node design/mocks/.shot-scene-linescape.cjs [tag] [base]
   base 默认 http://localhost:4321（astro dev）。输出 design/mocks/_shots-scene/linescape-<tag>-*.png
   另截一张滚动中途（收拢中）的桌面帧，并测静置 3 秒的主线程开销与 Worker 每帧耗时。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || 'r1';
const BASE = process.argv[3] || 'http://localhost:4321';
const URL_ = `${BASE}/mock/scene-linescape/`;
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--enable-gpu-rasterization'],
  });
  for (const reality of ['wake', 'dream']) {
    for (const [tag, w, h, mobile] of VIEWS) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
      await page.evaluateOnNewDocument((r) => {
        try {
          sessionStorage.setItem('xm-reality', r);
          localStorage.setItem('xm-reality-guided-v2', '1');
        } catch {}
      }, reality);
      page.on('pageerror', (e) => console.log('pageerror', e.message));
      page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
      await page.goto(URL_, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 7000));
      const file = path.join(OUT, `linescape-${TAG}-${tag}-${reality}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      if (tag === 'd' && reality === 'wake') {
        // 静置 3 秒：样式重算 / 布局 / 脚本
        const cdp = await page.target().createCDPSession();
        await cdp.send('Performance.enable');
        const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        await page.evaluate(() => window.__lsPerf && window.__lsPerf());
        const a = await get();
        await new Promise((r) => setTimeout(r, 3000));
        const b = await get();
        console.log(
          'idle3s',
          JSON.stringify({
            recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
            layouts: b.LayoutCount - a.LayoutCount,
            scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1),
            recalcMs: +((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000).toFixed(1),
            taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1),
          }),
        );
        console.log('workerPaint', JSON.stringify(await page.evaluate(() => window.__lsPerf && window.__lsPerf())));
        // 滚动中途（收拢中）
        await page.evaluate(() => scrollTo(0, innerHeight * 0.2));
        await new Promise((r) => setTimeout(r, 900));
        await page.screenshot({ path: path.join(OUT, `linescape-${TAG}-d-scroll.png`) });
        await page.evaluate(() => scrollTo(0, innerHeight * 0.75));
        await new Promise((r) => setTimeout(r, 1200));
        await page.screenshot({ path: path.join(OUT, `linescape-${TAG}-d-scroll2.png`) });
      }
      await page.close();
    }
  }
  await browser.close();
})();
