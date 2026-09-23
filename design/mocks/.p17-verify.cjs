/* ─────────────────────────────────────────────────────────────
   Phase 17 · 独立复核（主会话用）
   只验用户点名要的四条，全部由本脚本现算，不采信作者自测：
     1) 醒态是不是「朝右下的单向连续漂移」（而不是往返）
     2) 「回溯」在漂了很久之后距离是否仍然不变 —— 关键的对照：
        若还是原版行为（漂移幅度乘 σ(mix)），漂 15s 后的回溯距离会比
        15s×速度 ≈ 420px 还大；本稿应当两次读数几乎相同。
     3) 梦态抽帧节拍：每 200ms 连拍，看差异峰值是否只落在整秒上
     4) 醒态几何：重叠对数、相邻平行边的间隙分布（应为 0 重叠 / 1–2px）
   用法：node design/mocks/.p17-verify.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p17-constructs-and-echo';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const serve = () =>
  new Promise((res) => {
    const s = http.createServer((req, r) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (r.writeHead(403), r.end());
      fs.readFile(p, (e, d) => {
        if (e) return (r.writeHead(404, { 'Cache-Control': 'no-store' }), r.end('nf'));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        r.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });

const SQ = '.fld-sq';
const rectOf = (sel, idx) =>
  `(() => { const e = document.querySelectorAll('${sel}')[${idx}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`;

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p17-verify')}`],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const goto = async (q) => {
    await page.goto(`${base}${FILE}.html?ui=0&zone=deep&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 700));
    await page.evaluate(() => {
      const el = document.querySelector('#ns-essays');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    });
    await new Promise((r) => setTimeout(r, 300));
  };

  /* ── 1 · 醒态单向漂移：同一块在 t / t+5s / t+10s 的位置 ── */
  await goto('face=wake');
  // 取一块视口内、且不容易被 5–10s 漂出画面的构造体（选靠左上的）
  const idx = await page.evaluate(
    `(() => { const es = document.querySelectorAll('${SQ}'); for (let i = 0; i < es.length; i++) { const r = es[i].getBoundingClientRect(); if (r.left > 300 && r.top > 200 && r.left < 700 && r.top < 500 && r.width > 60) return i; } return 0; })()`,
  );
  const drift = [];
  for (const wait of [0, 5000, 5000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    drift.push(await page.evaluate(`(() => { const r = ${rectOf(SQ, idx)}; return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), t: performance.now() }; })()`));
  }
  const dv = drift.map((p, i) => (i === 0 ? null : { dx: +(p.x - drift[i - 1].x).toFixed(2), dy: +(p.y - drift[i - 1].y).toFixed(2), dt: +((p.t - drift[i - 1].t) / 1000).toFixed(2) }));
  const dir = dv.slice(1).map((v) => +((Math.atan2(v.dy, v.dx) * 180) / Math.PI).toFixed(2));
  const spd = dv.slice(1).map((v) => +(Math.hypot(v.dx, v.dy) / v.dt).toFixed(2));

  /* ── 2 · 定距回溯：早测一次、漂 15s 后再测一次，比较同一个 Δ 向量 ── */
  const rewindOnce = async () => {
    await page.evaluate(() => window.__p15.setMix(1));
    await new Promise((r) => setTimeout(r, 120));
    const a = await page.evaluate(`(${rectOf(SQ, idx)})`);
    const layA = await page.evaluate(`(() => { const e = document.querySelector('.fld-rewind'); return e ? getComputedStyle(e).transform : null; })()`);
    await page.evaluate(() => window.__p15.setMix(0));
    await new Promise((r) => setTimeout(r, 120));
    const b = await page.evaluate(`(${rectOf(SQ, idx)})`);
    const layB = await page.evaluate(`(() => { const e = document.querySelector('.fld-rewind'); return e ? getComputedStyle(e).transform : null; })()`);
    return { dx: +(b.x - a.x).toFixed(1), dy: +(b.y - a.y).toFixed(1), len: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(1), ang: +((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(1), layA, layB };
  };
  await goto('face=wake');
  const rw1 = await rewindOnce();
  const waited = 15000;
  await new Promise((r) => setTimeout(r, waited));
  const rw2 = await rewindOnce();
  const accumulated = +(spd[0] * waited / 1000).toFixed(0);

  /* ── 3 · 梦态节拍：200ms 连拍 16 张，逐帧差 ── */
  await goto('face=dream&freeze=1'); // freeze 仍保留 --still 驱动的位移，只停 CSS 动画 → 不能用于节拍
  await goto('face=dream');
  const shots = [];
  const t0 = Date.now();
  for (let i = 0; i < 16; i++) {
    shots.push({ b64: await page.screenshot({ encoding: 'base64', captureBeyondViewport: false }), t: Date.now() - t0 });
    await new Promise((r) => setTimeout(r, 110));
  }
  const DIFF2 = `async (a, b) => {
    const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
    const db = x.getImageData(0, 0, c.width, c.height).data;
    const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let s = 0, n = 0;
    for (let i = 0; i < da.length; i += 4) { s += Math.abs(L(da, i) - L(db, i)); n++; }
    return +(s / n).toFixed(3);
  }`;
  const beat = [];
  for (let i = 1; i < shots.length; i++) {
    const d = await page.evaluate(`(${DIFF2})(${JSON.stringify('data:image/png;base64,' + shots[i - 1].b64)},${JSON.stringify('data:image/png;base64,' + shots[i].b64)})`);
    beat.push({ dt: shots[i].t - shots[i - 1].t, mean: d });
  }
  await page.evaluate(() => window.__p15.setMix(0));

  /* ── 4 · 醒态几何：重叠、间隙分布 ── */
  const geoSel = await page.evaluate(
    `(() => { const out = []; for (const el of document.querySelectorAll('${SQ}')) { const r = el.getBoundingClientRect(); if (r.width < 4 || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); } return out; })()`,
  );
  await goto('face=wake');
  const geo = await page.evaluate(
    `(() => { const out = []; for (const el of document.querySelectorAll('${SQ}')) { const r = el.getBoundingClientRect(); if (r.width < 4 || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue; out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); } return out; })()`,
  );
  const ovl = (rs) => { let n = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0) n++; } return n; };
  const gaps = [];
  for (let i = 0; i < geo.length; i++)
    for (let j = i + 1; j < geo.length; j++) {
      const a = geo[i], b = geo[j];
      if (Math.abs(a.x + a.w - b.x) <= 3 || Math.abs(b.x + b.w - a.x) <= 3) {
        const ov = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ov > 4) gaps.push(Math.abs(Math.abs(a.x + a.w - b.x) || Math.abs(b.x + b.w - a.x)));
      }
      if (Math.abs(a.y + a.h - b.y) <= 3 || Math.abs(b.y + b.h - a.y) <= 3) {
        const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (ov > 4) gaps.push(Math.abs(Math.abs(a.y + a.h - b.y) || Math.abs(b.y + b.h - a.y)));
      }
    }
  const gapHist = {};
  for (const g of gaps) gapHist[g] = (gapHist[g] || 0) + 1;

  await browser.close();
  server.close();
  const out = {
    drift: { samples: drift.map((p) => ({ x: p.x, y: p.y })), vectors: dv.slice(1), anglesDeg: dir, speedPxPerS: spd },
    rewind: { first: rw1, after15s: rw2, accumulatedDriftPx: accumulated, netLenDelta: +(rw2.len - rw1.len).toFixed(1) },
    beat: beat.map((b) => ({ dt: b.dt, mean: b.mean })),
    geometry: { n: geo.length, overlapPairs: ovl(geo), gapHist },
    errs,
  };
  fs.writeFileSync(path.join(__dirname, '.shots-p17-verify.json'), JSON.stringify(out, null, 2));
  console.log('1 · 醒态漂移  t/t+5s/t+10s:', JSON.stringify(out.drift.samples));
  console.log('   每 5s 位移向量:', JSON.stringify(out.drift.vectors), '方向°', dir.join('/'), '速度px/s', spd.join('/'));
  console.log('2 · 定距回溯  第一次 Δ', JSON.stringify(rw1), '\n             漂 15s 后 Δ', JSON.stringify(rw2));
  console.log('   累积漂移应为', accumulated, 'px；两次回溯长度差 =', out.rewind.netLenDelta, 'px');
  console.log('3 · 梦态节拍（200ms 连拍，逐帧平均 ΔL）:');
  console.log('   ', beat.map((b) => `${b.dt}ms:${b.mean}`).join('  '));
  console.log('4 · 醒态几何  方块', geo.length, '｜ 重叠对', out.geometry.overlapPairs, '｜ 间隙分布', JSON.stringify(gapHist));
  console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'console errors: none');
  console.log('\n已写 design/mocks/.shots-p17-verify.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
