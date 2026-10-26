/* 我自己的分区截图器（只为本目录的复核用；交付截图仍走 .shot.cjs）
   用法： node _shot-clip.cjs <html> <outPrefix> <sel1> [sel2 ...]
   每个选择器截一张 <outPrefix>-<n>.png */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const pos = process.argv.slice(2);
const src = pos[0], prefix = pos[1], sels = pos.slice(2);
const srcAbs = path.resolve(src);
fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file:///' + srcAbs.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));
  const dims = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight,
    cw: document.documentElement.clientWidth,
  }));
  for (let i = 0; i < sels.length; i++) {
    const el = await page.$(sels[i]);
    if (!el) { console.log('  ✗ 没找到 ' + sels[i]); continue; }
    const out = path.resolve(prefix + '-' + (i + 1) + '.png');
    await el.screenshot({ path: out });
    console.log('  ✓ ' + sels[i] + ' -> ' + path.basename(out));
  }
  await browser.close();
  console.log('页面 ' + dims.w + '×' + dims.h + '，视口宽 ' + dims.cw);
  if (dims.w > dims.cw + 1) console.log('  ⚠ 横向溢出 ' + (dims.w - dims.cw) + 'px');
  console.log(errs.length ? '  ⚠ 报错：' + errs.slice(0, 5).join(' | ') : '  · 无报错');
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
