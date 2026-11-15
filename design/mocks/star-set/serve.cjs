/* 星 · 一套晶体原语 —— 静态服务（端口 4680）
   node design/mocks/star-set/serve.cjs  →  http://localhost:4680/star-set/
   /three/ 挂 node_modules/three/build，/ 挂 design/mocks/。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4680);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const MOUNTS = [
  ['/three/', path.join(ROOT, 'node_modules/three/build')],
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/', MOCKS],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-set/' });
      return res.end();
    }
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          return res.end('not found');
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-set/`));
module.exports = { start };
