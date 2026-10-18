/* 无界平铺原型 · 静态服务（端口 4611）
   node design/mocks/layout-plane/server.cjs  →  http://localhost:4611/
   /fonts/noto/ 映射到 public/fonts/noto-serif-sc/，/fonts/plex/ 映射到 @fontsource/ibm-plex-mono 的字形文件 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const PORT = +(process.env.PORT || 4611);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files')],
  ['/', HERE],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (require.main === module) start().then(() => console.log(`http://localhost:${PORT}/`));
module.exports = { start };
