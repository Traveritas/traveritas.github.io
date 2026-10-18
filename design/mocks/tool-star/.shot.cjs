/* 星 · 竖排 / 同心轨道 —— 自检与截图
   node design/mocks/tool-star/.shot.cjs  →  design/mocks/tool-star/.shots/   （ONLY=a-go,b-set 只拍一部分） */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [
  ['a-closed', 'v=A'],
  ['a-open', 'v=A&open=1'],
  ['a-go', 'v=A&tool=go'],
  ['a-find', 'v=A&tool=find'],
  ['a-page', 'v=A&ctx=read&tool=page'],
  ['a-set', 'v=A&tool=set&face=dream'],
  ['b-open', 'v=B&open=1'],
  ['b-go', 'v=B&tool=go'],
  ['b-find', 'v=B&tool=find'],
  ['b-page', 'v=B&ctx=read&tool=page'],
  ['b-set', 'v=B&tool=set&face=dream'],
  ['b-mobile', 'v=B&tool=go', { width: 390, height: 844 }],
  ['b-mobile-set', 'v=B&tool=set', { width: 390, height: 844 }],
];
(async () => {
  const only = process.env.ONLY?.split(',');
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/tool-star/`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const errors = [];
  for (const [name, q, vp] of SHOTS) {
    if (only && !only.includes(name)) continue;
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${name} ${r.status()} ${r.url()}`));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, ...vp });
    await page.goto(base + '?' + q, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1300);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await page.close();
  }
  await browser.close();
  server.close();
  console.log(errors.length ? errors.join('\n') : 'no errors');
})();
