/* 四条线是否以中线（720, 450 = 视口中心 / 缝线轴心）对称居中
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-center.cjs */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.resolve(__dirname, '.shots-p19-verify');
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

  const geom = () =>
    page.evaluate(() => {
      const svg = document.querySelector('.eeg');
      const TAN14 = Math.tan((14 * Math.PI) / 180);
      // 缝线在屏幕 x 处的 y：过 (720, 450)、14°
      const seamY = (x) => 450 + (x - 720) * TAN14;
      const measure = (sel) => {
        const el = svg.querySelector(sel);
        if (!el) return null;
        const d = el.getAttribute('d') || '';
        if (!d) return { empty: true };
        const L = el.getTotalLength();
        const m = el.getScreenCTM();
        /* 线的「中心」＝ 振荡中点，不是弧长均值（路径两端在视口外被截断，弧长均值会带上
           波形自身的相位残差）。取 Δ 的极值中点：(max+min)/2 ⇒ 就是这条波摆动所绕的那条轴。 */
        let lo = Infinity;
        let hi = -Infinity;
        let p1 = null;
        let p2 = null;
        for (let i = 0; i <= 300; i++) {
          const p = el.getPointAtLength((L * i) / 300);
          const sp = new DOMPoint(p.x, p.y).matrixTransform(m);
          const dvv = sp.y - seamY(sp.x);
          if (dvv < lo) lo = dvv;
          if (dvv > hi) hi = dvv;
          if (i === 150) p1 = sp;
          if (i === 160) p2 = sp;
        }
        const k = (p2.y - p1.y) / (p2.x - p1.x);
        return {
          center: +((hi + lo) / 2).toFixed(2),
          halfRange: +((hi - lo) / 2).toFixed(2),
          stackDeg: +(Math.atan(k) * 180 / Math.PI).toFixed(2),
        };
      };
      const rows = {
        'e3 暖沙 dashed': measure('.eeg-echo-3'),
        'e1 琥珀': measure('.eeg-echo-1'),
        'main umber': measure('.eeg-main'),
        'e2 wake': measure('.eeg-echo-2'),
      };
      const cs = Object.values(rows).filter((r) => r && !r.empty).map((r) => r.center);
      return {
        rows,
        n: cs.length,
        min: cs.length ? Math.min(...cs) : null,
        max: cs.length ? Math.max(...cs) : null,
        mean: cs.length ? +(cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(2) : null,
        spanMid: cs.length ? +((Math.min(...cs) + Math.max(...cs)) / 2).toFixed(2) : null,
        viewportMidY: 450,
      };
    });

  await open('dream');
  const dream = await geom();
  console.log('=== 梦态：各线在视口中心 x=720 上的 y（中线 = 450）===');
  for (const k in dream.rows) console.log(' ', k.padEnd(22), JSON.stringify(dream.rows[k]));
  console.log('  四条 y：', JSON.stringify({ min: dream.min, max: dream.max, mean: dream.mean, spanMid: dream.spanMid, 中线: 450 }));

  await open('wake');
  const wake = await geom();
  console.log('=== 醒态（应四条全部塌回 450）===');
  for (const k in wake.rows) console.log(' ', k.padEnd(22), JSON.stringify(wake.rows[k]));

  fs.writeFileSync(path.join(OUT, 'center.json'), JSON.stringify({ dream, wake }, null, 2));

  // 截图
  const snap = async (name, face, z, clip) => {
    await open(face, z);
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('shot', name, 'z=' + z);
  };
  await snap('p19-center-full', 'dream', 1, undefined);
  await snap('p19-center-zoom', 'dream', 3, { x: 700, y: 400, width: 500, height: 180 });
  await snap('p19-wake-center-zoom', 'wake', 3, { x: 700, y: 400, width: 500, height: 180 });
  console.log('--- errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
