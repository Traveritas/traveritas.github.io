/* 漫游 / 检索 · 接进正式站之后的截图（对 astro preview 拍）
   npm run build && npx astro preview --port 4399
   node design/mocks/wander/.shot-site.cjs      → design/mocks/wander/.shots-site/ */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const BASE = process.env.BASE || 'http://127.0.0.1:4399';
const OUT = path.join(__dirname, '.shots-site');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (p, { vp = { width: 1440, height: 900, deviceScaleFactor: 1 }, js = true, view } = {}) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${p}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${p}: ${m.text()}`));
    await page.setJavaScriptEnabled(js);
    await page.setViewport(vp);
    await page.evaluateOnNewDocument((v) => {
      try { sessionStorage.setItem('xm-boot-seen', '1'); localStorage.clear(); if (v) localStorage.setItem('wander.view', v); } catch {}
    }, view);
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    await sleep(js ? 3200 : 600);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  let p = await fresh('/articles/');
  await shot(p, '01-articles-grid');
  const v = await p.evaluate(() => { const g = [...window.__wander.GE.values()].find((x) => x.it.scene === 'essay' && x.order === 0); return { x: g.x, y: g.y }; });
  await p.mouse.move(v.x + 40, v.y, { steps: 5 });
  await sleep(600);
  await p.mouse.click(v.x + 40, v.y);
  await sleep(1800);
  await shot(p, '02-read-article');
  console.log('url while reading:', await p.evaluate(() => location.pathname));
  await p.evaluate(() => (document.querySelector('.w-rd-scroll').scrollTop = 700));
  await sleep(300);
  await shot(p, '03-read-article-scrolled');
  await p.keyboard.press('Escape');
  await sleep(1200);
  console.log('url after close:', await p.evaluate(() => location.pathname));
  await shot(p, '04-closed');
  // 项目
  const pv = await p.evaluate(() => { const g = [...window.__wander.GE.values()].find((x) => x.it.scene === 'project' && x.order === 0); return { x: g.x, y: g.y }; });
  await p.mouse.click(pv.x, pv.y);
  await sleep(1800);
  await shot(p, '05-read-project');
  await p.goBack();
  await sleep(1200);
  console.log('url after back:', await p.evaluate(() => location.pathname));
  await p.keyboard.press('v');
  await sleep(2000);
  await shot(p, '06-explore');
  console.log('url in explore:', await p.evaluate(() => location.pathname));
  await p.close();

  p = await fresh('/moments/', { view: 'explore' });
  await shot(p, '07-moments-explore');
  await p.close();

  const mid = await (async () => { const q = await fresh('/moments/'); const id = await q.evaluate(() => window.__wander && [...window.__wander.GE.values()].find((x) => x.it.scene === 'moment' && x.it.kind === 'img').it.ref.id); await q.close(); return id; })();
  p = await fresh(`/moments/#${mid}`);
  await shot(p, '08-moment-by-url');
  await p.close();

  p = await fresh('/projects/', { vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
  await shot(p, '09-m-projects');
  await p.close();

  p = await fresh('/articles/', { js: false });
  await shot(p, '10-nojs-articles');
  await p.close();

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no errors');
})();
