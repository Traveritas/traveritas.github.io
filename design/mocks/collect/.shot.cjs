/* 拾得 · 截图
   node design/mocks/collect/.shot.cjs        → design/mocks/collect/.shots/
   ONLY=tiers,dark,tilt,approach,take,panel,mobile     只拍一部分

   时钟停住（__w.freeze），召来的东西放在固定位置，再一段段往前推（__w.advance），拍到的是确定的那一帧。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./server.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/collect/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (qs = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${qs}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs}: ${m.text()}`));
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
    await page.goto(URL + '?view=explore&luck=0' + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__w && window.__cx', { timeout: 20000 });
    await sleep(2600);
    await page.mouse.move(vp.width * 0.78, vp.height * 0.28); // 指针偏一边，看得出层间视差
    await page.evaluate(() => __w.freeze());
    return page;
  };
  // 分小段推：拾得那边的循环靠 rAF 读时钟，一次推太远它只看到一帧
  const adv = async (page, ms) => { for (let k = 0; k < ms; k += 100) { await page.evaluate((m) => __w.advance(m), Math.min(100, ms - k)); await sleep(24); } await sleep(140); };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const clearLive = (page) => page.evaluate(() => { for (const r of [...__cx.live]) { r.out = 1; } });

  // 每一档放在焦平面上各拍一张
  if (want('tiers')) {
    const page = await fresh();
    const ids = await page.evaluate(() => __cx.ITEMS.map((i) => i.id));
    for (const id of ids) {
      await clearLive(page);
      await adv(page, 100);
      await page.evaluate((id) => __cx.spawn(id, 1, { x: 0.12, y: 0.02 }), id);
      await adv(page, 1400);
      await shot(page, `tier-${id}`);
    }
    await page.close();
  }

  // 另外几种外壳（shells.js）：每种 × 每一档，浅夜全拍，深夜拍三件；SHELLS=contour,text 只拍一部分
  if (want('shells')) {
    const list = (process.env.SHELLS || 'contour,text,moire,agate,glass,window').split(',');
    for (const sh of list) {
      for (const sc of ['essay', 'moment']) {
        const page = await fresh(`&shell=${sh}&scene=${sc}`);
        const ids = sc === 'essay' ? await page.evaluate(() => __cx.ITEMS.map((i) => i.id)) : ['pebble', 'key', 'moon'];
        for (const id of ids) {
          await clearLive(page);
          await adv(page, 100);
          await page.evaluate((id) => __cx.spawn(id, 1, { x: 0.12, y: 0.02 }), id);
          await adv(page, 2000);
          await shot(page, `sh-${sh}-${sc === 'essay' ? '' : 'dark-'}${id}`);
        }
        await page.close();
      }
    }
  }

  // 深色的夜（瞬间）里同样几档
  if (want('dark')) {
    const page = await fresh('&scene=moment');
    for (const id of ['pebble', 'key', 'moon']) {
      await clearLive(page);
      await adv(page, 100);
      await page.evaluate((id) => __cx.spawn(id, 1, { x: 0.12, y: 0.02 }), id);
      await adv(page, 2400);
      await shot(page, `dark-${id}`);
    }
    await page.close();
  }

  // 倾斜的一版
  if (want('tilt')) {
    for (const sc of ['essay', 'moment']) {
      const page = await fresh(`&tilt=1&scene=${sc}`);
      for (const id of ['marble', 'key', 'moon']) {
        await clearLive(page);
        await adv(page, 100);
        await page.evaluate((id) => __cx.spawn(id, 1, { x: 0.12, y: 0.02 }), id);
        await adv(page, 2400);
        await shot(page, `tilt-${sc}-${id}`);
      }
      await page.close();
    }
  }

  // 从深处浮上来 → 焦平面 → 糊过去
  if (want('approach')) {
    const page = await fresh();
    await page.evaluate(() => __cx.spawn('key', 2.3, { x: 0.1, y: 0.04 }));
    await adv(page, 1200);
    const steps = [0, 0.6, 1.0, 1.3, 1.6];
    let z0 = await page.evaluate(() => __w.cam.z);
    for (const [i, d] of steps.entries()) {
      await page.evaluate((z) => { __w.zT = z; }, z0 + d);
      await adv(page, 1600);
      await shot(page, `approach-${i}`);
    }
    await page.close();
  }

  // 拾起：收拢 + 飞向口袋
  if (want('take')) {
    const page = await fresh();
    await page.evaluate(() => __cx.spawn('feather', 1, { x: 0.05, y: 0 }));
    await adv(page, 1400);
    await page.evaluate(() => __cx.take([...__cx.live][0]));
    for (const [i, ms] of [350, 400, 500].entries()) {
      await adv(page, ms);
      await shot(page, `take-${i}`);
    }
    await page.close();
  }

  if (want('panel')) {
    const page = await fresh();
    await page.evaluate(() => {
      for (const id of ['pebble', 'leaf', 'marble', 'key']) __cx.store.items[id] = { n: id === 'pebble' ? 14 : 1, first: Date.now() };
      __cx.setPanel(true);
    });
    await adv(page, 300);
    await shot(page, 'panel');
    await page.close();
  }

  if (want('mobile')) {
    const page = await fresh('', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => __cx.spawn('moon', 1, { x: 0, y: 0.02 }));
    await adv(page, 1400);
    await shot(page, 'mobile');
    await page.close();
  }

  await browser.close();
  server.close();
  if (errors.length) { console.log('errors:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('ok →', OUT);
})();
