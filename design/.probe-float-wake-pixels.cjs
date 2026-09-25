/* ─────────────────────────────────────────────────────────────
   醒面像素恒等抽查：常驻的定格漂浮动画在振幅为 0 时，不该让醒面变样。

   做法（同一个构建、同一次加载，只差一条「把动画禁掉」的样式）：
     1. 落醒面，等静置；
     2. 截标题带（含序号）＋ 正文带（含 ((浮起))）→ A；
     3. 注入 `.ord-digit,.float-ch{animation:none!important}` → 截同一区域 → B；
     4. 在页面里用 canvas 逐像素比 A/B。
   判据：A/B 逐像素相同（差值 0）。若不同，就是常驻动画在醒面偷偷改了光栅
   （典型是提层导致次像素抗锯齿关闭，字会变灰）。

   用法：npm run build && node design/.probe-float-wake-pixels.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/* 截图经本机 http 回给页面（同源 → canvas 可读），不走 CDP 参数传大 base64 */
const SHOTS = new Map();

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (url.startsWith('/__px/')) {
        const buf = SHOTS.get(url.slice(6));
        if (!buf) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(buf);
        return;
      }
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const REGION = () =>
  (() => {
    const h = document.querySelector('.md h2, h2');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    /* 只截 h2 自己的盒子（含开头那两枚序号），不带两侧留白：
       留白里另有脚本逐帧重绘的东西，会把逐像素比淹掉（见输出里的「地板」一行）。 */
    return {
      x: Math.round(r.left + scrollX),
      y: Math.round(r.top + scrollY),
      width: Math.min(1200, Math.round(r.width)),
      height: Math.min(240, Math.round(r.height)),
    };
  })();

/* 在页面里解码两张同源 PNG 并逐像素比 */
const DIFF = async (aUrl, bUrl) => {
  const load = (src) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('load fail ' + src));
      img.src = src;
    });
  const grab = async (src) => {
    const img = await load(src);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  };
  const A = await grab(aUrl);
  const B = await grab(bUrl);
  if (A.width !== B.width || A.height !== B.height) {
    return { sizeMismatch: [A.width, A.height, B.width, B.height] };
  }
  let diffPixels = 0;
  let maxDelta = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < A.data.length; i += 4) {
    const m = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    );
    if (m > 0) {
      diffPixels++;
      const p = i / 4;
      const x = p % A.width;
      const y = Math.floor(p / A.width);
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    if (m > maxDelta) maxDelta = m;
  }
  return {
    pixels: A.width * A.height,
    diffPixels,
    maxDelta,
    bbox: diffPixels ? [x0, y0, x1, y1] : null,
  };
};

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const out = {};

  for (const url of ['/articles/hello-xingmeng/', '/styleguide/']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('xm-boot-seen', '1');
      sessionStorage.setItem('xm-reality', 'wake');
    });
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2200));

    const region = await page.evaluate(REGION);
    if (!region) {
      out[url] = { skipped: 'no .md h2' };
      await page.close();
      continue;
    }
    /* 采样前先把浮动的相位噪声钉住的要求不适用于醒面：醒面振幅恒 0，所以不做定格。
       但页头缝线呼吸、脑电残影、暗角呼吸都在同一片画面里动 —— 因此这里把**全站动画
       （含过渡）统统暂停**，只留下「.ord-digit 上这条常驻动画在不在」这一个变量：
         A ＝ 全暂停、序号动画仍在（暂停在振幅 0 的档位上）
         B ＝ 全暂停、序号动画被摘掉（animation:none）
       两张都是静态帧 ⇒ 逐像素比出来的差值就只可能来自「这条动画存不存在」。 */
    await page.evaluate(() => {
      for (const a of document.getAnimations()) a.pause();
    });
    await new Promise((r) => setTimeout(r, 150));
    const before = await page.screenshot({ clip: region });
    const states = await page.evaluate(() => ({
      reality: document.body.dataset.reality,
      mix: getComputedStyle(document.documentElement).getPropertyValue('--reality-mix').trim(),
      ordTranslate: document.querySelector('.ord-digit')
        ? getComputedStyle(document.querySelector('.ord-digit')).translate
        : null,
      ordWillChange: document.querySelector('.ord-digit')
        ? getComputedStyle(document.querySelector('.ord-digit')).willChange
        : null,
      ordAnim: document.querySelector('.ord-digit')
        ? getComputedStyle(document.querySelector('.ord-digit')).animationName
        : null,
      animations: document.getAnimations().length,
    }));
    await page.addStyleTag({ content: '.ord-digit,.float-ch{animation:none!important}' });
    await new Promise((r) => setTimeout(r, 150));
    const after = await page.screenshot({ clip: region });

    SHOTS.set('a.png', before);
    SHOTS.set('b.png', after);
    /* 对照：全暂停之后原样再截一张。若这一对也有差值，说明画面里还有不归 CSS
       动画管的动静（脚本逐帧重绘的颗粒/残影），那些差值要先从信号里扣掉。 */
    const ctrl = await page.screenshot({ clip: region });
    SHOTS.set('c.png', ctrl);
    const noise = await page.evaluate(DIFF, `/__px/a.png`, `/__px/c.png`);
    const diff = await page.evaluate(DIFF, `/__px/a.png`, `/__px/b.png`);

    out[url] = { region, states, diff, noise };
    await page.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, '.shots-ramp', 'wake-pixels.json'), JSON.stringify(out, null, 2));
  for (const [url, r] of Object.entries(out)) {
    if (r.skipped) {
      console.log(`${url}  跳过：${r.skipped}`);
      continue;
    }
    console.log(
      `${url}\n  醒面 reality=%s mix=%s  .ord-digit animation=%s translate=%s will-change=%s\n  截图区域 %j`,
      r.states.reality,
      r.states.mix,
      r.states.ordAnim,
      r.states.ordTranslate,
      r.states.ordWillChange,
      r.region,
    );
    console.log(
      `  信号：A（动画仍在）vs B（摘掉）%d/%d 像素不同，最大差 %d，bbox %j`,
      r.diff.diffPixels,
      r.diff.pixels,
      r.diff.maxDelta,
      r.diff.bbox,
    );
    console.log(
      `  地板：全暂停后原样再截一张 %d/%d 像素不同，最大差 %d，bbox %j  ⇒  %s`,
      r.noise.diffPixels,
      r.noise.pixels,
      r.noise.maxDelta,
      r.noise.bbox,
      r.diff.diffPixels <= r.noise.diffPixels && r.diff.maxDelta <= r.noise.maxDelta
        ? '信号不高于地板 ✓'
        : '信号高于地板 ✗',
    );
  }
})();
