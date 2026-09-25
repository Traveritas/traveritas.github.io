// 临时归因探针：把「长按掉帧」拆成 根变量逐帧写入 / 方块场 / 毛玻璃 三段，逐个隔离实测。
// 用法：node design/mocks/.perf-attr.cjs [场景,场景...] [轮数]
//
// 实测结论（1x CPU，主页梦态首屏，长按 2.4s，4 轮取中位；p50 单位 ms）：
//   静止对照 p50 16.5 / 0 帧 >33ms  |  长按 = p50 39.4 / 42 帧 >33ms / 6 长任务
//   ?fld=off（方块场整片不存在）        → p50 6.9 / 0 帧  ⇒ 掉帧全部来自方块场
//   hold-nobackdrop（全站去毛玻璃）      → 与现状无差别 ⇒ 毛玻璃不是原因
//   hold-hide-guide（隐藏入梦引导玻璃签） → 与现状无差别 ⇒ 新加的引导签不是原因
//   hold-no-willchange（方块去 will-change）→ 无改善
//   idle+vars（只逐帧写根变量，不按压）  → 无方块场时 p50 14，有方块场时 p50 55
//   hold-vars-throttled（根变量降到 15Hz）→ p50 16.5 / 14 帧 ⇒ 只缓解，不根治
//   hold-pauseanim（长按期间 animation-play-state:paused）→ 反而更差（48 帧）：
//     暂停的动画仍逐帧解算 var()，必须让动画**根本不成立**
//   hold-gate（浮动动画只在梦态静置时存在）→ p50 15.3 / 3 帧 / 0 长任务，
//     已落到「方块场不存在」的量级 —— 这就是采纳的修法（Constructs.astro 内）
//   hold-fix-model（把拼合/回溯改成类驱动 transition）→ p50 34：
//     160 条主线程 transition 与 160 条主线程 keyframes 同价，方向不对，勿走
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const repo = path.resolve(__dirname, '..', '..');
const dist = path.join(repo, 'dist');
const PORT = 8181;
const CDP_PORT = 9348;
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
    const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + e.slice(0, 80));
    return r.result.value;
  }
  async metrics() { const r = await this.send('Performance.getMetrics'); const o = {}; for (const m of r.metrics) o[m.name] = m.value; return o; }
}

const VAR_WRITE = `(() => { if (window.__vw) return 'already';
  const root = document.documentElement, A = ['--amber','--umber','--ghost-ink','--dream'];
  window.__vw = true;
  const tick = () => { const t = (performance.now() % 2000) / 2000;
    root.style.setProperty('--reality-mix', t.toFixed(3));
    for (const k of A) root.style.setProperty(k, 'rgb(' + Math.round(150 + t * 20) + ',' + Math.round(160 + t * 10) + ',' + (170 - Math.round(t * 10)) + ')');
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 'ok'; })()`;

const NO_BACKDROP = `(() => { const s = document.createElement('style');
  s.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
  document.head.appendChild(s); return 'ok'; })()`;

const PAUSE_SQ = `(() => { const s = document.createElement('style');
  s.textContent = 'body.reality-holding .fld-sq{animation-play-state:paused!important}';
  document.head.appendChild(s); return 'ok'; })()`;

const SCENES = {
  idle: { url: '', hold: false, setup: () => "''" },
  'idle-nofield': { url: '?fld=off', hold: false, setup: () => "''" },
  'idle+vars': { url: '', hold: false, setup: () => VAR_WRITE },
  'idle+vars-nofield': { url: '?fld=off', hold: false, setup: () => VAR_WRITE },
  hold: { url: '', hold: true, setup: () => "''" },
  'hold-nofield': { url: '?fld=off', hold: true, setup: () => "''" },
  'hold-nobackdrop': { url: '', hold: true, setup: () => NO_BACKDROP },
  'hold-vars-throttled': {
    url: '', hold: true,
    setup: () => `(() => { const P = CSSStyleDeclaration.prototype, orig = P.setProperty; let last = 0;
      P.setProperty = function (n, v, pr) { if (n === '--reality-mix' || n === '--amber' || n === '--umber' || n === '--ghost-ink' || n === '--dream') {
        const now = performance.now(); if (now - last < 64) return; last = now; } return orig.call(this, n, v, pr); }; return 'ok'; })()`,
  },

  /* ── 拆解：哪个变量 / 哪个 CSS 属性在付长按的账 ── */
  'hold-only-mix': {  // 只写 --reality-mix，掐掉 4 个强调色
    url: '', hold: true,
    setup: () => `(() => { const P = CSSStyleDeclaration.prototype, orig = P.setProperty;
      const A = ['--amber','--umber','--ghost-ink','--dream'];
      P.setProperty = function (n, v, pr) { if (A.includes(n)) return; return orig.call(this, n, v, pr); }; return 'ok'; })()`,
  },
  'hold-only-accent': {  // 只写 4 个强调色，掐掉 --reality-mix
    url: '', hold: true,
    setup: () => `(() => { const P = CSSStyleDeclaration.prototype, orig = P.setProperty;
      P.setProperty = function (n, v, pr) { if (n === '--reality-mix') return; return orig.call(this, n, v, pr); }; return 'ok'; })()`,
  },
  'hold-pause-sq': { url: '', hold: true, setup: () => PAUSE_SQ },
  'hold-no-willchange': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '.fld-sq{will-change:auto!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-pause-sq-no-wc': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-sq{animation-play-state:paused!important}.fld-sq{will-change:auto!important}';
      document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-field-frozen': {  // 场子树把两个驱动量就地钉死 ⇒ 方块彻底不再随根变量变
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-bg{--reality-mix:1;--still:0}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-field-frozen-pause': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-bg{--reality-mix:1;--still:0}' +
        'body.reality-holding .fld-sq{animation-play-state:paused!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-field-hidden': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-bg{display:none!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },

  /* ── 机制预演：真实修法的模拟（场只吃类，不读根变量；方块浮动只在梦态静置时存在） ── */
  'hold-fix-model': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = [
        '.fld-bg{--reality-mix:1;--still:0}',
        '.fld-sq{animation:none!important;transform:translate3d(var(--fld-tx,0px),var(--fld-ty,0px),0) scale(1);',
        '  transition:transform 1940ms cubic-bezier(.37,0,.63,1)}',
        'body.reality-holding .fld-sq{transform:translate3d(0,0,0) scale(calc(1 + var(--sq-scale-delta,0)))}',
        '.fld-rewind{transition:transform 1940ms cubic-bezier(.37,0,.63,1)}',
        'body.reality-holding .fld-rewind{transform:translate3d(-252px,-63px,0)}',
      ].join('');
      document.head.appendChild(s); return 'ok'; })()`,
  },
  /* 同上但保留方块浮动动画（只去掉变量耦合），看浮动本身在长按时值不值 */
  'hold-fix-model-keepfloat': {
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = [
        '.fld-bg{--reality-mix:1;--still:0}',
        '.fld-sq{translate:none!important;transform:translate3d(var(--fld-tx,0px),var(--fld-ty,0px),0) scale(1);',
        '  transition:transform 1940ms cubic-bezier(.37,0,.63,1);animation-play-state:paused!important}',
        'body.reality-holding .fld-sq{transform:translate3d(0,0,0) scale(calc(1 + var(--sq-scale-delta,0)))}',
      ].join('');
      document.head.appendChild(s); return 'ok'; })()`,
  },

  /* ── 最小修法候选 ── */
  'hold-noanim': {  // 只摘掉 160 个方块浮动动画，其余机制不动
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '.fld-sq{animation:none!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-pauseanim': {  // 长按期间暂停浮动（梦态静置时仍在跑）
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = 'body.reality-holding .fld-sq{animation-play-state:paused!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-noanim+pin': {  // 摘动画 + 场与根变量脱钩
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '.fld-sq{animation:none!important}.fld-bg{--reality-mix:1;--still:0}'; document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-gate': {  // 浮动动画只在「梦态静置」时存在（醒态与长按期间都不跑）
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '.fld-sq{animation-name:none!important}' +
        "body[data-reality='dream']:not(.reality-holding) .fld-sq{animation-name:fld-sq-float!important}";
      document.head.appendChild(s); return 'ok'; })()`,
  },
  'hold-hide-guide': {  // 排除新加入的入梦检验引导玻璃签
    url: '', hold: true,
    setup: () => `(() => { const s = document.createElement('style');
      s.textContent = '#reality-guide{display:none!important}'; document.head.appendChild(s); return 'ok'; })()`,
  },
};

const PROBE = `
window.__probe = { t: [], long: [], on: false };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__probe.long.push(+e.duration.toFixed(1)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
(() => { const tick = () => { if (window.__probe.on) window.__probe.t.push(performance.now()); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })();
(() => { const q = (s) => document.querySelectorAll(s).length; return { sq: q('.fld-sq'), fld: q('.fld-bg *'), all: q('*'),
  willchange: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).willChange !== 'auto').length,
  bd: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backdropFilter !== 'none').length }; })()`;

async function run(cdp, key) {
  const v = SCENES[key];
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${v.url}` });
  await sleep(1200);
  for (let i = 0; i < 50; i++) {
    if (await cdp.eval(`document.documentElement.classList.contains('booted') && document.body.dataset.reality==='dream'`)) break;
    await sleep(250);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const counts = await cdp.eval(PROBE);
  await cdp.eval(v.setup());
  await sleep(4000);
  await cdp.eval(`window.__probe.t.length = 0; window.__probe.long.length = 0; 'x'`);
  const FLOAT_Q = `(() => { const a = document.getAnimations().filter((x) => x.animationName === 'fld-sq-float'); return { n: a.length, run: a.filter((x) => x.playState === 'running').length }; })()`;
  const floatRest = await cdp.eval(FLOAT_Q);
  const before = await cdp.metrics();
  const t0 = Date.now();
  await cdp.eval(`window.__probe.on = true; 'x'`);
  if (v.hold) await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 430, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await sleep(1200);
  const held = v.hold ? await cdp.eval(`document.body.classList.contains('reality-holding')`) : null;
  const floatHold = await cdp.eval(FLOAT_Q);
  await sleep(1200);
  if (v.hold) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 430, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
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
    scene: key,
    pressed: v.hold ? (held ? '✓' : '✗未进按压') : '-',
    fps: +(t.length / wall).toFixed(1),
    p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(0),
    '>33ms': fr.filter((x) => x > 33).length,
    长任务: long.length,
    样式ms每s: +((d('RecalcStyleDuration') * 1000) / wall).toFixed(0),
    布局ms每s: +((d('LayoutDuration') * 1000) / wall).toFixed(1),
    脚本ms每s: +((d('ScriptDuration') * 1000) / wall).toFixed(1),
    合成ms每s: +((d('CompositeLayers') * 1000) / wall).toFixed(1),
    _nodes: `${counts.sq}方/${counts.fld}场节点/${counts.willchange}willchange/${counts.bd}模糊`,
    _浮动动画: `静置${floatRest.run}/${floatRest.n} 长按${floatHold.run}/${floatHold.n}`,
  };
}

(async () => {
  const srv = await serve();
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xm-chrome-'));
  const HEADFUL = !!process.env.HEADFUL;
  const flags = ['--remote-debugging-port=' + CDP_PORT, '--remote-allow-origins=*', '--user-data-dir=' + userDir, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--window-position=0,0', '--force-device-scale-factor=1'];
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
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Performance.enable');

  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SCENES);
  const ROUNDS = +(process.argv[3] || 2);
  const rows = [];
  for (let r = 0; r < ROUNDS; r++) {
    const order = r % 2 ? [...only].reverse() : only; // 轮转顺序平摊环境漂移
    for (const k of order) rows.push(await run(cdp, k));
  }
  console.log('\n── 归因：1x CPU，主页梦态首屏，每场景 2400ms 窗口 ──');
  console.table(rows);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const by = {};
  for (const r of rows) (by[r.scene] ||= []).push(r);
  console.log(`── 多轮取中位（${ROUNDS} 轮） ──`);
  console.table(
    Object.entries(by).map(([k, rs]) => ({
      scene: k,
      fps: +med(rs.map((r) => r.fps)).toFixed(1),
      p50: +med(rs.map((r) => r.p50)).toFixed(1),
      p90: +med(rs.map((r) => r.p90)).toFixed(1),
      max: med(rs.map((r) => r.max)),
      '>33ms': med(rs.map((r) => r['>33ms'])),
      长任务: med(rs.map((r) => r.长任务)),
      样式ms每s: med(rs.map((r) => r.样式ms每s)),
    })),
  );
  chrome.kill(); srv.close(); ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
