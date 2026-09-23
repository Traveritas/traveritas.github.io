/* 改动验收：路径形态（阶梯 vs 连续）/ 虚线 / 游走动画 / 两态对照截图
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-verify.cjs */
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
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });

  const open = async (face, url = '/articles/?fld=off') => {
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

  const read = () =>
    page.evaluate(() => {
      const svg = document.querySelector('.eeg');
      const one = (sel) => {
        const el = svg.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const d = el.getAttribute('d') || '';
        const cmds = { M: 0, L: 0, H: 0, V: 0 };
        for (const ch of d) if (ch in cmds) cmds[ch]++;
        return {
          stroke: cs.stroke,
          w: cs.strokeWidth,
          op: cs.opacity,
          dash: cs.strokeDasharray,
          anim: cs.animationName + ' ' + cs.animationDuration + ' ' + cs.animationTimingFunction,
          cmds,
          dHead: d.slice(0, 70),
        };
      };
      return {
        bands: document.querySelectorAll('.esb, .echo-stave').length,
        main: one('.eeg-main'),
        e1: one('.eeg-echo-1'),
        e2: one('.eeg-echo-2'),
        e3: one('.eeg-echo-3'),
        still: getComputedStyle(document.documentElement).getPropertyValue('--still').trim(),
      };
    });

  // ── 数值口径
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await open('dream');
  const dream = await read();
  await open('wake');
  const wake = await read();
  fs.writeFileSync(path.join(OUT, 'verify.json'), JSON.stringify({ dream, wake }, null, 2));
  const line = (tag, r) => {
    if (!r) return;
    console.log(
      `${tag}  cmds M${r.cmds.M} L${r.cmds.L} H${r.cmds.H} V${r.cmds.V} | dash ${r.dash} | anim ${r.anim} | op ${r.op}`,
    );
  };
  console.log('=== DREAM === bands in DOM:', dream.bands, 'still', dream.still);
  line('main', dream.main);
  line('e1(amber)', dream.e1);
  line('e2(wake) ', dream.e2);
  line('e3(dream)', dream.e3);
  console.log('=== WAKE === still', wake.still);
  line('main', wake.main);
  line('e1(amber)', wake.e1);
  line('e2(wake) ', wake.e2);
  line('e3(dream)', wake.e3);
  console.log('dHead e1 dream:', dream.e1 && dream.e1.dHead);
  console.log('dHead e3 dream:', dream.e3 && dream.e3.dHead);
  console.log('dHead main dream:', dream.main && dream.main.dHead);

  // ── 截图：两态全屏 + 3× 裁片
  const snap = async (name, face, { z = 1, clip } = {}) => {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
    await open(face);
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('shot', name);
  };
  const C = { x: 600, y: 400, width: 600, height: 200 };
  await snap('p19-dream-full', 'dream');
  await snap('p19-wake-full', 'wake');
  await snap('p19-dream-zoom', 'dream', { z: 3, clip: C });
  await snap('p19-wake-zoom', 'wake', { z: 3, clip: C });

  console.log('--- errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
