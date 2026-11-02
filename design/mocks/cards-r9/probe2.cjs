/* 一次跑完：逐帧录屏 + 页面里逐帧记卡的状态（时间用 Date.now()，两边对得上），
   用来找「卡面在某一帧是空的」。
   node design/mocks/cards-r9/probe2.cjs [waitMs] [base]
   → design/mocks/cards-r9/probe/{frames.json, trace.json, f###.png} */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WAIT = +(process.argv[2] || 1800);
const BASE = process.argv[3] || 'http://127.0.0.1:4321';
const OUT = path.join(__dirname, 'probe');
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
      const g = JSON.parse(m.data);
      if (g.id && this.waiting.has(g.id)) {
        const { res, rej } = this.waiting.get(g.id);
        this.waiting.delete(g.id);
        g.error ? rej(new Error(g.error.message)) : res(g.result);
      } else if (g.method && this.events.has(g.method)) for (const fn of this.events.get(g.method)) await fn(g.params);
    };
  }
  send(m, p = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method: m, params: p }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  on(m, fn) {
    if (!this.events.has(m)) this.events.set(m, new Set());
    this.events.get(m).add(fn);
  }
  once(m) {
    return new Promise((res) => {
      const fn = (p) => {
        this.events.get(m).delete(fn);
        res(p);
      };
      if (!this.events.has(m)) this.events.set(m, new Set());
      this.events.get(m).add(fn);
    });
  }
}

const TRACE = `
(() => {
  if (window.__t2) return;
  window.__t2 = [];
  let pid = 0;
  const loop = () => {
    const t = Date.now();
    for (const el of document.querySelectorAll('.w-card')) {
      if (!el.__pid) el.__pid = ++pid;
      const cs = getComputedStyle(el);
      const o = parseFloat(cs.opacity) || 0;
      if (o < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40) continue;
      const m = cs.backgroundImage.match(/blob:[^"')]+/);
      window.__t2.push([el.__pid, t, el.dataset.lod, m ? m[0].slice(-6) : '-', +o.toFixed(2),
        Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
`;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'c9p2-'));
  const chrome = spawn(CHROME, ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  const pf = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(pf); i++) await sleep(100);
  const dbg = +fs.readFileSync(pf, 'utf8').split('\n')[0];
  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const l = await fetch(`http://127.0.0.1:${dbg}/json/list`).then((r) => r.json());
      page = l.find((t) => t.type === 'page');
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: TRACE });
  const ev = async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(WAIT);

  const frames = [];
  cdp.on('Page.screencastFrame', async (p) => {
    frames.push({ i: frames.length, t: Math.round(p.metadata.timestamp * 1000), data: p.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(120);
  await ev(`document.querySelector('.w-views [data-view="grid"]').click()`);
  await sleep(2200);
  await cdp.send('Page.stopScreencast');

  frames.forEach((f) => fs.writeFileSync(path.join(OUT, `f${String(f.i).padStart(3, '0')}.png`), Buffer.from(f.data, 'base64')));
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames.map(({ i, t }) => ({ i, t }))));
  fs.writeFileSync(path.join(OUT, 'trace.json'), JSON.stringify(await ev('window.__t2')));
  console.log('frames', frames.length, 'trace', await ev('window.__t2.length'));
  chrome.kill();
  process.exit(0);
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
