/* 原型 submerged 场景首屏截图 + 静置开销：node design/mocks/.shot-scene-submerged.cjs [tag] [base]
   base 默认 http://localhost:4321（astro dev）。输出 design/mocks/_shots-scene/submerged-<tag>-*.png
   静置开销：入场结束后静置 3 秒，CDP Performance.getMetrics 的差值（样式重算次数 / 时长、布局、脚本）。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || 'r1';
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];

async function open(browser, url, reality, [, w, h, mobile]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await page.evaluateOnNewDocument((r) => {
    try {
      sessionStorage.setItem('xm-reality', r);
      localStorage.setItem('xm-reality-guided-v2', '1');
    } catch {}
  }, reality);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 6500));
  return page;
}

async function idle(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable');
  const pick = (m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));
  const a = pick(await cdp.send('Performance.getMetrics'));
  await new Promise((r) => setTimeout(r, 3000));
  const b = pick(await cdp.send('Performance.getMetrics'));
  const d = (k) => b[k] - a[k];
  return {
    recalc: d('RecalcStyleCount'),
    recalcMs: +(d('RecalcStyleDuration') * 1000).toFixed(1),
    layouts: d('LayoutCount'),
    scriptMs: +(d('ScriptDuration') * 1000).toFixed(1),
    taskMs: +(d('TaskDuration') * 1000).toFixed(1),
  };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  });
  for (const reality of ['dream', 'wake']) {
    for (const v of VIEWS) {
      const page = await open(browser, `${BASE}/mock/scene-submerged/`, reality, v);
      const file = path.join(OUT, `submerged-${TAG}-${v[0]}-${reality}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      if (v[0] === 'd' && reality === 'wake') {
        console.log('idle submerged', JSON.stringify(await idle(page)));
        // 滚到场 0 中段：水面上漫
        await page.evaluate(() => scrollTo(0, innerHeight * 0.42));
        await new Promise((r) => setTimeout(r, 900));
        const f2 = path.join(OUT, `submerged-${TAG}-d-scroll.png`);
        await page.screenshot({ path: f2 });
        console.log(f2);
      }
      await page.close();
    }
  }
  if (process.argv.includes('--compare')) {
    const page = await open(browser, `${BASE}/new/`, 'wake', VIEWS[0]);
    console.log('idle /new/', JSON.stringify(await idle(page)));
    await page.close();
  }
  await browser.close();
})();
