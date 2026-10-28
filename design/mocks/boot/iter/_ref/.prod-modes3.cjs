const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '.prod-modes');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:4671/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  // reduced
  {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, 'reduced.png'), timeout: 30000 });
    console.log('reduced', await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), grain: !!window.__grainBoot, title: getComputedStyle(document.querySelector('.w-home-title')).opacity, reality: document.body.dataset.reality })));
    await p.close();
  }
  // no js
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, 'nojs.png'), timeout: 30000 });
    console.log('nojs shot ok');
    await ctx.close();
  }
  // natural
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(URL, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
    await p.waitForFunction('document.documentElement.classList.contains("grain-boot-done")', { timeout: 20000 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, 'natural-final.png'), timeout: 30000 });
    console.log('natural', JSON.stringify(await p.evaluate(() => ({ title: getComputedStyle(document.querySelector('.w-home-title')).opacity, eeg: getComputedStyle(document.getElementById('site-eeg-group')).opacity, ts: getComputedStyle(document.getElementById('ts')).opacity, light: getComputedStyle(document.getElementById('w-light')).opacity, seen: sessionStorage.getItem('xm-boot-seen') }))), 'errors', errs);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, 'reload-skip.png'), timeout: 30000 });
    console.log('reload', JSON.stringify(await p.evaluate(() => ({ data: document.documentElement.hasAttribute('data-grain-boot'), booted: document.documentElement.classList.contains('booted'), ctl: !!window.__grainCtl, title: getComputedStyle(document.querySelector('.w-home-title')).opacity }))));
    await ctx.close();
  }
  await b.close();
})();
