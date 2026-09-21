// p10-g 「走线」截图自验收：页面基底 + 按压 + 主拍三相位 + 第四拍四冻结相位(重点) + 右行变体
// + 图谱 + 连点3次 + 移动端 + 梦面 + RM + demo 循环
// 独占调试端口 9801（其他并行会话用 9791–9800）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-g-runstitch.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-g';
const PORT = 9801;
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
  // g0 页面基底（无特效）
  await nav('', 1440, 900); await sleep(400); await cap('g0-page-d');

  // g1 按压生长：按住 140ms 抓拍（线段 ~100-160px，-4°）
  s = await nav('', 1440, 900);
  await ev('__p10.press(' + s[0].x + ',' + s[0].y + ')');
  await sleep(140); await cap('g1-press-d');
  await ev('__p10.release()'); await sleep(900);

  // g2 主拍相位一：冻结 50ms（甩入中段）
  await nav('', 1440, 900); await ev('__p10.freezeAt(50)'); await sleep(300); await cap('g2-whip-d');

  // g3 主拍相位二：冻结 160ms（过冲 +15.6°）
  await nav('', 1440, 900); await ev('__p10.freezeAt(160)'); await sleep(300); await cap('g3-overshoot-d');

  // g4 主拍相位三：冻结 235ms（针脚坐定 +14°，走线未起）
  await nav('', 1440, 900); await ev('__p10.freezeAt(235)'); await sleep(300); await cap('g4-stitch-d');

  // g5 第四拍相位一：冻结 350ms（s0 已驻留 / s1 滑出中 / s2 未生——走线成形）
  await nav('', 1440, 900); await ev('__p10.freezeAt(350)'); await sleep(300); await cap('g5-run-form-d');

  // g6 第四拍相位二：冻结 470ms（三枚全员驻留，闪灭未起——满走线）
  await nav('', 1440, 900); await ev('__p10.freezeAt(470)'); await sleep(300); await cap('g6-run-full-d');

  // g7 第四拍相位三：冻结 555ms（s2 张紧闪灭中 .48、s1 未起——回收波自远端扫回）
  await nav('', 1440, 900); await ev('__p10.freezeAt(555)'); await sleep(300); await cap('g7-run-twang-d');

  // g8 第四拍相位四：冻结 700ms（卫星尽灭，锚针脚沿轴抽走中 .43）
  await nav('', 1440, 900); await ev('__p10.freezeAt(700)'); await sleep(300); await cap('g8-pull-d');

  // g9 右行走线变体：显式坐标（空白带，x=700 不触发镜像）冻结 470ms
  await nav('', 1440, 900); await ev('__p10.freezeAt(470,700,150)'); await sleep(300); await cap('g9-run-right-d');

  // g10 图谱：三点三相位同屏（甩入 60 / 坐定 235 / 满走线 470）
  s = await nav('', 1440, 900);
  await ev('__p10.freezeAt(60,' + s[0].x + ',' + s[0].y + ',true)');
  await ev('__p10.freezeAt(235,' + s[1].x + ',' + s[1].y + ',true)');
  await ev('__p10.freezeAt(470,' + s[2].x + ',' + s[2].y + ',true)');
  await sleep(300); await cap('g10-atlas-d');

  // g11 真连点 3 次（CDP 鼠标：40ms 按压 / 90ms 间隔；末击后 430ms 抓三段走线并存）
  s = await nav('', 1440, 900);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(40); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(50);
  await mouse('mousePressed', s[1].x, s[1].y); await sleep(40); await mouse('mouseReleased', s[1].x, s[1].y);
  await sleep(50);
  await mouse('mousePressed', s[2].x, s[2].y); await sleep(40); await mouse('mouseReleased', s[2].x, s[2].y);
  await sleep(430); await cap('g11-triple-live-d'); await sleep(900);
  const clicks11 = await ev('__p10.state()'); console.log('g11 after settle:', clicks11);
  await cap('g11b-residue-d'); /* 散尽后：页面应无痕 */

  // g12 移动端 390x844：真实触点点击，走线满员相位抓拍（松手后 ~460ms）
  s = await nav('', 390, 844, true);
  await mouse('mousePressed', s[0].x, s[0].y); await sleep(120); await mouse('mouseReleased', s[0].x, s[0].y);
  await sleep(460); await cap('g12-mobile-run'); await sleep(600);

  // g13 梦面（暖线尾）：冻结满走线相位
  await nav('face=dream', 1440, 900); await ev('__p10.freezeAt(470)'); await sleep(300); await cap('g13-dream-run-d');

  // g14 reduced-motion：静态针脚仅淡出（按压 60ms 松手，淡出中段抓拍）
  s = await nav('reduced=1', 1440, 900);
  await ev('__p10.replay(' + s[0].x + ',' + s[0].y + ',{hold:60})');
  await sleep(100); await cap('g14-rm-d');

  // g15 demo=loop：等首拍真实播放，走线满员相位抓拍（松手后 ~460ms）
  await nav('demo=loop', 1440, 900);
  let n = -1;
  for (let k = 0; k < 100; k++) { const v = JSON.parse(await ev('__p10.state()') || '{}'); if (v.clicks >= 1) { n = v.clicks; break; } await sleep(60); }
  await sleep(460); await cap('g15-demo-loop-d');
  console.log('demo clicks seen:', n);

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
