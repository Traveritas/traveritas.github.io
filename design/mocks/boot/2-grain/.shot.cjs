/* 开屏 mock 2「从粗到细」截图
   node design/mocks/boot/2-grain/.shot.cjs  → design/mocks/boot/2-grain/.shots/

   开屏是时间驱动的，截图必须确定：走页面自己暴露的 window.__boot
     pause() / seek(ms) / resume()。
   每 seek 之后等两帧再截。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 帧名 → 毫秒。四级细化的落点 + 交接 + 终帧 */
const FRAMES = [
  ['00-start', 0], //   粗起：48px 一格、3 阶
  ['01-lv1', 330], //   ① 24px 一格、6 阶
  ['02-lv2', 600], //   ② 13px 一格、10 阶
  ['03-lv3', 940], //   ③ 8px 一格、16 阶
  ['04-lv4', 1300], //  ④ 5px 一格、26 阶（= 首页 GRAIN），字的入场已经过半
  ['05-handover', 1700], // 画布开始淡出，字的入场基本到位
  ['06-end', 2020], //  终帧：必须 = 首页静置
];

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (qs = '', vp = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${qs || vp.width}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs || vp.width}: ${m.text()}`));
    await page.goto(URL + qs, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(140);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  /* 桌面：逐帧 */
  const d = await fresh();
  for (const [name, ms] of FRAMES) await at(d, ms, name);
  /* 顺便量一下每帧重画一次的代价 */
  const cost = await d.evaluate(() => {
    const out = [];
    for (const ms of [0, 330, 600, 940, 1300]) {
      const a = performance.now();
      for (let i = 0; i < 10; i++) window.__boot.seek(ms + i);
      out.push({ ms, per: +((performance.now() - a) / 10).toFixed(2) });
    }
    return out;
  });
  await d.close();

  /* 手机：粗起 / 中段 / 终帧 */
  const m = await fresh('', { width: 390, height: 844 });
  await at(m, FRAMES[0][1], 'm-00-start');
  await at(m, FRAMES[2][1], 'm-02-lv2');
  await at(m, FRAMES[4][1], 'm-04-lv4');
  await at(m, FRAMES[6][1], 'm-06-end');
  await m.close();

  /* reduced-motion：必须直接落首页，不许留幕 */
  const r = await fresh('', { width: 1280, height: 800 });
  await r.emulateMedia({ reducedMotion: 'reduce' });
  await r.reload({ waitUntil: 'networkidle' });
  await r.evaluate(() => document.fonts.ready);
  await sleep(300);
  await r.screenshot({ path: path.join(OUT, 'r-reduced-motion.png') });
  await r.close();

  await browser.close();
  server.close();

  console.log('每帧重画（含 fbm + 上色 + 量化 + putImageData）：');
  for (const c of cost) console.log(`  t=${c.ms}ms → ${c.per}ms/次`);
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
})();