/* 阅读窗的纸：同一篇文章下换几组数，各拍一张，摆在一起比。
   node design/mocks/cards-r9/variants.cjs [base]
   → design/mocks/cards-r9/variants/{a,b,c,d}.png + _compare.png */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, 'variants');
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

/* 四组候选：纸色（上 → 下）与不透明度 */
const V = {
  a: { note: '薄纸（当前）', css: '--w-panel-top: 252 253 255; --w-panel-bot: 228 234 243; --w-panel-a: 0.94; --w-panel-b: 0.975;' },
  b: { note: '厚纸（几乎不透）', css: '--w-panel-top: 252 253 255; --w-panel-bot: 228 234 243; --w-panel-a: 0.985; --w-panel-b: 0.992;' },
  c: { note: '厚纸 + 更沉的纸色', css: '--w-panel-top: 247 250 254; --w-panel-bot: 214 222 234; --w-panel-a: 0.985; --w-panel-b: 0.992;' },
  d: { note: '不透明的纸（没有底下的影子）', css: '--w-panel-top: 250 252 255; --w-panel-bot: 224 231 241; --w-panel-a: 1; --w-panel-b: 1;' },
  e: { note: '这一栏的纸色（不是白）', css: '--w-panel-top: 236 241 248; --w-panel-bot: 215 223 235; --w-panel-a: 0.985; --w-panel-b: 0.992;' },
  f: { note: '这一栏的纸色 + 薄一点', css: '--w-panel-top: 236 241 248; --w-panel-bot: 215 223 235; --w-panel-a: 0.955; --w-panel-b: 0.972;' },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r9-var-'));
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
  const shot = async (file) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(file);
  };

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE}/articles/` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(6200);
  const pt = await evalv(`(() => {
    const el = [...document.querySelectorAll('.w-card')].find((e) => e.dataset.lod === '0' && e.getBoundingClientRect().width > 200);
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height * 0.4 };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(1600);

  const styleId = '__variant';
  for (const [k, v] of Object.entries(V)) {
    await evalv(`(() => {
      let s = document.getElementById('${styleId}');
      if (!s) { s = document.createElement('style'); s.id = '${styleId}'; document.head.appendChild(s); }
      s.textContent = \`.w-rd[data-wscene='essay'] .w-rd-win { ${v.css} }\`;
    })()`);
    await sleep(400);
    await shot(path.join(OUT, `${k}.png`));
  }
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
