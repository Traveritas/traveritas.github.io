/* ─────────────────────────────────────────────────────────────
   「背景配色」四案 · 预览服务

   以 dist/ 为根，往每个 HTML 的 <head> 里塞两个脚本：
     /__palette/palettes.js  生成好的方案数据（node gen.cjs 的产物）
     /__palette/inject.js    运行时换色（拦 uP 调色板 / canvas 字色 / CSS 变量）
   不改 src/、不改 dist/ —— 原型只活在这一层注入里。

   用法：npm run build && node design/mocks/palette/serve-palette.cjs [port]
     打开 http://127.0.0.1:4398/  →  先看方案总览（index.html）
     把 ?p=now|a|b|c|d 带到任意页面即可切方案，例：
       http://127.0.0.1:4398/articles/?p=b      随笔（浅栏，单栏漫游）
       http://127.0.0.1:4398/projects/?p=c      项目
       http://127.0.0.1:4398/moments/?p=d       瞬间
     不带 ?p 时按 cookie 里记住的那一个，默认 now（现状）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'dist');
const HERE = __dirname;
const KEYS = ['now', 'a', 'b', 'c', 'd'];

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

function pick(req, url) {
  const q = (url.searchParams.get('p') || '').toLowerCase();
  if (KEYS.includes(q)) return { p: q, set: true };
  const m = /(?:^|;\s*)palette_p=(now|a|b|c|d)/.exec(req.headers.cookie || '');
  return { p: m ? m[1] : 'now', set: false };
}

/* 注入点：<head> 一开始就挂（inject.js 必须先于站点的 module 脚本执行，它要抢在
   WebGL 上下文创建之前把原型方法换掉）。
   方案号写进 <html data-palette>：wander.js 点开阅读窗时会用 replaceState 把地址换掉，
   只靠 query 会在那一步丢掉。 */
function inject(html, p) {
  const tag =
    '<script src="/__palette/palettes.js"></script>' +
    '<script src="/__palette/inject.js"></script>';
  return html.replace(/<html\b([^>]*)>/i, `<html$1 data-palette-request="${p}">`).replace(
    /<head([^>]*)>/i,
    `<head$1>${tag}`,
  );
}

function serveFile(req, res, pathname, url) {
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
    const { p, set } = pick(req, url);
    if (set) headers['set-cookie'] = `palette_p=${p}; Path=/; SameSite=Lax`;
    headers['cache-control'] = 'no-store';
    res.writeHead(status, headers);
    res.end(inject(fs.readFileSync(file, 'utf8'), p));
    return;
  }
  res.writeHead(status, headers);
  fs.createReadStream(file).pipe(res);
}

function start(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const pathname = decodeURIComponent(url.pathname);

    // 原型自己的文件
    if (pathname.startsWith('/__palette/')) {
      const file = path.join(HERE, pathname.slice('/__palette/'.length));
      if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    // 总览页：原型目录里的 index.html 直接挂在 /__palette/index.html
    serveFile(req, res, pathname, url);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { start };

if (require.main === module) {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('dist/ 不存在，先在仓库根目录跑 npm run build');
    process.exit(1);
  }
  start(+(process.argv[2] || 4398)).then(({ port }) => {
    const base = `http://127.0.0.1:${port}`;
    console.log('「背景配色」四案 · 预览');
    console.log(`  方案总览      ${base}/__palette/index.html`);
    console.log(`  随笔 · 现状   ${base}/articles/?p=now`);
    console.log(`  随笔 · B      ${base}/articles/?p=b`);
    console.log(`  项目 · C      ${base}/projects/?p=c`);
    console.log(`  瞬间 · D      ${base}/moments/?p=d`);
  });
}
