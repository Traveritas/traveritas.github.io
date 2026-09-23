/* ─────────────────────────────────────────────────────────────
   P16-B · 边边相重合 ↔ 接缝错开 · 额外观测（静态图证不了的那些）

   用法：node design/mocks/.p16-b-extra.cjs [assert|measure|interact|seam|zoom|perf|all]

   1 · assert   从 DOM 独立复核生成期断言（不采信 window.__p16）：
                醒 ① 任意两块正方形零重叠（精确求交）
                   ② 每块正方形最长共享边 / 自身边长（应 100%）
                并核对「渲染出来的」醒态 transform 是否真的落在整数格点上。
   2 · measure  版心内背景最亮处 / 相邻正文墨色亮度差（三 zone × 醒梦两态），
                同机位 freeze 逐像素 on/off（?bg=off 关掉本层）。
   3 · interact window.__p15.hold()/release()：1300ms→梦、2200ms→醒、中途松手退回；
                逐帧读**接缝宽度**（同构造体里共享过边的那两块板片的实际间隙），
                证明「逐帧裂开 / 逐帧合上」，并取长按中途截图。
   4 · seam     钉住 animation-delay 取 t=0 / t=T−50ms / t=T 三帧逐像素比：
                净位移为 0 的往返在 t=0 与 t=T 必须严格同帧。
   5 · zoom     视口相对的 3× 裁片（醒/梦）+ 单个构造体的紧裁片（共享边对齐证据）。
   6 · perf     8× CPU 降速下「有层 / 无层」帧时间 A/B + 醒态 animation 清单 +
                rAF / 监听增量（与外壳基线相减）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-p16-b-extra');
fs.mkdirSync(OUT, { recursive: true });
const MODE = process.argv[2] || 'all';
const FILE = 'p16-b-tiled';
const SHELL = 'p15-shell';
const DRIFT_DUR = [100, 84, 68];   // 必须与 HTML 里的 BANDS 一致

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
        if (err) return (res.writeHead(404), res.end('not found'));
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
    let maxIn = 0, at = null, maxAll = 0, nIn = 0;
    const x0 = Math.round(r.l), x1 = Math.round(r.r);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(L(A, i) - L(B, i));
        if (d > maxAll) maxAll = d;
        if (x >= x0 && x < x1) {
          nIn++;
          if (d > maxIn) { maxIn = d; at = { x, y, on: rgb(A, i), off: rgb(B, i), L: +L(A, i).toFixed(4), Lb: +L(B, i).toFixed(4) }; }
        }
      }
    }
    return { maxIn, maxAll, at, nIn, w: c.width, h: c.height };
  }, aB64, bB64, box);
}
async function pngCompare(page, aB64, bB64, only) {
  return page.evaluate(async (a, b, box) => {
    const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, maxd = 0, sum = 0, total = 0, worst = null;
    for (let i = 0; i < A.length; i += 4) {
      const x = (i / 4) % c.width, y = ((i / 4) / c.width) | 0;
      if (box && (x < box.l || x >= box.r || y < box.t || y >= box.b)) continue;
      total++;
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d > 0) { n++; sum += d; if (d > maxd) { maxd = d; worst = [x, y]; } }
    }
    return { diffPx: n, totalPx: total, maxd, mean: +(sum / total).toFixed(4), worst };
  }, aB64, bB64, only || null);
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = (f) => `http://127.0.0.1:${port}/design/mocks/${f}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p16-b-extra')}`],
  });
  const errors = [];
  const mk = async (w, h, dsf) => {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dsf || 1 });
    return p;
  };
  const gotoShot = async (p, q, at, wait, freeze, file) => {
    const fz = freeze === false ? '' : 'freeze=1&';
    await p.goto(`${base(file || FILE)}?ui=0&${fz}${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(500);
    if (at) {
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, at);
      await sleep(wait || 500);
    }
  };

  /* ═══════════ 1 · 生成期断言的独立复核（只读 DOM，不采信 window.__p16） ═══════════ */
  if (MODE === 'assert' || MODE === 'all') {
    console.log('\n═══ 生成期断言：window.__p16（自报） ↔ DOM 复核（独立重算） ═══');
    const p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays');
    const r = await p.evaluate(() => {
      const sqs = [];
      for (const cl of document.querySelectorAll('#tl-field .tl-cl')) {
        const [cx, cy] = cl.dataset.c.split(',').map(Number);
        const cs = getComputedStyle(cl);
        const L = parseFloat(cs.left) - innerWidth / 2;   // calc(50% + Xpx) → 解析出的 px
        const T = parseFloat(cs.top) - innerHeight / 2;
        for (const d of cl.querySelectorAll('.tl-sq')) {
          const [tx, ty, m] = d.dataset.b.split(',').map(Number);
          const [lx, ly] = d.dataset.l.split(',').map(Number);
          sqs.push({ cx, cy, ox: L, oy: T, tx, ty, lx, ly, m });
        }
      }
      /* 醒态（tiled）：绝对整数几何 */
      const T = sqs.map((s) => ({ x: s.ox + s.tx, y: s.oy + s.ty, w: s.m, h: s.m }));
      let pairs = 0, worst = 0;
      for (let i = 0; i < T.length; i++) {
        for (let j = i + 1; j < T.length; j++) {
          const a = T[i], b = T[j];
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (w > 0 && h > 0) { pairs++; worst = Math.max(worst, w * h); }
        }
      }
      /* 共享边：每块正方形的最长共享段 / 自身边长 */
      let minPct = 1, under60 = 0, avg = 0;
      for (const a of T) {
        let best = 0;
        for (const b of T) {
          if (a === b) continue;
          let seg = 0;
          if (a.x + a.w === b.x || b.x + b.w === a.x) seg = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          else if (a.y + a.h === b.y || b.y + b.h === a.y) seg = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          if (seg > best) best = seg;
        }
        const pct = best / a.w;
        avg += pct; if (pct < 0.6) under60++; if (pct < minPct) minPct = pct;
      }
      /* 渲染校验：醒态每块板片的 computed transform 必须恰好等于 (tiled − loose)，
         且落点（left + transform）是整数 ⇒ 1px 线落在整数像素上，不会糊 */
      let tfBad = 0, nonInt = 0, tfSample = null;
      for (const cl of document.querySelectorAll('#tl-field .tl-cl')) {
        for (const d of cl.querySelectorAll('.tl-sq')) {
          const [tx, ty] = d.dataset.b.split(',').map(Number);
          const [lx, ly] = d.dataset.l.split(',').map(Number);
          const tf = getComputedStyle(d).transform;
          const mm = tf.match(/matrix\(([^)]+)\)/);
          const v = mm ? mm[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
          const ex = tx - lx, ey = ty - ly;
          if (Math.abs(v[4] - ex) > 0.01 || Math.abs(v[5] - ey) > 0.01) { tfBad++; tfSample = tfSample || { tf, ex, ey }; }
          if (!Number.isInteger(v[4] + lx) || !Number.isInteger(v[5] + ly)) nonInt++;
        }
      }
      const mine = [...document.querySelectorAll('#tl-field *')].length;
      return {
        json: window.__p16, domSquares: sqs.length, domNodes: mine,
        domTiledOverlapPairs: pairs, domTiledWorstOverlapPx: worst,
        domSharedMinPct: +(minPct * 100).toFixed(1), domSharedAvgPct: +(avg / T.length * 100).toFixed(1), domUnder60: under60,
        tfBad, nonInt, tfSample,
      };
    });
    const j = r.json || {};
    console.log(`  window.__p16：构造体 ${j.clusters}｜正方形 ${j.squares}｜交叠窗 ${j.cuts}｜节点 ${j.nodes}｜生成 ${j.ms}ms（种子 ${j.seed}）`);
    console.log(`  生成期断言：醒零重叠 ${j.a_tiledOverlapPairs} 对（最差面积 ${j.a_tiledWorstOverlapPx}px²）｜共享边 min ${j.b_tiledSharedMinPct}% avg ${j.b_tiledSharedAvgPct}%｜<60% 的块 ${j.b_tiledUnder60}`);
    console.log(`  生成期断言：梦叠深 max ${j.c_looseDepthMax}｜整体尺寸 ${j.d_looseSpanMin}–${j.d_looseSpanMax}px｜最小交叠窗边 ${j.e_looseCutMinSide}px`);
    console.log(`  生成期重试：构造体尝试 ${j.f_clusterTries} 次（一次通过 ${j.f_firstTry}）｜落位重试 ${j.g_placeRetry}｜叠深淘汰 ${j.g_depthClip}｜落位失败 ${j.g_failPlace}`);
    console.log(`  DOM 复核（独立重算）：正方形 ${r.domSquares}｜节点 ${r.domNodes}｜醒零重叠 ${r.domTiledOverlapPairs} 对（最差 ${r.domTiledWorstOverlapPx}px²）｜共享边 min ${r.domSharedMinPct}% avg ${r.domSharedAvgPct}%｜<60% ${r.domUnder60}`);
    console.log(`  渲染校验：醒态 transform ≠ (tiled−loose) 的块 ${r.tfBad}${r.tfSample ? ' ' + JSON.stringify(r.tfSample) : ''}｜落点非整数像素 ${r.nonInt}`);
    await p.close();
  }

  /* ═══════════ 2 · 版心亮度实测 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    console.log('\n═══ 版心内背景最亮处 / 相邻正文墨色亮度差（逐像素 on/off，freeze=1） ═══');
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
        await gotoShot(p, `zone=${zone}&face=${face}`, '#ns-essays');
        const box = await p.evaluate(() => { const r = document.querySelector('#ns-essays .container').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        const ink = await p.evaluate(() => {
          const h = document.querySelector('#ns-essays .sec-head h2');
          const para = document.querySelector('#ns-essays .row p');
          return { fg: getComputedStyle(h).color, soft: getComputedStyle(para).color, bodyBg: getComputedStyle(document.body).backgroundColor };
        });
        const on = await p.screenshot({ encoding: 'base64' });
        await p.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'off'; });
        await sleep(200);
        const off = await p.screenshot({ encoding: 'base64' });
        const st = await pngDiff(blank, on, off, box);
        const lum = await lumOf(ink.fg, ink.soft, ink.bodyBg);
        const dFg = Math.abs(lum.lfg - lum.lbg), dSoft = Math.abs(lum.lsoft - lum.lbg);
        console.log(`${zone.padEnd(6)} ${face.padEnd(5)} 本层最大|ΔL|=${st.maxIn.toFixed(4)} (笔画 rgb ${st.at.on} vs 无层 ${st.at.off} @${st.at.x},${st.at.y})  ⇒ 占标题墨色差 ${(100 * st.maxIn / dFg).toFixed(1)}% / 占正文墨色差(--fg-soft) ${(100 * st.maxIn / dSoft).toFixed(1)}%   [全幅 ${(100 * st.maxAll / dSoft).toFixed(1)}%]`);
        await p.close();
      }
    }
    /* 首屏 + 移动端 */
    for (const [tag, w, h, q, at] of [
      ['hero-deep-wake', 1440, 900, 'zone=deep&face=wake', null],
      ['hero-deep-dream-plateoff', 1440, 900, 'zone=deep&face=dream&plate=off', null],
      ['mobile-deep-dream', 390, 844, 'zone=deep&face=dream', '#ns-essays'],
      ['mobile-deep-wake', 390, 844, 'zone=deep&face=wake', '#ns-essays'],
    ]) {
      const p = await mk(w, h); await gotoShot(p, q, at);
      const box = await p.evaluate((sel) => {
        const el = document.querySelector(sel + ' .container') || document.querySelector(sel + ' .hero-ink');
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom };
      }, at || '#ns-hero');
      const ink = await p.evaluate((sel) => {
        const h = document.querySelector(sel + ' .sec-head h2') || document.querySelector(sel + ' .container h2');
        const para = document.querySelector(sel + ' .row p') || document.querySelector(sel + ' .hero-meta .mono');
        return { fg: getComputedStyle(h).color, soft: getComputedStyle(para).color, bodyBg: getComputedStyle(document.body).backgroundColor };
      }, at || '#ns-essays');
      const on = await p.screenshot({ encoding: 'base64' });
      await p.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'off'; });
      await sleep(200);
      const off = await p.screenshot({ encoding: 'base64' });
      const st = await pngDiff(blank, on, off, box);
      const lum = await lumOf(ink.fg, ink.soft, ink.bodyBg);
      const dFg = Math.abs(lum.lfg - lum.lbg), dSoft = Math.abs(lum.lsoft - lum.lbg);
      console.log(`${tag.padEnd(26)} 列宽 ${((box.r - box.l) | 0)}px  最大|ΔL|=${st.maxIn.toFixed(4)} ⇒ 标题墨 ${(100 * st.maxIn / dFg).toFixed(1)}% / 正文墨 ${(100 * st.maxIn / dSoft).toFixed(1)}%  [全幅 ${(100 * st.maxAll / dSoft).toFixed(1)}%]`);
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 3 · 长按交互：接缝逐帧裂开 / 合上 ═══════════ */
  if (MODE === 'interact' || MODE === 'all') {
    console.log('\n═══ 长按 1300ms→梦 / 2200ms→醒 / 中途松手退回（逐帧读「接缝宽度」） ═══');
    /* 找一对「共享过边」的板片：同一构造体里 tiled 相邻、且 loose 距离最大的那对
       （接缝证据最明显）；返回它们的 .tl-sq 序号 + 共享方向 */
    const pickPair = (p) => p.evaluate(() => {
      const cl = document.querySelector('#tl-field .tl-cl');
      const ds = [...cl.querySelectorAll('.tl-sq')].map((d) => {
        const [tx, ty, m] = d.dataset.b.split(',').map(Number);
        return { d, tx, ty, m };
      });
      let best = null;
      for (let i = 0; i < ds.length; i++) {
        for (let j = 0; j < ds.length; j++) {
          if (i === j) continue;
          const a = ds[i], b = ds[j];
          if (a.tx + a.m === b.tx && a.ty === b.ty) { const g = Math.abs(b.tx - a.tx); if (!best || g > 0) best = best || { i, j, axis: 'x' }; }
        }
      }
      return best ? { i: best.i, j: best.j, axis: best.axis } : { i: 0, j: 1, axis: 'x' };
    });
    const mkRead = (pair) => `(() => {
      const cl = document.querySelector('#tl-field .tl-cl');
      const ds = [...cl.querySelectorAll('.tl-sq')];
      const a = ds[${pair.i}].getBoundingClientRect(), b = ds[${pair.j}].getBoundingClientRect();
      const gap = ${pair.axis === 'x' ? '(b.left - a.right)' : '(b.top - a.bottom)'};
      const drift = document.querySelector('.tl-drift');
      const dtf = getComputedStyle(drift).transform.match(/matrix\\(([^)]+)\\)/);
      const dv = dtf ? dtf[1].split(',').map(Number) : [0, 0, 0, 0, 0, 0];
      const cutl = document.querySelector('.tl-cutl');
      const one = getComputedStyle(ds[0]).transform.match(/matrix\\(([^)]+)\\)/);
      const ov = one ? one[1].split(',').map(Number) : [0, 0, 0, 0, 0, 0];
      const cs = window.getComputedStyle(document.documentElement).getPropertyValue('--reality-mix');
      const mm = +cs;
      return {
        mix: +mm.toFixed(3),
        tlK: +(mm * mm * (3 - 2 * mm)).toFixed(4),
        seamGap: +gap.toFixed(1),        // 共享边两侧板片的实际间隙（正值=接缝张开，0=严丝合缝，负=交叠）
        sqTf: [+ov[4].toFixed(1), +ov[5].toFixed(1)],
        driftTf: [+dv[4].toFixed(1), +dv[5].toFixed(1)],
        cutOp: +getComputedStyle(cutl).opacity.slice(0, 5),
        st: window.__p15.state(),
      };
    })()`;

    for (const [tag, from, times, shotAt] of [
      ['A 醒→梦（T_BACK=1300ms）', 'wake', [0, 150, 350, 600, 900, 1150, 1400, 2000], [350, 900]],
      ['B 梦→醒（T_GO=2200ms）', 'dream', [0, 300, 700, 1100, 1500, 1900, 2400], [1100]],
    ]) {
      const p = await mk(1440, 900);
      await gotoShot(p, `zone=deep&face=${from}`, '#ns-essays', 500, false);
      const pair = await pickPair(p);
      console.log(`— ${tag}｜读的一对板片：构造体 #1 内 .tl-sq[${pair.i}]↔[${pair.j}]（${pair.axis} 方向共享过边）—`);
      const read = (q) => p.evaluate(q);
      const R = mkRead(pair);
      let prev = 0;
      for (const t of times) {
        if (t) { await sleep(t - prev); prev = t; }
        if (t === 0) { console.log(`t=0ms    `, JSON.stringify(await read(R))); await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55)); continue; }
        console.log(`t=${String(t).padStart(4)}ms `, JSON.stringify(await read(R)));
        if (shotAt.includes(t)) await p.screenshot({ path: path.join(OUT, `hold-${tag[0]}-${t}ms.png`) });
      }
      await p.evaluate(() => window.__p15.release());
      await sleep(500);
      console.log('松手+500ms', JSON.stringify(await read(R)));
      await p.screenshot({ path: path.join(OUT, `hold-${tag[0]}-released.png`) });
      await p.close();
    }
    /* C · 中途松手退回 */
    {
      const p = await mk(1440, 900);
      await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
      const pair = await pickPair(p);
      const R = mkRead(pair);
      console.log('— C 按住 600ms 后松手（应退回醒面：接缝合上）—');
      await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55));
      await sleep(600);
      console.log('hold 600ms ', JSON.stringify(await p.evaluate(R)));
      await p.screenshot({ path: path.join(OUT, 'hold-C-600ms.png') });
      await p.evaluate(() => window.__p15.release());
      await sleep(130);
      console.log('release+130', JSON.stringify(await p.evaluate(R)));
      await sleep(700);
      console.log('release+830', JSON.stringify(await p.evaluate(R)));
      await p.close();
    }
    /* D · 最坏相位：把漂移钉到往返中点（A 最大）再长按，看归位段 */
    {
      const p = await mk(1440, 900);
      await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
      await p.evaluate((durs) => {
        document.querySelectorAll('.tl-drift').forEach((el, i) => el.style.setProperty('animation-delay', (-durs[i] / 2) + 's', 'important'));
      }, DRIFT_DUR);
      await sleep(300);
      const R = `(() => { const d=document.querySelector('.tl-drift'); const m=getComputedStyle(d).transform.match(/matrix\\(([^)]+)\\)/); const v=m?m[1].split(',').map(Number):[0,0,0,0,0,0]; return { mix:+getComputedStyle(document.documentElement).getPropertyValue('--reality-mix').slice(0,6), driftTf:[+v[4].toFixed(1),+v[5].toFixed(1)] }; })()`;
      console.log('— D 相位钉在往返中点（位移最大的一档 360px）后长按 —');
      console.log('t=0        ', JSON.stringify(await p.evaluate(R)));
      await p.evaluate(() => window.__p15.hold(innerWidth * 0.5, innerHeight * 0.55));
      let prev = 0;
      for (const t of [150, 300, 500, 700, 900, 1100, 1300, 1500]) {
        await sleep(t - prev); prev = t;
        console.log(`t=${String(t).padStart(4)}ms `, JSON.stringify(await p.evaluate(R)));
      }
      await p.close();
    }
    /* E · 精确计时：新开一页，hold() 后每 40ms 轮询 __p15.state()，读到 face 翻转的墙钟毫秒 */
    for (const from of ['wake', 'dream']) {
      const p = await mk(1440, 900);
      await gotoShot(p, `zone=deep&face=${from}`, '#ns-essays', 500, false);
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
      console.log(`— E 精确计时：${from} 面按住 → ${t.to} 面 = ${t.ms}ms（壳里 T_BACK=1300 / T_GO=2200）`);
      await p.close();
    }
  }

  /* ═══════════ 4 · 无缝：往返的首尾严格同帧 ═══════════ */
  if (MODE === 'seam' || MODE === 'all') {
    console.log('\n═══ 无缝：钉住 animation-delay 取 t=0 / t=T−50ms / t=T 三帧（往返方案） ═══');
    const p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays');
    const pin = (frac) => p.evaluate((f, durs) => {
      document.querySelectorAll('.tl-drift').forEach((el, i) => {
        el.style.setProperty('animation-delay', (-durs[i] * f) + 's', 'important');
        el.style.setProperty('animation-play-state', 'paused', 'important');
      });
    }, frac, DRIFT_DUR);
    const shot = async () => { await sleep(160); return p.screenshot({ encoding: 'base64' }); };
    await pin(0); const f0 = await shot();
    await pin(0.999); const f1 = await shot();
    await pin(0.999 - 0.05 / 68); const fNear = await shot();
    await pin(0.5); const fHalf = await shot();
    await pin(0.25); const fQu = await shot();
    await pin(0.75); const fSe = await shot();
    const blank = await mk(1440, 900); await blank.setContent('<title>cmp</title>');
    for (const [tag, a, b] of [
      ['t=0  vs t=T（净位移 0 ⇒ 应严格同帧）', f0, f1],
      ['t=0  vs t=T−50ms（应几乎同帧）', f0, fNear],
      ['t=0  vs t=T/2（位移最大：三档 240/300/360px）', f0, fHalf],
      ['t=0  vs t=T/4', f0, fQu],
      ['t=0  vs t=3T/4', f0, fSe],
    ]) {
      const c = await pngCompare(blank, a, b);
      console.log(`${tag.padEnd(38)} 不同像素 ${String(c.diffPx).padStart(7)}/${c.totalPx} (${(100 * c.diffPx / c.totalPx).toFixed(3)}%)  最大通道差 ${c.maxd}  平均 ${c.mean}`);
    }
    for (const [n, b] of [['drift-t0.png', f0], ['drift-tT.png', f1], ['drift-t50.png', fHalf]]) fs.writeFileSync(path.join(OUT, n), Buffer.from(b, 'base64'));
    await blank.close(); await p.close();
  }

  /* ═══════════ 5 · 3× 裁片（视口相对）+ 单个构造体的紧裁片 ═══════════ */
  if (MODE === 'zoom' || MODE === 'all') {
    console.log('\n═══ 3× 裁片：整幅（视口相对）+ 单个构造体（共享边 / 角点 / 交叠窗证据） ═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>crop</title>');
    const crop = (full, cx, cy, cw, ch) => blank.evaluate(async (src, x, y, w, h) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, full, cx, cy, cw, ch);
    /* 一个「读数友好」的构造体：取视野中央附近的 .tl-cl */
    const pickCl = (p) => p.evaluate(() => {
      let best = null;
      for (const cl of document.querySelectorAll('#tl-field .tl-cl')) {
        const [x, y] = cl.dataset.c.split(',').map(Number);
        const n = cl.querySelectorAll('.tl-sq').length;
        const d = Math.hypot(x, y - 40);
        if (!best || (n >= 4 && d < best.d)) best = { x, y, n, d };
      }
      return { x: innerWidth / 2 + best.x, y: innerHeight / 2 + best.y, n: best.n };
    });
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900, 3);
      await gotoShot(p, `zone=deep&face=${face}`, '#ns-essays');
      const cl = await pickCl(p);
      const full = await p.screenshot({ encoding: 'base64' });
      const cs = await crop(full, 620 * 3, 320 * 3, 660 * 3, 420 * 3);
      fs.writeFileSync(path.join(OUT, `zoom3x-${face}.png`), Buffer.from(cs, 'base64'));
      const c2 = await crop(full, Math.round((cl.x - 190) * 3), Math.round((cl.y - 150) * 3), 420 * 3, 340 * 3);
      fs.writeFileSync(path.join(OUT, `cluster3x-${face}.png`), Buffer.from(c2, 'base64'));
      console.log(`${face}: zoom3x-${face}.png 660×420（视口 (620,320) 起，3×）｜cluster3x-${face}.png 420×340（构造体 ${cl.x | 0},${cl.y | 0}，${cl.n} 块，3×）`);
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 5.2 · 共享边的对齐证据（几何 + 像素剖面） ═══════════
     ① 几何：共享过边的两块板片，边界必须**逐像素重合**（b.left − a.right ≡ 0）；
     ② 像素：3× 采样横切这条缝，给出剖面 —— 「共边＝两枚 1px 边框相邻（6 设备 px 的
        一条重缝）↔ 外轮廓＝1px 单线（3 设备 px）」，这就是醒态的读法。 */
  if (MODE === 'edge' || MODE === 'all') {
    console.log('\n═══ 共享边：醒态的几何重合 + 3× 像素剖面（深底） ═══');
    const p = await mk(1440, 900, 3);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays');
    const info = await p.evaluate(() => {
      const out = { hPair: null, vPair: null, outer: null };
      for (const cl of document.querySelectorAll('#tl-field .tl-cl')) {
        const [cx, cy] = cl.dataset.c.split(',').map(Number);
        const ox = innerWidth / 2 + cx, oy = innerHeight / 2 + cy;
        const rcs = getComputedStyle(cl);
        const lx = parseFloat(rcs.left) - innerWidth / 2, ly = parseFloat(rcs.top) - innerHeight / 2;
        const ds = [...cl.querySelectorAll('.tl-sq')].map((d) => {
          const [tx, ty, m] = d.dataset.b.split(',').map(Number);
          const r = d.getBoundingClientRect();
          return { tx, ty, m, r };
        });
        for (const a of ds) {
          for (const b of ds) {
            if (a === b) continue;
            if (a.tx + a.m === b.tx && a.ty === b.ty && !out.hPair) {
              out.hPair = {
                gapPx: +(b.r.left - a.r.right).toFixed(3), topDelta: +(b.r.top - a.r.top).toFixed(3),
                seamX: (ox + a.tx + a.m), midY: (oy + a.ty + a.m / 2), outerX: ox + a.tx, m: a.m,
                at: [Math.round(ox), Math.round(oy)],
              };
            }
            if (a.ty + a.m === b.ty && a.tx === b.tx && !out.vPair) {
              out.vPair = {
                gapPx: +(b.r.top - a.r.bottom).toFixed(3), leftDelta: +(b.r.left - a.r.left).toFixed(3),
                seamY: (oy + a.ty + a.m), midX: (ox + a.tx + a.m / 2), outerY: oy + a.ty, m: a.m,
              };
            }
          }
        }
        if (out.hPair && out.vPair) break;
      }
      return out;
    });
    console.log(`  横向共享边（并排两块）：b.left − a.right = ${info.hPair.gapPx}px，b.top − a.top = ${info.hPair.topDelta}px，边长 ${info.hPair.m}px`);
    console.log(`  纵向共享边（上下两块）：b.top − a.bottom = ${info.vPair.gapPx}px，b.left − a.left = ${info.vPair.leftDelta}px，边长 ${info.vPair.m}px`);
    const b64 = await p.screenshot({ encoding: 'base64' });
    const prof = await p.evaluate(async (src, hx, hy, ox, sample) => {
      const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      const D = x.getImageData(0, 0, c.width, c.height).data;
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (i) => +((0.2126 * lin(D[i]) + 0.7152 * lin(D[i + 1]) + 0.0722 * lin(D[i + 2])) * 100).toFixed(2);
      const at = (px, py) => L((Math.round(py) * c.width + Math.round(px)) * 4);
      const row = [];
      for (let d = -6; d <= 6; d++) row.push({ px: d, L: at(hx * 3 + d, hy * 3) });
      const outer = [-6, -5, -4, -3, -2, -1, 0, 1, 2].map((d) => ({ px: d, L: at(ox * 3 + d, hy * 3) }));
      return { row, outer, rowY: hy, pageL: at(hx * 3, hy * 3 - 9) };
    }, b64, info.hPair.seamX, info.hPair.midY, info.hPair.outerX);
    console.log(`  3× 剖面（跨共享缝，同一扫描线，设备像素偏移 → 相对亮度%）: ${prof.row.map((r) => `${r.px >= 0 ? '+' : ''}${r.px}:${r.L}`).join(' ')}`);
    console.log(`  3× 剖面（跨外轮廓，同一扫描线 / 同一板片）: ${prof.outer.map((r) => `${r.px >= 0 ? '+' : ''}${r.px}:${r.L}`).join(' ')}`);
    console.log(`  （板片内面 7% 墨 ≈ ${prof.pageL}%；外轮廓 3 设备像素＝1 CSS px，共享缝 6 设备像素＝两枚 1px 相邻）`);
    await p.close();
  }

  /* ═══════════ 5.5 · 提层（will-change）对 1px 线锐度的影响 ═══════════
     .tl-drift 提成合成层后，父级 .tl-field 的**分数**位移（梦态 10px/3px × still）
     会让合成层在分数位置被重采样。mix=0.5 时场位移是 (5, 1.5) —— 最坏情形。
     同一页面上运行时切换 will-change 再逐像素比：差异必须可以忽略。 */
  if (MODE === 'crisp' || MODE === 'all') {
    console.log('\n═══ 提层代价：mix=0.5 下 will-change:transform 有/无 的逐像素对照 ═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>crisp</title>');
    for (const mix of ['0.5', '0.25', '0']) {
      const p = await mk(1440, 900);
      await gotoShot(p, `zone=deep&mix=${mix}`, '#ns-essays');
      const setWC = (v) => p.evaluate((x) => { document.querySelectorAll('.tl-drift').forEach((el) => { el.style.willChange = x; }); }, v);
      await setWC('transform');
      await sleep(250);
      const on = await p.screenshot({ encoding: 'base64' });
      /* 最暗线（版心内本层最深的一笔）也一起读：软掉的话峰值会变浅 */
      const dark = await p.evaluate(() => {
        const r = document.querySelector('#ns-essays .container').getBoundingClientRect();
        const d = document.querySelector('#tl-field .tl-sq');
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, color: getComputedStyle(d).borderTopColor };
      });
      await setWC('auto');
      await sleep(250);
      const off = await p.screenshot({ encoding: 'base64' });
      const c = await pngCompare(blank, on, off, { l: Math.round(dark.l), r: Math.round(dark.r), t: 0, b: 900 });
      console.log(`  mix=${mix}（场位移 ${(10 * (1 - +mix)).toFixed(1)},${(3 * (1 - +mix)).toFixed(1)}px）有层 vs 无层：不同像素 ${c.diffPx}/${c.totalPx} (${(100 * c.diffPx / c.totalPx).toFixed(4)}%) 最大通道差 ${c.maxd} 平均 ${c.mean}`);
      if (mix === '0.5') {
        fs.writeFileSync(path.join(OUT, 'crisp-mix50-willchange.png'), Buffer.from(on, 'base64'));
        fs.writeFileSync(path.join(OUT, 'crisp-mix50-autolayer.png'), Buffer.from(off, 'base64'));
      }
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 6 · 8× 降速「有层 / 无层」帧时间 A/B + 动画清单 ═══════════ */
  if (MODE === 'perf' || MODE === 'all') {
    console.log('\n═══ 8× CPU 降速：有层 / 无层 帧时间 A/B（页内 rAF 4s，每档两趟） ═══');
    const run = async (layerOff, face) => {
      const page = await mk(1440, 900);
      const client = await page.createCDPSession();
      await client.send('Emulation.setCPUThrottlingRate', { rate: 8 });
      await gotoShot(page, `zone=deep&face=${face}`, '#ns-essays', 700, false);
      if (layerOff) await page.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'off'; });
      await sleep(400);
      const r = await page.evaluate(async () => {
        const t = []; const t0 = performance.now();
        await new Promise((res) => {
          let last = performance.now();
          (function loop(ts) {
            t.push(ts - last); last = ts;
            if (ts - t0 > 4000) return res();
            requestAnimationFrame(loop);
          })(performance.now());
        });
        const s = t.slice(1).sort((a, b) => a - b);
        const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
        return { frames: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
      });
      await page.close();
      return r;
    };
    for (const face of ['wake', 'dream']) {
      const line = [];
      for (const [label, off] of [['有层', false], ['无层', true]]) {
        const a = await run(off, face), b = await run(off, face);
        line.push(`${label}: 帧 ${a.frames}/${b.frames}｜p50 ${a.p50.toFixed(0)}/${b.p50.toFixed(0)}ms｜p95 ${a.p95.toFixed(0)}/${b.p95.toFixed(0)}ms｜max ${a.max.toFixed(0)}/${b.max.toFixed(0)}ms`);
      }
      console.log(`  ${face}：${line[0]}`);
      console.log(`  ${face}：${line[1]}`);
    }
    /* 动画清单 + rAF / 监听增量（本层 vs 外壳基线） */
    const probe = async (file) => {
      const page = await mk(1440, 900);
      await page.evaluateOnNewDocument(() => {
        window.__j = { raf: 0, rafSites: {}, lis: 0, lisSites: {} };
        const r = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (cb) {
          window.__j.raf++;
          const st = new Error().stack.split('\n')[2] || '?';
          window.__j.rafSites[st.trim().slice(0, 60)] = 1;
          return r(cb);
        };
        const a = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (...arg) {
          window.__j.lis++;
          const st = new Error().stack.split('\n')[2] || '?';
          window.__j.lisSites[st.trim().slice(0, 60)] = 1;
          return a.apply(this, arg);
        };
      });
      await page.goto(`${base(file)}?ui=0&zone=deep&face=wake`, { waitUntil: 'networkidle0', timeout: 60000 });
      await sleep(2500);
      const r = await page.evaluate(() => {
        const mine = [], all = [];
        for (const el of document.querySelectorAll('#p15-bg *')) {
          const a = getComputedStyle(el).animationName;
          if (a && a !== 'none') mine.push((el.className || el.tagName) + ':' + a + '@' + getComputedStyle(el).animationDuration);
        }
        for (const el of document.querySelectorAll('*')) {
          const a = getComputedStyle(el).animationName;
          if (a && a !== 'none') all.push(el.className + ':' + a);
        }
        return { mine, all, n: document.querySelectorAll('#p15-bg *').length, j: window.__j };
      });
      await page.close();
      return r;
    };
    const shell = await probe(SHELL), mine = await probe(FILE);
    const sites = (o) => Object.keys(o).length;
    console.log(`  醒态 #p15-bg 内元素 ${mine.n}｜animation 数 = ${mine.mine.length}：${mine.mine.join(', ')}`);
    console.log(`  全页 animation：外壳 ${shell.all.length} ↔ 本稿 ${mine.all.length}`);
    console.log(`  2.5s 内 rAF：外壳 ${shell.j.raf} @${sites(shell.j.rafSites)} 点 ↔ 本稿 ${mine.j.raf} @${sites(mine.j.rafSites)} 点`);
    console.log(`  监听注册：外壳 ${shell.j.lis} @${sites(shell.j.lisSites)} 点 ↔ 本稿 ${mine.j.lis} @${sites(mine.j.lisSites)} 点`);
  }

  await browser.close();
  server.close();
  console.log('\n' + (errors.length ? 'PROBLEMS:\n  ' + errors.join('\n  ') : 'console errors: none'));
  console.log('out: design/mocks/.shots-p16-b-extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
