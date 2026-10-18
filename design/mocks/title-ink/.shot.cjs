/* 标题取色对照原型 · 截图
   node design/mocks/title-ink/.shot.cjs          → design/mocks/title-ink/.shots/
   ONLY=board-a,board-b,mobile                    只拍一部分 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/title-ink/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (vp) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    await page.setViewport(vp);
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    try {
      await page.waitForFunction('window.__t', { timeout: 20000 });
    } catch {
      const st = await page.evaluate(() => ({ t: window.__t ?? null, ready: document.readyState })).catch(() => null);
      throw new Error(`页面没起来: ${JSON.stringify(st)}\n错误:\n${errors.join('\n') || '(无)'}`);
    }
    await sleep(900);
    return page;
  };
  const shot = async (page, name, sel) => {
    const el = sel ? await page.$(sel) : null;
    await (el || page).screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  if (want('board-a') || want('board-b') || want('board-c')) {
    const p = await fresh({ width: 1440, height: 900, deviceScaleFactor: 1 });
    if (want('board-a')) await shot(p, '01-board-a-field', '#board-a');
    if (want('board-b')) await shot(p, '02-board-b-ramp', '#board-b');
    if (want('board-c')) await shot(p, '03-board-c-frame', '#board-c');
    await p.close();
  }
  if (want('mobile')) {
    const p = await fresh({ width: 390, height: 844, deviceScaleFactor: 2 });
    await shot(p, '04-mobile', '#board-a');
    await p.close();
  }

  await browser.close();
  server.close();
  console.log(errors.length ? `控制台/页面错误 ${errors.length}:\n` + errors.join('\n') : '控制台错误 0');
})();
