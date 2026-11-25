/* 星 · 扁平原型 · 静态服务（端口 4651）
 *   node design/mocks/star-flat/serve.cjs  →  http://127.0.0.1:4651/star-flat/
 *
 * 根挂在 design/mocks/，另把站内那份 Noto Serif SC 子集挂到 /fonts/noto/（同 tool-star/serve.cjs）。
 * 只用模块脚本（star.js / measure.js 都是 ESM）：file:// 下模块不加载，必须走 http。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4651);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/', MOCKS],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-flat/' });
      return res.end();
    }
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('not found: ' + url);
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end('not found: ' + url);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (require.main === module) start().then((s) => console.log(`http://127.0.0.1:${s.address().port}/star-flat/`));
module.exports = { start };