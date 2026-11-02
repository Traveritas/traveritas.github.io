/* 逐帧记录「看得见的卡」的状态，找切换视图时那一下闪的来源。
   node design/mocks/cards-r9/trace.cjs [base]
   分析：同一张卡在连续帧里，是否出现过 (a) 有透明度但 background-image 里没有那张图（空一帧）
   或 (b) 面的四个值（--w-face-a）在帧间跳了（被挂到别栏的容器里 / 过渡中）。 */
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

const TRACE = `
(() => {
  if (window.__trace) return;
  window.__trace = [];
  let pid = 0;
  const loop = () => {
    const t = Math.round(performance.now());
    for (const el of document.querySelectorAll('.w-card')) {
      if (!el.__pid) el.__pid = ++pid;
      const cs = getComputedStyle(el);
      const o = parseFloat(cs.opacity) || 0;
      if (o < 0.15 || cs.visibility === 'hidden') continue;
      window.__trace.push([
        el.__pid,
        t,
        el.dataset.lod,
        cs.backgroundImage.includes('blob:') ? 1 : 0,
        cs.getPropertyValue('--w-face-a').trim(),
        (el.parentElement && el.parentElement.dataset.wscene) || '',
        +o.toFixed(2),
      ]);
    }
    if (window.__trace.length > 40000) window.__trace = window.__trace.slice(-20000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-r9-trace-'));
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: TRACE });
  await cdp.send('Page.navigate', { url: `${BASE}/articles/` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(4500);
  const trace = await evalv('window.__trace');
  fs.writeFileSync(path.join(__dirname, 'trace.json'), JSON.stringify(trace));
  console.log('samples', trace.length, 'cards', new Set(trace.map((r) => r[0])).size);

  // 逐卡看指纹
  const byCard = new Map();
  for (const r of trace) {
    if (!byCard.has(r[0])) byCard.set(r[0], []);
    byCard.get(r[0]).push(r);
  }
  let emptyFrames = 0, tintJumps = 0, sceneMix = 0;
  for (const [pid, rows] of byCard) {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (a[3] === 1 && b[3] === 0) {
        emptyFrames++;
        console.log('EMPTY', pid, a[1], '->', b[1], a.slice(2), b.slice(2));
      }
      if (a[4] !== b[4] && b[6] > 0.5) {
        tintJumps++;
        if (tintJumps <= 8) console.log('TINT', pid, a[1], '->', b[1], a[4], '→', b[4], 'scene', a[5], '->', b[5]);
      }
      if (a[5] && b[5] && a[5] !== b[5]) sceneMix++;
    }
  }
  console.log('emptyFaceFrames', emptyFrames, 'tintJumps', tintJumps, 'sceneChanges', sceneMix);
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
