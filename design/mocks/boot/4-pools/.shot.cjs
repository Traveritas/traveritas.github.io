/* 开屏 mock 4 · 三池先聚，线后到 —— 截图
   node design/mocks/boot/4-pools/.shot.cjs → design/mocks/boot/4-pools/.shots/

   全程走页面暴露的 window.__boot（时间轴写在 JS 里，seek 就是确定地重画一帧）： */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOTAL_MS = 2080;

/* 帧名 → 毫秒（与 NOTES.md 的时间轴一一对应） */
const FRAMES = [
  ['00-seep', 220],      // 三池刚起：各自一小胚，轮廓硬，色已经分得开
  ['01-gather', 600],    // 聚到一半：边被噪声揉得很毛，还不成形
  ['02-pools', 1150],    // 三池站好、光也收住了，线还没到
  ['03-line', 1560],     // 线切进来，两侧刚有一点明暗差
  ['04-name', 1780],     // 名字对上焦、栏头挂到线下
  ['05-hand', 1980],     // 交接中：canvas 正在溶回 .h-flow
  ['06-end', TOTAL_MS],  // 落地：就是假首页静置的样子
];

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (qs = '', vp = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${qs || 'main'}: ${e.message}`));
    page.on('console', (m) => {
      // 唯一的噪音是浏览器自己来要 /favicon.ico（静态服务没挂图标），不算页面报错
      if (m.type() !== 'error') return;
      const loc = (m.location() && m.location().url) || '';
      if (/favicon/i.test(loc) || /favicon/i.test(m.text())) return;
      errors.push(`${qs || 'main'}: ${m.text()} @ ${loc}`);
    });
    await page.goto(URL + qs, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  /* 桌面：逐帧 */
  const d = await fresh();
  for (const [name, ms] of FRAMES) await at(d, ms, name);
  // 越界保护：seek 超过总长应当停在落地帧，不该崩
  await at(d, TOTAL_MS + 4000, '07-past-end');
  await d.close();

  /* 手机：中段 + 落地 */
  const m = await fresh('', { width: 390, height: 844 });
  await at(m, 600, 'm-01-gather');
  await at(m, 1560, 'm-02-line');
  await at(m, TOTAL_MS, 'm-03-end');
  await m.close();

  await browser.close();
  server.close();
  if (errors.length) {
    console.log('--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('无页面报错');
  console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  console.log(`${files.length} 张：${files.join(' ')}`);
})();