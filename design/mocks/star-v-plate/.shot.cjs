/* 六芒星 · 板与构造 · 截图与自检（CDP 直连，不依赖 puppeteer）
   node design/mocks/star-v-plate/.shot.cjs        → 全部 → .shots/
   ONLY=01,03 node design/mocks/star-v-plate/.shot.cjs   只拍一部分
   FAST=1        跳过测算与离散度以外的重活（不点按钮、等待更短） */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9374;
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

/* [名字, query, 视口宽, 视口高, 锚点 id] */
const SHOTS = [
  ['01-constructs-edge', '?once&pose=2&mat=edge', 1200, 1600, 'con-stage'],
  ['02-constructs-acrylic', '?once&pose=2&mat=acrylic', 1200, 1600, 'con-stage'],
  ['03-constructs-opaque', '?once&pose=2&mat=opaque', 1200, 1600, 'con-stage'],
  ['04-constructs-spire', '?once&pose=2&mat=edge&profile=spire', 1200, 1600, 'con-stage'],
  ['05-constructs-equal', '?once&pose=2&mat=edge&profile=equal', 1200, 1600, 'con-stage'],
  ['06-dissect', '?once&pose=2', 1900, 1120, 'dis-stage'],
  ['07-strip-tri', '?once&pose=2&con=tri&smat=edge', 1100, 700, 'strip-stage'],
  ['08-strip-spine', '?once&pose=2&con=spine&smat=edge', 1100, 700, 'strip-stage'],
  ['09-strip-mixed', '?once&pose=2&con=mixed&smat=edge', 1100, 700, 'strip-stage'],
  ['10-strip-frame', '?once&pose=2&con=frame&smat=edge', 1100, 700, 'strip-stage'],
  ['11-sizes-tri', '?once&pose=2&con=tri', 1150, 800, 'size-stage'],
  ['12-sizes-mixed', '?once&pose=2&con=mixed', 1150, 800, 'size-stage'],
  ['30-measure', '?once&pose=2', 1200, 1400, 'perf-sec'],
  ['31-spread', '?once&pose=2', 1200, 1200, 'spread-sec'],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-plate/`;

  const profile = path.join(process.env.TEMP, 'chrome-v-plate-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--use-angle=d3d11',
    '--force-color-profile=srgb',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--force-device-scale-factor=2',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 80; i++) {
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

  for (const [name, query, vw, vh, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o) || name.includes(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vw, height: vh, deviceScaleFactor: 2, mobile: false,
    });
    await cdp.send('Page.navigate', { url: base + query });
    await sleep(2200);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    /* 自检：页面暴露的读数（覆盖、对比度、逐字符轮廓一致性） */
    if (name === '01-constructs-edge') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify({parity: window.__star.parity(), probe: window.__star.probe()})',
          returnByValue: true,
        });
        report.check = JSON.parse(r.result.value);
      } catch (e) { problems.push(`parity failed: ${e.message}`); }
    }
    if (name === '11-sizes-tri') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__star.probeSizes())',
          returnByValue: true,
        });
        report.sizes = JSON.parse(r.result.value);
      } catch (e) { problems.push(`sizes failed: ${e.message}`); }
    }

    if (name === '30-measure') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const b = document.getElementById('m-btn'); b.click();
            for (let i = 0; i < 300; i++) {
              await new Promise(r => setTimeout(r, 100));
              if (!document.getElementById('m-table').hidden) return 'done';
            }
            return 'timeout: ' + document.getElementById('m-out').textContent;
          })()`,
          awaitPromise: true, returnByValue: true,
        });
        report.measureStatus = r.result.value;
        if (r.result.value !== 'done') problems.push(`30-measure: ${r.result.value}`);
      } catch (e) { problems.push(`30-measure failed: ${e.message}`); }
      await sleep(300);
    }

    if (name === '31-spread') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const b = document.getElementById('s-btn'); b.click();
            for (let i = 0; i < 400; i++) {
              await new Promise(r => setTimeout(r, 100));
              if (!document.getElementById('s-table').hidden) return 'done';
            }
            return 'timeout';
          })()`,
          awaitPromise: true, returnByValue: true,
        });
        report.spreadStatus = r.result.value;
        if (r.result.value !== 'done') problems.push(`31-spread: ${r.result.value}`);
        const s = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__lastSpread || null)', returnByValue: true,
        });
        report.spread = s.result.value ? JSON.parse(s.result.value) : null;
      } catch (e) { problems.push(`31-spread failed: ${e.message}`); }
      await sleep(300);
    }

    let clip;
    if (anchor) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return JSON.stringify({x: Math.max(0, b.x - 20), y: Math.max(0, b.y - 14 + window.scrollY), w: b.width + 40, h: b.height + 34}); })()`,
        returnByValue: true,
      });
      const v = r.result.value ? JSON.parse(r.result.value) : null;
      if (v) clip = { x: v.x, y: v.y, width: Math.min(v.w, vw), height: v.h, scale: 1 };
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