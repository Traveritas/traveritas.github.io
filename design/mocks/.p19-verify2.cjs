/* 收尾验收：① 虚线 6× 裁片 ② 游走连续性时间序列（有色 vs 灰道）
   用法：先 npm run dev -- --port 4321，再 node design/mocks/.p19-verify2.cjs */
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
    const z = 1;
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: z });
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

  // ① 游走连续性：3s 每 100ms 采一次 transform
  await open('dream');
  await page.evaluate(() => {
    window.__samp = { e1: [], e2: [], e3: [] };
    window.__t = setInterval(() => {
      for (const k of ['e1', 'e2', 'e3']) {
        const cls = k === 'e1' ? 'eeg-echo-1' : k === 'e2' ? 'eeg-echo-2' : 'eeg-echo-3';
        const el = document.querySelector('.eeg .' + cls);
        if (el) window.__samp[k].push(getComputedStyle(el).transform);
      }
    }, 100);
  });
  await sleep(3000);
  const samp = await page.evaluate(() => {
    clearInterval(window.__t);
    return window.__samp;
  });
  const summarize = (arr) => {
    const uniq = [...new Set(arr)];
    const ty = (s) => {
      const m = /matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/.exec(s) || /translateY\((-?[\d.]+)px\)/.exec(s);
      return m ? parseFloat(m[1]) : s === 'none' ? 0 : NaN;
    };
    const vals = arr.map(ty);
    let maxStep = 0;
    for (let i = 1; i < vals.length; i++) maxStep = Math.max(maxStep, Math.abs(vals[i] - vals[i - 1]));
    return { n: arr.length, distinct: uniq.length, min: Math.min(...vals), max: Math.max(...vals), maxStepPer100ms: +maxStep.toFixed(3) };
  };
  console.log('e1(amber, 有色) 游走:', JSON.stringify(summarize(samp.e1)));
  console.log('e2(wake , 灰道) 游走:', JSON.stringify(summarize(samp.e2)));
  console.log('e3(sand , 有色) 游走:', JSON.stringify(summarize(samp.e3)));

  // ② 6× 裁片：虚线本体 + 全束
  const snap = async (name, face, { z, clip }) => {
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
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    console.log('shot', name);
  };
  await snap('p19-dash6', 'dream', { z: 6, clip: { x: 850, y: 425, width: 300, height: 115 } });
  await snap('p19-bundle5', 'dream', { z: 5, clip: { x: 380, y: 300, width: 560, height: 240 } });
  await snap('p19-wake5', 'wake', { z: 5, clip: { x: 380, y: 300, width: 560, height: 240 } });

  console.log('--- errors:', errs.length ? errs.slice(0, 5) : 'none');
  await browser.close();
})();
