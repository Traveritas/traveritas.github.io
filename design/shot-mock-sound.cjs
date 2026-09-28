const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '.shots-mock-sound');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const url = `http://127.0.0.1:${port}/mock/sound/`;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));

    // 1. 醒面全景
    await page.screenshot({ path: path.join(OUT, '01-wake-overview.png'), fullPage: false });

    // 2. 方案栅格特写
    const gridEl = await page.$('.mock-grid');
    if (gridEl) {
      await page.evaluate(() => {
        const el = document.querySelector('.mock-grid');
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo(0, top);
        }
      });
      await new Promise((r) => setTimeout(r, 400));
      await gridEl.screenshot({ path: path.join(OUT, '02-wake-grid.png') });
    }

    // 3. 悬停展开方案 A
    const slitBtn = await page.$('.scheme-card[data-scheme="a"] .snd-slit');
    if (slitBtn) {
      await slitBtn.hover();
      await new Promise((r) => setTimeout(r, 500));
      await gridEl.screenshot({ path: path.join(OUT, '03-wake-slit-hover.png') });
    }

    // 4. 切换到梦面
    await page.click('[data-face-toggle="dream"]');
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT, '04-dream-overview.png'), fullPage: false });
    if (gridEl) {
      await gridEl.screenshot({ path: path.join(OUT, '05-dream-grid.png') });
    }

    // 5. 左下角常驻特写
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({
      path: path.join(OUT, '06-dock-corner-dream.png'),
      clip: { x: 0, y: 900 - 160, width: 220, height: 160 },
    });

    console.log('Screenshots generated successfully at:', OUT);
  } catch (err) {
    console.error('Error taking screenshots:', err);
  } finally {
    await browser.close();
    server.close();
  }
})();
