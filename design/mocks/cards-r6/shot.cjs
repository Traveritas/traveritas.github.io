/* cards-r6 · 截图（CDP 版）
   node design/mocks/cards-r6/shot2.cjs                    → 每个案子三张
   node design/mocks/cards-r6/shot2.cjs bevel mist         → 只截指定的
   为什么有这一版：Chrome 的窗口最小宽度约 500px，--window-size=390 会被钳住再裁，
   移动版其实是 500 的布局。这里用 CDP 的 Emulation.setDeviceMetricsOverride 把视口设成真的 390。
   不装任何依赖：node 24 自带 WebSocket + fetch。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(ROOT, '.shots');
const VIEWS = [
  { name: 'list', w: 1440, h: 900, hash: '' },
  { name: 'open', w: 1440, h: 900, hash: '#open' },
  { name: 'detail', w: 1440, h: 900, hash: '#detail' },
  { name: 'mobile', w: 390, h: 844, hash: '' },
];
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const cases = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared')
  .map((d) => d.name)
  .filter((n) => fs.existsSync(path.join(ROOT, n, 'index.html')))
  .filter((n) => !only.length || only.includes(n));

class CDP {
  constructor(url) {
    this.seq = 0;
    this.waiting = new Map();
    this.events = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error('ws error'));
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
  for (let i = 0; i < 60; i++) {
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

async function shoot(cdp, url, file, w, h) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: w < 720,
  });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(120);
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(5000)]);
  // 字体与图片落定再拍
  try {
    await cdp.send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => true)',
      awaitPromise: true,
    });
  } catch {}
  await sleep(450);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

(async () => {
  let server;
  try {
    server = await start(+process.env.PORT || 4647);
  } catch {
    server = await start(0);
  }
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r6-cdp-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const dbgPort = +fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const cdp = await connect(dbgPort);
  await cdp.send('Page.enable');
  console.log('serve → http://localhost:' + port);
  try {
    for (const name of cases) {
      for (const v of VIEWS) {
        const file = path.join(OUT, `${name}-${v.name}.png`);
        await shoot(cdp, `http://localhost:${port}/${name}/index.html${v.hash}`, file, v.w, v.h);
        console.log('  ' + path.relative(process.cwd(), file));
      }
    }
  } finally {
    chrome.kill();
    server.close();
  }
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
