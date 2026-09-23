// p14-a 截图与自验收
//   1) 截图矩阵（桌面 1440×900 / 移动 390×844，deviceScaleFactor 1）
//   2) 实测：本层最亮处占「相邻正文墨色 vs 底色」差值的百分比（PNG 像素解码）
//   3) 实测：8× CPU 降速下滚动 5 秒的 p95 与最长帧（有层 / 无层）
// 独占 CDP 端口 9801；静态服务器 8191（root = 仓库根）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8191/design/mocks/p14-a-lattice.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p14-a';
const PORT = 9801;
const MODE = process.argv[2] || 'all';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
});

/* ── PNG 解码（8bit，colortype 6/2），用于像素级亮度实测 ── */
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
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4;
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
const sLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * sLin(r) + 0.7152 * sLin(g) + 0.0722 * sLin(b);
function hexLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return lum((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
/** 在 rect 内取亮度分布：模态（底色）、最大/最小、以及相对指定亮度差最大的像素 */
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome'),
    '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some(t => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __exc: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };

  async function load(q, vw, vh, mobile, rm) {
    await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: !!mobile });
    await send('Emulation.setEmulatedMedia', { features: rm ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
    await send('Page.navigate', { url: BASE + '?' + q });
    await sleep(2800); // 等字体 + 启动扫频落定
  }
  async function at(section, off) {
    // 真站点 html 带 scroll-behavior:smooth —— 截图必须用 instant，否则抓在半途
    await ev(`(()=>{const e=document.getElementById('${section}');window.scrollTo({top:Math.max(0,e.offsetTop-${off}),behavior:'instant'});return Math.round(scrollY);})()`);
    await sleep(420);
    return await ev('Math.round(scrollY)');
  }
  async function cap(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.result.data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    return buf;
  }
  async function shot(s) {
    await load(s.q, s.vw || 1440, s.vh || 900, s.mobile, s.rm);
    if (s.at) await at(s.at[0], s.at[1]);
    if (s.prep) { await ev(s.prep); await sleep(s.after || 200); }
    const buf = await cap(s.n);
    const st = await ev('JSON.stringify(window.__p14.state())');
    const info = st ? JSON.parse(st) : {};
    console.log('  ' + s.n.padEnd(26), (buf.length / 1024).toFixed(0) + 'KB', JSON.stringify(info));
    return buf;
  }

  /* ═══ 一 · 截图矩阵 ═══ */
  console.log('\n【一 · 截图矩阵】');
  const CH = '&chrome=0';
  await shot({ n: '01-deep-hero-dream', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=on' + CH });
  await shot({ n: '02-deep-hero-wake', q: 'zone=deep&face=wake&lat=edge&layer=below&bg=on' + CH });
  await shot({ n: '03-deep-content-dream', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  await shot({ n: '04-deep-content-wake', q: 'zone=deep&face=wake&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  await shot({ n: '05-paper-dream', q: 'zone=paper&face=dream&lat=edge&layer=below&bg=on' + CH, at: ['ns-dawn', 60] });
  await shot({ n: '06-light-wake', q: 'zone=light&face=wake&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  await shot({ n: '07-mobile390-dream', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=on' + CH, vw: 390, vh: 844, mobile: true, at: ['ns-prose', 20] });
  await shot({ n: '08-rm-wake', q: 'zone=deep&lat=edge&layer=below&bg=on' + CH, rm: true, at: ['ns-prose', 40] });
  await shot({ n: '09-baseline-off', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=off' + CH, at: ['ns-prose', 40] });
  await shot({ n: '10-hero-through', q: 'zone=deep&face=dream&lat=edge&layer=through&bg=on' + CH });
  await shot({ n: '11-lat-full', q: 'zone=deep&face=dream&lat=full&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  // 便于自查的补充机位
  await shot({ n: '12-lat-full-hero', q: 'zone=deep&face=dream&lat=full&layer=through&bg=on' + CH });
  await shot({ n: '13-hero-through-wake', q: 'zone=deep&face=wake&lat=edge&layer=through&bg=on' + CH });
  await shot({ n: '14-paper-content-wake', q: 'zone=paper&face=wake&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  await shot({ n: '15-light-dream', q: 'zone=light&face=dream&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40] });
  await shot({ n: '16-hold-mid-1200ms', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=on' + CH, at: ['ns-prose', 40], prep: '__p14.holdAt(1200, 1150, 640)' });
  await shot({ n: '17-deep-essays-dream', q: 'zone=deep&face=dream&lat=edge&layer=below&bg=on' + CH, at: ['ns-essays', 20] });

  /* ═══ 二 · 亮度实测：本层最亮处占相邻正文墨色的百分比 ═══ */
  // 探针区选在「只有底色 + 本层刻度」的空白带；同机位跑 bg=on / bg=off，
  // 两跑均以 ?freeze=1 冻结 CSS 动画 → 逐像素可比。
  console.log('\n【二 · 亮度实测（冻结动画，同机位 on/off 逐像素对比）】');
  const INK = { deep: '#e5e0d2', light: '#262c33', paper: '#55503f' };
  const BG = { deep: '#171b24', light: '#e9ecef', paper: '#efe9dd' };
  const RECT = { x: 1020, y: 110, w: 380, h: 360 };   // y 110–470；缝线在 y≥524
  const CASES = [
    { name: 'deep-content-edge', q: 'zone=deep&face=dream&lat=edge&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'deep' },
    { name: 'deep-content-edge-wake', q: 'zone=deep&face=wake&lat=edge&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'deep' },
    { name: 'deep-content-full', q: 'zone=deep&face=dream&lat=full&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'deep' },
    { name: 'light-content-edge', q: 'zone=light&face=dream&lat=edge&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'light', keep: 1 },
    { name: 'paper-content-edge', q: 'zone=paper&face=dream&lat=edge&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'paper', keep: 1 },
    { name: 'light-content-full', q: 'zone=light&face=dream&lat=full&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'light' },
    { name: 'paper-content-full', q: 'zone=paper&face=dream&lat=full&layer=below', at: ['ns-prose', 40], rect: RECT, zone: 'paper' },
    { name: 'deep-hero-through', q: 'zone=deep&face=dream&lat=edge&layer=through', at: ['ns-hero', 0], rect: { x: 1150, y: 60, w: 270, h: 240 }, zone: 'deep' },
  ];
  // 正文墨色的实测区（.prose 正文列所在），按该段的极值像素读回真实墨色亮度
  const INK_RECT = { x: 470, y: 150, w: 500, h: 620 };
  const measured = [];
  for (const c of CASES) {
    await load(c.q + '&freeze=1&chrome=0', 1440, 900, false, false);
    if (c.at) await at(c.at[0], c.at[1]);
    const y0 = await ev('Math.round(scrollY)');
    const on = decodePNG(await cap('.tmp-on'));
    await ev("document.documentElement.dataset.bg='off'");
    await sleep(260);
    const y1 = await ev('Math.round(scrollY)');
    const off = decodePNG(await cap('.tmp-off'));
    await ev("document.documentElement.dataset.bg='on'");
    const sOn = rectStats(on, c.rect), sOff = rectStats(off, c.rect);
    // 墨色：token 值 + 同屏实测值（正文列区的极值像素）
    const sInk = rectStats(off, INK_RECT);
    const inkMeasured = c.zone === 'deep' ? sInk.lmax : sInk.lmin;
    const denom = Math.abs(inkMeasured - sOff.base);
    // 本层真实贡献：逐像素 |Lon − Loff| 的最大值 + 差异像素的包围盒
    let maxDiff = 0, peakPx = null, nDiff = 0;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    const { w, ch: nch, data } = on;
    for (let y = c.rect.y; y < c.rect.y + c.rect.h; y++) {
      for (let x = c.rect.x; x < c.rect.x + c.rect.w; x++) {
        const i = y * w * nch + x * nch;
        const a = lum(data[i], data[i + 1], data[i + 2]);
        const b = lum(off.data[i], off.data[i + 1], off.data[i + 2]);
        const dd = Math.abs(a - b);
        if (dd > 0.012) { nDiff++; if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
        if (dd > maxDiff) { maxDiff = dd; peakPx = [x, y, data[i], data[i + 1], data[i + 2], off.data[i], off.data[i + 1], off.data[i + 2]]; }
      }
    }
    // 最坏情况正文对比度：正文行恰好落在本层最亮的一笔上时的 WCAG 对比度
    const bgUnder = c.zone === 'deep' ? sOff.base + maxDiff : sOff.base - maxDiff;
    const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const rec = {
      name: c.name, zone: c.zone, scrollOn: y0, scrollOff: y1,
      baseL: +sOff.base.toFixed(4),
      inkTokenL: +hexLum(INK[c.zone]).toFixed(4),
      inkMeasuredL: +inkMeasured.toFixed(4),
      layerDiffMax: +maxDiff.toFixed(4),
      pctOfInk: +(maxDiff / denom * 100).toFixed(1),
      contrastPlain: +cr(inkMeasured, sOff.base).toFixed(2),
      contrastWorst: +cr(inkMeasured, bgUnder).toFixed(2),
      diffPixels: nDiff,
      diffBox: bx1 < 0 ? null : [bx0, by0, bx1, by1],
      peakPx, inkRectMaxL: +sInk.lmax.toFixed(4), inkRectMinL: +sInk.lmin.toFixed(4),
    };
    measured.push(rec);
    if (c.keep) { fs.renameSync(path.join(OUT, '.tmp-on.png'), path.join(OUT, 'on-' + c.name + '.png'));
                  fs.renameSync(path.join(OUT, '.tmp-off.png'), path.join(OUT, 'off-' + c.name + '.png')); }
    console.log('  ' + c.name.padEnd(24),
      '底色L=' + rec.baseL, '实测墨色L=' + rec.inkMeasuredL,
      '本层峰值ΔL=' + rec.layerDiffMax,
      '→ 占相邻墨色 ' + rec.pctOfInk + '%',
      '| 正文对比度 ' + rec.contrastPlain + ':1 → 最坏 ' + rec.contrastWorst + ':1',
      '| 差异像素 ' + nDiff);
  }
  try { fs.unlinkSync(path.join(OUT, '.tmp-on.png')); fs.unlinkSync(path.join(OUT, '.tmp-off.png')); } catch (e) {}

  /* ═══ 三 · 8× CPU 降速滚动 5 秒：帧时 p95 与最长帧 ═══ */
  console.log('\n【三 · 8× CPU 降速 · 滚动 5 秒 · 帧间隔 p95 / 最长帧】');
  const RUNS = [
    { n: '无本层（bg=off）', q: 'zone=deep&face=dream&bg=off&lat=edge&layer=below' },
    { n: '页边标尺（edge）', q: 'zone=deep&face=dream&bg=on&lat=edge&layer=below' },
    { n: '全幅铺满（full）', q: 'zone=deep&face=dream&bg=on&lat=full&layer=below' },
    { n: '页边标尺 · 醒面', q: 'zone=deep&face=wake&bg=on&lat=edge&layer=below' },
    { n: '全幅 · 去 mask（诊断）', q: 'zone=deep&face=dream&bg=on&lat=full&layer=below',
      css: '.lat-scanfull{-webkit-mask-image:none!important;mask-image:none!important}' },
  ];
  const perf = [];
  const REPS = 5;
  const acc = RUNS.map(() => []);
  // 轮转取样：同一时刻各配置交替跑，机器状态漂移对每个配置等量作用
  for (let rep = 0; rep < REPS; rep++) {
    for (let ri = 0; ri < RUNS.length; ri++) {
      const r = RUNS[ri];
      await load(r.q + '&chrome=0', 1440, 900, false, false);
      if (r.css) await ev(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(r.css)};document.head.append(s);return 1})()`);
      await send('Emulation.setCPUThrottlingRate', { rate: 8 });
      await ev("window.scrollTo({top:0,behavior:'instant'})");
      await sleep(500);
      const res = await ev(`(async()=>{
        const target = Math.min(document.documentElement.scrollHeight - innerHeight, 5200);
        const d = [];
        await new Promise(res=>{
          let last = performance.now(), t0 = last;
          (function loop(now){
            d.push(now - last); last = now;
            const k = Math.min(1, (now - t0) / 5000);
            scrollTo(0, target * k);
            if (k < 1) requestAnimationFrame(loop); else res();
          })(performance.now());
        });
        const s = d.slice(1).sort((a,b)=>a-b);
        const q = p => s[Math.min(s.length-1, Math.floor(s.length*p))];
        return { frames: s.length, p50: +q(.5).toFixed(2), p95: +q(.95).toFixed(2), max: +s[s.length-1].toFixed(2),
                 avg: +(s.reduce((a,b)=>a+b,0)/s.length).toFixed(2) };
      })()`);
      await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      acc[ri].push(res);
    }
  }
  const medOf = (arr, k) => arr.map(o => o[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  for (let ri = 0; ri < RUNS.length; ri++) {
    const runs = acc[ri];
    const rec = { name: RUNS[ri].n, runs, frames: medOf(runs, 'frames'), p50: medOf(runs, 'p50'),
                  p95: medOf(runs, 'p95'), max: medOf(runs, 'max'), avg: medOf(runs, 'avg') };
    perf.push(rec);
    console.log('  ' + RUNS[ri].n.padEnd(22),
      'p50=' + rec.p50, 'p95=' + rec.p95, 'max=' + rec.max, 'avg=' + rec.avg, 'frames=' + rec.frames,
      '(' + REPS + ' 次 p95: ' + runs.map(o => o.p95).join(' ') + ' | p50: ' + runs.map(o => o.p50).join(' ') + ')');
  }

  fs.writeFileSync(path.join(OUT, '_measure.json'), JSON.stringify({ measured, perf }, null, 2));
  console.log('\n已写出', OUT + '/_measure.json');

  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
