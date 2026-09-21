// p10-c 「一针」截图自验收：页面基底 + 按压生长 + 三冻结相位 + 连点 + 移动端 + 双色 + RM + 长按示意 + demo 循环
// 独占调试端口 9797（其他并行会话用 9791–9796）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-c-onestitch.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-c';
const PORT = 9797;
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

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result && r.result.result.value;
  };
  const cap = async name => {
    const st = await send('Runtime.evaluate', { expression: '(window.__p10&&__p10.state())' });
    const c = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(c.result.data, 'base64'));
    console.log(name, fs.statSync(path.join(OUT, name + '.png')).size,
      st.result && st.result.result && st.result.result.value);
  };
  const nav = async (q, vw, vh, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width: vw || 1440, height: vh || 900, deviceScaleFactor: 1, mobile: !!mobile });
    await send('Page.navigate', { url: BASE + '?' + q });
    await sleep(2600);
    return JSON.parse(await ev('(window.__p10&&__p10.spots())'));
  };
  const mouse = async (type, x, y) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

  let s;
  // c0 页面基底（无特效）
  await nav('', 1440, 900); await sleep(400); await cap('c0-page-d');

  // c1 按压生长：按住 140ms 抓拍（线段 ~100-160px，-4°）
  s = await nav('', 1440, 900);
  await ev('__p10.press(' + s[0].x + ',' + s[0].y + ')');
  await sleep(140); await cap('c1-press-d');
  await ev('__p10.release()'); await sleep(500);

  // c2 起手相位：冻结 50ms（甩入中段）
  await nav('', 1440, 900); await ev('__p10.freezeAt(50)'); await sleep(300); await cap('c2-fx-whip-d');

  // c3 中段相位：冻结 195ms（针脚落定 +14°，琥珀线心）
  await nav('', 1440, 900); await ev('__p10.freezeAt(195)'); await sleep(300); await cap('c3-fx-stitch-d');

  // c4 收尾相位：冻结 330ms（抽走散尽）
  await nav('', 1440, 900); await ev('__p10.freezeAt(330)'); await sleep(300); await cap('c4-fx-fade-d');

  // c5 三相位图谱（同屏冻结三个相位，三点各一）
  s = await nav('', 1440, 900);
  await ev('__p10.freezeAt(56,' + s[0].x + ',' + s[0].y + ',true)');
  await ev('__p10.freezeAt(195,' + s[1].x + ',' + s[1].y + ',true)');
  await ev('__p10.freezeAt(320,' + s[2].x + ',' + s[2].y + ',true)');
  await sleep(300); await cap('c5-atlas-d');

  // c6 真连点 3 次（CDP 鼠标事件，40ms 按压 / 90ms 间隔，末击后 ~110ms 抓拍）
  s = await nav('', 1440, 900);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(40); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(50);
  await mouse('mousePressed', s[1].x, s[1].y); await sleep(40); await mouse('mouseReleased', s[1].x, s[1].y);
  await sleep(50);
  await mouse('mousePressed', s[2].x, s[2].y); await sleep(40); await mouse('mouseReleased', s[2].x, s[2].y);
  await sleep(110); await cap('c6-triple-live-d'); await sleep(600);
  const clicks6 = await ev('__p10.state()'); console.log('c6 after settle:', clicks6);
  await cap('c6b-residue-d'); /* 散尽后：页面应无痕 */

  // c7 移动端 390x844：真实触点点击，落针相位抓拍（松手后 ~210ms）
  s = await nav('', 390, 844, true);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(120); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(210); await cap('c7-mobile-stitch'); await sleep(500);

  // c8 梦面（暖线尾）：冻结针脚相位
  await nav('face=dream', 1440, 900); await ev('__p10.freezeAt(195)'); await sleep(300); await cap('c8-dream-d');

  // c9 reduced-motion：静态针脚仅淡出（按压 60ms 松手，淡出中段抓拍）
  s = await nav('reduced=1', 1440, 900);
  await ev('__p10.replay(' + s[0].x + ',' + s[0].y + ',{hold:60})');
  await sleep(100); await cap('c9-rm-d');

  // c10 长按示意：按满 2350ms（线全长 + 静态 ◆ + 注记）
  s = await nav('', 1440, 900);
  await ev('__p10.press(' + Math.round(1440 / 2) + ',' + Math.round(900 * 0.42) + ')');
  await sleep(2350); await cap('c10-longpress-d');
  await ev('__p10.release()'); await sleep(600);

  // c11 demo=loop：等两拍真实播放，第二拍（梦面）落针相位抓拍
  await nav('demo=loop', 1440, 900);
  let n = -1;
  for (let k = 0; k < 100; k++) { const v = JSON.parse(await ev('__p10.state()') || '{}'); if (v.clicks >= 2) { n = v.clicks; break; } await sleep(60); }
  await sleep(170); await cap('c11-demo-loop-d');
  console.log('demo clicks seen:', n);

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
