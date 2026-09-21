// p10-B 滑结 点击特效截图自验收：页面基底 + 冻结四相位 + 连点 + 移动端 + RM + 长按示意
// 独占调试端口 9796（其他并行会话用 979x 段）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-b-slipknot.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-b';
const PORT = 9796;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
// 试按区定位：以 #practice 的包围盒取空白侧坐标（避免与注记/文字重叠）
const RP = "(function(){var r=document.getElementById('practice').getBoundingClientRect();";
const SHOTS = [
  { n: 'b0-page', q: '' },
  { n: 'b1-taut-dream', q: 'face=dream',
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.68),Math.round(r.top+r.height*0.5),{hold:200,face:'dream',freeze:40})})()" },
  { n: 'b2-gather-wake', q: 'face=wake',
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.68),Math.round(r.top+r.height*0.5),{hold:200,face:'wake',freeze:150})})()" },
  { n: 'b3-knot', q: '',
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.68),Math.round(r.top+r.height*0.5),{hold:120,face:'dream',freeze:225})})()" },
  { n: 'b4-slip', q: '',
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.68),Math.round(r.top+r.height*0.5),{hold:160,face:'dream',freeze:300})})()" },
  // 连点 3 次：0ms / +130ms / +260ms 各一次，345ms 抓拍 → 三枚特效分别处于 滑 / 结 / 拢 相位
  { n: 'b5-triple', q: '',
    ev: RP + "return new Promise(function(res){function p(fx,fy,h){__p10.replay(Math.round(r.left+r.width*fx),Math.round(r.top+r.height*fy),{hold:h})}" +
      "p(.5,.3,90);setTimeout(function(){p(.66,.55,150)},130);setTimeout(function(){p(.82,.78,220)},260);" +
      "setTimeout(function(){res('triple')},345);})})()", awaitP: true },
  { n: 'b6-mobile-knot', q: '', vw: 390, vh: 844, mobile: true,
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.5),Math.round(r.top+r.height*0.78),{hold:140,face:'dream',freeze:225})})()" },
  { n: 'b7-rm', q: 'reduced=1',
    ev: RP + "return __p10.replay(Math.round(r.left+r.width*0.5),Math.round(r.top+r.height*0.62),{hold:120,freeze:1})})()" },
  // 长按示意：真实按压 2350ms → 线满全屏宽 + 注记
  { n: 'b8-longpress', q: '', ev: '__p10.press(null,null,2350)', awaitP: true },
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
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    await sleep(2900);
    let evRes = '';
    if (s.ev) {
      const r = await send('Runtime.evaluate', { expression: s.ev, awaitPromise: !!s.awaitP, returnByValue: true });
      evRes = r.result && r.result.result && r.result.result.value;
    }
    await sleep(s.awaitP ? 60 : 160);
    const st = await send('Runtime.evaluate', { expression: '(window.__p10&&__p10.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, '|', evRes, '|', st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
