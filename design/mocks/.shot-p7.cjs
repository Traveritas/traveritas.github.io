// p7-vestibule.html 自验收截图（puppeteer-core 连 Chrome）
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join(require('os').tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'file:///' + path.resolve(__dirname, 'p7-vestibule.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '_shots-p7');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(require('os').tmpdir(), 'chrome-p7-shots')}`],
  });
  const errors = [];
  async function newPage(w, h, rm) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    if (rm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(FILE + '?v=' + Date.now() + Math.random(), { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1400));
    return page;
  }
  async function shot(page, name) {
    const out = path.join(OUT, name + '.png').replace(/\\/g, '/');
    await page.screenshot({ path: out });
    console.log('shot', name);
  }
  async function jump(page, sel, off) {
    await page.evaluate((s, o) => {
      const el = document.querySelector(s);
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (o || 60));
    }, sel, off || 60);
    await new Promise(r => setTimeout(r, 1500));
  }

  /* 桌面 */
  const d = await newPage(1440, 900, false);
  await shot(d, 'd1-hero');
  await jump(d, '#model', 40); await shot(d, 'd2-model');
  await jump(d, '#h-projects', 70); await shot(d, 'd3-projects');
  await jump(d, '#h-essays', 70); await shot(d, 'd4-essays');
  await jump(d, '#h-about', 70); await shot(d, 'd5-door');
  await jump(d, '#h-lab', 70); await shot(d, 'd6-lab');
  /* 交互：取票 */
  await d.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 600));
  await d.click('#dispense');
  await new Promise(r => setTimeout(r, 1300));
  await shot(d, 'd7-ticket');
  /* 交互：模型悬停 */
  await jump(d, '#model', 40);
  const roomBox = await d.evaluate(() => {
    const r = document.querySelector('.room').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await d.mouse.move(roomBox.x, roomBox.y);
  await new Promise(r => setTimeout(r, 700));
  await shot(d, 'd8-room-hover');
  /* 全页概览（先强制显影，模拟滚完全页；真实浏览的逐厅显影已在 d3–d6 验证） */
  await d.evaluate(() => window.scrollTo(0, 0));
  await d.evaluate(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')));
  await new Promise(r => setTimeout(r, 700));
  await d.screenshot({ path: path.join(OUT, 'd0-full.png').replace(/\\/g, '/'), fullPage: true });
  console.log('shot d0-full');
  await d.close();

  /* 移动端 */
  const m = await newPage(390, 844, false);
  await shot(m, 'm1-hero');
  await jump(m, '#model', 30); await shot(m, 'm2-model');
  await jump(m, '#h-essays', 60); await shot(m, 'm3-essays');
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.evaluate(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')));
  await new Promise(r => setTimeout(r, 700));
  await m.screenshot({ path: path.join(OUT, 'm0-full.png').replace(/\\/g, '/'), fullPage: true });
  console.log('shot m0-full');
  await m.close();

  /* 减动效 */
  const rm = await newPage(1440, 900, true);
  await shot(rm, 'r1-hero');
  await rm.close();

  await browser.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'console errors: none');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
