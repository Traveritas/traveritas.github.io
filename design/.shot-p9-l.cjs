// p9-L nightscore 截图自验收：桌面四视图 + 滚动态 + 移动端 + 减动效
// 独占调试端口 9791（其他并行会话用 9792–9794）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p9-l-nightscore.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p9-l';
const PORT = 9791;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SHOTS = [
  { n: 'l1-articles-d', q: 'view=articles', to: 'top' },
  { n: 'l2-article-d', q: 'view=article', to: 'top' },
  { n: 'l3-projects-d', q: 'view=projects', to: 'top' },
  { n: 'l4-project-d', q: 'view=project', to: 'top' },
  { n: 'l5-article-mid-d', q: 'view=article&scroll=0.55', to: 'keep' },
  { n: 'l6-articles-m', q: 'view=articles', to: 'top', vw: 390, vh: 844, mobile: true },
  { n: 'l7-article-m', q: 'view=article&scroll=0.30', to: 'keep', vw: 390, vh: 844, mobile: true },
  { n: 'l8-reduced-d', q: 'view=article&reduced=1&scroll=0.55', to: 'keep' },
  { n: 'l9-projects-m', q: 'view=projects', to: 'top', vw: 390, vh: 844, mobile: true },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome'),
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
    await sleep(2900);
    if (s.to === 'top') await send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    else if (s.to === 'bottom') await send('Runtime.evaluate', { expression: 'scrollTo(0,document.documentElement.scrollHeight)' });
    await sleep(1100);
    const st = await send('Runtime.evaluate', { expression: '(window.__p9&&__p9.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
