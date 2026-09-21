// p7-doorcheck 截图验收：桌面各节（梦/醒两态）+ 移动端 + 减动效
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p7-doorcheck.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots';
const PORT = 9781;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SHOTS = [
  { n: 'p7door-hero', q: '', to: 'top' },
  { n: 'p7door-hero-check', q: 'check=1', to: 'top' },
  { n: 'p7door-projects', q: '', to: '#sec-projects' },
  { n: 'p7door-projects-check', q: 'check=1', to: '#sec-projects' },
  { n: 'p7door-essays', q: '', to: '#sec-essays' },
  { n: 'p7door-about', q: '', to: '#sec-about' },
  { n: 'p7door-lab', q: '', to: '#sec-lab' },
  { n: 'p7door-footer', q: '', to: 'bottom' },
  { n: 'p7door-m-hero', q: '', to: 'top', vw: 390, vh: 844, mobile: true },
  { n: 'p7door-m-hero-check', q: 'check=1', to: 'top', vw: 390, vh: 844, mobile: true },
  { n: 'p7door-m-mid', q: '', to: '#sec-essays', vw: 390, vh: 844, mobile: true },
  { n: 'p7door-rm', q: 'reduced=1', to: 'top' },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.p7door'),
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
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    await sleep(2800);
    if (s.to === 'top') await send('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    else if (s.to === 'bottom') await send('Runtime.evaluate', { expression: 'scrollTo(0,document.documentElement.scrollHeight)' });
    else await send('Runtime.evaluate', { expression: 'document.querySelector("' + s.to + '").scrollIntoView(), "ok"' });
    await sleep(1400);
    const st = await send('Runtime.evaluate', { expression: '(window.__p7&&__p7.state())+" err="+(window.__swarmErr||"none")' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.p7door'), { recursive: true, force: true }); } catch (e) {}
})();
