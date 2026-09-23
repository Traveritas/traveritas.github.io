// p14-c 临时静态服务器：以仓库根为 root（才能取到 node_modules/@fontsource 的本地字体）
// 用法：node design/mocks/.serve-p14c.cjs   → http://127.0.0.1:4411/design/mocks/p14-c-resin-strata.html
// 一律 no-store：改完 HTML 刷新即生效，截图脚本不会吃到旧字节。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // 仓库根
const PORT = 4411;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let p = path.join(ROOT, urlPath === '/' ? '/design/mocks/p14-c-resin-strata.html' : urlPath);
    if (!p.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    fs.readFile(p, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        return res.end('not found: ' + urlPath);
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream',
        'Cache-Control': 'no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
