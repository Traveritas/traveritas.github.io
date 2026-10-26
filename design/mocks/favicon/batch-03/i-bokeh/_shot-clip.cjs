/* 一次性分区截图器（本目录用，与 .shot.cjs 同一 Chrome 口径） */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const [src, outPrefix, ...sels] = process.argv.slice(2);
const srcAbs = path.resolve(src);
fs.mkdirSync(path.dirname(path.resolve(outPrefix + '-1.png')), { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file:///' + srcAbs.replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise((r) => setTimeout(r, 700));
  for (let i = 0; i < sels.length; i++) {
    const el = await page.$(sels[i]);
    if (!el) { console.log('缺元素 ' + sels[i]); continue; }
    const out = path.resolve(`${outPrefix}-${i + 1}.png`);
    await el.screenshot({ path: out });
    console.log('✓ ' + path.basename(out) + '  ' + sels[i]);
  }
  if (errs.length) console.log('页面报错: ' + errs.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
