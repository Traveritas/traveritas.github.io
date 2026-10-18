/* ─────────────────────────────────────────────────────────────
   「版块＝时辰」原型的预览服务：以 dist/ 为根，往每个 HTML 里注入
   design/mocks/hours/hours.css，并在 <html> 上写 data-hour / data-hours。
   不改 src/、不改 dist/ —— 原型只活在这一层注入里。

   用法：npm run build && node design/mocks/hours/serve-hours.cjs [port]
   打开 http://127.0.0.1:4399/?v=b
     v=off  现状（不注入任何东西）
     v=a    变体 A「整夜」：内页沿用主页那一段的夜色
     v=b    变体 B「浅色时辰」：每个时辰的浅色版
   选择记在 cookie 里，站内跳转不用再带参数。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'dist');
const HERE = __dirname;
const VARIANTS = ['off', 'a', 'b'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
};

/* 路由 → 时辰。主页的时段见 src/data/night.ts 的 SECTIONS 与 index.astro 的场注释 */
function hourOf(pathname) {
  if (pathname === '/' || pathname === '/index.html') return 'home';
  if (/^\/(articles|tags)\//.test(pathname)) return 'shallow'; // 浅梦 · 23:19 — 01:11
  if (/^\/projects\//.test(pathname)) return 'deep'; // 深眠 · 01:11 — 02:08
  if (/^\/moments\//.test(pathname)) return 'rem'; // 异相 · 02:08 — 04:59
  if (/^\/about\//.test(pathname)) return 'dawn'; // 晨光 · 06:31
  return 'none'; // 404、样式预览页等
}

function variantOf(req, url) {
  const q = url.searchParams.get('v');
  if (VARIANTS.includes(q)) return { v: q, set: true };
  const m = /(?:^|;\s*)hours_v=(off|a|b)/.exec(req.headers.cookie || '');
  return { v: m ? m[1] : 'b', set: false };
}

function inject(html, hour, v) {
  if (v === 'off') return html;
  const link = `<link rel="stylesheet" href="/__hours/hours.css?t=${Date.now()}">`;
  return html
    .replace(/<html\b([^>]*)>/i, `<html$1 data-hour="${hour}" data-hours="${v}">`)
    .replace(/<\/head>/i, `${link}</head>`);
}

function start(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const pathname = decodeURIComponent(url.pathname);

    // 原型自己的文件（hours.css、截图对照页等）
    if (pathname.startsWith('/__hours/')) {
      const file = path.join(HERE, pathname.slice('/__hours/'.length));
      if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
      return;
    }

    let file = path.join(ROOT, pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    let status = 200;
    if (!fs.existsSync(file)) {
      file = path.join(ROOT, '404.html');
      status = 404;
    }
    const ext = path.extname(file);
    const headers = { 'content-type': TYPES[ext] || 'application/octet-stream' };
    if (ext === '.html') {
      const { v, set } = variantOf(req, url);
      if (set) headers['set-cookie'] = `hours_v=${v}; Path=/; SameSite=Lax`;
      headers['cache-control'] = 'no-store';
      const hour = status === 404 ? 'none' : hourOf(pathname);
      res.writeHead(status, headers);
      res.end(inject(fs.readFileSync(file, 'utf8'), hour, v));
      return;
    }
    res.writeHead(status, headers);
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { start, hourOf };

if (require.main === module) {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('dist/ 不存在，先在仓库根目录跑 npm run build');
    process.exit(1);
  }
  start(+(process.argv[2] || 4399)).then(({ port }) => {
    const base = `http://127.0.0.1:${port}`;
    console.log(`「版块＝时辰」原型：${base}/?v=b`);
    console.log(`  现状 ${base}/projects/?v=off   变体 A ${base}/projects/?v=a   变体 B ${base}/projects/?v=b`);
  });
}
