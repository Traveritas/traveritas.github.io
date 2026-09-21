// p11-B 夜潮 nighttide 截图自验收：桌面初始态 + 潮相位(涨/平/落)×鼠标扰动(含尾迹半消散) + 移动端 + RM 定格 + 收边
// 独占调试端口 9802（其他并行会话用 9801/9803/9804）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p11-b-nighttide.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11-b';
const PORT = 9802;
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
    await sleep(s.after || 140);
    const st = await send('Runtime.evaluate', { expression: '(window.__p11&&__p11.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }

  // 1) 桌面初始态：无鼠标，潮自呼吸（冻结中位相位 t=2.4，确定性）
  await shot({ n: 'b1-initial-d', q: 'boot=1', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze({t:2.4})' }); } });
  // 2) 潮相位·涨(呼吸峰值)+指针扰动：指针在潮线下方牵引，新尾迹一圈
  await shot({ n: 'b2-high-ptr', q: 'boot=1', prep: async () => {
    await send('Runtime.evaluate', { expression: "__p11.freeze({t:'high',pointer:{x:930,y:505,hold:1400},trail:[{x:850,y:470,age:0.4},{x:892,y:488,age:0.15}]})" }); } });
  // 3) 平潮+尾迹半消散：三枚不同龄尾迹，最老 3.1s 已半散
  await shot({ n: 'b3-trail-half', q: 'boot=1', prep: async () => {
    await send('Runtime.evaluate', { expression: "__p11.freeze({t:6.4,trail:[{x:760,y:560,age:3.1},{x:830,y:540,age:2.2},{x:905,y:575,age:1.2}],pointer:{x:960,y:600,hold:800}})" }); } });
  // 4) 潮相位·落(呼吸谷值)+指针在潮线上方牵引：潮线被拉起弯月面
  await shot({ n: 'b4-low-ptr-bend', q: 'boot=1', prep: async () => {
    await send('Runtime.evaluate', { expression: "__p11.freeze({t:'low',pointer:{x:600,y:360,hold:1600}})" }); } });
  // 5) 移动端 390×844：初始态（冻结中位相位）
  await shot({ n: 'b5-mobile', q: 'boot=1', vw: 390, vh: 844, mobile: true, prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze({t:2.4})' }); } });
  // 6) 移动端+扰动：潮线牵引 + 半散尾迹
  await shot({ n: 'b6-mobile-ptr', q: 'boot=1', vw: 390, vh: 844, mobile: true, prep: async () => {
    await send('Runtime.evaluate', { expression: "__p11.freeze({t:5.0,pointer:{x:230,y:470,hold:900},trail:[{x:180,y:430,age:1.6}]})" }); } });
  // 7) reduced-motion 定格帧：静潮不死潮
  await shot({ n: 'b7-rm', q: 'reduced=1&boot=1' });
  // 8) 收边：滚到首屏之下（页面总高 ~140vh）
  await shot({ n: 'b8-lower', q: 'boot=1', prep: async () => {
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 620)' }); } });

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
