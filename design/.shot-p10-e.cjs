// p10-e 「走针」截图自验收：页面基底 + 按压生长 + 主拍冻结相位 + 第四拍走针/抽灭多冻结相位
// + 相位图谱 + 真连点 3 次 + 移动端 + 梦面 + RM + 长按示意 + demo 循环
// 独占调试端口 9799（其他并行会话用 9791–9798）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-e-runstitch.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-e';
const PORT = 9799;
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
  // e0 页面基底（无特效）
  await nav('', 1440, 900); await sleep(400); await cap('e0-page-d');

  // e1 按压生长：按住 140ms 抓拍（线段 ~100-160px，-4°；验证按压入口 rAF 重启）
  s = await nav('', 1440, 900);
  await ev('__p10.press(' + s[0].x + ',' + s[0].y + ')');
  await sleep(140); await cap('e1-press-d');
  await ev('__p10.release()'); await sleep(600);

  // e2 主拍 · 甩入中段：冻结 80ms（rotate ~7°，仍在收拢）
  await nav('', 1440, 900); await ev('__p10.freezeAt(80)'); await sleep(300); await cap('e2-whip-d');

  // e3 主拍 · 针脚落定：冻结 215ms（+14° 琥珀线心，14×1.5px）
  await nav('', 1440, 900); await ev('__p10.freezeAt(215)'); await sleep(300); await cap('e3-stitch-d');

  // e4 第四拍 · 走针早期：冻结 310ms（短划1 已滑出就位、短划2 正在滑出、3/4 未起）
  await nav('', 1440, 900); await ev('__p10.freezeAt(310)'); await sleep(300); await cap('e4-run-early-d');

  // e5 第四拍 · 针序就位＋针脚被抽：冻结 505ms（四划就位、本体增亮拉长、短划1 开始闪）
  await nav('', 1440, 900); await ev('__p10.freezeAt(505)'); await sleep(300); await cap('e5-run-seated-d');

  // e6 第四拍 · 抽灭中段：冻结 615ms（本体/短划1 已灭、短划2 正亮、3/4 仍坐）
  await nav('', 1440, 900); await ev('__p10.freezeAt(615)'); await sleep(300); await cap('e6-run-die-mid-d');

  // e7 第四拍 · 末针独闪：冻结 730ms（只剩短划4 亮着，即将熄灭）
  await nav('', 1440, 900); await ev('__p10.freezeAt(730)'); await sleep(300); await cap('e7-run-last-d');

  // e8 相位图谱：同屏冻结四个相位（落定 / 走针 / 就位抽起 / 抽灭），四点各一
  s = await nav('', 1440, 900);
  {
    const p4 = s[3] || { x: s[s.length - 1].x, y: 760 }; /* 右留白列 760px 处兜底空白点 */
    await ev('__p10.freezeAt(215,' + s[0].x + ',' + s[0].y + ',true)');
    await ev('__p10.freezeAt(310,' + s[1].x + ',' + s[1].y + ',true)');
    await ev('__p10.freezeAt(505,' + s[2].x + ',' + s[2].y + ',true)');
    await ev('__p10.freezeAt(615,' + p4.x + ',' + p4.y + ',true)');
  }
  await sleep(300); await cap('e8-atlas-d');

  // e9 真连点 3 次（CDP 鼠标：40ms 按压 / 90ms 间隔；末击后 ~430ms 抓拍＝第三阵走针就位段）
  s = await nav('', 1440, 900);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(40); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(50);
  await mouse('mousePressed', s[1].x, s[1].y); await sleep(40); await mouse('mouseReleased', s[1].x, s[1].y);
  await sleep(50);
  await mouse('mousePressed', s[2].x, s[2].y); await sleep(40); await mouse('mouseReleased', s[2].x, s[2].y);
  await sleep(430); await cap('e9-triple-live-d'); await sleep(900);
  const clicks9 = await ev('__p10.state()'); console.log('e9 after settle:', clicks9);
  await cap('e9b-residue-d'); /* 抽尽后：页面应无痕 */

  // e10 移动端 390x844：真实触点点击（120ms），松手后 ~500ms 抓拍（针序就位）
  s = await nav('', 390, 844, true);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(120); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(500); await cap('e10-mobile-run'); await sleep(500);

  // e11 梦面（暖线缘）：冻结 505ms
  await nav('face=dream', 1440, 900); await ev('__p10.freezeAt(505)'); await sleep(300); await cap('e11-dream-d');

  // e12 reduced-motion：静态定格（针脚＋已就位针序），整组 200ms 淡出中段抓拍
  s = await nav('reduced=1', 1440, 900);
  await ev('__p10.replay(' + s[0].x + ',' + s[0].y + ',{hold:60})');
  await sleep(100); await cap('e12-rm-d');

  // e13 长按示意：按满 2350ms（线全长 + 静态 ◆ + 注记；>260ms 松手不缝不走针）
  s = await nav('', 1440, 900);
  await ev('__p10.press(' + Math.round(1440 / 2) + ',' + Math.round(900 * 0.42) + ')');
  await sleep(2350); await cap('e13-longpress-d');
  await ev('__p10.release()'); await sleep(700); await cap('e13b-after-retract-d');

  // e14 demo=loop：等两拍真实播放，第二拍走针段抓拍（~320ms after release）
  await nav('demo=loop', 1440, 900);
  let n = -1;
  for (let k = 0; k < 100; k++) { const v = JSON.parse(await ev('__p10.state()') || '{}'); if (v.clicks >= 2) { n = v.clicks; break; } await sleep(60); }
  await sleep(320); await cap('e14-demo-loop-d');
  console.log('demo clicks seen:', n);

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
