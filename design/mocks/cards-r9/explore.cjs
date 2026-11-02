/* 漫游视图 + 深栏阅读窗的验收截图。
   node design/mocks/cards-r9/explore.cjs [tag] [base]
   → design/mocks/cards-r9/<tag>/{07-explore,08-open-moment}.png */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TAG = process.argv[2] || 'before';
const BASE = process.argv[3] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, TAG);
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r9-ex-'));
  const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const evalv = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const shot = async (tag) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${tag}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  };
  const nav = async (url, wait = 6500) => {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(wait);
  };

  await nav(`${BASE}/articles/`);

  // 漫游：点顶上那个「漫游」视图开关
  await evalv(`(() => { const b = document.querySelector('.w-views [data-view="explore"]'); if (b) b.click(); return !!b; })()`);
  await sleep(2600);
  await shot('07-explore');

  // 回到检索，点一张「瞬间」的图卡——看图在纸上的样子与深栏的阅读窗
  await nav(`${BASE}/moments/`);
  const pt = await evalv(`(() => {
    const el = [...document.querySelectorAll('.w-card')].find((e) => e.dataset.lod === '0' && e.getBoundingClientRect().width > 250);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.5 };
  })()`);
  if (!pt) throw new Error('没有找到清楚的窗口');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
  await sleep(300);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  await shot('08-open-moment');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(900);

  // 随笔页里点一张「项目」的窗：面板的纸色跟不跟得上另一栏
  await evalv("localStorage.setItem('wander.view','grid')");
  await nav(`${BASE}/articles/`);
  const pp = await evalv(`(() => {
    const el = [...document.querySelectorAll('.w-space[data-wscene="project"] .w-card')].find((e) => e.dataset.lod === '0' && e.getBoundingClientRect().width > 200);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.4 };
  })()`);
  if (!pp) throw new Error('没有找到清楚的项目窗');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pp.x, y: pp.y, buttons: 0 });
  await sleep(250);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pp.x, y: pp.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pp.x, y: pp.y, button: 'left', clickCount: 1 });
  await sleep(1500);
  await shot('09-open-project-on-essay');

  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
