// p10-A 回针 backstitch 截图自验收：上下文 + 特效四冻结相位 + 连点 + 长按示意 + 移动端 + RM + 醒面
// 独占调试端口 9795（其他并行会话用 9791–9794）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-a-backstitch.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-a';
const PORT = 9795;
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
    await sleep(2600); // 等字体
    if (s.prep) await s.prep(send);
    await sleep(s.after || 120);
    const st = await send('Runtime.evaluate', { expression: '(window.__p10&&__p10.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }

  // 桌面特效相位统一取 x=1180（正文栏右缘 1168 之外的空白，兼验「贴字不破相」）
  await shot({ n: 'a1-context-d', q: '' });
  await shot({ n: 'a2-snap-t035', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(35,{x:1180,y:470,hold:150})' }); } });
  await shot({ n: 'a3-gather-t160', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(160,{x:1180,y:470,hold:150})' }); } });
  await shot({ n: 'a4-lock-t272', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(272,{x:1180,y:470,hold:150})' }); } });
  await shot({ n: 'a5-sink-t400', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(400,{x:1180,y:470,hold:150})' }); } });
  // 连点 3 次（右侧空白斜排），抓第二针锁定的瞬间：三枚针脚各在一相
  await shot({ n: 'a6-burst', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.replay(1200,420,{hold:120})' });
    await sleep(130);
    await send('Runtime.evaluate', { expression: '__p10.replay(1245,500,{hold:120})' });
    await sleep(130);
    await send('Runtime.evaluate', { expression: '__p10.replay(1210,580,{hold:120})' });
  }, after: 100 });
  // 长按示意：冻结在 900ms 按住态（线 + 注记）
  await shot({ n: 'a7-hold-900', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.holdAt(900,1200,470)' }); } });
  // 移动端 390×844：滚到底，取注脚与站尾之间的空白带
  await shot({ n: 'a8-mobile', q: 'scroll=1', vw: 390, vh: 844, mobile: true, prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(272,{x:195,y:560,hold:150})' }); } });
  // reduced-motion：静止针脚（无动画）
  await shot({ n: 'a9-rm', q: 'reduced=1', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.replay(1050,470,{hold:120})' }); }, after: 60 });
  // 醒面：针脚随全站 --amber 插值转冷灰
  await shot({ n: 'a10-wake-lock', q: 'face=wake', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p10.freezeAt(272,{x:1180,y:470,hold:150})' }); } });

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
