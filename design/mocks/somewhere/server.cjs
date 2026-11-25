/* somewhere 原型共用 · 静态服务
   node design/mocks/somewhere/server.cjs        → http://localhost:4640/somewhere/
   node design/mocks/somewhere/server.cjs 4650   → 换端口（并行跑多份场景时用）

   挂载：/somewhere/ 本目录（每位作者一份 s-*.html + 各自的 .js/.css）、
        /fonts/noto/ 站点思源宋、/fonts/plex/ Plex Mono、/vendor/ three.min.js。
   字体与 vendor 从仓库里取，不联网。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files')],
  ['/fonts/silkscreen/', path.join(ROOT, 'node_modules/@fontsource/silkscreen/files')],
  ['/vendor/', path.join(ROOT, 'design/mocks/vendor')],
  ['/', path.resolve(HERE, '..')], // 挂在上层：于是 /somewhere/* 才对得上
];

function start(port = +(process.env.PORT || 4640)) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/somewhere/' });
      return res.end();
    }
    if (url === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) {
          console.error('[404]', url);
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

if (require.main === module) {
  start().then((s) => console.log(`http://localhost:${s.address().port}/somewhere/`));
}
module.exports = { start };
