/* 临时排查：dev server（4321）上 /styleguide/ 的样式到底有没有注入。
   用法：node design/.probe-dev.cjs [url] */
const path = require('path');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const URL = process.argv[2] || 'http://localhost:4321/styleguide/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  const log = { console: [], pageerror: [], failed: [], status: [] };
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.console.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => log.pageerror.push(String(e).slice(0, 400)));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) log.status.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  log.page = await page.evaluate(() => {
    const rules = [];
    let sheets = 0;
    let unreadable = 0;
    for (const s of document.styleSheets) {
      sheets++;
      try {
        for (const r of s.cssRules) rules.push(r.selectorText || r.cssText.slice(0, 60));
      } catch {
        unreadable++;
      }
    }
    const hits = (sel) => rules.filter((t) => typeof t === 'string' && t.includes(sel));
    const body = getComputedStyle(document.body);
    return {
      title: document.title,
      sheets,
      unreadable,
      rules: rules.length,
      inlineStyles: [...document.head.querySelectorAll('style')].map((s) => s.textContent.length),
      hasFloatRule: hits('.float-ch').length,
      hasSheenRule: hits('.sheen-run').length,
      hasMdRule: hits('.md h2').length,
      bodyBg: body.backgroundColor,
      bodyFont: body.fontFamily.slice(0, 60),
      tokens: getComputedStyle(document.documentElement).getPropertyValue('--amber').trim(),
      specCount: document.querySelectorAll('.sg-spec').length,
      sheenRuns: document.querySelectorAll('.sheen-run').length,
      sheenBg: (() => {
        const el = document.querySelector('#sg-inline-fx .sheen-run');
        return el ? getComputedStyle(el).backgroundImage.slice(0, 60) : null;
      })(),
      overlay: document.querySelector('vite-error-overlay') ? 'vite-error-overlay 在页面上' : null,
    };
  });

  console.log(JSON.stringify(log, null, 2));

  // 顺手留一张实物截图：dev 上这一格长什么样
  const fs = require('fs');
  const out = path.join(__dirname, '.shots-inline-fx');
  fs.mkdirSync(out, { recursive: true });
  const card = await page.$('#sg-inline-fx');
  if (card) await card.screenshot({ path: path.join(out, 'dev.png') });

  await browser.close();
})().catch((e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
