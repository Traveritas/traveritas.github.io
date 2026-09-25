/* ─────────────────────────────────────────────────────────────
   Cursor 轮 · 共用截图脚本（四稿都用它，不要各自改）

   用法：
     node design/mocks/.shot-cursor.cjs <html文件名> <tag> [shot名=查询串 ...]
                                          │            │
                                          │            └ 输出目录名后缀 → design/mocks/.shots-cursor-<tag>/
                                          └ 稿的文件名（不带 .html）

   例：
     node design/mocks/.shot-cursor.cjs cursor-shell shell
     node design/mocks/.shot-cursor.cjs cursor-c-thread c-thread "05-off=?ui=0&cursor=off"
     node design/mocks/.shot-cursor.cjs cursor-c-thread c-thread "06-link=?ui=0@#cursor-lab&probe=1"

   默认四张（不传 shot 参数时）：
     01-home-wake  = ?freeze=1&mix=1&ui=0
     02-home-dream = ?freeze=1&mix=0&ui=0
     03-lab        = ?ui=0           （滚到 #cursor-lab）
     04-probe      = ?probe=1        （先移动一次鼠标，让门控与热点读数成形）

   查询串可加 "@选择器" 后缀指定滚动目标：`03-lab=?ui=0@#cursor-lab`。
   输出：design/mocks/.shots-cursor-<tag>/*.png + report.json
         （report.json 含每张图的 window.__cur?.report()、body class、计算后的 cursor）
   跑完打印控制台错误与页面错误两条计数（error 必须为 0）。

   它自带一个以仓库根为 root 的临时静态服务器（随机端口，跑完自动关），
   所以不需要另外起 .serve-cursor.cjs，也不会和别的会话抢端口。
   viewport 固定 1440×900（沿用既有 .shot-p15.cjs 的做法）。
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
const EXTRA = process.argv.slice(4);
if (!FILE) {
  console.error('usage: node .shot-cursor.cjs <mock-basename> [tag] [shot名=查询串 ...]');
  process.exit(1);
}
const OUT = path.join(__dirname, `.shots-cursor-${TAG}`);
fs.mkdirSync(OUT, { recursive: true });

/* 机位矩阵：n → { q: 查询串（含前导 ?）, at: 滚动选择器（可选） } */
function parseShot(spec) {
  const i = spec.indexOf('=');
  if (i < 0) return null;
  const n = spec.slice(0, i);
  let q = spec.slice(i + 1);
  let at;
  const j = q.indexOf('@');
  if (j >= 0) {
    at = q.slice(j + 1);
    q = q.slice(0, j);
  }
  if (!q.startsWith('?')) q = '?' + q;
  return { n, q, at };
}

const SHOTS = EXTRA.length
  ? EXTRA.map(parseShot).filter(Boolean)
  : [
      { n: '01-home-wake', q: '?freeze=1&mix=1&ui=0' },
      { n: '02-home-dream', q: '?freeze=1&mix=0&ui=0' },
      { n: '03-lab', q: '?ui=0', at: '#cursor-lab' },
      { n: '04-probe', q: '?probe=1' },
    ];
if (!SHOTS.length) {
  console.error('no shot parsed');
  process.exit(1);
}

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
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/favicon.ico') return (res.writeHead(204), res.end()); // 免得算进控制台错误
      const p = path.join(ROOT, urlPath);
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

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/design/mocks/${FILE.replace(/\.html$/, '')}.html`;
  const consoleErrors = [];
  const pageErrors = [];
  const reqFails = [];
  const reports = {};

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      `--user-data-dir=${path.join(os.tmpdir(), 'chrome-cursor-shots-' + TAG)}`,
    ],
  });

  for (const s of SHOTS) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${s.n} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${s.n} console: ${m.text()}`); });
    page.on('requestfailed', (r) => reqFails.push(`${s.n} reqfail: ${r.url().slice(-70)}`));

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + s.q, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 700));

    if (s.at) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      }, s.at);
      await new Promise((r) => setTimeout(r, 900));
    }

    // 每个机位都先移动一次真实鼠标（pointerType=mouse）：四重门控要靠它才会开，
    // 两张静止帧才看得见光标本身，不必再靠 ?probe=1 把自检面板带进判读帧。
    // 终点固定 (760,470)，四稿的静止帧因此落在同一位置，可横向对读。
    await page.mouse.move(620, 380, { steps: 12 });
    await page.mouse.move(760, 470, { steps: 12 });
    await new Promise((r) => setTimeout(r, s.q.includes('freeze=1') ? 700 : 400));

    await page.screenshot({ path: path.join(OUT, `${s.n}.png`), captureBeyondViewport: false });

    const st = await page.evaluate(() => {
      const b = getComputedStyle(document.body);
      return {
        shell: window.__shell ? window.__shell.state() : null,
        probe: window.__cur ? window.__cur.report() : null,
        bodyClass: document.body.className,
        computedCursor: b.cursor,
        htmlCursorNone: getComputedStyle(document.documentElement).cursor === 'none',
      };
    });
    reports[s.n] = { url: s.q, ...st };
    console.log(
      `shot ${s.n}`,
      st.shell ? JSON.stringify(st.shell) : '(no __shell)',
      `| body="${st.bodyClass || '(empty)'}" cursor=${st.computedCursor}`,
      st.probe ? `| probe rafTotal=${st.probe.rafTotal} raf5s=${st.probe.rafLast5s} slotEl=${st.probe.slotElements}` : '',
    );
    await page.close();
  }

  // 合并写入：重跑个别机位时不会抹掉既有读数（各稿 notes 的实测证据依赖它）
  const rp = path.join(OUT, 'report.json');
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(rp, 'utf8'));
  } catch {
    /* 首次运行 */
  }
  fs.writeFileSync(rp, JSON.stringify({ ...prev, ...reports }, null, 2));
  await browser.close();
  server.close();

  console.log(`\nout: design/mocks/.shots-cursor-${TAG}/  (+ report.json)`);
  console.log(`console errors: ${consoleErrors.length} · page errors: ${pageErrors.length} · failed requests: ${reqFails.length}`);
  const problems = [...consoleErrors, ...pageErrors, ...reqFails];
  if (problems.length) console.log(`PROBLEMS:\n  ${problems.join('\n  ')}`);
  if (consoleErrors.length || pageErrors.length) process.exitCode = 1;
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
