// p10-f 「余线·双边」截图自验收（迭代二）：
// 主拍三相位 + 双边满编/闪灭（固定 seed 冻结 + 4x 放大）+ 双 seed 对比 +
// 实况 seed（生成式 CSS 路径端到端）+ 真连点3次（真随机）+ 无痕 +
// 移动端中位/右缘/左缘（双侧边界收缩不裁边）+ 梦面 + RM
// 独占调试端口 9800
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p10-f-tailthread.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p10-f';
const PORT = 9800;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});
const TRIPLE_ACT = "(function(){var s=JSON.parse(__p10.spots());__p10.replay(s[0].x,s[0].y,{hold:90});" +
  "setTimeout(function(){__p10.replay(s[1].x,s[1].y,{hold:90})},220);" +
  "setTimeout(function(){__p10.replay(s[2].x,s[2].y,{hold:90})},440);return 'armed';})()";
const SHOTS = [
  // 主拍三相位（同迭代一语义）
  { n: 'g1-swing-80',      q: '', act: '__p10.freezeAt(80)' },
  { n: 'g2-overshoot-176', q: '', act: '__p10.freezeAt(176)' },
  { n: 'g3-payout-300',    q: '', act: '__p10.freezeAt(300)' },
  // 双边满编 + 闪灭中段（seed 42 固定；plan 选相位）
  { n: 'g4-full-s42',      q: '', seed: 42,   planOff: 30 },
  { n: 'g5-flick-s42',     q: '', seed: 42,   planOff: 95 },
  { n: 'zg4-full-s42',     q: '', seed: 42,   planOff: 30, zoom: true },
  { n: 'zg5-flick-s42',    q: '', seed: 42,   planOff: 95, zoom: true },
  // 第二 seed 满编对比（证明不重样）
  { n: 'g6-full-s1337',    q: '', seed: 1337, planOff: 30 },
  { n: 'zg6-full-s1337',   q: '', seed: 1337, planOff: 30, zoom: true },
  { n: 'g7-flick-s1337',   q: '', seed: 1337, planOff: 95 },
  // 实况 seed 42（生成式关键帧端到端验证；同相位应≈zg4）
  { n: 'zg8-live-s42',     q: '', seed: 42,   planOff: 30, live: true, zoom: true },
  // 真连点 3 次（真随机，三实例各自布局）
  { n: 'g9-triple-live',   q: '', act: TRIPLE_ACT, wait: 600 },
  { n: 'g9b-triple-clip1', q: '', act: TRIPLE_ACT, wait: 780, zoom: true, clipOf: 0 },
  { n: 'g9c-triple-clip2', q: '', act: TRIPLE_ACT, wait: 780, zoom: true, clipOf: 1 },
  { n: 'g9d-triple-clip3', q: '', act: TRIPLE_ACT, wait: 780, zoom: true, clipOf: 2 },
  // 无痕收场
  { n: 'g10-gone-1100',    q: '',
    act: "(function(){var s=JSON.parse(__p10.spots());__p10.replay(s[0].x,s[0].y,{hold:90});return 'armed';})()",
    wait: 1150 },
  // 移动端 390×844：中位 + 右缘（x=352，右余线收缩）+ 左缘（x=40，左余线收缩）
  { n: 'g11-mobile-mid',   q: '', seed: 42, planOff: 30, vw: 390, vh: 844, mobile: true },
  { n: 'zg11-mobile-mid',  q: '', seed: 42, planOff: 30, vw: 390, vh: 844, mobile: true, zoom: true },
  { n: 'g12-mobile-right', q: '', seed: 42, planOff: 30, vw: 390, vh: 844, mobile: true, fx: 352, fy: 241 },
  { n: 'zg12-mobile-right',q: '', seed: 42, planOff: 30, vw: 390, vh: 844, mobile: true, fx: 352, fy: 241, zoom: true },
  { n: 'g13-mobile-left',  q: '', seed: 77, planOff: 30, vw: 390, vh: 844, mobile: true, fx: 40, fy: 241 },
  { n: 'zg13-mobile-left', q: '', seed: 77, planOff: 30, vw: 390, vh: 844, mobile: true, fx: 40, fy: 241, zoom: true },
  // 梦面 + RM
  { n: 'g14-dream-full',   q: 'face=dream', seed: 42, planOff: 30 },
  { n: 'g15-rm-static-60', q: 'reduced=1', act: '__p10.freezeAt(60)' },
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
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result && r.result.result.value;
  };
  for (const s of SHOTS) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    // 就绪轮询：等 __p10 出现（防字体/网络慢导致 act 打在未加载页上）
    for (let k = 0; k < 30; k++) {
      const r = await send('Runtime.evaluate', { expression: 'typeof __p10', returnByValue: true });
      if (r.result && r.result.result && r.result.result.value === 'object') break;
      await sleep(300);
    }
    await sleep(700);
    // 目标点：显式 fx/fy 优先，否则采样点
    let pt = null;
    if (s.fx != null) {
      pt = { x: s.fx, y: s.fy };
    } else if (s.zoom || s.seed != null || s.planOff != null) {
      const sp = JSON.parse(await ev('__p10.spots()'));
      pt = sp[s.clipOf != null ? s.clipOf : 0];
    }
    // seed/plan：读取排程，按 W0 相位组 act / wait
    let act = s.act, wait = s.wait || 300, info = '';
    if (s.seed != null && s.planOff != null) {
      const plan = JSON.parse(await ev('__p10.plan(' + s.seed + ',' + pt.x + ',' + pt.y + ')'));
      const ms = plan.W0 + s.planOff;
      info = 'W0=' + plan.W0 + ' ms=' + ms + ' segs=' + plan.segs.map(g => g.side + g.kind + '(' + g.w + ')').join('');
      if (s.live) {
        act = '__p10.replay(' + pt.x + ',' + pt.y + ',{hold:90,seed:' + s.seed + '})';
        wait = 90 + ms;
      } else {
        act = '__p10.seed(' + s.seed + ');__p10.freezeAt(' + ms + ',' + pt.x + ',' + pt.y + ')';
      }
    }
    if (act) await send('Runtime.evaluate', { expression: act });
    await sleep(wait);
    const st = await send('Runtime.evaluate', { expression: '(window.__p10&&__p10.state())' });
    if (s.zoom) {
      const clipW = Math.min(vw - Math.max(0, pt.x - 150), 310);
      const cap = await send('Page.captureScreenshot', { format: 'png',
        clip: { x: Math.max(0, pt.x - 150), y: Math.max(0, pt.y - 60), width: clipW, height: 130, scale: 4 } });
      fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
      console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, 'clip@', pt.x, pt.y, info,
        '|', st.result && st.result.result && st.result.result.value);
    } else {
      const cap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
      console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, info || '-',
        '|', st.result && st.result.result && st.result.result.value);
    }
  }
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
