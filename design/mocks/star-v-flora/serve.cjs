/* 六芒 · 花相 原型 · 静态服务（端口 4665）
   node design/mocks/star-v-flora/serve.cjs  →  http://localhost:4665/star-v-flora/
   根目录挂在 design/mocks/，这样 /star-v-flora/ 与相邻原型都能取到；
   /three/ 直接挂 node_modules/three（index.html 里用 importmap 把它命名成 "three"）。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4665);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files')],
  ['/three/', path.join(ROOT, 'node_modules/three')],
  ['/', MOCKS],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') { res.writeHead(302, { Location: '/star-v-flora/' }); return res.end(); }
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

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-v-flora/`));
module.exports = { start };