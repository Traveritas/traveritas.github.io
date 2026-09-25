// 临时性能探针：实测主页长按（入梦检验）的掉帧，并对比几个候选修复（验证完可删）
// 用法：node design/mocks/.perf-hold.cjs [页面] [方案] [x] [y] [轮数]
//   例：node design/mocks/.perf-hold.cjs index.html idle,none,F1,F2,F3 700 430 3
//   起 dist 静态服务 + 无头 Chrome(CDP)，用真实 Input 事件长按；每个场景前重载页面
//   （起点恒为梦态首屏），方案间轮转交替以平摊环境漂移。
// 实测结论（1x，主页，各 3 轮）：现状 p50≈39ms / p90≈52ms / 43-49 帧 >33ms；
//   F1(长按暂停 .fld-sq 抽帧) p50≈9ms / p90≈36ms / 20 帧；
//   F2(根变量写节流 15Hz) p50≈9-11ms / p90≈25ms / 5 帧；
//   F3(醒度插值交给 CSS @property+keyframes，JS 停写) p50≈9ms / p90≈28ms / 11 帧。
//   静止对照：p50≈7-9ms / p90≈11-13ms / 0 帧 >33ms。
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const repo = path.resolve(__dirname, '..', '..');
const dist = path.join(repo, 'dist');
const PORT = 8180;
const PAGE = process.argv[2] || 'index.html';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const PX = +(process.argv[4] || 700), PY = +(process.argv[5] || 430);
const CDP_PORT = 9347;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function serve() {
  const srv = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dist)) return res.writeHead(403).end();
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch {}
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) && fs.existsSync(path.join(f, 'index.html'))) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) return res.writeHead(404).end('nf');
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id; const p = { id, method, params };
    if (sessionId) p.sessionId = sessionId;
    this.ws.send(JSON.stringify(p));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
  async eval(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + e.slice(0, 60));
    return r.result.value;
  }
  async metrics() { const r = await this.send('Performance.getMetrics'); const o = {}; for (const m of r.metrics) o[m.name] = m.value; return o; }
}

/* 候选修复：全部通过注入样式/闸门模拟，不改源码 */
const VARIANTS = {
  idle: { label: '静止对照（不按压）', setup: () => "''", noHold: true },
  none: { label: '现状', setup: () => `''` },
  F1: {
    label: 'F1 长按暂停 .fld-sq 抽帧动画',
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-sq{animation-play-state:paused!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F2: {
    label: 'F2 变量写节流 15Hz',
    setup: () => `(() => { const P = CSSStyleDeclaration.prototype, orig = P.setProperty; let last = 0;
      P.setProperty = function (n, v, pr) { if (n === '--reality-mix' || n === '--amber' || n === '--umber' || n === '--ghost-ink' || n === '--dream') {
        const now = performance.now(); if (now - last < 64) return; last = now; } return orig.call(this, n, v, pr); }; return 'ok'; })()`,
  },
  F3: {
    label: 'F3 醒度插值交给 CSS（@property + keyframes），JS 停写',
    setup: () => `(() => {
      const P = CSSStyleDeclaration.prototype, orig = P.setProperty;
      P.setProperty = function (n, v, pr) { if (n === '--reality-mix' || n === '--amber' || n === '--umber' || n === '--ghost-ink' || n === '--dream') return; return orig.call(this, n, v, pr); };
      const s = document.createElement('style');
      s.textContent = '@property --reality-mix{syntax:"<number>";inherits:true;initial-value:0}' +
        'body.reality-holding{animation:xmWake 2200ms linear forwards}' +
        '@keyframes xmWake{from{--reality-mix:0}to{--reality-mix:1}}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F1F3: {
    label: 'F1+F3',
    setup: () => `(() => {
      const P = CSSStyleDeclaration.prototype, orig = P.setProperty;
      P.setProperty = function (n, v, pr) { if (n === '--reality-mix' || n === '--amber' || n === '--umber' || n === '--ghost-ink' || n === '--dream') return; return orig.call(this, n, v, pr); };
      const s = document.createElement('style');
      s.textContent = '@property --reality-mix{syntax:"<number>";inherits:true;initial-value:0}' +
        'body.reality-holding{animation:xmWake 2200ms linear forwards}' +
        '@keyframes xmWake{from{--reality-mix:0}to{--reality-mix:1}}' +
        'body.reality-holding .fld-sq{animation-play-state:paused!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F5: {
    label: 'F5 去掉全站 backdrop-filter 模糊',
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F6: {
    label: 'F6 去毛玻璃 + 冻结首屏纸叠/漂移',
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
        '.ps-leaf,.ps-fore,.drift,.drift-soft{animation-play-state:paused!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F7: {
    label: 'F7 只停 .fld-sq + 去毛玻璃',
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-sq{animation-play-state:paused!important}' +
        '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  F4: {
    label: 'F4 长按期间停掉全场动画（激进对照）',
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding *,body.reality-holding *::before{animation-play-state:paused!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
};

const PROBE = `
window.__probe = { t: [], long: [], on: false };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__probe.long.push(+e.duration.toFixed(1)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
(() => { const tick = () => { if (window.__probe.on) window.__probe.t.push(performance.now()); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })();
'ok'`;

async function run(cdp, key) {
  const v = VARIANTS[key];
  const NOHOLD = !!v.noHold;
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${PAGE}` });
  await sleep(1200);
  for (let i = 0; i < 50; i++) {
    if (await cdp.eval(`document.documentElement.classList.contains('booted') && document.body.dataset.reality==='dream'`)) break;
    await sleep(250);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.eval(PROBE);
  await cdp.eval(v.setup());
  await sleep(4000);
  await cdp.eval(`window.__probe.t.length = 0; window.__probe.long.length = 0; 'x'`);
  const before = await cdp.metrics();
  const t0 = Date.now();
  await cdp.eval(`window.__probe.on = true; 'x'`);
  if (!NOHOLD) await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: PX, y: PY, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await sleep(1200);
  const held = NOHOLD ? { held: null, reality: null } : await cdp.eval(`({ held: document.body.classList.contains('reality-holding'), reality: document.body.dataset.reality })`);
  await sleep(1200);
  if (!NOHOLD) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: PX, y: PY, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
  const wall = (Date.now() - t0) / 1000;
  await cdp.eval(`window.__probe.on = false; 'x'`);
  const after = await cdp.metrics();
  const t = await cdp.eval(`window.__probe.t.slice()`);
  const long = await cdp.eval(`window.__probe.long.slice()`);
  const d = (k) => after[k] - before[k];
  const fr = []; for (let i = 1; i < t.length; i++) fr.push(t[i] - t[i - 1]);
  const s = [...fr].sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
  return {
    name: v.label + (held.held ? " [按压态✓]" : " [未进入按压态✗]"),
    fps: +(t.length / wall).toFixed(1),
    p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), p95: +q(0.95).toFixed(1),
    max: +(s[s.length - 1] || 0).toFixed(0),
    '>33ms帧数': fr.filter((x) => x > 33).length,
    长任务: long.length, 长任务ms: +long.reduce((a, b) => a + b, 0).toFixed(0),
    样式重算ms: +((d('RecalcStyleDuration') * 1000) / wall).toFixed(0),
    布局ms: +((d('LayoutDuration') * 1000) / wall).toFixed(1),
    脚本ms: +((d('ScriptDuration') * 1000) / wall).toFixed(1),
  };
}

(async () => {
  const srv = await serve();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xm-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--remote-allow-origins=*', '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { await sleep(300); try { version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()); } catch {} }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, undefined);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, undefined);
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Performance.enable');

  const rows = [];
  const ROUNDS = +(process.argv[6] || 3);
  for (let round = 0; round < ROUNDS; round++) {
    for (const key of (ONLY || Object.keys(VARIANTS))) rows.push(await run(cdp, key));
  }
  console.log('\n── 1x CPU 下，长按 2400ms 的各候选方案（每项两次，起点均为重载后的梦态首屏） ──');
  console.table(rows);
  chrome.kill(); srv.close(); ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
