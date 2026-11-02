/* 交互帧（自查用）：悬停 → 点开 → 长到面板 → Esc 收回。
   node design/mocks/cards-r8/frames.cjs [halftone|value] [base]
   → design/mocks/cards-r8/.frames/<v>-{01-list,02-hover,03-open-120,04-open-360,05-open-900,06-closing-160,07-closed}.png */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const V = process.argv[2] === 'value' ? 'value' : 'halftone';
const BASE = process.argv[3] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, '.frames');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r8-frames-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'],
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
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{sessionStorage.setItem('xm-boot-seen','1')}catch(e){}",
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE}/draft/${V === 'value' ? '?v=value' : ''}` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(5200);

  const shot = async (tag) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${V}-${tag}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  };
  const evalv = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  await shot('01-list');

  const pt = await evalv(`(() => {
    const el = document.querySelector('.d-col[data-d-col="essay"] .d-card:not([hidden])');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  })()`);
  if (!pt) throw new Error('找不到第一张随笔卡');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
  await sleep(320);
  await shot('02-hover');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(120);
  await shot('03-open-120');
  await sleep(240);
  await shot('04-open-360');
  await sleep(540);
  await shot('05-open-900');

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(160);
  await shot('06-closing-160');
  await sleep(560);
  await shot('07-closed');

  const after = await evalv(`(() => ({
    sheetHidden: document.getElementById('d-sheet').hidden,
    focus: document.activeElement && (document.activeElement.dataset.key || document.activeElement.id),
    boardInert: document.getElementById('d-board').inert,
    open: document.documentElement.hasAttribute('data-dopen'),
  }))()`);
  console.log(JSON.stringify(after));
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
