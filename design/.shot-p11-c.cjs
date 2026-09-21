// p11-C 灯下 lantern 截图自验收：初始静灯 + 灯在 4 个显影物上的定格 + 移动端（初始/定格）+ RM + demo 巡游
// 独占调试端口 9803（其他并行稿用 9801/9802/9804）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p11-c-lantern.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11-c';
const PORT = 9803;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
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

  async function shot(s) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    await sleep(3000); // 等字体（CDN 会阻塞脚本 ~1.5s）+ 揭幕 + 灯亮
    if (s.prep) await s.prep(send);
    await sleep(s.after || 350);
    const st = await send('Runtime.evaluate', { expression: '(window.__p11&&__p11.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  // 定格到第 i 个显影物（instant：瞬移 + 冻结呼吸，不依赖 lerp 时钟）
  const goToSpot = i => `(function(){var s=JSON.parse(__p11.spots());var p=s[${i}]||s[0];__p11.setLight(p.x,p.y,{instant:true});return __p11.state();})()`;

  await shot({ n: 'c1-initial-d', q: '', after: 400 });                       // 无鼠标初始态：静灯在文眼（「梦」）
  await shot({ n: 'c2-lamp-manifesto', q: '', prep: async () => {             // R1 镜面宣言
    await send('Runtime.evaluate', { expression: goToSpot(0) }); } });
  await shot({ n: 'c3-lamp-stitch', q: '', prep: async () => {                // R2 纸背绣线（针与结）
    await send('Runtime.evaluate', { expression: goToSpot(1) }); } });
  await shot({ n: 'c4-lamp-seal', q: '', prep: async () => {                  // R3 眠印 + 暖梦
    await send('Runtime.evaluate', { expression: goToSpot(2) }); } });
  await shot({ n: 'c5-lamp-scrolltwin', q: '', prep: async () => {            // R5 越沉越深（右下孪生行）
    await send('Runtime.evaluate', { expression: goToSpot(4) }); } });
  await shot({ n: 'c6-mobile-m', q: '', vw: 390, vh: 844, mobile: true, after: 400 }); // 移动端：静灯文眼
  await shot({ n: 'c7-mobile-lamp', q: '', vw: 390, vh: 844, mobile: true, prep: async () => { // 移动端显影（宣言）
    await send('Runtime.evaluate', { expression: goToSpot(0) }); } });
  await shot({ n: 'c8-rm', q: 'reduced=1', after: 300 });                     // reduced：静灯、无呼吸、静态可读
  await shot({ n: 'c9-demo', q: 'demo=loop', after: 4300 });                  // 巡游中段（灯走遍显影物）

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
