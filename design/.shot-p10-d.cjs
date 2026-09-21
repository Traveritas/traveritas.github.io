// p10-D 线头小结（KNOTLET）截图自验收：页面 / 按压中线 / 特效三相位 /
// 连点 / 长按示意 / 双色 / 移动端 / 减动效
// 独占调试端口 9798（其他并行会话用 9791–9797）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-d-knotlet.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-d';
const PORT = 9798;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const SHOTS = [
  // 桌面 1440×900
  { n: 'd1-page-d',      q: '', ev: null },
  { n: 'd2-hold-d',      q: '', ev: "__p10.freezeAt(160,170,470,{mode:'hold'})" },           // 按压中线段已抽出
  { n: 'd3-fx-start-d',  q: '', ev: "__p10.freezeAt(18,620,300,{hold:150})" },               // 特效起手：线段刚开始收拢
  { n: 'd4-fx-mid-d',    q: '', ev: "__p10.freezeAt(200,620,300,{hold:150})" },              // 中段：小结＋环闪
  { n: 'd5-fx-end-d',    q: '', ev: "__p10.freezeAt(400,620,300,{hold:150})" },              // 收尾：散尽中
  { n: 'd6-burst-d',     q: '', ev: "__p10.burst(1330,470,3,130)" },                          // 连点三次（冻结交错相位）
  { n: 'd7-latch-d',     q: '', ev: "__p10.freezeAt(240,700,400,{mode:'latch'})" },          // 长按示意：14px 大结（大兄弟）
  { n: 'd8-warm-d',      q: '', ev: "__p10.freezeAt(200,1220,300,{hold:150,face:'wake'})" }, // 醒面暖色变体（back）
  // 移动端 390×844
  { n: 'd9-mobile-m',    q: '', ev: "__p10.freezeAt(200,195,272,{hold:150})", vw: 390, vh: 844, mobile: true },
  // 减动效
  { n: 'd10-reduced-d',  q: 'reduced=1', ev: "__p10.freezeAt(80,620,300,{hold:150})" },
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
  // 预热：首张截图前先空跑一次导航，让字体与着色器缓存就位（否则 d1 是冷启动态）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(3000);
  for (const s of SHOTS) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    await sleep(2900);
    if (s.ev) {
      const fr = await send('Runtime.evaluate', { expression: s.ev });
      if (fr.exceptionDetails) console.log(s.n, 'EVAL-ERR', JSON.stringify(fr.exceptionDetails.exception || {}));
      await sleep(160);
    }
    const st = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__p10&&__p10.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
