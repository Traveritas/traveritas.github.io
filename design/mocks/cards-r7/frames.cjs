/* 交互帧：把「悬停 → 点击 → 展开 → 收起」逐帧拍下来。
   node design/mocks/cards-r7/frames.cjs <case>
   → design/mocks/cards-r7/.frames/<case>-{01-list,02-hover,03-open-80,04-open-240,05-open-600,06-closed}.png

   约定（案子必须遵守）：
   · 第一张卡片带 `data-card` 属性，且能点开；
   · 点开后按 Esc 能收起。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('./server.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = __dirname;
const OUT = path.join(ROOT, '.frames');
const caseName = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!caseName) {
  console.error('用法: node design/mocks/cards-r7/frames.cjs <case>');
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, caseName, 'index.html'))) {
  console.error('找不到 ' + caseName + '/index.html');
  process.exit(1);
}

class CDP {
  constructor(u) {
    this.seq = 0;
    this.waiting = new Map();
    this.events = new Map();
    this.ws = new WebSocket(u);
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let server;
  try {
    server = await start(4648);
  } catch {
    server = await start(0);
  }
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r7-frames-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
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
  const dbg = +fs.readFileSync(portFile, 'utf8').split('\n')[0];

  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${dbg}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === 'page');
      if (page) break;
    } catch {}
    await sleep(120);
  }
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `http://localhost:${port}/${caseName}/index.html` });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(2500);

  const shot = async (tag) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${caseName}-${tag}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  };

  await shot('01-list');

  const { result } = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('[data-card]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`,
    returnByValue: true,
  });
  const pt = result.value;
  if (!pt) {
    console.error('没有找到 [data-card]');
    process.exit(1);
  }

  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
  await sleep(320);
  await shot('02-hover');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(80);
  await shot('03-open-80');
  await sleep(160);
  await shot('04-open-240');
  await sleep(360);
  await shot('05-open-600');

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(700);
  await shot('06-closed');

  chrome.kill();
  server.close();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
