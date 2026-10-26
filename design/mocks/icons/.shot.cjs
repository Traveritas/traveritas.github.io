/* ─────────────────────────────────────────────────────────────
   图标 mockup 的截图器（各风格通用）
   用法：
     node design/mocks/icons/.shot.cjs <html 路径> <输出 png> [宽=1200] [高=1400] [--full] [--scale=2]

   · puppeteer-core 与 Chrome 都指本机（沿用 design/.shot-styleguide.cjs 的口径）；
   · file:// 直开，mockup 自包含、无需服务器；
   · 等 document.fonts.ready + 两帧，再截，免得字体/首帧抖动。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const pos = argv.filter((a) => !a.startsWith('--'));
const full = flags.includes('--full');
const scaleFlag = flags.find((f) => f.startsWith('--scale='));
const scale = scaleFlag ? Number(scaleFlag.split('=')[1]) : 2;

const src = pos[0];
const out = pos[1];
const width = Number(pos[2] || 1200);
const height = Number(pos[3] || 1400);

if (!src || !out) {
  console.error('用法: node design/mocks/icons/.shot.cjs <html> <out.png> [宽] [高] [--full] [--scale=2]');
  process.exit(1);
}

const srcAbs = path.resolve(src);
const outAbs = path.resolve(out);
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });

  const url = 'file:///' + srcAbs.replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: outAbs, fullPage: full });

  const dims = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
  }));
  await browser.close();

  console.log(`✓ ${path.relative(process.cwd(), outAbs)}  (${width}×${height} @${scale}x${full ? ', 整页' : ''})`);
  console.log(`  页面实际 ${dims.scrollW}×${dims.scrollH}，视口宽 ${dims.clientW}`);
  if (dims.scrollW > dims.clientW + 1) {
    console.log(`  ⚠ 横向溢出 ${dims.scrollW - dims.clientW}px —— 版面被撑出去了，去修`);
  }
  if (!full && dims.scrollH > height + 4) {
    console.log(`  ⚠ 纵向还有 ${dims.scrollH - height}px 没截进来（要全截就加 --full）`);
  }
  if (errs.length) console.log('  ⚠ 页面报错：\n    ' + errs.slice(0, 6).join('\n    '));
  else console.log('  · 无页面报错');
})().catch((e) => {
  console.error('截图失败:', e.message);
  process.exit(1);
});
