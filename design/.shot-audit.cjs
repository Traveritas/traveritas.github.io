/* 全站审美巡检 · 截图（不进构建）
   node design/.shot-audit.cjs
   dist 静态服务 + 全局 playwright-core（口径同 shot-mist.cjs），
   醒/梦两面、桌面/手机两档，输出 design/_shots-audit/*.png */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(
  path.join(
    require('child_process').execSync('npm root -g').toString().trim(),
    '@playwright',
    'mcp',
    'node_modules',
    'playwright-core',
  ),
);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '_shots-audit');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.xml': 'application/xml',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars', '--use-gl=angle'],
  });
  const base = `http://127.0.0.1:${port}`;
  const log = [];

  /* face: 'wake' 写 sessionStorage；'dream' 留空（站点默认入梦） */
  const open = async (url, face, vp = { width: 1440, height: 900 }) => {
    const page = await browser.newPage({ viewport: vp });
    if (face === 'wake') {
      await page.addInitScript(() => {
        try { sessionStorage.setItem('xm-reality', 'wake'); } catch {}
      });
    }
    page.on('pageerror', (e) => log.push(`pageerror ${url}: ${String(e).slice(0, 160)}`));
    await page.goto(base + url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('booted')).catch(() => {});
    await page.waitForTimeout(2600); /* 开屏面纱收场 + 雾/星跑起来 */
    return page;
  };

  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    const face = await page.evaluate(() => document.body.dataset.reality || '?');
    log.push(`ok ${name} face=${face}`);
    console.log('ok', name, 'face=', face);
  };

  const scrollFrac = async (page, f) => {
    await page.evaluate((frac) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: max * frac, behavior: 'instant' });
    }, f);
    await page.waitForTimeout(1100); /* 昼夜色板是插值过渡，等它到位 */
  };

  /* ── 主页：梦面三幕 + 醒面 ── */
  let p = await open('/', 'dream');
  await shot(p, '01-home-dream-top');
  await scrollFrac(p, 0.45);
  await shot(p, '02-home-dream-mid');
  await scrollFrac(p, 1);
  await shot(p, '03-home-dream-end');
  await p.close();

  p = await open('/', 'wake');
  await shot(p, '04-home-wake-top');
  await scrollFrac(p, 0.45);
  await shot(p, '05-home-wake-mid');
  await p.close();

  /* ── 目录页 ── */
  p = await open('/articles/', 'wake');
  await shot(p, '06-articles-wake');
  await p.close();
  p = await open('/articles/', 'dream');
  await shot(p, '07-articles-dream');
  await p.close();
  p = await open('/projects/', 'wake');
  await shot(p, '08-projects-wake');
  await p.close();

  /* ── 阅读页（随笔 / 项目）── */
  p = await open('/articles/style-specimen/', 'wake');
  await shot(p, '09-article-wake-top');
  await scrollFrac(p, 0.3);
  await shot(p, '10-article-wake-mid');
  await p.close();
  p = await open('/articles/style-specimen/', 'dream');
  await scrollFrac(p, 0.3);
  await shot(p, '11-article-dream-mid');
  await p.close();
  p = await open('/projects/nexus/', 'wake');
  await shot(p, '12-project-wake-top');
  await p.close();

  /* ── 关于 / 404 ── */
  p = await open('/about/', 'wake');
  await shot(p, '13-about-wake');
  await p.close();
  p = await open('/404.html', 'dream');
  await shot(p, '14-404-dream');
  await p.close();

  /* ── 手机档 ── */
  p = await open('/', 'dream', { width: 390, height: 844 });
  await shot(p, '15-home-mobile-dream');
  await p.close();
  p = await open('/articles/style-specimen/', 'wake', { width: 390, height: 844 });
  await shot(p, '16-article-mobile-wake');
  await p.close();

  fs.writeFileSync(path.join(OUT, 'log.txt'), log.join('\n'));
  await browser.close();
  server.close();
  console.log('done:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });