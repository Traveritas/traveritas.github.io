/* ─────────────────────────────────────────────────────────────
   晶体页装饰对照（design/mocks/nexus-stage/）截图

   用法：node design/.shot-nexus-stage.cjs
   输出：design/.shots-nexus-stage/<方案>-<醒|梦>.png + sheet.png（总览）
   口径同 .shot-about-exit.cjs：临时静态服务器 + 本机 Chrome + puppeteer-core（%TEMP%/node_modules）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { execFileSync } = require('child_process');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const ROOT = path.join(__dirname, 'mocks', 'nexus-stage');
const OUT = path.join(__dirname, '.shots-nexus-stage');
fs.mkdirSync(OUT, { recursive: true });
const SETS = ['素', '现状', '水面', '切片', '碎片', '百合', '组合'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };

const srv = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const files = [];
  for (const dream of [0, 1]) {
    for (const s of SETS) {
      await page.goto(`${base}?set=${encodeURIComponent(s)}&dream=${dream}&clean`, { waitUntil: 'load' });
      await page.evaluate(() => window.__t(12));
      await new Promise((r) => setTimeout(r, 500));
      const f = path.join(OUT, `${s}-${dream ? '梦' : '醒'}.png`);
      await page.screenshot({ path: f });
      files.push(f);
    }
  }
  execFileSync('magick', ['montage', ...files, '-tile', `${SETS.length}x2`, '-geometry', '480x300+3+3', '-background', '#d8dce0', path.join(OUT, 'sheet.png')]);
  console.log('errors', errs);
  await browser.close();
  srv.close();
});
