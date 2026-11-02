/* 参考页截图：给调研用。
   node design/mocks/refs/snap.cjs <url> <slug> [宽] [高]
   → design/mocks/refs/shots/<slug>.png（默认 1440×900）
   用本机 Chrome + CDP，不装依赖。页面慢就多等，失败会打印原因。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, 'shots');
const [url, slug, w = '1440', h = '900'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!url || !slug) {
  console.error('用法: node design/mocks/refs/snap.cjs <url> <slug> [宽] [高]');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-snap-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      `--window-size=${w},${h}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Chrome 没起来');
  const port = +fs.readFileSync(portFile, 'utf8').split('\n')[0];

  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === 'page');
      if (page) break;
    } catch {}
    await sleep(120);
  }
  if (!page) throw new Error('连不上 CDP');

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: +w,
    height: +h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(5000); // 字体、动效、懒加载
  // 有的站首屏靠滚动触发，推一下再回顶
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 600)' }).catch(() => {});
  await sleep(900);
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' }).catch(() => {});
  await sleep(900);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${slug}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  chrome.kill();
  console.log(file);
})()
  .catch((e) => {
    console.error('截图失败：' + (e.message || e));
    process.exit(1);
  });
