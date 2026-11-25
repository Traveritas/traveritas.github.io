/* 六芒星 · 弧线力度 · 截图与自检（CDP 直连，不依赖 puppeteer）
   node design/mocks/star-t-arc/.shot.cjs         → .shots/
   ONLY=01,05 只拍一部分 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = +(process.env.SHOT_PORT || 9377);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Chrome 的渲染子进程不随主进程一起退，它们握着 profile 的锁 —— 必须整棵树杀 */
function killTree(cp) {
  return new Promise((res) => {
    if (process.platform === 'win32' && cp.pid) {
      spawn('taskkill', ['/pid', String(cp.pid), '/T', '/F'], { stdio: 'ignore' })
        .on('exit', () => res()).on('error', () => res());
    } else {
      try { cp.kill('SIGKILL'); } catch {}
      res();
    }
  });
}

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

/* name · 视口 · 锚点 section id */
const SHOTS = [
  ['01-ladder', { width: 1620, height: 1500 }, 'sec-ladder'],
  ['02-four', { width: 1500, height: 1100 }, 'sec-four'],
  ['03-centre', { width: 1620, height: 1800 }, 'sec-centre'],
  ['04-sizes', { width: 1400, height: 1400 }, 'sec-size'],
  ['05-readings', { width: 1620, height: 1500 }, 'sec-read'],
  ['10-hero', { width: 1620, height: 1200 }, null],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-t-arc/`;

  const profile = path.join(process.env.TEMP, 'chrome-star-t-arc-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 100; i++) {
    try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); }
  }
  if (!up) { console.error('chrome did not start'); process.exit(1); }

  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  const cdp = new CDP(ws);
  const problems = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      problems.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      problems.push('exception: ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      problems.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const report = {};
  let nav = false;

  for (const [name, vp, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    if (!nav) {
      await cdp.send('Page.navigate', { url: base });
      nav = true;
      await sleep(1600);
      await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
      await sleep(400);
    } else {
      await sleep(350);
    }

    /* 自检：格子数、控制台、字体 */
    const probe = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        cells: document.querySelectorAll('.cell').length,
        svgs: document.querySelectorAll('.cell-star svg').length,
        paths: document.querySelectorAll('.cell-star svg path').length,
        hubs: document.querySelectorAll('.cell-star svg circle').length,
        zeros: [...document.querySelectorAll('.cell-star svg path')].filter(p => !p.getAttribute('d') || p.getAttribute('d').length < 20).length,
        tableRows: document.querySelectorAll('#read-table tbody tr').length,
        curves: [...document.querySelectorAll('.cell-star svg path')].filter(p => p.getAttribute('d').includes('Q')).length,
        serif: document.fonts.check('16px "Noto Serif SC"'),
        readings: !!window.__probeReadings,
      })`,
      returnByValue: true,
    });
    report[name] = JSON.parse(probe.result.value);

    let clip;
    if (anchor) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return JSON.stringify({x: Math.max(0, b.x + window.scrollX - 8), y: Math.max(0, b.y + window.scrollY - 8),
            w: b.width + 16, h: b.height + 16}); })()`,
        returnByValue: true,
      });
      const v = r.result.value ? JSON.parse(r.result.value) : null;
      if (v) clip = { x: v.x, y: v.y, width: v.w, height: v.h, scale: 1 };
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      ...(clip ? { clip } : {}),
    });
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
    console.log(`shot ${name}  ${(buf.length / 1024).toFixed(0)} KB  ` + JSON.stringify(report[name]));
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno console errors');
  cdp.close();
  server.close();
  await killTree(chrome);
  /* 再等一会儿，让文件锁松开 */
  await sleep(600);
  for (let i = 0; i < 6; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    if (!fs.existsSync(profile)) break;
    await sleep(400);
  }
  process.exit(problems.length ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });