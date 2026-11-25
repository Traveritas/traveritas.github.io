/* 审美巡检 · 第二批：gate 进场终态 + Wander 检索/漫游 + 阅读窗 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), '@playwright', 'mcp', 'node_modules', 'playwright-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '_shots-audit');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.xml': 'application/xml' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
(async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars', '--use-gl=angle'] });
  const base = `http://127.0.0.1:${port}`;
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('ok', name); };

  /* gate：等进场全部演完（线→水→晶体→切片→NEXUS 字） */
  let p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + '/gate/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(9000);
  await shot(p, '17-gate-final-wake');
  await p.close();

  /* Wander 主页 → 滚轮进检索 */
  p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3600);
  await p.mouse.move(720, 450);
  await p.mouse.wheel(0, 160);
  await p.waitForTimeout(2200);
  await shot(p, '18-wander-grid-dream');
  /* V 切漫游 */
  await p.keyboard.press('v');
  await p.waitForTimeout(2400);
  await shot(p, '19-wander-explore-dream');
  /* 漫游里往右平移一段再拍 */
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(1800);
  await shot(p, '20-wander-explore-pan');
  await p.close();

  /* 醒面检索 */
  p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => { try { sessionStorage.setItem('xm-reality', 'wake'); } catch {} });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3600);
  await p.mouse.move(720, 450);
  await p.mouse.wheel(0, 160);
  await p.waitForTimeout(2200);
  await shot(p, '21-wander-grid-wake');
  await p.close();

  /* 手机检索 */
  p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3600);
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(2400);
  await shot(p, '22-wander-grid-mobile');
  await p.close();

  await browser.close();
  server.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });