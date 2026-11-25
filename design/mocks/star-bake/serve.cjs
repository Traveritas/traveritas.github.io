/* ─────────────────────────────────────────────────────────────
   星 · 预渲染烘焙 · 静态服务（端口 4671）
   node design/mocks/star-bake/serve.cjs  →  http://localhost:4671/star-bake/

   照 star-final/serve.cjs 的写法，多挂三个口：
     /three/   → node_modules/three（.bake.html 里的 importmap 指过来）
     /frames/  → 本目录的 frames/（烘出来的 PNG / WebP）
     /shots/   → 本目录的 .shots/（读数与截图）
   ───────────────────────────────────────────────────────────── */
const http = require('http');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4671);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  /* 包里那几份 CSS 用的是 ./files/… 相对路径，所以挂包根目录 */
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono')],
  ['/three/', path.join(ROOT, 'node_modules/three')],
  ['/frames/', path.join(HERE, 'frames')],
  ['/shots/', path.join(HERE, '.shots')],
  /* 上一轮那份合成器，只读地挂过来：页面直接 import 它，不复制一份代码。
     这样「SVG 合成 vs 烘焙」比的是**真的那一个文件**，不是我的转述。 */
  ['/sf/', path.join(ROOT, 'design/mocks/star-final')],
  ['/star-bake/', HERE],
];

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-bake/' });
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

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-bake/`));
module.exports = { start };