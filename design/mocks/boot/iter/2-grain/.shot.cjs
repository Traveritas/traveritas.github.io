/* 开屏 2 迭代 · 三案截图与实测
   node design/mocks/boot/iter/2-grain/.shot.cjs

   → .shots/
       <cand>-<ms>.png            桌面关键帧（1440×900）
       m-<cand>-<ms>.png          手机帧（390×844）
       r-<cand>.png               reduced-motion（1280×800，必须=首页静置）
       film/<cand>/NN.png         胶片条密帧（每 80ms 一帧，0–2000ms，720×450）
       contact-<cand>.png         桌面关键帧拼版（给自己看）
       contact-misc.png           手机 + reduced-motion 拼版
       meta.json                  每帧耗时 / 播放帧率 / 时间轴采样

   用已在跑的本地服务 http://localhost:4640（根 = 仓库根）。不另起服务。 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const BASE = 'http://localhost:4640/design/mocks/boot/iter/2-grain/';
const OUT = path.join(__dirname, '.shots');
const FILM = path.join(OUT, 'film');
fs.mkdirSync(FILM, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDS = ['a-step', 'b-flow', 'c-hybrid'];
const KEY = [0, 300, 550, 800, 1100, 1400, 1750, 1990];
const MOBILE_KEY = [0, 550, 1100, 1990];
const COST_AT = [0, 300, 600, 900, 1200, 1500];
const FILM_STEP = 80;
const FILM_N = Math.floor(2000 / FILM_STEP) + 1; // 26 帧

const errors = [];
const meta = { base: BASE, film: { step: FILM_STEP, n: FILM_N }, candidates: {} };

const shot = (page, file) => page.screenshot({ path: file });

async function fresh(browser, cand, { vp = { width: 1440, height: 900 }, dpr = 1, rm = false, qs = '' } = {}) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => errors.push(`${cand}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${cand}: ${m.text()}`));
  if (rm) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + cand + '/' + qs, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
  await page.evaluate(() => window.__boot.pause());
  return page;
}

async function at(page, ms, file) {
  await page.evaluate((m) => window.__boot.seek(m), ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(90);
  await shot(page, file);
}

/* 每帧重画耗时：挪 seek，走的是页面真实的重画路径（不是只量 canvas） */
async function bench(page) {
  return page.evaluate((list) => {
    const b = window.__boot;
    const out = {};
    for (const ms of list) {
      b.seek(ms); // 预热
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) b.seek(ms);
      out[ms] = +((performance.now() - t0) / 20).toFixed(2);
    }
    return out;
  }, COST_AT);
}

/* 自然播放的 rAF 间隔。先回到 0，再放满整整 2000ms，才量得到开屏本身的帧。 */
async function playIntervals(page) {
  await page.evaluate(() => window.__boot.seek(0));
  const before = await page.evaluate(() => window.__boot.stats());
  const play = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const t0 = last;
        window.__boot.resume();
        function f(now) {
          deltas.push(+(now - last).toFixed(2));
          last = now;
          if (now - t0 < 2100) requestAnimationFrame(f);
          else {
            window.__boot.pause();
            resolve({ deltas });
          }
        }
        requestAnimationFrame(f);
      }),
  );
  const after = await page.evaluate(() => window.__boot.stats());
  return {
    deltas: play.deltas,
    paints: after.paints - before.paints,
    frames: play.deltas.length,
    lastPaintMs: after.lastPaintMs,
  };
}

const pct = (arr, q) => {
  const a = arr.slice().sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
};

/* 拼版：把若干张 png 排成一张，肉眼一次看完 */
async function contact(browser, name, title, cols, rows) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cards = rows
    .map(
      (r) => `<figure><img src="${esc(r.src)}" width="${r.w}"><figcaption>${esc(r.label)}</figcaption></figure>`,
    )
    .join('');
  const html =
    `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#080911;color:#c9c5d8;font:12px/1.4 'IBM Plex Mono',monospace;padding:14px 16px}
      h2{font:500 14px/1 'Noto Serif SC',serif;letter-spacing:.2em;color:#ece8f2;margin:2px 0 14px}
      .grid{display:grid;grid-template-columns:repeat(${cols},max-content);gap:10px 12px}
      figure{margin:0}
      img{display:block;border:1px solid #262638;background:#0e0f1d}
      figcaption{margin-top:4px;color:#827f98}
      </style><h2>${esc(title)}</h2><div class="grid">${cards}</div>`;
  const f = path.join(OUT, '_sheet.html');
  fs.writeFileSync(f, html);
  const page = await browser.newPage({ viewport: { width: 1620, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '.shots/_sheet.html?x=' + Date.now(), { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), { timeout: 60000 });
  await sleep(80);
  await page.screenshot({ path: path.join(OUT, `contact-${name}.png`), fullPage: true });
  await page.close();
  fs.unlinkSync(f);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });

  for (const cand of CANDS) {
    const c = (meta.candidates[cand] = {});
    const page = await fresh(browser, cand);
    c.firstStats = await page.evaluate(() => window.__boot.stats());
    c.total = await page.evaluate(() => window.__boot.total);
    // 时间轴采样（纯函数 probe）
    c.timeline = await page.evaluate(() =>
      [0, 250, 500, 750, 1000, 1250, 1500, 1750, 1990].map((ms) => {
        const s = window.__boot.probe(ms);
        return { ms, cell: +s.cellPx.toFixed(2), lv: +s.levels.toFixed(1), dither: +s.dither.toFixed(2), state: s.state };
      }),
    );

    for (const ms of KEY) {
      await at(page, ms, path.join(OUT, `${cand}-${String(ms).padStart(4, '0')}.png`));
    }
    /* B 的首帧证据：画布四角 / 中心是否为同一个颜色、网点与字是否都不在 */
    if (cand === 'b-flow') {
      /* 从时间轴本身算出：首帧一格多大、第一分裂在第几毫秒（不靠目测） */
      c.split = await page.evaluate(() => {
        const cw = Math.ceil(innerWidth / 5), ch = Math.ceil(innerHeight / 5);
        let first = null, two = null;
        for (let ms = 0; ms <= 900; ms += 1) {
          const c = window.__boot.probe(ms).cellPx / 5;
          const bx = Math.max(1, Math.ceil(cw / c - 1e-9));
          const by = Math.max(1, Math.ceil(ch / c - 1e-9));
          if (first === null && bx > 1) first = ms;
          if (two === null && bx > 1 && by > 1) two = ms;
        }
        return { cell0: +window.__boot.probe(0).cellPx.toFixed(1), firstSplitMs: first, twoByTwoMs: two, viewport: [innerWidth, innerHeight] };
      });
      c.firstFrame = {};
      for (const ms of [0, 40, 80, 120, 160, 240, 400]) {
        await page.evaluate((m) => window.__boot.seek(m), ms);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await at(page, ms, path.join(OUT, 'first-' + String(ms).padStart(4, '0') + '.png'));
        c.firstFrame[ms] = await page.evaluate(() => {
          const cv = document.querySelector('.boot-face');
          const ctx = cv.getContext('2d');
          const W = cv.width, H = cv.height;
          const pick = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
          const corners = [pick(0, 0), pick(W - 1, 0), pick(0, H - 1), pick(W - 1, H - 1)];
          const centre = pick(W >> 1, H >> 1);
          const same = corners.every((c) => c.join() === corners[0].join()) && centre.join() === corners[0].join();
          return {
            uniformCanvas: same,
            corner: corners[0],
            centre,
            mean255: window.__boot.stats().mean.map((v) => Math.round(v * 255)),
            dotOpacity: getComputedStyle(document.querySelector('.boot-dot')).opacity,
            brandOpacity: getComputedStyle(document.querySelector('.h-brand')).opacity,
            kickerOpacity: getComputedStyle(document.querySelector('.h-kicker')).opacity,
            lineMask: (document.getElementById('h-eeg-path').style.maskImage || '').slice(0, 90),
            cellPx: +window.__boot.probe(window.__boot.time).cellPx.toFixed(1),
            whole: window.__boot.probe(window.__boot.time).whole,
            blocksX: Math.max(1, Math.ceil(cv.width / (window.__boot.probe(window.__boot.time).cellPx / 5) - 1e-9)),
            blocksY: Math.max(1, Math.ceil(cv.height / (window.__boot.probe(window.__boot.time).cellPx / 5) - 1e-9)),
          };
        });
      }
    }
    c.cost = await bench(page);
    const play = await playIntervals(page);
    c.play = {
      frames: play.frames,
      paints: play.paints,
      avgDelta: +(play.deltas.reduce((a, b) => a + b, 0) / play.deltas.length).toFixed(2),
      p95Delta: pct(play.deltas, 0.95),
      maxDelta: Math.max(...play.deltas),
      over20ms: play.deltas.filter((d) => d > 20).length,
      lastPaintMs: play.lastPaintMs,
    };
    await page.close();

    /* 胶片条密帧：dpr 0.5 拍，720×450，页面在对比台里显示 240px 宽 */
    const fdir = path.join(FILM, cand);
    fs.mkdirSync(fdir, { recursive: true });
    const fp = await fresh(browser, cand, { dpr: 0.5 });
    for (let i = 0; i < FILM_N; i++) {
      const ms = i * FILM_STEP;
      await fp.evaluate((m) => window.__boot.seek(m), ms);
      await fp.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      await shot(fp, path.join(fdir, String(i).padStart(2, '0') + '.png'));
    }
    await fp.close();

    /* ?print=1：上一版粗段的块级 Bayer 质感，同刻对照 */
    if (cand === 'b-flow') {
      const pp = await fresh(browser, cand, { qs: '?print=1' });
      for (const ms of [0, 160, 240, 400, 550, 800]) {
        await at(pp, ms, path.join(OUT, 'print-' + String(ms).padStart(4, '0') + '.png'));
      }
      await pp.close();
    }

    /* 手机 */
    const mp = await fresh(browser, cand, { vp: { width: 390, height: 844 } });
    for (const ms of MOBILE_KEY) {
      await at(mp, ms, path.join(OUT, `m-${cand}-${String(ms).padStart(4, '0')}.png`));
    }
    if (cand === 'b-flow') {
      /* 手机 + 4× CPU 降速：看中端机上的帧间隔（只测最重的一版） */
      const client = await mp.context().newCDPSession(mp);
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const play4 = await playIntervals(mp);
      c.playMobile4x = {
        frames: play4.frames,
        paints: play4.paints,
        avgDelta: +(play4.deltas.reduce((a, b) => a + b, 0) / play4.deltas.length).toFixed(2),
        p95Delta: pct(play4.deltas, 0.95),
        maxDelta: Math.max(...play4.deltas),
        over20ms: play4.deltas.filter((d) => d > 20).length,
        lastPaintMs: play4.lastPaintMs,
      };
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await mp.close();

    /* b-flow 的另两种缓动（前慢后快 / 对数匀速）：只拍静帧留证 */
    if (cand === 'b-flow') {
      for (const [tag, qs] of [
        ['settle', ''],
        ['even', '?ease=even'],
        ['creep', '?ease=creep'],
      ]) {
        const ep = await fresh(browser, cand, { qs });
        for (const ms of [0, 300, 800, 1300]) {
          await at(ep, ms, path.join(OUT, 'ease-' + tag + '-' + String(ms).padStart(4, '0') + '.png'));
        }
        await ep.close();
      }
    }

    /* 无 JS：脚本不跑，静态 HTML 必须已经是一张首页，不许留幕 */
    const np = await browser.newPage({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
    await np.goto(BASE + cand + '/', { waitUntil: 'networkidle' });
    await sleep(250);
    await shot(np, path.join(OUT, 'nojs-' + cand + '.png'));
    await np.close();

    /* reduced-motion：必须直接落首页 */
    const rp = await fresh(browser, cand, { vp: { width: 1280, height: 800 }, rm: true });
    await sleep(200);
    await shot(rp, path.join(OUT, `r-${cand}.png`));
    c.reducedMotion = await rp.evaluate(() => {
      const cv = document.querySelector('.boot-face');
      return {
        canvas: cv ? getComputedStyle(cv).display : 'none',
        at: window.__boot.time,
        ready: window.__boot.ready,
      };
    });
    await rp.close();

    console.log(cand, '| cost', JSON.stringify(c.cost), '| play', JSON.stringify(c.play));
  }

  /* 拼版：每案 8 帧桌面（4×2） */
  for (const cand of CANDS) {
    await contact(
      browser,
      cand,
      `${cand} · 桌面关键帧 0 / 300 / 550 / 800 / 1100 / 1400 / 1750 / 1990 ms`,
      4,
      KEY.map((ms) => ({
        src: `${cand}-${String(ms).padStart(4, '0')}.png`,
        label: `${ms}ms`,
        w: 372,
      })),
    );
  }

  /* 拼版：手机 4 帧×3 案 + reduced-motion */
  const miscRows = [];
  for (const cand of CANDS) {
    for (const ms of MOBILE_KEY) {
      miscRows.push({ src: `m-${cand}-${String(ms).padStart(4, '0')}.png`, label: `${cand} ${ms}`, w: 190 });
    }
  }
  for (const cand of CANDS) miscRows.push({ src: `r-${cand}.png`, label: `${cand} reduced-motion`, w: 190 });
  for (const cand of CANDS) miscRows.push({ src: `nojs-${cand}.png`, label: `${cand} 无 JS`, w: 190 });
  /* 拼版：B 的首帧与分裂（0 / 40 / 80 / 120 / 160 / 240 / 400ms） */
  await contact(
    browser,
    'b-first',
    'B · 首帧一格 = 整屏（1728px）→ 分裂 → 收细（0/40/80/120/160/240/400ms）',
    7,
    [0, 40, 80, 120, 160, 240, 400].map((ms) => ({
      src: 'first-' + String(ms).padStart(4, '0') + '.png',
      label: ms + 'ms',
      w: 300,
    })),
  );

  /* 拼版：干净 vs print（同一时刻上下两排） */
  {
    const cleanSrc = (ms) =>
      ms === 0 || ms === 160 || ms === 240 || ms === 400
        ? 'first-' + String(ms).padStart(4, '0') + '.png'
        : 'b-flow-' + String(ms).padStart(4, '0') + '.png';
    const rows = [];
    for (const ms of [0, 160, 240, 400, 550, 800]) rows.push({ src: cleanSrc(ms), label: 'clean ' + ms + 'ms', w: 260 });
    for (const ms of [0, 160, 240, 400, 550, 800]) rows.push({ src: 'print-' + String(ms).padStart(4, '0') + '.png', label: 'print=1 ' + ms + 'ms', w: 260 });
    await contact(browser, 'print', 'B · 默认（上）／ ?print=1 旧印刷质感（下）', 6, rows);
  }

  await contact(browser, 'misc', '手机 390×844 · 每案 4 帧 ／ reduced-motion · 每案 1 帧', 6, miscRows);

  /* 拼版：b 的三种缓动（同一格宽曲线，三种时间分布） */
  const easeRows = [];
  for (const tag of ['settle', 'even', 'creep']) {
    for (const ms of [0, 300, 800, 1300]) {
      const src = 'ease-' + tag + '-' + String(ms).padStart(4, '0') + '.png';
      easeRows.push({ src, label: tag + ' ' + ms, w: 300 });
    }
  }
  await contact(browser, 'ease', 'b-flow · 三种缓动下的同一格宽时间分布', 4, easeRows);

  /* 拼版：胶片条（把密帧也排一次，方便单张看） */
  for (const cand of CANDS) {
    const rows = [];
    for (let i = 0; i < FILM_N; i++) {
      rows.push({ src: `film/${cand}/${String(i).padStart(2, '0')}.png`, label: `${i * FILM_STEP}`, w: 240 });
    }
    await contact(browser, `film-${cand}`, `${cand} · 胶片条（每 80ms 一帧，0–2000ms）`, 7, rows);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log('\n=== 每帧重画耗时（seek 20 次平均，ms）===');
  console.log('t(ms)   ' + COST_AT.map((t) => String(t).padStart(7)).join(''));
  for (const cand of CANDS) {
    console.log(cand.padEnd(8) + COST_AT.map((t) => String(meta.candidates[cand].cost[t]).padStart(7)).join(''));
  }
  console.log('\n=== 自然播放（桌面 1440×900，满速）===');
  for (const cand of CANDS) console.log(cand, JSON.stringify(meta.candidates[cand].play));
  if (meta.candidates['b-flow'].playMobile4x) {
    console.log('b-flow 手机 4× CPU 降速：', JSON.stringify(meta.candidates['b-flow'].playMobile4x));
  }
  console.log('\n=== reduced-motion ===');
  for (const cand of CANDS) console.log(cand, JSON.stringify(meta.candidates[cand].reducedMotion));

  if (errors.length) {
    console.log('\n--- 页面报错 ---');
    for (const e of [...new Set(errors)]) console.log(e);
  } else console.log('\n无页面报错');

  console.log('\nshot done →', path.relative(process.cwd(), OUT));
})();

