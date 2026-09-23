/* p18 补充复核：三个对照 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const P = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const ROOT = process.cwd();
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const s = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) return (r.writeHead(404), r.end());
    r.writeHead(200, { 'Content-Type': T[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(d);
  });
});

const DIFF = `async (a, b) => {
  const L = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
  const [A, B] = await Promise.all([L(a), L(b)]);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
  const db = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0, mx = 0;
  for (let i = 0; i < da.length; i += 4) {
    for (let k = 0; k < 3; k++) { const f = Math.abs(da[i + k] - db[i + k]); if (f > 1) { n++; break; } if (f > mx) mx = f; }
  }
  return { diffPx: n, ofPx: da.length / 4, maxCh: mx };
}`;

const main = async () => {
  const port = s.address().port;
  const B = `http://127.0.0.1:${port}/design/mocks/p18-constructs-and-echo.html?ui=0&zone=deep&`;
  const b = await P.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-v2')}`] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1440, height: 900 });
  const go = async (q) => {
    await pg.goto(B + q, { waitUntil: 'networkidle0' });
    await pg.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 800));
    await pg.evaluate(() => { const e = document.querySelector('#ns-essays'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); });
    await new Promise((r) => setTimeout(r, 400));
  };
  const shot = () => pg.screenshot({ encoding: 'base64', captureBeyondViewport: false });

  // (a) 对照组：同配置连拍两张（排除动画相位带来的噪声）
  await go('face=wake');
  const c1 = await shot();
  await new Promise((r) => setTimeout(r, 900));
  const c2 = await shot();
  const ctrl = await pg.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + c1)},${JSON.stringify('data:image/png;base64,' + c2)})`);
  console.log('对照(a) 同配置连拍两张  不同像素', ctrl.diffPx, '/', ctrl.ofPx, '  最大通道差', ctrl.maxCh);

  // (b) .fld-rewind 自身的 transform（机制层，与漂移无关）
  await go('face=wake');
  await pg.evaluate(() => window.__p15.setMix(1)); await new Promise((r) => setTimeout(r, 200));
  const t1 = await pg.evaluate(() => getComputedStyle(document.querySelector('.fld-rewind')).transform);
  await pg.evaluate(() => window.__p15.setMix(0)); await new Promise((r) => setTimeout(r, 200));
  const t0 = await pg.evaluate(() => getComputedStyle(document.querySelector('.fld-rewind')).transform);
  console.log('(b) .fld-rewind transform  醒', t1, ' → 梦', t0);

  // (c) 走真实长按路径（hold → 闩锁），量同一块的位移
  const IDX = `(() => { const es = document.querySelectorAll('.fld-sq'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 300 && r.top > 200 && r.left < 760 && r.top < 520 && r.width > 60) return i; } return 0; })()`;
  const measure = async () => {
    const idx = await pg.evaluate(IDX);
    const p = () => pg.evaluate((i) => { const r = document.querySelectorAll('.fld-sq')[i].getBoundingClientRect(); return { x: +r.left.toFixed(2), y: +r.top.toFixed(2) }; }, idx);
    const a = await p();
    await pg.evaluate(() => window.__p15.hold());
    await new Promise((r) => setTimeout(r, 1600));
    await pg.evaluate(() => window.__p15.release());
    await new Promise((r) => setTimeout(r, 700));
    const c = await p();
    const face = await pg.evaluate(() => document.body.dataset.reality);
    return { face, dx: +(c.x - a.x).toFixed(2), dy: +(c.y - a.y).toFixed(2), len: +Math.hypot(c.x - a.x, c.y - a.y).toFixed(1) };
  };
  await go('face=wake'); await new Promise((r) => setTimeout(r, 1200));
  const h1 = await measure();
  await go('face=wake'); await new Promise((r) => setTimeout(r, 26000));
  const h2 = await measure();
  console.log('(c) 真实长按到闩锁  立刻', JSON.stringify(h1), '  漂 26s 后', JSON.stringify(h2), '  长度差', +(h2.len - h1.len).toFixed(1), 'px');

  await b.close(); s.close();
};

s.listen(0, '127.0.0.1', () => { main().catch((e) => { console.error('FATAL', e); process.exit(1); }); });
