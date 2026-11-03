/* 昼雾改版 · 截图（设计验收用，不进构建）
   node design/shot-mist.cjs
   起一个 dist 静态服务，用 playwright 打开随笔阅读页、滚到中段、醒/梦各拍一张。
   用全局 playwright-core，指定本机 Chrome。 */
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
const OUT = path.join(__dirname, '_shots-mist');
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
  '.xml': 'application/xml',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars', '--use-gl=angle'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') console.log('[page]', m.text());
    });

    /* 站点默认落在梦面（sessionStorage 里存着 wake 才醒）：这一组看的是醒面的昼雾 */
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('xm-reality', 'wake');
      } catch {}
    });
    await page.goto(`http://127.0.0.1:${port}/articles/style-specimen/`, { waitUntil: 'networkidle' });
    /* 开屏面纱收场 + 雾跑起来 */
    await page.waitForFunction(() => document.documentElement.classList.contains('booted')).catch(() => {});
    await page.waitForTimeout(2600);

    const shot = (name, clip) =>
      page.screenshot({ path: path.join(OUT, name), clip }).then(() => console.log('ok', name));

    await shot('10-wake-top.png');

    /* 往下读一段：让正文占满，看静域 */
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'instant' }));
    await page.waitForTimeout(700);
    await shot('11-wake-mid.png');

    /* 只看雾：把正文与仪器层都藏掉 */
    await page.evaluate(() => {
      document.querySelectorAll('.page, .gauge, .hairline').forEach((el) => (el.style.visibility = 'hidden'));
    });
    await page.waitForTimeout(300);
    await shot('12-mist-only.png');

    /* 梦面：站点默认就落在梦面（sessionStorage 里没有 wake），新开一页即可 */
    /* 新的浏览器上下文 = 空 sessionStorage（默认入梦，正好是梦面） */
    const dream = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await dream.goto(`http://127.0.0.1:${port}/articles/style-specimen/`, { waitUntil: 'networkidle' });
    await dream.waitForTimeout(3200);
    await dream.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'instant' }));
    await dream.waitForTimeout(700);
    await dream.screenshot({ path: path.join(OUT, '13-dream-mid.png') });
    console.log('ok 13-dream-mid.png face =', await dream.evaluate(() => document.body.dataset.reality));
    await dream.close();
    if (false) {
    await page.waitForTimeout(2600);
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'instant' }));
    await page.waitForTimeout(700);
    }

    /* 手机宽度 */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/articles/style-specimen/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot('15-mobile.png');

    /* 项目单独页 */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/projects/averita-s-dsh-plugins/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2400);
    await shot('17-project-top.png');
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.15, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await shot('18-project-mid.png');

    /* 404 */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/404.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await shot('14-404.png');

    /* 项目页 · 手机 */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/projects/averita-s-dsh-plugins/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, '21-project-mobile.png') });
    console.log('ok 21-project-mobile.png');
    await page.setViewportSize({ width: 1440, height: 900 });

    /* 返回键：悬停态 + 手机 */
    await page.goto(`http://127.0.0.1:${port}/articles/style-specimen/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.hover('.reback');
    /* 光标环淡入要 0.5s；等它到位再拍，这一张是「真实使用时的悬停态」 */
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '19-return-hover.png'), clip: { x: 0, y: 0, width: 420, height: 120 } });
    /* 再把指针移开，单拍这枚片本身 */
    await page.mouse.move(1400, 700);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '20-return-rest.png'), clip: { x: 0, y: 0, width: 420, height: 120 } });
    console.log('ok 19-return-hover.png');

    /* 走不动时的样子：把 WebGL 关掉，看 CSS 静态雾 */
    const off = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await off.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).startsWith('webgl')) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await off.goto(`http://127.0.0.1:${port}/articles/style-specimen/`, { waitUntil: 'networkidle' });
    await off.waitForTimeout(2200);
    await off.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'instant' }));
    await off.waitForTimeout(400);
    await off.screenshot({ path: path.join(OUT, '16-no-webgl.png') });
    console.log('ok 16-no-webgl.png');
    await off.close();
  } finally {
    await browser.close();
    server.close();
  }
})();
