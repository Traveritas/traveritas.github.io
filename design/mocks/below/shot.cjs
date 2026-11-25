/* below · 截图：node shot.cjs "under.html?arrive=300" tag "1000,2500,6500"
   SHOT_W / SHOT_H / PORT 可覆盖。输出到 .shots/，附 console 汇总 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('../somewhere/server.cjs');
const OUT = path.join(__dirname, '.shots');
const W = +(process.env.SHOT_W || 1440), H = +(process.env.SHOT_H || 900);
(async () => {
  const [file, tag, marksS = '2000'] = process.argv.slice(2);
  const marks = marksS.split(',').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(+(process.env.PORT || 4671));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: process.env.RM ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.push(`[${m.type()}] ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[${r.status()}] ${r.url()}`); });
  await page.goto(`http://localhost:${server.address().port}/below/${file}`, { waitUntil: 'load' });
  // CLICKS="x,y@ms;x,y@ms"：按时间点依次点击（每次点击后紧跟一张截图），测交互用
  if (process.env.CLICKS) {
    const shots = [];
    for (const step of process.env.CLICKS.split(';')) {
      const [xy, ms] = step.split('@');
      const [x, y] = xy.split(',').map(Number);
      await page.mouse.move(x, y, { steps: 3 });
      await page.mouse.click(x, y);
      await page.waitForTimeout(+ms || 2500);
      const p = path.join(OUT, `${tag}-${shots.length + 1}.png`);
      await page.screenshot({ path: p }); shots.push(path.basename(p));
    }
    console.log(JSON.stringify({ shots, log }));
    await browser.close(); server.close(); return;
  }
  let prev = 0, prev0 = 0; const shots = [];
  for (const m of marks) {
    await page.waitForTimeout(Math.max(0, m - prev)); prev = m;
    if (process.env.HOLD && !prev0) { const [x, y] = process.env.HOLD.split(',').map(Number); await page.mouse.move(x, y, { steps: 4 }); await page.mouse.down(); prev0 = 1; }
    if (process.env.MOVE) { const [x, y] = process.env.MOVE.split(',').map(Number); await page.mouse.move(x, y, { steps: 4 }); }
    const p = path.join(OUT, `${tag}-${shots.length + 1}.png`);
    await page.screenshot({ path: p }); shots.push(path.basename(p));
  }
  console.log(JSON.stringify({ shots, log }));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
