/* ─────────────────────────────────────────────────────────────
   「解析度」原型截图：node design/mocks/resolve/.shot-resolve.cjs [名字过滤]
   puppeteer-core 与 Chrome 的找法同 design/mocks/hours/.shot-hours.cjs。
   输出：design/mocks/resolve/.shots/*.png
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = { width: 1440, height: 900, deviceScaleFactor: 1 };
const M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(browser, port, q, vp = D, extra = '') {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('pageerror', (e) => console.log('  pageerror', String(e)));
  page.on('console', (m) => m.type() === 'error' && console.log('  console', m.text()));
  await page.goto(`http://127.0.0.1:${port}/?${q}&arrive=0${extra}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await sleep(250);
  return page;
}

const shots = [
  // 1 · 对焦：列表静止 vs 一张对准（醒 A、梦 A、醒 B；深眠各一张）
  ['list-wake-a-rest', 'mode=a&hour=shallow&state=wake', async (p) => {}],
  ['list-wake-a-focus', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => __res.focus(0))],
  ['list-dream-a-rest', 'mode=a&hour=shallow&state=dream', async (p) => {}],
  ['list-dream-a-focus', 'mode=a&hour=shallow&state=dream', async (p) => p.evaluate(() => __res.focus(0))],
  ['list-wake-b-rest', 'mode=b&hour=shallow&state=wake', async (p) => {}],
  ['list-wake-b-focus', 'mode=b&hour=shallow&state=wake', async (p) => p.evaluate(() => __res.focus(0))],
  ['list-deep-dream-a-focus', 'mode=a&hour=deep&state=dream', async (p) => p.evaluate(() => __res.focus(1))],
  ['list-deep-wake-a-focus', 'mode=a&hour=deep&state=wake', async (p) => p.evaluate(() => __res.focus(1))],
  // 瞬间薄片
  ['cards-wake-a', 'mode=a&hour=shallow&state=wake', async (p) => {
    await p.evaluate(() => { document.querySelector('#moments').scrollIntoView(); __res.focus(6); });
  }],
  ['cards-dream-a', 'mode=a&hour=shallow&state=dream', async (p) => {
    await p.evaluate(() => { document.querySelector('#moments').scrollIntoView(); __res.focus(6); });
  }],
  ['cards-deep-dream-a', 'mode=a&hour=deep&state=dream', async (p) => {
    await p.evaluate(() => { document.querySelector('#moments').scrollIntoView(); __res.focus(4); });
  }],
  ['cards-wake-b', 'mode=b&hour=shallow&state=wake', async (p) => {
    await p.evaluate(() => { document.querySelector('#moments').scrollIntoView(); __res.focus(6); });
  }],
  // 对焦的中间两级（醒 A / 梦 A），用来看步进
  ['steps-dream-a', 'mode=a&hour=shallow&state=dream', async (p) => {
    await p.evaluate(() => { __res.fxs[0].set(2); __res.fxs[1].set(1); __res.fxs[2].set(0); });
  }],
  ['steps-wake-a', 'mode=a&hour=shallow&state=wake', async (p) => {
    await p.evaluate(() => { __res.fxs[0].set(2); __res.fxs[1].set(1); __res.fxs[2].set(0); });
  }],
  // 2 · 长按：定格在几处进度 + 真实按住
  ['press-wake-a-k35', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => __res.ring(560, 520, 0.35))],
  ['press-wake-a-k65', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => __res.ring(560, 520, 0.65))],
  ['press-wake-a-full', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => __res.ring(560, 520, 1))],
  ['press-deep-dream-k55', 'mode=a&hour=deep&state=dream', async (p) => {
    await p.evaluate(() => { document.querySelector('#moments').scrollIntoView(); __res.ring(900, 420, 0.55); });
  }],
  ['press-real', 'mode=a&hour=shallow&state=wake', async (p, name) => {
    await p.mouse.move(1300, 600);
    await p.mouse.down();
    await sleep(650);
    await p.screenshot({ path: path.join(OUT, name + '-mid.png') });
    await p.waitForFunction(() => __res.phase() === 'resolve', { polling: 'raf' });
    await p.screenshot({ path: path.join(OUT, name + '-flip.png') });
    await p.mouse.up();
    await sleep(700);
    // 停稳之后：梦的外围留在像素上
  }],
  // 3 · 底色场
  ['field-shallow-dream', 'mode=a&hour=shallow&state=dream', async (p) => p.evaluate(() => scrollTo(0, 1400))],
  ['field-deep-dream', 'mode=a&hour=deep&state=dream', async (p) => p.evaluate(() => scrollTo(0, 1400))],
  ['field-shallow-wake', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => scrollTo(0, 1400))],
  ['field-deep-wake', 'mode=a&hour=deep&state=wake', async (p) => p.evaluate(() => scrollTo(0, 1400))],
  // 落地
  ['arrive-step', 'mode=a&hour=shallow&state=dream', async (p) => p.evaluate(() => __res.uniform(2.5))],
  // 手机
  ['m-list-dream-a', 'mode=a&hour=shallow&state=dream', async (p) => {}, M],
  ['m-cards-wake-a', 'mode=a&hour=shallow&state=wake', async (p) => p.evaluate(() => scrollTo(0, 1250)), M],
  ['m-cards-deep-dream', 'mode=a&hour=deep&state=dream', async (p) => p.evaluate(() => scrollTo(0, 1250)), M],
  ['m-press-dream', 'mode=b&hour=shallow&state=dream', async (p) => p.evaluate(() => __res.ring(195, 500, 0.5)), M],
];

(async () => {
  const { server, port } = await start(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  try {
    for (const [name, q, act, vp] of shots) {
      if (ONLY && !name.includes(ONLY)) continue;
      const page = await open(browser, port, q, vp || D);
      await act(page, name);
      await sleep(350);
      if (name !== 'press-real') await page.screenshot({ path: path.join(OUT, name + '.png') });
      else await page.screenshot({ path: path.join(OUT, name + '-after.png') });
      console.log('shot', name);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
})();
