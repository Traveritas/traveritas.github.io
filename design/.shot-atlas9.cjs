// 主页图集第 9 轮区域截图验收：hero + #r9 锚点处
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/index.html';
const OUT = path.resolve(__dirname, 'index-shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
(async () => {
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=9866', '--user-data-dir=' + path.join(OUT, '.pat'), '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:9866/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: PAGE });
  await sleep(7000);
  const cap1 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  fs.writeFileSync(path.join(OUT, 'atlas-r9-hero.jpg'), Buffer.from(cap1.result.data, 'base64'));
  await send('Runtime.evaluate', { expression: "document.getElementById('r9').scrollIntoView();window.scrollBy(0,-40);'ok'" });
  await sleep(2500);
  const cap2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  fs.writeFileSync(path.join(OUT, 'atlas-r9-round.jpg'), Buffer.from(cap2.result.data, 'base64'));
  const ev = await send('Runtime.evaluate', { expression: "JSON.stringify({imgs:[].filter.call(document.images,function(i){return !i.naturalWidth}).map(function(i){return i.src.split('/').pop()}),rounds:document.querySelectorAll('section.round').length,p7cards:document.querySelectorAll('a[href*=\"p7-\"]').length})" });
  console.log('info', ev.result && ev.result.result && ev.result.result.value);
  console.log('hero', fs.statSync(path.join(OUT, 'atlas-r9-hero.jpg')).size, 'round', fs.statSync(path.join(OUT, 'atlas-r9-round.jpg')).size);
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.pat'), { recursive: true, force: true }); } catch (e) {}
})();
