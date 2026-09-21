// p11-D 对开 folio 截图自验收：无鼠标初始态 + 冷/暖极位 + 入幕中途帧 + 移动端两态 + RM + 首屏以下收边
// 独占调试端口 9804（p11 并行稿用 9801–9803）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p11-d-folio.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11-d';
const PORT = 9804;
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
    await sleep(s.after || 150);
    const st = await send('Runtime.evaluate', { expression: '(window.__p11&&__p11.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }

  // 桌面 1440×900 —— ?settle 载入即定格入幕末帧（解析期同步，零竞态）
  // 无鼠标初始态：权重居中的完整构图
  await shot({ n: 'd1-initial-d', q: 'settle=1' });
  // 光标极左：醒页权重 1（墨沉、刻度浮现），梦页半降
  await shot({ n: 'd2-wake-d', q: 'settle=1&split=-1' });
  // 光标极右：梦页权重 1（字浮、叠影分离），醒页墨浅
  await shot({ n: 'd3-dream-d', q: 'settle=1&split=1' });
  // 入幕中途帧：定格 1200ms —— 书脊已亮、醒页账目核进中、梦页迟缓升起、提示未落
  await shot({ n: 'd4-boot1200-d', q: 'boot=1200', after: 100 });
  // 移动端 390×844：上下两阕（醒上梦下），权重居中
  await shot({ n: 'd5-mobile-m', q: 'settle=1', vw: 390, vh: 844, mobile: true });
  // 移动端梦权重 1（下阕浮起、叠影分离）
  await shot({ n: 'd6-mobile-dream-m', q: 'settle=1&split=1', vw: 390, vh: 844, mobile: true });
  // reduced-motion：两页直落、权重居中静画
  await shot({ n: 'd7-rm-d', q: 'reduced=1' });
  // 首屏以下：滚到 ~100vh，收边段「随笔」自右页下缘探入，横缝接回
  await shot({ n: 'd8-below-d', q: 'settle=1', prep: async () => {
    await send('Runtime.evaluate', { expression: 'scrollTo(0, innerHeight)' }); }, after: 250 });

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
