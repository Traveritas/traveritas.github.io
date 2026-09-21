// 重截 seam-stitch-404：点真实切换钮进入 404 视图，再强制落定入场动画
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/explore/seam-stitch.html';
const OUT = path.join(__dirname, '_shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=9755', '--user-data-dir=' + path.join(OUT, '.p404'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:9755/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: PAGE });
  await sleep(4500);
  await send('Runtime.evaluate', { expression: "(function(){var b=document.querySelector('.switcher button[data-view=\"lost\"]');if(b){b.click()}return 'clicked:'+(!!b)})()" });
  await sleep(1800);
  await send('Runtime.evaluate', { expression: "(function(){document.documentElement.classList.remove('boot');document.documentElement.style.setProperty('--draw','1');[].forEach.call(document.querySelectorAll('.lost-main > *'),function(e){e.style.animation='none';e.style.opacity=1;e.style.transform='none'});window.scrollTo(0,0);return 'forced'})()" });
  await sleep(1400);
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'seam-stitch-404.png'), Buffer.from(cap.result.data, 'base64'));
  console.log('seam-stitch-404', fs.statSync(path.join(OUT, 'seam-stitch-404.png')).size);
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.p404'), { recursive: true, force: true }); } catch (e) {}
})();
