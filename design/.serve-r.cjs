// 临时静态服务器：仅供本地预览 design/mocks 视觉稿（会话 R），no-store 防 IAB 缓存
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'mocks');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'p5-draft.html' : urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(8172, '127.0.0.1', () => console.log('serving mocks on http://127.0.0.1:8172'));
