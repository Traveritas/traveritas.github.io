/* 主页 /new/（线景开屏）验收截图：node design/mocks/.shot-new-home.cjs [tag] [base]
   醒 / 梦 × 桌面 / 窄屏开屏；桌面醒面再截开屏滚动中途两帧；测静置 3 秒主线程开销、地形 Worker 每帧耗时、
   开屏 → 第 1 幕左上角天空块的最大相邻色差（ΔE76，查跳色）。页面报错一并打印。
   输出 design/mocks/_shots-scene/new-<tag->*.png。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || '';
const BASE = process.argv[3] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });
const name = (s) => path.join(OUT, `new-${TAG ? TAG + '-' : ''}${s}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT = Number(process.env.WAIT || 9000);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--enable-gpu-rasterization'],
  });
  const open = async (reality, w, h, mobile, rm = false) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    if (rm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument((r) => {
      try {
        sessionStorage.setItem('xm-reality', r);
        localStorage.setItem('xm-reality-guided-v2', '1');
      } catch {}
    }, reality);
    page.on('pageerror', (e) => console.log('pageerror', reality, w, e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('console', reality, w, m.text()));
    await page.goto(`${BASE}/new/`, { waitUntil: 'networkidle0' });
    await sleep(WAIT);
    return page;
  };
  const report = {};
  for (const reality of ['wake', 'dream']) {
    const page = await open(reality, 1440, 900, false);
    await page.screenshot({ path: name(`${reality}-d`) });
    console.log(name(`${reality}-d`));
    if (reality === 'wake') {
      const cdp = await page.target().createCDPSession();
      await cdp.send('Performance.enable');
      const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      await page.evaluate(() => window.__lsPerf && window.__lsPerf());
      const a = await get();
      await sleep(3000);
      const b = await get();
      report.idle3s = {
        recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
        layouts: b.LayoutCount - a.LayoutCount,
        scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1),
        taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1),
      };
      report.worker = await page.evaluate(() => window.__lsPerf && window.__lsPerf());
      const h = await page.evaluate(() => document.querySelector('[data-scene="0"]').offsetHeight);
      for (const f of [0.15, 0.4]) {
        await page.evaluate((y) => scrollTo(0, y), h * f);
        await sleep(900);
        await page.screenshot({ path: name(`scroll-${f}`) });
        console.log(name(`scroll-${f}`));
      }
    }
    await page.close();
    const m = await open(reality, 390, 844, true);
    await m.screenshot({ path: name(`${reality}-m`) });
    console.log(name(`${reality}-m`));
    await m.close();
  }
  const r = await open('wake', 1440, 900, false, true);
  await r.screenshot({ path: name('reduced-d') });
  console.log(name('reduced-d'));
  await r.close();
  console.log(JSON.stringify(report));
  await browser.close();
})();
