// p14-c 树脂层 自验收：截图矩阵 + 像素探针 + 8× 降速滚动测帧
// 独占 CDP 9803；静态服务器以仓库根为 root，见 .serve-p14c.cjs（端口 4411）
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:4411/design/mocks/p14-c-resin-strata.html';
const OUT = 'D:/Documents/HTA/My Projects/personal-website/design/mocks/.shots-p14-c';
const PORT = 9803;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => { http.get(u, (r) => { let s = ''; r.on('data', (c) => (s += c)); r.on('end', () => res(JSON.parse(s))); }).on('error', rej); });

/* ── 极简 PNG 解码（Chromium 截图：8bit / colorType 2 或 6 / 非隔行） ── */
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error('unsupported png ct=' + ct + ' bd=' + bd);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[p + x];
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y > 0 ? out[prev + x] : 0, c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v;
      if (f === 0) v = cur;
      else if (f === 1) v = cur + a;
      else if (f === 2) v = cur + b;
      else if (f === 3) v = cur + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[row + x] = v & 255;
    }
    p += stride;
  }
  return { w, h, bpp, px: out };
}
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function hex(n) { return n.toString(16).padStart(2, '0'); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, '.chrome'), '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let k = 0; k < 80; k++) {
    try { list = await getJSON('http://127.0.0.1:' + PORT + '/json'); if (list && list.some((t) => t.type === 'page')) break; } catch (e) {}
    await sleep(250);
  }
  if (!list) { console.log('devtools not up'); try { ch.kill(); } catch (e) {} return; }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p = {}) => new Promise((r) => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable'); await send('Runtime.enable');
  const evalx = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  async function nav(q, vw, vh, rm) {
    await send('Emulation.setDeviceMetricsOverride', { width: vw || 1440, height: vh || 900, deviceScaleFactor: 1, mobile: !!(vw && vw < 600) });
    await send('Emulation.setEmulatedMedia', rm ? { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } : { features: [] });
    await send('Page.navigate', { url: BASE + (q ? '?' + q : '') });
    await sleep(2300);
    await evalx('document.fonts.ready.then(()=>1)');
    await sleep(700);
  }
  // 注意：站点 html{scroll-behavior:smooth}，脚本里一律用 instant 落位，否则截图停在滚动动画中途
  async function scrollToY(y) { await evalx("scrollTo({top:" + y + ",behavior:'instant'})"); await sleep(280); }
  async function scrollToSel(sel, off) {
    await evalx("(()=>{var e=document.querySelector('" + sel + "');if(!e)return -1;" +
      "scrollTo({top:Math.max(0,e.getBoundingClientRect().top+scrollY+" + (off || 0) + "),behavior:'instant'});return 1})()");
    await sleep(320);
  }
  async function shot(name, clip) {
    // 注意：CDP 的 clip 用文档坐标（不是视口坐标），必须加上当前 scrollY
    let p = { format: 'png' };
    if (clip) {
      const sy = await evalx('scrollY');
      p = { format: 'png', clip: Object.assign({ scale: 1 }, clip, { y: clip.y + sy }) };
    }
    const cap = await send('Page.captureScreenshot', p);
    const buf = Buffer.from(cap.result.data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    return buf;
  }

  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  /* ══ 1. 截图矩阵 ══ */
  const HERO = 'zone=deep&hud=0';
  const CON = 'zone=deep&hud=0';
  const mid = 900; // 首屏高

  await nav(HERO, 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await shot('01-deep-hero-dream');
  say('[shot] 01-deep-hero-dream ' + (await evalx('__p14.state()')));

  await nav(HERO + '&face=wake', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await shot('02-deep-hero-wake');

  await nav(CON, 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-essays', -300);
  await shot('03-deep-content-dream');

  await nav(CON + '&face=wake', 1440, 900);
  await scrollToSel('#ns-essays', -300);
  await shot('04-deep-content-wake');

  await nav('zone=paper&hud=0', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-dawn', -200);
  await shot('05-paper-dream');

  await nav('zone=light&hud=0', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-article', -160);
  await shot('06-light-dream');

  await nav(CON, 390, 844);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-essays', -220);
  await shot('07-mobile390-dream');

  await nav(CON + '&rm=1', 1440, 900, true);
  await shot('08-rm-wake');
  say('[shot] 08-rm-wake ' + (await evalx('__p14.state()')));

  await nav(HERO + '&layer=off', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await shot('09-baseline-off');

  await nav(CON + '&shape=sheet', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-essays', -300);
  await shot('10-shape-A');

  await nav(CON + '&shape=stratum', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-essays', -300);
  await shot('11-shape-B');

  await nav(HERO + '&layer=through', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await shot('12-hero-through');

  await nav('zone=deep&hud=0&layer=behind', 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await shot('13-hero-behind');

  // 阶跃相位 0：与 11-shape-B（相位 7.2s＝动画第 3 步）同机位对照，
  // 两张之差就是「时间的量化」——整数像素单步位移，无 tween
  await nav(CON, 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1,0)');
  await scrollToSel('#ns-essays', -300);
  await shot('14-step-phase0');

  // 证据：文字与树脂面的最近距离（同一机位放大 2×）
  await nav(CON, 1440, 900);
  await evalx('__p14.brandHold();__p14.freeze(1)');
  await scrollToSel('#ns-essays', -300);
  const probe = await evalx('__p14.probe()');
  say('[probe] ' + probe);
  await shot('15-nearest-2x', { x: 1020, y: 392, width: 360, height: 180, scale: 2 });
  await shot('16-full-content');

  /* ══ 2. 像素探针：层最亮处 vs 相邻墨色（全幅截图，按视口坐标取像素） ══ */
  async function fullShot(tag) {
    const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(cap.result.data, 'base64');
    fs.writeFileSync(path.join(OUT, tag + '.png'), buf);
    return decodePNG(buf);
  }
  async function probeFrame(q, tag) {
    await nav('zone=deep&hud=0' + q, 1440, 900);
    await evalx('__p14.brandHold();__p14.freeze(1)');
    await scrollToSel('#ns-essays', -300);
    return fullShot(tag);
  }
  const imgDream = await probeFrame('', 'probe-dream');
  const imgOff = await probeFrame('&layer=off', 'probe-off');
  const imgWake = await probeFrame('&face=wake', 'probe-wake');
  const imgWakeOff = await probeFrame('&face=wake&layer=off', 'probe-wake-off');
  const inkL = await evalx("(()=>{var c=getComputedStyle(document.body).color.match(/[\\d.]+/g).map(Number);return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255;})()");
  function cmp(a, b, x0, x1, label, skipLine) {
    let max = 0, at = [0, 0], sum = 0, n = 0, dreamHex = '', offHex = '', maxBand = 0, atBand = [0, 0];
    for (let y = 60; y < 830; y++) for (let x = x0; x < x1; x++) {
      const i = (y * a.w + x) * a.bpp;
      const la = lum(a.px[i], a.px[i + 1], a.px[i + 2]), lb = lum(b.px[i], b.px[i + 1], b.px[i + 2]);
      const dd = Math.abs(la - lb); sum += dd; n++;
      if (dd > max) { max = dd; at = [x, y]; dreamHex = '#' + hex(a.px[i]) + hex(a.px[i + 1]) + hex(a.px[i + 2]); offHex = '#' + hex(b.px[i]) + hex(b.px[i + 1]) + hex(b.px[i + 2]); }
      if (skipLine && Math.abs(y - skipLine(x)) > 4 && dd > maxBand) { maxBand = dd; atBand = [x, y]; }
    }
    say('[pixel] ' + label + '：最大 ΔL=' + max.toFixed(4) + '（' + dreamHex + ' vs ' + offHex + ' @' + at +
      '＝相邻墨色亮度 ' + inkL.toFixed(4) + ' 的 ' + ((max / inkL) * 100).toFixed(1) + '%）' +
      (skipLine ? '；剔除 1px 面后最大 ΔL=' + maxBand.toFixed(4) + '@' + atBand : '') +
      '；区域平均 ΔL=' + (sum / n).toFixed(4));
    return { max, mean: sum / n, maxBand, at, inkPct: (max / inkL) * 100 };
  }
  // 1px 面：y = 609 + (x−1202)·tan14（与页面 probe 一致）
  const LINE_AT = (x) => 460 + (x - 1202) * Math.tan((14 * Math.PI) / 180);
  const pAll = cmp(imgDream, imgOff, 0, 1440, '整幅（梦态 vs 无层）');
  const pRight = cmp(imgDream, imgOff, 1030, 1440, '右侧 410px（层理带宽）', LINE_AT);
  const pCol = cmp(imgDream, imgOff, 272, 1168, '版心内（272–1168：软边色差落在文字后的量）', LINE_AT);
  const pWake = cmp(imgWake, imgWakeOff, 0, 1440, '醒态残差（应只剩 1px 面）', LINE_AT);

  /* 25% 缩放对照（E 的验收口径：缩到 25% 看梦态有没有一层树脂） */
  function quarter(img, out) {
    const z = 4, W = Math.floor(img.w / z), H = Math.floor(img.h / z);
    const raw = Buffer.alloc(H * (W * 3 + 1));
    let o = 0;
    for (let y = 0; y < H; y++) {
      raw[o++] = 0;
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < z; dy++) for (let dx = 0; dx < z; dx++) {
          const i = ((y * z + dy) * img.w + (x * z + dx)) * img.bpp;
          r += img.px[i]; g += img.px[i + 1]; b += img.px[i + 2];
        }
        const k = z * z;
        raw[o++] = Math.round(r / k); raw[o++] = Math.round(g / k); raw[o++] = Math.round(b / k);
      }
    }
    const crc32 = (buf) => { let c, crc = 0xffffffff; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(path.join(OUT, out), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    say('[shot] ' + out + ' ' + W + 'x' + H + '（25%）');
  }
  quarter(imgDream, '17-quarter-dream.png');
  quarter(imgWake, '18-quarter-wake.png');

  /* ══ 3. 8× CPU 降速 · 滚动整 5 秒的 p95 / 最长帧（时序由页内 rAF 驱动，四组完全同法） ══ */
  async function perfRun(q, label) {
    await nav('zone=deep&hud=0&' + q, 1440, 900);
    await evalx('__p14.brandHold();__p14.freeze(1)');
    await send('Emulation.setCPUThrottlingRate', { rate: 8 });
    const maxY = await evalx('document.documentElement.scrollHeight-innerHeight');
    await evalx("document.documentElement.style.scrollBehavior='auto'");
    // 预热一趟（字体栅格化、阴影层首帧先落地，不计入）
    for (let i = 0; i <= 40; i++) { await evalx('scrollTo(0,' + Math.round((maxY * i) / 40) + ')'); await sleep(20); }
    await evalx('scrollTo(0,0)'); await sleep(400);
    await evalx(
      'window.__ft=[];window.__fl=0;window.__t0=performance.now();window.__dur=5000;window.__maxY=' + maxY + ';' +
      '(function s(ts){if(window.__fl)window.__ft.push(Math.round(ts-window.__fl));window.__fl=ts;requestAnimationFrame(s)})(0);' +
      '(function sc(){var k=Math.min(1,(performance.now()-window.__t0)/window.__dur);scrollTo(0,window.__maxY*k);' +
      'window.__k=k;if(k<1)requestAnimationFrame(sc);else window.__wall=performance.now()-window.__t0})();');
    await sleep(6400);
    const ft = await evalx('JSON.stringify({ft:window.__ft,k:window.__k,wall:window.__wall})');
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const o = JSON.parse(ft), a = o.ft.slice().sort((x, y) => x - y);
    const p95 = a[Math.floor(a.length * 0.95)] || 0;
    const max = a[a.length - 1] || 0;
    say('[perf] ' + label + '  墙钟=' + Math.round(o.wall) + 'ms 进度=' + (o.k * 100).toFixed(0) + '% 帧数=' + a.length +
      ' p50=' + a[Math.floor(a.length / 2)] + 'ms p95=' + p95 + 'ms max=' + max + 'ms');
    return { label, n: a.length, p50: a[Math.floor(a.length / 2)], p95, max, wall: Math.round(o.wall) };
  }
  const perf = [];
  perf.push(await perfRun('layer=off', 'A 无层（baseline）· 第1趟'));
  perf.push(await perfRun('layer=through&shape=stratum', 'B 有层 · 层理（默认）· 第1趟'));
  perf.push(await perfRun('layer=through&shape=sheet', 'C 有层 · 撕边片（带 drop-shadow）'));
  perf.push(await perfRun('layer=through&shape=stratum&bf=1', 'D 有层 · 层理 + backdrop-filter 对照'));
  perf.push(await perfRun('layer=off', 'A 无层（baseline）· 第2趟'));
  perf.push(await perfRun('layer=through&shape=stratum', 'B 有层 · 层理（默认）· 第2趟'));

  fs.writeFileSync(path.join(OUT, 'REPORT.txt'), log.join('\n') + '\n');
  ws.close(); try { ch.kill(); } catch (e) {}
  await sleep(400);
  try { fs.rmSync(path.join(OUT, '.chrome'), { recursive: true, force: true }); } catch (e) {}
})();
