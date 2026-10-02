/* 主页性能对比：加载 / 首屏静置 / 滚到底 / 中段与页底静置，Chrome trace 按线程汇总每秒占用（ms/s）。
   用法（先 npm run build）：node design/.perf-home.cjs
   环境变量：PAGES=/,/new/（Git Bash 下要加 MSYS_NO_PATHCONV=1）、W / H / DPR、CPU=4（CPU 降速倍数）。
   读法：GPU:CrGpuMain 接近 1000 ＝ GPU 进程主线程打满（合成会被拖住，滚动掉帧）；
   lsWorker ＝ 线景地形 Worker 自报的每帧耗时与帧数、是否走 WebGL2、降级档；
   longMain ＝ 主线程超过 40ms 的任务与其中最耗时的子项。
   依赖：os.tmpdir()/node_modules/puppeteer-core 与本机 Chrome（同 design/shot-mock-sound.cjs）。 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const W = +(process.env.W || 1440), H = +(process.env.H || 900), DPR = +(process.env.DPR || 1.5);
const THROTTLE = +(process.env.CPU || 1);
const PAGES = (process.env.PAGES || '/,/new/').split(',');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.opus': 'audio/ogg' };
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarize(events, wallMs) {
  const names = {}; const procNames = {};
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
    if (e.ph === 'M' && e.name === 'process_name') procNames[e.pid] = e.args.name;
  }
  const tn = (e) => { let n = names[e.pid + ':' + e.tid] || 'tid' + e.tid; if (/GPU/i.test(procNames[e.pid] || '')) n = 'GPU:' + n; return n.replace(/\d+$/, '').trim(); };
  const tasks = events.filter((e) => e.ph === 'X' && e.dur && /^(RunTask|ThreadControllerImpl::RunTask|ThreadPool_RunTask)$/.test(e.name)).sort((a, b) => a.ts - b.ts);
  const busy = {}; const endOf = {}; const mainTop = [];
  for (const e of tasks) {
    const k = e.pid + ':' + e.tid;
    if (e.ts < (endOf[k] || 0)) continue;
    endOf[k] = e.ts + e.dur;
    const n = tn(e);
    if (/VSync/.test(n)) continue;
    busy[n] = (busy[n] || 0) + e.dur / 1000;
    if (n === 'CrRendererMain' && e.dur > 40000) mainTop.push(e);
  }
  const cat = { style: 0, layout: 0, paint: 0, script: 0, prepaintCommit: 0 };
  for (const e of events) {
    if (e.ph !== 'X' || names[e.pid + ':' + e.tid] !== 'CrRendererMain') continue;
    if (e.name === 'UpdateLayoutTree') cat.style += e.dur / 1000;
    else if (e.name === 'Layout') cat.layout += e.dur / 1000;
    else if (e.name === 'Paint') cat.paint += e.dur / 1000;
    else if (e.name === 'FunctionCall' || e.name === 'EvaluateScript') cat.script += e.dur / 1000;
    else if (e.name === 'Layerize' || e.name === 'Commit' || e.name === 'PrePaint') cat.prepaintCommit += e.dur / 1000;
  }
  const long = mainTop.sort((a, b) => b.dur - a.dur).slice(0, 4).map((t) => {
    const kids = {};
    for (const e of events) {
      if (e.ph !== 'X' || e.pid !== t.pid || e.tid !== t.tid || e === t || e.ts < t.ts || e.ts + (e.dur || 0) > t.ts + t.dur) continue;
      if (/RunTask/.test(e.name)) continue;
      let key = e.name;
      if (e.name === 'FunctionCall' && e.args?.data) key += ' ' + (e.args.data.functionName || '') + '@' + (e.args.data.url || '').split('/').pop() + ':' + e.args.data.lineNumber;
      kids[key] = Math.max(kids[key] || 0, e.dur / 1000);
    }
    return { ms: Math.round(t.dur / 1000), top: Object.entries(kids).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => k + ' ' + v.toFixed(0)) };
  });
  const secs = wallMs / 1000;
  const round = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v / secs > 3).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / secs)]));
  return { secs: +secs.toFixed(1), cpu: round(busy), main: round(cat), longMain: long };
};

async function trace(page, fn) {
  await page.tracing.start({ categories: ['toplevel', 'disabled-by-default-devtools.timeline', 'devtools.timeline', 'blink', 'cc', 'gpu', 'viz', 'benchmark', 'disabled-by-default-devtools.timeline.frame'] });
  const t=Date.now();
  await fn();
  const wall=Date.now()-t;
  const buf = await page.tracing.stop();
  return summarize(JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents, wall);
}

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  });
  const out = {};
  try {
    for (const p of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
      const cdp = await page.createCDPSession();
      if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const bytes = {};
      await cdp.send('Network.enable');
      const types = {};
      cdp.on('Network.responseReceived', (e) => (types[e.requestId] = e.type));
      cdp.on('Network.loadingFinished', (e) => { const t = types[e.requestId] || '?'; bytes[t] = (bytes[t] || 0) + e.encodedDataLength; });
      await page.evaluateOnNewDocument(() => {
        window.__lt = []; window.__lcp = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      const r = { page: p };
      // 1. 加载 + 入场（前 8s）
      r.load = await trace(page, async () => {
        await page.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'load' });
        await sleep(8000);
      });
      const nav = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        const lt = window.__lt;
        return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), lcp: Math.round(window.__lcp), longTasks: lt.length, tbt: Math.round(lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)), longest: Math.round(Math.max(0, ...lt.map((x) => x[1]))), docH: document.documentElement.scrollHeight, dom: document.getElementsByTagName('*').length };
      });
      r.nav = nav;
      r.bytesKB = Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)]));
      // 2. 首屏静置 6s
      r.idleHero = await trace(page, () => sleep(6000));
      r.lsWorker = await page.evaluate(() => (window.__lsPerf ? window.__lsPerf() : null));
      // 3. 滚到底（滚轮，约 12s）
      await page.mouse.move(W / 2, H / 2);
      await page.evaluate(() => { window.__fr = []; let l = performance.now(); const f = (t) => { window.__fr.push(t - l); l = t; if (!window.__stopfr) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      r.scroll = await trace(page, async () => {
        const end = Date.now() + 14000;
        while (Date.now() < end) {
          await page.mouse.wheel({ deltaY: 40 });
          await sleep(16);
          const done = await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2);
          if (done) break;
        }
      });
      r.scrollRaf = await page.evaluate(() => {
        window.__stopfr = true; const a = window.__fr.slice(2); a.sort((x, y) => x - y);
        const q = (k) => +a[Math.floor(a.length * k)].toFixed(1);
        return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), over33: a.filter((x) => x > 33.4).length };
      });
      // 4. 页底静置 4s
      r.idleBottom = await trace(page, () => sleep(4000));
      // 5. 中段静置（新主页第 2 幕附近）
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.45));
      await sleep(1500);
      r.idleMid = await trace(page, () => sleep(4000));
      out[p] = r;
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(JSON.stringify(out, null, 1));
})();
