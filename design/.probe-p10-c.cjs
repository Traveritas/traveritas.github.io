// 诊断：freezeAt 各毫秒下 .snap 的计算样式（验证负延迟+暂停是否正确 seek）
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-c-onestitch.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-c';
const PORT = 9798;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome-probe'),
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
  await send('Page.navigate', { url: BASE });
  await sleep(2600);
  for (const ms of [0, 50, 195, 330]) {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(' + ms + ')' });
    await sleep(150);
    const r = await send('Runtime.evaluate', { expression:
      '(function(){var el=document.querySelector(".fx .snap");' +
      'if(!el)return "no el";var cs=getComputedStyle(el);' +
      'var r=el.getBoundingClientRect();' +
      'return JSON.stringify({tf:cs.transform,op:cs.opacity,anim:cs.animationName,' +
      'w:el.style.width,ks:el.style.getPropertyValue("--ks"),' +
      'rect:[r.width.toFixed(1),r.height.toFixed(1),r.x.toFixed(0),r.y.toFixed(0)]});})()' });
    console.log(ms + 'ms ->', r.result && r.result.result && r.result.result.value);
    const c = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'probe-' + ms + '.png'), Buffer.from(c.result.data, 'base64'));
    await send('Runtime.evaluate', { expression: '__p10.clearFx()' });
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome-probe'), { recursive: true, force: true }); } catch (e) {}
})();
