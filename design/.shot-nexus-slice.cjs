/* ─────────────────────────────────────────────────────────────
   NEXUS 入口 · 截面调整版（design/mocks/nexus-slice/）与原版（hero-slice/）对照

   用法：node design/.shot-nexus-slice.cjs
   输出：design/.shots-nexus-slice/
         · old-*.png / new-*.png  同一组状态（醒 / 半梦 / 梦 ×3）的主体特写
         · ctx-*.png              调整版在关于页语境里的整屏
         · seq.json               梦里逐帧推进 20 秒的面数与帧间像素差（查跳面）
   口径同 .shot-p19.cjs：临时静态服务器 + 本机 Chrome + puppeteer-core（%TEMP%/node_modules）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, '.shots-nexus-slice');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = path.join(ROOT, decodeURIComponent((req.url || '/').split('?')[0]));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const STATES = [
  { key: 'a-wake', d: 0, tau: 0 },
  { key: 'b-mid', d: 0.5, tau: 12 },
  { key: 'c-dream', d: 1, tau: 12 },
  { key: 'd-dream', d: 1, tau: 30 },
  { key: 'e-dream', d: 1, tau: 55 },
];

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/design/mocks`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  for (const s of STATES) {
    // 原版：舞台按截图等比缩放，取画布本身
    await page.goto(`${base}/hero-slice/?state=${s.d > 0 ? 'dream' : 'wake'}&d=${s.d}&tau=${s.tau}&yaw=0.4&freeze&plain`, { waitUntil: 'load' });
    await page.evaluate(() => document.getElementById('plain')?.click());
    await page.$('#hero').then((el) => el.screenshot({ path: path.join(OUT, `old-${s.key}.png`) }));
    // 调整版：去掉语境，取门
    await page.goto(`${base}/nexus-slice/?d=${s.d}&tau=${s.tau}&yaw=0.4&noctx&freeze`, { waitUntil: 'load' });
    await page.$('#door').then((el) => el.screenshot({ path: path.join(OUT, `new-${s.key}.png`) }));
  }

  // 关于页语境里的整屏：醒 / 梦
  for (const [key, q] of [['wake', 'd=0'], ['dream', 'd=1&tau=30']]) {
    await page.goto(`${base}/nexus-slice/?${q}&yaw=0.4&freeze`, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, `ctx-${key}.png`) });
  }

  // 逐帧：梦里 20 秒（30fps），再醒回去 3 秒
  await page.goto(`${base}/nexus-slice/?d=1&seq&noctx`, { waitUntil: 'load' });
  const seq = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 600; i++) out.push(window.__step(1 / 30));
    document.getElementById('toWake').click();
    for (let i = 0; i < 90; i++) out.push(window.__step(1 / 30));
    return out;
  });
  const mean = seq.slice(1).map((f) => f.mean);
  const sorted = [...mean].sort((a, b) => a - b);
  const top = seq.map((f, i) => ({ i, ...f })).slice(1).sort((a, b) => b.mean - a.mean).slice(0, 8);
  const faceChanges = seq.filter((f, i) => i > 0 && f.faces !== seq[i - 1].faces).length;
  const report = {
    errors,
    frames: seq.length,
    faceRange: [Math.min(...seq.map((f) => f.faces)), Math.max(...seq.map((f) => f.faces))],
    faceChanges,
    diffMedian: sorted[Math.floor(sorted.length / 2)],
    diffP99: sorted[Math.floor(sorted.length * 0.99)],
    diffMax: sorted[sorted.length - 1],
    worst: top,
  };
  fs.writeFileSync(path.join(OUT, 'seq.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, worst: top.slice(0, 4) }, null, 1));

  await browser.close();
  server.close();
})();
