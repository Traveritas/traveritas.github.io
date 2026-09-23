/* 帧时间归因实验室：在同一页上就地改 CSS，量 8× 降速下各变体的帧时间，
   找出「有层 300–650% 于无层」到底是哪一项造成的。
   用法：node design/mocks/.p16-a-perf-lab.cjs
   每一档：加载 → 注入覆盖样式 → 挂 8× 降速 → 页内 rAF 跑 4s → 报 p50/p95/帧数 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p16-a-solo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (res.writeHead(403), res.end('forbidden'));
      fs.readFile(p, (err, data) => {
        if (err) return (res.writeHead(404, { 'Cache-Control': 'no-store' }), res.end('not found'));
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

/* 变体：name → 注入的 CSS（同名的 @keyframes 后者胜） */
const V = [
  ['A 交付态（现状）', ''],
  ['B 关掉 .sq 的 animation（只剩静态散位）', '.sq{animation:none!important}'],
  ['C keyframes 不引用任何 var（常量幅度 ±6px）',
    '@keyframes sq-solo{from{transform:translate3d(calc(var(--sx)*var(--sq-k) - 6px),calc(var(--sy)*var(--sq-k) - 6px),0)}to{transform:translate3d(calc(var(--sx)*var(--sq-k) + 6px),calc(var(--sy)*var(--sq-k) + 6px),0)}}'],
  ['C2 keyframes 完全常量（连散位也不要，纯 ±6px）',
    '@keyframes sq-solo{from{transform:translate3d(-6px,-6px,0)}to{transform:translate3d(6px,6px,0)}}'],
  ['D 去掉簇容器的 opacity', '.sq-cl{opacity:1!important}'],
  ['E 给 .sq 开 will-change:transform', '.sq{will-change:transform!important}'],
  ['F 去掉容器 opacity + keyframes 完全常量', '.sq-cl{opacity:1!important}@keyframes sq-solo{from{transform:translate3d(-6px,-6px,0)}to{transform:translate3d(6px,6px,0)}}'],
  ['G 层关掉（对照）', ''],
  ['H 去掉容器 opacity + 把「自走」上提到 25 个簇容器（板只剩静态散位）', 'HOIST'],
];

/* HOIST：把每块方板的 --dx/--dy/--dur/--dly 抄到它所属簇容器上，
   板只留静态散位、不再有动画；自走由 25 个簇容器各承一条。
   几何上与原设计完全等价（纯平移可交换），代价从 105 条动画降到 25 条。 */
const HOIST_CSS = `
.sq { animation: none !important; }
.sq-cl { opacity: 1 !important; animation: sq-hoist var(--dur, 30s) cubic-bezier(0.42,0,0.58,1) var(--dly, 0s) infinite alternate !important; }
@keyframes sq-hoist {
  from { transform: translate3d(calc(var(--dx) * var(--sq-k)), calc(var(--dy) * var(--sq-k)), 0); }
  to   { transform: translate3d(calc(-1 * var(--dx) * var(--sq-k)), calc(-1 * var(--dy) * var(--sq-k)), 0); }
}`;

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p16-a-lab')}`],
  });
  const run = async (css, layer) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${base}?ui=0&zone=deep&face=dream`, { waitUntil: 'load', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((l, c, hc) => {
      document.getElementById('p15-bg').dataset.layer = l;
      if (c === 'HOIST') {
        for (const cl of document.querySelectorAll('.sq-cl')) {
          const kid = cl.querySelector('.sq');
          for (const v of ['--dx', '--dy', '--dur', '--dly']) cl.style.setProperty(v, kid.style.getPropertyValue(v));
        }
        const s = document.createElement('style');
        s.textContent = hc;
        document.body.appendChild(s);
      } else if (c) { const s = document.createElement('style'); s.textContent = c; document.body.appendChild(s); }
    }, layer, css, HOIST_CSS);
    await sleep(400);
    const client = await page.createCDPSession();
    await client.send('Emulation.setCPUThrottlingRate', { rate: 8 });
    await sleep(300);
    const r = await page.evaluate(async (ms) => {
      const t = []; const t0 = performance.now();
      await new Promise((res) => {
        let last = performance.now();
        (function loop(ts) { t.push(ts - last); last = ts; if (ts - t0 > ms) return res(); requestAnimationFrame(loop); })(performance.now());
      });
      const s = t.slice(1).sort((a, b) => a - b);
      const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
      return { frames: s.length, p50: q(0.5), p95: q(0.95) };
    }, 4000);
    await page.close();
    return r;
  };
  for (const [name, css] of V) {
    const layer = name.startsWith('G ') ? 'off' : 'through';
    const a = await run(css, layer);
    console.log(`${name.padEnd(42)} 帧 ${String(a.frames).padStart(4)}  p50 ${a.p50.toFixed(1).padStart(6)}ms  p95 ${a.p95.toFixed(1).padStart(6)}ms  （约 ${(1000 / a.p50).toFixed(0)} fps @8× 降速）`);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
