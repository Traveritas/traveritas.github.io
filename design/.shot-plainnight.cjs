// 素夜落地验收：真实路由（preview 4391）四页 + 中滚态 + 移动端
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4391';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-plainnight';
const PORT = 9796;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) =>
  new Promise((res, rej) => {
    http.get(u, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });

const SHOTS = [
  { n: 'pn-d-articles', p: '/articles/', to: 'top' },
  { n: 'pn-d-article', p: '/articles/motif-exploration-log/', to: 'top' },
  { n: 'pn-d-article-mid', p: '/articles/motif-exploration-log/', to: 0.5 },
  { n: 'pn-d-projects', p: '/projects/', to: 'top' },
  { n: 'pn-d-project', p: '/projects/personal-website/', to: 'top' },
  { n: 'pn-d-project-mid', p: '/projects/xingmeng-visual-motifs/', to: 0.4 },
  { n: 'pn-m-articles', p: '/articles/', to: 'top', vw: 390, vh: 844, mobile: true },
  { n: 'pn-m-article', p: '/articles/hello-xingmeng/', to: 0.3, vw: 390, vh: 844, mobile: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(OUT, '.profile'),
      '--window-size=1440,900', 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let list = null;
  for (let k = 0; k < 80; k++) {
    try {
      list = await getJSON('http://127.0.0.1:' + PORT + '/json');
      if (list && list.some((t) => t.type === 'page')) break;
    } catch (e) {}
    await sleep(250);
  }
  if (!list) {
    console.log('devtools not up');
    try { ch.kill(); } catch (e) {}
    return;
  }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
  };
  const send = (m, p = {}) =>
    new Promise((r) => {
      const k = ++id;
      pend.set(k, r);
      ws.send(JSON.stringify({ id: k, method: m, params: p }));
    });
  await new Promise((r) => {
    ws.onopen = r;
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const errs = {};
  send('Runtime.addBinding', { name: '__pnErr' }).catch(() => {});
  for (const s of SHOTS) {
    const vw = s.vw || 1440;
    const vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', {
      width: vw,
      height: vh,
      deviceScaleFactor: 1,
      mobile: !!s.mobile,
    });
    await send('Page.navigate', { url: BASE + s.p });
    await sleep(2600);
    if (typeof s.to === 'number') {
      await send('Runtime.evaluate', {
        expression:
          'scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ' + s.to + ')',
      });
      await sleep(1300);
    }
    const st = await send('Runtime.evaluate', {
      expression:
        '(function(){var clk=document.querySelector(".rail-clock");return JSON.stringify({clock:clk?clk.textContent:"-", overflowX:document.documentElement.scrollWidth>innerWidth, err:window.__swarmErr||"none"})})()',
    });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    const v = st.result && st.result.result && st.result.result.value;
    errs[s.n] = v;
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, v);
  }
  ws.close();
  try { ch.kill(); } catch (e) {}
  await sleep(400);
  fs.rmSync(path.join(OUT, '.profile'), { recursive: true, force: true });
  console.log('DONE', JSON.stringify(errs));
})();
