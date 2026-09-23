/* ─────────────────────────────────────────────────────────────
   p15-b 追加观测（不进 11 张固定矩阵，专供 notes 的实测与自验）

   用法：node design/mocks/.p15-b-extra.cjs [all|smoke|lum|mix|hold|zoom]

   A smoke 静态自检：与线上逐字一致性 / 顶点数 / eegPathD 单次耗时 /
           animation 计数（醒/梦/减动）/ rAF 与监听计数（本稿 vs 外壳）
   B lum   三 zone 亮度实测：版心（42rem）内背景最亮处 / 相邻墨色 ΔL
   C mix   分裂随 --reality-mix 的曲线：残影与谱带的离轴距离（像素差实测）
   D hold  真实长按：1300ms 回梦 / 2200ms 入醒 / 中途松手退回，中途逐帧出图
   E zoom  3× 裁片：阶梯转角与残影细节（看「糊没糊」）

   ⚠ 两个环境事实（都实测过，影响了这份脚本的写法）：
     ① puppeteer 的 page.screenshot({clip}) 是**文档坐标**，且当它落在当前视口
        之外时会走 captureBeyondViewport —— 那一帧里 position:fixed 的层会被挪到
        裁切视口的原点：脑电直接消失。所以共用矩阵的 09（at:#ns-essays 后又裁
        y250..610，落在视口上方）拍到的是首屏、没有脑电。本脚本的 3× 裁片改成
        clip = 文档坐标 ∩ 当前视口（y 加上 scrollY），固定层就正常了。
     ② 亮度/分离度这类像素统计一律用**全视口**截图（不裁），在页面内 canvas 里
        取版心窗口，避免 ① 的坑。
   起临时静态服务器的方式照抄 .shot-p15.cjs（以仓库根为 root，随机端口）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-p15-b');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
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
const save = (n, d) => fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(d, 'base64'));

/* 像素探针：两帧之差 → 版心窗口内最亮处（占墨色 ΔL 的百分比）＋ 全宽窗口内
   相对 14° 轴的垂距分布（＝残影/谱带离轴多远）。
   窗口一律给**视口坐标**；图像是整张视口截图时 offx=offy=0。 */
const PROBE = (a, b, offx, offy, x0, x1, colX0, colX1) => `(async () => {
  const mk = async (dd) => { const i = new Image(); i.src = 'data:image/png;base64,' + dd; await i.decode();
    const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return { g, w: i.width, h: i.height }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const A = await mk(${JSON.stringify(a)}), B = await mk(${JSON.stringify(b)});
  const da = A.g.getImageData(0, 0, A.w, A.h).data, db = B.g.getImageData(0, 0, B.w, B.h).data;
  const OX = ${offx}, OY = ${offy}, X0 = ${x0}, X1 = ${x1}, CX0 = ${colX0}, CX1 = ${colX1};
  /* 底色＝B 帧在版心窗口里的众数色（那一片绝大多数像素是空底） */
  const hist = new Map();
  for (let y = 0; y < B.h; y++) for (let x = Math.max(0, CX0 - OX); x <= Math.min(B.w - 1, CX1 - OX); x++) {
    const i = (y * B.w + x) * 4, k = db[i] + ',' + db[i + 1] + ',' + db[i + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let mode = '0,0,0', mn = -1; for (const [k, v] of hist) if (v > mn) { mn = v; mode = k; }
  const ground = L(...mode.split(',').map(Number));
  const raw = getComputedStyle(document.body).color.match(/\\d+/g).map(Number);
  const ink = L(raw[0], raw[1], raw[2]);
  const inkDelta = Math.abs(ink - ground);
  const cy = innerHeight * 0.5, cxm = innerWidth / 2;
  const cos = Math.cos(14 * Math.PI / 180), tan = Math.tan(14 * Math.PI / 180);
  let maxCol = 0, maxAt = null, over35 = 0, n = 0, sum = 0, allMax = 0;
  const perp = [];
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * 4;
    const d = Math.abs(L(da[i], da[i + 1], da[i + 2]) - L(db[i], db[i + 1], db[i + 2]));
    if (d <= 0.002) continue;
    const px = x + OX, py = y + OY;
    n++; sum += d;
    if (d > allMax) allMax = d;
    if (px >= X0 && px <= X1) perp.push(Math.abs(py - (cy + tan * (px - cxm))) * cos);
    if (px >= CX0 && px <= CX1) {
      if (d > maxCol) { maxCol = d; maxAt = [px, py]; }
      if (d > inkDelta * 0.35) over35++;
    }
  }
  perp.sort((p, q) => p - q);
  const q = (f) => (perp.length ? +perp[Math.min(perp.length - 1, Math.floor(perp.length * f))].toFixed(1) : 0);
  return { ground: +ground.toFixed(4), ink: +ink.toFixed(4), inkDelta: +inkDelta.toFixed(4),
    maxCol: +maxCol.toFixed(4), colPct: +(maxCol / inkDelta * 100).toFixed(1), maxAt, over35,
    changed: n, mean: +(sum / Math.max(1, n)).toFixed(4),
    perpMax: q(0.999), perpP95: q(0.95), perpP50: q(0.5) };
})()`;

(async () => {
  const MODE = process.argv[2] || 'all';
  const want = (m) => MODE === 'all' || MODE === m;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/p15-b-harmonic.html`;
  const shellUrl = `http://127.0.0.1:${server.address().port}/design/mocks/p15-shell.html`;
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15b-extra')}`],
  });
  const R = {};

  const newPage = async (w = 1440, h = 900, dsf = 1) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
    return page;
  };
  const open = async (url, w = 1440, h = 900, dsf = 1) => {
    const page = await newPage(w, h, dsf);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(650);
    return page;
  };
  const toSec = async (page, sel) => {
    await page.evaluate((s) => {
      const el = document.querySelector(s);
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    }, sel);
    await sleep(850);
  };
  const shot = async (page, n) => {
    const d = await page.screenshot({ encoding: 'base64' });
    if (n) save(n, d);
    return d;
  };
  const st = (page) => page.evaluate(() => window.__p15.state());
  /* 3× 裁片：clip 的 y 必须是文档坐标 = 视口坐标 + scrollY，且落在视口内 */
  const crop = async (page, n, x, vy, w, h, dsf) => {
    const y = await page.evaluate(() => window.scrollY);
    const d = await page.screenshot({ encoding: 'base64', clip: { x, y: y + vy, width: w, height: h }, captureBeyondViewport: false });
    save(n, d);
    return d;
  };
  const instrument = async (page) => {
    await page.evaluateOnNewDocument(() => {
      window.__cnt = { raf: 0, add: 0, types: {} };
      const r = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function (cb) { window.__cnt.raf++; return r(cb); };
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (t, f, o) {
        window.__cnt.add++; window.__cnt.types[t] = (window.__cnt.types[t] || 0) + 1;
        return add.call(this, t, f, o);
      };
    });
  };

  /* ── A · 静态自检 ───────────────────────────────────────── */
  if (want('smoke')) {
    const page = await open(base + '?ui=0&zone=deep&freeze=1&face=wake');
    R.identity = await page.evaluate(() => {
      /* 线上 src/components/chrome/Eeg.astro 那 8 行，原样重打一遍 */
      const online = (ph) => {
        const W = innerWidth, H = innerHeight, cy = H * 0.5;
        const half = Math.sqrt(W * W + H * H) / 2 + 60;
        const AMP = 3.6, FREQ = 0.5, SPD = 2.6;
        let d = '', first = true;
        for (let x = -half; x <= half; x += 26) {
          const u = x / 600;
          const y = Math.sin(u * FREQ * Math.PI * 2 + ph * SPD) * AMP + Math.sin(u * FREQ * 2.7 + ph * 1.3) * AMP * 0.4;
          d += (first ? 'M' : 'L') + (W / 2 + x).toFixed(1) + ' ' + (cy + y).toFixed(1);
          first = false;
        }
        return d;
      };
      const out = [];
      for (const ph of [0, 1.234, 7.7]) {
        const a = window.__p15b.pathD(ph, 0), b = online(ph);
        out.push({ ph, identical: a === b, len: a.length, firstDiff: a === b ? -1 : [...a].findIndex((c, i) => c !== b[i]) });
      }
      return out;
    });
    R.stat_wake = await page.evaluate(() => window.__p15b.stat(0));
    R.bench_wake = await page.evaluate(() => [window.__p15b.bench(200, 0), window.__p15b.bench(200, 0)]);
    R.benchPath_wake = await page.evaluate(() => window.__p15b.benchPath(2000, 0));
    await page.close();
    const dpage = await open(base + '?ui=0&zone=deep&freeze=1&face=dream');
    R.stat_dream = await dpage.evaluate(() => window.__p15b.stat(1));
    R.bench_dream = await dpage.evaluate(() => [window.__p15b.bench(200, 1), window.__p15b.bench(200, 1)]);
    R.benchPath_dream = await dpage.evaluate(() => window.__p15b.benchPath(2000, 1));
    R.dom = await dpage.evaluate(() => ({
      stave: document.querySelectorAll('#p15-bg .esb').length,
      echoes: document.querySelectorAll('.eeg .eeg-ghost').length,
      still: getComputedStyle(document.documentElement).getPropertyValue('--still').trim(),
      esbT: [...document.querySelectorAll('#p15-bg .esb')].map((e) => getComputedStyle(e).transform),
      esbB: [...document.querySelectorAll('#p15-bg .esb b')].map((e) => getComputedStyle(e).animationName + ' ' + getComputedStyle(e).animationDuration),
    }));
    const anims = (p) => p.evaluate(() => {
      const list = document.getAnimations();
      const mine = list.filter((a) => a.effect && a.effect.target instanceof Element && a.effect.target.closest('#p15-bg, #p15-eeg'));
      const nm = (a) => (a.animationName || '?') + '@' + (a.effect && a.effect.target instanceof Element ?
        (a.effect.target.className.baseVal !== undefined ? a.effect.target.className.baseVal : a.effect.target.className) : '');
      return { total: list.length, mine: mine.length, mineNames: mine.map(nm), all: list.map(nm) };
    });
    R.anim = {};
    for (const q of ['&face=wake', '&face=dream']) {
      const p = await open(base + '?ui=0&zone=deep' + q);
      R.anim[q] = await anims(p);
      await p.close();
    }
    const pr = await newPage();
    await pr.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await pr.goto(base + '?ui=0&zone=deep&reduced=1&face=dream', { waitUntil: 'networkidle0' });
    await sleep(600);
    R.anim.reduced = await anims(pr);
    await pr.close();
    await dpage.close();

    /* rAF / 监听：本稿 vs 外壳（同机位同 3 秒窗口；add 从 document-start 起累计） */
    const count = async (url) => {
      const p = await browser.newPage();
      await instrument(p);
      await p.setViewport({ width: 1440, height: 900 });
      await p.goto(url, { waitUntil: 'networkidle0' });
      await sleep(1200);
      const boot = await p.evaluate(() => ({ raf: window.__cnt.raf, add: window.__cnt.add, types: window.__cnt.types }));
      await p.evaluate(() => { window.__cnt.raf = 0; });
      const t0 = await p.evaluate(() => performance.now());
      await sleep(3000);
      const win = await p.evaluate(() => window.__cnt.raf);
      const span = await p.evaluate(() => performance.now()) - t0;
      await p.close();
      return { boot, span: Math.round(span), rafPer3s: win };
    };
    R.raf = { mine: await count(base + '?ui=0&zone=deep&face=dream'), shell: await count(shellUrl + '?ui=0&zone=deep&face=dream') };

    /* 醒态＝线上现状：本稿背景层在醒态是否逐像素等于 bg=off（全视口截图） */
    const p1 = await open(base + '?ui=0&zone=deep&freeze=1&face=wake');
    const w_on = await shot(p1, '90-wake-layer-on');
    const p2 = await open(base + '?ui=0&zone=deep&freeze=1&face=wake&bg=off');
    const w_off = await shot(p2, null);
    const w_eeg_on = await shot(p2, null);   /* 同页再拍一次，验证定格帧可复现 */
    R.wake_identity = await p2.evaluate(PROBE(w_on, w_off, 0, 0, 383, 1057, 383, 1057));
    R.freeze_determinism = await p2.evaluate(PROBE(w_off, w_eeg_on, 0, 0, 383, 1057, 383, 1057));
    await p1.close(); await p2.close();
  }

  /* ── B · 三 zone 亮度 ───────────────────────────────────── */
  if (want('lum')) {
    R.lum = {};
    for (const zone of ['deep', 'light', 'paper']) {
      const variants = {
        base_d: `&zone=${zone}&face=dream&bg=off&eeg=off`,
        eeg_d: `&zone=${zone}&face=dream&bg=off`,
        mine_d: `&zone=${zone}&face=dream&eeg=off`,
        base_w: `&zone=${zone}&face=wake&bg=off&eeg=off`,
        mine_w: `&zone=${zone}&face=wake&eeg=off`,
      };
      const im = {};
      let page;
      for (const k of Object.keys(variants)) {
        if (page) await page.close();
        page = await open(base + '?ui=0&freeze=1' + variants[k]);
        await toSec(page, '#ns-essays');
        im[k] = await shot(page, `91-lum-${zone}-${k}`);
      }
      const W = [0, 1439, 383, 1057];
      const r = {};
      r.eeg = await page.evaluate(PROBE(im.eeg_d, im.base_d, 0, 0, ...W));
      r.mine = await page.evaluate(PROBE(im.mine_d, im.base_d, 0, 0, ...W));
      r.mineWake = await page.evaluate(PROBE(im.mine_w, im.base_w, 0, 0, ...W));
      r.eegWake = await page.evaluate(PROBE(im.eeg_d, im.eeg_d, 0, 0, ...W));
      r.washShift = await page.evaluate(PROBE(im.base_d, im.base_w, 0, 0, ...W));
      R.lum[zone] = r;
      await page.close();
      console.log('LUM', zone, JSON.stringify(r));
    }
  }

  /* ── C · 分裂随 mix 的曲线 ──────────────────────────────── */
  if (want('mix')) {
    R.mix = [];
    const page = await open(base + '?ui=0&freeze=1&zone=deep&mix=1');
    for (const m of [1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0]) {
      const im = {};
      for (const [k, q] of [['none', '&bg=off&eeg=off'], ['eeg', '&bg=off'], ['mine', '&eeg=off'], ['both', '']]) {
        await page.goto(base + `?ui=0&freeze=1&zone=deep&mix=${m}${q}`, { waitUntil: 'networkidle0' });
        await sleep(450);
        im[k] = await page.screenshot({ encoding: 'base64' });
        if (k === 'both') save(`92-mix-${String(m).replace('.', '')}`, im[k]);
      }
      const W = [0, 1439, 383, 1057];
      const eeg = await page.evaluate(PROBE(im.eeg, im.none, 0, 0, ...W));
      const mine = await page.evaluate(PROBE(im.mine, im.none, 0, 0, ...W));
      const both = await page.evaluate(PROBE(im.both, im.none, 0, 0, ...W));
      R.mix.push({
        m,
        eeg: { colPct: eeg.colPct, perpMax: eeg.perpMax, perpP95: eeg.perpP95 },
        stave: { colPct: mine.colPct, perpMax: mine.perpMax, perpP95: mine.perpP95, n: mine.changed },
        both: { colPct: both.colPct, perpMax: both.perpMax },
      });
      console.log('MIX', m, JSON.stringify(R.mix[R.mix.length - 1]));
    }
    await page.close();
  }

  /* ── B2 · 去掉残影/谱带后还剩多少（notes 里那个问题的数） ── */
  if (want('lum2')) {
    R.lum2 = {};
    for (const zone of ['deep', 'light', 'paper']) {
      const variants = {
        base_d: `&zone=${zone}&face=dream&bg=off&eeg=off`,     // 只有文字：梦面
        main_d: `&zone=${zone}&face=dream&bg=off&echo=off`,    // 主波量化保持（＝p14-B 那件东西）
        full_d: `&zone=${zone}&face=dream&bg=off`,             // 主波 + 三道残影
        stave_d: `&zone=${zone}&face=dream&eeg=off`,           // 主波 + 谱带（无残影）
        both_d: `&zone=${zone}&face=dream`,                    // 全栈：主波 + 三残影 + 谱带
      };
      const im = {};
      let page;
      for (const k of Object.keys(variants)) {
        if (page) await page.close();
        page = await open(base + '?ui=0&freeze=1' + variants[k]);
        await toSec(page, '#ns-essays');
        im[k] = await shot(page, `97-noadd-${zone}-${k}`);
      }
      const W = [0, 1439, 383, 1057];
      R.lum2[zone] = {
        mainOnly: await page.evaluate(PROBE(im.main_d, im.base_d, 0, 0, ...W)),
        full: await page.evaluate(PROBE(im.full_d, im.base_d, 0, 0, ...W)),
        staveNoEcho: await page.evaluate(PROBE(im.stave_d, im.base_d, 0, 0, ...W)),
        stack: await page.evaluate(PROBE(im.both_d, im.base_d, 0, 0, ...W)),
      };
      /* 主波量化保持的两态差（梦−醒，主波自身） */
      const w = await open(base + `?ui=0&freeze=1&zone=${zone}&face=wake&bg=off&echo=off`);
      await toSec(w, '#ns-essays');
      const imw = await shot(w, `97-noadd-${zone}-main_w`);
      R.lum2[zone].mainTwoStates = await page.evaluate(PROBE(im.main_d, imw, 0, 0, ...W));
      await w.close(); await page.close();
      console.log('LUM2', zone, JSON.stringify(R.lum2[zone]));
    }
  }

  /* ── E · 3× 裁片（视口内的文档坐标裁切，固定层正常） ─────── */
  if (want('zoom')) {
    const page = await open(base + '?ui=0&freeze=1&zone=deep&face=dream', 1440, 900, 3);
    await toSec(page, '#ns-essays');
    await crop(page, '96-zoom3x-deep-dream', 430, 90, 560, 360);     /* 视口 y90..450：轴上方的谱带 */
    await crop(page, '96-zoom3x-deep-dream-b', 700, 240, 560, 360);  /* 轴所在的带 */
    await page.close();
    const p2 = await open(base + '?ui=0&freeze=1&zone=deep&face=wake', 1440, 900, 3);
    await toSec(p2, '#ns-essays');
    await crop(p2, '96-zoom3x-deep-wake', 430, 90, 560, 360);
    await p2.close();
    for (const m of [0.5, 0.25]) {
      const p3 = await open(base + `?ui=0&freeze=1&zone=deep&mix=${m}`, 1440, 900, 3);
      await toSec(p3, '#ns-essays');
      await crop(p3, `96-zoom3x-deep-mix${String(m).replace('.', '')}`, 430, 90, 560, 360);
      await p3.close();
    }
    const p4 = await open(base + '?ui=0&freeze=1&zone=light&face=dream', 1440, 900, 3);
    await toSec(p4, '#ns-essays');
    await crop(p4, '96-zoom3x-light-dream', 430, 90, 560, 360);
    await p4.close();
    /* 首屏（scroll 0）的 3× 裁片：clip 就在视口内，无需滚动 */
    const p5 = await open(base + '?ui=0&freeze=1&zone=deep&face=dream', 1440, 900, 3);
    await crop(p5, '96-zoom3x-hero-dream', 430, 250, 560, 360);
    await p5.close();
  }

  /* ── D · 真实长按 ───────────────────────────────────────── */
  if (want('hold')) {
    R.hold = {};
    /* ① 醒面长按 1300ms 回梦：中途取样（mix 1→0） */
    let page = await open(base + '?ui=0&zone=deep&face=wake');
    await page.evaluate(() => window.__p15.hold());
    const seqBack = [];
    for (let i = 0; i < 6; i++) {
      const s = await st(page);
      const d = await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 300, width: 1440, height: 300 }, captureBeyondViewport: false });
      save(`94-hold-back-${i}-mix${String(s.mix).replace('.', '')}`, d);
      seqBack.push({ progress: s.progress, mix: s.mix, mode: s.mode });
      await sleep(60);
    }
    await sleep(500);
    R.hold.afterBack = await st(page);
    R.hold.seqBack = seqBack;
    await page.close();
    /* ② 梦面长按 2200ms 入醒：中途取样（mix 0→1），再等它自己 latch 到醒面 */
    page = await open(base + '?ui=0&zone=deep&face=dream');
    await page.evaluate(() => window.__p15.hold());
    const seqGo = [];
    for (let i = 0; i < 5; i++) {
      const s = await st(page);
      const d = await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 300, width: 1440, height: 300 }, captureBeyondViewport: false });
      save(`93-hold-go-${i}-mix${String(s.mix).replace('.', '')}`, d);
      seqGo.push({ progress: s.progress, mix: s.mix, mode: s.mode });
      await sleep(60);
    }
    await sleep(2600);
    R.hold.afterGo = await st(page);
    R.hold.seqGo = seqGo;
    await page.close();
    /* ③ 中途松手：按 620ms 松手 → 必须退回 */
    page = await open(base + '?ui=0&zone=deep&face=wake');
    await page.evaluate(() => window.__p15.hold());
    await sleep(620);
    const atRelease = await st(page);
    await page.evaluate(() => window.__p15.release());
    const trail = [];
    for (let i = 0; i < 6; i++) { await sleep(160); trail.push(await st(page)); }
    R.hold.midRelease = { atRelease, trail, end: await st(page) };
    await (async () => { const d = await page.screenshot({ encoding: 'base64', clip: { x: 0, y: 300, width: 1440, height: 300 }, captureBeyondViewport: false }); save('95-mid-release-settled', d); })();
    await page.close();
    console.log('HOLD', JSON.stringify(R.hold, null, 1));
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, '_p15b-extra.json'), JSON.stringify(R, null, 2));
  console.log('\n== summary ==');
  console.log(JSON.stringify(R, null, 1).slice(0, 7000));
  console.log(errors.length ? `PROBLEMS:\n  ${errors.join('\n  ')}` : 'console errors: none');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
