/* 现行对话框的底片（对照用）：去真实站点上让她说一句，拍下那一刻的框。
   node design/mocks/ave-r1/baseline.cjs [base]      → design/mocks/ave-r1/shots/_current/
   先跑 `npm run dev`（默认 http://127.0.0.1:4321）。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, 'shots', '_current');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(u) {
    this.seq = 0;
    this.waiting = new Map();
    this.ws = new WebSocket(u);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      const w = msg.id && this.waiting.get(msg.id);
      if (w) {
        this.waiting.delete(msg.id);
        msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ave-base-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120 && !fs.existsSync(portFile); i++) await sleep(100);
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

  const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const nav = async (url, wait = 7000) => {
    await cdp.send('Page.navigate', { url });
    await sleep(wait);
    await ev('document.fonts.ready');
  };

  const shoot = async (tag) => {
    const full = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, `${tag}.png`), Buffer.from(full.data, 'base64'));
    const box = await ev(`(() => {
      const el = document.querySelector('#ave');
      if (!el || el.hidden) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    })()`);
    if (box) {
      const pad = 30;
      const zoom = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: Math.min(1440, box.width + pad * 2),
          height: Math.min(900, box.height + pad * 2),
          scale: 2,
        },
      });
      fs.writeFileSync(path.join(OUT, `${tag}-zoom.png`), Buffer.from(zoom.data, 'base64'));
    }
    console.log(tag, box);
  };

  const say = async (id, at) => {
    await ev(`window.__ave && window.__ave.say(${JSON.stringify(id)}, ${at ? JSON.stringify(at) : 'undefined'})`);
    await sleep(4200); // 逐字揭开 + 线头 + 碎屑
  };

  // 浅纸（目录页 / 检索视图）
  await nav(`${BASE}/articles/`);
  await say('articles-enter');
  await shoot('01-list');

  // 深色漫游
  await ev(`(() => { const b = document.querySelector('#w-view-link, [data-w-view]'); if (b) b.click(); })()`);
  await sleep(2200);
  await say('articles-enter');
  await shoot('02-explore');

  // 深夜主页
  await nav(`${BASE}/`);
  await say('home-hello');
  await shoot('03-home');

  // 贴元素
  await nav(`${BASE}/articles/`);
  await say('welcome-3', '.ts-star');
  await shoot('04-anchored');

  // 窄屏
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(`${BASE}/articles/`, 8000);
  await say('articles-enter');
  await shoot('05-narrow');

  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
