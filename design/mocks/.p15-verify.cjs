/* ─────────────────────────────────────────────────────────────
   Phase 15 · 独立复核（主会话用，不属任何一稿）
   对四稿 + 外壳逐项实测，全部由本脚本自己算，不采信各稿自测：
     1) 两态静止帧的像素差（?freeze=1&zone=deep&face=wake vs dream）
        —— 「一眼可辨」的可量化下限；同时给 mean/max 亮度差
     2) 稳态 1s 内的 rAF 调用数、事件监听新增数（与外壳基线相减）
   用法：node design/mocks/.p15-verify.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const MOCKS = [
  ['p15-shell', '外壳基线（BG SLOT 空）'],
  ['p15-a-caustics', 'A 星野微光尘粒'],
  ['p15-b-harmonic', 'B 谐波残影'],
  ['p15-c-prisms', 'C 磨砂晶面'],
  ['p15-d-constructs', 'D 构块场'],
];

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const serve = () =>
  new Promise((res) => {
    const s = http.createServer((req, r) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (r.writeHead(403), r.end());
      fs.readFile(p, (e, d) => {
        if (e) return (r.writeHead(404, { 'Cache-Control': 'no-store' }), r.end('nf'));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });

/* 页面内解码两张 PNG 并逐像素比：亮度差用 Rec.709 权重。
   文字区域（由调用方给的 rects）整片排除——本轮量的是「背景层自己」的两态差，
   文案换面（随笔↔断章）与 7% 洗染是两态差里的既有部分，不该算在各稿头上。
   同时给两档感知阈值（ΔL>6 ≈ 2.4% 亮度、ΔL>20 ≈ 7.8%）下的像素占比。 */
const DIFF = `async (a, b, rects) => {
  const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
  const db = x.getImageData(0, 0, c.width, c.height).data;
  const mask = new Uint8Array(c.width * c.height);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x) - 3), x1 = Math.min(c.width, Math.ceil(r.x + r.w) + 3);
    const y0 = Math.max(0, Math.floor(r.y) - 3), y1 = Math.min(c.height, Math.ceil(r.y + r.h) + 3);
    for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) mask[y * c.width + xx] = 1;
  }
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let n = 0, sum = 0, max = 0, t6 = 0, t20 = 0, masked = 0;
  for (let i = 0, p = 0; i < da.length; i += 4, p++) {
    if (mask[p]) { masked++; continue; }
    const dl = L(da, i), dl2 = L(db, i), df = Math.abs(dl - dl2);
    n++; sum += df; if (df > max) max = df;
    if (df > 6) t6++; if (df > 20) t20++;
  }
  return {
    bgPx: n, maskedPct: +(masked / (masked + n) * 100).toFixed(1),
    meanBg: +(sum / n).toFixed(2), maxBg: +max.toFixed(1),
    pct6: +(t6 / n * 100).toFixed(1), pct20: +(t20 / n * 100).toFixed(2),
  };
}`;

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15-verify')}`],
  });

  const rows = [];
  for (const [file, label] of MOCKS) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.evaluateOnNewDocument(() => {
      window.__raf = 0; window.__lis = 0;
      const r = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf++; return r(cb); };
      const a = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (...arg) { window.__lis++; return a.apply(this, arg); };
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const shot2 = async (pg, url) => {
      await pg.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      await pg.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 600));
      await pg.evaluate(() => {
        const el = document.querySelector('#ns-essays');
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      });
      await new Promise((r) => setTimeout(r, 800));
      return pg.screenshot({ encoding: 'base64', captureBeyondViewport: false });
    };
    const shot = (face) => shot2(page, `${base}${file}.html?ui=0&freeze=1&zone=deep&face=${face}`);
    const wake = await shot('wake');
    const dream = await shot('dream');
    const rects = await page.evaluate(() => {
      // 视口内的文字盒（此时页面正停在 #ns-essays）：标题 / 正文 / 等宽行 / 标签，全部排除
      const sel = '.container .sec-head h2, .container h3, .container p, .container .mono, .container .st';
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
      return out;
    });
    const diff = await page.evaluate(
      `(${DIFF})(${JSON.stringify('data:image/png;base64,' + wake)},${JSON.stringify('data:image/png;base64,' + dream)},${JSON.stringify(rects)})`,
    );

    // 稳态计数：醒面 idle 下 1s
    await page.goto(`${base}${file}.html?ui=0&zone=deep&face=wake`, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 900));
    const rafLis = await page.evaluate(() => { const r = window.__raf, l = window.__lis; window.__raf = 0; window.__lis = 0; return { r, l }; });
    await new Promise((r) => setTimeout(r, 1000));
    const idle = await page.evaluate(() => ({ raf: window.__raf, lis: window.__lis }));

    /* ── 无缝检验：钉住醒度 0 / .25 / .5 / .75 / 1，看每档与两端点的背景差异。
       如果是"开关式"过渡，中间档会与某一端点几乎为零；线性插值则应单调。 ── */
    const sweep = [];
    for (const m of [0, 0.25, 0.5, 0.75, 1]) {
      const b64 = await shot2(page, `${base}${file}.html?ui=0&freeze=1&zone=deep&mix=${m}`);
      sweep.push(b64);
    }
    const sRects = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('.container .sec-head h2, .container h3, .container p, .container .mono, .container .st')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
      return out;
    });
    const mid = [];
    for (let i = 1; i < 4; i++) {
      const vs0 = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + sweep[0])},${JSON.stringify('data:image/png;base64,' + sweep[i])},${JSON.stringify(sRects)})`);
      const vs1 = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + sweep[4])},${JSON.stringify('data:image/png;base64,' + sweep[i])},${JSON.stringify(sRects)})`);
      mid.push({ m: [0.25, 0.5, 0.75][i - 1], meanBg_vsWake: vs0.meanBg, meanBg_vsDream: vs1.meanBg });
    }

    rows.push({ file, label, ...diff, raf1s: idle.raf, lis: idle.lis, bootLis: rafLis.l, mid, errs });
    console.log(
      `${file.padEnd(18)} 背景平均ΔL ${String(diff.meanBg).padStart(5)}  峰值 ${String(diff.maxBg).padStart(5)}` +
        `  ΔL>6 占 ${String(diff.pct6).padStart(4)}%  ΔL>20 占 ${String(diff.pct20).padStart(5)}%` +
        `  (排除文字 ${diff.maskedPct}%)  rAF/1s ${String(idle.raf).padStart(4)}  监听(稳态) ${idle.lis}` +
        `${errs.length ? '  ERR:' + errs.join('|') : ''}`,
    );
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, '.shots-p15-verify.json'), JSON.stringify(rows, null, 2));
  console.log('\n已写 design/mocks/.shots-p15-verify.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
