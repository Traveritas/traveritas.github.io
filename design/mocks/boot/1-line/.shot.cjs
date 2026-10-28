/* 开屏 mock 1 · 一线先醒 —— 截图
   node design/mocks/boot/1-line/.shot.cjs → design/mocks/boot/1-line/.shots/

   时间轴写在页面 JS 里，window.__boot.seek(ms) 是确定的重画。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOTAL_MS = 2000;
/* 帧名 → 毫秒：起笔 / 一线 / 漫开 / 对焦 / 三扇门 / 落地 */
const FRAMES = [
  ['00-seed', 120],      // 一粒光在轴线上
  ['01-line-going', 520],// 线在走，三池还没起来
  ['02-wash', 900],      // 三池漫开、线还在走
  ['03-focus', 1250],    // 字对上焦，栏头挂上
  ['04-pull', 1700],     // 收尾：时刻 / 出口 / 下沉
  ['05-end', TOTAL_MS],  // 落地：假首页静置的样子
];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (vp, dsf = 1) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dsf });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(100);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  const d = await fresh({ width: 1440, height: 900 });
  for (const [name, ms] of FRAMES) await at(d, ms, name);
  await d.close();

  const m = await fresh({ width: 390, height: 844 }, 2);
  await at(m, 120, 'm-00-seed');
  await at(m, 900, 'm-01-wash');
  await at(m, TOTAL_MS, 'm-02-end');
  await m.close();

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
  console.log(`${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} 张`);
})();