// 截图像素对比：梦态两帧（应漂移）vs 醒态两帧（应静止）+ 首屏双态整体色差
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots-reality');
const PORT = 9808;
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
  const ch = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(OUT, '.chrome-diff'),
      '--window-size=400,300', 'about:blank',
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
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
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

  const b64 = (f) =>
    JSON.stringify('data:image/png;base64,' + fs.readFileSync(path.join(OUT, f + '.png')).toString('base64'));
  const ev = async (fn) => {
    const r = await send('Runtime.evaluate', { expression: fn, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  // 注入两图，计算：差异像素占比（阈值>12/255）、差异幅度均值、各自平均色
  await ev(`window.diff = async (a, b) => {
    const L = async (s) => {
      const img = new Image();
      img.src = s;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      return { d: x.getImageData(0, 0, img.width, img.height), w: img.width, h: img.height };
    };
    const A = await L(a), B = await L(b);
    let n = 0, sum = 0, ar = 0, ag = 0, ab = 0, br = 0, bg = 0, bb = 0;
    const N = A.w * A.h;
    for (let i = 0; i < N; i++) {
      const j = i * 4;
      const dr = A.d.data[j] - B.d.data[j], dg = A.d.data[j+1] - B.d.data[j+1], db = A.d.data[j+2] - B.d.data[j+2];
      const m = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
      if (m > 36) n++;
      sum += m;
      ar += A.d.data[j]; ag += A.d.data[j+1]; ab += A.d.data[j+2];
      br += B.d.data[j]; bg += B.d.data[j+1]; bb += B.d.data[j+2];
    }
    return { diffPct: +(100*n/N).toFixed(2), avgDelta: +(sum/N).toFixed(1),
      avgA: [Math.round(ar/N), Math.round(ag/N), Math.round(ab/N)], avgB: [Math.round(br/N), Math.round(bg/N), Math.round(bb/N)] };
  }`);

  const pairs = [
    ['梦态REM两帧(应漂移)', '02-dream-rem-a', '03-dream-rem-b'],
    ['醒态REM两帧(应静止)', '06-wake-rem-a', '07-wake-rem-b'],
    ['首屏 梦vs醒', '01-dream-hero', '05-wake-hero'],
    ['首屏 梦vs回梦(应几乎同)', '01-dream-hero', '08-back-dream-hero'],
  ];
  for (const [label, a, b] of pairs) {
    const r = await ev(`diff(${b64(a)}, ${b64(b)})`);
    console.log(label + ': ' + JSON.stringify(r));
  }
  try {
    ch.kill();
  } catch (e) {}
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
