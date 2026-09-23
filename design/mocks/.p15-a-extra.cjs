/* ─────────────────────────────────────────────────────────────
   Phase 15-A · 补充证据探针（.shot-p15.cjs 之外的部分）
     【一】醒态 animation 数 / 新增 rAF / 新增 scroll 监听（层 on vs off 同机位对比）
     【二】亮度实测：本层最亮处占相邻正文墨色亮度差的百分比（三段夜色 × 醒/梦）
     【三】长按交互实测：1300ms 入梦 / 2200ms 入醒 / 中途松手退回（逐帧采样）
     【四】3× 最近邻裁片：量线 / 刻度 / 测量站 / 微光尘粒 / 页边标注的 1px 细节
   用法：node design/mocks/.p15-a-extra.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, '.shots-p15-a');
const FILE = 'p15-a-caustics';
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

/* ── PNG 解码（8bit，colortype 6/2）与亮度统计，照抄 p14 的探针口径 ── */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, ct = 6, bd = 8;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('unsupported bit depth ' + bd);
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = raw.subarray(pos, pos + stride); pos += stride;
    const o = y * stride, po = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[o + x - ch] : 0;
      const b = y > 0 ? out[po + x] : 0;
      const c = (x >= ch && y > 0) ? out[po + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[o + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
const sLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * sLin(r) + 0.7152 * sLin(g) + 0.0722 * sLin(b);
const hexLum = (hex) => { const n = parseInt(hex.slice(1), 16); return lum((n >> 16) & 255, (n >> 8) & 255, n & 255); };
function rectStats(img, rect) {
  const { w, ch, data } = img;
  const x0 = Math.max(0, rect.x | 0), y0 = Math.max(0, rect.y | 0);
  const x1 = Math.min(img.w, (rect.x + rect.w) | 0), y1 = Math.min(img.h, (rect.y + rect.h) | 0);
  const hist = new Map();
  let lmax = -1, lmin = 2, pmax = null, pmin = null;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w * ch + x * ch;
      const L = lum(data[i], data[i + 1], data[i + 2]);
      const key = Math.round(L * 400);
      hist.set(key, (hist.get(key) || 0) + 1);
      if (L > lmax) { lmax = L; pmax = [x, y, data[i], data[i + 1], data[i + 2]]; }
      if (L < lmin) { lmin = L; pmin = [x, y, data[i], data[i + 1], data[i + 2]]; }
    }
  }
  let modeKey = 0, modeN = -1;
  for (const [k, n] of hist) if (n > modeN) { modeN = n; modeKey = k; }
  return { base: modeKey / 400, lmax, lmin, pmax, pmin, n: (x1 - x0) * (y1 - y0) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 版心列（.container 42rem 居中）：1440 视口下 x 384…1056；只测这一带 ⇒ 红线的口径 */
const COL = { x: 385, y: 70, w: 670, h: 760 };
const INK = { x: 470, y: 150, w: 500, h: 620 };   /* 正文列所在，读回真实墨色亮度 */

(async () => {
  const server = await serve();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/design/mocks/${FILE}.html`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-p15-shots')}`],
  });
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => problems.push('reqfail: ' + r.url() + ' · ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    window.__rafN = 0; window.__scrollN = 0; window.__rafCbN = 0;
    const r = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__rafN++; return r(cb); };
    const ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (t, ...rest) {
      if (t === 'scroll') window.__scrollN++;
      return ael.call(this, t, ...rest);
    };
  });

  const go = async (q, at) => {
    await page.goto(`${base}?ui=0&${q}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(600);
    if (at) {
      await page.evaluate((sel) => { const e = document.querySelector(sel); window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 70, behavior: 'instant' }); }, at);
      await sleep(700);
    }
  };
  const shot = async (name, clip) => { await page.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }); };
  const capBuf = async () => Buffer.from(await page.screenshot({ encoding: 'base64' }), 'base64');
  const layerOff = () => page.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'off'; });
  const layerOn = () => page.evaluate(() => { document.getElementById('p15-bg').dataset.layer = 'through'; });
  const anims = () => page.evaluate(() => {
    const bg = document.getElementById('p15-bg');
    const all = document.getAnimations().map((a) => ({ n: a.animationName, t: a.effect && a.effect.target, pe: a.effect && a.effect.pseudoElement }));
    const mine = all.filter((a) => a.t && bg.contains(a.t));
    const rest = all.filter((a) => !(a.t && bg.contains(a.t)));
    return {
      total: all.length, layer: mine.length, shell: rest.length,
      mineList: mine.map((a) => (a.pe || '') + (a.t.className || a.t.tagName) + '/' + a.n),
      shellList: rest.map((a) => (a.pe || '') + (a.t.className || a.t.tagName) + '/' + a.n),
    };
  });

  /* ═══ 一 · 醒态 animation / rAF / 监听 ═══ */
  console.log('【一 · 醒态 animation 数 · 新增 rAF / scroll 监听】(无 freeze，真实运行态；计数含 ::before)');
  for (const face of ['wake', 'dream']) {
    await go(`zone=deep&face=${face}`);
    const a = await anims();
    console.log(`  ${face.padEnd(5)} 全场 animation=${a.total}  其中本层=${a.layer}  外壳=${a.shell}`);
    console.log(`        本层：${a.mineList.join(', ') || '（无）'}`);
    if (face === 'wake') console.log(`        外壳：${a.shellList.join(', ')}`);
  }
  for (const on of ['through', 'off']) {
    await go(`zone=deep&face=dream&bg=${on === 'through' ? 'through' : 'off'}`);
    await page.evaluate(() => { window.__rafN = 0; window.__scrollN = 0; });
    await sleep(2000);
    const c = await page.evaluate(() => ({ raf: window.__rafN, scroll: window.__scrollN }));
    console.log(`  本层 ${on.padEnd(7)} → 2s 内 requestAnimationFrame 调用 ${c.raf} 次（≈30fps 稳态）、scroll 监听注册 ${c.scroll} 个`);
  }

  /* ═══ 二 · 亮度实测 ═══
     尘粒/光斑是呼吸的：?freeze=1 停在 0%（最暗档）。所以梦态额外再测一次
     「呼吸峰值」——用后加的 !important 样式把两条 ::before 的 delay 钉到半个周期
     （后加入的同权重 !important 覆盖 freeze 规则），取两帧的较大值。 */
  console.log('\n【二 · 本层最亮处占相邻正文墨色亮度差的百分比（版心列内，冻结动画 on/off 逐像素）】');
  const INKC = { deep: '#e5e0d2', light: '#262c33', paper: '#55503f' };
  const diffMax = (a, b, rect) => {
    let m = 0, peak = null, n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = y * a.w * a.ch + x * a.ch;
        const dd = Math.abs(lum(a.data[i], a.data[i + 1], a.data[i + 2]) - lum(b.data[i], b.data[i + 1], b.data[i + 2]));
        if (dd > 0.012) n++;
        if (dd > m) { m = dd; peak = [x, y, b.data[i], b.data[i + 1], b.data[i + 2], a.data[i], a.data[i + 1], a.data[i + 2]]; }
      }
    }
    return { m, peak, n };
  };
  for (const zone of ['light', 'deep', 'paper']) {
    for (const face of ['wake', 'dream']) {
      await go(`zone=${zone}&face=${face}&freeze=1`, '#ns-essays');
      const shot0 = decodePNG(await capBuf());
      let peak2 = null;
      if (face === 'dream') {
        await page.addStyleTag({ content: '.freeze .p15-dust::before,.freeze .p15-glow::before{animation-delay:-1.5s !important}' });
        await sleep(240);
        peak2 = decodePNG(await capBuf());
      }
      await layerOff(); await sleep(300);
      const off = decodePNG(await capBuf());
      await layerOn();
      const sOff = rectStats(off, COL), sInk = rectStats(off, INK);
      const inkL = zone === 'deep' ? sInk.lmax : sInk.lmin;
      const denom = Math.abs(inkL - sOff.base);
      const d0 = diffMax(shot0, off, COL);
      const d1 = peak2 ? diffMax(peak2, off, COL) : null;
      const worst = d1 && d1.m > d0.m ? d1 : d0;
      const gr = { zone, face, base: +sOff.base.toFixed(4), inkL: +inkL.toFixed(4), inkTokenL: +hexLum(INKC[zone]).toFixed(4) };
      const f1 = (v) => +v.toFixed(4);
      console.log(`  ${zone.padEnd(6)} ${face.padEnd(5)} 底色L=${gr.base} 墨色L=${gr.inkL}(token ${gr.inkTokenL})`
        + ` 冻结帧 ΔL=${f1(d0.m)}→${(d0.m / denom * 100).toFixed(1)}%`
        + (d1 ? ` ｜ 呼吸峰值 ΔL=${f1(d1.m)}→${(d1.m / denom * 100).toFixed(1)}%  最坏 ${(worst.m / denom * 100).toFixed(1)}%` : '')
        + ` ｜ 差异像素 ${worst.n} ｜ 最坏峰位 ${worst.peak ? worst.peak.slice(0, 2).join(',') : '-'}`
        + `（off 底色 rgb ${worst.peak ? worst.peak.slice(2, 5).join(',') : ''} → on rgb ${worst.peak ? worst.peak.slice(5, 8).join(',') : ''}）`);
    }
  }

  /* ═══ 三 · 长按交互 ═══
     注意（外壳固有行为，四稿同）：指针路径里 latch() 之后 src 不再复位，所以一次
     latch 之后同一页面上的真实 pointerdown 会被 `if (src !== null) return` 吞掉。
     因此每个真实长按都用新载的页面；同一页面内的重复长按改走 window.__p15.hold()。 */
  console.log('\n【三 · 长按交互（真实指针事件 @ 右侧页边空白 1240,760；每段新载页面）】');
  const readAll = () => page.evaluate(() => {
    const bg = document.getElementById('p15-bg');
    const cs = (s) => getComputedStyle(bg.querySelector(s));
    return {
      s: window.__p15.state(),
      field: cs('.p15-field').opacity + ' / ' + cs('.p15-field').transform,
      dust: cs('.p15-dust').opacity,
      glow: cs('.p15-glow').opacity,
      stRot: cs('.p15-s .p15-sr').transform,
      dur: cs('.p15-vg').animationDuration,
      amber: document.documentElement.style.getPropertyValue('--amber'),
    };
  });
  const trace = async (ms, gap) => {
    const t0 = Date.now(); const out = [];
    while (Date.now() - t0 < ms) { const r = await readAll(); out.push(`    t=${String(Date.now() - t0).padStart(4)}ms  mix=${r.s.mix.toFixed(3)}  mode=${r.s.mode.padEnd(7)} p=${r.s.progress}  场 opacity=${r.field.split(' / ')[0]}  尘=${r.dust}  尘周期=${r.dur}`); await sleep(gap); }
    return out;
  };
  const realHold = async (q, ms, tag) => {
    await go(q);
    await page.mouse.move(1240, 760);
    await page.mouse.down();
    const tr = await trace(ms, 240);
    console.log(`  ${tag}`);
    console.log(tr.filter((_, i) => i % 2 === 0 || i === tr.length - 1).join('\n'));
    await page.mouse.up();
    await sleep(900);
    const e = await readAll();
    console.log(`    → 松手后：face=${e.s.face} mix=${e.s.mix} | 场 opacity/transform=${e.field} | 尘 opacity=${e.dust} | 站旋转=${e.stRot} | amber=${e.amber}`);
    return e;
  };
  await realHold('zone=deep&face=wake', 1500, '① 醒面真实长按 1500ms → 应在 1300ms 处入梦（T_BACK）');
  await realHold('zone=deep&face=dream', 2400, '② 梦面真实长按 2400ms → 应在 2200ms 处入醒（T_GO）');
  await realHold('zone=deep&face=wake', 900, '③ 醒面真实长按 900ms（不足 1300ms）后放开 → 应退回醒面');
  await realHold('zone=deep&face=dream', 1200, '④ 梦面真实长按 1200ms（不足 2200ms）后放开 → 应退回梦面');
  console.log('  ⑤ 同一页面内重复长按（走 window.__p15.hold()/release()，绕开外壳的 src 闩锁）');
  await go('zone=deep&face=wake');
  for (const [ms, tag] of [[1500, 'hold→梦'], [2400, 'hold→醒']]) {
    await page.evaluate(() => window.__p15.hold());
    const tr = await trace(ms, 300);
    await page.evaluate(() => window.__p15.release());
    await sleep(900);
    const e = await readAll();
    console.log(`    ${tag}：${tr.map((l) => l.trim().split('  ')[0] + ' ' + l.trim().split('  ')[1]).join(' | ')} → 落定 face=${e.s.face}`);
  }
  console.log('  ⑥ 逐帧审视：直接把 mix 钉在 0.25 / 0.5 / 0.75（过渡必须是可信中间态，不是两种图案叠加）');
  for (const m of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((v) => window.__p15.setMix(v), m);
    await sleep(200);
    const r = await readAll();
    console.log(`    mix=${m} → 场 opacity=${r.field.split(' / ')[0]} transform=${r.field.split(' / ')[1]} 尘=${r.dust} 场周期=${r.dur} 站旋转=${r.stRot} amber=${r.amber}`);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('--reality-mix'));

  /* ═══ 四 · prefers-reduced-motion：恒醒面 + 零动画 ═══ */
  console.log('\n【三-b · prefers-reduced-motion（外壳已停状态机，本层动效也必须跟着停）】');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  for (const q of ['zone=deep&reduced=1', 'zone=light&reduced=1&face=dream']) {
    await go(q);
    const a = await anims();
    const v = await page.evaluate(() => {
      const bg = document.getElementById('p15-bg');
      const cs = (s) => getComputedStyle(bg.querySelector(s));
      return { field: cs('.p15-field').opacity + ' / ' + cs('.p15-field').transform, dust: cs('.p15-dust').opacity, dur: cs('.p15-vg').animationDuration, state: window.__p15.state() };
    });
    console.log(`  ${q.padEnd(28)} 本层 animation=${a.layer} 全场=${a.total} | 场 ${v.field} | 尘 ${v.dust} | 场周期 ${v.dur} | state=${JSON.stringify(v.state)}`);
  }
  await page.emulateMediaFeatures([]);

  /* ═══ 五 · 3× 裁片（本层细节；共用脚本的 09 是页面坐标裁片、落在首屏，看不到本层） ═══ */
  console.log('\n【四 · 3× 最近邻裁片】');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 3 });
  for (const [zone, face] of [['deep', 'wake'], ['deep', 'dream'], ['light', 'wake'], ['light', 'dream']]) {
    await go(`zone=${zone}&face=${face}&freeze=1`);
    await shot(`x-z3-${zone}-${face}`, { x: 300, y: 236, width: 280, height: 200 });
  }
  for (const face of ['wake', 'dream']) {
    await go(`zone=deep&face=${face}&freeze=1`);
    await shot(`x-z3-right-deep-${face}`, { x: 1060, y: 250, width: 190, height: 390 });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('\n' + (problems.length ? 'PROBLEMS:\n  ' + [...new Set(problems)].join('\n  ') : 'problems: none'));
  await browser.close();
  server.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
