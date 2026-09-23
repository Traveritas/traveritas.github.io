/* 首屏专项：等开屏放完之后拍首页首屏，并量构块场在首屏的贡献 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const P = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const BASE = process.argv[2] || 'http://localhost:4399';
const OUT = path.join(__dirname, '.shots-p18-site-verify');

const DIFF = `async (a, b) => {
  const L = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
  const [A, B] = await Promise.all([L(a), L(b)]);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
  const db = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0, mx = 0;
  for (let i = 0; i < da.length; i += 4) { for (let k = 0; k < 3; k++) { const f = Math.abs(da[i + k] - db[i + k]); if (f > 1) { n++; break; } if (f > mx) mx = f; } }
  return { diffPx: n, ofPx: da.length / 4, maxCh: mx };
}`;

(async () => {
  const browser = await P.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-hero')}`],
  });
  const open = async (url, face) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    if (face) await pg.evaluateOnNewDocument((f) => { try { sessionStorage.setItem('xm-reality', f); } catch (e) {} }, face);
    await pg.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await pg.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 6500)); // 等开屏校准幕放完 + 入梦落定
    await pg.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 1200));
    return pg;
  };

  const w = await open(`${BASE}/`, 'wake');
  const s1 = await w.screenshot({ encoding: 'base64' });
  await w.screenshot({ path: path.join(OUT, '07-hero-wake-final.png') });
  const d = await open(`${BASE}/`, null);
  const s2 = await d.screenshot({ encoding: 'base64' });
  await d.screenshot({ path: path.join(OUT, '08-hero-dream-final.png') });
  const off = await open(`${BASE}/?fld=off`, 'wake');
  const s3 = await off.screenshot({ encoding: 'base64' });

  const heroFieldW = await w.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + s1)},${JSON.stringify('data:image/png;base64,' + s3)})`);
  const ctrl = await (async () => { const s = await w.screenshot({ encoding: 'base64' }); return w.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + s1)},${JSON.stringify('data:image/png;base64,' + s)})`); })();
  console.log('首屏 有场 vs ?fld=off :', JSON.stringify(heroFieldW));
  console.log('首屏 同配置连拍对照 :', JSON.stringify(ctrl));
  console.log('首屏 场在视口内的块数:', await w.evaluate(`document.querySelectorAll('.fld-sq').length`));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
