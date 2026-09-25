/* 方案 D 放大取样（自验辅助，非交付物）
   node design/mocks/.cursor-D-zoom.cjs
   在 (760,470) 周围裁 44×30 CSS px，deviceScaleFactor 8 ⇒ 352×240 放大帧，
   落进 design/mocks/.shots-cursor-D/zoom-*.png，供人眼逐像素比对两态差。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-cursor-D');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };
const X = 760, Y = 470, W = 44, H = 30;

const SHOTS = [
  ['zoom-01-wake-rest', '?freeze=1&mix=1&ui=0&probe=1&state=rest', null],
  ['zoom-02-dream-rest', '?freeze=1&mix=0&ui=0&probe=1&state=rest', null],
  ['zoom-03-dream-rest-deep', '?freeze=1&mix=0&zone=deep&ui=0&probe=1&state=rest', '@#cursor-lab'],
  ['zoom-04-dream-rest-paper', '?freeze=1&mix=0&zone=paper&ui=0&probe=1&state=rest', '@#cursor-lab'],
  ['zoom-05-wake-move', '?freeze=1&mix=1&ui=0&probe=1&state=move', '@#cursor-lab'],
  ['zoom-06-dream-move', '?freeze=1&mix=0&ui=0&probe=1&state=move', '@#cursor-lab'],
  ['zoom-07-link', '?freeze=1&mix=0&ui=0&probe=1&state=hover-link', '@#cursor-lab'],
  ['zoom-08-text', '?freeze=1&mix=0&ui=0&probe=1&state=hover-text', '@.lab-intro'],
  ['zoom-09-hold2200', '?freeze=1&mix=1&ui=0&probe=1&state=hold2200', '@#cursor-lab'],
  ['zoom-10-wake-rest-deep', '?freeze=1&mix=1&zone=deep&ui=0&probe=1&state=rest', '@#cursor-lab'],
  ['zoom-11-drag-dream', '?freeze=1&mix=0&ui=0&probe=1&state=drag', '@#cursor-lab'],
];

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, r2) => {
      const p0 = decodeURIComponent(req.url.split('?')[0]);
      if (p0 === '/favicon.ico') return (r2.writeHead(204), r2.end());
      const p = path.join(ROOT, p0);
      fs.readFile(p, (e, d) => {
        if (e) return (r2.writeHead(404), r2.end('nf'));
        r2.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        r2.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/cursor-D-double-image.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-cursor-D-zoom')}`],
  });
  for (const [name, q0, at] of SHOTS) {
    const p = await browser.newPage();
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 8 });
    await p.goto(base + q0, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 600));
    if (at) {
      await p.evaluate((sel) => {
        const el = document.querySelector(sel.slice(1));
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      }, at);
      await new Promise((r) => setTimeout(r, 800));
    }
    await p.mouse.move(700, 420, { steps: 8 });
    await p.mouse.move(X, Y, { steps: 8 });
    await new Promise((r) => setTimeout(r, 600));
    const st = await p.evaluate(() => {
      const c = document.querySelector('#cursor-slot .cd-copy');
      const h = document.querySelector('#cursor-slot .cd-hot');
      const rc = c.getBoundingClientRect(), rh = h.getBoundingClientRect();
      return { cls: document.getElementById('cursor-slot').className, body: document.body.className, sy: Math.round(scrollY), sx: Math.round(scrollX), hot: [rh.left, rh.top], ptr: [window.__curD?1:0], gap: [+(rc.left - rh.left).toFixed(2), +(rc.top - rh.top).toFixed(2)], op: getComputedStyle(c).opacity, anim: getComputedStyle(c).animationName };
    });
    await p.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: X - W / 2 + st.sx, y: Y - H / 2 + st.sy, width: W, height: H }, captureBeyondViewport: true });
    console.log(name.padEnd(26), JSON.stringify(st));
    await p.close();
  }
  /* 合成对照图：把关键两帧 8× 放大并排（同一坐标、同一机位），供人眼直接比 */
  {
    const pick = ['zoom-01-wake-rest', 'zoom-02-dream-rest', 'zoom-03-dream-rest-deep', 'zoom-10-wake-rest-deep',
      'zoom-05-wake-move', 'zoom-06-dream-move', 'zoom-07-link', 'zoom-08-text'];
    const p = await browser.newPage();
    await p.setViewport({ width: 1480, height: 620, deviceScaleFactor: 2 });
    await p.goto('http://127.0.0.1:' + server.address().port + '/design/mocks/cursor-D-double-image.html?ui=0', { waitUntil: 'domcontentloaded' });
    await p.setContent(`<body style="margin:0;background:#1b1b1b;display:grid;grid-template-columns:repeat(4,1fr);gap:2px">
      ${pick.map((n) => `<div><img src="http://127.0.0.1:${server.address().port}/design/mocks/.shots-cursor-D/${n}.png" style="width:100%;display:block">
      <div style="font:11px monospace;color:#bbb;padding:2px 4px">${n}</div></div>`).join('')}</body>`);
    await new Promise((r) => setTimeout(r, 900));
    await p.screenshot({ path: path.join(OUT, 'zoom-00-compare.png') });
    console.log('zoom-00-compare        合成 8× 对照');
    await p.close();
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
