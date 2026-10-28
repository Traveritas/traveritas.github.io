const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    window.__frames = [];
    let last = performance.now();
    const loop = (t) => { window.__frames.push(+(t - last).toFixed(1)); last = t; if (window.__frames.length < 400) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await p.goto('http://127.0.0.1:4671/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const data = await p.evaluate(() => ({
    frames: window.__frames.slice(0, 200),
    data: document.documentElement.hasAttribute('data-grain-boot'),
    done: document.documentElement.classList.contains('grain-boot-done'),
    ctl: !!window.__grainCtl,
  }));
  const f = data.frames.filter(x => x > 0);
  f.sort((a,b)=>a-b);
  console.log('n', f.length, 'median', f[f.length>>1], 'p95', f[Math.floor(f.length*0.95)], 'max', f[f.length-1], 'state', JSON.stringify({data:data.data,done:data.done,ctl:data.ctl}));
  console.log('first 80 frames', data.frames.slice(0,80).join(','));
  await b.close();
})();
