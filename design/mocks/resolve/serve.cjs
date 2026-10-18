/* ─────────────────────────────────────────────────────────────
   「解析度」原型的预览服务：以本目录为根；/fonts/ 借用 public/fonts（只读）。
   用法：node design/mocks/resolve/serve.cjs [port]   默认 4410
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');

const HERE = __dirname;
const FONTS = path.resolve(HERE, '..', '..', '..', 'public', 'fonts');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function start(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    let p = decodeURIComponent(url.pathname);
    let base = HERE;
    if (p.startsWith('/fonts/')) {
      base = FONTS;
      p = p.slice('/fonts'.length);
    }
    let file = path.join(base, p);
    if (!file.startsWith(base)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

module.exports = { start };

if (require.main === module) {
  start(+(process.argv[2] || 4410)).then(({ port }) => {
    const b = `http://127.0.0.1:${port}/`;
    console.log(`「解析度」原型：${b}`);
    console.log(`  ${b}?mode=a&hour=shallow&state=wake   ${b}?mode=b&hour=deep&state=dream`);
  });
}
