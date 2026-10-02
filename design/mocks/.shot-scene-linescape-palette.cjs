/* 原型 linescape · 配色方案截图与验收：node design/mocks/.shot-scene-linescape-palette.cjs [tag] [base]
   ?pal=0（现状对照）/1/2/3 × 醒 / 梦（桌面），外加每套一张窄屏醒面；都是 v=a、&pins=1。
   另测：① 对比度 —— 把问句 / 标注 / 测量点小字藏起来截下它们背后那块底，取「最亮的 5% 像素」当底色
   （偏保守：线和光只会让底更亮或更暗，取最不利的一侧），与计算出的字色算 WCAG 对比度；
   ② 交接 —— 从开屏滚到第 1 幕，逐步采样左上角天空一小块的平均色，报告相邻两步的最大色差（ΔE76），检查跳色；
   ③ 静置 3 秒主线程开销与 Worker 每帧耗时。
   输出 design/mocks/_shots-scene/palette-<tag->pal-reality-d|m.png 与 palette-<tag->report.json。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const TAG = process.argv[2] || '';
const BASE = process.argv[3] || 'http://localhost:4321';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });
const name = (s, ext = 'png') => path.join(OUT, `palette-${TAG ? TAG + '-' : ''}${s}.${ext}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 截图偶尔卡住（并行的别的截图进程抢 GPU）：限时 20s，失败重试两次 */
const shot = async (page, opts) => {
  for (let k = 0; ; k++) {
    try {
      await page.bringToFront();
      return await Promise.race([page.screenshot(opts), sleep(20000).then(() => Promise.reject(new Error('shot timeout')))]);
    } catch (e) {
      if (k >= 2) throw e;
      console.log('retry shot', e.message);
      await sleep(1500);
    }
  }
};

/* 在页面里解码一张 base64 PNG，返回 [最亮 5% 的平均色, 整体平均色] */
const decodeIn = (page, b64) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    px.sort((a, b) => lum(b) - lum(a));
    const avg = (arr) => [0, 1, 2].map((k) => arr.reduce((s, p) => s + p[k], 0) / arr.length);
    return [avg(px.slice(0, Math.max(1, Math.round(px.length * 0.05)))), avg(px)];
  }, b64);

const srgb = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const L = (c) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2]);
const contrast = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
};
const parseColor = (s) => {
  // getComputedStyle 可能给 rgb(...) 或 color(srgb r g b / a)
  let m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
  if (m) return { rgb: [+m[1] * 255, +m[2] * 255, +m[3] * 255], a: m[4] ? +m[4] : 1 };
  m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] ? +m[4] : 1 };
  return null;
};
const over = (fg, bg) => fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a));
const lab = (c) => {
  const [r, g, b] = c.map(srgb);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    protocolTimeout: 120000,
    args: ['--enable-gpu-rasterization'],
  });
  const report = {};
  const open = async (pal, reality, w, h, mobile) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument((r) => {
      try {
        sessionStorage.setItem('xm-reality', r);
        localStorage.setItem('xm-reality-guided-v2', '1');
      } catch {}
    }, reality);
    page.on('pageerror', (e) => console.log('pageerror', pal, reality, e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('console', pal, reality, m.text()));
    await page.goto(`${BASE}/mock/scene-linescape-palette/?v=a&pins=1&pal=${pal}`, { waitUntil: 'networkidle0' });
    await sleep(7500);
    return page;
  };

  /* 对比度：sel 的字色 vs 它背后那块底（字藏起来再截） */
  const measure = async (page, sel) => {
    const info = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, color: getComputedStyle(el).color };
    }, sel);
    if (!info || info.w < 1) return null;
    await page.addStyleTag({ content: `${sel}{visibility:hidden!important}` });
    await sleep(120);
    const b64 = await shot(page, {
      encoding: 'base64',
      clip: { x: Math.max(0, info.x), y: Math.max(0, info.y), width: info.w, height: info.h },
      captureBeyondViewport: false,
    });
    await page.addStyleTag({ content: `${sel}{visibility:visible!important}` });
    const [bright] = await decodeIn(page, b64);
    const fg = parseColor(info.color);
    if (!fg) return { color: info.color, bg: bright.map(Math.round) };
    const solid = over(fg, bright);
    return { color: info.color, bg: bright.map(Math.round), ratio: contrast(solid, bright) };
  };

  /* 交接：滚过第 0 幕到第 1 幕，左上角天空块的平均色 */
  const handoff = async (page) => {
    const top1 = await page.evaluate(() => {
      const s = document.querySelector('[data-scene="1"]');
      return s ? s.offsetTop + s.offsetHeight * 0.1 : innerHeight * 3;
    });
    const steps = 16;
    const seq = [];
    for (let i = 0; i <= steps; i++) {
      const sy = await page.evaluate((y) => (scrollTo(0, y), scrollY), (top1 * i) / steps);
      await sleep(260);
      const b64 = await shot(page, { encoding: 'base64', clip: { x: 4, y: sy + 90, width: 60, height: 40 }, captureBeyondViewport: false });
      const [, mean] = await decodeIn(page, b64);
      seq.push(mean.map(Math.round));
    }
    let maxStep = 0;
    for (let i = 1; i < seq.length; i++) maxStep = Math.max(maxStep, dE(seq[i - 1], seq[i]));
    await page.evaluate(() => scrollTo(0, 0));
    return { maxStepDE: +maxStep.toFixed(2), first: seq[0], last: seq[seq.length - 1] };
  };

  for (const pal of ['0', '1', '2', '3']) {
    for (const reality of ['wake', 'dream']) {
      const page = await open(pal, reality, 1440, 900, false);
      const file = name(`${pal}-${reality}-d`);
      await shot(page, { path: file });
      console.log(file);
      const key = `${pal}-${reality}`;
      report[key] = {
        q: await measure(page, '.q .ql:nth-child(2)'),
        markH: await measure(page, '.cmark-h'),
        markN: await measure(page, '.cmark:not(.cmark-h)'),
        pin: await measure(page, '.pin-articles .pin-l'),
      };
      if (reality === 'wake') {
        const cdp = await page.target().createCDPSession();
        await cdp.send('Performance.enable');
        const get = async () =>
          Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        await page.evaluate(() => window.__lsPerf && window.__lsPerf());
        const a = await get();
        await sleep(3000);
        const b = await get();
        report[key].idle3s = {
          recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
          layouts: b.LayoutCount - a.LayoutCount,
          scriptMs: +((b.ScriptDuration - a.ScriptDuration) * 1000).toFixed(1),
        };
        report[key].worker = await page.evaluate(() => window.__lsPerf && window.__lsPerf());
      }
      report[key].handoff = await handoff(page);
      console.log(key, JSON.stringify(report[key]));
      await page.close();
    }
    const page = await open(pal, 'wake', 390, 844, true);
    const file = name(`${pal}-wake-m`);
    await shot(page, { path: file });
    console.log(file);
    await page.close();
  }
  fs.writeFileSync(name('report', 'json'), JSON.stringify(report, null, 2));
  console.log(name('report', 'json'));
  await browser.close();
})();
