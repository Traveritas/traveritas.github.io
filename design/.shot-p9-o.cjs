// p9-o nightfile 截图自验收：桌面四视图 + 阅读页滚动态 + 移动端 + reduced
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p9-o-nightfile.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p9-o';
const PORT = 9794; // 本会话独占；其他并行会话用 9791–9793
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SHOTS = [
  // 桌面 1440×900 · 四视图直达
  { n: 'o-articles',        q: 'view=articles',                          to: 'top' },
  { n: 'o-article',         q: 'view=articles/motif-exploration-log',    to: 'top' },
  { n: 'o-article-mid',     q: 'view=articles/motif-exploration-log',    to: 0.42 },
  { n: 'o-article-hello',   q: 'view=articles/hello-xingmeng',           to: 'top' },
  { n: 'o-projects',        q: 'view=projects',                          to: 'top' },
  { n: 'o-project',         q: 'view=projects/personal-website',         to: 0.30 },
  { n: 'o-project-motifs',  q: 'view=projects/xingmeng-visual-motifs',   to: 'top' },
  // 移动 390×844 · 列表 + 阅读页
  { n: 'o-m-articles',      q: 'view=articles',                          to: 'top', vw: 390, vh: 844, mobile: true },
  { n: 'o-m-article',       q: 'view=articles/motif-exploration-log',    to: 0.35, vw: 390, vh: 844, mobile: true },
  { n: 'o-m-project',       q: 'view=projects/personal-website',         to: 'top', vw: 390, vh: 844, mobile: true },
  // reduced
  { n: 'o-reduced-article', q: 'view=articles/motif-exploration-log&reduced=1', to: 0.4 },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.prof'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  for (const s of SHOTS) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + '?' + s.q });
    await sleep(3000);
    if (typeof s.to === 'number') {
      await send('Runtime.evaluate', { expression:
        'scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*' + s.to + '),"ok"' });
    } else {
      await send('Runtime.evaluate', { expression: 'scrollTo(0,0),"ok"' });
    }
    await sleep(1500);
    const st = await send('Runtime.evaluate', { expression:
      'JSON.stringify(window.__nf||{})+" err="+(window.__swarmErr||"none")' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.prof'), { recursive: true, force: true }); } catch (e) {}
})();
