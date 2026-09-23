/* 梦态振幅对照：四道的摆动半幅 + 本层在版心内的墨迹footprint（冻结帧）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p20-gain.cjs [标签] */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const TAG = process.argv[2] || 'x';
const OUT = path.resolve(__dirname, '.shots-p20-gain');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  const open = async (face, z = 1) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + '/articles/?fld=off', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
  };

  // ── 摆动半幅：Δ 的 (max+min)/2 与 (max−min)/2
  const halfRanges = () =>
    page.evaluate(() => {
      const svg = document.querySelector('.eeg');
      const TAN = Math.tan((14 * Math.PI) / 180);
      const seamY = (x) => 450 + (x - 720) * TAN;
      const one = (sel) => {
        const el = svg.querySelector(sel);
        if (!el || !el.getAttribute('d')) return null;
        const L = el.getTotalLength();
        const m = el.getScreenCTM();
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i <= 300; i++) {
          const p = el.getPointAtLength((L * i) / 300);
          const sp = new DOMPoint(p.x, p.y).matrixTransform(m);
          const dv = sp.y - seamY(sp.x);
          if (dv < lo) lo = dv;
          if (dv > hi) hi = dv;
        }
        return { center: +((hi + lo) / 2).toFixed(2), half: +((hi - lo) / 2).toFixed(2) };
      };
      const rows = { main: one('.eeg-main'), e1: one('.eeg-echo-1'), e2: one('.eeg-echo-2'), e3: one('.eeg-echo-3') };
      const hs = Object.values(rows).filter(Boolean).map((r) => r.half);
      return { rows, maxHalf: hs.length ? +Math.max(...hs).toFixed(2) : null };
    });

  await open('dream');
  const d = await halfRanges();
  console.log(`[${TAG}] 梦态半幅：main ${d.rows.main && d.rows.main.half} / e1 ${d.rows.e1 && d.rows.e1.half} / e2 ${d.rows.e2 && d.rows.e2.half} / e3 ${d.rows.e3 && d.rows.e3.half}`);
  console.log(`[${TAG}] 梦态中心：main ${d.rows.main && d.rows.main.center} / e1 ${d.rows.e1 && d.rows.e1.center} / e2 ${d.rows.e2 && d.rows.e2.center} / e3 ${d.rows.e3 && d.rows.e3.center}`);

  await open('wake');
  const w = await halfRanges();
  console.log(`[${TAG}] 醒态半幅：main ${w.rows.main && w.rows.main.half}（其余三道应为 null：${w.rows.e1 === null}）`);

  // ── 冻结帧：本层在版心内留下的像素（document.hidden 钉住 rAF ⇒ 路径不再重写）
  const footprint = async (face) => {
    await open(face);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    });
    await sleep(600);
    const col = await page.evaluate(() => {
      const el = document.querySelector('.container-wide') || document.querySelector('main');
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.left)), w: Math.min(1440, Math.round(r.right)) - Math.max(0, Math.round(r.left)) };
    });
    const a = await page.screenshot({ encoding: 'base64' });
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '.eeg-group{display:none !important}';
      document.head.appendChild(s);
    });
    await sleep(200);
    const b = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(OUT, `footprint-${face}-${TAG}.png`), Buffer.from(a, 'base64'));
    return page.evaluate(
      async (a, b, col) => {
        const load = (d) =>
          new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = 'data:image/png;base64,' + d;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas');
        c.width = ia.width;
        c.height = ia.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(ia, 0, 0);
        const da = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(ib, 0, 0);
        const db = g.getImageData(0, 0, c.width, c.height).data;
        const lin = (v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const L = (r, gg, bb) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
        let n = 0;
        let nCol = 0;
        let maxd = 0;
        let maxDL = 0;
        let maxDcol = 0;
        for (let i = 0; i < da.length; i += 4) {
          const px = (i / 4) % c.width;
          let dmax = 0;
          for (let k = 0; k < 3; k++) dmax = Math.max(dmax, Math.abs(da[i + k] - db[i + k]));
          if (dmax > 0) {
            n++;
            const dl = Math.abs(L(da[i], da[i + 1], da[i + 2]) - L(db[i], db[i + 1], db[i + 2]));
            if (dl > maxDL) maxDL = dl;
            if (px >= col.x && px < col.x + col.w) {
              nCol++;
              if (dl > maxDcol) maxDcol = dl;
            }
          }
          if (dmax > maxd) maxd = dmax;
        }
        return {
          pixels: n,
          total: c.width * c.height,
          maxChannelDelta: maxd,
          maxDeltaL: +maxDL.toFixed(4),
          colPixels: nCol,
          colMaxDeltaL: +maxDcol.toFixed(4),
          col,
        };
      },
      a,
      b,
      col,
    );
  };
  console.log(`[${TAG}] 梦态本层足迹:`, JSON.stringify(await footprint('dream')));
  console.log(`[${TAG}] 醒态本层足迹:`, JSON.stringify(await footprint('wake')));

  await open('dream', 2);
  await page.screenshot({ path: path.join(OUT, `dream-2x-${TAG}.png`) });
  await open('wake', 2);
  await page.screenshot({ path: path.join(OUT, `wake-2x-${TAG}.png`) });
  console.log(`[${TAG}] --- errors:`, errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
