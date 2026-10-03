const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', 'design', '.shots-hero');
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

async function run() {
  const { server, port } = await serve();
  console.log(`Server on :${port}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
    headless: 'new',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/mock/hero-crystalloid/`, { waitUntil: 'networkidle0' });

  // wait 1s for WebGL init and render
  await new Promise((r) => setTimeout(r, 1200));

  const variants = ['octahedron', 'asymmetric', 'lenses', 'petal'];

  for (const v of variants) {
    // switch variant
    await page.evaluate((variantKey) => {
      const btn = document.querySelector(`.btn-var[data-var="${variantKey}"]`);
      if (btn) btn.click();
      const wakeBtn = document.getElementById('btn-wake');
      if (wakeBtn) wakeBtn.click();
    }, v);

    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT, `${v}-wake.png`) });
    console.log(`Saved ${v}-wake.png`);

    // set dream to 1
    await page.evaluate(() => {
      const dreamBtn = document.getElementById('btn-dream');
      if (dreamBtn) dreamBtn.click();
    });

    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, `${v}-dream.png`) });
    console.log(`Saved ${v}-dream.png`);
  }

  await browser.close();
  server.close();
  console.log('All screenshots done!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
