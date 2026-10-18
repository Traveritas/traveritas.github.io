/* 工具层原型 · 四方向对照（端口 4644）
   node design/mocks/tool-compare/serve.cjs  →  http://localhost:4644/
   根目录挂在 design/mocks/，所以这一台就把四份原型（/tool-latent/ 等）、
   它们的截图（/.shots/）、共享内容（/layout-plane/）与字体一起挂起来了，不用各开一台。 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4644);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono/files')],
  ['/', MOCKS],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') { res.writeHead(302, { Location: '/tool-compare/' }); return res.end(); }
    if (url.endsWith('/')) url += 'index.html';
    for (const [prefix, dir] of MOUNTS) {
      if (!url.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, url.slice(prefix.length)));
      if (!file.startsWith(dir)) break;
      return fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/tool-compare/`));
module.exports = { start };
