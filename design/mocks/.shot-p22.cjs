const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(__dirname, '.shots-p22');
fs.mkdirSync(OUT, { recursive: true });
const PAGE = 'p22-highkey-album.html';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) && !p.includes('node_modules')) {
    const nodeModPath = path.resolve(ROOT, '..', '..', decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
    if (fs.existsSync(nodeModPath) && fs.statSync(nodeModPath).isFile()) {
      res.writeHead(200, { 'Content-Type': types[path.extname(nodeModPath)] || 'application/octet-stream' });
      return fs.createReadStream(nodeModPath).pipe(res);
    }
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(p, (err, data) => {
    if (err) {
      const repoPath = path.resolve(ROOT, '..', '..', decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''));
      if (fs.existsSync(repoPath) && fs.statSync(repoPath).isFile()) {
        res.writeHead(200, { 'Content-Type': types[path.extname(repoPath)] || 'application/octet-stream' });
        return fs.createReadStream(repoPath).pipe(res);
      }
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/${PAGE}`;
  console.log(`Server listening on ${base}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  async function snap(name, targetSel, palette = 'mineral', blockStyle = 'live') {
    await page.goto(`${base}`, { waitUntil: 'networkidle2' });
    await page.evaluate((pal, bStyle) => {
      if (window.setPalette) window.setPalette(pal);
      if (window.setBlockStyle) window.setBlockStyle(bStyle);
    }, palette, blockStyle);
    await wait(200);

    if (targetSel) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'instant' });
      }, targetSel);
      await wait(500);
    }

    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`Captured: ${name}.png`);
  }

  // 1. Current Live block style on 2B (Brown --ghost-ink) - The issue user noticed
  await snap('2b-essays-live', '#ns-essays', 'mineral', 'live');
  await snap('2b-projects-live', '#ns-projects', 'mineral', 'live');

  // 2. Recommended Frosted White block style on 2B (Pure frosted watermark)
  await snap('2b-essays-white', '#ns-essays', 'mineral', 'white');
  await snap('2b-projects-white', '#ns-projects', 'mineral', 'white');

  // 3. Cold Ink Whisper block style on 2B (Faint mineral ink)
  await snap('2b-essays-ink', '#ns-essays', 'mineral', 'ink');
  await snap('2b-projects-ink', '#ns-projects', 'mineral', 'ink');

  await browser.close();
  server.close();
  console.log('Done capturing option comparison screenshots.');
  process.exit(0);
})();
