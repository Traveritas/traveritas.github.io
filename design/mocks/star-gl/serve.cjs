/* 星 · WebGL 原型 · 静态服务（端口 4670）
   node design/mocks/star-gl/serve.cjs  →  http://localhost:4670/star-gl/
   根目录挂在 design/mocks/，这样 /star-gl/ 与相邻原型都能取到；
   /three/ 挂 node_modules/three（index.html 的 importmap 把它命名成 "three"）；
   /bytes.json 现算这一页的字节账（原始与 gzip），页面不手抄数字。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4670);
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
  // 包里那几份 CSS 用的是 ./files/… 相对路径，所以挂包根目录，不能只挂 files/
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono')],
  ['/three/', path.join(ROOT, 'node_modules/three')],
  ['/', MOCKS],
];

/**
 * 字节账：只报真的会下载的东西。
 * three 只要 three.module.js 与被它导入的 three.core.js
 * （0.186 的 three.module.js 第一行 `export * from './three.core.js'`）。
 */
function bytes() {
  const rows = [];
  const add = (k, file) => {
    try {
      const b = fs.readFileSync(file);
      rows.push({ k, raw: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length });
    } catch {
      rows.push({ k, raw: 0, gzip: 0, missing: true });
    }
  };
  add('three.module.js', path.join(ROOT, 'node_modules/three/build/three.module.js'));
  add('three.core.js', path.join(ROOT, 'node_modules/three/build/three.core.js'));
  add('src.js（这一颗的全部几何与时钟）', path.join(__dirname, 'src.js'));
  add('index.html（含样式与页面脚本）', path.join(__dirname, 'index.html'));
  const total = rows.reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 });
  rows.push({ k: '合计（首屏要下的全部）', raw: total.raw, gzip: total.gzip });
  return { rows };
}

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-gl/' });
      return res.end();
    }
    if (url === '/bytes.json') {
      const body = JSON.stringify(bytes());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(body);
    }
    /* 离线算的中心读数（.centre.mjs 产出）；没有那份文件时返回 204，页面会跳过那一行 */
    if (url === '/centre.json') {
      const f = path.join(__dirname, '.shots/centre.json');
      if (!fs.existsSync(f)) {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(f));
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

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-gl/`));
module.exports = { start };