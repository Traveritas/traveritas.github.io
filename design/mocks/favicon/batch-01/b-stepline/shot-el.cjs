/* 本目录专用的分区截图器：按 CSS 选择器逐块截，方便 Read 到真实细节。
   用法: node design/mocks/favicon/batch-01/b-stepline/shot-el.cjs <html> <outdir> [--scheme=dark|light] [sel=name]... */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const pos = argv.filter((a) => !a.startsWith('--'));
const schemeFlag = flags.find((f) => f.startsWith('--scheme='));
const scheme = schemeFlag ? schemeFlag.split('=')[1] : null;

const src = pos[0];
const outdir = pos[1];
const targets = pos.slice(2).map((s) => {
  const i = s.indexOf('=');
  return i < 0 ? { sel: s, name: s.replace(/[^\w-]/g, '_') } : { sel: s.slice(0, i), name: s.slice(i + 1) };
});
if (!src || !outdir || !targets.length) {
  console.error('用法: node shot-el.cjs <html> <outdir> [--scheme=dark|light] [sel=name]...');
  process.exit(1);
}
const srcAbs = path.resolve(src);
const outAbs = path.resolve(outdir);
fs.mkdirSync(outAbs, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  if (scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file:///' + srcAbs.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  for (const t of targets) {
    const el = await page.$(t.sel);
    if (!el) { console.log(`✗ ${t.sel} 不存在`); continue; }
    const out = path.join(outAbs, t.name + '.png');
    await el.screenshot({ path: out });
    console.log(`✓ shots/${t.name}.png  ← ${t.sel}`);
  }
  await browser.close();
  console.log(errs.length ? '  ⚠ 页面报错:\n    ' + errs.slice(0, 6).join('\n    ') : '  · 无页面报错');
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
