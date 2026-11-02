/* 探针：把第一张清楚卡的算出来的样式打出来（--w-face-* / box-shadow / 悬停后的差）。
   node design/mocks/cards-r9/probe.cjs [base] */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r9-probe-'));
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
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE}/articles/` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(6000);
  const evalv = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const out = await evalv(`(() => {
    const el = [...document.querySelectorAll('.w-card')].find((e) => e.dataset.lod === '0' && e.getBoundingClientRect().width > 200);
    if (!el) return { none: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      rect: [r.x, r.y, r.width, r.height],
      scene: el.parentElement.dataset.wscene,
      face: cs.getPropertyValue('--w-face').slice(0, 40),
      fa: cs.getPropertyValue('--w-face-a'),
      fb: cs.getPropertyValue('--w-face-b'),
      hi: cs.getPropertyValue('--w-edge-hi'),
      lo: cs.getPropertyValue('--w-edge-lo'),
      ring: cs.getPropertyValue('--w-edge-ring'),
      shadow: cs.boxShadow,
      bgImage: cs.backgroundImage.slice(0, 90),
      hasBefore: getComputedStyle(el, '::before').height,
      radius: cs.borderRadius,
    };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  // 悬停：确认 .hot 挂上了、::before 亮起来、四个颜色值走到了 hov 那一组
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: out.rect[0] + out.rect[2] / 2, y: out.rect[1] + out.rect[3] * 0.4, buttons: 0 });
  await sleep(420);
  const hov = await evalv(`(() => {
    const el = [...document.querySelectorAll('.w-card')].find((e) => e.classList.contains('hot'));
    if (!el) return { hot: false };
    const cs = getComputedStyle(el);
    return {
      hot: true,
      fa: cs.getPropertyValue('--w-face-a'),
      fb: cs.getPropertyValue('--w-face-b'),
      hi: cs.getPropertyValue('--w-edge-hi'),
      lit: getComputedStyle(el, '::before').opacity,
      litH: getComputedStyle(el, '::before').height,
    };
  })()`);
  console.log('HOVER ' + JSON.stringify(hov));
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
