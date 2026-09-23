/* ─────────────────────────────────────────────────────────────
   P15-D · 构块场 · 额外观测（brief 说静态图证不了「无缝」的那些）

   用法：node design/mocks/.p15-d-extra.cjs [measure|interact|seam|zoom|all]

   1 · measure  版心内背景最亮处 / 相邻正文墨色亮度差（三 zone × 醒梦两态）
                方法：同机位 freeze 逐像素 on/off 对比（?bg=off 关掉本层）
                像素在空白页里用 canvas 解 PNG，墨色差取自页面计算值。
   2 · interact window.__p15.hold()/release() 长按：1300ms→梦、2200ms→醒、
                中途松手退回；并逐帧读 .cx-pan 的 translate（平移乘 --reality-mix）
                与 .cx-step 的动画幅度（乘 --still），证明「停住 / 长出来」是连续的。
   3 · seam     用 inline !important 钉住 animation-delay，取 t=0 / t=T-0.05s /
                t=T 三帧逐像素比：首尾必须严格同帧。
   4 · zoom     视口相对的 3× 放大裁片（共用脚本的 09 是文档坐标，落在首屏）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-p15-d-extra');
fs.mkdirSync(OUT, { recursive: true });
const MODE = process.argv[2] || 'all';
const FILE = 'p15-d-constructs';
const PAN_DUR = [104, 84, 66];   // 必须与 HTML 里的 BANDS 一致

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

/* 空白页 + canvas：解码两张 PNG，返回本层贡献的最大 |ΔL|（W3C 相对亮度） */
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
    let maxIn = 0, at = null, maxAll = 0, nIn = 0, over = 0, overList = [];
    const x0 = Math.round(r.l), x1 = Math.round(r.r);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(L(A, i) - L(B, i));
        if (d > maxAll) maxAll = d;
        if (x >= x0 && x < x1) {
          nIn++;
          if (d > 1e-6) over++;
          if (d > maxIn) { maxIn = d; at = { x, y, on: rgb(A, i), off: rgb(B, i), L: +L(A, i).toFixed(4), Lb: +L(B, i).toFixed(4) }; }
        }
      }
    }
    return { maxIn, maxAll, at, nIn, over, w: c.width, h: c.height };
  }, aB64, bB64, box);
}

/* 只比两帧差异（无缝证据用） */
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
    let n = 0, maxd = 0, sum = 0, worst = null;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (d > 0) { n++; sum += d; if (d > maxd) { maxd = d; worst = [i / 4 % c.width | 0, i / 4 / c.width | 0]; } }
    }
    return { diffPx: n, totalPx: A.length / 4, maxd, mean: +(sum / (A.length / 4)).toFixed(4), worst };
  }, aB64, bB64);
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15-d-extra')}`],
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

  /* ═══════════ 1 · 版心亮度实测 ═══════════ */
  if (MODE === 'measure' || MODE === 'all') {
    console.log('\n═══ 版心内背景最亮处 / 相邻正文墨色亮度差（逐像素 on/off，freeze=1） ═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>diff</title>');
    for (const zone of ['deep', 'light', 'paper']) {
      for (const face of ['wake', 'dream']) {
        const q = `zone=${zone}&face=${face}`;
        const p = await mk(1440, 900);
        await gotoShot(p, q, '#ns-essays');
        const box = await p.evaluate(() => { const r = document.querySelector('#ns-essays .container').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
        const ink = await p.evaluate(() => {
          const h = document.querySelector('#ns-essays .sec-head h2');
          const para = document.querySelector('#ns-essays .row p');
          return {
            fg: getComputedStyle(h).color,
            soft: getComputedStyle(para).color,
            bodyBg: getComputedStyle(document.body).backgroundColor,
          };
        });
        const on = await p.screenshot({ encoding: 'base64' });
        await p.evaluate(() => { const b = document.getElementById('p15-bg'); b.dataset.layer = 'off'; });
        await sleep(200);
        const off = await p.screenshot({ encoding: 'base64' });
        const st = await pngDiff(blank, on, off, box);
        const lum = await blank.evaluate((fgc, softc, bgc) => {
          const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3); return /srgb/.test(s) ? m.map((x) => x * 255) : m; };
          const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          const lb = L(parse(bgc));
          return { lfg: L(parse(fgc)), lsoft: L(parse(softc)), lbg: lb };
        }, ink.fg, ink.soft, ink.bodyBg);
        const dFg = Math.abs(lum.lfg - lum.lbg), dSoft = Math.abs(lum.lsoft - lum.lbg);
        console.log(`${zone.padEnd(6)} ${face.padEnd(5)} 本层最大|ΔL|=${st.maxIn.toFixed(4)} (rgb ${st.at.on} vs 无层 ${st.at.off} @${st.at.x},${st.at.y})  ⇒ 占标题墨色差 ${(100 * st.maxIn / dFg).toFixed(1)}% / 占正文墨色差(-fg-soft) ${(100 * st.maxIn / dSoft).toFixed(1)}%   [全幅 ${(100 * st.maxAll / dSoft).toFixed(1)}%]`);
        await p.close();
      }
    }
    // 首屏（千层纸上）+ 移动端
    for (const [tag, w, h, q, at] of [['hero-deep-dream', 1440, 900, 'zone=deep&face=dream', null], ['hero-deep-wake', 1440, 900, 'zone=deep&face=wake', null], ['mobile-deep-dream', 390, 844, 'zone=deep&face=dream', '#ns-essays'], ['light-dream-container', 1440, 900, 'zone=light&face=dream', '#ns-essays']]) {
      const p = await mk(w, h); await gotoShot(p, q, at);
      // 首屏没有 .container（只有 .hero-ink），用版心列宽对齐的固定 x 区间代替
      const box = await p.evaluate((sel) => {
        const el = document.querySelector(sel + ' .container') || document.querySelector(sel + ' .hero-ink');
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right };
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
      const lum = await blank.evaluate((fgc, softc, bgc) => {
        const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number).slice(0, 3); return /srgb/.test(s) ? m.map((x) => x * 255) : m; };
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        return { dFg: Math.abs(L(parse(fgc)) - L(parse(bgc))), dSoft: Math.abs(L(parse(softc)) - L(parse(bgc))) };
      }, ink.fg, ink.soft, ink.bodyBg);
      console.log(`${tag.padEnd(22)} 区间宽 ${(box.r - box.l) | 0}  最大|ΔL|=${st.maxIn.toFixed(4)} ⇒ 标题墨 ${(100 * st.maxIn / lum.dFg).toFixed(1)}% / 正文墨 ${(100 * st.maxIn / lum.dSoft).toFixed(1)}%  [全幅 ${(100 * st.maxAll / lum.dSoft).toFixed(1)}%]`);
      await p.close();
    }
    await blank.close();
  }

  /* ═══════════ 2 · 长按交互 ═══════════ */
  if (MODE === 'interact' || MODE === 'all') {
    console.log('\n═══ 长按 1300ms→梦 / 2200ms→醒 / 中途松手退回（逐帧读平移与阶跃） ═══');
    const read = (p) => p.evaluate(() => {
      const pan = document.querySelector('.cx-pan');
      const step = document.querySelector('.cx-step');
      const cut = document.querySelector('.cx-cut');
      const tf = getComputedStyle(pan).transform;
      const m = tf.match(/matrix\(([^)]+)\)/);
      const v = m ? m[1].split(',').map(Number) : [0, 0, 0, 0, 0, 0];
      return {
        mix: +getComputedStyle(document.documentElement).getPropertyValue('--reality-mix'),
        still: +(1 - +getComputedStyle(document.documentElement).getPropertyValue('--reality-mix')).toFixed(4),
        panX: +v[4].toFixed(1), panY: +v[5].toFixed(1),
        stepTf: getComputedStyle(step).transform,
        cutOp: +getComputedStyle(cut).opacity,
        st: window.__p15.state(),
      };
    });

    // A · 醒 → 梦（1300ms）
    let p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
    console.log('— A：醒面长按（T_BACK=1300ms）—');
    console.log('t=0        ', JSON.stringify(await read(p)));
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    let prevA = 0;
    for (const t of [200, 400, 650, 900, 1150, 1400]) {
      await sleep(t - prevA); prevA = t;
      const r = await read(p);
      console.log(`t=${String(t).padStart(4)}ms `, JSON.stringify(r));
      if (t === 650) await p.screenshot({ path: path.join(OUT, 'hold-A-650ms-mid.png') });
      if (t === 1150) await p.screenshot({ path: path.join(OUT, 'hold-A-1150ms-late.png') });
    }
    await sleep(600);
    console.log('latch 后   ', JSON.stringify(await read(p)));
    await p.screenshot({ path: path.join(OUT, 'hold-A-latched-dream.png') });
    await p.close();

    // B · 梦 → 醒（2200ms）
    p = await mk(1440, 900);
    await p.evaluateOnNewDocument(() => { try { sessionStorage.setItem('p15-reality', 'dream'); } catch (e) {} });
    await gotoShot(p, 'zone=deep&face=dream', '#ns-essays', 500, false);
    console.log('— B：梦面长按（T_GO=2200ms）—');
    console.log('t=0        ', JSON.stringify(await read(p)));
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    let prev = 0;
    for (const t of [400, 900, 1400, 1900, 2400]) {
      await sleep(t - prev); prev = t;
      console.log(`t=${String(t).padStart(4)}ms `, JSON.stringify(await read(p)));
      if (t === 900) await p.screenshot({ path: path.join(OUT, 'hold-B-900ms-mid.png') });
    }
    console.log('latch 后   ', JSON.stringify(await read(p)));
    await p.close();

    // C · 中途松手退回
    p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
    console.log('— C：按住 600ms 后松手（retract 应回到醒面）—');
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    await sleep(600);
    console.log('hold 600ms ', JSON.stringify(await read(p)));
    await p.screenshot({ path: path.join(OUT, 'hold-C-600ms-then-release.png') });
    await p.evaluate(() => window.__p15.release());
    await sleep(120);
    console.log('release+120', JSON.stringify(await read(p)));
    await sleep(700);
    console.log('release+820', JSON.stringify(await read(p)));
    await p.close();

    // D · 最坏情况：把平移相位钉到周期中点（p≈0.5）再长按，看归位段的速度曲线
    p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays', 500, false);
    await p.evaluate((durs) => {
      document.querySelectorAll('.cx-pan').forEach((el, i) => el.style.setProperty('animation-delay', (-durs[i] / 2) + 's', 'important'));
    }, PAN_DUR);
    await new Promise((r) => setTimeout(r, 300));
    console.log('— D：相位钉在周期中点后长按（归位距离最大的一档）—');
    console.log('t=0        ', JSON.stringify(await read(p)));
    await p.evaluate(() => window.__p15.hold(window.innerWidth * 0.5, window.innerHeight * 0.55));
    let prevD = 0;
    for (const t of [150, 300, 450, 600, 750, 900, 1050, 1200, 1400]) {
      await sleep(t - prevD); prevD = t;
      const r = await read(p);
      console.log(`t=${String(t).padStart(4)}ms `, `mix=${r.mix.toFixed(3)} panX=${String(r.panX).padStart(8)} panY=${String(r.panY).padStart(7)} cutOp=${r.cutOp}`);
      if (t === 600) await p.screenshot({ path: path.join(OUT, 'hold-D-from-halfphase-600ms.png') });
    }
    await p.close();
  }

  /* ═══════════ 3 · 无缝：首尾严格同帧 ═══════════ */
  if (MODE === 'seam' || MODE === 'all') {
    console.log('\n═══ 无缝：钉住 animation-delay 取 t=0 / t=T−0.05s / t=T 三帧 ═══');
    const p = await mk(1440, 900);
    await gotoShot(p, 'zone=deep&face=wake', '#ns-essays');
    const pin = (frac) => p.evaluate((f, durs) => {
      document.querySelectorAll('.cx-pan').forEach((el, i) => {
        el.style.setProperty('animation-delay', (-durs[i] * f) + 's', 'important');
        el.style.setProperty('animation-play-state', 'paused', 'important');
      });
    }, frac, PAN_DUR);
    const shot = async () => { await sleep(160); return p.screenshot({ encoding: 'base64' }); };
    await pin(0); const f0 = await shot();
    await pin(1); const f1 = await shot();
    await pin(1 - 0.05 / 104); const fNear = await shot();   // 最快那档差 0.05s
    await pin(0.5); const fHalf = await shot();
    await pin(0.25); const fQuarter = await shot();
    await pin(0.75); const fThree = await shot();
    const blank = await mk(1440, 900); await blank.setContent('<title>cmp</title>');
    for (const [tag, a, b] of [['t=0  vs t=T（应严格同帧）', f0, f1], ['t=0  vs t=T−50ms（应几乎同帧）', f0, fNear], ['t=0  vs t=T/2（应有位移）', f0, fHalf], ['t=0  vs t=T/4', f0, fQuarter]]) {
      const c = await pngCompare(blank, a, b);
      console.log(`${tag.padEnd(30)} 不同像素 ${String(c.diffPx).padStart(7)}/${c.totalPx} (${(100 * c.diffPx / c.totalPx).toFixed(3)}%)  最大通道差 ${c.maxd}  平均 ${c.mean}  worst@${c.worst}`);
    }
    for (const [n, b] of [['seam-t0.png', f0], ['seam-tT.png', f1], ['seam-tnearT.png', fNear], ['seam-t25.png', fQuarter], ['seam-t50.png', fHalf], ['seam-t75.png', fThree]]) {
      fs.writeFileSync(path.join(OUT, n), Buffer.from(b, 'base64'));
    }
    await blank.close(); await p.close();
  }

  /* ═══════════ 4 · 视口相对 3× 裁片 ═══════════ */
  if (MODE === 'zoom' || MODE === 'all') {
    console.log('\n═══ 视口相对的 3× 裁片（共用脚本 09 是文档坐标，落在首屏） ═══');
    const blank = await mk(1440, 900);
    await blank.setContent('<title>crop</title>');
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900, 3);
      await gotoShot(p, `zone=deep&face=${face}`, '#ns-essays');
      const full = await p.screenshot({ encoding: 'base64' });   // 4320×2700（3×）
      const crop = await blank.evaluate(async (src, cx, cy, cw, ch) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
        const c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(im, cx, cy, cw, ch, 0, 0, cw, ch);
        return c.toDataURL('image/png').split(',')[1];
      }, full, 700 * 3, 380 * 3, 620 * 3, 400 * 3);
      fs.writeFileSync(path.join(OUT, `zoom3x-${face}.png`), Buffer.from(crop, 'base64'));
      console.log(`zoom3x-${face}.png  ${620 * 3}×${400 * 3}（视口 (700,380) 起 620×400 区域的 3× 裁片）`);
      await p.close();
    }
    await blank.close();
  }

  await browser.close();
  server.close();
  console.log('\n' + (errors.length ? 'PROBLEMS:\n  ' + errors.join('\n  ') : 'console errors: none'));
  console.log('out: design/mocks/.shots-p15-d-extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
