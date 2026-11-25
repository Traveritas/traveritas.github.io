/* edge-flora 原型截图：node design/mocks/edge-flora/.shot.cjs */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), '@playwright', 'mcp', 'node_modules', 'playwright-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(ROOT, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'] });
  for (const v of ['D', 'E', 'F']) {
    for (const face of ['wake', 'dream']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://127.0.0.1:${port}/?v=${v}&face=${face}&bare=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: path.join(OUT, `${v}-${face}.png`) });
      console.log('ok', `${v}-${face}`);
      await page.close();
    }
  }
  for (const v of ['D', 'E']) {
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto(`http://127.0.0.1:${port}/?v=${v}&face=dream&bare=1&mobile=1`, { waitUntil: 'networkidle' });
    await m.waitForTimeout(1400);
    await m.screenshot({ path: path.join(OUT, `${v}-mobile-dream.png`) });
    console.log('ok', `${v}-mobile-dream`);
    await m.close();
  }
  await browser.close();
  server.close();
});