/* 拍两张“干净”的底色给 mockup 当背景（把右下角那块旧 Ave 藏掉再拍）。
   node design/mocks/ave-r1/ref-shots.cjs [base]
   → design/mocks/ave-r1/ref/bg-explore.png（深色漫游，右下无对话框）
   → design/mocks/ave-r1/ref/bg-dream.png（梦态主页，整页）
   先跑 `npm run dev`（默认 http://127.0.0.1:4321）。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, 'ref');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ave-ref-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{sessionStorage.setItem('xm-boot-seen','1')}catch(e){}",
  });
  const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const nav = async (url, wait = 7000) => {
    await cdp.send('Page.navigate', { url });
    await sleep(wait);
    await ev('document.fonts.ready');
  };
  const shoot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(OUT, name + '.png');
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    console.log(f);
  };

  // 深色漫游：进检索视图后点「漫游」，把 Ave 藏掉再拍
  await nav(`${BASE}/articles/`);
  await ev(`(() => {
    const b = [...document.querySelectorAll('button, a')].find((e) => /漫游/.test(e.textContent || ''));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(2600);
  await ev(`(() => { const g = document.querySelector('#w-veil'); if (g) g.style.background = 'none';
    window.__ave && window.__ave.hide(); return true; })()`);
  await sleep(1400);
  await shoot('bg-explore');

  // 梦态主页：整页换成梦面再拍
  await nav(`${BASE}/`);
  await ev(`document.body.dataset.reality = 'dream'`);
  await sleep(1200);
  await ev(`window.__ave && window.__ave.hide()`);
  await sleep(1200);
  await shoot('bg-dream');

  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
