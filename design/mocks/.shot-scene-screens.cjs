/* 原型 screens 场景首屏截图 + 静置采样：node design/mocks/.shot-scene-screens.cjs [base] [tag]
   base 默认 http://localhost:4321（astro dev）。输出 design/mocks/_shots-scene/screens-<tag>-*.png
   静置采样：桌面醒面，入场结束后静置 3s 的 trace —— 样式重算 / 布局次数与脚本耗时，对照 /new/。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const BASE = process.argv[2] || 'http://localhost:4321';
const TAG = process.argv[3] || 'r1';
const PERF = process.argv.includes('--perf');
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}

async function idleTrace(browser, url) {
  const page = await open(browser, url, 'wake', VIEWS[0]);
  await sleep(7000);
  await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  await sleep(3000);
  const buf = await page.tracing.stop();
  await page.close();
  const ev = JSON.parse(Buffer.from(buf).toString('utf8')).traceEvents;
  // 渲染主线程可能有好几个（扩展 / 空白页）：取事件最多的那个
  const mains = ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  const of = (m) => ev.filter((e) => e.pid === m.pid && e.tid === m.tid);
  const onMain = mains.map(of).sort((a, b) => b.length - a.length)[0] ?? [];
  const count = (n) => onMain.filter((e) => e.name === n).length;
  const dur = (ns) => onMain.filter((e) => ns.includes(e.name) && e.dur).reduce((s, e) => s + e.dur, 0) / 1000;
  return {
    recalc: count('UpdateLayoutTree') + count('RecalculateStyles'),
    layout: count('Layout'),
    paint: count('Paint'),
    scriptMs: +dur(['FunctionCall', 'EvaluateScript', 'TimerFire', 'FireAnimationFrame']).toFixed(1),
    tasksMs: +dur(['RunTask', 'ThreadControllerImpl::RunTask']).toFixed(1),
  };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  });
  const url = `${BASE}/mock/scene-screens/`;
  if (!process.argv.includes('--perf-only'))
  for (const reality of ['wake', 'dream']) {
    for (const view of VIEWS) {
      const page = await open(browser, url, reality, view);
      await sleep(6500);
      const file = path.join(OUT, `screens-${TAG}-${reality}-${view[0]}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      if (reality === 'wake') {
        // 滚动中途：场 0 走到 --p ≈ .16（屏错开、半澄清）
        await page.evaluate(() => {
          const s = document.getElementById('ns-hero');
          scrollTo(0, (s.offsetHeight - innerHeight) * 0.16);
        });
        await sleep(900);
        const f2 = path.join(OUT, `screens-${TAG}-scroll-${view[0]}.png`);
        await page.screenshot({ path: f2 });
        console.log(f2);
      }
      await page.close();
    }
  }
  if (PERF) {
    console.log('screens', JSON.stringify(await idleTrace(browser, url)));
    console.log('new    ', JSON.stringify(await idleTrace(browser, `${BASE}/new/`)));
  }
  await browser.close();
})();
