/* 「命题体」原型截图：node design/mocks/layout-tractatus/.shot.cjs [只拍名字含此串的]
   puppeteer-core 与 Chrome 的定位方式同 design/mocks/hours/.shot-hours.cjs */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4612;
const BASE = `http://127.0.0.1:${PORT}/`;
const only = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = { width: 1440, height: 900, deviceScaleFactor: 1 };
const M = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const scrollTo = (page, y) => page.evaluate((y) => window.scrollTo(0, y), y);
const topOf = (page, sel) => page.evaluate((s) => { const e = document.getElementById(s) || document.querySelector(s); return e.getBoundingClientRect().top + scrollY; }, sel);

const SHOTS = [
  ['01-first-view', D, async (p) => { await sleep(3200); }],
  ['02-mid-unfold', D, async (p) => {
    await sleep(2600);
    const y = await topOf(p, '1'); await scrollTo(p, y - 140); await sleep(300);
    await p.evaluate(() => document.querySelector('[href="#1.1"].pt').click());
    await sleep(520);
  }],
  ['02b-unfold-later', D, async (p) => {
    await sleep(2600);
    const y = await topOf(p, '1'); await scrollTo(p, y - 140); await sleep(300);
    await p.evaluate(() => document.querySelector('[href="#1.1"].pt').click());
    await sleep(1050);
  }],
  ['03-article-open', D, async (p) => {
    await p.goto(BASE + '#1.1', { waitUntil: 'networkidle0' }); await sleep(2400);
  }],
  ['03b-article-reading', D, async (p) => {
    await p.goto(BASE + '#1.1', { waitUntil: 'networkidle0' }); await sleep(1800);
    const y = await topOf(p, '1.12'); await scrollTo(p, y - 260); await sleep(900);
  }],
  ['03c-specimen-depth', D, async (p) => {
    await p.goto(BASE + '#1.21', { waitUntil: 'networkidle0' }); await sleep(1800);
    const y = await topOf(p, '1.22'); await scrollTo(p, y - 200); await sleep(900);
  }],
  ['04-moment', D, async (p) => {
    await p.goto(BASE + '#3.1', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['04b-moment-lacuna', D, async (p) => {
    await p.goto(BASE + '#3.2', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['05-project-deep', D, async (p) => {
    await sleep(2000);
    const y = await topOf(p, '2'); await scrollTo(p, y - 120); await sleep(800);
  }],
  ['05b-project-open', D, async (p) => {
    await p.goto(BASE + '#2.2', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['05c-tide', D, async (p) => {
    await sleep(2000);
    const y = await topOf(p, '2'); await scrollTo(p, y - 640); await sleep(800);
  }],
  ['06-dream-first', D, async (p) => {
    await p.goto(BASE + '?dream', { waitUntil: 'networkidle0' }); await sleep(3200);
    const y = await topOf(p, '1'); await scrollTo(p, y - 300); await sleep(600);
  }],
  ['06b-dream-article', D, async (p) => {
    await p.goto(BASE + '?dream#1.1', { waitUntil: 'networkidle0' }); await sleep(1800);
    const y = await topOf(p, '1.12'); await scrollTo(p, y - 200); await sleep(1400);
  }],
  ['06c-dream-project', D, async (p) => {
    await p.goto(BASE + '?dream#2.1', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['07-mobile-first', M, async (p) => { await sleep(3200); }],
  ['07b-mobile-outline', M, async (p) => {
    await sleep(2400); const y = await topOf(p, '1'); await scrollTo(p, y - 70); await sleep(600);
  }],
  ['07c-mobile-article', M, async (p) => {
    await p.goto(BASE + '#1.1', { waitUntil: 'networkidle0' }); await sleep(1800);
    const y = await topOf(p, '1.11'); await scrollTo(p, y - 120); await sleep(900);
  }],
  ['07d-mobile-moment', M, async (p) => {
    await p.goto(BASE + '#3.1', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['07e-mobile-project', M, async (p) => {
    await p.goto(BASE + '?dream#2.1', { waitUntil: 'networkidle0' }); await sleep(2600);
  }],
  ['09-dawn-end', D, async (p) => { await sleep(2000); const y = await topOf(p, '4'); await scrollTo(p, y - 200); await sleep(800); }],
  ['09b-rem-to-dawn', D, async (p) => { await sleep(2000); const y = await topOf(p, '4'); await scrollTo(p, y - 700); await sleep(800); }],
  ['08-nojs', D, async (p) => {}, { nojs: true }],
];

(async () => {
  const server = await start(PORT);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const errors = [];
  for (const [name, vp, fn, opt = {}] of SHOTS) {
    if (only && !name.includes(only)) continue;
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    if (opt.nojs) await page.setJavaScriptEnabled(false);
    await page.setViewport(vp);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await fn(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!opt.nojs });
    console.log('拍好', name);
    await page.close();
  }
  await browser.close();
  server.close();
  if (errors.length) console.log('报错：\n' + errors.join('\n'));
})();
