/* 截图小工具（每个 mockup 共用）。本地 file:// 直接跑：
     node design/mocks/ave-r1/shot.cjs design/mocks/ave-r1/a-paper.html --frames
   一次拍五张（都在 --out 目录，默认 html 同级的 shots/<tag>/）：
     01-list      1440×900，浅纸检索页背景，说完
     02-speak     深色漫游背景，正在说（前 2/3 的字亮着）
     03-night     深夜主页背景，说完
     04-anchored  浅纸背景，贴着 .demo-anchor 说（--anchor 钩子）
     05-narrow    390×844 窄屏
   每张另有一张 -zoom.png（对话框那一角放大 2×），方便自己看细节。
   页面约定：根元素 .ave 带 is-on / is-said；<body> 上会被脚本写 bg-<名字> 与 anchored。 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('用法: node shot.cjs <html> [--out 目录] [--tag 前缀] [--frames]');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);
const HTML = path.resolve(process.cwd(), file);
const BASE = path.basename(HTML, '.html');
const OUT = path.resolve(__dirname, opt('out', path.join(path.dirname(HTML), 'shots', BASE)));
const TAG = opt('tag', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(u) {
    this.seq = 0;
    this.waiting = new Map();
    this.ws = new WebSocket(u);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('ws error'));
    });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      const w = msg.id && this.waiting.get(msg.id);
      if (w) {
        this.waiting.delete(msg.id);
        msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
}

const BG = ['list', 'explore', 'dusk', 'dream'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ave-shot-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=1',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120 && !fs.existsSync(portFile); i++) await sleep(100);
  const dbg = +fs.readFileSync(portFile, 'utf8').split('\n')[0];
  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${dbg}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === 'page');
      if (page) break;
    } catch {}
    await sleep(120);
  }
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // mobile:true 会按页面有没有 viewport meta 决定排版宽度（这些 mock 没有 meta，会变成 980px），
  // 所以统一用 mobile:false + 真实窄宽，量到的就是 390。
  const metrics = (w, h) =>
    cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });

  const url = 'file:///' + HTML.replace(/\\/g, '/');
  const nav = async () => {
    await cdp.send('Page.navigate', { url });
    await sleep(700);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
    await sleep(150);
  };

  const setup = (bg, state, anchored) =>
    cdp.send('Runtime.evaluate', {
      expression: `(() => {
        document.body.className = document.body.className.replace(/\\bbg-\\w+\\b/g, '').trim();
        document.body.classList.add('bg-${bg}');
        document.body.classList.toggle('anchored', ${!!anchored});
        const root = document.querySelector('.ave');
        if (root) {
          root.classList.add('is-on');
          root.classList.toggle('is-said', '${state}' === 'said');
          root.classList.toggle('is-speaking', '${state}' === 'speaking');
          const cs = [...root.querySelectorAll('.ave-text .c')];
          const n = '${state}' === 'said' ? cs.length : '${state}' === 'speaking' ? Math.max(1, Math.round(cs.length * 0.62)) : 0;
          cs.forEach((c, i) => {
            c.classList.toggle('on', i < n);
            c.classList.toggle('head', i < n && i >= n - 2);
          });
        }
        return true;
      })()`,
      returnByValue: true,
    });

  const shoot = async (tag) => {
    const full = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const f1 = path.join(OUT, `${TAG}${tag}.png`);
    fs.writeFileSync(f1, Buffer.from(full.data, 'base64'));
    const box = (
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('.ave');
          if (!el) return null;
          const b = el.getBoundingClientRect();
          let x = b.x, y = b.y, x2 = b.right, y2 = b.bottom;
          // 贴元素时的牵线是框的子元素，会伸出框外；一并框进来。
          // 注意：display:none 的元素 rect 全是 0，不能直接并进来（会把包围盒撑成整页）
          const lead = el.querySelector('.a-lead, .ave-lead');
          if (lead) {
            const l = lead.getBoundingClientRect();
            if (l.width > 0.5 || l.height > 0.5) {
              x = Math.min(x, l.x); y = Math.min(y, l.y);
              x2 = Math.max(x2, l.right); y2 = Math.max(y2, l.bottom);
            }
          }
          return { x, y, width: x2 - x, height: y2 - y, vw: innerWidth, vh: innerHeight };
        })()`,
        returnByValue: true,
      })
    ).result.value;
    console.log(`[measure] ${tag} `, JSON.stringify(box));
    if (box && box.width > 4) {
      const pad = 30;
      const cx = Math.max(0, box.x - pad);
      const cy = Math.max(0, box.y - pad);
      const cw = Math.min(box.vw - cx, box.width + pad * 2);
      const ch = Math.min(box.vh - cy, box.height + pad * 2);
      const zoom = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: cx, y: cy, width: cw, height: ch, scale: 2 },
      });
      const f2 = path.join(OUT, `${TAG}${tag}-zoom.png`);
      fs.writeFileSync(f2, Buffer.from(zoom.data, 'base64'));
      console.log(f2);
    }
    console.log(f1);
  };

  if (!has('frames')) {
    await metrics(1440, 900);
    await nav();
    await setup(opt('bg', 'list'), opt('state', 'said'), has('anchored'));
    await sleep(420);
    await shoot('');
  } else {
    const plan = [
      ['01-list', 1440, 900, 'list', 'said', false],
      ['02-speak', 1440, 900, 'explore', 'speaking', false],
      ['03-night', 1440, 900, 'dusk', 'said', false],
      ['04-anchored', 1440, 900, 'list', 'said', true],
      ['05-narrow', 390, 844, 'list', 'said', false],
    ];
    let cur = '';
    for (const [tag, w, h, bg, state, anchored] of plan) {
      const key = `${w}x${h}`;
      if (key !== cur) {
        await metrics(w, h);
        await nav();
        cur = key;
      }
      await setup(bg, state, anchored);
      await sleep(420);
      await shoot(tag);
    }
  }
  chrome.kill();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
