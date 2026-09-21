// p9-m 夜账 截图自验收：桌面四视图 + 滚动态、移动端、reduced-motion
// 独占调试端口 9792（并行会话各用 9791/9793/9794）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p9-m-night-ledger.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p9-m';
const PORT = 9792;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
const SHOTS = [
  { n: 'd-articles',    q: 'view=articles',                      to: 'top',    wait: 3200 },
  { n: 'd-article',     q: 'view=articles/motif-exploration-log', to: 'top',    wait: 3200 },
  { n: 'd-projects',    q: 'view=projects',                      to: 'top',    wait: 3200 },
  { n: 'd-project',     q: 'view=projects/personal-website',     to: 'top',    wait: 4500 },
  { n: 'd-article-mid', q: 'view=articles/motif-exploration-log', to: 0.45,     wait: 3200 },
  { n: 'd-project-mid', q: 'view=projects/personal-website',     to: 0.4,      wait: 4500 },
  { n: 'm-articles',    q: 'view=articles',                      to: 'top',    wait: 3200, vw: 390, vh: 844, mobile: true },
  { n: 'm-article',     q: 'view=articles/motif-exploration-log', to: 'top',    wait: 3200, vw: 390, vh: 844, mobile: true },
  { n: 'rm-article',    q: 'view=articles/motif-exploration-log&reduced=1', to: 'top', wait: 3200 },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.profile'),
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
    /* 等 mock 自检对象就绪（首载字体/CSSOM 可能拖慢脚本），上限 20s */
    for (let w = 0; w < 40 && !(await send('Runtime.evaluate', { expression: '!!window.__p9m' })).result.result.value; w++) {
      await sleep(500);
    }
    await sleep(600);
    if (typeof s.to === 'number') {
      await send('Runtime.evaluate', { expression: 'scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*' + s.to + '),"ok"' });
    } else if (s.to === 'top') {
      await send('Runtime.evaluate', { expression: 'scrollTo(0,0),"ok"' });
    }
    await sleep(1500);
    const st = await send('Runtime.evaluate', { expression: '(window.__p9m&&__p9m.state())+" | overflowX="+(document.documentElement.scrollWidth>innerWidth?"YES":"no")+" sw="+document.documentElement.scrollWidth+"/"+innerWidth' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(500);
  try { fs.rmSync(path.join(OUT, '.profile'), { recursive: true, force: true }); } catch (e) {}
})();
