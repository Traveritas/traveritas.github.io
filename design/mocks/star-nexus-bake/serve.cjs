/* 星 · 晶体烘焙 · 静态服务（端口 4675）
   node design/mocks/star-nexus-bake/serve.cjs  →  http://localhost:4675/star-nexus-bake/
   根目录挂在 design/mocks/，这样 /star-nexus-bake/ 与相邻原型都能取到；
   /nexus-slice/ 挂 public/nexus-slice（对照那一格要读真图 wake.webp）；
   /bytes.json 现算这一页的字节账（原始与 gzip），页面不手抄数字。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const HERE = __dirname;
const PORT = +(process.env.PORT || 4675);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono')],
  ['/nexus-slice/', path.join(ROOT, 'public/nexus-slice')],
  ['/', MOCKS],
];

/** 字节账：只报真的会下载的东西（图案 + 播放器） */
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
  add('src.js（播放器）', path.join(HERE, 'src.js'));
  /* 图案：出货的那一份（精灵图 + 落定帧），读写路径与 src.js 里的常量一致 */
  const ship = path.join(HERE, 'frames');
  try {
    for (const f of fs.readdirSync(ship).filter((n) => /\.(webp|avif|png)$/.test(n)).sort())
      add(`frames/${f}`, path.join(ship, f));
  } catch {
    /* 还没烘 */
  }
  const tot = rows.reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 });
  rows.push({ k: '合计（触发时要下的全部）', raw: tot.raw, gzip: tot.gzip });
  return { rows };
}

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-nexus-bake/' });
      return res.end();
    }
    if (url === '/bytes.json') {
      const body = JSON.stringify(bytes());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      return res.end(body);
    }
    /* 离线算的读数（bake.mjs 产出）；没有那份文件时返回 204，页面会跳过那些行 */
    if (url === '/readings.json') {
      const f = path.join(HERE, '.shots/readings.json');
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

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-nexus-bake/`));
module.exports = { start, bytes };