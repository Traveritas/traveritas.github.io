/* 星体原语 · 截图与自检（CDP，不依赖 puppeteer）
   node design/mocks/star-solid/.shot.cjs [tag]
   需要 serve.cjs 在 4652 上跑着。输出 design/mocks/star-solid/.shots/<tag>-*.png
   顺带收集 console 错误 / 页面异常，写进 .shots/<tag>-report.json */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL || 'http://localhost:4652/star-solid/';
const TAG = process.argv[2] || 'r1';
const OUT = path.join(__dirname, '.shots');
const DP = 9333 + (Number(process.env.DP_OFF) || 0);
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
  const dir = path.join(OUT, '.chrome-profile');
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
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
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
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await S('Page.navigate', { url: URL });
  await sleep(2200);

  const errors = cdp.events
    .filter((e) => (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') || e.method === 'Runtime.exceptionThrown' || (e.method === 'Network.responseReceived' && e.params.response.status >= 400))
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

  /* 整页高度 */
  const metrics = await S('Page.getLayoutMetrics');
  const css = metrics.cssContentSize;
  const docH = Math.ceil(css.height);

  const shot = async (name, { y = 0, h = 1000, w = 1440, full = false, scrollTo = null } = {}) => {
    if (scrollTo != null) {
      await evaluate(`window.scrollTo(0, ${scrollTo}); 1`);
      await sleep(260);
    }
    const params = { format: 'png', captureBeyondViewport: true };
    if (full) params.clip = { x: 0, y: 0, width: w, height: docH, scale: 1 };
    else params.clip = { x: 0, y, width: w, height: h, scale: 1 };
    const { data } = await S('Page.captureScreenshot', params);
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), Buffer.from(data, 'base64'));
    return `${TAG}-${name}.png`;
  };

  /* 逐段截：按 section 的文档坐标切片 */
  const sections = await evaluate(`
    (() => {
      const out = {};
      for (const el of document.querySelectorAll('section, footer')) {
        const r = el.getBoundingClientRect();
        out[el.id || el.tagName.toLowerCase()] = { top: Math.round(r.top + scrollY), h: Math.round(r.height) };
      }
      out.__doc = { h: document.documentElement.scrollHeight };
      return out;
    })()
  `);

  const written = [];
  /* 段内元素名次（第 n 个 .panel / .vcard / .size），用来给每处细节单独取景 */
  const at = async (sel, pad = 22, w = 1440) => {
    const box = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top + scrollY), h: Math.round(r.height) };
      })()
    `);
    if (!box) return null;
    return shot('frame-' + sel.replace(/[^a-z0-9-]/gi, '_'), {
      y: Math.max(0, box.top - pad),
      h: Math.min(docH, box.h + pad * 2),
      w,
    });
  };

  written.push(await shot('00-live', { y: Math.max(0, sections.live.top - 40), h: 420 }));
  written.push(
    await shot('01-turn', {
      y: Math.max(0, sections.turn.top - 40),
      h: Math.min(760, sections.turn.h + 60),
    }),
  );
  written.push(
    await shot('02-hold', {
      y: Math.max(0, sections.hold.top - 40),
      h: Math.min(620, sections.hold.h + 60),
    }),
  );
  written.push(
    await shot('03-size', {
      y: Math.max(0, sections.size.top - 40),
      h: Math.min(720, sections.size.h + 60),
    }),
  );
  written.push(
    await shot('04-variants', {
      y: Math.max(0, sections.body.top - 40),
      h: Math.min(760, sections.body.h + 60),
    }),
  );
  written.push(await shot('full', { full: true, w: 1440 }));

  /* 细节取景：独立文件，方便单独给人看 */
  for (const [sel, name] of [
    ['.sizes', 'detail-sizes'],
    ['#variants', 'detail-variants'],
    ['.yawrow', 'detail-yawrow'],
    ['.rigs', 'detail-rigs'],
  ]) {
    const box = await evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top + scrollY), h: Math.round(r.height), l: Math.round(r.left), w: Math.round(r.width) };
      })()
    `);
    const { data } = await S('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: Math.max(0, box.l - 20), y: Math.max(0, box.top - 18), width: Math.min(1440, box.w + 40), height: box.h + 36, scale: 1 },
    });
    fs.writeFileSync(path.join(OUT, `${TAG}-${name}.png`), Buffer.from(data, 'base64'));
    written.push(`${TAG}-${name}.png`);
  }

  /* 定格动起来之后再看一次（不同的一格） */
  await sleep(430);
  written.push(await shot('02-hold-b', { y: Math.max(0, sections.hold.top - 40), h: 620 }));

  const parity = await evaluate('window.__parity ?? null');
  const symmetry = await evaluate('window.__symmetry ?? null');
  const pageErrs = await evaluate('window.__errs ?? []');

  const report = { url: URL, docH: sections.__doc.h, sections, errors, pageErrs, parity, symmetry, files: written };
  fs.writeFileSync(path.join(OUT, `${TAG}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  ws.close();
  proc.kill();
  await sleep(200);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
