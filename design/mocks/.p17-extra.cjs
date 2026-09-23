/* ─────────────────────────────────────────────────────────────
   P17 · 构造场 × 定距回溯 × 1Hz 抽帧 × 谐波残影 · 额外观测（静态图证不了的那些）

   用法：node design/mocks/.p17-extra.cjs [smoke|assert|measure|interact|rewind|beat|drift|perf|all]

   1 · smoke     开一页，抓 console/pageerror，打印 window.__p17 全部读数
   2 · assert    从 DOM 独立复核生成期断言（不采信 window.__p17 的自报）：
                 ① 醒态任意两块零重叠（面积交）② 相邻平行边间隙 ∈[1,2]px 的分布
                 ③ 跨副本（−DX,−DY）零重叠；并核对醒态 computed transform 是否
                   真的落在 tiled 几何上
   3 · measure   版心（42rem 列）内背景最亮处 / 相邻墨色亮度差（三 zone × 醒梦），
                 同机位 freeze 逐像素 on/off
   4 · interact  长按 1300ms→梦 / 2200ms→醒 / 中途松手退回（墙钟计时）
   5 · rewind    ★ 本轮最关键的验收：量「定距回溯」的位移向量
                 冻结相位取纯净帧 + 活体（漂移在跑）分解，并「醒态漂 20s 之后」
                 复测一次，证明回溯距离**没有变长**
   6 · beat      ★ Part 3 的验收：梦态按固定相位连拍 16 帧（每 200ms 一帧）逐帧
                 全幅像素差 ⇒ 峰值只落在每 1 秒的拍上；另跑一遍真实墙钟连拍
   7 · drift     醒态单向漂移证据：三档各取一个构造体，20s 里每 4s 读一次坐标
                 （应为同向、近似等速、沿 14° 朝右下），并做一次逐像素验证
   8 · perf      醒态 animation 清单 + 新增 rAF / 监听计数 + 有层/无层帧数
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p17-constructs-and-echo';
const OUT = path.join(__dirname, '.shots-p17-extra');
fs.mkdirSync(OUT, { recursive: true });
const MODE = process.argv[2] || 'all';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) return (res.writeHead(403), res.end('forbidden'));
      fs.readFile(p, (err, data) => {
        if (err) return (res.writeHead(404, { 'Cache-Control': 'no-store' }), res.end('not found'));
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 本层贡献的最大 |ΔL|（W3C 相对亮度），限定在 box 里（= 版心列） */
async function pngDiff(page, aB64, bB64, box) {
  return page.evaluate(async (a, b, r) => {
    const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    const rgb = (d, i) => [d[i], d[i + 1], d[i + 2]].join(',');
    let maxIn = 0, at = null, maxAll = 0;
    const x0 = Math.round(r.l), x1 = Math.round(r.r);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(L(A, i) - L(B, i));
        if (d > maxAll) maxAll = d;
        if (x >= x0 && x < x1 && d > maxIn) { maxIn = d; at = { x, y, on: rgb(A, i), off: rgb(B, i) }; }
      }
    }
    return { maxIn, maxAll, at, w: c.width, h: c.height };
  }, aB64, bB64, box);
}
/* 全幅像素差（不改动任何东西，只比两张同机位图） */
async function pngCompare(page, aB64, bB64) {
  return page.evaluate(async (a, b) => {
    const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, sum = 0, maxd = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d > 8) n++;
      if (d > maxd) maxd = d;
      sum += d;
    }
    return { changedPx: n, totalPx: A.length / 4, maxCh: maxd, meanCh: +(sum / (A.length / 4)).toFixed(4) };
  }, aB64, bB64);
}
/* 最佳整像素位移：求解 A(x,y) ≈ B(x+dx, y+dy) ⇒ 内容位移 = (dx, dy) */
async function bestShift(page, aB64, bB64, cand) {
  return page.evaluate(async (a, b, cs) => {
    const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const res = [];
    for (const p of cs) {
      const dx = p[0], dy = p[1];
      let sum = 0, n = 0, ch = 0;
      for (let y = 80; y < H - 80; y += 2) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let x = 80; x < W - 80; x += 2) {
          const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const i = (y * W + x) * 4, j = (yy * W + xx) * 4;
          const d = Math.max(Math.abs(A[i] - B[j]), Math.abs(A[i + 1] - B[j + 1]), Math.abs(A[i + 2] - B[j + 2]));
          if (d > 8) ch++;
          sum += d;
          n++;
        }
      }
      /* 评分＝「变化像素占比」(>8 通道差)：对 1px 细线的平移最敏感，比平均差锐得多 */
      res.push({ dx, dy, mad: +(sum / n).toFixed(3), chPct: +(100 * ch / n).toFixed(3), ch });
    }
    res.sort((p, q) => p.chPct - q.chPct);
    const zero = res.find((r) => r.dx === 0 && r.dy === 0) || null;
    return { best: res.slice(0, 4), zero };
  }, aB64, bB64, cand);
}

(async () => {
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p17-probe')}`],
  });
  const errors = [];
  const mk = async (w, h) => {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    return p;
  };
  const goto = async (p, q, at, wait = 500) => {
    await p.goto(`${BASE}?ui=0&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(wait);
    if (at) {
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, at);
      await sleep(700);
    }
  };
  /* 相位钉住：把全部抽帧动画 + 漂移一起钉到 −ms（.freeze * 的 0s 被更具体的规则盖住）。
     漂移必须一起钉：梦态的真实运动是「漂移 − 锯齿余量 = 阶梯」，只钉锯齿不钉漂移
     等于把那条恒等的抵消拆开，帧间会多出一份假的线性位移。 */
  const pinPhase = (p, ms) => p.evaluate((m) => {
    let s = document.getElementById('p17-probe');
    if (!s) { s = document.createElement('style'); s.id = 'p17-probe'; document.head.appendChild(s); }
    s.textContent = '#p15-bg .fld-pan,#p15-bg .fld-quant,#p15-bg .fld-beat,#p15-bg .esb b,#p15-eeg .eeg-echo-1,#p15-eeg .eeg-echo-2,#p15-eeg .eeg-echo-3'
      + '{animation-delay:' + (-m) + 'ms !important;animation-play-state:paused !important;}';
  }, ms);

  /* ═══════════ 1 · smoke ═══════════ */
  if (MODE === 'smoke' || MODE === 'all') {
    const p = await mk(1440, 900);
    await goto(p, 'zone=deep&face=wake', null, 900);
    console.log('__p17 =', JSON.stringify(await p.evaluate(() => window.__p17), null, 1).slice(0, 2600));
    console.log('骨骼：',
      JSON.stringify(await p.evaluate(() => ({
        pans: document.querySelectorAll('#fld-field .fld-pan').length,
        cells: document.querySelectorAll('#fld-field .fld-cell').length,
        cl: document.querySelectorAll('#fld-field .fld-cl').length,
        sq: document.querySelectorAll('#fld-field .fld-sq').length,
        cut: document.querySelectorAll('#fld-field .fld-cut').length,
        esb: document.querySelectorAll('.echo-stave .esb').length,
        echo: document.querySelectorAll('#p15-eeg .eeg-echo-1, #p15-eeg .eeg-echo-2, #p15-eeg .eeg-echo-3').length,
        rewindTf: getComputedStyle(document.querySelector('.fld-rewind')).transform,
      }))));
    console.log('errors:', errors.length ? errors : 'none');
    await p.close();
  }

  /* ═══════════ 2 · assert：从 DOM 独立复核几何 ═══════════ */
  if (MODE === 'assert' || MODE === 'all') {
    console.log('\n── 2 · 生成期断言的 DOM 独立复核 ──');
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${face}&mix=${face === 'wake' ? 1 : 0}&freeze=1`, null, 700);
      const dom = await p.evaluate(() => {
        const tiled = [], loose = [], tf = [];
        document.querySelectorAll('#fld-field .fld-pan').forEach((pan) => {
          const cell = pan.querySelector('.fld-cell');           // 只取第一份副本（第二份是它的纯平移）
          cell.querySelectorAll('.fld-cl').forEach((cl) => {
            const [X, Y] = cl.dataset.c.split(',').map(Number);
            cl.querySelectorAll('.fld-sq').forEach((sq) => {
              const [tx, ty, s] = sq.dataset.b.split(',').map(Number);
              const [lx, ly] = sq.dataset.l.split(',').map(Number);
              tiled.push({ x: X + tx, y: Y + ty, w: s, h: s });
              loose.push({ x: X + lx, y: Y + ly, w: s, h: s });
              const m = (getComputedStyle(sq).transform.match(/matrix\(([^)]+)\)/) || [0, ''])[1].split(',').map(Number);
              tf.push({ tx: +(m[4] || 0).toFixed(1), ty: +(m[5] || 0).toFixed(1), dx: tx - lx, dy: ty - ly });
            });
          });
        });
        return { tiled, loose, tf };
      });
      const T = dom.tiled, n = T.length;
      let ov = 0, worstOv = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = T[i], b = T[j];
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (w > 0 && h > 0) { ov++; worstOv = Math.max(worstOv, w * h); }
      }
      const DX = 2329, DY = 581;
      let copyOv = 0;
      for (const a of T) for (const b of T) {
        const w = Math.min(a.x + a.w, b.x - DX + b.w) - Math.max(a.x, b.x - DX);
        const h = Math.min(a.y + a.h, b.y - DY + b.h) - Math.max(a.y, b.y - DY);
        if (w > 0 && h > 0) copyOv++;
      }
      const dist = {}; let pairs = 0, mn = 0, mx = 0;
      const touched = new Set();
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = T[i], b = T[j];
        const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        let d = -1, t = 0;
        if (yOv > 0) { t = b.x - (a.x + a.w); if (t >= 0 && t <= 3) d = t; }
        if (d < 0 && xOv > 0) { t = b.y - (a.y + a.h); if (t >= 0 && t <= 3) d = t; }
        if (d < 0 && yOv > 0) { t = a.x - (b.x + b.w); if (t >= 0 && t <= 3) d = t; }
        if (d < 0 && xOv > 0) { t = a.y - (b.y + b.h); if (t >= 0 && t <= 3) d = t; }
        if (d < 0) continue;
        touched.add(i); touched.add(j);
        if (i < j) { pairs++; dist[d] = (dist[d] || 0) + 1; if (!mn || d < mn) mn = d; if (d > mx) mx = d; }
      }
      const tfOk = dom.tf.filter((r) => r.tx === r.dx && r.ty === r.dy).length;
      console.log(`${face.padEnd(5)} 方块 ${n}  DOM 重算：① 零重叠差对 ${ov} 对（最差 ${worstOv}px²）`
        + ` ③ 跨副本 ${copyOv} 对 ② 平行边距 ≤3px 的边对 ${pairs}，min ${mn} / max ${mx}，分布 ${JSON.stringify(dist)}`
        + ` 落单块 ${n - touched.size}`
        + (face === 'wake' ? `；computed transform 恰等于 tiled−loose 的：${tfOk}/${dom.tf.length}` : ''));
      await p.close();
    }
  }

  /* ═══════════ 3 · measure：版心内最亮处 / 相邻墨色差 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    console.log('\n── 3 · 版心（42rem 列）内背景最亮处 ÷ 相邻墨色亮度差 ──');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>diff</title>');
    const lumOf = (fgc, softc, bgc) => blank.evaluate((fg, soft, bg) => {
      const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3); return /srgb/.test(s) ? m.map((x) => x * 255) : m; };
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      return { lfg: L(parse(fg)), lsoft: L(parse(soft)), lbg: L(parse(bg)) };
    }, fgc, softc, bgc);
    for (const zone of ['deep', 'light', 'paper']) {
      for (const face of ['wake', 'dream']) {
        const p = await mk(1440, 900);
        await goto(p, `zone=${zone}&face=${face}&freeze=1`, '#ns-essays');
        const box = await p.evaluate(() => { const r = document.querySelector('#ns-essays .container').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        const ink = await p.evaluate(() => {
          const h = document.querySelector('#ns-essays .sec-head h2');
          const para = document.querySelector('#ns-essays .row p');
          return { fg: getComputedStyle(h).color, soft: getComputedStyle(para).color, bodyBg: getComputedStyle(document.body).backgroundColor };
        });
        const on = await p.screenshot({ encoding: 'base64' });
        await p.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'off'; });
        await sleep(150);
        const off = await p.screenshot({ encoding: 'base64' });
        const st = await pngDiff(p, on, off, box);
        const lum = await lumOf(ink.fg, ink.soft, ink.bodyBg);
        const dFg = Math.abs(lum.lfg - lum.lbg), dSoft = Math.abs(lum.lsoft - lum.lbg);
        console.log(`${zone.padEnd(6)} ${face.padEnd(5)} 最大|ΔL|=${st.maxIn.toFixed(4)} (rgb ${st.at.on} vs 无层 ${st.at.off} @${st.at.x},${st.at.y})`
          + ` ⇒ 标题墨 ${(100 * st.maxIn / dFg).toFixed(1)}% / 正文墨(--fg-soft) ${(100 * st.maxIn / dSoft).toFixed(1)}%  [全幅 ${(100 * st.maxAll / dSoft).toFixed(1)}%]`);
        await p.close();
      }
    }
    /* 三道脑电残影单独算（醒态应当为 0） */
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${face}&freeze=1`, '#ns-essays');
      const box = await p.evaluate(() => { const r = document.querySelector('#ns-essays .container').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
      const on = await p.screenshot({ encoding: 'base64' });
      await p.evaluate(() => { document.querySelectorAll('.eeg-echo-1,.eeg-echo-2,.eeg-echo-3').forEach((e) => (e.style.display = 'none')); });
      await sleep(120);
      const off = await p.screenshot({ encoding: 'base64' });
      const st = await pngDiff(p, on, off, box);
      console.log(`三道残影单独（deep ${face}）最大|ΔL|=${st.maxIn.toFixed(4)}（版心内）`);
      await p.close();
    }
  }

  /* ═══════════ 4 · interact：长按时序 ═══════════ */
  if (MODE === 'interact' || MODE === 'all') {
    console.log('\n── 4 · 长按交互（每次新开一页；sessionStorage 会闩锁）──');
    for (const from of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${from}`, null, 400);
      const t = await p.evaluate(async () => {
        const t0 = performance.now();
        window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55);
        const f0 = window.__p15.state().face;
        while (performance.now() - t0 < 4000) {
          await new Promise((r) => setTimeout(r, 40));
          if (window.__p15.state().face !== f0) return { ms: Math.round(performance.now() - t0), from: f0, to: window.__p15.state().face };
        }
        return { ms: -1, from: f0, to: window.__p15.state().face };
      });
      console.log(`按住 ${from} 面 → ${t.to} 面，墙钟 ${t.ms}ms（外壳 T_BACK=1300 / T_GO=2200）`);
      await p.close();
    }
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream', null, 400);
      const seq = await p.evaluate(async () => {
        const out = [];
        window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55);
        for (const t of [0, 200, 300, 400, 600]) {
          await new Promise((r) => setTimeout(r, t === 0 ? 0 : 100));
          out.push([t, window.__p15.state().mix]);
        }
        window.__p15.release();
        const t0 = performance.now();
        while (performance.now() - t0 < 1200) { await new Promise((r) => setTimeout(r, 60)); out.push(['r+' + Math.round(performance.now() - t0), window.__p15.state().mix]); }
        return out;
      });
      console.log('按住 600ms 松手：mix 序列', JSON.stringify(seq));
      await p.close();
    }
  }

  /* ═══════════ 5 · rewind：定距回溯的位移向量 ═══════════ */
  if (MODE === 'rewind' || MODE === 'all') {
    console.log('\n── 5 · 定距回溯（本轮最关键的验收）──');
    /* 读数：锁定「同一个构造体」（固定 DOM 下标，越漂越不换人）+ 各层的 computed transform */
    const pickIdx = `(() => {
      let idx = -1, best = null;
      document.querySelectorAll('#fld-field .fld-cell:first-child .fld-cl').forEach((cl, i) => {
        const r = cl.getBoundingClientRect();
        if (r.left < 120 || r.left > 700 || r.top < 120 || r.top > 520) return;
        const s = r.left + r.top;
        if (best === null || s < best) { best = s; idx = i; }
      });
      return idx;
    })()`;
    const probe = (p, k) => p.evaluate((k) => {
      const el = document.querySelectorAll('#fld-field .fld-cell:first-child .fld-cl')[k];
      const r = el.getBoundingClientRect();
      const tf = (node) => { const m = getComputedStyle(node).transform.match(/matrix\(([^)]+)\)/); const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]; return { x: +(+v[4]).toFixed(2), y: +(+v[5]).toFixed(2) }; };
      const root = getComputedStyle(document.documentElement);
      /* 必须读**同一个档**的层：三档速度不同，读错档分解出来的分量就是错的 */
      const bands = [...document.querySelectorAll('#fld-field .fld-pan')];
      const bi = bands.indexOf(el.closest('.fld-pan'));
      const pan = bands[bi];
      return { cl: { x: +r.left.toFixed(2), y: +r.top.toFixed(2), c: el.dataset.c }, band: bi,
        mix: parseFloat(root.getPropertyValue('--reality-mix')),
        rw: tf(document.querySelector('.fld-rewind')), pan: tf(pan),
        quant: tf(pan.querySelector('.fld-quant')), beat: tf(pan.querySelector('.fld-beat')),
        rwx: parseFloat(root.getPropertyValue('--rw-x')), rwy: parseFloat(root.getPropertyValue('--rw-y')) };
    }, k);
    /* 逐像素比对时把不动的都藏掉（正文/缝线/颗粒/脑电/谱带），只留会动的构造场 */
    const hideStatic = (p) => p.evaluate(() => {
      let s = document.getElementById('p17-hide');
      if (!s) { s = document.createElement('style'); s.id = 'p17-hide'; s.textContent = '.page,.seam,.grain,.dbg,#p15-eeg,.echo-stave{display:none !important}'; document.head.appendChild(s); }
    });

    /* A · 冻结相位：唯一在动的就是回溯（漂移/锯齿/阶跃全部停在 0% 帧） */
    for (const [tag, pre] of [['A1 · 醒面立刻按', 0], ['A2 · 醒态漂 20s 之后按', 20000]]) {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=wake&freeze=1', null, 400);
      const K = await p.evaluate(pickIdx);
      await hideStatic(p);
      if (pre) { console.log(`   （等 ${pre / 1000}s，让漂移先跑一段……）`); await sleep(pre); }
      const before = await probe(p, K);
      const shotA = await p.screenshot({ encoding: 'base64' });
      await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55));
      await sleep(1600);
      const after = await probe(p, K);
      const shotB = await p.screenshot({ encoding: 'base64' });
      const d = { x: +(after.cl.x - before.cl.x).toFixed(2), y: +(after.cl.y - before.cl.y).toFixed(2) };
      const rw = { x: +(after.rw.x - before.rw.x).toFixed(2), y: +(after.rw.y - before.rw.y).toFixed(2) };
      const len = Math.hypot(d.x, d.y), ang = Math.atan2(d.y, d.x) * 180 / Math.PI;
      const rwLen = Math.hypot(rw.x, rw.y), rwAng = Math.atan2(rw.y, rw.x) * 180 / Math.PI;
      console.log(`${tag}（freeze：只有回溯在动；构造体 #${K} 簇 ${before.cl.c}）`);
      console.log(`   构造体屏幕位移 = (${d.x}, ${d.y})  |Δ| = ${len.toFixed(1)}px  方向 ${ang.toFixed(2)}°（= 180+14 ⇒ 沿 14° 朝左上）`);
      console.log(`   .fld-rewind 自身 transform 位移 = (${rw.x}, ${rw.y})  |Δ| = ${rwLen.toFixed(1)}px  方向 ${rwAng.toFixed(2)}°`);
      console.log(`   mix ${before.mix} → ${after.mix}；--rw-x/--rw-y = ${after.rwx}/${after.rwy}px（--fld-rewind = 260px）`);
      if (tag.startsWith('A1')) {
        const cand = [];
        for (let dx = -258; dx <= -246; dx++) for (let dy = -69; dy <= -57; dy++) cand.push([dx, dy]);
        cand.push([0, 0]);
        const bs = await bestShift(p, shotA, shotB, cand);
        console.log('   逐像素最佳整像素位移（A(x,y) ≈ B(x+dx,y+dy)，只留构造场）= (' + bs.best[0].dx + ', ' + bs.best[0].dy + ')'
          + '，变化像素 ' + bs.best[0].chPct + '%（mad ' + bs.best[0].mad + '）；对照「不平移」(0,0) 变化像素 ' + (bs.zero ? bs.zero.chPct : '-')
          + '% ⇒ 最佳解把它压到 1/' + (bs.zero ? (bs.zero.chPct / bs.best[0].chPct).toFixed(0) : '?'));
        console.log('   前四名：' + JSON.stringify(bs.best));
      }
      fs.writeFileSync(path.join(OUT, `rewind-${tag.slice(0, 2)}-before.png`), Buffer.from(shotA, 'base64'));
      fs.writeFileSync(path.join(OUT, `rewind-${tag.slice(0, 2)}-after.png`), Buffer.from(shotB, 'base64'));
      await p.close();
    }

    /* B · 活体（漂移在跑）：分解出回溯分量，并对照「20s 累积漂移」 */
    for (const [tag, pre] of [['B1 · 活体 立刻按', 0], ['B2 · 活体 漂 20s 后按', 20000]]) {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=wake&plate=off', null, 400);
      const K = await p.evaluate(pickIdx);
      const t0 = await p.evaluate(() => performance.now());
      const before = await probe(p, K);
      if (pre) { console.log(`   （等 ${pre / 1000}s……）`); await sleep(pre); }
      const prePress = await probe(p, K);
      const t1 = await p.evaluate(() => performance.now());
      await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55));
      await sleep(1600);
      const after = await probe(p, K);
      const t2 = await p.evaluate(() => performance.now());
      const net = { x: +(after.cl.x - prePress.cl.x).toFixed(2), y: +(after.cl.y - prePress.cl.y).toFixed(2) };
      /* 净位移 = 漂移(按下→闩锁) + 锯齿 + 阶跃 + 回溯；逐层减掉，残差就是回溯 */
      const dPan = { x: +(after.pan.x - prePress.pan.x).toFixed(2), y: +(after.pan.y - prePress.pan.y).toFixed(2) };
      const dQuant = { x: +(after.quant.x - prePress.quant.x).toFixed(2), y: +(after.quant.y - prePress.quant.y).toFixed(2) };
      const dBeat = { x: +(after.beat.x - prePress.beat.x).toFixed(2), y: +(after.beat.y - prePress.beat.y).toFixed(2) };
      const dRw = { x: +(after.rw.x - prePress.rw.x).toFixed(2), y: +(after.rw.y - prePress.rw.y).toFixed(2) };
      const resid = { x: +(net.x - dPan.x - dQuant.x - dBeat.x - dRw.x).toFixed(2), y: +(net.y - dPan.y - dQuant.y - dBeat.y - dRw.y).toFixed(2) };
      const driftTotal = { x: +(prePress.cl.x - before.cl.x).toFixed(2), y: +(prePress.cl.y - before.cl.y).toFixed(2) };
      console.log(`${tag}`);
      console.log(`   按下前已累积漂移 = (${driftTotal.x}, ${driftTotal.y})  |Δ| = ${Math.hypot(driftTotal.x, driftTotal.y).toFixed(1)}px（${((t1 - t0) / 1000).toFixed(1)}s · 方向 ${(Math.atan2(driftTotal.y, driftTotal.x) * 180 / Math.PI).toFixed(2)}°）`);
      console.log(`   按下→闩锁 净位移 = (${net.x}, ${net.y})  |Δ| = ${Math.hypot(net.x, net.y).toFixed(1)}px  方向 ${(Math.atan2(net.y, net.x) * 180 / Math.PI).toFixed(2)}°（${((t2 - t1)).toFixed(0)}ms）`);
      console.log(`     其中 漂移(${dPan.x},${dPan.y}) 锯齿(${dQuant.x},${dQuant.y}) 阶跃(${dBeat.x},${dBeat.y}) ⇒ 回溯 = (${dRw.x}, ${dRw.y}) |Δ|=${Math.hypot(dRw.x, dRw.y).toFixed(1)}px 方向 ${(Math.atan2(dRw.y, dRw.x) * 180 / Math.PI).toFixed(2)}°（四层拆解残差 (${resid.x},${resid.y}) 应 ≈0）`);
      await p.close();
    }

    /* A3 · 纯位移对照：两页同在梦态（同色），只把 --rw-k 一个设 0、一个设 1
       ⇒ 两帧之间**只有回溯这一个位移**，逐像素最佳位移应当精确等于 (--rw-x, --rw-y) */
    {
      const grab = async (rwK) => {
        const p = await mk(1440, 900);
        await goto(p, 'zone=deep&mix=0&freeze=1', null, 500);
        await hideStatic(p);
        if (rwK === 0) await p.evaluate(() => document.documentElement.style.setProperty('--rw-k', '0'));
        await sleep(150);
        const b = await p.screenshot({ encoding: 'base64' });
        const tf = await p.evaluate(() => getComputedStyle(document.querySelector('.fld-rewind')).transform);
        fs.writeFileSync(path.join(OUT, `rewind-A3-rwk${rwK}.png`), Buffer.from(b, 'base64'));
        await p.close();
        return { b, tf };
      };
      const A = await grab(0), B = await grab(1);
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&mix=0&freeze=1', null, 300);
      const cand = [];
      for (let dx = -256; dx <= -248; dx++) for (let dy = -67; dy <= -59; dy++) cand.push([dx, dy]);
      cand.push([0, 0]);
      const bs = await bestShift(p, A.b, B.b, cand);
      console.log('A3 · 梦态同色、只差一个回溯（--rw-k 0 vs 1）：');
      console.log(`   transform 0 → ${B.tf}`);
      console.log(`   逐像素最佳位移 = (${bs.best[0].dx}, ${bs.best[0].dy})，变化像素 ${bs.best[0].chPct}%（对照不平移 (0,0) ${bs.zero ? bs.zero.chPct : '-'}%）`);
      console.log('   前四名：' + JSON.stringify(bs.best));
      await p.close();
    }

    /* C · ?rw=NNN 一行调生效 */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=wake&freeze=1&rw=400', null, 400);
      await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55));
      await sleep(1600);
      const r = await p.evaluate(() => ({
        rw: window.__p17 ? [window.__p17.rewindPx, window.__p17.rwX, window.__p17.rwY, window.__p17.rwLen, window.__p17.rwAngleDeg] : null,
        tf: getComputedStyle(document.querySelector('.fld-rewind')).transform,
      }));
      console.log('?rw=400 ⇒', JSON.stringify(r));
      await p.close();
    }
  }

  /* ═══════════ 6 · beat：合并后的节拍 ═══════════ */
  if (MODE === 'beat' || MODE === 'all') {
    console.log('\n── 6 · 合并后的节拍（梦态）──');
    /* A · 固定相位连拍 16 帧：0 / 200 / … / 3000ms */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream&mix=0&freeze=1', null, 600);
      const shots = [];
      for (let i = 0; i <= 15; i++) {
        await pinPhase(p, i * 200 + 100);   // 避开整秒边界：边界上动画恰好在 wrap，浏览器可能给 100% 帧而非 0% 帧
        await sleep(90);
        shots.push(await p.screenshot({ encoding: 'base64' }));
      }
      const diffs = [];
      for (let i = 0; i < shots.length - 1; i++) {
        const d = await pngCompare(p, shots[i], shots[i + 1]);
        diffs.push(+d.meanCh.toFixed(3));
      }
      const sorted = [...diffs].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const peaks = diffs.map((v, i) => (v > med * 3 ? i + 1 : 0)).filter(Boolean);
      console.log('相位钉住 0→3000ms，每 200ms 一帧，逐帧全幅平均通道差：');
      console.log('  ' + diffs.map((v, i) => `${i * 200}→${(i + 1) * 200}ms ${v}`).join('\n  '));
      console.log(`  峰值出现在第 ${peaks.join(' / ')} 个间隔（=${peaks.map((k) => `${k * 200}ms`).join(' / ')} 结束 ⇒ 拍落在 1000 / 2000 / 3000ms 上）；`
        + ` 非拍均差中位数 ${med}，拍上均差 ${peaks.map((k) => diffs[k - 1]).join(' / ')} ⇒ 比值 ≈ ${(peaks.map((k) => diffs[k - 1] / med).reduce((a, b) => a + b, 0) / peaks.length).toFixed(0)}×`);
      fs.writeFileSync(path.join(OUT, 'beat-phase-frames.txt'), diffs.join('\n'));
      await p.close();
    }
    /* B · 真实墙钟连拍（漂移/锯齿都在跑），主波先藏起来（它是外壳那条 30fps 的线） */
    for (const [tag, extra] of [['仅背景场（藏主波）', true], ['含主波（全页）', false]]) {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream&mix=0', null, 900);
      if (extra) await p.evaluate(() => { document.querySelectorAll('.eeg-main').forEach((e) => (e.style.display = 'none')); });
      const shots = [], ts = [];
      const T0 = Date.now();
      for (let i = 0; i < 16; i++) { shots.push(await p.screenshot({ encoding: 'base64' })); ts.push(Date.now() - T0); }
      const diffs = [];
      for (let i = 0; i < shots.length - 1; i++) diffs.push(+(await pngCompare(p, shots[i], shots[i + 1])).meanCh.toFixed(3));
      const sorted = [...diffs].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const peaks = diffs.map((v, i) => (v > med * 2.5 ? i + 1 : 0)).filter(Boolean);
      console.log(`真实连拍 · ${tag}（帧间隔 ${ts.slice(1).map((t, i) => t - ts[i]).join('/')}ms）`);
      console.log('  逐帧均差 ' + diffs.map((v, i) => `${i + 1}:${v}`).join('  '));
      console.log(`  峰值间隔 #${peaks.join(' / #')} ⇒ 墙钟 ${peaks.map((k) => ts[k] + 'ms').join(' / ')}；非拍中位 ${med}，拍上 ${peaks.map((k) => diffs[k - 1]).join(' / ')}`);
      await p.close();
    }
  }

  /* ═══════════ 7 · drift：醒态单向漂移 ═══════════ */
  if (MODE === 'drift' || MODE === 'all') {
    console.log('\n── 7 · 醒态单向漂移（应与缝线同向、近似等速、不折返）──');
    const p = await mk(1440, 900);
    await goto(p, 'zone=deep&face=wake&plate=off', null, 500);
    /* 每档锁一个构造体（固定 DOM 下标）——否则漂着漂着「最靠左上那个」会换人 */
    const pickIdx = `(() => {
      const out = [];
      document.querySelectorAll('#fld-field .fld-pan').forEach((pan) => {
        let best = null, idx = -1, fall = null, fi = -1;
        pan.querySelectorAll('.fld-cell:first-child .fld-cl').forEach((cl, i) => {
          const r = cl.getBoundingClientRect();
          const d = Math.hypot(r.left - innerWidth / 2, r.top - innerHeight / 2);
          if (fall === null || d < fall) { fall = d; fi = i; }
          if (r.left < 80 || r.left > 700 || r.top < 100 || r.top > 600) return;
          const s = r.left + r.top;
          if (best === null || s < best) { best = s; idx = i; }
        });
        out.push(idx >= 0 ? idx : fi);
      });
      return out;
    })()`;
    const KS = await p.evaluate(pickIdx);
    const read = (k) => p.evaluate((ks) => {
      const pans = document.querySelectorAll('#fld-field .fld-pan');
      const out = [];
      pans.forEach((pan, bi) => {
        const cl = pan.querySelectorAll('.fld-cell:first-child .fld-cl')[ks[bi]];
        if (!cl) return out.push(null);
        const r = cl.getBoundingClientRect();
        out.push({ x: +r.left.toFixed(2), y: +r.top.toFixed(2), c: cl.dataset.c });
      });
      return out;
    }, k);
    const samples = [];
    const T0 = Date.now();
    for (const t of [0, 4000, 8000, 12000, 16000, 20000]) {
      if (t) await sleep(t - (Date.now() - T0));
      samples.push({ t: Date.now() - T0, v: await read(KS) });
    }
    for (let b = 0; b < 3; b++) {
      const rows = samples.map((s) => s.v[b]).filter(Boolean);
      if (rows.length < 2) { console.log(`档 ${b}: 候选点不足`); continue; }
      const parts = [];
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1].v[b], c = samples[i].v[b];
        if (!a || !c) continue;
        const dx = +(c.x - a.x).toFixed(1), dy = +(c.y - a.y).toFixed(1);
        parts.push(`${samples[i].t}ms Δ(${dx},${dy}) ${Math.hypot(dx, dy).toFixed(0)}px ${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}°`);
      }
      const first = rows[0], last = rows[rows.length - 1];
      const tx = +(last.x - first.x).toFixed(1), ty = +(last.y - first.y).toFixed(1);
      console.log(`档 ${b + 1}（簇 ${first.c}）：` + parts.join(' | '));
      console.log(`       20s 累计 (${tx}, ${ty}) = ${Math.hypot(tx, ty).toFixed(0)}px，方向 ${(Math.atan2(ty, tx) * 180 / Math.PI).toFixed(2)}°（期望 14°，速度 ${(Math.hypot(tx, ty) / ((samples[samples.length - 1].t - samples[0].t) / 1000)).toFixed(1)}px/s）`);
    }
    /* 逐像素复核：只留最慢的一档，两根帧差找最佳位移 */
    await p.evaluate(() => {
      let st = document.getElementById('p17-hide');
      if (!st) { st = document.createElement('style'); st.id = 'p17-hide'; st.textContent = '.page,.seam,.grain,.dbg,#p15-eeg,.echo-stave{display:none !important}'; document.head.appendChild(st); }
      const a = document.querySelectorAll('#fld-field .fld-pan');
      for (let i = 1; i < a.length; i++) a[i].style.display = 'none';
    });
    await sleep(200);
    const sA = await p.screenshot({ encoding: 'base64' });
    await sleep(3000);
    const sB = await p.screenshot({ encoding: 'base64' });
    const cand = [];
    for (let dx = 40; dx <= 90; dx += 2) for (let dy = 6; dy <= 26; dy += 2) cand.push([dx, dy]);
    cand.push([0, 0]);
    const bs2 = await bestShift(p, sA, sB, cand);
    const bl = Math.hypot(bs2.best[0].dx, bs2.best[0].dy);
    console.log('  逐像素（只留远档 104s≈23px/s）：3s 位移最佳解 = (' + bs2.best[0].dx + ', ' + bs2.best[0].dy + ') = ' + bl.toFixed(1) + 'px / 3s = '
      + (bl / 3).toFixed(1) + 'px/s、方向 ' + (Math.atan2(bs2.best[0].dy, bs2.best[0].dx) * 180 / Math.PI).toFixed(1) + '°（变化像素 ' + bs2.best[0].chPct + '%）；对照 (0,0) 变化像素 ' + (bs2.zero ? bs2.zero.chPct + '%' : '-'));
    await p.close();
  }

  /* ═══════════ 8 · perf：动画清单 / rAF / 监听 ═══════════ */
  if (MODE === 'perf' || MODE === 'all') {
    console.log('\n── 8 · 醒态 animation 清单 + 新增 rAF / 监听 ──');
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await p.evaluateOnNewDocument(() => {
        window.__raf = 0; window.__lis = 0;
        const r = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (cb) { window.__raf++; return r(cb); };
        const a = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (...x) { window.__lis++; return a.apply(this, x); };
      });
      await goto(p, `zone=deep&face=${face}`, null, 3200);
      const r = await p.evaluate(() => {
        const rows = [];
        document.querySelectorAll('#p15-bg *, #p15-eeg *').forEach((el) => {
          for (const an of el.getAnimations()) {
            const cs = getComputedStyle(el);
            const m = cs.transform.match(/matrix\(([^)]+)\)/);
            rows.push({
              el: (el.id ? '#' + el.id : el.className.baseVal !== undefined ? el.tagName + '.' + el.className.baseVal : el.tagName + '.' + (el.className || '')),
              name: an.animationName, dur: +an.effect.getTiming().duration.toFixed(0),
              delay: an.effect.getTiming().delay,
              tf: m ? m[1] : cs.transform,
            });
          }
        });
        return { rows, raf: window.__raf, lis: window.__lis };
      });
      const byName = {};
      for (const x of r.rows) byName[x.name] = (byName[x.name] || 0) + 1;
      console.log(`${face}: 本层动画 ${r.rows.length} 条 = ${JSON.stringify(byName)}；3.2s 内 rAF ${r.raf}、addEventListener ${r.lis}`);
      const ident = r.rows.filter((x) => /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(x.tf)).length;
      console.log(`   其中 computed transform 为恒等（醒态无位移）的 ${ident} 条；带位移的：${r.rows.filter((x) => !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(x.tf)).map((x) => x.name + '(' + x.tf + ')').join(' , ') || '无'}`);
      if (face === 'wake') {
        /* 有层 / 无层帧数（不打降速，只看基线有没有掉帧） */
        const frames = await p.evaluate(async () => {
          const count = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); });
          const on = await count();
          document.getElementById('p15-bg').dataset.layer = 'off';
          const off = await count();
          document.getElementById('p15-bg').dataset.layer = 'through';
          return { on, off };
        });
        console.log(`   3s rAF 帧数：有层 ${frames.on} / 无层 ${frames.off}（60fps 满帧 = 180）`);
      }
      await p.close();
    }
  }

  /* ═══════════ 10 · wakeclean：P15-B 那一层在醒态必须是「什么都没多」 ═══════════ */
  if (MODE === 'wakeclean' || MODE === 'all') {
    console.log('\n── 10 · 醒态：新并进来的 B 层有 / 无的逐像素差（应为 0）──');
    const shoot = async (q) => {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=wake&freeze=1&${q}`, null, 700);
      const b = await p.screenshot({ encoding: 'base64' });
      const out = { b, p };
      return out;
    };
    const cases = [
      ['四道谱带：本层有（fld=off，只留谱带） vs 整层关（bg=off）', 'fld=off&eeg=off', 'bg=off&eeg=off'],
      ['三道残影：本层有 vs ?echo=off（路径仍在 markup，只是不写 d）', '', 'echo=off'],
      ['两件一起：fld=off 有谱带 vs fld=off&stave=off&echo=off', 'fld=off', 'fld=off&stave=off&echo=off'],
    ];
    for (const [tag, qa, qb] of cases) {
      const A = await shoot(qa), B = await shoot(qb);
      const st = await pngCompare(A.p, A.b, B.b);
      console.log(`${tag}\n   全幅 ${st.totalPx} px：不同像素 ${st.changedPx}（>8 通道差），最大通道差 ${st.maxCh}，平均通道差 ${st.meanCh}`);
      await A.p.close(); await B.p.close();
    }
  }

  /* ═══════════ 9 · zoom：视口相对的 3× 裁片 + 缝的逐像素剖面 ═══════════ */
  if (MODE === 'zoom' || MODE === 'all') {
    console.log('\n── 9 · 醒态拼接的 3× 裁片 + 缝的像素剖面 ──');
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${face}&mix=${face === 'wake' ? 1 : 0}&plate=off&freeze=1`, null, 600);
      /* 选一个「至少两块、且留缝方向朝右」的构造体，取它右下角做裁片 */
      const spot = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('#fld-field .fld-pan').forEach((pan, bi) => {
          pan.querySelectorAll('.fld-cell:first-child .fld-cl').forEach((cl) => {
            const sq = cl.querySelectorAll('.fld-sq');
            if (sq.length < 2) return;
            const r = cl.getBoundingClientRect();
            if (r.left < 200 || r.left > 900 || r.top < 150 || r.top > 600) return;
            const d = Math.hypot(r.left - innerWidth / 2, r.top - innerHeight / 2);
            if (!best || d < best.d) best = { d, x: +r.left.toFixed(1), y: +r.top.toFixed(1), bi, n: sq.length, c: cl.dataset.c };
          });
        });
        return best;
      });
      if (!spot) { console.log(`${face}: 没找到合适的裁片目标`); await p.close(); continue; }
      console.log(`${face}: 裁片目标 簇 ${spot.c}（档 ${spot.bi + 1}，${spot.n} 块）@ ${spot.x},${spot.y}`);
      const pz = await mk(1440, 900);
      await pz.setViewport({ width: 1440, height: 900, deviceScaleFactor: 3 });
      await goto(pz, `zone=deep&face=${face}&mix=${face === 'wake' ? 1 : 0}&plate=off&freeze=1`, null, 600);
      await pz.screenshot({ path: path.join(OUT, `zoom3x-${face}.png`), clip: { x: Math.max(0, spot.x - 10), y: Math.max(0, spot.y - 10), width: 300, height: 220 } });
      await pz.close();
      /* 缝的逐像素剖面：1× 全幅 → 找一对醒态左右相邻的板片 → 横切一行打印 RGB */
      const shot = await p.screenshot({ encoding: 'base64' });
      const prof = await p.evaluate(async (b64) => {
        const seam = (() => {
          let best = null;
          document.querySelectorAll('#fld-field .fld-cell:first-child .fld-cl').forEach((cl) => {
            const [X, Y] = cl.dataset.c.split(',').map(Number);
            const rs = [...cl.querySelectorAll('.fld-sq')].map((sq) => {
              const [tx, ty, s] = sq.dataset.b.split(',').map(Number);
              return { x: X + tx, y: Y + ty, w: s, h: s };
            });
            for (const a of rs) for (const b of rs) {
              if (a === b) continue;
              const gap = b.x - (a.x + a.w);
              const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
              if (gap >= 1 && gap <= 2 && yOv >= 14) {
                const sx = Math.round(a.x + a.w + gap / 2 + innerWidth / 2);
                const sy = Math.round((Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 + innerHeight / 2);
                if (sx < 120 || sx > innerWidth - 120 || sy < 120 || sy > innerHeight - 120) continue;
                best = { x: sx, y: sy, gap };
              }
            }
          });
          return best;
        })();
        if (!seam) return null;
        const im = new Image();
        im.src = 'data:image/png;base64,' + b64;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(im, 0, 0);
        const rows = [];
        for (const dy of [0, 1]) {
          const y = Math.min(c.height - 1, Math.max(0, seam.y + dy));
          const d = cx.getImageData(Math.max(0, seam.x - 6), y, 14, 1).data;
          const px = [];
          for (let i = 0; i < 14; i++) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].join(','));
          rows.push({ y, px });
        }
        return { seam, rows };
      }, shot);
      if (prof) {
        console.log(`  缝在 (${prof.seam.x}, ${prof.seam.y})，缝宽 ${prof.seam.gap}px；横切一行 14 个像素（左 → 右）：`);
        for (const r of prof.rows) console.log(`   y=${r.y}  ` + r.px.join(' | '));
      } else console.log('  没找到左右相邻的一对（本帧）');
      await p.close();
    }
  }

  await browser.close();
  server.close();
  console.log('\nerrors:', errors.length ? errors : 'none');
  console.log('out: design/mocks/.shots-p17-extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
