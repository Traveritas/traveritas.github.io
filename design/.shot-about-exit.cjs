/* ─────────────────────────────────────────────────────────────
   关于页退场故事板（design/mocks/about-exit/）关键帧截图

   用法：node design/.shot-about-exit.cjs
   输出：design/.shots-about-exit/p-XX.png（各进度整屏）+ strip.png（缩略总览）
   口径同 .shot-nexus-slice.cjs：临时静态服务器 + 本机 Chrome + puppeteer-core（%TEMP%/node_modules）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { execFileSync } = require('child_process');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, '.shots-about-exit');
fs.mkdirSync(OUT, { recursive: true });
const PS = [0, 0.08, 0.2, 0.3, 0.42, 0.52, 0.62, 0.72, 0.82, 1];

const srv = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${srv.address().port}/design/mocks/about-exit/?freeze&clean`, { waitUntil: 'load' });
  const files = [];
  for (const p of PS) {
    // 先滚到钉住区里对应的位置（正文的 sticky 位置要对），再把 p 定死
    await page.evaluate((p) => {
      const runway = document.getElementById('runway'), sheet = document.getElementById('sheet');
      scrollTo(0, runway.offsetTop + sheet.offsetHeight - innerHeight + p * innerHeight * 2.6);
      window.__setP(p);
    }, p);
    await new Promise((r) => setTimeout(r, 120));
    await page.evaluate((p) => window.__setP(p), p);
    const f = path.join(OUT, `p-${String(Math.round(p * 100)).padStart(3, '0')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  await browser.close();
  srv.close();
  execFileSync('magick', ['montage', ...files, '-tile', '5x2', '-geometry', '576x360+3+3', '-background', '#d8dce0', path.join(OUT, 'strip.png')]);
  console.log('errors:', errors);
});
