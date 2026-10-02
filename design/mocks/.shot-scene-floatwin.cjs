/* 原型 floatwin 场景首屏截图 + 静置测量：node design/mocks/.shot-scene-floatwin.cjs [轮次标签] [base]
   base 默认 http://localhost:4321（astro dev）。输出 design/mocks/_shots-scene/floatwin-<轮次>-*.png
   另截一张滚过开屏 18% 的收拢中途帧；桌面醒面在入场结束后静置 3s 采 Performance 指标。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || 'r1';
const BASE = process.argv[3] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['d', 1440, 900, false],
  ['m', 390, 844, true],
];

async function idleMetrics(page) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable');
  const pick = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return { rs: m.RecalcStyleCount, rsd: m.RecalcStyleDuration, lc: m.LayoutCount, sd: m.ScriptDuration, td: m.TaskDuration };
  };
  const a = await pick();
  await new Promise((r) => setTimeout(r, 3000));
  const b = await pick();
  return {
    recalcStyle: b.rs - a.rs,
    recalcMs: +((b.rsd - a.rsd) * 1000).toFixed(1),
    layouts: b.lc - a.lc,
    scriptMs: +((b.sd - a.sd) * 1000).toFixed(1),
    taskMs: +((b.td - a.td) * 1000).toFixed(1),
  };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
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
      await page.goto(`${BASE}/mock/scene-floatwin/`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 6000));
      const file = path.join(OUT, `floatwin-${TAG}-${tag}-${reality}.png`);
      await page.screenshot({ path: file });
      console.log(file);
      if (tag === 'd' && reality === 'wake') {
        console.log('idle 3s', JSON.stringify(await idleMetrics(page)));
        // 键盘焦点：Tab 到第一扇窗（随笔）
        for (let i = 0; i < 30; i++) {
          await page.keyboard.press('Tab');
          if (await page.evaluate(() => document.activeElement?.classList.contains('fw-articles'))) break;
        }
        await new Promise((r) => setTimeout(r, 500));
        const ff = path.join(OUT, `floatwin-${TAG}-d-focus.png`);
        await page.screenshot({ path: ff, clip: { x: 300, y: 150, width: 900, height: 420 } });
        console.log(ff);
        await page.evaluate(() => document.activeElement?.blur());
        // 收拢中途帧：开屏舞台滚过 18%
        await page.evaluate(() => {
          const s = document.getElementById('ns-hero');
          scrollTo(0, (s.offsetHeight - innerHeight) * 0.18);
        });
        await new Promise((r) => setTimeout(r, 900));
        const f2 = path.join(OUT, `floatwin-${TAG}-d-scroll.png`);
        await page.screenshot({ path: f2 });
        console.log(f2);
        // 滚离首屏后再静置 3s：应全部停下
        await page.evaluate(() => scrollTo(0, document.getElementById('ns-essays').offsetTop + innerHeight * 0.6));
        await new Promise((r) => setTimeout(r, 1200));
        console.log('idle 3s (off hero)', JSON.stringify(await idleMetrics(page)));
      }
      await page.close();
    }
  }
  await browser.close();
})();
