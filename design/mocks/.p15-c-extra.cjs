/* ─────────────────────────────────────────────────────────────────────────
   P15-C · 磨砂晶面与光折 · 自验脚本（自带静态服务器，照抄 .shot-p15.cjs 的 serve()）

   跑：node design/mocks/.p15-c-extra.cjs
   出：design/mocks/.shots-p15-c/extra/*.png  ＋  stdout 上的实测数字

   五件事：
     ① 版心内最亮处 / 相邻正文墨色亮度差（三 zone，逐像素差 = 本层新增量）
     ② 光折段与真实缝线的对齐：同角 + 垂直平移量（含 3× 裁片）
     ③ 长按交互：1300ms 到梦 / 2200ms 到醒 / 中途松手退回 + 擦干净过程截图
     ④ 醒态 animation 数、新增 rAF 与监听数（与 p15-shell.html 对照）
     ⑤ backdrop-filter A/B：8× 降速 + rAF 滚动 5s 的帧数（仅对照，交付态不用它）
   ───────────────────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'p15-c-prisms';
const SHELL = 'p15-shell';
const OUT = path.join(__dirname, '.shots-p15-c', 'extra');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png' };
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

/* ── 最小 PNG 解码（只吃 Chrome 出的 8bit RGB/RGBA、非隔行） ── */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 6; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4;
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++]; const line = raw.slice(pos, pos + stride); pos += stride;
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0, x = line[i];
      let v;
      switch (f) {
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: v = x;
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}
/* 亮度口径与 p14-c 一致：sRGB 直接加权（不做线性化），便于跨轮对照 */
const L = (img, x, y) => { const i = (y * img.w + x) * img.ch; return (0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]) / 255; };

/* ── 逐像素差统计：on − off（＝本层新增量），返回最大值/均值/位置 ── */
function diffStats(off, on, x0, x1) {
  let max = 0, at = null, sum = 0, n = 0;
  for (let y = 0; y < off.h; y++) for (let x = x0; x < x1; x++) {
    const d = Math.abs(L(on, x, y) - L(off, x, y));
    if (d > max) { max = d; at = [x, y]; }
    sum += d; n++;
  }
  return { max, at, mean: sum / n };
}
/* ── 墨色差：取「无本层」那张图，版心区内的 0.5% 与 99.5% 分位 ── */
function inkRange(img, x0, x1, y0, y1) {
  const v = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(L(img, x, y));
  v.sort((a, b) => a - b);
  const lo = v[Math.floor(v.length * 0.005)], hi = v[Math.floor(v.length * 0.995)];
  return { lo, hi, span: Math.abs(hi - lo) };
}

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = (f) => `http://127.0.0.1:${port}/design/mocks/${f}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15-shots')}`],
  });
  const shot = async (page, name) => { const b = await page.screenshot({ path: path.join(OUT, name + '.png') }); return decodePNG(b); };
  const open = async (url, w = 1440, h = 900, dsf = 1) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('  ! pageerror', e.message));
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(600);
    return page;
  };
  const scrollTo = async (page, sel, off = 70) => {
    await page.evaluate((s, o) => { const el = document.querySelector(s); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'instant' }); }, sel, off);
    await sleep(700);
  };

  const VC = { l: 384, r: 1056 };   // 1440 宽下的版心左右缘（.container 42rem 居中）

  /* ═════ ① 版心内最亮处 / 墨色差（三 zone） ═════ */
  console.log('① 版心内最亮处 / 相邻正文墨色亮度差（1440×900，?freeze=1，滚到 #ns-essays）');
  for (const zone of ['deep', 'light', 'paper']) {
    for (const face of ['wake', 'dream']) {
      const q = (bg) => `${base(FILE)}?ui=0&freeze=1&zone=${zone}&face=${face}${bg ? '&bg=off' : ''}`;
      const p1 = await open(q(true)); await scrollTo(p1, '#ns-essays');
      const off = await shot(p1, `m-${zone}-${face}-off`); await p1.close();
      const p2 = await open(q(false)); await scrollTo(p2, '#ns-essays');
      const on = await shot(p2, `m-${zone}-${face}-on`); await p2.close();
      const ink = inkRange(off, VC.l, VC.r, 0, off.h);
      const inC = diffStats(off, on, VC.l, VC.r);
      const all = diffStats(off, on, 0, off.w);
      const pct = (d) => (100 * d / ink.span).toFixed(1) + '%';
      console.log(`  ${zone}/${face}: 墨色亮度 ${ink.lo.toFixed(3)}–${ink.hi.toFixed(3)} (ΔL=${ink.span.toFixed(3)}) | ` +
        `版心内 max ${inC.max.toFixed(4)} @${inC.at} = ${pct(inC.max)} 平均 ${pct(inC.mean)} | ` +
        `全幅 max ${all.max.toFixed(4)} @${all.at} = ${pct(all.max)}`);
    }
  }

  /* ═════ ② 光折段 ↔ 真实缝线：同角 + 垂直平移量 ═════ */
  console.log('\n② 光折段与真实缝线（?zone=deep&face=dream，甲左缘 x≈1070 一带，无正文）');
  {
    const page = await open(`${base(FILE)}?ui=0&freeze=1&zone=deep&face=dream`);
    await scrollTo(page, '#ns-essays');
    const img = await shot(page, 'align-full');
    /* 逐列找「最亮峰」（缝线）与「次亮峰」（光折段） */
    const peaks = (x, y0, y1) => {
      const v = []; for (let y = y0; y <= y1; y++) v.push(L(img, x, y));
      const base = Math.min(...v);
      const cands = [];
      for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1] && v[i] - base > 0.02) cands.push({ y: y0 + i, v: v[i] });
      cands.sort((a, b) => b.v - a.v);
      const keep = [];
      for (const c of cands) if (keep.every((k) => Math.abs(k.y - c.y) > 2)) keep.push(c);
      return keep;
    };
    const fit = (pts) => {   // 最小二乘 y = a x + b
      const n = pts.length; const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
      const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
      const a = (n * sxy - sx * sy) / (n * sxx - sx * sx); return { a, b: (sy - a * sx) / n };
    };
    const seamPts = [], rayPts = [], gap = [];
    for (let x = 1292; x <= 1436; x++) {          // 甲内部、乙之外（避开重叠区那条 p-div），且无正文
      const pk = peaks(x, 560, 690);
      if (pk.length < 2) continue;
      /* 约束：折射段是缝线的平移副本，只取距缝线 4–14px 的那个峰 */
      const cand = pk.slice(1).filter((p) => p.y - pk[0].y >= 4 && p.y - pk[0].y <= 14);
      if (!cand.length) continue;
      seamPts.push({ x, y: pk[0].y }); rayPts.push({ x, y: cand[0].y });
      gap.push(cand[0].y - pk[0].y);
      if (x === 1300 || x === 1360 || x === 1430) console.log(`   x=${x} 峰: ${pk.slice(0, 4).map((p) => p.y + '@' + p.v.toFixed(3)).join(' / ')} → 取 ${cand[0].y}`);
    }
    /* 诊断：沿缝线在不同 x 处取一个跟随窗口，列出亮度峰。用来证明
       ① 真实缝线在整幅连续（含晶面内部）② 光折段只出现在晶面内部（乙 264–1288 / 甲 >1062） */
    console.log('   沿缝线的峰（窗口跟随 y=50vh+(x-50vw)·tan14，±26px）:');
    for (const x of [120, 220, 300, 420, 620, 900, 1040, 1100, 1240, 1270, 1310]) {
      const yc = Math.round(450 + (x - 720) * 0.249328);
      const pk = peaks(x, yc - 26, yc + 26);
      const inside = (x > 264 && x < 1288 ? '乙内' : '乙外') + (x > 1062 ? '·甲内' : '');
      console.log(`    x=${x} (${inside}) 峰: ${pk.slice(0, 3).map((p) => (p.y - yc >= 0 ? '+' : '') + (p.y - yc) + '@' + p.v.toFixed(3)).join(' / ') || '（无）'}`);
    }
    const plain = [];                              // 左栏纯底色上的缝线（乙左缘 x≈264 之外）
    for (let x = 12; x <= 248; x++) { const pk = peaks(x, 250, 355); if (pk.length) plain.push({ x, y: pk[0].y }); }
    const sFit = fit(seamPts), rFit = fit(rayPts), pFit = fit(plain);
    const deg = (d) => (d * 180 / Math.PI).toFixed(3);
    const dy = gap.reduce((s, d) => s + d, 0) / gap.length;
    const dySd = Math.sqrt(gap.reduce((s, d) => s + (d - dy) ** 2, 0) / gap.length);
    console.log(`  缝线斜率（甲内 ${sFit.a.toFixed(4)}；左栏纯底 ${pFit.a.toFixed(4)}；理论 tan14° 0.2493）→ 角度差 ${deg(Math.abs(Math.atan(sFit.a) - Math.atan(pFit.a)))}°`);
    console.log(`  光折段斜率 ${rFit.a.toFixed(4)}（${deg(Math.atan(rFit.a))}°）｜与缝线夹角 ${deg(Math.abs(Math.atan(sFit.a) - Math.atan(rFit.a)))}°`);
    console.log(`  垂直间距 ${dy.toFixed(2)}px（sd ${dySd.toFixed(2)}，n=${gap.length}）→ 沿法线位移 ${(dy * Math.cos(14 * Math.PI / 180)).toFixed(2)}px（设计值 --pd: 9px）`);

    /* 裁片：3× 几何细节 + 两处「缝线进玻璃」折点（醒/梦各一组） */
    const crops = [
      ['crop-corner-a-wake', 1020, 10, 150, 130, 'wake'],
      ['crop-corner-a-dream', 1020, 10, 150, 130, 'dream'],
      ['crop-cross-overlap-wake', 1010, 268, 190, 130, 'wake'],
      ['crop-cross-overlap-dream', 1010, 268, 190, 130, 'dream'],
      ['crop-jog-A-dream', 985, 487, 190, 110, 'dream'],   // 甲左缘交点（缝线从版心一侧过来）
      ['crop-jog-B-dream', 196, 296, 190, 110, 'dream'],   // 乙左缘交点（左栏，全空背景）
      ['crop-jog-B-wake', 196, 296, 190, 110, 'wake'],
    ];
    /* 6× 细看两处阶跃（缝线 / 脑电 / 光折段 / 阶跃记 四条线的关系） */
    const crops6 = [
      ['crop-jog-B-6x', 232, 318, 120, 64, 'dream'],
      ['crop-jog-A-6x', 1030, 512, 120, 64, 'dream'],
      ['crop-jog-B-6x-wake', 232, 318, 120, 64, 'wake'],
    ];
    await page.close();
    /* 裁片一律不滚动：本层是 fixed 的，几何与滚动位置无关；不滚动则 clip 的文档坐标
       ＝视口坐标，取景精确（否则要补 scrollY，且 beyond-viewport 截图还会有几像素漂移） */
    for (const [name, x, y, w, h, face, dsf] of crops.concat(crops6.map((c) => [...c, 6]))) {
      const p = await open(`${base(FILE)}?ui=0&freeze=1&zone=deep&face=${face}`, 1440, 900, dsf || 3);
      await p.screenshot({ path: path.join(OUT, name + '.png'), clip: { x, y, width: w, height: h } });
      await p.close();
      console.log(`   出 ${name}.png（${dsf || 3}×，视口 ${x},${y} ${w}×${h}）`);
    }
  }

  /* ═════ ③ 长按交互 ═════
     注：外壳（p15-shell.html）的 latch() 没有像线上 src/scripts/reality.ts:396 那样
     复位 src，因此闩锁过再按一次会被 `if (src !== null) return` 吃掉（外壳的转录疏漏，
     不属于本层）。所以每一次按压都在新页面上做，全程用真实指针事件。 */
  console.log('\n③ 长按交互（真实指针事件；每次按压新开一页）');
  {
    const down = (page, x, y) => page.evaluate((x, y) => { const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }; document.dispatchEvent(new PointerEvent('pointerdown', o)); }, x, y);
    const up = (page, x, y) => page.evaluate((x, y) => { const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }; document.dispatchEvent(new PointerEvent('pointerup', o)); }, x, y);

    const run = async (face, plan, tag) => {
      const page = await open(`${base(FILE)}?ui=0&zone=deep&face=${face}`);
      await scrollTo(page, '#ns-essays');
      const out = [];
      const st = () => page.evaluate(() => window.__p15.state());
      const now = () => page.evaluate(() => Math.round(performance.now()));
      if (plan.release) {
        const t0 = await now();
        await down(page, 1150, 700); await sleep(plan.hold);
        out.push([`按住 ${plan.hold}ms（实测 ${(await now()) - t0}ms）`, await st()]);
        await page.screenshot({ path: path.join(OUT, `${tag}-hold${plan.hold}.png`) });
        await up(page, 1150, 700);
        const tr = await now();
        let prev = 0;
        for (const t of plan.after) { await sleep(t - prev); prev = t; out.push([`松手 ${(await now()) - tr}ms`, await st()]); }
      } else {
        const t0 = await now();
        await down(page, 1150, 700);
        let prev = 0;
        for (const t of plan.at) {
          await sleep(Math.max(0, t - prev - 260)); prev = t;   // 260ms ≈ 一次截图的开销
          const el = (await now()) - t0;
          out.push([`按住 ≈${el}ms`, await st()]);
          await page.screenshot({ path: path.join(OUT, `${tag}-${t}ms.png`) });
        }
        await up(page, 1150, 700); await sleep(700);
        out.push([`松手 +700ms`, await st()]);
      }
      console.log(`  [${tag}] 起始 face=${face}`);
      for (const [k, s] of out) console.log(`    ${k}: mix=${s.mix} face=${s.face} mode=${s.mode} progress=${s.progress}`);
      await page.close();
    };
    await run('wake', { at: [300, 600, 900, 1200, 1500] }, 'hold-A-wake-to-dream');   // T_BACK = 1300ms
    await run('dream', { at: [500, 1100, 1700, 2100, 2400] }, 'hold-B-dream-to-wake'); // T_GO = 2200ms
    await run('dream', { hold: 800, release: true, after: [[100], [1100]] }, 'hold-C-release-in-middle');
  }

  /* ═════ ④ 醒态 animation 数 / 新增 rAF 与监听数 ═════ */
  console.log('\n④ 动画与 JS 开销（本层 vs 外壳）');
  {
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
      await page.goto(`${base(file)}?ui=0&zone=deep&face=wake`, { waitUntil: 'networkidle0' });
      await sleep(2500);
      const r = await page.evaluate(() => {
        const mine = [];
        for (const el of document.querySelectorAll('#p15-bg, #p15-bg *')) {
          const a = getComputedStyle(el).animationName;
          if (a && a !== 'none') mine.push(el.className + ':' + a);
        }
        const all = [];
        for (const el of document.querySelectorAll('*')) {
          const a = getComputedStyle(el).animationName;
          if (a && a !== 'none') all.push(el.className + ':' + a);
        }
        return { j: window.__j, mine, all, n: document.querySelectorAll('#p15-bg *').length };
      });
      await page.close();
      return r;
    };
    const shell = await probe(SHELL), mine = await probe(FILE);
    const sites = (o) => Object.keys(o).length;
    console.log(`  #p15-bg 内元素 ${mine.n}｜醒态 animation 数 = ${mine.mine.length}${mine.mine.length ? '：' + mine.mine.join(',') : ''}`);
    console.log(`  全页 animation 数（外壳自带）：外壳 ${shell.all.length} ↔ 本稿 ${mine.all.length}`);
    console.log(`  2.5s 内 rAF 调用：外壳 ${shell.j.raf} @${sites(shell.j.rafSites)} 个调用点 ↔ 本稿 ${mine.j.raf} @${sites(mine.j.rafSites)} 个`);
    console.log(`  监听注册：外壳 ${shell.j.lis} @${sites(shell.j.lisSites)} 个调用点 ↔ 本稿 ${mine.j.lis} @${sites(mine.j.lisSites)} 个`);
  }

  /* ═════ ⑤ backdrop-filter A/B（仅对照） ═════ */
  console.log('\n⑤ backdrop-filter A/B（8× CPU 降速 + 页内 rAF 滚动 5s，各两趟）');
  {
    const run = async (bf) => {
      const page = await browser.newPage();
      const client = await page.createCDPSession();
      await client.send('Emulation.setCPUThrottlingRate', { rate: 8 });
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.goto(`${base(FILE)}?ui=0&zone=deep&face=dream`, { waitUntil: 'networkidle0' });
      if (bf) {
        /* 一块与本层几何同尺寸、不参与任何 transform / animation 的静态面板，
           加 backdrop-filter；对照的是「同一块磨砂体换成真 backdrop-filter 的代价」 */
        await page.evaluate(() => {
          const d = document.createElement('div');
          d.id = 'bf-probe';
          const g = document.querySelector('.p-b').getBoundingClientRect();
          d.style.cssText = `position:absolute;left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;` +
            'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:color-mix(in srgb, var(--ghost-ink) 8%, transparent)';
          document.getElementById('p15-bg').appendChild(d);
        });
      }
      const r = await page.evaluate(async () => {
        const t = []; const t0 = performance.now();
        await new Promise((res) => {
          let y = 0, last = performance.now();
          (function loop(ts) {
            t.push(ts - last); last = ts;
            y += 2.2; window.scrollTo(0, y);
            if (ts - t0 > 5000) return res();
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
    for (const [label, bf] of [['A 无 backdrop-filter', false], ['B 静态面板＋backdrop-filter(8px)', true]]) {
      const a = await run(bf), b = await run(bf);
      console.log(`  ${label}: 帧 ${a.frames}/${b.frames}｜p50 ${a.p50.toFixed(0)}/${b.p50.toFixed(0)}ms｜p95 ${a.p95.toFixed(0)}/${b.p95.toFixed(0)}ms｜max ${a.max.toFixed(0)}/${b.max.toFixed(0)}ms`);
    }
  }

  await browser.close();
  server.close();
  console.log('\nout: design/mocks/.shots-p15-c/extra/');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
