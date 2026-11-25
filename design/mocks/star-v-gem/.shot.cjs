/* 星 · 晶体 · 截图与自检（CDP 直连版，不依赖 puppeteer）
   node design/mocks/star-v-gem/.shot.cjs            → design/mocks/star-v-gem/.shots/
   ONLY=01,05 只拍一部分 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9461;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
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

/* [名字, 查询串, 视口, 锚点 id] */
const SHOTS = [
  ['01-geo-crystal', '?mat=crystal', { width: 1660, height: 900 }, 'geo-sec'],
  ['02-geo-resin', '?mat=resin', { width: 1660, height: 900 }, 'geo-sec'],
  ['03-geo-edge', '?mat=edge', { width: 1660, height: 900 }, 'geo-sec'],
  ['04-geo-refract', '?mat=refract', { width: 1660, height: 900 }, 'geo-sec'],
  ['05-geo-iso', '?mat=crystal&base=iso', { width: 1660, height: 900 }, 'geo-sec'],
  ['10-detail', '?mat=crystal', { width: 1660, height: 1560 }, 'detail-sec'],
  ['11-detail-resin', '?mat=resin', { width: 1660, height: 1560 }, 'detail-sec'],
  /* 几何与运动是绑定的：薄几何（starBi/slab）用摆，厚几何用整圈翻。
   见 notes.md §6。 */
  ['20-strip', '?strip=starBi&motion=rock', { width: 1660, height: 700 }, 'strip-sec'],
  ['21-strip-octa', '?strip=octa&motion=flip', { width: 1660, height: 700 }, 'strip-sec'],
  ['22-strip-bud', '?strip=bud&motion=flip', { width: 1660, height: 700 }, 'strip-sec'],
  ['23-strip-blunt', '?strip=blunt&motion=flip', { width: 1660, height: 700 }, 'strip-sec'],
  ['24-strip-flip-fail', '?strip=starBi&motion=flip', { width: 1660, height: 700 }, 'strip-sec'],
  ['30-sizes', '?mat=crystal', { width: 1660, height: 700 }, 'size-sec'],
  ['40-ab', '?mat=crystal', { width: 1660, height: 760 }, 'ab-sec'],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-gem/`;

  const profile = path.join(process.env.TEMP, 'chrome-gem-' + Date.now());
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

  for (const [name, query, vp, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o) || name.includes(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: base + query });
    await sleep(2400);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    let probe = null;
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__gem ? window.__gem.probe() : null)',
        returnByValue: true,
      });
      probe = r.result.value ? JSON.parse(r.result.value) : null;
    } catch (e) {
      problems.push(`${name} probe failed: ${e.message}`);
    }
    report[name] = probe;
    console.log(name, JSON.stringify(probe && probe.geo && probe.geo.cells));

    let clip;
    if (anchor) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return JSON.stringify({x: Math.max(0,b.x-24), y: Math.max(0,b.y-16+window.scrollY), w: b.width+48, h: b.height+40}); })()`,
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
  }

  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
  console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno console errors');
  cdp.close();
  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });