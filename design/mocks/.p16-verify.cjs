/* ─────────────────────────────────────────────────────────────
   Phase 16 · 独立复核（主会话用，不属任何一稿）
   对 p16 两稿 + p15-d（参照）逐项实测，全部由本脚本自己现算：
     1) 背景区两态静止帧的像素差（排除文字区）
     2) 稳态 1s 的 rAF 调用数、事件监听新增数
     3) 醒度扫描 0/.25/.5/.75/1 —— 中间态是不是真中间态
     4) 几何断言（从**渲染结果** getBoundingClientRect 重算，不读它们的自报）：
        · p16-b 醒态：任意两块零重叠？每块与邻居的共享边长 ≥60% 边长？
        · p16-b 梦态：交叠处最多叠几层？
        · p16-a 醒态：方块是否吸在模数上、彼此是否成不了形？
        · p16-a 梦态：是否真的聚成若干紧凑大形体（单链聚类）？
     5) 8× CPU 降速下「有层 / 无层」的帧数对照（这稿最大的技术疑点）
   用法：node design/mocks/.p16-verify.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const MOCKS = [
  ['p15-d-constructs', 'P15-D 构块场（参照）'],
  ['p16-a-solo', 'P16-A 变体一：散块自走 ↔ 聚成构造'],
  ['p16-b-tiled', 'P16-B 变体二：边边相重合 ↔ 接缝错开'],
];

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

/* 页面内解码两张 PNG 并逐像素比；文字盒子整片排除；两档感知阈值 */
const DIFF = `async (a, b, rects) => {
  const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = d; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0);
  const db = x.getImageData(0, 0, c.width, c.height).data;
  const mask = new Uint8Array(c.width * c.height);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x) - 3), x1 = Math.min(c.width, Math.ceil(r.x + r.w) + 3);
    const y0 = Math.max(0, Math.floor(r.y) - 3), y1 = Math.min(c.height, Math.ceil(r.y + r.h) + 3);
    for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) mask[y * c.width + xx] = 1;
  }
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let n = 0, sum = 0, max = 0, t6 = 0, t20 = 0;
  for (let i = 0, p = 0; i < da.length; i += 4, p++) {
    if (mask[p]) continue;
    const dl = L(da, i), dl2 = L(db, i), df = Math.abs(dl - dl2);
    n++; sum += df; if (df > max) max = df;
    if (df > 6) t6++; if (df > 20) t20++;
  }
  return { meanBg: +(sum / n).toFixed(2), maxBg: +max.toFixed(1), pct6: +(t6 / n * 100).toFixed(1), pct20: +(t20 / n * 100).toFixed(2) };
}`;

const TEXT_SEL = '.container .sec-head h2, .container h3, .container p, .container .mono, .container .st';

/* ── 几何：拿视口内所有方块的外接盒（渲染结果，不是 inline style） ── */
const GEOM = (sel) => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
    out.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
};

/* 轴对齐矩形：两两重叠面积 */
function overlapPairs(rs) {
  const pairs = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 0 && h > 0) pairs.push({ i, j, area: w * h, w, h });
  }
  return pairs;
}
/* 共享边：水平相邻（上下边共线）或垂直相邻（左右边共线）时的重合段长度 */
function sharedEdges(rs) {
  const res = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    let best = 0;
    // 左右相邻：|a.x+a.w - b.x| <= 2 或反过来
    if (Math.abs(a.x + a.w - b.x) <= 2 || Math.abs(b.x + b.w - a.x) <= 2) {
      best = Math.max(best, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    }
    if (Math.abs(a.y + a.h - b.y) <= 2 || Math.abs(b.y + b.h - a.y) <= 2) {
      best = Math.max(best, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    }
    if (best > 0) res.push({ i, j, len: best, fracA: best / Math.min(a.w, a.h), fracB: best / Math.min(b.w, b.h) });
  }
  return res;
}
/* 采样叠深（3px 格） */
function maxDepth(rs, step) {
  if (!rs.length) return 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of rs) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  let mx = 0;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    let d = 0;
    for (const r of rs) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) d++;
    if (d > mx) mx = d;
  }
  return mx;
}
/* 单链聚类（阈值 t）→ 簇数与簇的外接框边长 */
function clusters(rs, t) {
  const n = rs.length, seen = new Array(n).fill(false), out = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const q = [i]; seen[i] = true; const grp = [];
    while (q.length) {
      const k = q.pop(); grp.push(rs[k]);
      for (let j = 0; j < n; j++) {
        if (seen[j]) continue;
        const a = rs[k], b = rs[j];
        const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
        const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
        if (Math.hypot(dx, dy) <= t) { seen[j] = true; q.push(j); }
      }
    }
    if (grp.length > 1) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const r of grp) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
      out.push({ n: grp.length, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p16-verify')}`],
  });
  const rows = [];
  for (const [file, label] of MOCKS) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.evaluateOnNewDocument(() => {
      window.__raf = 0; window.__lis = 0;
      const r = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf++; return r(cb); };
      const a = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (...arg) { window.__lis++; return a.apply(this, arg); };
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const open = async (q) => {
      await page.goto(`${base}${file}.html?ui=0&zone=deep&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 600));
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
      }, '#ns-essays');
      await new Promise((r) => setTimeout(r, 900));
    };
    const snap = async () => page.screenshot({ encoding: 'base64', captureBeyondViewport: false });

    await open('freeze=1&face=wake');
    const wake = await snap();
    const rects = await page.evaluate((sel) => {
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      }
      return out;
    }, TEXT_SEL);
    await open('freeze=1&face=dream');
    const dream = await snap();
    const diff = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + wake)},${JSON.stringify('data:image/png;base64,' + dream)},${JSON.stringify(rects)})`);

    /* rAF / 监听：醒面 idle 1s */
    await open('face=wake');
    await new Promise((r) => setTimeout(r, 900));
    await page.evaluate(() => { window.__raf = 0; window.__lis = 0; });
    await new Promise((r) => setTimeout(r, 1000));
    const idle = await page.evaluate(() => ({ raf: window.__raf, lis: window.__lis }));

    /* 醒度扫描 */
    const sweep = [];
    for (const m of [0, 0.25, 0.5, 0.75, 1]) { await open(`freeze=1&mix=${m}`); sweep.push(await snap()); }
    const mid = [];
    for (let i = 1; i < 4; i++) {
      const a = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + sweep[0])},${JSON.stringify('data:image/png;base64,' + sweep[i])},${JSON.stringify(rects)})`);
      const b = await page.evaluate(`(${DIFF})(${JSON.stringify('data:image/png;base64,' + sweep[4])},${JSON.stringify('data:image/png;base64,' + sweep[i])},${JSON.stringify(rects)})`);
      mid.push({ m: [0.25, 0.5, 0.75][i - 1], vsWake: a.meanBg, vsDream: b.meanBg });
    }

    /* 几何：醒态与梦态各取一次（freeze=1，动画停在 0% 帧 = 静止几何） */
    const SEL = file === 'p16-b-tiled' ? '.tl-sq' : file === 'p16-a-solo' ? '.sq' : '.cx-sq';
    await open('freeze=1&mix=1');
    const gw = await page.evaluate(GEOM, SEL);
    await open('freeze=1&mix=0');
    const gd = await page.evaluate(GEOM, SEL);
    const geo = {
      n: [gw.length, gd.length],
      ovlWake: overlapPairs(gw).length,
      ovlDream: overlapPairs(gd).length,
      depthWake: maxDepth(gw, 3),
      depthDream: maxDepth(gd, 3),
      clWake: clusters(gw, 12).length,
      clDream: clusters(gd, 24).length,
    };
    if (file === 'p16-b-tiled') {
      const se = sharedEdges(gw);
      geo.shareMin = se.length ? Math.round(Math.min(...se.map((s) => s.fracA)) * 100) : null;
      geo.shareAvg = se.length ? Math.round(se.reduce((s, x) => s + x.fracA, 0) / se.length * 100) : null;
      geo.shareUnder60 = se.filter((s) => s.fracA < 0.6).length;
      // 每块至少与一个邻居共享 ≥60% 边长的边？
      const ok = new Array(gw.length).fill(false);
      for (const s of se) if (s.fracA >= 0.6) { ok[s.i] = true; ok[s.j] = true; }
      geo.lonely = ok.filter((v) => !v).length;
    }
    if (file === 'p16-a-solo') {
      const mods = new Set(gw.map((r) => r.w));
      geo.modules = mods.size;
      /* 「吸在格线上」要用相对判据：簇心不在格上时绝对坐标取模会全判为否 */
      const resX = new Set(gw.map((r) => ((r.x % 8) + 8) % 8));
      const resY = new Set(gw.map((r) => ((r.y % 8) + 8) % 8));
      geo.resX = [...resX].sort((a, b) => a - b).join('/');
      geo.resY = [...resY].sort((a, b) => a - b).join('/');
      /* 「醒态凑不出形体」：单链聚类里最大的一簇有几块 */
      const cw = clusters(gw, 12), cd = clusters(gd, 24);
      geo.maxGrpWake = cw.length ? Math.max(...cw.map((c) => c.n)) : 0;
      geo.maxGrpDream = cd.length ? Math.max(...cd.map((c) => c.n)) : 0;
      geo.boxMin = cd.length ? Math.min(...cd.map((c) => Math.max(c.w, c.h))) : null;
      geo.boxMax = cd.length ? Math.max(...cd.map((c) => Math.max(c.w, c.h))) : null;
    }

    /* 8× CPU 降速下「有层 / 无层」的帧数 */
    const client = await page.target().createCDPSession();
    const frames = async (q, rate) => {
      await open(q);
      await client.send('Emulation.setCPUThrottlingRate', { rate });
      await page.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
      await new Promise((r) => setTimeout(r, 3000));
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      return page.evaluate(() => window.__f);
    };
    const fOn = await frames('zone=deep&bg=through&mix=0.5', 8);
    const fOff = await frames('zone=deep&bg=off&mix=0.5', 8);
    const fOn1 = await frames('zone=deep&bg=through&mix=0.5', 1);
    const fOff1 = await frames('zone=deep&bg=off&mix=0.5', 1);

    rows.push({ file, label, ...diff, raf: idle.raf, lis: idle.lis, mid, geo, fOn, fOff, fOn1, fOff1, errs });
    console.log(
      `${file.padEnd(17)} 背景ΔL 均 ${String(diff.meanBg).padStart(5)} 峰 ${String(diff.maxBg).padStart(5)}` +
        ` | ΔL>6 ${String(diff.pct6).padStart(4)}% ΔL>20 ${String(diff.pct20).padStart(5)}%` +
        ` | rAF/1s ${String(idle.raf).padStart(3)} 监听 ${idle.lis}` +
        ` | 3s 内帧数 1× 有层 ${String(fOn1).padStart(3)} / 无层 ${String(fOff1).padStart(3)} · 8× 有层 ${String(fOn).padStart(3)} / 无层 ${String(fOff).padStart(3)}` +
        (errs.length ? '  ERR:' + errs.join('|') : ''),
    );
    console.log(
      `  └ 几何：方块 ${geo.n[0]}/${geo.n[1]} ｜ 醒重叠对 ${geo.ovlWake} 叠深 ${geo.depthWake} 簇 ${geo.clWake}` +
        ` ｜ 梦重叠对 ${geo.ovlDream} 叠深 ${geo.depthDream} 簇 ${geo.clDream}` +
        (geo.shareMin !== null ? ` ｜ 共边 min ${geo.shareMin}% avg ${geo.shareAvg}% <60% 的 ${geo.shareUnder60} 孤独块 ${geo.lonely}` : '') +
        (geo.modules !== undefined ? ` ｜ 醒态尺寸档 ${geo.modules} 种、残差 mod8 x=${geo.resX} y=${geo.resY}、最大连通簇 醒 ${geo.maxGrpWake} / 梦 ${geo.maxGrpDream} 块；梦态簇外接框 ${geo.boxMin}–${geo.boxMax}px` : ''),
    );
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, '.shots-p16-verify.json'), JSON.stringify(rows, null, 2));
  console.log('\n已写 design/mocks/.shots-p16-verify.json');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
