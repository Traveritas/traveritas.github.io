// p14-a 本地静态服务器：以仓库根为 root（供 ../../node_modules/@fontsource 取本地字体），
// 全程 no-store —— 截图脚本会反复重载同一个 URL，缓存会让改动看不见。
// 端口 8191（其他并行会话用别的）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};
http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        return res.end('not found');
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.end(data);
    });
  })
  .listen(8191, '127.0.0.1', () => console.log('serving http://127.0.0.1:8191/design/mocks/p14-a-lattice.html'));
