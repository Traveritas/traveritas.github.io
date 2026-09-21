// p11-a 千层纸 · 真实站点落地验收：preview 构建产物 + CDP 截图
// 桌面初始/三姿态/散开/移动/RM/滚动段 + 缝线恒定探针 + 控制台错误收集
// 独占调试端口 9805（mock 稿用 9801–9804）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4399/';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p11a-live';
const PORT = 9805;
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
  const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      errors.push(m.params.type.toUpperCase() + ' ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
  };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');

  const evalv = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result && r.result.result.value;
  };

  // 缝线恒定探针：各姿态下 .seam 的几何与变换必须逐字相同
  const seamProbe = () => evalv(`(() => {
    const s = document.querySelector('.seam');
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return [r.left, r.top, r.width, cs.transform, cs.opacity].join('|');
  })()`);

  // 等 boot 的 scaleX「划出」过渡完全结束（transform 连续两次采样一致）
  async function waitSeamSettled() {
    let prev = '';
    for (let i = 0; i < 24; i++) {
      const cur = await seamProbe();
      if (cur === prev && i > 0) return cur;
      prev = cur;
      await sleep(300);
    }
    return prev;
  }

  async function shot(s) {
    const vw = s.vw || 1440, vh = s.vh || 900;
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!s.mobile });
    await send('Emulation.setEmulatedMedia', { features: s.rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
    await send('Page.navigate', { url: BASE });
    await sleep(s.bootWait || 3000);
    await waitSeamSettled();
    const y0 = await evalv('Math.round(scrollY)');
    if (s.prep) await s.prep();
    await sleep(s.after || 300);
    const st = await evalv('(window.__ps&&__ps.state())||"no __ps"');
    const sp = await seamProbe();
    const cap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, s.n + '.png'), Buffer.from(cap.result.data, 'base64'));
    console.log(s.n, fs.statSync(path.join(OUT, s.n + '.png')).size, 'scrollY0:' + y0, 'seam:', sp.slice(0, 60), '|', st && st.slice(0, 110));
    return sp;
  }

  // 桌面：首次进入（全套穿针揭幕 ≥3.1s + 入幕 1.9s）
  const p1 = await shot({ n: 'L1-init-d', bootWait: 6200 });
  // 三个冻结姿态（指针左上 / 正中 / 右下）
  const p2 = await shot({ n: 'L2-pose-tl', bootWait: 2800, prep: async () => {
    await evalv('__ps.setPose(180,150)'); } });
  const p3 = await shot({ n: 'L3-pose-mid', bootWait: 2800, prep: async () => {
    await evalv('__ps.setPose(720,450)'); } });
  const p4 = await shot({ n: 'L4-pose-br', bootWait: 2800, prep: async () => {
    await evalv('__ps.setPose(1260,800)'); } });
  // 滚动散开（scrollY>26 层叠差速散开）
  await shot({ n: 'L5-spread', bootWait: 2800, prep: async () => {
    await evalv('window.scrollTo(0,140); __ps.spread(true)'); }, after: 900 });
  // 滚到随笔段：缝线常驻、无双线、左轨浮现
  await shot({ n: 'L6-essays', bootWait: 2800, prep: async () => {
    await evalv('window.scrollTo(0,1300)'); }, after: 1100 });
  // 滚到页底（晨醒 + 页尾）
  await shot({ n: 'L7-bottom', bootWait: 2800, prep: async () => {
    await evalv('window.scrollTo(0,document.documentElement.scrollHeight)'); }, after: 1100 });
  // 移动端 390×844
  await shot({ n: 'L8-mobile', vw: 390, vh: 844, mobile: true, bootWait: 4200 });
  // reduced-motion：直接落定的静画
  await shot({ n: 'L9-rm', rm: true, bootWait: 2600 });
  // 中间宽度档（评审建议补拍 768–1000）
  await shot({ n: 'L10-w900', vw: 900, vh: 900, bootWait: 4200 });

  // ── 断言：缝线在任何姿态下像素恒定；视差确实动了 ──
  const same = p1 === p2 && p2 === p3 && p3 === p4;
  console.log('SEAM-CONSTANT:', same ? 'PASS' : 'FAIL');
  if (!same) { console.log(' p1', p1); console.log(' p2', p2); console.log(' p3', p3); console.log(' p4', p4); }
  const layerProbe = await evalv(`(() => {
    const z = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).zIndex : 'missing'; };
    return JSON.stringify({
      wall: z('.ps-wall'), base: z('.ps-sheet-base'), leaf: z('.ps-leaf'),
      eeg: z('.eeg'), seam: z('.seam'), tick: z('.seam-tick'),
      wakeInk: z('.ps-ink-wake'), dreamInk: z('.ps-leaf-ink'), note: z('.ps-note'), fore: z('.ps-fore'),
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth
    });
  })()`);
  console.log('LAYERS:', layerProbe);
  console.log('CONSOLE-ERRORS:', errors.length ? errors.join('\n') : 'none');

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
