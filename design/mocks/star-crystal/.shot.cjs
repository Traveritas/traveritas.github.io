/* 晶体六芒星 · 截图与自检（CDP 直连版，不依赖 puppeteer）
   node design/mocks/star-crystal/.shot.cjs          → design/mocks/star-crystal/.shots/
   ONLY=a,c 只拍一部分；SKIP_MEASURE=1 跳过测算那一张 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message));
        else resolve(m.result);
      } else if (m.method) {
        for (const fn of this.listeners) fn(m);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(fn) { this.listeners.push(fn); }
  close() { this.ws.close(); }
}

const SHOTS = [
  ['01-ground', '?pose=2', { width: 1180, height: 1000 }, 'ground-sec'],
  ['02-layer-cheap', '?pose=2&variant=cheap&steps=12&holdMs=110', { width: 1180, height: 1200 }, 'layer-sec'],
  ['03-layer-refract', '?pose=2&variant=refract&steps=12&holdMs=110', { width: 1180, height: 1200 }, 'layer-sec'],
  ['04-layer-resin', '?pose=2&variant=resin&steps=12&holdMs=110', { width: 1180, height: 1200 }, 'layer-sec'],
  ['05-strip-cheap', '?variant=cheap&steps=12&holdMs=110', { width: 1700, height: 900 }, 'strip-sec'],
  ['06-strip-refract', '?variant=refract&steps=12&holdMs=110', { width: 1700, height: 900 }, 'strip-sec'],
  ['07-strip-resin', '?variant=resin&steps=12&holdMs=110', { width: 1700, height: 900 }, 'strip-sec'],
  ['08-grain', '?variant=cheap&steps=12&holdMs=110', { width: 1300, height: 900 }, 'grain-sec'],
  ['10-strip-8', '?variant=cheap&steps=8&holdMs=160', { width: 1700, height: 900 }, 'strip-sec'],
  ['11-strip-24', '?variant=cheap&steps=24&holdMs=60', { width: 1700, height: 900 }, 'strip-sec'],
  ['30-measure', '?pose=2', { width: 1180, height: 1000 }, 'perf-sec'],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-crystal/`;

  const profile = path.join(process.env.TEMP, 'chrome-star-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--use-angle=d3d11',
    '--force-color-profile=srgb',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 60; i++) {
    try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); }
  }
  if (!up) { console.error('chrome did not start'); process.exit(1); }

  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  const cdp = new CDP(ws);
  const problems = [];
  let current = '';
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      problems.push(`${current} console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      problems.push(`${current} exception: ${d.exception?.description || d.text}`);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      problems.push(`${current} log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const report = {};

  for (const [name, query, vp, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o) || name.includes(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: base + query });
    await sleep(2600);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    let probe = null;
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__star ? window.__star.probe() : null)',
        returnByValue: true,
      });
      probe = r.result.value ? JSON.parse(r.result.value) : null;
    } catch (e) {
      problems.push(`${name} probe failed: ${e.message}`);
    }
    report[name] = probe;

    /* 测算那一段带自己的交互：跑真实测量、把表填上，再截。
   按钮的 click 处理器本身是 async 的，所以直接调它再等表出现。 */
    if (name === '30-measure') {
      try {
        await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const b = document.getElementById('m-btn');
            b.click();
            for (let i = 0; i < 120; i++) {
              await new Promise(r => setTimeout(r, 100));
              if (!document.getElementById('m-table').hidden) return 'done';
            }
            return 'timeout: ' + document.getElementById('m-out').textContent;
          })()`,
          awaitPromise: true, returnByValue: true,
        }).then((x) => {
          report.measureStatus = x.result.value;
          if (x.result.value !== 'done') problems.push(`30-measure status: ${x.result.value}`);
        });
      } catch (e) {
        problems.push(`${name} measure failed: ${e.message}`);
      }
      /* 表填完之后再等一帧，让截图稳定 */
      await sleep(400);
      const tab = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const t = document.getElementById('m-table');
          return t.hidden ? 'hidden' : t.querySelectorAll('tbody tr').length + ' rows';
        })()`,
        returnByValue: true,
      });
      report.measureRows = tab.result.value;
    }

    let clip;
    if (anchor) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return JSON.stringify({x: Math.max(0,b.x-24), y: Math.max(0,b.y-20+window.scrollY), w: b.width+48, h: b.height+44}); })()`,
        returnByValue: true,
      });
      const v = r.result.value ? JSON.parse(r.result.value) : null;
      if (v) clip = { x: v.x, y: v.y, width: Math.min(v.w, vp.width), height: Math.min(v.h, vp.height), scale: 1 };
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      ...(clip ? { clip } : {}),
    });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`shot ${name}`);
  }

  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
  console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno console errors');
  cdp.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });