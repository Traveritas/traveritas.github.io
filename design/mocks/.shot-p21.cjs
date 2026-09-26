/* p21 · 站台与温室 · 截图与漫游实测
   用法：node design/mocks/.shot-p21.cjs
   输出：design/mocks/.shots-p21/*.png + report.json（自带静态服务器，随机端口）
   机位：五站定帧（1440×900，?freeze=1&ui=0）+ 带界面一张 + 竖屏两张；
         另跑一遍真实点击漫游（点下一处光点 → 等到站），记录到站与控制台错误。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(__dirname, '.shots-p21');
fs.mkdirSync(OUT, { recursive: true });
const PAGE = 'p21-platform-greenhouse.html';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/${PAGE}`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const report = { errors: [], shots: [], walk: [] };
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${e.message}`));

  async function shot(name, q, vp = { width: 1440, height: 900 }) {
    await page.setViewport({ ...vp, deviceScaleFactor: 1 });
    await page.goto(`${base}?${q}`, { waitUntil: 'load' });
    await wait(1200);
    const st = await page.evaluate(() => window.__p21 && window.__p21.state());
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    report.shots.push({ name, q, state: st });
    console.log('shot', name, JSON.stringify(st));
  }

  for (let n = 0; n < 5; n++) await shot(`0${n}-node${n}`, `node=${n}&freeze=1&ui=0`);
  await shot('10-ui-node1', 'node=1&freeze=1');
  await shot('11-mobile-node0', 'node=0&freeze=1', { width: 390, height: 844 });
  await shot('12-mobile-node3', 'node=3&freeze=1', { width: 390, height: 844 });

  /* 真实点击漫游：把下一处光点投到屏幕坐标上点它 */
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}?node=0`, { waitUntil: 'load' });
  await wait(1500);
  for (let step = 1; step < 5; step++) {
    // 光点屏幕坐标由页面内投影算出
    const pt = await page.evaluate((i) => window.__p21.screenOf && window.__p21.screenOf(i), step);
    if (!pt) { report.walk.push({ step, error: 'no screenOf' }); break; }
    await page.mouse.move(pt.x, pt.y);
    await wait(200);
    const hoverOk = await page.evaluate(() => document.body.classList.contains('hover'));
    await page.mouse.click(pt.x, pt.y);
    const t0 = Date.now();
    let st;
    for (;;) {
      await wait(250);
      st = await page.evaluate(() => window.__p21.state());
      if (!st.traveling && st.node === step) break;
      if (Date.now() - t0 > 15000) break;
    }
    report.walk.push({ step, at: pt, hoverOk, arrived: st.node === step, ms: Date.now() - t0, calls: st.calls, tris: st.tris });
    console.log('walk', step, JSON.stringify(report.walk[report.walk.length - 1]));
  }
  await wait(1600);
  await page.screenshot({ path: path.join(OUT, '20-walk-end-ui.png') });

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('errors', report.errors.length, report.errors.slice(0, 8));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
