/* 星 · 粗细 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-t-width/.shot.cjs [tag]
   需要 serve.cjs 在 4666 上跑着。输出 design/mocks/star-t-width/.shots/<tag>-*.png
   顺带收集 console 错误 / 页面异常 / 各项读数，写进 .shots/<tag>-report.json */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4666/star-t-width/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9371 + (Number(process.env.DP_OFF) || 0);
const PROFILE = path.join(process.env.TEMP || OUT, `chrome-star-t-${process.pid}`);
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
  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--remote-debugging-port=' + DP,
      '--user-data-dir=' + PROFILE,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu-sandbox',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DP}/json/version`);
      const j = await r.json();
      return { proc, wsUrl: j.webSocketDebuggerUrl };
    } catch {
      await sleep(200);
    }
  }
  throw new Error('chrome 没能起来');
}

/* 页面比 1440 宽（九档 200px 要并排），所以用大视口整段取景。 */
const VW = 2200;
const VH = 1200;
const DSF = 1;

(async () => {
  const { proc, wsUrl } = await launch();
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
  await S('Emulation.setDeviceMetricsOverride', {
    width: VW,
    height: VH,
    deviceScaleFactor: DSF,
    mobile: false,
  });

  await S('Page.navigate', { url: URL });
  await sleep(2600);

  const evaluate = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

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

  const docH = await evaluate('document.documentElement.scrollHeight');
  const docW = await evaluate('document.documentElement.scrollWidth');

  /* clip 的 scale 与 deviceScaleFactor 相乘，取 1 就是 CSS 尺寸的图 */
  const shot = async (name, clip) => {
    const { data } = await S('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { ...clip, scale: 1 },
    });
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), Buffer.from(data, 'base64'));
    return `${TAG}-${name}.png`;
  };

  const boxOf = (sel) =>
    evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      })()
    `);

  const elShot = async (sel, name, pad = 20) => {
    const b = await boxOf(sel);
    if (!b) throw new Error('缺元素 ' + sel);
    return shot(name, {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y - pad),
      width: b.w + pad * 2,
      height: b.h + pad * 2,
    });
  };

  const written = [];

  /* 每段一张：按 section 的文档坐标切，宽度取文档实际宽（上限 2190） */
  const sections = await evaluate(`
    (() => {
      const out = {};
      for (const el of document.querySelectorAll('section')) {
        const r = el.getBoundingClientRect();
        out[el.id] = { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return out;
    })()
  `);

  for (const id of ['sweep', 'center', 'sizes', 'readout']) {
    const s = sections[id];
    if (!s) continue;
    written.push(await shot(`sec-${id}`, { x: Math.max(0, s.x - 8), y: Math.max(0, s.y - 8), width: Math.min(docW, s.w + 16), height: s.h + 16 }));
  }

  /* 单独取景：昼面梯、深底梯、中心四联、放大四联、支尾、读数表 */
  written.push(await elShot('#g-bg', 'detail-sweep-bg'));
  written.push(await elShot('#g-deep', 'detail-sweep-deep'));
  written.push(await elShot('#center-row', 'detail-center'));
  written.push(await elShot('#zoom-row', 'detail-zoom'));
  written.push(await elShot('#tail-row', 'detail-tail'));
  written.push(await elShot('.ground:has(#size-row)', 'detail-sizes-win'));
  written.push(await elShot('.ground:has(#size-row-prod)', 'detail-sizes-prod'));
  written.push(await elShot('#tbl', 'detail-table'));

  const data = await evaluate('window.__star ?? null');

  /* 像素自检：每张图不能是整片同色；顺便记下墨点比例 */
  const stats = {};
  for (const f of written) {
    stats[f] = fs.statSync(path.join(OUT, f)).size;
  }

  const report = { url: URL, docW, docH, sections, errors, data, files: written, bytes: stats };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ docW, docH, errors, win: data?.win, prod: data?.prod, files: written, bytes: stats }, null, 2));

  ws.close();
  proc.kill();
  await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exit(1);
});