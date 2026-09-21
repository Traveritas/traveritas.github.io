const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11a-live';
const PORT = 9807;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome3'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  const evalv = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.result.value;
  await send('Page.navigate', { url: 'http://localhost:4399/' });
  await sleep(5000);
  const read = async tag => {
    const r = await evalv(`JSON.stringify({
      tag:'${tag}', y:Math.round(scrollY),
      time:(document.getElementById('rail-time')||{}).textContent,
      stage:(document.getElementById('rail-stage')||{}).textContent,
      dot:(document.querySelector('.rail--night .rail-dot')||{}).style && document.querySelector('.rail--night .rail-dot').style.top,
      bodyStage:document.body.dataset.stage
    })`);
    console.log(r);
  };
  await read('top');
  await evalv('window.scrollTo(0,1300)'); await sleep(700); await read('essays~1300');
  await evalv('window.scrollTo(0,document.documentElement.scrollHeight)'); await sleep(900); await read('bottom');
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome3'), { recursive: true, force: true }); } catch (e) {}
})();
