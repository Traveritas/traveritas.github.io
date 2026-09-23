/* p14-b 收尾核验：① 层序（z −4/−3/−2/−1/≥0）② 无 JS 不白屏（醒面真值 + 静态脑电帧）
   ③ 交互手势：长按 2.2s 入醒 / 1.3s 回梦 / 中途松手退回（读 __p14.state） */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = 'D:/Documents/HTA/My Projects/personal-website';
const OUT = path.join(ROOT, 'design/mocks/.shots-p14-b');
const PORT = 9802, HTTP_PORT = 9822;
const URL_BASE = `http://127.0.0.1:${HTTP_PORT}/design/mocks/p14-b-sampled-eeg.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.resolve(ROOT, '.' + decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
});
(async () => {
  await new Promise((r) => server.listen(HTTP_PORT, '127.0.0.1', r));
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, '.chrome')}`, '--window-size=1440,900'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 60; k++) { try { list = await getJSON(`http://127.0.0.1:${PORT}/json`); if (list.some((t) => t.type === 'page')) break; } catch (e) {} await sleep(250); }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise((r) => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async (x, a) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: !!a })).result.result.value;
  const shot = async (n) => {
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(cap.result.data, 'base64'));
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ① 层序 + 静止截图机位 */
  await send('Page.navigate', { url: URL_BASE + '?ui=0' });
  await sleep(2200);
  console.log('z 序:', await ev('JSON.stringify(window.__p14.z())'));
  console.log('初始态:', await ev('JSON.stringify(window.__p14.state())'));

  /* ③ 手势：长按 2.2s（用合成指针事件走完整个状态机） */
  const hold = async (x, y, ms) => {
    await ev(`(function(){var o={bubbles:true,cancelable:true,clientX:${x},clientY:${y},button:0,pointerId:1,isPrimary:true};
      document.dispatchEvent(new PointerEvent('pointerdown',o));return 1})()`);
    await sleep(ms);
    await ev(`(function(){var o={bubbles:true,cancelable:true,clientX:${x},clientY:${y},button:0,pointerId:1,isPrimary:true};
      document.dispatchEvent(new PointerEvent('pointerup',o));return 1})()`);
    await sleep(1100);
  };
  await hold(1180, 470, 2300);                    // 入醒
  console.log('长按 2.3s 后:', await ev('JSON.stringify(window.__p14.state())'));
  await hold(1180, 470, 1400);                    // 回梦
  console.log('再长按 1.4s 后:', await ev('JSON.stringify(window.__p14.state())'));
  await hold(1180, 470, 900);                     // 中途松手（0.9s < 2.2s）
  console.log('按 0.9s 松手后:', await ev('JSON.stringify(window.__p14.state())'));
  console.log('swarmErr:', await ev('window.__swarmErr'));

  /* ② 无 JS：醒面真值 + 静态脑电线，不白屏 */
  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await send('Page.navigate', { url: URL_BASE });
  await sleep(2500);
  await shot('28-nojs-wake');
  await send('Emulation.setScriptExecutionDisabled', { value: false });

  /* ②b RM：CDP 真减动，脑电单帧静态 */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: URL_BASE + '?ui=0&zone=deep' });
  await sleep(2200);
  console.log('RM 态:', await ev('JSON.stringify(window.__p14.state())'));
  await shot('29-rm-deep-wake');
  ws.close(); try { ch.kill(); } catch (e) {} await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
  server.close();
})();
