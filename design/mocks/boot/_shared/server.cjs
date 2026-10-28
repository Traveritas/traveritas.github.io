/* 开屏 mock 公共静态服务
   const { start } = require('../_shared/server.cjs');
   start(0) → server（URL 形如 http://localhost:<port>/design/mocks/boot/<方向>/）

   根目录挂在仓库根：/fonts/noto/*（真站切好的思源宋体子集）、/fonts/plex/*（IBM Plex Mono）、
   /public/textures/*（旧开屏用的树脂 / 雾纹理）、以及各 mock 自己的文件都能直接取到。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const PORT = +(process.env.PORT || 4640);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  // 挂包目录而不是 files/：400.css 里的 url(./files/…) 相对 CSS 自己解析
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono')],
  ['/', ROOT],
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
        if (err) {
          res.writeHead(404);
          return res.end('not found');
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/design/mocks/boot/`));
module.exports = { start };