/* 返回目录页那一刻，主线程 / GPU 线程到底在忙什么（Chrome trace 逐项拆）。

   用法（先 npm run build）：
     node design/.trace-return.cjs                 # 点「回到随笔」
     BACK=1 node design/.trace-return.cjs          # 按浏览器后退（测 bfcache 有没有生效）
     CPU=4 node design/.trace-return.cjs           # CPU 降速 4 倍（近似中端机）
     HEADFUL=1 ...                                  # 有头（有头才用真 GPU 合成）
   PAGES=/articles/co-creation-notes/,/articles/ */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const PUPPETEER = [
  path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'),
  'D:/Nodejs/node_cache/_npx/ab5cd9f6d13a2312/node_modules/puppeteer-core',
].find((p) => fs.existsSync(p));
const puppeteer = require(PUPPETEER);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', process.argv[2] || 'dist');
const [FROM, TO] = (process.env.PAGES || '/articles/co-creation-notes/,/articles/').split(',');
const CPU = +(process.env.CPU || 1);
const BACK = process.env.BACK === '1';
const W = 1440, H = 900, DPR = +(process.env.DPR || 2);
const OUT = path.join(__dirname, '_trace-return');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
const serve = () => new Promise((res) => {
  const s = http.createServer((q, r) => {
    const u = decodeURIComponent((q.url || '/').split('?')[0]);
    let f = path.join(ROOT, u);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 按线程汇总 trace：每个线程的忙碌毫秒、主线程最长的几个任务及其主要子项 */
function summarize(events) {
  const names = {}, procs = {};
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
    if (e.name === 'process_name') procs[e.pid] = e.args.name;
  }
  const tn = (e) => {
    let n = names[e.pid + ':' + e.tid] || 'tid' + e.tid;
    if (/GPU/i.test(procs[e.pid] || '')) n = 'GPU:' + n;
    return n.replace(/\d+$/, '').trim();
  };
  const tasks = events.filter((e) => e.ph === 'X' && e.dur && /RunTask$/.test(e.name)).sort((a, b) => a.ts - b.ts);
  const busy = {}, endOf = {}, longest = [];
  for (const e of tasks) {
    const k = e.pid + ':' + e.tid;
    if (e.ts < (endOf[k] || 0)) continue;
    endOf[k] = e.ts + e.dur;
    const n = tn(e);
    if (/VSync/.test(n)) continue;
    busy[n] = (busy[n] || 0) + e.dur / 1000;
    if (n === 'CrRendererMain' && e.dur > 60000) longest.push(e);
  }
  const detail = longest.sort((a, b) => b.dur - a.dur).slice(0, 6).map((t) => {
    const kids = {};
    for (const e of events) {
      if (e.ph !== 'X' || e.pid !== t.pid || e.tid !== t.tid || e === t) continue;
      if (e.ts < t.ts || e.ts + (e.dur || 0) > t.ts + t.dur) continue;
      if (/RunTask/.test(e.name)) continue;
      let key = e.name;
      if (e.args?.data?.functionName) key += ' ' + e.args.data.functionName;
      if (e.args?.data?.url) key += '@' + String(e.args.data.url).split('/').pop();
      kids[key] = Math.max(kids[key] || 0, e.dur / 1000);
    }
    return { ms: Math.round(t.dur / 1000), top: Object.entries(kids).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(0)}`) };
  });
  return { busy: Object.fromEntries(Object.entries(busy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)])), longest: detail };
}

(async () => {
  const { s, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.HEADFUL ? false : 'new',
    args: ['--no-sandbox', '--hide-scrollbars', `--window-size=${W},${H}`,
      '--enable-gpu-rasterization', '--ignore-gpu-blocklist',
      ...(process.env.SWIFT ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : [])],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
  const cdp = await page.createCDPSession();
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const base = `http://127.0.0.1:${port}`;
  const warm = async (u) => { await page.goto(base + u, { waitUntil: 'networkidle2', timeout: 60000 }); await sleep(3000); };
  /* 让两边都进缓存；真实用户来回走时也是这样 */
  await warm(TO); await warm(FROM); await warm(TO); await warm(FROM);

  /* 用 CDP 采 trace，把「点下去」放在 trace 区间正中 */
  await cdp.send('Tracing.start', {
    traceConfig: {
      includedCategories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame', 'blink', 'cc', 'gpu', 'viz', 'benchmark', 'loading'],
    },
    transferMode: 'ReturnAsStream',
  });
  const t0 = Date.now();
  let bfcache = null;
  if (BACK) {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  } else {
    const l = await page.evaluate(() => {
      const a = document.querySelector('.reback');
      const r = a.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.mouse.click(l.x, l.y)]);
  }
  const navMs = Date.now() - t0;
  await sleep(6000);
  const bfcacheFlag = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { type: n && n.type, activationStart: n && Math.round(n.activationStart), dcl: n && Math.round(n.domContentLoadedEventEnd), resEnd: n && Math.round(n.responseEnd) };
  });
  const { stream } = await cdp.send('Tracing.end');
  /* 手工收流（transferMode: ReturnAsStream 时 devtools 不回 dataCollected，要读 IO 流） */
  const buf = await new Promise(async (resolve) => {
    let acc = '';
    if (!stream) return resolve('');
    try {
      for (;;) {
        const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
        acc += r.base64Encoded ? Buffer.from(r.data, 'base64').toString('utf8') : r.data;
        if (r.eof) break;
      }
    } catch (e) { /* 流读不到就直接报空 */ }
    resolve(acc);
  });
  const chunks = [];
  if (buf) {
    const parsed = JSON.parse(buf);
    chunks.push(...(parsed.traceEvents || parsed));
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `trace-${BACK ? 'back' : 'link'}-cpu${CPU}.json`);
  fs.writeFileSync(file, JSON.stringify(chunks));
  const sum = summarize(chunks);

  console.log(`\n══ ${BACK ? '浏览器后退' : '点返回键'}  ${FROM} → ${TO}`);
  console.log(`   CPU 降速 ×${CPU} · DPR ${DPR} · ${process.env.HEADFUL ? '有头' : '无头'}`);
  console.log(`   点击到 domContentLoaded 完成：${navMs} ms`);
  console.log(`   新文档 navigation 条目：${JSON.stringify(bfcacheFlag)}`);
  console.log(`   线程忙碌（ms / 采样区间）：`);
  for (const [k, v] of Object.entries(sum.busy)) console.log(`      ${k.padEnd(28)} ${v}`);
  console.log(`   主线程最长任务：`);
  for (const t of sum.longest) console.log(`      ${String(t.ms).padStart(5)}ms  ${JSON.stringify(t.top)}`);
  if (errs.length) console.log(`   错误：\n      ${errs.slice(0, 6).join('\n      ')}`);
  console.log(`   trace：${file}`);

  await browser.close();
  s.close();
})().catch((e) => { console.error(e); process.exit(1); });
