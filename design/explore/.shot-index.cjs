// 总览页自截图：1440×900 首屏 + 全页
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/explore/index.html';
const OUT = path.join(__dirname, '_shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=9766', '--user-data-dir=' + path.join(OUT, '.pidx'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:9766/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
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
  await sleep(6000);
  const ev = await send('Runtime.evaluate', { expression: "JSON.stringify({imgs:[].map.call(document.images,function(i){return i.naturalWidth>0}),h:document.documentElement.scrollHeight})" });
  console.log('info', ev.result && ev.result.result && ev.result.result.value);
  const cap1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'index-hero.png'), Buffer.from(cap1.result.data, 'base64'));
  const cap2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, 'index-full.png'), Buffer.from(cap2.result.data, 'base64'));
  console.log('index-hero', fs.statSync(path.join(OUT, 'index-hero.png')).size, 'index-full', fs.statSync(path.join(OUT, 'index-full.png')).size);
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.pidx'), { recursive: true, force: true }); } catch (e) {}
})();
