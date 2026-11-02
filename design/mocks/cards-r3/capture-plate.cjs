/* 从生产页截一张「没有卡片」的底图，给 cards-r3 当固定背景用。
   node design/mocks/cards-r3/capture-plate.cjs
   → design/mocks/cards-r3/shared/plate-1440.png、plate-390.png
   做法：起一个静态服务指向 dist/，用 CDP 打开 /articles/，把 #w-stage（卡片层）藏掉再拍。
   栏头、导航、工具栏、流光都留着——排版与背景是锁定的那一部分。 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '../../..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(__dirname, 'shared');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve(dir) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    const file = path.join(dir, url);
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

class CDP {
  constructor(url) {
    this.seq = 0;
    this.waiting = new Map();
    this.events = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { res, rej } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method && this.events.has(msg.method)) {
        for (const fn of this.events.get(msg.method)) fn(msg.params);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  once(method) {
    return new Promise((res) => {
      const fn = (p) => {
        this.events.get(method).delete(fn);
        res(p);
      };
      if (!this.events.has(method)) this.events.set(method, new Set());
      this.events.get(method).add(fn);
    });
  }
}

async function connect(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page');
      if (page) {
        const cdp = new CDP(page.webSocketDebuggerUrl);
        await cdp.ready;
        return cdp;
      }
    } catch {}
    await sleep(120);
  }
  throw new Error('连不上 CDP');
}

(async () => {
  const server = await serve(DIST);
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r3-plate-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const cdp = await connect(+fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  await cdp.send('Page.enable');
  fs.mkdirSync(OUT, { recursive: true });

  for (const [w, h] of [
    [1440, 900],
    [390, 844],
  ]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 720 });
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/articles/` });
    await Promise.race([loaded, sleep(6000)]);
    await sleep(5200); // 流光着色器起稳 + 换面文字落定
    // 梦态的品牌名每秒轮转一个词，等它停在最好认的那个再拍
    for (let i = 0; i < 48; i++) {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(document.querySelector('[data-brand]') || {}).innerText || ''`,
        returnByValue: true,
      });
      if (String(result.value || '').trim() === 'AveritA') break;
      await sleep(250);
    }
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.getElementById('w-stage');
        if (s) s.style.visibility = 'hidden';
        const v = document.getElementById('w-veil');
        if (v) v.style.display = 'none';
        return true;
      })()`,
    });
    await sleep(600);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `plate-${w}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  }
  chrome.kill();
  server.close();
})().catch((e) => {
  console.error(e.stack || e);
  process.exit(1);
});
