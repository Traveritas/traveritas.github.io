// p11-A 千层纸 paperstack 截图自验收（修订版：缝线固定为背景 chrome）
// 1) 九张验收图：桌面初始态 + 3 个冻结鼠标相位 + 极端边相位 + 入幕中途帧
//    + 滚动散开 + 移动端 390x844 + reduced-motion
// 2) 缝线恒定性像素探针：初始态 / pose-tl / pose-br / 滚动散开 4 态 ×
//    线上 4 个特征点，1x1 clip 截图解码出 RGB，数字证明各态同点同色
// 独占调试端口 9801（其他 p11 并行稿用 9802–9804）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'file:///D:/Documents/HTA/My%20Projects/personal-website/design/mocks/p11-a-paperstack.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11-a';
const PORT = 9801;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

// 14° 缝线上的特征点（1440x900 视口）：y = 450 + (x-720)·tan14°，避开
// 梦叶带(x≤638)/锚点光晕(≤34px)/手记(y≥603)/HYPNOGRAM/竖排注
const TAN14 = Math.tan(14 * Math.PI / 180);
const PROBES = [680, 860, 1040, 1300].map(x => ({ x, y: Math.round(450 + (x - 720) * TAN14) }));

// 1x1 PNG → [r,g,b,a]：走 chunk 表取 IDAT，inflate，单行去滤镜
// （1 像素行：Sub 左邻=0，Up/Paeth 上邻=0，Average 左上=0 → 均为原值）
function decodePx(b64) {
  const buf = Buffer.from(b64, 'base64');
  let off = 8, idat = [], w = 0, h = 0, ct = 0;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; /* [8]=bitDepth [9]=colorType */ }
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (w !== 1 || h !== 1) throw new Error('probe png not 1x1: ' + w + 'x' + h);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('probe png colortype ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3], bpp === 4 ? raw[4] : 255];
}
const hex = c => '#' + c.slice(0, 3).map(v => clamped(v).toString(16).padStart(2, '0')).join('');
const clamped = v => Math.max(0, Math.min(255, v));

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

  async function waitReady() {
    // 首次冷加载时字体 CSS（渲染阻塞）会推迟页内脚本执行——轮询到 entranceDone
    for (let k = 0; k < 56; k++) {
      const r = await send('Runtime.evaluate', { expression: '(window.__p11&&__p11.state())||""' });
      const v = r.result && r.result.result && r.result.result.value;
      if (v) { try { if (JSON.parse(v).entranceDone) return true; } catch (e) {} }
      await sleep(250);
    }
    return false;
  }

  async function shot(s) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Page.navigate', { url: BASE + (s.q ? '?' + s.q : '') });
    await waitReady();
    if (s.prep) await s.prep(send);
    await sleep(s.after || 140);
    const st = await send('Runtime.evaluate', { expression: '(window.__p11&&__p11.state())' });
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, st.result && st.result.result && st.result.result.value);
  }

  // ── 1) 验收图（9 张） ──
  await shot({ n: 'a1-init-d', q: '' });
  await shot({ n: 'a2-pose-tl', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(170,180)' }); } });
  await shot({ n: 'a3-pose-mid', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(720,450)' }); } });
  await shot({ n: 'a4-pose-br', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(1270,760)' }); } });
  await shot({ n: 'a5-pose-edge', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(30,450)' }); } });
  await shot({ n: 'a6-enter-900', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.enter(900)' }); } });
  await shot({ n: 'a7-spread', q: '', prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.spread(true)' });
    await sleep(950);
    await send('Runtime.evaluate', { expression: '__p11.freeze(720,450)' }); } });
  await shot({ n: 'a8-mobile', q: '', vw: 390, vh: 844, mobile: true, prep: async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(195,422)' }); } });
  await shot({ n: 'a9-rm', q: 'reduced=1' });

  // ── 2) 缝线恒定性像素探针：4 状态 × 4 特征点 ──
  // 各态均 freeze（钉住呼吸类动画保证可比；freeze(视口中心) ≡ 初始静止
  // 构图），probeMode 藏脑电（线附近的动态波纹），1x1 clip 解码 RGB。
  async function probeState(name, prep) {
    await send('Page.navigate', { url: BASE });
    await waitReady();
    if (prep) await prep();
    await send('Runtime.evaluate', { expression: '__p11.probeMode(true)' });
    await sleep(80);
    const out = [];
    for (const p of PROBES) {
      const cap = await send('Page.captureScreenshot',
        { format: 'png', clip: { x: p.x, y: p.y, width: 1, height: 1, scale: 1 } });
      out.push(decodePx(cap.result.data));
    }
    console.log('probe[' + name + ']', out.map(hex).join(' '));
    return out;
  }
  const rest = await probeState('rest/初始态', async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(720,450)' }); });
  const tl = await probeState('pose-tl', async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(170,180)' }); });
  const br = await probeState('pose-br', async () => {
    await send('Runtime.evaluate', { expression: '__p11.freeze(1270,760)' }); });
  const sp = await probeState('spread/滚动散开', async () => {
    await send('Runtime.evaluate', { expression: '__p11.spread(true)' });
    await sleep(950);
    await send('Runtime.evaluate', { expression: '__p11.freeze(720,450)' }); });

  let maxd = 0, worst = '';
  const states = { 'pose-tl': tl, 'pose-br': br, 'spread': sp };
  for (let i = 0; i < PROBES.length; i++) {
    console.log('probe 点 (' + PROBES[i].x + ',' + PROBES[i].y + ') 初始=' + hex(rest[i]) +
      ' tl=' + hex(tl[i]) + ' br=' + hex(br[i]) + ' spread=' + hex(sp[i]));
    for (const sname of Object.keys(states)) {
      for (let c = 0; c < 3; c++) {
        const dd = Math.abs(rest[i][c] - states[sname][i][c]);
        if (dd > maxd) { maxd = dd; worst = '(' + PROBES[i].x + ',' + PROBES[i].y + ') ' + sname + ' ch' + c; }
      }
    }
  }
  console.log('═══ 缝线探针结论：4 态 × 4 点最大通道差 = ' + maxd +
    (maxd <= 2 ? ' → PASS，线位像素恒定（各态同点同色）' : ' → FAIL at ' + worst));

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
