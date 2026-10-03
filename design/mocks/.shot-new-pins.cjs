/* 主页测量点点击反馈截图：node design/mocks/.shot-new-pins.cjs [tag]
   常态 → 点「随笔」后 0.45s（涟漪中途）→ 1.8s（激活常驻）；桌面醒 / 梦各一组，窄屏醒面一组。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));
const TAG = process.argv[2] || '';
const OUT = path.join(__dirname, '_shots-scene');
fs.mkdirSync(OUT, { recursive: true });
const name = (s) => path.join(OUT, `newpin-${TAG ? TAG + '-' : ''}${s}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 120000 });
  for (const [reality, w, h, mobile] of [['wake', 1440, 900, false], ['dream', 1440, 900, false], ['wake', 390, 844, true]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await page.evaluateOnNewDocument((r) => {
      try { sessionStorage.setItem('xm-reality', r); localStorage.setItem('xm-reality-guided-v2', '1'); } catch {}
    }, reality);
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto('http://localhost:4321/', { waitUntil: 'networkidle0' });
    await sleep(9000);
    const tag = `${reality}-${mobile ? 'm' : 'd'}`;
    await page.screenshot({ path: name(`${tag}-0`) });
    const b = await page.$('.pin-articles .pin-dot');
    const box = await b.boundingBox();
    if (mobile) await page.touchscreen.tap(box.x + 10, box.y + 10);
    else await page.mouse.click(box.x + 10, box.y + 10);
    await sleep(450);
    await page.screenshot({ path: name(`${tag}-1`) });
    await sleep(1400);
    if (!mobile) await page.mouse.move(5, 5); // 移开指针：看的是「点击激活」本身，不是悬停
    await sleep(500);
    await page.screenshot({ path: name(`${tag}-2`) });
    console.log(tag, 'ok');
    await page.close();
  }
  await browser.close();
})();
