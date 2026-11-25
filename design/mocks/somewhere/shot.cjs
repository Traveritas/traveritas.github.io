/* somewhere 原型 · 截图（与几份场景无关，吃命令行参数）
   node design/mocks/somewhere/shot.cjs s-a.html out-a            → design/mocks/somewhere/.shots/out-a-1.png …
   node design/mocks/somewhere/shot.cjs s-a.html out-a "2600,4000"  按时间点连拍
   SHOT_W=1440 SHOT_H=900 PORT=4640  可覆盖视口与端口

   每张图都会附一份 console / pageerror 汇总到 .shots/<out>.report.json —— 交付前自检用。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
const W = +(process.env.SHOT_W || 1440);
const H = +(process.env.SHOT_H || 900);

(async () => {
  const file = process.argv[2] || 'index.html';
  const tag = process.argv[3] || path.basename(file, '.html');
  const marks = (process.argv[4] || '2200,6000').split(',').map((n) => +n.trim()).filter(Boolean);
  fs.mkdirSync(OUT, { recursive: true });

  const server = await start(+(process.env.PORT || 4640));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`); });
  page.on('requestfailed', (r) => log.push(`[404?] ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[${r.status()}] ${r.url()}`); });
  await page.goto(`http://localhost:${port}/somewhere/${file}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  let prev = 0;
  const shots = [];
  for (const m of marks) {
    await page.waitForTimeout(Math.max(0, m - prev));
    prev = m;
    const p = path.join(OUT, `${tag}-${shots.length + 1}.png`);
    await page.screenshot({ path: p });
    shots.push(path.basename(p));
  }

  fs.writeFileSync(path.join(OUT, `${tag}.report.json`), JSON.stringify({ file, viewport: [W, H], shots, log }, null, 2));
  console.log(JSON.stringify({ shots, errors: log.length }));
  if (log.length) console.log(log.slice(0, 20).join('\n'));

  await browser.close();
  await new Promise((r) => server.close(r));
})().catch((e) => {
  console.error('SHOT FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
