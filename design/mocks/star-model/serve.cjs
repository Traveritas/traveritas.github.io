/* 星 · 模型 · 静态服务（端口 4672）
   node design/mocks/star-model/serve.cjs  →  http://localhost:4672/star-model/
   照 star-gl/serve.cjs 搬过来，改了三处：
     · 端口 4672
     · 多了 .glb 的 MIME（导出那一格要把 star.glb 读回来）
     · /probe.json 与 /glb.json 两条服务端现算的读数（页面不手抄数字） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MOCKS = path.resolve(__dirname, '..');
const ROOT = path.resolve(__dirname, '../../..');
const PORT = +(process.env.PORT || 4672);
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
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};
const MOUNTS = [
  ['/fonts/noto/', path.join(ROOT, 'public/fonts/noto-serif-sc')],
  // 包里那几份 CSS 用的是 ./files/… 相对路径，所以挂包根目录，不能只挂 files/
  ['/fonts/plex/', path.join(ROOT, 'node_modules/@fontsource/ibm-plex-mono')],
  ['/three/', path.join(ROOT, 'node_modules/three')],
  ['/', MOCKS],
];

const json = (res, obj, code = 200) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
};

/** 导出那份 glb 的字节账（文件是本目录里 .export.mjs 产出的） */
function glbInfo() {
  const f = path.join(__dirname, 'star.glb');
  if (!fs.existsSync(f)) return { missing: true };
  const b = fs.readFileSync(f);
  return {
    bytes: b.length,
    gzip: zlib.gzipSync(b, { level: 9 }).length,
    sha256: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16),
    at: new Date(fs.statSync(f).mtimeMs).toISOString(),
  };
}

function start(port = PORT) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') {
      res.writeHead(302, { Location: '/star-model/' });
      return res.end();
    }
    if (url === '/glb.json') return json(res, glbInfo());
    /* 离线几何账（.probe.mjs 产出）：页面「读数」一节直接读它，不另算一套 */
    if (url === '/probe.json') {
      const f = path.join(__dirname, '.shots/probe.json');
      if (!fs.existsSync(f)) return json(res, { missing: true }, 204);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
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

if (require.main === module) start().then((s) => console.log(`http://localhost:${s.address().port}/star-model/`));
module.exports = { start };