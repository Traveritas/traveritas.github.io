/* 「景深叠层」原型的静态服务器：端口 4613，根目录是仓库根。
   用法：node design/mocks/layout-depth/serve.cjs  → http://127.0.0.1:4613/
   根路径转到 /design/mocks/layout-depth/；找不到的路径再到 public/ 下找一次（字体、favicon 就从那里来）。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4613);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') { res.writeHead(302, { Location: '/design/mocks/layout-depth/' }); return res.end(); }
    if (p.endsWith('/')) p += 'index.html';
    const tries = [path.join(ROOT, p), path.join(ROOT, 'public', p)];
    const file = tries.find((f) => f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (require.main === module) start().then(() => console.log(`景深叠层 → http://127.0.0.1:${PORT}/`));
module.exports = { start };
