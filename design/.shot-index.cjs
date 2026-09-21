// 用 puppeteer-core 连 Edge 渲染 design/index.html 并按视口切块出 PNG（视觉评审用）
const path = require('path');
const fs = require('fs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(require('os').tmpdir(), 'node_modules', 'puppeteer-core'));

(async () => {
  const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(require('os').tmpdir(), 'edge-meta-shots')}`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:8399/index.html?v=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 800));
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log('page height', total);
  const step = 1150, overlap = 80;
  let i = 0;
  for (let y = 0; y < total; y += step) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await new Promise(r => setTimeout(r, 150));
    const out = path.join(__dirname, 'index-pages', `page-${String(i).padStart(2, '0')}.png`).replace(/\\/g, '/');
    fs.mkdirSync(path.join(__dirname, 'index-pages'), { recursive: true });
    await page.screenshot({ path: out, clip: { x: 0, y, width: 1440, height: Math.min(step + overlap, total - y) } });
    console.log('shot', i, 'y=', y);
    i++;
  }
  await browser.close();
})();
