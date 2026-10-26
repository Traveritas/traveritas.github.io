/* 只属于 a-nightlight 目录的细节放大截图器（区域裁剪）。
   用法：node crop.cjs <html> <out.png> <css选择器> [padding=14] [scale=3] */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const [src, out, sel, pad = '14', scale = '3'] = process.argv.slice(2);
if (!src || !out || !sel) { console.error('用法: node crop.cjs <html> <out.png> <selector> [pad] [scale]'); process.exit(1); }

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: Number(scale) });
  await page.goto('file:///' + path.resolve(src).replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise((r) => setTimeout(r, 420));
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  }, sel);
  if (!box) { console.error('找不到元素:', sel); process.exit(1); }
  const P = Number(pad);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: path.resolve(out), clip: {
    x: Math.max(0, box.x - P), y: Math.max(0, box.y - P),
    width: box.width + P * 2, height: box.height + P * 2,
  } });
  await browser.close();
  console.log('✓ ' + out + '  ' + Math.round(box.width) + '×' + Math.round(box.height) + ' @' + scale + 'x');
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
