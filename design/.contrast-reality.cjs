// 对比度验收：梦/醒两态 × 三个夜段，实测 --fg 对 body 实际背景的 WCAG 对比度
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9809;
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
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(__dirname, '.shots-reality/.chrome-contrast'),
      '--window-size=1440,900', 'about:blank',
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
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + JSON.stringify(m.params.exceptionDetails).slice(0, 200));
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

  await send('Page.navigate', { url: 'http://localhost:4321/' });
  await sleep(2000);
  for (let k = 0; k < 40; k++) {
    const st = await ev(`window.__fx ? __fx.state().reality : 'none'`);
    if (st === 'dream') break;
    await sleep(500);
  }
  await sleep(2500);

  // color(srgb r g b)（线性）→ gamma sRGB 0..255 → 相对亮度
  await ev(`window.lum = (css) => {
    const m = css.match(/color\\(srgb ([\\d.]+) ([\\d.]+) ([\\d.]+)/);
    let rgb;
    if (m) rgb = [+m[1], +m[2], +m[3]].map((L) => {
      const v = L <= 0.0031308 ? L * 12.92 : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
      return v * 255;
    });
    else {
      const h = css.match(/rgb\\((\\d+), (\\d+), (\\d+)\\)/);
      rgb = [+h[1], +h[2], +h[3]];
    }
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  window.contrastAt = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fgCss = getComputedStyle(document.querySelector('.ch-wake, .ledger-title, .final-line') || document.body).color;
    const l1 = lum(fgCss), l2 = lum(bg);
    const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return r.toFixed(2);
  };
  window.stage = () => document.getElementById('rail-stage') ? document.getElementById('rail-stage').textContent : '';`);

  const spots = [
    ['hero昼', `window.scrollTo(0, 0)`],
    ['deep深夜', `document.getElementById('ns-projects').scrollIntoView({block:'center'})`],
    ['dawn晨醒', `document.getElementById('ns-dawn').scrollIntoView({block:'center'})`],
  ];
  const key = (type) =>
    send('Input.dispatchKeyEvent', {
      type, modifiers: 8, code: 'Space', key: ' ',
      windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32,
    });

  for (const state of ['dream', 'wake', 'dream2']) {
    if (state !== 'dream') {
      // dream→wake 或 wake→dream2：按住 2.6s 闩锁
      await ev(`window.scrollTo(0,0)`);
      await sleep(500);
      await key('keyDown');
      await sleep(2600);
      await key('keyUp');
      await sleep(1300);
    }
    const label = state === 'dream2' ? 'dream(回梦)' : state;
    for (const [name, scroll] of spots) {
      await ev(scroll);
      await sleep(900);
      const r = await ev(`contrastAt()`);
      const st = await ev(`stage()`);
      console.log(label + ' · ' + name + ' [' + st + '] fg/bg 对比度 = ' + r + ':1');
    }
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  try {
    ch.kill();
  } catch (e) {}
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
