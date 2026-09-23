/* ─────────────────────────────────────────────────────────────
   Phase 15 · 共用截图脚本（四稿都用它，不要各自改）

   用法：
     node design/mocks/.shot-p15.cjs p16-a-solo p16-a
                                           └ 稿的文件名（不带 .html）
                                                      └ 输出目录名后缀 → design/mocks/.shots-p16-a/
     （p15 的用法照旧：node design/mocks/.shot-p15.cjs p15-b-harmonic p15-b）

   它自带一个以仓库根为 root 的临时静态服务器（随机端口，跑完自动关），
   所以不需要另外起 .serve-*.cjs，也不会和别的会话抢端口。

   矩阵固定 11 张：正文段两种底色各一对、过渡中点、首屏（含纸/撤纸）、
   3× 放大裁片、移动端、整页。全部带 ?freeze=1 取确定帧 + ?ui=0 藏角标。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = process.argv[2];
const TAG = process.argv[3] || FILE;
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
if (!FILE) {
  console.error('usage: node .shot-p15.cjs <mock-basename> [tag] [--only=09]');
  process.exit(1);
}
const OUT = path.join(__dirname, `.shots-${TAG}`);
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (res.writeHead(403), res.end('forbidden'));
      fs.readFile(p, (err, data) => {
        if (err) return (res.writeHead(404, { 'Cache-Control': 'no-store' }), res.end('not found'));
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        res.end(data);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

/* 机位矩阵：name → { w, h, q, dsf, clip, full } */
const SHOTS = [
  { n: '01-sec-deep-wake', w: 1440, h: 900, at: '#ns-essays', q: 'zone=deep&face=wake' },
  { n: '02-sec-deep-dream', w: 1440, h: 900, at: '#ns-essays', q: 'zone=deep&face=dream' },
  { n: '03-sec-deep-mid50', w: 1440, h: 900, at: '#ns-essays', q: 'zone=deep&mix=0.5' },
  { n: '04-sec-light-wake', w: 1440, h: 900, at: '#ns-essays', q: 'zone=light&face=wake' },
  { n: '05-sec-light-dream', w: 1440, h: 900, at: '#ns-essays', q: 'zone=light&face=dream' },
  { n: '06-sec-paper-dream', w: 1440, h: 900, at: '#ns-projects', q: 'zone=paper&face=dream' },
  { n: '07-hero-deep-wake', w: 1440, h: 900, q: 'zone=deep&face=wake' },
  { n: '08-hero-deep-dream-plateoff', w: 1440, h: 900, q: 'zone=deep&face=dream&plate=off' },
  { n: '09-zoom3x-deep-dream', w: 1440, h: 900, dsf: 3, at: '#ns-essays', vclip: { x: 430, y: 250, width: 560, height: 360 }, q: 'zone=deep&face=dream' },
  { n: '10-mobile-deep-dream', w: 390, h: 844, at: '#ns-essays', q: 'zone=deep&face=dream' },
  { n: '11-full-deep-dream', w: 1440, h: 900, full: true, q: 'zone=deep&face=dream' },
];

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/design/mocks/${FILE}.html`;
  const errors = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15-shots-' + TAG)}`,
    ],
  });

  for (const s of SHOTS.filter((x) => !ONLY || x.n.startsWith(ONLY))) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${s.n} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${s.n} console: ${m.text()}`); });
    page.on('requestfailed', (r) => errors.push(`${s.n} reqfail: ${r.url().slice(-60)}`));
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: s.dsf || 1 });
    const url = `${base}?ui=0&freeze=1&${s.q}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 700));
    if (s.at) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      }, s.at);
      await new Promise((r) => setTimeout(r, 900));
    }
    const opts = { path: path.join(OUT, `${s.n}.png`), captureBeyondViewport: false };
    if (s.vclip) {
      // 视口坐标 → 文档坐标：clip 是文档坐标，directly 用视口坐标会跑到首屏去
      const sy = await page.evaluate(() => window.scrollY);
      opts.clip = { ...s.vclip, y: s.vclip.y + sy };
    }
    if (s.clip) opts.clip = s.clip;
    if (s.full) { opts.fullPage = true; delete opts.captureBeyondViewport; }
    await page.screenshot(opts);
    const st = await page.evaluate(() => (window.__p15 ? window.__p15.state() : null));
    console.log(`shot ${s.n}`, st ? JSON.stringify(st) : '(no __p15)');
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`\nout: design/mocks/.shots-${TAG}/`);
  console.log(errors.length ? `PROBLEMS:\n  ${errors.join('\n  ')}` : 'console errors: none');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
