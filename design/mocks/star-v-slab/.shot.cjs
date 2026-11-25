/* 立体星 · 挤出方向 · 截图与自检（CDP 直连，不依赖 puppeteer）
   node design/mocks/star-v-slab/.shot.cjs          → design/mocks/star-v-slab/.shots/
   ONLY=01,05 只拍一部分；SHOT_PORT 可改 CDP 端口。 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = +(process.env.SHOT_PORT || 9371);
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

/* name · query · 视口 · 锚点 section id · 可选的 clip 上限 */
const SHOTS = [
  ['01-candidates', '?mat=resin', { width: 1500, height: 1300 }, 'sec-cand'],
  ['02-candidates-crystal', '?mat=crystal', { width: 1500, height: 1300 }, 'sec-cand'],
  ['03-candidates-edge', '?mat=edge', { width: 1500, height: 1300 }, 'sec-cand'],
  ['10-thickness', '?mat=resin', { width: 1820, height: 1800 }, 'sec-thick'],
  ['11-thickness-crystal', '?mat=crystal', { width: 1820, height: 1800 }, 'sec-thick'],
  ['20-breakdown', '?mat=resin', { width: 1400, height: 1500 }, 'sec-break'],
  ['21-breakdown-crystal', '?mat=crystal', { width: 1400, height: 1500 }, 'sec-break'],
  ['30-strip', '?mat=resin', { width: 1200, height: 900 }, 'sec-strip'],
  ['31-strip-crystal', '?mat=crystal', { width: 1200, height: 900 }, 'sec-strip'],
  ['40-sizes', '?mat=resin', { width: 1400, height: 1000 }, 'sec-size'],
  ['50-axis', '?mat=resin', { width: 1200, height: 1400 }, 'sec-axis'],
  ['51-axis-crystal', '?mat=crystal', { width: 1200, height: 1400 }, 'sec-axis'],
  ['55-cost', '?mat=resin', { width: 1200, height: 900 }, 'sec-cost'],
  ['60-selfcheck', '?mat=resin', { width: 1200, height: 700 }, 'sec-self'],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-slab/`;

  const profile = path.join(process.env.TEMP, 'chrome-star-v-slab-' + Date.now());
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
  let lastQuery = null;

  for (const [name, query, vp, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o) || name.includes(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    if (query !== lastQuery) {
      await cdp.send('Page.navigate', { url: base + query });
      lastQuery = query;
      await sleep(2400);
    } else {
      await sleep(500);
    }
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    let probe = null;
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__slab ? { ok: true, readout: window.__slab.probe().readout, strip: window.__slab.probe().strip } : null)',
        returnByValue: true,
      });
      probe = r.result.value ? JSON.parse(r.result.value) : null;
    } catch (e) {
      problems.push(`${name} probe failed: ${e.message}`);
    }
    report[name] = probe;

    if (name === '60-selfcheck') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: 'document.getElementById("selfcheck").textContent',
          returnByValue: true,
        });
        report.selfcheck = r.result.value;
        console.log('\n--- selfcheck ---\n' + r.result.value + '\n');
      } catch (e) { problems.push(`selfcheck read failed: ${e.message}`); }
    }

    if (name === '55-cost') {
      try {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const b = document.getElementById('m-btn');
            b.click();
            for (let i = 0; i < 200; i++) {
              await new Promise(r => setTimeout(r, 100));
              if (!document.getElementById('h-table').hidden) return 'done';
            }
            return 'timeout: ' + document.getElementById('m-out').textContent;
          })()`,
          awaitPromise: true, returnByValue: true,
        });
        report.costStatus = r.result.value;
        if (r.result.value !== 'done') problems.push(`55-cost status: ${r.result.value}`);
        const c = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__cost || null)',
          returnByValue: true,
        });
        report.cost = c.result.value ? JSON.parse(c.result.value) : null;
        if (report.cost) {
          console.log('\n--- cost ---');
          for (const row of report.cost.rows) {
            console.log(`${row.cand}/${row.mat}  cpu ${row.cpu}  gpu ${row.gpu}  calls ${row.calls}  tris ${row.tris}  programs ${row.programs}`);
          }
          for (const h of report.cost.holdPlan) {
            console.log(`hold ${h.holdMs}ms → ${h.drawsPerSec}/s, ${h.msPerSec} ms/s`);
          }
          console.log('');
        }
      } catch (e) { problems.push(`${name} cost failed: ${e.message}`); }
      await sleep(500);
    }

    let clip;
    if (anchor) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return JSON.stringify({x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 16 + window.scrollY), w: b.width + 32, h: b.height + 32}); })()`,
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
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(problems.length ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });