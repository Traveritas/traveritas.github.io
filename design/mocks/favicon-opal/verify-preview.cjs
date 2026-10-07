const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

async function main() {
  const { candidates } = await import('./candidates-round4.mjs');
  const { candidates: originals } = await import('./candidates-round3.mjs');
  for (const [id, source] of [['A0','02'],['B0','04'],['C0','05']]) {
    if (candidates.find(c => c.id === id).svg !== originals.find(c => c.id === source).svg) throw new Error(`Original changed: ${id}`);
  }
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--disable-gpu'],
  });
  const issues = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => issues.push(error.message));
    page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
    await page.setViewport({ width: 1440, height: 1080, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../favicon-opal-preview.html')).href, { waitUntil: 'networkidle0' });
    const desktop = await page.evaluate(async () => {
      await Promise.all([...document.images].map(img => img.decode()));
      return {
        candidates: document.querySelectorAll('.candidate').length,
        images: document.images.length,
        brokenImages: [...document.images].filter(img => !img.complete || !img.naturalWidth).length,
        nativeSizes: [...document.querySelectorAll('.fake-tab .icon')].map(img => [img.getBoundingClientRect().width, img.getBoundingClientRect().height]),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    if (desktop.candidates !== 15 || desktop.brokenImages || desktop.overflow || desktop.nativeSizes.some(s => s[0] !== 16 || s[1] !== 16)) throw new Error(JSON.stringify(desktop));
    await page.screenshot({ path: path.resolve(__dirname, '../favicon-opal-preview.png'), fullPage: true });
    await page.click('[data-id="A1"] .choose');
    const selection = await page.evaluate(() => ({title: document.title, selected: document.querySelector('[aria-checked="true"]').dataset.id, favicon: document.querySelector('#preview-favicon').href === document.querySelector('#download').href}));
    if (selection.selected !== 'A1' || !selection.favicon || !selection.title.startsWith('A1')) throw new Error('Selection did not update browser favicon, title, and download');
    await page.focus('[data-id="A1"]');
    await page.keyboard.press('ArrowRight');
    if (await page.$eval('[aria-checked="true"]', el => el.dataset.id) !== 'A2') throw new Error('Keyboard selection failed');
    await page.click('#reset');
    await page.click('#native-only');
    await page.screenshot({ path: path.resolve(__dirname, '../favicon-opal-native.png'), fullPage: true });
    await page.click('#silhouette');
    await page.screenshot({ path: path.resolve(__dirname, 'silhouettes.png'), fullPage: true });
    await page.click('#reset');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      nativeSizes: [...document.querySelectorAll('.fake-tab .icon')].map(img => [img.getBoundingClientRect().width, img.getBoundingClientRect().height]),
    }));
    if (mobile.overflow || mobile.nativeSizes.some(s => s[0] !== 16 || s[1] !== 16)) throw new Error(JSON.stringify(mobile));
    await page.screenshot({ path: path.resolve(__dirname, 'mobile.png'), fullPage: true });
    if (issues.length) throw new Error(issues.join('\n'));
    const report = { desktop, mobile, selection, issues, checks: ['15 complete candidates', '3 originals preserved exactly', '16px on desktop and mobile', 'selection updates favicon and download', 'arrow-key selection', 'no horizontal overflow', 'no page or console errors'] };
    fs.writeFileSync(path.resolve(__dirname, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks, candidates: desktop.candidates, brokenImages: desktop.brokenImages, issues }, null, 2));
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
