/* cards-r2 · 静态服务（端口 4642）
   node design/mocks/cards-r2/server.cjs  →  http://localhost:4642/
   根目录挂 design/mocks/cards-r2；/fonts/ 取 public/fonts，/plex/ 取 node_modules 里的 Plex。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE = path.resolve(ROOT, '../../..');
const PORT = +(process.env.PORT || 4642);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const MOUNTS = [
  ['/fonts/', path.join(SITE, 'public/fonts')],
  ['/plex/', path.join(SITE, 'node_modules/@fontsource/ibm-plex-mono/files')],
  ['/', ROOT],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          return res.end('not found: ' + url);
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end('no mount: ' + url);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().then((s) => console.log(`http://localhost:${s.address().port}/`));
}
module.exports = { start };
