/* ─────────────────────────────────────────────────────────────
   P18 · 构造场（三态运动）× 1Hz 脑电 · 额外观测（静态图证不了的那些）

   用法：node design/mocks/.p18-extra.cjs [smoke|assert|measure|motion|eeg|wakeclean|perf|shots|pixdir|seam|all]

   1 · smoke      开一页，抓 console/pageerror，打印 window.__p18 全部读数
   2 · assert     从 DOM 独立复核生成期断言（不采信 window.__p18 的自报）：
                  ① 醒态任意两块零重叠 ② 相邻平行边间隙 ∈[1,2]px 的分布
                  ③ 跨副本（−DX,−DY）零重叠；并核对醒态 computed transform
                  是否真的落在 tiled 几何上；另报板片边长分布（p17 / p18 同口径对照）
   3 · measure    版心（42rem 列）内背景最亮处 / 相邻墨色亮度差（三 zone × 醒梦），
                  红线 35%、本轮目标 ≤30%
   4 · motion    ★ 本轮四条验收里的前三条：
                  A 梦态原地浮动（0s/3s/6s 位置：只有 ±1–3px 抖动、不累积）
                    ＋ 醒态对照（每 3s 累积 ~70–110px）
                  B 切换位移：入梦 (−252,−63) / 回醒 (+252,+63)；
                    再「醒态先漂 20s 再按」复测，两次读数应相同
                  C 回醒后漂移继续且**位置连续**：闩锁前后逐帧采样，无跳变
   5 · eeg       ★ 第四条：梦态主波 d 每 100ms 读一次、报「变化的时刻」；
                  醒态同法对照（逐帧都在变）；谱带/残影的动画相位在采样拍上的对齐；
                  三道残影的「延迟＝相位差」在 1Hz 下的复核
   6 · wakeclean 醒态（?zone=deep&face=wake）本层有 / 无应当逐像素一致
   7 · perf      醒态 animation 清单 + 新增 rAF / 监听计数 + 有层/无层帧数 + eeg bench
   8 · shots     两张合成图（?mix=1 vs ?mix=0）供人眼比对「梦态没有整体朝右下移」
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p18-constructs-and-echo';
const OUT = path.join(__dirname, '.shots-p18-extra');
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
      res.push({ dx, dy, mad: +(sum / n).toFixed(3), chPct: +(100 * ch / n).toFixed(3), ch });
    }
    res.sort((p, q) => p.chPct - q.chPct);
    const zero = res.find((r) => r.dx === 0 && r.dy === 0) || null;
    return { best: res.slice(0, 3), zero };
  }, aB64, bB64, cand);
}

/* ── 页面里用的探针：锁定「同一个构造体 + 其中一块方块」+ 逐帧记录 ──
   选法：把三档 .fld-pan 的第一份副本里的构造体摊平，各档取「最靠视口中心」的那一个
   （锁的是 DOM 下标，不是「当前最靠某处的那个」——否则漂着漂着会换人）。
   读两个位置：
     · .fld-cl 的锚点 = **场**的位置（漂移 + 回溯 + 阶跃；不含块自身的「松弛」）
       —— 切换位移的验收口径与 p17 一致，就是量这个；
     · .fld-sq 的中心 = 观感位置（额外含 local = (tiled−loose)×--fld-tk 的松弛位移）。 */
const PICK_SQ = `(() => {
  const out = [];
  document.querySelectorAll('#fld-field .fld-pan').forEach((pan) => {
    const cls = [...pan.querySelectorAll('.fld-cell:first-child .fld-cl')];
    let best = -1, bd = 1e9;
    cls.forEach((cl, i) => {
      const r = cl.getBoundingClientRect();
      const d = Math.hypot(r.left - innerWidth * 0.5, r.top - innerHeight * 0.5);
      if (d < bd) { bd = d; best = i; }
    });
    out.push(best);
  });
  return out;
})()`;
/* 读取：三档锁定构造体的锚点 + 方块中心 + 各层 transform（用于分解位移） */
const READ_SQ = `(idx) => {
  const tf = (node) => { const m = getComputedStyle(node).transform.match(/matrix\\(([^)]+)\\)/); const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]; return { x: +(+v[4]).toFixed(3), y: +(+v[5]).toFixed(3) }; };
  const rows = [];
  document.querySelectorAll('#fld-field .fld-pan').forEach((pan, b) => {
    const cl = pan.querySelectorAll('.fld-cell:first-child .fld-cl')[idx[b]];
    if (!cl) return rows.push(null);
    const sq = cl.querySelector('.fld-sq');
    const rc = cl.getBoundingClientRect(), rs = sq.getBoundingClientRect();
    rows.push({
      cx: +rc.left.toFixed(3), cy: +rc.top.toFixed(3),
      x: +(rs.left + rs.width / 2).toFixed(3), y: +(rs.top + rs.height / 2).toFixed(3),
      w: +rs.width.toFixed(2), side: +sq.dataset.b.split(',')[2], c: cl.dataset.c,
      local: tf(sq), pan: tf(pan), step: tf(pan.querySelector('.fld-step')),
      rw: tf(document.querySelector('.fld-rewind')),
      playState: getComputedStyle(pan).animationPlayState,
    });
  });
  return rows;
}`;

(async () => {
  const server = await serve();
  const BASE = `http://127.0.0.1:${server.address().port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p18-probe')}`],
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
    /* 连跑十来个机位时偶发 "Navigating frame was detached"（CDP 抖动）：重试两次 */
    for (let attempt = 0; ; attempt++) {
      try {
        await p.goto(`${BASE}?ui=0&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
        await sleep(500);
      }
    }
    await p.evaluate(() => document.fonts.ready);
    await sleep(wait);
    if (at) {
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, at);
      await sleep(700);
    }
  };
  const hideStatic = (p) => p.evaluate(() => {
    let s = document.getElementById('p18-hide');
    if (!s) { s = document.createElement('style'); s.id = 'p18-hide'; s.textContent = '.page,.seam,.grain,.dbg,#p15-eeg,.echo-stave{display:none !important}'; document.head.appendChild(s); }
  });

  /* ═══════════ 1 · smoke ═══════════ */
  if (MODE === 'smoke' || MODE === 'all') {
    const p = await mk(1440, 900);
    await goto(p, 'zone=deep&face=wake', null, 900);
    const r = await p.evaluate(() => window.__p18);
    console.log('__p18 =', JSON.stringify(r, null, 1).slice(0, 3000));
    console.log('骨骼：', JSON.stringify(await p.evaluate(() => ({
      pans: document.querySelectorAll('#fld-field .fld-pan').length,
      cells: document.querySelectorAll('#fld-field .fld-cell').length,
      steps: document.querySelectorAll('#fld-field .fld-step').length,
      quant: document.querySelectorAll('#fld-field .fld-quant').length,
      cl: document.querySelectorAll('#fld-field .fld-cl').length,
      sq: document.querySelectorAll('#fld-field .fld-sq').length,
      cut: document.querySelectorAll('#fld-field .fld-cut').length,
      esb: document.querySelectorAll('.echo-stave .esb').length,
      echo: document.querySelectorAll('#p15-eeg .eeg-echo-1, #p15-eeg .eeg-echo-2, #p15-eeg .eeg-echo-3').length,
      rewindTf: getComputedStyle(document.querySelector('.fld-rewind')).transform,
      sdur: [...document.querySelectorAll('#fld-field .fld-pan')].map((x) => getComputedStyle(x.querySelector('.fld-step')).animationDuration + '/' + getComputedStyle(x.querySelector('.fld-step')).animationDelay),
    }))));
    console.log('errors:', errors.length ? errors : 'none');
    await p.close();
  }

  /* ═══════════ 2 · assert：从 DOM 独立复核几何 ═══════════ */
  if (MODE === 'assert' || MODE === 'all') {
    console.log('\n── 2 · 生成期断言的 DOM 独立复核 + 边长（Part D 的尺寸证据）──');
    const sidesOf = async (file) => {
      const p = await mk(1440, 900);
      await p.goto(`http://127.0.0.1:${server.address().port}/design/mocks/${file}.html?ui=0&zone=deep&face=wake&freeze=1`, { waitUntil: 'networkidle0', timeout: 60000 });
      await p.evaluate(() => document.fonts.ready);
      await sleep(600);
      const v = await p.evaluate(() => {
        const bands = [];
        document.querySelectorAll('#fld-field .fld-pan').forEach((pan) => {
          const rows = [...pan.querySelectorAll('.fld-cell:first-child .fld-sq')].map((sq) => +sq.dataset.b.split(',')[2]);
          rows.sort((a, b) => a - b);
          bands.push({
            n: rows.length, min: rows[0], max: rows[rows.length - 1],
            mean: +(rows.reduce((a, b) => a + b, 0) / rows.length).toFixed(1), median: rows[Math.floor(rows.length / 2)],
          });
        });
        const all = bands.flatMap((b) => [b.min, b.max]);
        return { bands, sq: document.querySelectorAll('#fld-field .fld-sq').length, span: [Math.min(...all), Math.max(...all)] };
      });
      await p.close();
      return v;
    };
    const s17 = await sidesOf('p17-constructs-and-echo');
    const s18 = await sidesOf('p18-constructs-and-echo');
    const fmt = (v) => v.bands.map((b, i) => `档${i + 1} n=${b.n} 边长 ${b.min}–${b.max}（均 ${b.mean} / 中位 ${b.median}）`).join('；');
    console.log('p17 方块边长：' + fmt(s17) + ` ⇒ 总 ${s17.sq} 块`);
    console.log('p18 方块边长：' + fmt(s18) + ` ⇒ 总 ${s18.sq} 块`);
    s18.bands.forEach((b, i) => {
      const a = s17.bands[i];
      console.log(`   档${i + 1} 均值 ${a.mean} → ${b.mean}（${(100 * (b.mean / a.mean - 1)).toFixed(1)}%）、中位 ${a.median} → ${b.median}（${(100 * (b.median / a.median - 1)).toFixed(1)}%）、最大 ${a.max} → ${b.max}（${(100 * (b.max / a.max - 1)).toFixed(1)}%）`);
    });

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
      const tfOk = dom.tf.filter((x) => Math.abs(x.tx - x.dx) < 0.05 && Math.abs(x.ty - x.dy) < 0.05).length;
      const tfIdent = dom.tf.filter((x) => x.tx === 0 && x.ty === 0).length;
      console.log(`${face}  方块 ${n}  DOM 重算：① 零重叠差对 ${ov} 对（最差 ${worstOv}px²） ③ 跨副本 ${copyOv} 对`
        + ` ② 平行边距 ≤3px 的边对 ${pairs}，min ${mn} / max ${mx}，分布 ${JSON.stringify(dist)} 落单块 ${n - touched.size}`
        + (face === 'wake'
          ? `；computed transform 恰等于 tiled−loose 的 ${tfOk}/${n}`
          : `；梦面 --fld-tk=0 ⇒ transform 恒等 ${tfIdent}/${n}（应全恒等）`));
      await p.close();
    }
  }

  /* ═══════════ 3 · measure：版心内最亮处 / 相邻墨色差 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    console.log('\n── 3 · 版心（42rem 列）内背景最亮处 ÷ 相邻墨色亮度差（目标 ≤30%，红线 35%）──');
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

  /* ═══════════ 4 · motion：三态运动的四条验收 ═══════════ */
  if (MODE === 'motion' || MODE === 'all') {
    console.log('\n── 4A · 梦态原地浮动 vs 醒态累积（同一个构造体 / 同一块方块，0s / 3s / 6s）──');
    for (const face of ['dream', 'wake']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${face}&plate=off`, null, 600);
      const idx = await p.evaluate(`(${PICK_SQ})`);
      const rd = (k) => p.evaluate(new Function('idx', `return (${READ_SQ})(idx)`), k);
      const rows = [];
      const T0 = Date.now();
      for (const tt of [0, 3000, 6000]) {
        if (tt) await sleep(Math.max(0, tt - (Date.now() - T0)));
        rows.push({ t: Date.now() - T0, v: await rd(idx) });
      }
      for (let b = 0; b < 3; b++) {
        const seq = rows.map((r) => r.v[b]).filter(Boolean);
        const D = (a, c) => ({ x: +(c.cx - a.cx).toFixed(2), y: +(c.cy - a.cy).toFixed(2) });
        const d1 = D(seq[0], seq[1]), d2 = D(seq[1], seq[2]), net = D(seq[0], seq[2]);
        const loc = { x: +(seq[2].local.x - seq[0].local.x).toFixed(2), y: +(seq[2].local.y - seq[0].local.y).toFixed(2) };
        console.log(`  ${face} 档${b + 1} 构造体 ${seq[0].c}（块边长 ${seq[0].side}px，`
          + `${seq[0].playState}/${seq[2].playState}）：
     场锚点 0→3s Δ(${d1.x},${d1.y}) ${Math.hypot(d1.x, d1.y).toFixed(2)}px | 3→6s Δ(${d2.x},${d2.y}) ${Math.hypot(d2.x, d2.y).toFixed(2)}px`
          + ` | **6s 净位移 (${net.x},${net.y}) ${Math.hypot(net.x, net.y).toFixed(2)}px**`
          + `；块自身的松弛位移 (${loc.x},${loc.y})`);
      }
      /* 有界性：10s 内每 250ms 采一次，看位置是不是只在一小组整数像素档位之间跳 */
      const trace = await p.evaluate(new Function('idx', `
        return (async () => {
          const read = (${READ_SQ});
          const out = [];
          const t0 = performance.now();
          while (performance.now() - t0 < 10000) {
            const v = read(idx)[2];
            out.push({ t: +(performance.now() - t0).toFixed(0), x: v.cx, y: v.cy });
            await new Promise((r) => setTimeout(r, 250));
          }
          return out;
        })()`), idx);
      const xs = trace.map((r) => r.x), ys = trace.map((r) => r.y);
      const spanX = +(Math.max(...xs) - Math.min(...xs)).toFixed(2), spanY = +(Math.max(...ys) - Math.min(...ys)).toFixed(2);
      const ux = [...new Set(xs.map((v) => v.toFixed(2)))].length, uy = [...new Set(ys.map((v) => v.toFixed(2)))].length;
      console.log(`  ${face} 档3 · 10s / 每 250ms 采 41 次：x 跨度 ${spanX}px（${ux} 个不同值）、y 跨度 ${spanY}px（${uy} 个不同值）`
        + ` ⇒ ${face === 'dream' ? '位置只在一小组整数像素档位之间跳（有界、不累积）' : '单调累积（漂移）'}`);
      await p.close();
    }

    /* B · 切换位移向量（按下 → 闩锁），两个方向各一次 + 醒态先漂 20s 再按 */
    console.log('\n── 4B · 切换位移：按下 → 闩锁（构造体锚点 = 场的位置；口径同 p17）──');
    const trace = async (pre, from) => {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${from}&plate=off`, null, 600);
      const idx = await p.evaluate(`(${PICK_SQ})`);
      if (pre) { console.log(`   （先漂 ${pre / 1000}s 再按……）`); await sleep(pre); }
      const out = await p.evaluate(`(async () => {
        const read = (${READ_SQ});
        const idx = ${JSON.stringify(idx)};
        const rows = [];
        const mark = (tag) => { const s = window.__p15.state(); rows.push({ tag, t: +performance.now().toFixed(1), st: s.mode, y: s.face, v: read(idx) }); };
        mark('pre');
        window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55);
        mark('press');
        let sawFreeze = false;
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            const s = window.__p15.state();
            if (s.mode === 'freeze') sawFreeze = true;
            rows.push({ tag: 't', t: +performance.now().toFixed(1), st: s.mode, y: s.face, v: read(idx) });
            if ((sawFreeze && s.mode === 'idle') || performance.now() - t0 > 7000) return res();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await new Promise((r) => setTimeout(r, 250));
        mark('settled');
        return rows;
      })()`);
      const rows = out;
      const press = rows.find((r) => r.tag === 'press');
      const freeze = rows.filter((r) => r.tag === 't' && r.st === 'freeze');
      const settled = rows.find((r) => r.tag === 'settled');
      const mid = freeze.length ? freeze[0] : rows.find((r) => r.tag === 't');
      const vec = (a, b) => ({ x: +(b.v[0].cx - a.v[0].cx).toFixed(2), y: +(b.v[0].cy - a.v[0].cy).toFixed(2) });
      const vecSq = (a, b) => ({ x: +(b.v[0].x - a.v[0].x).toFixed(2), y: +(b.v[0].y - a.v[0].y).toFixed(2) });
      const V = vec(press, mid), Vs = vecSq(press, mid);
      const V250 = vec(mid, settled);
      console.log(`  ${from}→${from === 'wake' ? 'dream（入梦）' : 'wake（回醒）'}${pre ? '（醒态先漂 20s）' : ''}：`
        + `按下(${press.t}ms) → 闩锁(${mid.t}ms，${(mid.t - press.t).toFixed(0)}ms)`
        + ` 构造体位移 = (${V.x}, ${V.y}) |Δ| = ${Math.hypot(V.x, V.y).toFixed(1)}px 方向 ${(Math.atan2(V.y, V.x) * 180 / Math.PI).toFixed(1)}°`);
      console.log(`     同一块的观感位移 = (${Vs.x}, ${Vs.y})；其中块自身的松弛（tiled↔loose）( ${(mid.v[0].local.x - press.v[0].local.x).toFixed(2)}, ${(mid.v[0].local.y - press.v[0].local.y).toFixed(2)} )`
        + ` ⇒ 观感位移 − 松弛 = (${(Vs.x - (mid.v[0].local.x - press.v[0].local.x)).toFixed(2)}, ${(Vs.y - (mid.v[0].local.y - press.v[0].local.y)).toFixed(2)})`);
      console.log(`     .fld-rewind 位移 (${(mid.v[0].rw.x - press.v[0].rw.x).toFixed(2)}, ${(mid.v[0].rw.y - press.v[0].rw.y).toFixed(2)})`
        + `；pan 位移 (${(mid.v[0].pan.x - press.v[0].pan.x).toFixed(2)}, ${(mid.v[0].pan.y - press.v[0].pan.y).toFixed(2)})`
        + `；step 位移 (${(mid.v[0].step.x - press.v[0].step.x).toFixed(2)}, ${(mid.v[0].step.y - press.v[0].step.y).toFixed(2)})`
        + `；pan 播放态 ${press.v[0].playState} → ${mid.v[0].playState}`
        + `；闩锁后 250ms 再读 (${V250.x}, ${V250.y})`);
      await p.close();
      return { V, Vs, rows, idx };
    };
    const A = await trace(0, 'wake');
    const A20 = await trace(20000, 'wake');
    const B = await trace(0, 'dream');
    console.log(`  对照：入梦两次读数 (${A.V.x},${A.V.y}) ↔ (${A20.V.x},${A20.V.y})；`
      + `逐分量最大差 (${Math.abs(A.V.x - A20.V.x).toFixed(2)}, ${Math.abs(A.V.y - A20.V.y).toFixed(2)})`
      + ` ⇒ 漂移 20s 后按，回溯距离不变`);

    /* C · 回醒后漂移继续且位置连续：闩锁前后逐帧 */
    console.log('\n── 4C · 回醒：漂移从暂停处继续，位置连续（逐帧）──');
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream&plate=off', null, 600);
      const idx = await p.evaluate(`(${PICK_SQ})`);
      const out = await p.evaluate(`(async () => {
        const read = (${READ_SQ});
        const idx = ${JSON.stringify(idx)};
        window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55);
        /* 梦 → 醒：T_GO = 2200ms 才闩锁 ⇒ 提前 1.8s 起采，正好夹住「按住中(梦) →
           闩锁(mode=freeze) → settle 完(idle) → 漂移恢复」这一段 */
        await new Promise((r) => setTimeout(r, 1800));
        const rows = [];
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            const s = window.__p15.state();
            rows.push({ t: +(performance.now() - t0).toFixed(1), mode: s.mode, face: s.face, y: read(idx)[0] });
            if (performance.now() - t0 > 2200) return res();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return rows;
      })()`);
      const deltas = [];
      for (let i = 1; i < out.length; i++) {
        const a = out[i - 1], b = out[i];
        deltas.push({
          i, dt: +(b.t - a.t).toFixed(1),
          d: +Math.hypot(b.y.cx - a.y.cx, b.y.cy - a.y.cy).toFixed(3),
          pan: +Math.hypot(b.y.pan.x - a.y.pan.x, b.y.pan.y - a.y.pan.y).toFixed(3),
          step: +Math.hypot(b.y.step.x - a.y.step.x, b.y.step.y - a.y.step.y).toFixed(3),
          rw: +Math.hypot(b.y.rw.x - a.y.rw.x, b.y.rw.y - a.y.rw.y).toFixed(3),
          mode: b.mode, face: b.face, play: b.y.playState,
        });
      }
      const k = out.findIndex((r) => r.mode === 'freeze');   // 闩锁那帧（data-reality 翻面、漂移从这里恢复）
      console.log(`   闩锁（mode 由 hold/retract 变 freeze）落在第 ${k} 帧（t=${k >= 0 ? out[k].t : '-'}ms）；`
        + `第 ${out.findIndex((r) => r.mode === 'idle')} 帧起 settle 结束。前后各 3 帧：`);
      for (let i = Math.max(1, k - 3); i < Math.min(out.length, k + 4); i++) {
        const r = out[i], d = deltas[i - 1];
        console.log(`     #${i} t=${r.t}ms ${r.mode}/${r.face} pan=${r.y.playState}`
          + ` 帧间：场 ${d.d}px（pan ${d.pan} / step ${d.step} / rw ${d.rw}）dt ${d.dt}ms`
          + ` ⇒ ${d.pan > 0.05 ? (d.pan * 1000 / d.dt).toFixed(1) + 'px/s（漂移在走）' : 'pan 位移 0（梦面暂停）'}`);
      }
      const before = deltas.filter((d) => d.i < k), after = deltas.filter((d) => d.i > k);
      console.log('   闩锁**前**（按住中的梦面）逐帧 pan 位移：' + before.slice(-8).map((d) => d.pan).join(' / ') + 'px'
        + '；同段 step（阶跃）位移：' + before.slice(-8).map((d) => d.step).join(' / ') + 'px');
      console.log('   闩锁**后**逐帧 pan 位移：' + after.slice(0, 8).map((d) => d.pan).join(' / ') + 'px'
        + `（每帧 ≈ 23–36px/s × 帧长 ≈ 0.4–1.2px，无跳变；恒为 0 说明漂移没恢复）`);
      await p.close();
    }
  }

  /* ═══════════ 5 · eeg：1Hz 抽帧 + 谱带对齐 + 残影延迟复核 ═══════════ */
  if (MODE === 'eeg' || MODE === 'all') {
    console.log('\n── 5 · 脑电 1 秒抽帧（梦态）──');
    for (const face of ['dream', 'wake']) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=${face}&plate=off`, null, 700);
      /* rAF 级：逐帧记录 d 与时刻 ⇒ 精确的「变化时刻」 */
      const raf = await p.evaluate(async () => {
        const el = document.querySelector('.eeg-main');
        const rows = [];
        const t0 = performance.now();
        let last = null, changes = 0;
        await new Promise((res) => {
          const tick = () => {
            const d = el.getAttribute('d');
            const t = performance.now() - t0;
            if (d !== last) { changes++; if (changes <= 8) rows.push(+t.toFixed(1)); last = d; }
            if (t < 3200) requestAnimationFrame(tick); else res();
          };
          requestAnimationFrame(tick);
        });
        return { changes, first: rows };
      });
      console.log(`  rAF 级（3.2s）：${face} 的 d 变化 ${raf.changes} 次 ⇒ 平均每 ${(3.2 / raf.changes * 1000).toFixed(0)}ms 变一次`
        + `；前几次变化的时刻 ${JSON.stringify(raf.first)}ms`);
      /* 100ms 轮询：按规格书的口径 */
      const poll = await p.evaluate(async () => {
        const el = document.querySelector('.eeg-main');
        const rows = [];
        const t0 = performance.now();
        let last = null;
        await new Promise((res) => {
          const step = () => {
            const t = performance.now() - t0;
            const d = el.getAttribute('d');
            rows.push({ t: +t.toFixed(0), changed: d !== last, len: d ? d.length : 0 });
            last = d;
            if (t < 3000) setTimeout(step, 100); else res();
          };
          step();
        });
        return rows;
      });
      const chg = poll.filter((r) => r.changed).map((r) => r.t);
      console.log(`  100ms 轮询（3s，${poll.length} 次）：d 变化的时刻 = [${chg.join(', ')}]ms`
        + `（梦态应落在 1000/2000/3000 整秒附近；醒态应几乎每次都在变）`);
      console.log(`   路径长度 ${poll[poll.length - 1].len} 字符`);
      await p.close();
    }
    /* 谱带 / 残影的动画在采样拍上的对齐（梦态） */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream&plate=off', null, 900);
      const rows = await p.evaluate(async () => {
        const el = document.querySelector('.eeg-main');
        const targets = [
          ...[...document.querySelectorAll('.esb b')].map((x, i) => ['esb' + (i + 1), x]),
          ...[...document.querySelectorAll('#p15-eeg .eeg-echo-1, #p15-eeg .eeg-echo-2, #p15-eeg .eeg-echo-3')].map((x, i) => ['echo' + (i + 1), x]),
        ];
        const cyc = (node) => {
          const an = node.getAnimations()[0];
          if (!an) return null;
          const tm = an.effect.getTiming();
          const ph = ((an.currentTime - tm.delay) % tm.duration + tm.duration) % tm.duration;
          return { dur: tm.duration, delay: tm.delay, phase: +ph.toFixed(1), mod1s: +(ph % 1000).toFixed(1), start: an.startTime !== null ? +an.startTime.toFixed(1) : null };
        };
        const out = [];
        let last = null;
        await new Promise((res) => {
          const t0 = performance.now();
          const tick = () => {
            const d = el.getAttribute('d');
            if (d !== last && last !== null) {
              out.push({ t: +(performance.now() - t0).toFixed(1), g: targets.map(([n, x]) => [n, cyc(x)]) });
              last = d;
              if (out.length >= 3) return res();
            }
            last = d;
            if (performance.now() - t0 > 6000) return res();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return out;
      });
      rows.forEach((r, i) => {
        const c = r.g[0][1];
        console.log(`  第 ${i + 1} 次采样跳变（t=${r.t}ms）：周期 ${c.dur}ms / delay ${c.delay}ms / 动画 startTime ${c.start}ms`
          + ` ⇒ 各元素相位 mod 1000ms = ` + r.g.map(([n, x]) => `${n}:${x.mod1s}`).join(' '));
      });
      await p.close();
    }
    /* 残影延迟复核：1Hz 采样下，残影是「同一采样的相位差副本」还是「滞后一整拍」？
       —— 主波这一拍采的是整数相位 k；若延迟是**相位差**，残影这一帧应当等于
       voice(k, 1, i)（延迟藏在算式里）；若是**时间延迟**（保持一整拍），
       它就该等于 voice(k−1, 1, i)。逐拍比对，报哪一种命中。 */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=dream&mix=0&plate=off', null, 900);
      const r = await p.evaluate(async () => {
        const api = window.__p18.eeg;
        const out = [];
        let seen = null;
        const t0 = performance.now();
        await new Promise((res) => {
          const tick = () => {
            const k = api.state().phUsed;
            if (Number.isInteger(k) && k !== seen) {
              seen = k;
              out.push({
                k,
                hit: [0, 1, 2].map((i) => {
                  const dom = document.querySelector('.eeg-echo-' + (i + 1)).getAttribute('d');
                  return { same: dom === api.voice(k, 1, i), prevStep: dom === api.voice(k - 1, 1, i) };
                }),
              });
              if (out.length >= 3) return res();
            }
            if (performance.now() - t0 > 6000) return res();
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return out;
      });
      console.log('  三条残影的延迟性质（梦态、1Hz）：');
      r.forEach((row) => console.log(`     采到相位 k=${row.k}：`
        + row.hit.map((h, i) => `残影${i + 1} ${h.same ? '= voice(k)' : h.prevStep ? '= voice(k−1)（滞后一整拍）' : '两者都不是'}`).join('；')));
      await p.close();
    }
  }

  /* ═══════════ 6 · wakeclean：醒态本层「什么都没多」 ═══════════ */
  if (MODE === 'wakeclean' || MODE === 'all') {
    console.log('\n── 6 · 醒态（zone=deep&face=wake）本层有 / 无的逐像素差（应为 0）──');
    const shoot = async (q) => {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&face=wake&freeze=1&${q}`, null, 700);
      const b = await p.screenshot({ encoding: 'base64' });
      return { b, p };
    };
    const cases = [
      ['醒态构造场的可见度（默认 vs ?bg=off&eeg=off）——本条**本该不同**：醒态「看得见但绝对静止」', '', 'bg=off&eeg=off'],
      ['四道谱带：fld=off&eeg=off（只留谱带） vs ?bg=off&eeg=off（应为 0）', 'fld=off&eeg=off', 'bg=off&eeg=off'],
      ['三道残影：默认 vs ?echo=off（应为 0）', '', 'echo=off'],
      ['两件一起：fld=off vs fld=off&stave=off&echo=off（应为 0）', 'fld=off', 'fld=off&stave=off&echo=off'],
    ];
    for (const [tag, qa, qb] of cases) {
      const A = await shoot(qa), B = await shoot(qb);
      const st = await pngCompare(A.p, A.b, B.b);
      console.log(`${tag}\n   全幅 ${st.totalPx} px：不同像素 ${st.changedPx}（>8 通道差），最大通道差 ${st.maxCh}，平均通道差 ${st.meanCh}`);
      await A.p.close(); await B.p.close();
    }
  }

  /* ═══════════ 7 · perf ═══════════ */
  if (MODE === 'perf' || MODE === 'all') {
    console.log('\n── 7 · animation 清单 / rAF / 监听 / 有层无层帧数 / eeg bench ──');
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
              delay: an.effect.getTiming().delay, state: an.playState,
              tf: m ? m[1] : cs.transform,
            });
          }
        });
        return { rows, raf: window.__raf, lis: window.__lis, bench: window.__p18.eeg.bench(120, 1) };
      });
      const byName = {};
      for (const x of r.rows) byName[x.name] = (byName[x.name] || 0) + 1;
      console.log(`${face}: 本层动画 ${r.rows.length} 条 = ${JSON.stringify(byName)}；3.2s 内 rAF ${r.raf}、addEventListener ${r.lis}`);
      const ident = r.rows.filter((x) => /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(x.tf)).length;
      console.log(`   恒等（醒态无位移）${ident} 条；带位移的：${r.rows.filter((x) => !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(x.tf)).map((x) => x.name + '(' + x.tf + ')').join(' , ') || '无'}`);
      const paused = r.rows.filter((x) => x.state === 'paused');
      console.log(`   playState 为 paused 的：${paused.length ? paused.map((x) => x.name).join(', ') : '无'}`);
      console.log(`   eeg bench（120 次全路径重绘，梦态）= ${r.bench}ms/次`);
      if (face === 'wake') {
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

  /* ═══════════ 8 · shots：构图位移方向的两张对照图 ═══════════ */
  if (MODE === 'shots' || MODE === 'all') {
    console.log('\n── 8 · 构图对照（供人眼：梦态没有整体朝右下移）──');
    for (const [n, q] of [['mix1-wake', 'mix=1'], ['mix0-dream', 'mix=0']]) {
      const p = await mk(1440, 900);
      await goto(p, `zone=deep&plate=off&freeze=1&${q}`, null, 800);
      await hideStatic(p);
      await p.screenshot({ path: path.join(OUT, `compose-${n}.png`) });
      await p.close();
    }
    /* 同一机位、醒态漂 20s 前后各一张（看漂移方向：朝右下） */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=wake&plate=off', null, 400);
      await hideStatic(p);
      await p.screenshot({ path: path.join(OUT, 'drift-t0.png') });
      await sleep(20000);
      await p.screenshot({ path: path.join(OUT, 'drift-t20.png') });
      await p.close();
    }
    console.log('   已写 .shots-p18-extra/compose-mix1-wake.png / compose-mix0-dream.png / drift-t0.png / drift-t20.png');
  }

  /* ═══════════ 9 · pixdir：构图位移方向的**逐像素**判定 ═══════════ */
  if (MODE === 'pixdir' || MODE === 'all') {
    console.log('\n── 9 · 位移方向的逐像素判定（整像素最佳位移）──');
    /* A · 梦态：同一梦面姿态、只把 --rw-k 从 0 拨到 1 ⇒ 最佳位移应当精确 = 回溯向量 */
    {
      const grab = async (rwK) => {
        const p = await mk(1440, 900);
        await goto(p, 'zone=deep&mix=0&plate=off&freeze=1', null, 600);
        await hideStatic(p);
        if (rwK === 0) await p.evaluate(() => document.documentElement.style.setProperty('--rw-k', '0'));
        await sleep(150);
        const b = await p.screenshot({ encoding: 'base64' });
        await p.close();
        return b;
      };
      const A = await grab(0), B = await grab(1);
      const cand = [];
      for (let dx = -258; dx <= -246; dx++) for (let dy = -69; dy <= -57; dy++) cand.push([dx, dy]);
      cand.push([0, 0]);
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&mix=0&plate=off&freeze=1', null, 400);
      const bs = await bestShift(p, A, B, cand);
      console.log('  A · 梦面同一姿态、只差回溯（--rw-k 0 vs 1）：最佳整像素位移 = ('
        + bs.best[0].dx + ', ' + bs.best[0].dy + ')，变化像素 ' + bs.best[0].chPct + '%'
        + '（对照不平移 (0,0) ' + (bs.zero ? bs.zero.chPct : '-') + '%）'
        + ' ⇒ 梦态整片场相对「未回溯」是朝**左上**（= 14° 反方向）' + (bs.best[0].dy < 0 ? '' : '（异常：不是左上！）'));
      await p.close();
    }
    /* B · 醒态：只留最慢的一档，3s 的最佳位移应当朝右下、沿 14° */
    {
      const p = await mk(1440, 900);
      await goto(p, 'zone=deep&face=wake&plate=off', null, 500);
      await hideStatic(p);
      await p.evaluate(() => { const a = document.querySelectorAll('#fld-field .fld-pan'); for (let i = 1; i < a.length; i++) a[i].style.display = 'none'; });
      await sleep(200);
      const sA = await p.screenshot({ encoding: 'base64' });
      await sleep(3000);
      const sB = await p.screenshot({ encoding: 'base64' });
      const cand = [];
      for (let dx = 40; dx <= 90; dx += 2) for (let dy = 6; dy <= 26; dy += 2) cand.push([dx, dy]);
      cand.push([0, 0]);
      const bs = await bestShift(p, sA, sB, cand);
      const bl = Math.hypot(bs.best[0].dx, bs.best[0].dy);
      console.log('  B · 醒态（只留远档 104s ≈ 23px/s）：3s 最佳位移 = (' + bs.best[0].dx + ', ' + bs.best[0].dy + ') = '
        + bl.toFixed(1) + 'px / 3s = ' + (bl / 3).toFixed(1) + 'px/s、方向 '
        + (Math.atan2(bs.best[0].dy, bs.best[0].dx) * 180 / Math.PI).toFixed(1) + '°（变化像素 ' + bs.best[0].chPct
        + '%；对照 (0,0) ' + (bs.zero ? bs.zero.chPct : '-') + '%）⇒ 醒态朝**右下**');
      await p.close();
    }
  }

  /* ═══════════ 10 · seam：醒态拼接缝的 3× 裁片 + 逐像素剖面（Part D 的视觉证据）═══ */
  if (MODE === 'seam' || MODE === 'all') {
    console.log('\n── 10 · 醒态拼接缝：3× 裁片 + 横切一行的逐像素剖面 ──');
    const p = await mk(1440, 900);
    await goto(p, 'zone=deep&face=wake&mix=1&plate=off&freeze=1', null, 700);
    const spot = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('#fld-field .fld-pan').forEach((pan, bi) => {
        pan.querySelectorAll('.fld-cell:first-child .fld-cl').forEach((cl) => {
          const [X, Y] = cl.dataset.c.split(',').map(Number);
          const rs = [...cl.querySelectorAll('.fld-sq')].map((sq) => {
            const [tx, ty, s] = sq.dataset.b.split(',').map(Number);
            return { x: X + tx, y: Y + ty, w: s, h: s };
          });
          for (const a of rs) for (const b of rs) {
            if (a === b) continue;
            const gap = b.x - (a.x + a.w);
            const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (gap >= 1 && gap <= 2 && yOv >= 20) {
              const sx = Math.round(a.x + a.w + gap / 2 + innerWidth / 2);
              const sy = Math.round((Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 + innerHeight / 2);
              if (sx < 150 || sx > innerWidth - 150 || sy < 150 || sy > innerHeight - 150) continue;
              const d = Math.hypot(sx - innerWidth / 2, sy - innerHeight / 2);
              if (!best || d < best.d) best = { d, x: sx, y: sy, gap, bi, side: a.w };
            }
          }
        });
      });
      return best;
    });
    console.log(`  找左右相邻的一对：缝宽 ${spot.gap}px、块边长 ${spot.side}px、缝在 (${spot.x}, ${spot.y})、档 ${spot.bi + 1}`);
    const shot = await p.screenshot({ encoding: 'base64' });
    const prof = await p.evaluate(async (b64, sp) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
      const rows = [];
      for (const dy of [0, 1]) {
        const y = Math.min(c.height - 1, Math.max(0, sp.y + dy));
        const d = cx.getImageData(Math.max(0, sp.x - 7), y, 16, 1).data;
        const px = [];
        for (let i = 0; i < 16; i++) px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].join(','));
        rows.push({ y, px });
      }
      return rows;
    }, shot, spot);
    for (const r of prof) console.log(`   y=${r.y}  ` + r.px.join(' | '));
    const pz = await mk(1440, 900);
    await pz.setViewport({ width: 1440, height: 900, deviceScaleFactor: 3 });
    await goto(pz, 'zone=deep&face=wake&mix=1&plate=off&freeze=1', null, 600);
    await pz.screenshot({ path: path.join(OUT, 'zoom3x-wake-seam.png'), clip: { x: Math.max(0, spot.x - 90), y: Math.max(0, spot.y - 70), width: 180, height: 140 } });
    console.log('   已写 .shots-p18-extra/zoom3x-wake-seam.png（3× 裁片，180×140 视口像素 ⇒ 540×420）');
    await pz.close();
    await p.close();
  }

  await browser.close();
  server.close();
  console.log('\nerrors:', errors.length ? errors : 'none');
  console.log('out: design/mocks/.shots-p18-extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
