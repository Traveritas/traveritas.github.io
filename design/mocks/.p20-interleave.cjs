/* 交错验证：梦态下主波与灰道各自的重写时刻是否错开半格
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p20-interleave.cjs */
const path = require('path');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:4321';
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

  const res = await page.evaluate(
    () =>
      new Promise((res) => {
        const get = (s) => document.querySelector('.eeg ' + s)?.getAttribute('d') || '';
        const st = { main: { d: get('.eeg-main'), t: 0 }, e2: { d: get('.eeg-echo-2'), t: 0 } };
        const events = { main: [], e2: [] };
        const t0 = performance.now();
        const id = setInterval(() => {
          const now = +(performance.now() - t0).toFixed(1);
          for (const k of ['main', 'e2']) {
            const s = k === 'main' ? '.eeg-main' : '.eeg-echo-2';
            const d = get(s);
            if (d !== st[k].d) {
              st[k].d = d;
              events[k].push(now);
            }
          }
          if (now > 2600) {
            clearInterval(id);
            res(events);
          }
        }, 8);
      }),
  );
  const gaps = (a) => a.slice(1).map((v, i) => +(v - a[i]).toFixed(1));
  console.log('主波重写时刻(ms):', res.main.join(' '));
  console.log('主波间隔:', gaps(res.main).join(' '));
  console.log('灰道重写时刻(ms):', res.e2.join(' '));
  console.log('灰道间隔:', gaps(res.e2).join(' '));
  // 交替性：把两组事件合起来按时间排，看相邻事件是否来自不同的一条
  const all = [...res.main.map((t) => ({ t, k: 'main' })), ...res.e2.map((t) => ({ t, k: 'e2' }))].sort((a, b) => a.t - b.t);
  let alt = 0;
  for (let i = 1; i < all.length; i++) if (all[i].k !== all[i - 1].k) alt++;
  console.log('合并序列:', all.map((e) => e.k + '@' + e.t).join(' '));
  console.log(`相邻事件换手率: ${alt}/${all.length - 1}（全换手 ⇒ 完全交错）`);
  await browser.close();
})();
