/* 原型 linescape · vault（天空的穹肋）截图：node design/mocks/.shot-scene-linescape-vault.cjs [tag] [base]
   只截 v=a × 醒 / 梦 × 桌面 / 窄屏；并测桌面醒面静置 3 秒的主线程开销与 Worker 每帧耗时。
   输出 design/mocks/_shots-scene/vault-<tag>-<reality>-<d|m>.png（tag 为空则不带）。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || '';
const BASE = process.argv[3] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });
const name = (s) => path.join(OUT, `vault-${TAG ? TAG + '-' : ''}${s}.png`);

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
      page.on('pageerror', (e) => console.log('pageerror', reality, e.message));
      page.on('console', (m) => m.type() === 'error' && console.log('console', reality, m.text()));
      await page.goto(`${BASE}/mock/scene-linescape-vault/?v=a`, { waitUntil: 'networkidle0' });
      await sleep(Number(process.env.WAIT || 7500));
      const file = name(`${reality}-${tag}`);
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
          JSON.stringify({
            recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
            layouts: b.LayoutCount - a.LayoutCount,
            scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1),
            taskMs: +((b.TaskDuration - a.TaskDuration) * 1000).toFixed(1),
          }),
        );
        console.log('workerPaint', JSON.stringify(await page.evaluate(() => window.__lsPerf && window.__lsPerf())));
      }
      await page.close();
    }
  }
  await browser.close();
})();
