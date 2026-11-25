/* 定格控件的交互自检（CDP）：点格数 / 拖停留 / 切「关（连续）」，读回状态。
   node design/mocks/star-solid/.verify.cjs
   需要 serve.cjs 在 4652 上。结果打印成 JSON，并写 .shots/verify.json */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:4652/star-solid/';
const OUT = path.join(__dirname, '.shots');
const DP = 9481;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    this.events = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
      setTimeout(() => this.waiting.has(id) && (this.waiting.delete(id), rej(new Error('timeout ' + method))), 20000);
    });
  }
}

(async () => {
  const dir = path.join(OUT, '.chrome-profile');
  const proc = spawn(
    CHROME,
    ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + DP, '--user-data-dir=' + dir, '--no-first-run', 'about:blank'],
    { stdio: 'ignore' },
  );
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${DP}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await S('Page.navigate', { url: URL });
  await sleep(2000);

  const ev = async (expr) => {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  const out = {};

  /* 1) 格数：逐个点，读 __rig 与显示 */
  out.steps = [];
  for (const n of [8, 12, 16, 24]) {
    await ev(`document.querySelector('#seg-steps button[data-n="${n}"]').click(); 1`);
    await sleep(220);
    out.steps.push(
      await ev(`({
        want: ${n},
        rig: window.__rig.steps,
        pressed: [...document.querySelectorAll('#seg-steps button')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.n),
        sub: document.querySelector('#rig-step-sub').textContent,
        period: document.querySelector('#period').textContent,
        paths: document.querySelectorAll('#rig-step svg > *').length,
      })`),
    );
  }

  /* 2) 停留时长 */
  await ev(`(() => { const h = document.querySelector('#hold'); h.value = '200'; h.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  out.hold200 = await ev(
    `({ rig: window.__rig.hold, label: document.querySelector('#hold-v').textContent, period: document.querySelector('#period').textContent, sub: document.querySelector('#rig-step-sub').textContent })`,
  );
  await ev(`(() => { const h = document.querySelector('#hold'); h.value = '60'; h.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(200);
  out.hold60 = await ev(`({ rig: window.__rig.hold, label: document.querySelector('#hold-v').textContent, period: document.querySelector('#period').textContent })`);

  /* 3) 定格真的「停住」：在 200ms 一格、24 格里，连续两次 40ms 采样 d 应相同 */
  await ev(`(() => { const h = document.querySelector('#hold'); h.value = '200'; h.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(300);
  const d1 = await ev(`document.querySelector('#rig-step svg > *').getAttribute('d')`);
  await sleep(40);
  const d2 = await ev(`document.querySelector('#rig-step svg > *').getAttribute('d')`);
  out.holds = { sameWithin40ms: d1 === d2, d1: d1.slice(0, 40) };
  /* 再等过一格，应当换掉 */
  await sleep(220);
  const d3 = await ev(`document.querySelector('#rig-step svg > *').getAttribute('d')`);
  out.holds.changedAfterStep = d3 !== d1;

  /* 4) 切「关（连续）」：同一 40ms 内应当变（连续 → 每帧不同） */
  await ev(`document.querySelector('#seg-mode button[data-k="off"]').click(); 1`);
  await sleep(200);
  const e1 = await ev(`document.querySelector('#rig-step svg > *').getAttribute('d')`);
  await sleep(45);
  const e2 = await ev(`document.querySelector('#rig-step svg > *').getAttribute('d')`);
  out.off = {
    changedWithin45ms: e1 !== e2,
    rateLabel: await ev(`document.querySelector('#rate').textContent`),
    pressed: await ev(`[...document.querySelectorAll('#seg-mode button')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.k)`),
  };

  /* 5) 回定格 */
  await ev(`document.querySelector('#seg-mode button[data-k="steps"]').click(); 1`);
  await sleep(400);
  out.backToSteps = await ev(`document.querySelector('#rate').textContent`);

  /* 6) 一致性 / 报错 */
  out.parity = await ev('window.__parity');
  out.symmetry = await ev('window.__symmetry');
  out.notch = await ev('window.__notch');
  out.errs = await ev('window.__errs');
  out.logErrors = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text);

  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  ws.close();
  proc.kill();
  await sleep(150);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});