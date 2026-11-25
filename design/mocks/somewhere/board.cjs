/* 五份场景并列对比
   node design/mocks/somewhere/board.cjs            → .shots/board-1440.png / board-390.png
   每份场景拍两帧（转完的稳态 + 往里走之后），2×5 拼成一张，看风格是否真的分得开。
   只截已存在的文件：谁的还没好就跳过，不报错。并行时用 PORT=… 换端口。 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright-core');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
const NAME = ['s-A.html', 's-B.html', 's-C.html', 's-D.html', 's-E.html'];

async function board(page, port, W, H) {
  const cells = [];
  for (const f of NAME) {
    if (!fs.existsSync(path.join(__dirname, f))) continue;
    await page.setViewportSize({ width: W, height: H });
    await page.goto(`http://localhost:${port}/somewhere/${f}?arrive=1`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(3600);
    const a = await page.screenshot();
    // 往里走：滚轮推近
    await page.mouse.move(W / 2, H * 0.55);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(2600);
    const b = await page.screenshot();
    cells.push({ f, a: a.toString('base64'), b: b.toString('base64') });
  }
  const html = `<!doctype html><meta charset=utf-8>
  <style>
    body{margin:0;background:#07080d;font:12px/1.4 ui-monospace,monospace;color:#8d88a2}
    .row{display:flex;gap:6px;padding:6px}
    .cell{flex:1;display:flex;flex-direction:column;gap:6px}
    .cell img{width:100%;display:block;border-radius:3px}
    .cap{letter-spacing:.12em}
  </style>
  <div class="row">${cells
    .map(
      (c) => `<div class="cell"><div class="cap">${c.f}</div>
      <img src="data:image/png;base64,${c.a}"><img src="data:image/png;base64,${c.b}"></div>`,
    )
    .join('')}</div>`;
  await page.setViewportSize({ width: W * Math.min(cells.length, 3) + 40, height: H * 2 + 80 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return page.screenshot({ fullPage: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(+(process.env.PORT || 4650));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  for (const [tag, W, H] of [
    ['1440', 720, 450],
    ['390', 390, 560],
  ]) {
    const buf = await board(page, port, W, H);
    const p = path.join(OUT, `board-${tag}.png`);
    fs.writeFileSync(p, buf);
    console.log(p);
  }

  await browser.close();
  await new Promise((r) => server.close(r));
})().catch((e) => {
  console.error('BOARD FAIL', e && e.stack ? e.stack : e);
  process.exit(1);
});
