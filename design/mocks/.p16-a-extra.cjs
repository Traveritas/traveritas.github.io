/* ─────────────────────────────────────────────────────────────
   P16-A · 散块自走 ↔ 聚成构造 · 额外观测
   （brief 说静态图证不了的东西：无缝、长按、帧时间、亮度红线）

   用法：node design/mocks/.p16-a-extra.cjs [measure|interact|spread|perf|zoom|probe|all]

   1 · measure  版心内背景最亮处 / 相邻正文墨色亮度差（三 zone × 醒梦两态）
                方法沿用 D 稿：同机位 freeze 逐像素 on/off（?bg=off 关掉本层）
   2 · interact window.__p15.hold()/release()：1300ms→梦 / 2200ms→醒 / 中途松手退回
                （每次按压都新开一页，sessionStorage 会闩锁），并逐帧读抽样方块的位移
   3 · spread   钉住 mix = 1 / .75 / .5 / .25 / 0 五个确定帧（freeze=1），
                读全场平均位移，验证聚散是 smoothstep 连续插值、不是开关
   4 · perf     8× CPU 降速下「有层 / 无层」的帧时间 A/B：
                (a) 页内 rAF 滚动 5s（D 稿/c 稿同口径）(b) 长按 2.4s 全程（本稿的风险窗口）
   5 · zoom     视口相对的 3× 裁片：同一个构造体在醒/梦两态的对照（共用 09 是文档坐标）
   6 · probe    醒态 animation 清单、新增 rAF / 监听数（与 p15-shell.html 对照）
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-p16-a-extra');
fs.mkdirSync(OUT, { recursive: true });
const MODE = process.argv[2] || 'all';
const FILE = 'p16-a-solo';
const SHELL = 'p15-shell';
const PROFILE = 'chrome-p16-a-extra';

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

/* 两张 PNG 逐像素比：返回本层贡献的最大 |ΔL|（W3C 相对亮度） */
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

/* 只比两帧差异（聚散逐帧证据用） */
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
    let n = 0, sum = 0;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
      if (d > 0) { n++; sum += d / 3; }
    }
    return { diffPx: n, totalPx: A.length / 4, mean: +(sum / (A.length / 4)).toFixed(3) };
  }, aB64, bB64);
}

/* 采样方块的位移读数：transform 相对簇原点的偏移（layout 值不受 transform 影响） */
const DISP = () => {
  const els = Array.from(document.querySelectorAll('.sq'));
  const step = Math.max(1, Math.floor(els.length / 24));
  let sum = 0, n = 0, mx = 0;
  for (let i = 0; i < els.length; i += step) {
    const el = els[i];
    const r = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect();
    const dx = r.left - c.left - el.offsetLeft, dy = r.top - c.top - el.offsetTop;
    const d = Math.hypot(dx, dy);
    sum += d; n++; if (d > mx) mx = d;
  }
  return { mean: +(sum / n).toFixed(1), max: +mx.toFixed(1), n, total: els.length };
};

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), PROFILE)}`],
  });
  const errors = [];
  const mk = async (w, h, dsf) => {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.setViewport({ width: w, height: h, deviceScaleFactor: dsf || 1 });
    return p;
  };
  const gotoShot = async (p, q, at, wait, freeze) => {
    const fz = freeze === false ? '' : 'freeze=1&';
    await p.goto(`${base}?ui=0&${fz}${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(500);
    if (at) {
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }, at);
      await sleep(wait || 500);
    }
  };
  const gen = (p) => p.evaluate(() => window.__p16a);

  /* ═══════════ 0 · 生成期读数 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    const p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays');
    const g = await gen(p);
    console.log('\n═══ 生成期读数（?seed 固定，两次加载应完全一致） ═══');
    console.log('  ', JSON.stringify(g));
    const g2 = await (async () => { const q = await mk(1440, 900); await gotoShot(q, 'zone=deep&face=dream', '#ns-essays'); const r = await gen(q); await q.close(); return r; })();
    const shape = (o) => JSON.stringify(Object.assign({}, o, { ms: 0 }));   // ms 是耗时，不参与确定性比对
    console.log('   两次加载构图一致：', shape(g) === shape(g2) ? '是' : '否 ' + JSON.stringify(g2));
    const sizes = await p.evaluate(() => {
      const m = {};
      for (const el of document.querySelectorAll('.sq')) { const k = el.offsetWidth; m[k] = (m[k] || 0) + 1; }
      return m;
    });
    console.log('   尺寸分布（只应有五档）：', JSON.stringify(sizes));
    const durs = await p.evaluate(() => {
      const m = {};
      for (const el of document.querySelectorAll('.sq')) { const d = getComputedStyle(el).animationDuration; m[d] = (m[d] || 0) + 1; }
      return Object.keys(m).length;
    });
    console.log('   animation-duration 档数：', durs);
    const cols = await p.evaluate(() => {
      const m = {};
      for (const el of document.querySelectorAll('.sq')) { const c = getComputedStyle(el).backgroundColor; m[c] = (m[c] || 0) + 1; }
      return m;
    });
    console.log('   板面颜色档（应恰好三档＝三个档位浓度，var 百分比必须解析成功）：', JSON.stringify(cols));
    const tf = await p.evaluate(() => {
      const m = {};
      for (const el of document.querySelectorAll('.sq')) {
        const t = getComputedStyle(el).transform;
        m[t] = (m[t] || 0) + 1;
      }
      return { 不同静止帧位移值: Object.keys(m).length, 示例: Object.keys(m).slice(0, 4) };
    });
    console.log('   醒态冻结帧（freeze=1）位移值：', JSON.stringify(tf));
    await p.close();
  }

  /* ═══════════ 1 · 版心亮度实测 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    console.log('\n═══ 版心内背景最亮处 / 相邻正文墨色亮度差（逐像素 on/off，freeze=1） ═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>diff</title>');
    const lumOf = (fgc, softc, bgc) => blank.evaluate((f, s, b) => {
      const parse = (str) => { const m = str.match(/[\d.]+/g).map(Number).slice(0, 3); return /srgb/.test(str) ? m.map((x) => x * 255) : m; };
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const lb = L(parse(b));
      return { dFg: Math.abs(L(parse(f)) - lb), dSoft: Math.abs(L(parse(s)) - lb) };
    }, fgc, softc, bgc);
    for (const zone of ['deep', 'light', 'paper']) {
      for (const face of ['wake', 'dream']) {
        const p = await mk(1440, 900);
        await gotoShot(p, `zone=${zone}&face=${face}`, '#ns-essays');
        const box = await p.evaluate(() => { const r = document.querySelector('#ns-essays .container').getBoundingClientRect(); return { l: r.left, r: r.right }; });
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
        console.log(`${zone.padEnd(6)} ${face.padEnd(5)} 本层最大|ΔL|=${st.maxIn.toFixed(4)} (rgb ${st.at.on} ← 无层 ${st.at.off} @${st.at.x},${st.at.y}) ⇒ 占标题墨 ${(100 * st.maxIn / lum.dFg).toFixed(1)}% / 占正文墨 ${(100 * st.maxIn / lum.dSoft).toFixed(1)}%  [全幅 ${(100 * st.maxAll / lum.dSoft).toFixed(1)}%]`);
        await p.close();
      }
    }
    for (const [tag, w, h, q, at] of [['hero-deep-wake', 1440, 900, 'zone=deep&face=wake', null], ['hero-deep-dream', 1440, 900, 'zone=deep&face=dream', null], ['mobile-deep-dream', 390, 844, 'zone=deep&face=dream', '#ns-essays'], ['light-wake-container', 1440, 900, 'zone=light&face=wake', '#ns-essays']]) {
      const p = await mk(w, h); await gotoShot(p, q, at);
      const box = await p.evaluate((sel) => { const el = document.querySelector(sel + ' .container') || document.querySelector(sel + ' .hero-ink'); const r = el.getBoundingClientRect(); return { l: r.left, r: r.right }; }, at || '#ns-hero');
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
      console.log(`${tag.padEnd(22)} 区间宽 ${(box.r - box.l) | 0}  最大|ΔL|=${st.maxIn.toFixed(4)} ⇒ 标题墨 ${(100 * st.maxIn / lum.dFg).toFixed(1)}% / 正文墨 ${(100 * st.maxIn / lum.dSoft).toFixed(1)}%  [全幅 ${(100 * st.maxAll / lum.dSoft).toFixed(1)}%]`);
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 2 · 长按交互 ═══════════ */
  if (MODE === 'interact' || MODE === 'all') {
    console.log('\n═══ 长按 1300ms→梦 / 2200ms→醒 / 中途松手退回（逐帧读抽样方块位移） ═══');
    const read = (p) => p.evaluate((d) => {
      const s = window.__p15.state();
      const mix = s.mix;
      return { mix: mix, k: +(mix * mix * (3 - 2 * mix)).toFixed(3), face: s.face, mode: s.mode, p: s.progress, disp: null };
    }, 0);
    const readDisp = async (p) => {
      const st = await read(p);
      st.disp = await p.evaluate(DISP);
      return st;
    };
    /* A · 醒 → 梦（T_BACK = 1300ms），每次按压新开一页 */
    let p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
    console.log('— A：醒面长按（T_BACK=1300ms），位移应随 k 逐帧收拢 —');
    console.log('  t=0      ', JSON.stringify(await readDisp(p)));
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    let prev = 0;
    for (const t of [300, 600, 900, 1200, 1500]) {
      await sleep(t > prev ? t - prev - 230 : 0); prev = t;
      const r = await readDisp(p);
      console.log(`  t=${String(t).padStart(4)}ms `, JSON.stringify(r));
      if (t === 600) await p.screenshot({ path: path.join(OUT, 'hold-A-600ms-mid.png') });
      await sleep(230);
    }
    await sleep(500);
    console.log('  latch 后 ', JSON.stringify(await readDisp(p)));
    await p.screenshot({ path: path.join(OUT, 'hold-A-latched-dream.png') });
    await p.close();

    /* B · 梦 → 醒（T_GO = 2200ms） */
    p = await mk(1440, 900);
    await p.evaluateOnNewDocument(() => { try { sessionStorage.setItem('p15-reality', 'dream'); } catch (e) {} });
    await gotoShot(p, 'zone=deep&face=dream', '#ns-essays', 500, false);
    console.log('— B：梦面长按（T_GO=2200ms），位移应逐帧张开 —');
    console.log('  t=0      ', JSON.stringify(await readDisp(p)));
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    prev = 0;
    for (const t of [600, 1200, 1800, 2400]) {
      await sleep(t > prev ? t - prev - 230 : 0); prev = t;
      const r = await readDisp(p);
      console.log(`  t=${String(t).padStart(4)}ms `, JSON.stringify(r));
      if (t === 1200) await p.screenshot({ path: path.join(OUT, 'hold-B-1200ms-mid.png') });
      await sleep(230);
    }
    await sleep(400);
    console.log('  latch 后 ', JSON.stringify(await readDisp(p)));
    await p.screenshot({ path: path.join(OUT, 'hold-B-latched-wake.png') });
    await p.close();

    /* C · 中途松手退回 */
    p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
    console.log('— C：按住 600ms 后松手（retract 应退回醒面）—');
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    await sleep(600);
    console.log('  hold 600ms ', JSON.stringify(await readDisp(p)));
    await p.screenshot({ path: path.join(OUT, 'hold-C-600ms-before-release.png') });
    await p.evaluate(() => window.__p15.release());
    await sleep(150);
    console.log('  release+150', JSON.stringify(await readDisp(p)));
    await sleep(800);
    console.log('  release+950', JSON.stringify(await readDisp(p)));
    await p.close();
  }

  /* ═══════════ 3 · 聚散逐帧证据（mix 扫描） ═══════════ */
  if (MODE === 'spread' || MODE === 'all') {
    console.log('\n═══ 钉住 mix 五个确定帧（freeze=1，1440×900 同机位）═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>cmp</title>');
    const frames = [];
    for (const mix of [1, 0.75, 0.5, 0.25, 0]) {
      const p = await mk(1440, 900);
      await gotoShot(p, `zone=deep&mix=${mix}`, '#ns-essays');
      const d = await p.evaluate(DISP);
      const k = mix * mix * (3 - 2 * mix);
      const b64 = await p.screenshot({ encoding: 'base64' });
      frames.push({ mix, k, b64, mean: d.mean });
      fs.writeFileSync(path.join(OUT, `mix-${String(mix).replace('.', '')}-deep.png`), Buffer.from(b64, 'base64'));
      console.log(`  mix=${String(mix).padEnd(4)} k=smoothstep=${k.toFixed(4)}  抽样位移 均值 ${String(d.mean).padStart(6)}px / 峰值 ${String(d.max).padStart(6)}px  （均值 / mix=1 的均值 = ${(d.mean / frames[0].mean).toFixed(4)}）`);
      await p.close();
    }
    for (let i = 1; i < frames.length; i++) {
      const c = await pngCompare(blank, frames[0].b64, frames[i].b64);
      console.log(`  与 mix=1 逐像素比（mix=${frames[i].mix}）：不同 ${String(c.diffPx).padStart(7)}/${c.totalPx} (${(100 * c.diffPx / c.totalPx).toFixed(2)}%)  平均差 ${c.mean}`);
    }
    await blank.close();
  }

  /* ═══════════ 4 · 8× 降速 A/B ═══════════ */
  if (MODE === 'perf' || MODE === 'all') {
    console.log('\n═══ 8× CPU 降速「有层 / 无层」帧时间 A/B（同一稿内对照，绝对帧时间不横向比较）═══');
    const run = async (layer, hold, rate) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      /* 先正常加载（8× 降速下载入慢到会超时），再挂降速，只量动画本身的帧时间 */
      await page.goto(`${base}?ui=0&zone=deep&face=${hold ? 'wake' : 'dream'}`, { waitUntil: 'load', timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((l) => { document.getElementById('p15-bg').dataset.layer = l; }, layer);
      await sleep(400);
      const client = await page.createCDPSession();
      await client.send('Emulation.setCPUThrottlingRate', { rate: rate });
      await sleep(400);
      if (hold) await page.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
      const r = await page.evaluate(async (ms, noScroll) => {
        const t = []; const t0 = performance.now();
        await new Promise((res) => {
          let y = 0, last = performance.now();
          (function loop(ts) {
            t.push(ts - last); last = ts;
            if (!noScroll) { y += 2.2; window.scrollTo(0, y); }
            if (ts - t0 > ms) return res();
            requestAnimationFrame(loop);
          })(performance.now());
        });
        const s = t.slice(1).sort((a, b) => a - b);
        const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
        return { frames: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
      }, hold ? 2400 : 5000, hold);
      await page.close();
      return r;
    };
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    for (const [label, hold, rate] of [
      ['(a) 8× 降速 · 页内 rAF 滚动 5s（梦面，满场自走但幅度为 0）', false, 8],
      ['(b) 8× 降速 · 长按 2.4s 全程（醒面 → 梦，本稿的风险窗口）', true, 8],
      ['(c) 1× 不降速 · 页内 rAF 滚动 5s（真实机器）', false, 1],
      ['(d) 1× 不降速 · 长按 2.4s 全程（真实机器）', true, 1],
    ]) {
      const on = [], off = [];
      for (let i = 0; i < 3; i++) { on.push(await run('through', hold, rate)); off.push(await run('off', hold, rate)); }
      const m = (rs, k) => med(rs.map((r) => r[k]));
      const f = (rs) => `帧 ${String(m(rs, 'frames')).padStart(4)}｜p50 ${m(rs, 'p50').toFixed(1).padStart(6)}ms｜p95 ${m(rs, 'p95').toFixed(1).padStart(6)}ms｜max ${m(rs, 'max').toFixed(1).padStart(6)}ms`;
      console.log(`  ${label}（3 次取中位）\n    有层 ${f(on)}\n    无层 ${f(off)}`);
      console.log(`    ⇒ p95 差 ${(m(on, 'p95') - m(off, 'p95')).toFixed(1)}ms（${(100 * (m(on, 'p95') / m(off, 'p95') - 1)).toFixed(0)}%），帧数差 ${m(on, 'frames') - m(off, 'frames')}（${(100 * (m(on, 'frames') / m(off, 'frames') - 1)).toFixed(0)}%）`);
    }
  }

  /* ═══════════ 5 · 视口相对的 3× 裁片（同一个构造体两态对照） ═══════════ */
  if (MODE === 'zoom' || MODE === 'all') {
    console.log('\n═══ 视口相对的 3× 裁片（共用脚本的 09 是文档坐标，落在首屏）═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>crop</title>');
    /* 先在梦面挑一个完整落在视口里的构造体，取它梦态的位置作为裁片框
       （.sq-cl 自己宽高为 0，包围盒必须从子元素量） */
    const pick = await mk(1440, 900);
    await gotoShot(pick, 'zone=deep&face=dream', '#ns-essays');
    const pickBox = (pad) => pick.evaluate((pd) => {
      const cx = innerWidth / 2, cy = innerHeight / 2;
      let best = null, bd = 1e9;
      for (const cl of document.querySelectorAll('.sq-cl')) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
        for (const c of cl.children) { const b = c.getBoundingClientRect(); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); n++; }
        if (n < 4) continue;
        const w = x1 - x0, h = y1 - y0;
        if (w < 150 || h < 150) continue;
        const vis = Math.min(x1, innerWidth) - Math.max(x0, 0) > w * pd.frac && Math.min(y1, innerHeight) - Math.max(y0, 0) > h * pd.frac;
        if (!vis) continue;
        const d = Math.hypot((x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy);
        if (d < bd) { bd = d; best = { x: Math.max(0, x0 - pd.pad), y: Math.max(0, y0 - pd.pad), w: w + pd.pad * 2, h: h + pd.pad * 2, n: n, d: Math.round(d) }; }
      }
      return best;
    }, { frac: pad[0], pad: pad[1] });
    const box = (await pickBox([0.999, 46])) || (await pickBox([0.6, 46]));
    if (!box) { console.log('  ⚠ 没找到完整构造体，跳过 zoom'); }
    else {
      console.log('  裁片锚在离视口中心最近的完整构造体：', JSON.stringify(box));
      await pick.close();
      for (const face of ['wake', 'dream']) {
        const p = await mk(1440, 900, 3);
        await gotoShot(p, `zone=deep&face=${face}`, '#ns-essays');
        const full = await p.screenshot({ encoding: 'base64' });
        const crop = await blank.evaluate(async (src, b) => {
          const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
          const c = document.createElement('canvas'); c.width = b.w * 3; c.height = b.h * 3;
          c.getContext('2d').drawImage(im, b.x * 3, b.y * 3, b.w * 3, b.h * 3, 0, 0, b.w * 3, b.h * 3);
          return c.toDataURL('image/png').split(',')[1];
        }, full, box);
        fs.writeFileSync(path.join(OUT, `zoom3x-block-${face}.png`), Buffer.from(crop, 'base64'));
        console.log(`  zoom3x-block-${face}.png  ${box.w * 3}×${box.h * 3}（视口 (${box.x | 0},${box.y | 0}) 起 ${box.w | 0}×${box.h | 0} 的 3× 裁片，${box.n} 块板）`);
        await p.close();
      }
    }
    /* 另出一张压在正文上的 3×（看正文有没有被压到读不清） */
    for (const face of ['dream']) {
      const p = await mk(1440, 900, 3);
      await gotoShot(p, `zone=deep&face=${face}`, '#ns-essays');
      const full = await p.screenshot({ encoding: 'base64' });
      const crop = await blank.evaluate(async (src) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
        const c = document.createElement('canvas'); c.width = 620 * 3; c.height = 400 * 3;
        c.getContext('2d').drawImage(im, 700 * 3, 380 * 3, 620 * 3, 400 * 3, 0, 0, 620 * 3, 400 * 3);
        return c.toDataURL('image/png').split(',')[1];
      }, full);
      fs.writeFileSync(path.join(OUT, `zoom3x-text-${face}.png`), Buffer.from(crop, 'base64'));
      console.log(`  zoom3x-text-${face}.png  1860×1200（视口 (700,380) 起 620×400 的 3× 裁片）`);
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 6 · 醒态 animation 清单 / rAF / 监听 ═══════════ */
  if (MODE === 'probe' || MODE === 'all') {
    console.log('\n═══ 动画与 JS 开销（本层 vs 外壳）═══');
    const probe = async (file) => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        window.__j = { raf: 0, rafSites: {}, lis: 0, lisSites: {} };
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => {
          window.__j.raf++;
          const site = String(new Error().stack).split('\n')[2] || '?';
          window.__j.rafSites[site] = (window.__j.rafSites[site] || 0) + 1;
          return raf(cb);
        };
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (t, ...rest) {
          window.__j.lis++;
          const site = (String(new Error().stack).split('\n')[2] || '?') + ' @' + t;
          window.__j.lisSites[site] = (window.__j.lisSites[site] || 0) + 1;
          return add.call(this, t, ...rest);
        };
      });
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/design/mocks/${file}.html?ui=0&zone=deep&face=wake`, { waitUntil: 'networkidle0' });
      await sleep(2500);
      const r = await page.evaluate(() => {
        const mine = [], names = {};
        for (const el of document.querySelectorAll('#p15-bg, #p15-bg *')) {
          const a = getComputedStyle(el).animationName;
          if (a && a !== 'none') { mine.push(el.className + ':' + a); names[a] = (names[a] || 0) + 1; }
        }
        const all = [];
        for (const el of document.querySelectorAll('*')) { const a = getComputedStyle(el).animationName; if (a && a !== 'none') all.push(el.className + ':' + a); }
        return { j: window.__j, mineCount: mine.length, mineNames: names, all: all.length, n: document.querySelectorAll('#p15-bg *').length };
      });
      await page.close();
      return r;
    };
    const shell = await probe(SHELL), mine = await probe(FILE);
    const sites = (o) => Object.keys(o).length;
    console.log(`  #p15-bg 内元素 ${mine.n}｜醒态 animation 数 = ${mine.mineCount}，只有这些 keyframes：${JSON.stringify(mine.mineNames)}`);
    console.log(`  全页 animation 数：外壳 ${shell.all} ↔ 本稿 ${mine.all}（差 ${mine.all - shell.all} ＝ 本层新增）`);
    console.log(`  2.5s 内 rAF 调用：外壳 ${shell.j.raf} @${sites(shell.j.rafSites)} 个调用点 ↔ 本稿 ${mine.j.raf} @${sites(mine.j.rafSites)} 个（差 ${mine.j.raf - shell.j.raf}）`);
    console.log(`  监听注册：外壳 ${shell.j.lis} @${sites(shell.j.lisSites)} 个调用点 ↔ 本稿 ${mine.j.lis} @${sites(mine.j.lisSites)} 个（差 ${mine.j.lis - shell.j.lis}）`);
    const rm = await (async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`http://127.0.0.1:${port}/design/mocks/${FILE}.html?ui=0&zone=deep&face=wake&reduced=1`, { waitUntil: 'networkidle0' });
      await sleep(800);
      const r = await page.evaluate(() => {
        let n = 0;
        for (const el of document.querySelectorAll('#p15-bg *')) { const a = getComputedStyle(el).animationName; if (a && a !== 'none') n++; }
        const s = document.querySelector('.sq');
        return { n: n, tf: getComputedStyle(s).transform, disp: (function () { const r0 = s.getBoundingClientRect(), c0 = s.parentElement.getBoundingClientRect(); return +(r0.left - c0.left - s.offsetLeft).toFixed(1); })() };
      });
      await page.close();
      return r;
    })();
    console.log(`  ?reduced=1（模拟 prefers-reduced-motion）：本层 animation 数 = ${rm.n}（应为 0），首块停在散位 x=${rm.disp}px`);
  }

  await browser.close();
  server.close();
  console.log('\n' + (errors.length ? 'PROBLEMS:\n  ' + errors.join('\n  ') : 'console errors: none'));
  console.log('out: design/mocks/.shots-p16-a-extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
