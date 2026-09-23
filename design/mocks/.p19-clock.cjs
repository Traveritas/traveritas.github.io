/* 验收：梦态「两个时钟」——主波/灰道跟拍钟（每 0.5s 跳），有色两道逐帧连续
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-clock.cjs */
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

  const open = async (face, url = '/articles/?fld=off') => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((f) => {
      try {
        sessionStorage.setItem('xm-reality', f);
        sessionStorage.setItem('xm-boot-seen', '1');
      } catch {}
    }, face);
    await page.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2600);
  };

  // 采样 3s × 50ms：看每条路径的 d 变了多少次、首点 Y 每次跳多少
  const sample = async (face) => {
    await open(face);
    const raw = await page.evaluate(
      () =>
        new Promise((res) => {
          const sel = { main: '.eeg-main', e1: '.eeg-echo-1', e2: '.eeg-echo-2', e3: '.eeg-echo-3' };
          const out = {};
          for (const k in sel) out[k] = [];
          const t0 = performance.now();
          const id = setInterval(() => {
            for (const k in sel) {
              const el = document.querySelector('.eeg ' + sel[k]);
              const d = el ? el.getAttribute('d') || '' : '';
              const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d);
              out[k].push({ t: +(performance.now() - t0).toFixed(0), y: m ? +m[2] : null, len: d.length });
            }
            if (performance.now() - t0 > 3000) {
              clearInterval(id);
              res(out);
            }
          }, 50);
        }),
    );
    const sum = {};
    for (const k in raw) {
      const arr = raw[k];
      let changes = 0;
      let maxJump = 0;
      let movingSamples = 0;
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].len !== arr[i - 1].len || arr[i].y !== arr[i - 1].y) changes++;
        if (arr[i].y !== null && arr[i - 1].y !== null) {
          const j = Math.abs(arr[i].y - arr[i - 1].y);
          if (j > 1e-9) movingSamples++;
          if (j > maxJump) maxJump = j;
        }
      }
      sum[k] = {
        samples: arr.length,
        distinctLen: [...new Set(arr.map((a) => a.len))].length,
        redraws: changes,
        movingSamples,
        maxJumpPer50ms: +maxJump.toFixed(2),
        yMin: Math.min(...arr.filter((a) => a.y !== null).map((a) => a.y)),
        yMax: Math.max(...arr.filter((a) => a.y !== null).map((a) => a.y)),
      };
    }
    return sum;
  };

  const dream = await sample('dream');
  console.log('=== 梦态 · 3s / 每 50ms 采样（60 次）===');
  console.log('main(阶梯,灰) ', JSON.stringify(dream.main));
  console.log('e2  (阶梯,灰) ', JSON.stringify(dream.e2));
  console.log('e1  (连续,有色)', JSON.stringify(dream.e1));
  console.log('e3  (连续,有色)', JSON.stringify(dream.e3));

  const wake = await sample('wake');
  console.log('=== 醒态（对照）===');
  console.log('main(连续)     ', JSON.stringify(wake.main));
  console.log('e1（应始终空）  ', JSON.stringify(wake.e1));

  fs.writeFileSync(path.join(OUT, 'clock.json'), JSON.stringify({ dream, wake }, null, 2));

  // 帧时间：本层开着 vs 关掉（梦态）
  const frame = async (hide) => {
    await open('dream');
    if (hide) await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '.eeg-group{display:none !important}';
      document.head.appendChild(s);
    });
    const dts = await page.evaluate(
      () =>
        new Promise((res) => {
          const a = [];
          let last = 0;
          (function loop(ts) {
            requestAnimationFrame(loop);
            if (last) a.push(ts - last);
            last = ts;
            if (a.length >= 120) res(a);
          })(0);
        }),
    );
    dts.sort((x, y) => x - y);
    return { p50: +dts[Math.floor(dts.length * 0.5)].toFixed(1), p95: +dts[Math.floor(dts.length * 0.95)].toFixed(1), n: dts.length };
  };
  console.log('梦态帧间隔 本层开:', JSON.stringify(await frame(false)), ' 本层关:', JSON.stringify(await frame(true)));
  console.log('--- errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
