const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.prod-modes');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:4671/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const report = {};

  // 1) grain=0
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL + '?grain=0', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, 'skip-grain.png') });
    report.skip = await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), grain: !!window.__grainBoot, ctl: !!window.__grainCtl, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity }));
    report.skipErrors = errs; await p.close();
  }
  // 2) reduced motion
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, 'reduced.png') });
    report.reduced = await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), grain: !!window.__grainBoot, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, reality: document.body.dataset.reality }));
    await p.close();
  }
  // 3) no JS
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, 'nojs.png') });
    report.nojs = await p.evaluate(() => ({ titleOpacity: getComputedStyle(document.querySelector('.w-home-title')).opacity, brand: document.querySelector('.w-home-brand')?.textContent, lightOpacity: getComputedStyle(document.getElementById('w-light')).opacity }));
    await ctx.close();
  }
  // 4) natural first visit
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
    await p.waitForFunction('document.documentElement.classList.contains("grain-boot-done")', { timeout: 20000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, 'natural-final.png') });
    report.natural = await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), done: document.documentElement.classList.contains('grain-boot-done'), title: getComputedStyle(document.querySelector('.w-home-title')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, ts: getComputedStyle(document.getElementById('ts')).opacity, seen: sessionStorage.getItem('xm-boot-seen') }));
    report.naturalErrors = errs;
    // 5) reload same context: should skip, no hidden state
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForTimeout(1000);
    await p.screenshot({ path: path.join(OUT, 'reload-skip.png') });
    report.reload = await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), ctl: !!window.__grainCtl, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity }));
    await ctx.close();
  }
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
