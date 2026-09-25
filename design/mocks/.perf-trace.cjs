// 场景对比 trace：真实长按 2.4s，按事件名累计主线程/合成耗时，对比各修法。
// 用法：node design/mocks/.perf-trace.cjs [场景,场景...] [轮数]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const repo = path.resolve(__dirname, '..', '..');
const dist = path.join(repo, 'dist');
const PORT = 8183;
const CDP_PORT = 9351;
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
    this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null; this.chunks = []; this.done = false;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method === 'Tracing.dataCollected') this.chunks.push(...(m.params.value || []));
      else if (m.method === 'Tracing.tracingComplete') this.done = true;
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id; const p = { id, method, params };
    if (sessionId) p.sessionId = sessionId;
    this.ws.send(JSON.stringify(p));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 60000);
    });
  }
  async eval(e) {
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const FIX = {
  /* 现行机制：场读 --reality-mix/--still（逐帧变） */
  base: '',
  /* 修法 A：场与逐帧变量脱钩（类驱动 transition，方块浮动只在梦态静置时存在） */
  'A-class-transition': `.fld-bg{--reality-mix:1;--still:0}
    .fld-sq{animation:none!important;transform:translate3d(var(--fld-tx,0px),var(--fld-ty,0px),0) scale(1);
      transition:transform 1940ms cubic-bezier(.37,0,.63,1)}
    body.reality-holding .fld-sq{transform:translate3d(0,0,0) scale(calc(1 + var(--sq-scale-delta,0)))}
    body.reality-holding .fld-rewind{transform:translate3d(-252px,-63px,0)}`,
  /* 修法 B：长按期间场就地冻结（方块不动、无浮动） */
  'B-freeze': `body.reality-holding .fld-bg{--reality-mix:1;--still:0}
    body.reality-holding .fld-sq{animation-play-state:paused!important}`,
  /* 修法 C：只把 --still 从 keyframes 里摘掉（浮动动画与根变量脱钩），拼合仍走变量 */
  'C-nostill-keyframes': `.fld-sq{animation:none!important}`,
};

const SCENES = {
  base: { url: '', css: FIX.base },
  'no-field': { url: '?fld=off', css: '' },
  'C-noanim': { url: '', css: FIX['C-nostill-keyframes'] },
  /* C1：只把 keyframes 里的 --still 钉死（每帧值不再变，160 个动画照跑） */
  'C1-still-pinned': { url: '', css: '.fld-sq{--still:1!important}' },
  /* C2：再把 160 个 transform/scale 依赖的 --reality-mix 也钉死（值全静止） */
  'C2-pinned-both': { url: '', css: '.fld-sq{--still:1!important}.fld-bg{--reality-mix:1;--still:0}' },
  /* D：动画摘掉 + 场与根变量脱钩（长按期间场静止不动） */
  'D-noanim+pin': { url: '', css: '.fld-sq{animation:none!important}.fld-bg{--reality-mix:1;--still:0}' },
  'B-freeze': { url: '', css: FIX['B-freeze'] },
  'A-class-transition': { url: '', css: FIX['A-class-transition'] },
};

async function run(cdp, key, held) {
  const v = SCENES[key];
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${v.url}` });
  await sleep(1500);
  for (let i = 0; i < 40; i++) { if (await cdp.eval(`document.documentElement.classList.contains('booted')`)) break; await sleep(250); }
  if (v.css) await cdp.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(v.css)}; document.head.appendChild(s); return 'ok'; })()`);
  await sleep(2500);

  cdp.chunks = []; cdp.done = false;
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,benchmark,cc,blink.console', transferMode: 'ReportEvents' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 430, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await sleep(1200);
  if (held) held.ok = await cdp.eval(`document.body.classList.contains('reality-holding')`);
  await sleep(1200);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 430, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
  await cdp.send('Tracing.end');
  for (let i = 0; i < 80 && !cdp.done; i++) await sleep(300);
  const by = {};
  for (const e of cdp.chunks) if (e.dur) by[e.name] = (by[e.name] || 0) + e.dur / 1000;
  const g = (n) => Math.round(by[n] || 0);
  return {
    scene: key,
    进按压: held.ok === undefined ? '-' : (held.ok ? '✓' : '✗'),
    样式重算ms: g('UpdateLayoutTree'),
    动画Tickms: g('AnimationHost::TickAnimations'),
    绘制ms: g('Paint'),
    Layerize: g('Layerize'),
    主帧ms: g('ProxyMain::BeginMainFrame'),
    合成准备ms: g('LayerTreeHostImpl::PrepareToDraw'),
    绘制属性ms: g('LayerTreeImpl::UpdateDrawProperties'),
    DrawFrame: g('DirectRenderer::DrawFrame'),
  };
}

(async () => {
  const srv = await serve();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xm-chrome-'));
  const HEADFUL = !!process.env.HEADFUL;
  const flags = ['--remote-debugging-port=' + CDP_PORT, '--remote-allow-origins=*', '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--force-device-scale-factor=1'];
  if (!HEADFUL) flags.push('--headless=new', '--enable-unsafe-swiftshader');
  flags.push('about:blank');
  const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) { await sleep(300); try { version = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json()); } catch {} }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, undefined);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, undefined);
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');

  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SCENES);
  const ROUNDS = +(process.argv[3] || 2);
  const rows = [];
  for (let r = 0; r < ROUNDS; r++) {
    const order = r % 2 ? [...only].reverse() : only;
    for (const k of order) rows.push(await run(cdp, k, {}));
  }
  console.log('\n── 真实长按 2.4s 内累计耗时（ms，越小越好） ──');
  console.table(rows);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const by = {};
  for (const r of rows) (by[r.scene] ||= []).push(r);
  const keys = Object.keys(rows[0]).filter((k) => k !== 'scene' && k !== '进按压');
  console.log(`── ${ROUNDS} 轮取中位 ──`);
  console.table(Object.entries(by).map(([k, rs]) => Object.fromEntries([['scene', k], ...keys.map((f) => [f, med(rs.map((r) => r[f]))])])));
  chrome.kill(); srv.close(); ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
