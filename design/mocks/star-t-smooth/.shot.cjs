/* 平滑程度 · 截图（CDP，不依赖 puppeteer）
   node design/mocks/star-t-smooth/.shot.cjs [tag]
   前提：serve.cjs 已在 4668 上跑着。
   输出：.shots/<tag>-*.png 与 <tag>-report.json（console 报错 / 段坐标 / 页内读数）
   顺手把窗口宽度、页面高度记下来，方便回看时确认截的是哪一块。 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4668/star-t-smooth/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9401 + (Number(process.env.DP_OFF) || 0);
const W = Number(process.env.W || 1440);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    this.events = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { res, rej } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => {
        if (this.waiting.has(id)) {
          this.waiting.delete(id);
          rej(new Error('timeout ' + method));
        }
      }, 30000);
    });
  }
}

async function launch() {
  const dir = path.join(process.env.TEMP || OUT, 'sts-chrome-' + process.pid);
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--remote-debugging-port=' + DP,
      '--user-data-dir=' + dir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu-sandbox',
      '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DP}/json/version`);
      const j = await r.json();
      return { proc, wsUrl: j.webSocketDebuggerUrl, dir };
    } catch {
      await sleep(200);
    }
  }
  throw new Error('chrome 没能起来');
}

(async () => {
  const { proc, wsUrl, dir } = await launch();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Network.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: W, height: Number(process.env.H || 1000), deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: URL });
  await sleep(2600);

  const errors = cdp.events
    .filter(
      (e) =>
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Network.responseReceived' && e.params.response.status >= 400),
    )
    .map((e) => {
      if (e.method === 'Network.responseReceived') return `HTTP ${e.params.response.status} ${e.params.response.url}`;
      if (e.method === 'Log.entryAdded') return `${e.params.entry.source}: ${e.params.entry.text}`;
      const d = e.params.exceptionDetails;
      return `exception: ${d.text} ${d.exception?.description || ''}`;
    });

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  const sections = await evaluate(`
    (() => {
      const out = {};
      for (const el of document.querySelectorAll('section')) {
        const r = el.getBoundingClientRect();
        out[el.id] = { top: Math.round(r.top + scrollY), h: Math.round(r.height) };
      }
      return { s: out, doc: document.documentElement.scrollHeight, ready: window.__ready === true };
    })()
  `);

  const shot = async (name, box) => {
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: box });
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), Buffer.from(data, 'base64'));
    return `${TAG}-${name}.png`;
  };

  const docH = sections.doc;
  const written = [];
  const cap = async (name, top, h) => {
    const y = Math.max(0, Math.min(top, docH - 10));
    const hh = Math.min(h, docH - y);
    written.push(await shot(name, { x: 0, y, width: W, height: hh, scale: 1 }));
  };

  const order = [
    'live',
    'k1-tip',
    'k2-spine',
    'k3-rim',
    'k4-section',
    'k5-tone',
    'presets',
    'centre',
    'sizes',
    'readout',
  ];
  for (const id of order) {
    const s = sections.s[id];
    if (!s) continue;
    await cap(id, s.top - 24, s.h + 52);
  }
  written.push(await shot('full', { x: 0, y: 0, width: W, height: docH, scale: 1 }));

  const readout = await evaluate('window.__readout ?? null');
  const report = { url: URL, docH, sections: sections.s, errors, readout, files: written, width: W };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors, files: written, docH, readout: !!readout }, null, 2));

  ws.close();
  proc.kill();
  await sleep(200);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});