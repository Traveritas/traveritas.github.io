/* 逐条读出四条线的颜色 + 屏幕位置（不靠肉眼）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.probe-seam-map.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-probe-seam');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem('xm-reality', 'dream');
      sessionStorage.setItem('xm-boot-seen', '1');
    } catch {}
  });
  await page.goto(BASE + '/articles/?fld=off', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(2600);

  const data = await page.evaluate(() => {
    const rows = [];
    const svg = document.querySelector('.eeg');
    const push = (label, el) => {
      if (!el) return;
      const cs = getComputedStyle(el);
      const d = el.getAttribute('d') || '';
      let pt = null;
      if (el instanceof SVGPathElement && d) {
        const total = el.getTotalLength();
        const p = el.getPointAtLength(total * 0.5);
        const m = el.getScreenCTM();
        const sp = new DOMPoint(p.x, p.y).matrixTransform(m);
        pt = { x: Math.round(sp.x), y: Math.round(sp.y) };
      }
      rows.push({
        label,
        stroke: cs.stroke,
        width: cs.strokeWidth,
        opacity: cs.opacity,
        dash: cs.strokeDasharray,
        anim: cs.animationName + ' ' + cs.animationDuration + ' ' + cs.animationTimingFunction,
        dLen: d.length,
        screenMid: pt,
      });
    };
    push('main  .eeg-main', svg && svg.querySelector('.eeg-main'));
    push('echo1 .eeg-echo-1', svg && svg.querySelector('.eeg-echo-1'));
    push('echo2 .eeg-echo-2', svg && svg.querySelector('.eeg-echo-2'));
    push('echo3 .eeg-echo-3', svg && svg.querySelector('.eeg-echo-3'));
    // 缝线在同一 x 上的 y（用它的矩形反解）
    const seam = document.querySelector('.seam');
    const sr = seam.getBoundingClientRect();
    rows.push({ label: 'seam rect', x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height), op: getComputedStyle(seam).opacity });
    return rows;
  });
  fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(data, null, 2));
  for (const r of data) console.log(JSON.stringify(r));
  await browser.close();
})();
