// 醒静梦动 + 洗染 · 真实机制验收：dev 站点 + CDP
// 梦态（默认入梦）→ Shift+空格长按 2200ms 闩锁醒态 → 回梦
// 采集：计算值探针（mix/still/wash/amber/dream/暗角/颗粒/叠影/药丸变换）+
// 双态各两帧间隔截图（梦态应漂移、醒态应静止）+ 控制台错误
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4321/';
const OUT = path.join(__dirname, '.shots-reality');
const PORT = 9807;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) =>
  new Promise((res, rej) => {
    http.get(u, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 等 dev 服务器
  let up = false;
  for (let k = 0; k < 60; k++) {
    try {
      await new Promise((res, rej) =>
        http.get(BASE, (r) => {
          r.resume();
          r.statusCode < 500 ? res() : rej();
        }).on('error', rej),
      );
      up = true;
      break;
    } catch (e) {}
    await sleep(500);
  }
  if (!up) {
    console.log('dev server not up at ' + BASE);
    return;
  }

  const ch = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(OUT, '.chrome'),
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let list = null;
  for (let k = 0; k < 80; k++) {
    try {
      list = await getJSON('http://127.0.0.1:' + PORT + '/json');
      if (list && list.some((t) => t.type === 'page')) break;
    } catch (e) {}
    await sleep(250);
  }
  if (!list) {
    console.log('devtools not up');
    try {
      ch.kill();
    } catch (e) {}
    return;
  }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown')
      errors.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      errors.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
  };
  const send = (m, p = {}) =>
    new Promise((r) => {
      const k = ++id;
      pend.set(k, r);
      ws.send(JSON.stringify({ id: k, method: m, params: p }));
    });
  await new Promise((r) => {
    ws.onopen = r;
  });
  await send('Page.enable');
  await send('Runtime.enable');
  const ev = async (fn) => {
    const r = await send('Runtime.evaluate', { expression: fn, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
    console.log('shot ' + name);
  };
  const probe = async (label) => {
    const v = await ev(`(() => {
      const cs = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const vig = document.querySelector('.vignette');
      const grain = document.querySelector('.grain');
      const ghost = document.querySelector('.ghost-pair .ghost');
      const pill = document.querySelector('.pill.drift');
      return JSON.stringify({
        fx: window.__fx && __fx.state(),
        mix: cs.getPropertyValue('--reality-mix').trim(),
        still: cs.getPropertyValue('--still').trim(),
        wash: cs.getPropertyValue('--wash').trim(),
        amber: cs.getPropertyValue('--amber').trim(),
        dream: cs.getPropertyValue('--dream').trim(),
        bodyBg: body.backgroundColor,
        vigOp: vig ? getComputedStyle(vig).opacity : null,
        grainOp: grain ? getComputedStyle(grain).opacity : null,
        ghostOp: ghost ? getComputedStyle(ghost).opacity : null,
        pillTf: pill ? getComputedStyle(pill).transform : null,
        bodyDataReality: document.body.dataset.reality,
      });
    })()`);
    console.log('PROBE[' + label + '] ' + v);
    return JSON.parse(v);
  };
  const key = (type) =>
    send('Input.dispatchKeyEvent', {
      type,
      modifiers: 8,
      code: 'Space',
      key: ' ',
      windowsVirtualKeyCode: 32,
      nativeVirtualKeyCode: 32,
    });

  await send('Page.navigate', { url: BASE });
  await sleep(1500);
  // 等 boot + 入梦 + 入幕（ENDT 1.9s）
  for (let k = 0; k < 40; k++) {
    const st = await ev(`window.__fx ? __fx.state().reality : 'none'`);
    if (st === 'dream') break;
    await sleep(500);
  }
  await sleep(3000);

  const pd = await probe('dream');
  await shot('01-dream-hero');
  await ev(`document.getElementById('ns-rem').scrollIntoView({block:'start'})`);
  await sleep(800);
  await shot('02-dream-rem-a');
  await sleep(2600);
  await shot('03-dream-rem-b');

  // 长按入梦检验：Shift+空格 2200ms → 闩锁醒面
  await ev(`window.scrollTo(0, 0)`);
  await sleep(700);
  await key('keyDown');
  await sleep(1100); // 线半程：过渡中间帧
  await shot('04-hold-mid');
  await sleep(1500); // 按满 2600ms > 2200ms，已闩锁
  await key('keyUp');
  await sleep(1200); // freeze 收尾

  const pw = await probe('wake');
  await shot('05-wake-hero');
  await ev(`document.getElementById('ns-rem').scrollIntoView({block:'start'})`);
  await sleep(800);
  await shot('06-wake-rem-a');
  await sleep(2600);
  await shot('07-wake-rem-b');

  // 回梦 1300ms：线反向生长，闩锁梦面（确认双向都活着）
  await ev(`window.scrollTo(0, 0)`);
  await sleep(700);
  await key('keyDown');
  await sleep(1900);
  await key('keyUp');
  await sleep(1200);
  await probe('back-dream');
  await shot('08-back-dream-hero');

  fs.writeFileSync(
    path.join(OUT, 'probe.json'),
    JSON.stringify({ dream: pd, wake: pw }, null, 2),
  );
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  try {
    ch.kill();
  } catch (e) {}
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
