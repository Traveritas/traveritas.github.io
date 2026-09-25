/* ─────────────────────────────────────────────────────────────
   行内光景（.float-run / .sheen-run）的活体抽查。
   用法：npm run build && node design/.shot-inline-fx.cjs
   输出：design/.shots-inline-fx/*.png + report.json

   查四件事：
   1. 流光在梦面确实有渐变背景、字身是 transparent（透明的是填充，不是字消失
      —— 靠截图肉眼确认字还在），醒面 background-image 必须是 none；
   2. 逐字浮起在梦面有 animation、醒面没有 translate；
   3. tint 那一档的顶点色（把动画拨到 25% 峰上）——验 currentColor 在
      color-mix 里取的是正文色，而不是被动画自身带跑；
   4. 控制台与页面错误数 0。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '.shots-inline-fx');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
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

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));

  await page.goto(`http://127.0.0.1:${port}/styleguide/`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));

  const setFace = async (face) => {
    await page.click(`[data-sg-face="${face}"]`);
    await new Promise((r) => setTimeout(r, 700));
  };

  const probe = () =>
    page.evaluate(() => {
      const sheen = document.querySelector('#sg-inline-fx .sheen-run');
      const tint = document.querySelector('#sg-inline-fx .float-run[style*="--float-tint"] .float-ch');
      const plainCh = document.querySelector('#sg-inline-fx .float-run:not([style]) .float-ch');
      const s = (el) => (el ? getComputedStyle(el) : null);
      const sheenCs = s(sheen);
      const tintCs = s(tint);
      return {
        face: document.body.dataset.reality,
        sheen: sheenCs
          ? {
              bgImage: sheenCs.backgroundImage.slice(0, 46),
              hasBg: sheenCs.backgroundImage !== 'none',
              clip: sheenCs.backgroundClip || sheenCs.webkitBackgroundClip,
              color: sheenCs.color,
              animation: `${sheenCs.animationName} ${sheenCs.animationDuration} ${sheenCs.animationTimingFunction}`,
              box: sheen ? [Math.round(sheen.getBoundingClientRect().width), Math.round(sheen.getBoundingClientRect().height)] : null,
            }
          : null,
        float: {
          anim: plainCh ? `${s(plainCh).animationName} ${s(plainCh).animationDuration} ${s(plainCh).animationTimingFunction}` : null,
          delayInline: plainCh ? plainCh.style.getPropertyValue('--i') : null,
          chars: document.querySelectorAll('#sg-inline-fx .float-ch').length,
          runs: document.querySelectorAll('#sg-inline-fx .float-run').length,
        },
        tintPeak: (() => {
          if (!tint) return null;
          // 把动画拨到 25% 峰上（step-end 段内保持起点值），醒面没有动画则原样
          tint.style.animationDelay = '-0.7s';
          tint.style.animationPlayState = 'paused';
          return { color: getComputedStyle(tint).color, inline: tint.getAttribute('style') };
        })(),
      };
    });

  const report = { errors, faces: {} };

  await setFace('wake');
  report.faces.wake = await probe();
  await page.evaluate(() => {
    document.querySelector('#sg-inline-fx')?.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 300));
  const card = await page.$('#sg-inline-fx');
  await card.screenshot({ path: path.join(OUT, 'wake.png') });

  await setFace('dream');
  report.faces.dream = await probe();
  await page.evaluate(() => {
    document.querySelector('#sg-inline-fx')?.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 300));
  await card.screenshot({ path: path.join(OUT, 'dream.png') });

  // 滑杆是否真的写到容器上（--float-amp 拉到 8px，看第一处浮起的字有没有拿到）
  await page.evaluate(() => {
    const el = document.querySelector('[data-sg-fx="--float-amp"]');
    el.value = '8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  report.slider = await page.evaluate(() => ({
    zone: document.getElementById('sg-inline-fx').getAttribute('style'),
    read: document.querySelector('[data-sg-fx-val="--float-amp"]').textContent,
    inherited: getComputedStyle(document.querySelector('#sg-inline-fx .float-ch')).getPropertyValue('--float-amp').trim(),
  }));

  /* 把流光拨到行程一半：亮带正好落在字串中间（--sheen-span 300% ⇒ 位移 2W 才走满），
     这一帧能直接看出「暖光从字面上流过」是不是真的（否则整段只会是同一种墨色）。 */
  report.sheenMid = await page.evaluate(() => {
    const runs = [...document.querySelectorAll('#sg-inline-fx .sheen-run')];
    for (const r of runs) {
      r.style.animationDelay = '-3.5s';
      r.style.animationPlayState = 'paused';
    }
    const first = runs[0];
    return { pos: getComputedStyle(first).backgroundPosition, count: runs.length };
  });
  await page.evaluate(() => {
    document.querySelector('#sg-inline-fx')?.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise((r) => setTimeout(r, 300));
  await card.screenshot({ path: path.join(OUT, 'dream-sheen-mid.png') });

  /* 定死两帧对照：位置 0%（图形第一折 = 全是墨色）vs 50%（暖带落在字串正中）。
     两帧一样 ⇒ 渐变没生效；不一样 ⇒ 暖光确实从字面上流过。放 2× 看颜色。 */
  const freezeAt = async (pos) => {
    await page.evaluate((p) => {
      for (const r of document.querySelectorAll('#sg-inline-fx .sheen-run')) {
        r.style.animation = 'none';
        r.style.backgroundPosition = p;
      }
    }, pos);
    await new Promise((r) => setTimeout(r, 120));
  };
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await freezeAt('0% 0');
  const line = await page.$('#sg-inline-fx .md p:has(.sheen-run)');
  await line.screenshot({ path: path.join(OUT, 'sheen-pos0.png') });
  await freezeAt('50% 0');
  await line.screenshot({ path: path.join(OUT, 'sheen-pos50.png') });

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
