/* 星 · 扁平原型 · 截图与验收（CDP 直连，不依赖 puppeteer）
 *
 *   node design/mocks/star-flat/serve.cjs          # 另开一个终端，端口 4651
 *   node design/mocks/star-flat/.shot.cjs          # 全部机位
 *   node design/mocks/star-flat/.shot.cjs wall     # 只拍名字含 wall 的
 *
 * 输出 design/mocks/star-flat/.shots/*.png + report.json
 * 跑完打印：控制台错误 / 页面错误 / 失败请求 三条计数（都必须为 0），
 * 以及页面里 window.__star 的读数（偏差与腰深）。
 */
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const OUT = path.join(__dirname, '.shots');
const BASE = 'http://127.0.0.1:4651/star-flat/';
fs.mkdirSync(OUT, { recursive: true });

/* 机位：name → { sel: 元素选择器（拍元素）| null（拍整页）, w, h, full } */
const SHOTS = [
  { name: '01-hero', sel: 'header.top', w: 1440, h: 1020 },
  { name: '02-wall', sel: '#wall', w: 1440, h: 1020 },
  { name: '03-params', sel: '#params', w: 1440, h: 1020 },
  { name: '04-material', sel: '#material', w: 1440, h: 1020 },
  { name: '05-ladder', sel: '#ladder', w: 1440, h: 1020 },
  { name: '06-aim', sel: '#aim', w: 1440, h: 1020 },
  { name: '07-full', sel: null, w: 1440, h: 1020, full: true },
  { name: '08-mobile', sel: null, w: 430, h: 900, full: true },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve(d);
        }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method) this.events.push(m);
    };
  }
  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

(async () => {
  const profile = path.join(process.env.TEMP, 'chrome-star-flat-' + Date.now());
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-color-profile=srgb',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      await req('GET', '/json/version');
      up = true;
      break;
    } catch (_) {
      await sleep(250);
    }
  }
  if (!up) {
    console.log('FAIL: Chrome 的调试端口没起来');
    process.exit(1);
  }

  const filter = process.argv[2] || '';
  const report = {};
  let consoleErrors = 0;
  let pageErrors = 0;
  let reqFails = 0;
  const problems = [];

  for (const s of SHOTS) {
    if (filter && !s.name.includes(filter)) continue;
    const page = await req('PUT', `/json/new?${encodeURIComponent('about:blank')}`);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: s.w,
      height: s.h,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `const st=document.createElement('style');st.textContent='::-webkit-scrollbar{display:none}html{scrollbar-width:none}';
        document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(st));`,
    });
    await cdp.send('Page.navigate', { url: BASE + '?v=' + Date.now() });

    /* 等页面自己报 ready，再等字 */
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(200);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `!!(window.__star && window.__star.ready) && document.fonts.status === 'loaded'`,
        returnByValue: true,
      });
      ready = r.result && r.result.result && r.result.result.value === true;
    }
    await sleep(350);

    let clip;
    if (s.sel) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(s.sel)});
          if (!el) return null; const b = el.getBoundingClientRect();
          return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; })()`,
        returnByValue: true,
      });
      const box = r.result && r.result.result && r.result.result.value;
      if (box) {
        /* 留 26px 余量，免得贴着字裁边 */
        clip = {
          x: Math.max(0, box.x - 26),
          y: Math.max(0, box.y - 26),
          width: box.width + 52,
          height: box.height + 52,
          scale: 1,
        };
      }
    }

    const needH = clip ? Math.ceil(clip.y + clip.height + 40) : 0;
    if (needH > s.h) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: s.w,
        height: Math.min(needH, 6000),
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(300);
      if (clip) {
        const r2 = await cdp.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector(${JSON.stringify(s.sel)});
            const b = el.getBoundingClientRect();
            return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height }; })()`,
          returnByValue: true,
        });
        clip = { ...r2.result.result.value, scale: 1 };
      }
    }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: s.full || !!clip,
      ...(clip ? { clip } : {}),
    });
    if (shot.result && shot.result.data) {
      fs.writeFileSync(path.join(OUT, s.name + '.png'), Buffer.from(shot.result.data, 'base64'));
    } else {
      console.log('FAIL', s.name, JSON.stringify(shot).slice(0, 200));
    }

    /* 读数 */
    const diag = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ m: window.__star.measure, notch: window.__star.notch,
        live: window.__star.live.params, sh: document.documentElement.scrollHeight })`,
      returnByValue: true,
    });
    report[s.name] = JSON.parse((diag.result && diag.result.result && diag.result.result.value) || '{}');
    console.log('ok', s.name, 'scrollHeight', report[s.name].sh, clip ? `clip ${Math.round(clip.width)}×${Math.round(clip.height)}` : '');

    /* 收集这一页的错误 */
    for (const e of cdp.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        pageErrors++;
        problems.push(`${s.name} pageerror: ${e.params.exceptionDetails.text}`);
      }
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
        consoleErrors++;
        problems.push(`${s.name} console: ${e.params.args.map((a) => a.value || a.description).join(' ')}`);
      }
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
        consoleErrors++;
        problems.push(`${s.name} log: ${e.params.entry.text} ${e.params.entry.url || ''}`);
      }
      if (e.method === 'Network.loadingFailed' && !e.params.canceled) {
        reqFails++;
        problems.push(`${s.name} reqfail: ${e.params.errorText}`);
      }
    }
    cdp.close();
    await sleep(120);
  }

  try {
    execFileSync('taskkill', ['/PID', chrome.pid, '/T', '/F'], { stdio: 'ignore' });
  } catch (_) {}

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nout: design/mocks/star-flat/.shots/ (+ report.json)`);
  console.log(`console errors: ${consoleErrors} · page errors: ${pageErrors} · failed requests: ${reqFails}`);
  if (problems.length) console.log('PROBLEMS:\n  ' + problems.join('\n  '));
  if (consoleErrors || pageErrors || reqFails) process.exitCode = 1;
  process.exit(consoleErrors || pageErrors || reqFails ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});