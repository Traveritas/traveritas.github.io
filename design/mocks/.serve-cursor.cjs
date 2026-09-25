// 临时静态服务器：仅供本地预览 design/mocks 下的光标四稿（验证完可删）
// 用法：node design/mocks/.serve-cursor.cjs
//        → http://127.0.0.1:8151/cursor-shell.html
//        → http://127.0.0.1:8151/cursor-c-thread.html?probe=1
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname; // design/mocks
const repo = path.resolve(__dirname, '..', '..'); // 仓库根
const PORT = 8151;
const DEFAULT_FILE = 'cursor-shell.html';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/* 稿子本体在 design/mocks 下；稿内 ../../node_modules/... 的本地字体（@fontsource，
   mock 不外链 Google Fonts）会落到仓库根，故第二跳兜底到 repo/node_modules。 */
function resolveTargets(urlPath) {
  const rel = urlPath === '/' ? DEFAULT_FILE : urlPath.replace(/^\/+/, '');
  const out = [];
  const a = path.resolve(root, rel);
  if (a.startsWith(root)) out.push(a);
  const b = path.resolve(repo, rel);
  if (b.startsWith(repo)) out.push(b);
  return out;
}

function send(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return send0(res, 404, 'not found');
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}
function send0(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/favicon.ico') { res.writeHead(204); return res.end(); } // 免得算进控制台错误
    const targets = resolveTargets(urlPath);
    if (!targets.length) return send0(res, 403);
    const tryNext = (i) => {
      if (i >= targets.length) return send0(res, 404, 'not found');
      fs.stat(targets[i], (err, st) => {
        if (err || !st.isFile()) return tryNext(i + 1);
        send(res, targets[i]);
      });
    };
    tryNext(0);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`serving design/mocks on http://127.0.0.1:${PORT}/${DEFAULT_FILE}`));
