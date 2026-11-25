/* 六芒星 · 姿态与定格 · 截图与自检（CDP 直连，不依赖 puppeteer）
   node design/mocks/star-v-motion/.shot.cjs        → .shots/*.png
   ONLY=01,03  只拍一部分 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => { console.log(m); };

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
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
      } else if (m.method) { for (const fn of this.listeners) fn(m); }
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

/* 每张：名字、锚点元素、视口、可选的前置脚本 */
const SHOTS = [
  /* 姿态地图是这一页最要紧的证据，所以按它自己的尺寸开视口（2044px），
     不缩、不裁 —— 缩过的地图就判断不了姿态了。 */
  ['01-map', 'mapwrap', { width: 2120, height: 2160 }, null],
  ['03-hero', 'pick', { width: 1000, height: 700 }, null],
  ['04-motions', 'motions', { width: 1240, height: 1500 }, null],
  ['05-frames', 'frames', { width: 1100, height: 620 }, null],
  ['06-sizes', 'sizes', { width: 1000, height: 560 }, null],
  ['07-dark', 'dark', { width: 1000, height: 560 }, null],
  ['08-probe', 'probe', { width: 1000, height: 700 }, null],
  ['09-grain', 'graintable', { width: 1100, height: 900 }, null],
  ['10-page', 'top-of-page', { width: 1240, height: 1000 }, null],
];

(async () => {
  const wd = setTimeout(() => { say('WATCHDOG: 超时'); try { chrome.kill(); } catch {} process.exit(9); }, 240000);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

  say('server…');
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-motion/`;
  say('serving ' + base);

  const profile = path.join(process.env.TEMP, 'chrome-starvm-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--use-angle=d3d11',
    '--force-color-profile=srgb', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  let up = false;
  for (let i = 0; i < 80; i++) {
    try { await req('GET', '/json/version'); up = true; break; } catch { await sleep(250); }
  }
  if (!up) { say('chrome did not start'); process.exit(1); }
  say('chrome up');

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

  for (const [name, anchor, vp] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    if (name === '01-map') await cdp.send('Page.navigate', { url: base });
    /* 只在第一张时导航，后面靠滚动到锚点，省得反复重建 961 格 */
    await sleep(name === '01-map' ? 3200 : 500);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    /* 滚到锚点并等一帧。注意：captureBeyondViewport 的 clip 用的是**页面坐标**，
       所以必须把 scrollX/scrollY 加回去；只写 getBoundingClientRect 的
       视口坐标会截到「滚过去之前」的那一块（踩过一次）。 */
    const box = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const e = document.getElementById(${JSON.stringify(anchor)});
        if (!e) return null;
        e.scrollIntoView({block:'center'});
        const b = e.getBoundingClientRect();
        return JSON.stringify({x: b.x + window.scrollX, y: b.y + window.scrollY, w: b.width, h: b.height});
      })()`, returnByValue: true,
    });
    const v = box.result.value ? JSON.parse(box.result.value) : null;
    await sleep(700);

    let clip;
    if (anchor === 'top-of-page') {
      clip = { x: 0, y: 0, width: vp.width, height: vp.height, scale: 1 };
    } else if (v) {
      const pad = 26;
      /* 地图有自己的宽度，按它开满，不要按视口裁 */
      clip = {
        x: Math.max(0, v.x - pad), y: Math.max(0, v.y - pad),
        width: Math.min(v.w + pad * 2, 2200), height: Math.min(v.h + pad * 2, vp.height), scale: 1,
      };
    }
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}),
    });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    say(`shot ${name}`);
  }

  /* 自检：读一遍页面状态 */
  try {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        audit: window.__star ? window.__star.audit() : null,
        state: window.__star ? window.__star.state() : null,
        tiles: document.querySelectorAll('.hit').length,
        canvases: document.querySelectorAll('canvas').length,
        cards: document.querySelectorAll('.mcard').length,
      })`, returnByValue: true,
    });
    report.page = JSON.parse(r.result.value);
    say('audit ' + JSON.stringify(report.page.audit));
    say('tiles ' + report.page.tiles + ' canvases ' + report.page.canvases + ' cards ' + report.page.cards);
  } catch (e) { problems.push('audit failed: ' + e.message); }

  try {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `window.__star.measure()`,
      awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    report.measure = r.result.value;
    say('measure ' + JSON.stringify(report.measure && report.measure.rows));
  } catch (e) { problems.push('measure failed: ' + e.message); }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...report, problems }, null, 2));
  say(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno console errors');

  clearTimeout(wd);
  cdp.close();
  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });