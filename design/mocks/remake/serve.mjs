/* 原型静态服务：以仓库根为根（要用 public/fonts 与 src/content 的图）
   node design/mocks/remake/serve.mjs → http://127.0.0.1:4680/design/mocks/remake/ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4680);
http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) {
    const pub = path.join(root, 'public', decodeURIComponent(req.url.split('?')[0]));
    if (pub.startsWith(root) && fs.existsSync(pub) && fs.statSync(pub).isFile()) f = pub;
    else { res.writeHead(404); return res.end('not found'); }
  }
  res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/design/mocks/remake/`));
