const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'design/mocks/boot/iter/_ref/.real-boot');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('http://127.0.0.1:4670/?grain=1', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const info0 = await p.evaluate(() => ({
    grainBoot: !!window.__grainBoot,
    dataAttr: document.documentElement.hasAttribute('data-grain-boot'),
    hasCtl: !!window.__grainCtl,
    booted: document.documentElement.classList.contains('booted'),
    lightReady: window.__wander ? window.__wander.lightReady : 'no-wander',
  }));
  console.log('initial', JSON.stringify(info0));
  await p.waitForFunction('window.__grainCtl && window.__grainCtl.ready', { timeout: 20000 });
  const info1 = await p.evaluate(() => ({
    total: window.__grainCtl.total,
    dataAttr: document.documentElement.hasAttribute('data-grain-boot'),
    booted: document.documentElement.classList.contains('booted'),
    lightReady: window.__wander.lightReady,
    light: (() => { const c = document.getElementById('w-light'); return c ? [c.width, c.height, getComputedStyle(c).opacity] : null; })(),
  }));
  console.log('ready', JSON.stringify(info1));
  await p.evaluate(() => window.__grainCtl.pause());
  for (const ms of [0, 120, 300, 500, 800, 1100, 1400, 1600]) {
    await p.evaluate(m => window.__grainCtl.seek(m), ms);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(OUT, `g-${String(ms).padStart(4,'0')}.png`) });
    const st = await p.evaluate(() => ({
      ms: window.__grainCtl ? null : null,
      booted: document.documentElement.classList.contains('booted'),
      dataAttr: document.documentElement.hasAttribute('data-grain-boot'),
      grain: window.__bootGrainDebug || null,
    }));
    if (ms === 0 || ms === 300 || ms === 1600) console.log(ms, JSON.stringify(st));
  }
  await p.evaluate(() => window.__grainCtl.seek(1600));
  await p.waitForTimeout(300);
  console.log('final', JSON.stringify(await p.evaluate(() => ({
    booted: document.documentElement.classList.contains('booted'),
    dataAttr: document.documentElement.hasAttribute('data-grain-boot'),
    done: document.documentElement.classList.contains('grain-boot-done'),
    brand: document.querySelector('.w-home-brand')?.textContent,
    lightOp: getComputedStyle(document.getElementById('w-light')).opacity,
    titleOp: getComputedStyle(document.querySelector('.w-home-title')).opacity,
    tsOp: getComputedStyle(document.getElementById('ts')).opacity,
  }))));
  console.log('errors', [...new Set(errs)]);
  await b.close();
})();
