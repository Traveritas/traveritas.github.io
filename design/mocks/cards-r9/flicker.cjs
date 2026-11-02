/* 抓一次「主页 → 检索」的过程，逐帧看有没有闪。
   node design/mocks/cards-r9/flicker.cjs [base]
   → design/mocks/cards-r9/flicker/frame-<i>.jpg（每帧一张）+ 终端里每帧与上一帧的差异 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, 'flicker');
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
    this.ws.onmessage = async (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { res, rej } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method && this.events.has(msg.method)) {
        for (const fn of this.events.get(msg.method)) await fn(msg.params);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  on(method, fn) {
    if (!this.events.has(method)) this.events.set(method, new Set());
    this.events.get(method).add(fn);
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
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r9-flicker-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{sessionStorage.setItem('xm-boot-seen','1')}catch(e){}" });
  const evalv = async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(8000);

  const frames = [];
  cdp.on('Page.screencastFrame', async (p) => {
    frames.push({ i: frames.length, t: p.metadata.timestamp, data: p.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1440, everyNthFrame: 1 });
  await sleep(300);
  // 第一次：主页 → 检索
  await evalv(`(() => { const b = document.querySelector('.w-views [data-view="grid"]'); if (b) b.click(); return !!b; })()`);
  await sleep(3000);
  // 回主页，再来一次
  await evalv(`(() => { const b = document.querySelector('.w-home-brand'); b && b.click && b.click(); return true; })()`);
  await evalv(`history.pushState(null,'','/'); dispatchEvent(new PopStateEvent('popstate')); true`);
  await sleep(300);
  await evalv(`(() => { const b = document.querySelector('.w-views [data-view="grid"]'); if (b) b.click(); return !!b; })()`);
  await sleep(3000);
  await cdp.send('Page.stopScreencast');

  frames.forEach((f) => fs.writeFileSync(path.join(OUT, `frame-${String(f.i).padStart(3, '0')}.jpg`), Buffer.from(f.data, 'base64')));
  console.log(`frames: ${frames.length}`);
  console.log(frames.map((f) => f.t.toFixed(3)).join(' '));
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
