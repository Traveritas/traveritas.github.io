/* 六芒 · 花相 · 截图与自检（CDP 直连，不依赖 puppeteer）
   node design/mocks/star-v-flora/.shot.cjs            → .shots/
   ONLY=a,b 只拍一部分 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch {
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
    this.listeners = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message));
        else resolve(m.result);
      } else if (m.method) {
        for (const fn of this.listeners) fn(m);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(fn) {
    this.listeners.push(fn);
  }
  close() {
    this.ws.close();
  }
}

/* [名字, 路径+查询, 视口, 裁剪锚点] */
const SHOTS = [
  ['01-forms-light', '?ground=light', { width: 1320, height: 900 }, 'forms-sec'],
  ['02-forms-dark', '?ground=dark', { width: 1320, height: 900 }, 'forms-dark-anchor'],
  ['03-thickness', '?ground=light', { width: 1300, height: 1300 }, 'petal-sec'],
  ['04-anatomy', '?ground=light', { width: 1300, height: 1000 }, 'anatomy-sec'],
  ['05-strip', '?ground=light', { width: 1320, height: 700 }, 'strip-sec'],
  ['06-sizes', '?ground=light', { width: 1300, height: 800 }, 'size-sec'],
  ['07-motion', '?ground=light', { width: 1320, height: 1400 }, 'motion-sec'],
  ['08-hero', '?ground=light', { width: 1320, height: 900 }, 'hero-sec'],
  ['09-measure', '?ground=light', { width: 1320, height: 1000 }, 'perf-sec'],
  ['10-probe', '.probe.html?form=flower', { width: 1240, height: 440 }, null],
];

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/star-v-flora/`;

  const profile = path.join(process.env.TEMP, 'chrome-flora-' + Date.now());
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--use-angle=d3d11',
      '--force-color-profile=srgb',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
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
    } catch {
      await sleep(250);
    }
  }
  if (!up) {
    console.error('chrome did not start');
    process.exit(1);
  }

  const target = await req('PUT', '/json/new?about:blank');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => {
    ws.onopen = r;
  });
  const cdp = new CDP(ws);
  const problems = [];
  let current = '';
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      problems.push(`${current} console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      problems.push(`${current} exception: ${d.exception?.description || d.text}`);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      problems.push(`${current} log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');

  const report = {};

  for (const [name, query, vp, anchor] of SHOTS) {
    if (only && !only.some((o) => name.startsWith(o) || name.includes(o))) continue;
    current = name;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: base + query });
    await sleep(2800);
    await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });

    let probe = null;
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__flora ? window.__flora.report() : null)',
        returnByValue: true,
      });
      probe = r.result.value ? JSON.parse(r.result.value) : null;
    } catch (e) {
      problems.push(`${name} probe failed: ${e.message}`);
    }
    report[name] = probe;

    if (name === '09-measure') {
      try {
        await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
            const b = document.getElementById('m-btn');
            b.click();
            for (let i = 0; i < 200; i++) {
              await new Promise(r => setTimeout(r, 100));
              if (!document.getElementById('m-table').hidden) return 'done';
            }
            return 'timeout: ' + document.getElementById('m-out').textContent;
          })()`,
          awaitPromise: true,
          returnByValue: true,
        }).then((x) => {
          report.measureStatus = x.result.value;
          if (x.result.value !== 'done') problems.push(`09-measure status: ${x.result.value}`);
        });
      } catch (e) {
        problems.push(`${name} measure failed: ${e.message}`);
      }
      await sleep(400);
    }

    /* 不做裁剪：CDP 的 clip 坐标系和滚动状态很容易打架（前几版反复在这里出错，
       深底那张甚至截出一片纸色）。改成「把锚点滚到视口顶端，然后整屏截」，
       所以 SHOTS 里的 height 要按那一段的实际高度给。 */
    if (anchor) {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const el = document.getElementById(${JSON.stringify(anchor)});
          if (!el) return 0;
          const r = el.getBoundingClientRect();
          window.scrollTo(0, Math.max(0, r.top + window.scrollY - 18));
          return 1;
        })()`,
        returnByValue: true,
      });
      await sleep(360);
    }
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`shot ${name}`);
  }

  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(report, null, 2));
  console.log(problems.length ? '\nPROBLEMS:\n' + problems.join('\n') : '\nno console errors');
  cdp.close();
  chrome.kill();
  server.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});


