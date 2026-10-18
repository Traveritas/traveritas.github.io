/* 工具层原型 · 四方向对照页的自检与截图
   node design/mocks/tool-compare/.shot.cjs   →  design/mocks/tool-compare/.shots/
   查三样：控制台 / 页面错误、请求失败、图片是否真的解码出来（naturalWidth > 0）。
   四份原型共 153 帧都从这里引，挂掉一张就是一张坏图，所以这一项必须过。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/tool-compare/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });

  const errors = [];
  const failed = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('requestfailed', (r) => failed.push(`${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  // 懒加载的图：滚到底再回来，逼它们全部解码
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await sleep(1200);

  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('img')].map((i) => ({
      src: i.getAttribute('src'),
      ok: i.complete && i.naturalWidth > 0,
      w: i.naturalWidth,
    })),
  );
  const broken = imgs.filter((i) => !i.ok);

  await page.screenshot({ path: path.join(OUT, '01-top.png') });
  await page.screenshot({ path: path.join(OUT, '00-full.png'), fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '02-m-390.png') });
  const narrow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));

  const lines = [];
  lines.push(`对照页 · 图片 ${imgs.length} 张，解码失败 ${broken.length} 张`);
  for (const b of broken) lines.push(`  坏图 ${b.src}`);
  lines.push(`请求失败 / 4xx+ ：${failed.length}`);
  for (const f of failed) lines.push(`  ${f}`);
  lines.push(`控制台 / 页面错误：${errors.length}`);
  for (const e of errors) lines.push(`  ${e}`);
  lines.push(`390px · scrollWidth=${narrow.sw} innerWidth=${narrow.iw} → ${narrow.sw <= narrow.iw ? '不溢出 OK' : '溢出 FAIL'}`);
  lines.push('');
  lines.push(`图宽抽样（前 6 张）：${imgs.slice(0, 6).map((i) => i.w).join(' · ')}`);

  fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));

  await browser.close();
  server.close();
  process.exit(broken.length || failed.length || errors.length || narrow.sw > narrow.iw ? 1 : 0);
})();
