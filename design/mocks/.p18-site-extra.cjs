/* ─────────────────────────────────────────────────────────────
   Phase 18 站点落地 · 数值实测（主会话用）
   口径全部现算，不读 mock 的读数：
     A 生成读数（window.__fld）+ 节点/块数
     B --fld-rewind 梦态 computed transform
     C 方块 0/3/6s 净位移（梦 vs 醒）+ 10s 包络 + 速度/方向
     D 脑电主波 d 变化次数（梦 3.2s / 醒 3.2s）+ 三道残影每拍互异
     E 醒态「有层/无层」逐像素差（含对照组噪声）
     F 版心内最亮处 ÷ 相邻墨色亮度差（三 zone × 醒梦，红线 35%）
     G 新增 rAF / 监听（有层 vs ?fld=off 差分 + 注册点堆栈）
     H 首屏可读：构块场在首屏的贡献 + 缝线/脑电在宣言纸上的贡献
   用法：先 npm run dev -- --port 4331，再 node design/mocks/.p18-site-extra.cjs
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const os = require('os');
const fs = require('fs');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4331';
const OUT = path.resolve(__dirname, '.shots-p18-site');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 可分段跑：node .p18-site-extra.cjs F G H I（不给参数＝全跑） */
const MODES = process.argv.slice(2);
const want = (m) => !MODES.length || MODES.includes(m);

/* 三段夜色的 token（照抄 src/data/night.ts 的 ZONES；站点上它们由 night.ts 按滚动写入，
   这里为了「同一正文块 × 三 zone」对拍而直接钉住 —— 测量手段，不改站点代码） */
const ZONES = {
  light: { bg: '#e9ecef', ink: '#262c33', soft: '#59626c', line: 'rgba(38, 44, 51, 0.16)' },
  deep: { bg: '#171b24', ink: '#e5e0d2', soft: '#b9b3a4', line: 'rgba(229, 224, 210, 0.16)' },
  paper: { bg: '#efe9dd', ink: '#55503f', soft: '#665f50', line: 'rgba(85, 80, 63, 0.16)' },
};

const retry = async (fn, n = 4) => {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === n - 1) throw e;
      await sleep(500);
    }
  }
};

/* 页内像素工具（与 mock 的 .p18-extra.cjs 同口径；boxes 版：逐个文字框内取最亮处） */
const BOX_DIFF_FN = `async function boxDiff(a, b, boxes) {
  const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas');
  c.width = ia.width; c.height = ia.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  let worst = { dL: -1, at: null, i: -1 }, maxAll = 0;
  for (let k = 0; k < boxes.length; k++) {
    const bx = boxes[k];
    for (let y = Math.round(bx.t); y < Math.round(bx.b); y++) {
      for (let x = Math.round(bx.l); x < Math.round(bx.r); x++) {
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const i = (y * c.width + x) * 4;
        const dL = Math.abs(L(A, i) - L(B, i));
        if (dL > maxAll) maxAll = dL;
        if (dL > worst.dL) worst = { dL, i: k, at: { x, y, on: [A[i], A[i+1], A[i+2]].join(','), off: [B[i], B[i+1], B[i+2]].join(',') } };
      }
    }
  }
  return { maxIn: Math.max(0, worst.dL), worst: worst.at, which: worst.i, maxAll, nBoxes: boxes.length };
}`;

/* 页内像素工具（与 mock 的 .p18-extra.cjs 同口径） */
const DIFF_FN = `async function diff(a, b, box) {
  const load = async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); return im; };
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const c = document.createElement('canvas');
  c.width = ia.width; c.height = ia.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(ia, 0, 0); const A = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(ib, 0, 0); const B = ctx.getImageData(0, 0, c.width, c.height).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  let maxAll = 0, maxIn = 0, at = null, nCh = 0, maxCh = 0;
  const x0 = box ? Math.round(box.l) : 0, x1 = box ? Math.round(box.r) : c.width;
  const y0 = box ? Math.round(box.t) : 0, y1 = box ? Math.round(box.b) : c.height;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const ch = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
      if (ch > maxCh) maxCh = ch;
      if (ch > 0) nCh++;
      const dL = Math.abs(L(A, i) - L(B, i));
      if (dL > maxAll) maxAll = dL;
      if (x >= x0 && x < x1 && y >= y0 && y < y1 && dL > maxIn) {
        maxIn = dL; at = { x, y, on: [A[i], A[i+1], A[i+2]].join(','), off: [B[i], B[i+1], B[i+2]].join(',') };
      }
    }
  }
  return { maxIn, maxAll, at, nCh, maxCh, w: c.width, h: c.height };
}`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });

  const mk = async (w = 1440, h = 900, opts = {}) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    if (opts.rm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (opts.face) {
      await page.evaluateOnNewDocument((f) => {
        try {
          sessionStorage.setItem('xm-reality', f);
          sessionStorage.setItem('xm-boot-seen', '1');
        } catch {
          /* ignore */
        }
      }, opts.face);
    }
    return page;
  };
  const goto = async (page, url, q = '', wait = 2400) => {
    await retry(async () => {
      await page.goto(BASE + url + q, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
    });
    await sleep(wait);
  };

  /* ═══ A · 生成读数 ═══ */
  if (want('A')) {
    const p = await mk();
    await goto(p, '/', '?fld=off');
    await sleep(300);
    const off = await p.evaluate(() => ({
      nodes: document.querySelectorAll('#fld-field *').length,
      hasFld: !!window.__fld,
      raf: typeof window.requestAnimationFrame,
    }));
    await goto(p, '/');
    await sleep(300);
    const on = await p.evaluate(() => window.__fld);
    console.log('\n── A · 生成读数 ──');
    console.log(`?fld=off: #fld-field 内节点 ${off.nodes}`);
    console.log(
      `默认种子 ${on.seed}｜构造体 ${on.clusters}（每份 ${on.clustersPerCopy}）｜方块 ${on.squares}｜交叠窗 ${on.cuts}｜节点 ${on.nodes}｜生成 ${on.ms}ms`,
    );
    console.log(
      `断言①醒态重叠 ${on.a_tiledOverlapPairs} 对（最差 ${on.a_tiledWorstOverlapPx}px²）②相邻边间隙 ${on.b_gapMinPx}–${on.b_gapMaxPx}px（${on.b_gapPairs} 对，分布 ${JSON.stringify(on.b_gapDist)}，落单 ${on.b_isolated}）③跨副本 ${on.c_copyOverlapPairs} 对`,
    );
    console.log(
      `梦态叠深 ≤${on.d_looseDepthMax}｜构体错开尺寸 ${on.e_looseSpanMin}–${on.e_looseSpanMax}px｜边长 全局 ${JSON.stringify(on.i_sideAll)}`,
    );
    console.log(`分档边长 ${on.i_sideByBand.map((s) => s.mean).join(' / ')}（均）｜gap ${on.gaps.join('/')}`);
    /* 第二段尺寸回退：站点上的生成耗时与「每页一次」的成本 */
    const t = await p.evaluate(() => {
      const t0 = performance.now();
      let n = 0;
      for (let i = 0; i < 3; i++) n += document.querySelectorAll('#fld-field .fld-sq').length;
      return { readMs: performance.now() - t0, n };
    });
    console.log(`复读方块数 ${t.n}（3 次取数 ${t.readMs.toFixed(2)}ms，生成成本只在装载期）`);
    await p.close();
  }

  /* ═══ B/C · 回溯 matrix 与方块运动 ═══ */
  if (want('BC')) {
    console.log('\n── B · 梦态 .fld-rewind computed transform ──');
    for (const face of ['wake', 'dream']) {
      const p = await mk(1440, 900, { face });
      await goto(p, '/articles/', `?fld=on`, 1200);
      const m = await p.evaluate(() => getComputedStyle(document.querySelector('.fld-rewind')).transform);
      console.log(`  ${face.padEnd(5)} ${m}`);
      await p.close();
    }

    console.log('\n── C · 同一个方块 0/3/6s 净位移（首页正文段 · deep）──');
    const PICK = `(() => { const e = document.querySelectorAll('#fld-field .fld-sq'); return e.length; })()`;
    for (const face of ['dream', 'wake']) {
      const p = await mk(1440, 900, { face });
      await goto(p, '/', '', 2600);
      await retry(() =>
        p.evaluate(() => {
          const el = document.querySelector('#ns-essays');
          scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
        }),
      );
      await sleep(600);
      const n = await p.evaluate(PICK);
      const idx = Math.floor(n / 2);
      const read = () =>
        p.evaluate((i) => {
          const e = document.querySelectorAll('#fld-field .fld-sq')[i];
          const r = e.getBoundingClientRect();
          return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), t: performance.now() };
        }, idx);
      const a = await read();
      await sleep(3000);
      const b = await read();
      await sleep(3000);
      const c = await read();
      // 10s 包络
      const env = await p.evaluate(
        (i) =>
          new Promise((res) => {
            const e = document.querySelectorAll('#fld-field .fld-sq')[i];
            const xs = new Set(), ys = new Set(), pts = [];
            const t0 = performance.now();
            const tick = () => {
              const r = e.getBoundingClientRect();
              xs.add(Math.round(r.left * 100) / 100); ys.add(Math.round(r.top * 100) / 100);
              pts.push([r.left, r.top]);
              if (performance.now() - t0 < 10000) requestAnimationFrame(tick);
              else res({ xs: xs.size, ys: ys.size, n: pts.length, spanX: Math.max(...[...xs]) - Math.min(...[...xs]), spanY: Math.max(...[...ys]) - Math.min(...[...ys]) });
            };
            requestAnimationFrame(tick);
          }),
        idx,
      );
      const disp = (p1, p0) => ({ dx: +(p1.x - p0.x).toFixed(2), dy: +(p1.y - p0.y).toFixed(2) });
      const d3 = disp(b, a), d6 = disp(c, a);
      const ang = (d6) => (Math.atan2(d6.dy, d6.dx) * 180) / Math.PI;
      const len = (d) => Math.hypot(d.dx, d.dy);
      console.log(
        `  ${face.padEnd(5)} 0→3s (${d3.dx}, ${d3.dy})｜0→6s (${d6.dx}, ${d6.dy}) = ${len(d6).toFixed(1)}px / ${ang(d6).toFixed(1)}°` +
          ` ⇒ ${(len(d6) / 6).toFixed(1)}px/s｜10s 包络 x${env.spanX.toFixed(1)}px(${env.xs} 值) y${env.spanY.toFixed(1)}px(${env.ys} 值) [${env.n} 采样]`,
      );
      await p.close();
    }
  }

  /* ═══ D · 脑电抽帧与残影 ═══ */
  if (want('D')) {
    console.log('\n── D · 脑电主波 d 变化次数（3.2s）与每拍残影互异 ──');
    for (const face of ['dream', 'wake']) {
      const p = await mk(1440, 900, { face });
      await goto(p, '/', '', 2600);
      const r = await p.evaluate(
        () =>
          new Promise((res) => {
            const main = document.querySelector('.eeg-main');
            const echoes = ['.eeg-echo-1', '.eeg-echo-2', '.eeg-echo-3'].map((s) => document.querySelector(s));
            const series = [];
            const t0 = performance.now();
            const mo = new MutationObserver(() => {
              series.push({
                t: +(performance.now() - t0).toFixed(1),
                main: main.getAttribute('d') || '',
                e: echoes.map((e) => e.getAttribute('d') || ''),
              });
            });
            mo.observe(main, { attributes: true, attributeFilter: ['d'] });
            for (const e of echoes) mo.observe(e, { attributes: true, attributeFilter: ['d'] });
            setTimeout(() => {
              mo.disconnect();
              const times = series.map((s) => s.t);
              const gaps = times.slice(1).map((t, i) => +(t - times[i]).toFixed(1));
              res({ n: series.length, times: times.slice(0, 12), gaps: gaps.slice(0, 12), series: series.slice(-14) });
            }, 3200);
          }),
      );
      console.log(`  ${face.padEnd(5)} d 变化 ${r.n} 次 / 3.2s（前几个时刻 ${r.times.join(', ')}ms）间隔 ${r.gaps.slice(0, 3).join(', ')}ms`);
      if (face === 'dream') {
        /* 每拍三道残影与主波的路径关系：按「主波变化时刻」切成拍，取每拍最后一条记录 */
        let distinct = 0, beats = 0, sameAsMain = 0, crossBeat = 0;
        const rows = r.series.filter((s) => s.main);
        for (const s of rows) {
          const set = new Set([s.main, ...s.e]);
          beats++;
          if (set.size === 4) distinct++;
          if (s.e.some((e) => e === s.main)) sameAsMain++;
          if (s.e.some((e) => !e)) crossBeat++;
        }
        console.log(
          `        梦态每拍检查 ${beats} 拍：四道（主波+3 残影）两两互异 ${distinct}/${beats}｜残影=主波 ${sameAsMain} 次｜残影空路径 ${crossBeat} 次`,
        );
        const last = rows[rows.length - 1];
        if (last) {
          console.log(`        最后一拍：main ${last.main.length} 字符｜echo1 ${last.e[0].length}｜echo2 ${last.e[1].length}｜echo3 ${last.e[2].length}`);
          const allMain = rows.map((s) => s.main);
          const uniqMain = new Set(allMain).size;
          const e1 = last.e[0];
          console.log(
            `        残影延迟复核（1 拍 = 0.5s）：本拍 echo1 ≠ 本拍 main ${e1 !== last.main}｜≠ 主波历史任意一条 ${!allMain.includes(e1)}（主波本段共 ${uniqMain} 个不同值）`,
          );
        }
      }
      await p.close();
    }
  }

  /* ═══ E · 醒态逐像素（RM 冻结；含对照组） ═══ */
  if (want('E')) {
    console.log('\n── E · 醒态「有层 / 无层」逐像素差（prefers-reduced-motion 冻结构图）──');
    const blank = await mk(900, 600);
    await blank.setContent('<title>diff</title>');
    await blank.evaluate(DIFF_FN);
    const shotAt = async (q, scrollToBody) => {
      const p = await mk(1440, 900, { face: 'wake', rm: true });
      await goto(p, '/', q, 3000);
      if (scrollToBody) {
        await retry(() =>
          p.evaluate(() => {
            const el = document.querySelector('#ns-essays');
            scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
          }),
        );
        await sleep(900);
      }
      const b64 = await p.screenshot({ encoding: 'base64' });
      await p.close();
      return b64;
    };
    const ctlA = await shotAt('', true);
    const ctlB = await shotAt('', true);
    const ctl = await blank.evaluate(
      (a, b) => diff(a, b, null).then((r) => ({ maxCh: r.maxCh, nCh: r.nCh, maxIn: r.maxIn })),
      ctlA,
      ctlB,
    );
    console.log(`  对照（同配置连拍两次，跨装载）：不同像素 ${ctl.nCh}｜最大通道差 ${ctl.maxCh}/255`);
    const off = await shotAt('?fld=off', true);
    const test = await blank.evaluate(
      (a, b) => diff(a, b, null).then((r) => ({ maxCh: r.maxCh, nCh: r.nCh })),
      ctlA,
      off,
    );
    console.log(`  有层 vs ?fld=off（跨装载）：不同像素 ${test.nCh}｜最大通道差 ${test.maxCh}/255`);
    // 同装载内 on/off（最干净的口径）
    const p2 = await mk(1440, 900, { face: 'wake', rm: true });
    await goto(p2, '/', '', 3000);
    await retry(() =>
      p2.evaluate(() => {
        const el = document.querySelector('#ns-essays');
        scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
      }),
    );
    await sleep(700);
    const onB = await p2.screenshot({ encoding: 'base64' });
    await p2.evaluate(() => {
      document.getElementById('fld-bg').style.display = 'none';
    });
    await sleep(400);
    const offB = await p2.screenshot({ encoding: 'base64' });
    const same = await blank.evaluate((a, b) => diff(a, b, null).then((r) => ({ maxCh: r.maxCh, nCh: r.nCh })), onB, offB);
    console.log(`  有层 vs 无层（同装载、只 display:none）：不同像素 ${same.nCh}｜最大通道差 ${same.maxCh}/255`);
    /* 本轮并进脑电群的两件（四道谱带 + 三道残影）在醒态「什么都没多」——
       与 mock 同口径（全幅 0 / 1 296 000、最大通道差 0） */
    await p2.evaluate(() => {
      document.getElementById('fld-bg').style.display = '';
      document.querySelector('.echo-stave').style.display = 'none';
      document.querySelectorAll('.eeg-echo').forEach((e) => (e.style.display = 'none'));
    });
    await sleep(400);
    const noStaveEcho = await p2.screenshot({ encoding: 'base64' });
    const staveOn = await blank.evaluate((a, b) => diff(a, b, null).then((r) => ({ maxCh: r.maxCh, nCh: r.nCh })), noStaveEcho, onB);
    console.log(`  谱带+残影 有 vs 无（同装载）：不同像素 ${staveOn.nCh} / ${staveOn.w * staveOn.h}｜最大通道差 ${staveOn.maxCh}/255`);
    await p2.evaluate(() => {
      document.getElementById('fld-bg').style.display = 'none';
    });
    await sleep(300);
    const bothOff = await p2.screenshot({ encoding: 'base64' });
    const iso = await blank.evaluate((a, b) => diff(a, b, null).then((r) => ({ maxCh: r.maxCh, nCh: r.nCh })), bothOff, offB);
    console.log(`  （构块场藏起来后）vs（?fld=off 跨装载）：不同像素 ${iso.nCh}｜最大通道差 ${iso.maxCh}/255`);
    await p2.close();
    await blank.close();
  }

  /* ═══ F · 版心内最亮处 ÷ 相邻墨色差 ═══ */
  if (want('F')) {
    console.log('\n── F · 版心（首页正文列 .container-wide 56rem）内背景最亮处 ÷ 相邻墨色亮度差（红线 35%）──');
    const blank = await mk(900, 600);
    await blank.setContent('<title>diff</title>');
    await blank.evaluate(BOX_DIFF_FN);
    await blank.evaluate(DIFF_FN);
    const lumOf = (fgc, softc, bgc) =>
      blank.evaluate(
        (fg, soft, bg) => {
          const parse = (s) => {
            const m = s.match(/[\d.]+/g).map(Number).slice(0, 3);
            return /srgb/.test(s) ? m.map((x) => x * 255) : m;
          };
          const lin = (v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          };
          const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          return { lfg: L(parse(fg)), lsoft: L(parse(soft)), lbg: L(parse(bg)) };
        },
        fgc,
        softc,
        bgc,
      );
    for (const zone of ['deep', 'light', 'paper']) {
      for (const face of ['wake', 'dream']) {
        const p = await mk(1440, 900, { face });
        /* 冻结构图（与 mock 的 ?freeze=1 同口径）：CSS 动画全部停在第 0 帧 +
           过渡关掉 + rAF 侧把 document.hidden 钉成 true（脑电/纸叠等循环因此不重绘）。
           两次截图之间只有构块场变了 —— 缝线/脑电/字标在两张图里都被藏掉，
           它们本来也不属于「本层贡献」这一栏。 */
        await p.evaluateOnNewDocument(() => {
          const put = () => {
            const s = document.createElement('style');
            s.textContent =
              '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;transition:none!important}';
            document.head.appendChild(s);
          };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put);
          else put();
          Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
        });
        await goto(p, '/', '', 2800);
        await retry(() =>
          p.evaluate(() => {
            const el = document.querySelector('#ns-essays');
            scrollTo({ top: el.getBoundingClientRect().top + scrollY - 70, behavior: 'instant' });
          }),
        );
        await sleep(700);
        await p.evaluate((z) => {
          const root = document.documentElement;
          root.style.setProperty('--bg', z.bg);
          root.style.setProperty('--fg', z.ink);
          root.style.setProperty('--fg-soft', z.soft);
          root.style.setProperty('--line', z.line);
          document.body.dataset.zone = z.name;
        }, { ...ZONES[zone], name: zone });
        await sleep(500);
        const info = await p.evaluate(() => {
          /* 只留「正文 + 构块场」：缝线 / 脑电群 / 字标在两张图里一起藏掉 */
          const seam = document.querySelector('.seam');
          if (seam) seam.style.display = 'none';
          const grp = document.getElementById('site-eeg-group');
          if (grp) grp.style.display = 'none';
          const brand = document.querySelector('.brand, .brand-mark');
          if (brand) brand.style.visibility = 'hidden';
          /* 墨迹透明化：morph 的「走神」会周期性重排 [data-morph] 的字，
             两次截图之间文字会动 —— 那与「本层贡献」无关，所以直接让墨不画，
             只在**文字框的位置**上量背景层自己的亮度起伏（红线问的正是这个）。 */
          const ink = document.createElement('style');
          ink.textContent = '#ns-essays{color:transparent!important;-webkit-text-stroke-color:transparent!important}';
          document.head.appendChild(ink);
          const r = document.querySelector('#ns-essays .container-wide').getBoundingClientRect();
          /* 文字框（真正的「版心」＝有墨的那些框；mock 的 .container 恰好只含文字） */
          const sels = ['p', 'h2', 'h3', 'a', 'time', '.mono', '.rung-label', '.vtag', '.vword', '.stitch-head'];
          const boxes = [];
          for (const el of document.querySelectorAll('#ns-essays ' + sels.join(',#ns-essays '))) {
            if (el.closest('.glass-chip')) continue;
            const b = el.getBoundingClientRect();
            if (b.width < 8 || b.height < 8) continue;
            if (b.bottom < 0 || b.top > innerHeight) continue;
            boxes.push({
              l: Math.max(0, b.left),
              r: Math.min(innerWidth, b.right),
              t: Math.max(0, b.top),
              b: Math.min(innerHeight, b.bottom),
            });
          }
          /* 墨色取 token 的实算值（探针元素，绕开选择器）：--fg = 标题墨、--fg-soft = 正文墨 */
          const probe = document.createElement('span');
          probe.style.cssText = 'position:absolute;left:-9999px;color:var(--fg)';
          document.body.appendChild(probe);
          const fg = getComputedStyle(probe).color;
          probe.style.color = 'var(--fg-soft)';
          const soft = getComputedStyle(probe).color;
          probe.remove();
          return {
            box: { l: r.left, r: r.right, t: Math.max(0, r.top), b: Math.min(innerHeight, r.bottom) },
            boxes,
            fg,
            soft,
            bg: getComputedStyle(document.body).backgroundColor,
            zone: document.body.dataset.zone,
          };
        });
        const on = await p.screenshot({ encoding: 'base64' });
        await p.evaluate(() => {
          document.getElementById('fld-bg').style.display = 'none';
        });
        await sleep(300);
        const off = await p.screenshot({ encoding: 'base64' });
        const st = await blank.evaluate((a, b, boxes) => boxDiff(a, b, boxes), on, off, info.boxes);
        const stCol = await blank.evaluate((a, b, box) => diff(a, b, box), on, off, info.box);
        const lum = await lumOf(info.fg, info.soft, info.bg);
        const dFg = Math.abs(lum.lfg - lum.lbg), dSoft = Math.abs(lum.lsoft - lum.lbg);
        console.log(
          `  ${zone.padEnd(6)} ${face.padEnd(5)} 文字框内（${info.boxes.length} 框）最大|ΔL|=${st.maxIn.toFixed(4)}（rgb ${st.worst ? st.worst.on : '-'} vs 无层 ${st.worst ? st.worst.off : '-'} @${st.worst ? st.worst.x + ',' + st.worst.y : '-'}） ⇒ 标题墨 ${((100 * st.maxIn) / dFg).toFixed(1)}% / 正文墨 ${((100 * st.maxIn) / dSoft).toFixed(1)}%`,
        );
        console.log(
          `  ${''.padEnd(6)} ${''.padEnd(5)} 整列（含空白与卡片，最严口径）最大|ΔL|=${stCol.maxIn.toFixed(4)} ⇒ 正文墨 ${((100 * stCol.maxIn) / dSoft).toFixed(1)}%`,
        );
        await p.close();
      }
    }
    await blank.close();
  }

  /* ═══ G · 新增 rAF / 监听 ═══ */
  if (want('G')) {
    console.log('\n── G · 新增 rAF / 监听（有层 vs ?fld=off，差分 + 注册点堆栈）──');
    const probe = async (q) => {
      const p = await mk(1440, 900, { face: 'wake' });
      await p.evaluateOnNewDocument(() => {
        const sites = { raf: [], ev: [] };
        window.__probe = sites;
        const oraf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (cb) {
          if (sites.raf.length < 400)
            sites.raf.push(String((new Error().stack || '').split('\n').slice(1, 4).join(' ~ ')).trim());
          return oraf(cb);
        };
        const oadd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (t, fn, o) {
          if (sites.ev.length < 400)
            sites.ev.push(
              String(t) + ' @ ' + String((new Error().stack || '').split('\n').slice(1, 4).join(' ~ ')).trim(),
            );
          return oadd.call(this, t, fn, o);
        };
      });
      await goto(p, '/', q, 3000);
      const r = await p.evaluate(() => {
        const s = window.__probe;
        const uniq = (a) => [...new Set(a)];
        return { rafCalls: s.raf.length, evCalls: s.ev.length, rafSites: uniq(s.raf), evSites: uniq(s.ev) };
      });
      await p.close();
      return r;
    };
    const on = await probe('');
    const off = await probe('?fld=off');
    const norm = (a) =>
      a
        .map((s) => s.replace(/\(.*?:\d+:\d+\)/g, '').replace(/https?:\/\/[^\s)]+/g, (u) => u.split('/').pop()))
        .map((s) => s.replace(/\s+/g, ' '))
        .sort();
    const rafOn = norm(on.rafSites), rafOff = norm(off.rafSites);
    const evOn = norm(on.evSites), evOff = norm(off.evSites);
    console.log(`  有层：rAF 注册 ${on.rafCalls} 次（${rafOn.length} 个不同注册点）｜监听注册 ${on.evCalls} 次（${evOn.length} 个不同注册点）`);
    console.log(`  无层（?fld=off）：rAF 注册 ${off.rafCalls} 次（${rafOff.length} 个）｜监听注册 ${off.evCalls} 次（${evOff.length} 个）`);
    const onlyOn = rafOn.filter((s) => !rafOff.includes(s));
    const evOnlyOn = evOn.filter((s) => !evOff.includes(s));
    console.log(`  rAF 注册点差集（有层独有）${onlyOn.length ? onlyOn : '空'}｜监听注册点差集 ${evOnlyOn.length ? evOnlyOn : '空'}`);
    console.log(`  有层里来自 Constructs 生成器的注册点：${[...rafOn, ...evOn].filter((s) => /Constructs/i.test(s)).length}`);
    console.log(`  监听清单（有层）：${evOn.join(' | ')}`);
    console.log(`  rAF 清单（有层）：${rafOn.slice(0, 8).join(' | ')}`);
  }

  /* ═══ H · 首屏可读（构块场贡献 + 缝线/脑电贡献） ═══ */
  if (want('H')) {
    console.log('\n── H · 首页首屏可读（below 挂法）──');
    const blank = await mk(900, 600);
    await blank.setContent('<title>diff</title>');
    await blank.evaluate(DIFF_FN);
    const p = await mk(1440, 900, { face: 'wake', rm: true });
    await goto(p, '/', '', 3200);
    const boxes = await p.evaluate(() => {
      const b = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: Math.max(0, r.left), r: Math.min(innerWidth, r.right), t: Math.max(0, r.top), b: Math.min(innerHeight, r.bottom) };
      };
      const note = document.querySelector('.note-ink') || document.querySelector('#ns-hero p, #ns-hero');
      return { hero: b('#ns-hero'), note: b('.note-ink'), wake: b('.ch-wake'), dream: b('.ch-dream') };
    });
    const full = await p.screenshot({ encoding: 'base64' });
    await p.evaluate(() => {
      document.getElementById('fld-bg').style.display = 'none';
    });
    await sleep(300);
    const noFld = await p.screenshot({ encoding: 'base64' });
    const stF = await blank.evaluate((a, b, box) => diff(a, b, box), full, noFld, boxes.hero);
    console.log(`  构块场在首屏（#ns-hero）的贡献：最大|ΔL|=${stF.maxIn.toFixed(4)}｜不同像素 ${stF.nCh}`);

    await p.evaluate(() => {
      document.getElementById('fld-bg').style.display = '';
      document.querySelector('.seam').style.display = 'none';
      const g = document.getElementById('site-eeg-group');
      if (g) g.style.display = 'none';
    });
    await sleep(300);
    const noChrome = await p.screenshot({ encoding: 'base64' });
    for (const [name, box] of [['宣言纸正文', boxes.note], ['醒字', boxes.wake], ['梦字', boxes.dream]]) {
      const st = await blank.evaluate((a, b, box) => diff(a, b, box), full, noChrome, box);
      console.log(`  缝线+脑电在「${name}」区域内的最大|ΔL|=${st.maxIn.toFixed(4)}｜不同像素 ${st.nCh}`);
    }
    await p.close();
    await blank.close();
  }

  /* ═══ I · 醒态主波 = 改动前那一条（旧算式在页内重算，逐字比 d）═══ */
  if (want('I')) {
    console.log('\n── I · 醒态主波路径 vs 改动前的算式（旧 draw 逐字重算）──');
    const OLD = `(ph) => {
      const W = innerWidth, H = innerHeight, cy = H * 0.5;
      const half = Math.sqrt(W * W + H * H) / 2 + 60;
      let d = '', first = true;
      for (let x = -half; x <= half; x += 26) {
        const u = x / 600;
        const y = Math.sin(u * 0.5 * Math.PI * 2 + ph * 2.6) * 3.6 + Math.sin(u * 0.5 * 2.7 + ph * 1.3) * 3.6 * 0.4;
        d += (first ? 'M' : 'L') + (W / 2 + x).toFixed(1) + ' ' + (cy + y).toFixed(1);
        first = false;
      }
      return d;
    }`;
    /* (1) RM 下只画一帧（ph ≡ 0）⇒ 与旧算式在 ph=0 必须逐字相同 */
    const p1 = await mk(1440, 900, { face: 'wake', rm: true });
    await goto(p1, '/', '', 3000);
    const rm = await p1.evaluate(
      (src) => {
        const oldPath = eval(src);
        const d = document.querySelector('.eeg-main').getAttribute('d');
        const o = oldPath(0);
        return { equal: d === o, len: [d.length, o.length], head: d.slice(0, 60), oldHead: o.slice(0, 60) };
      },
      OLD,
    );
    console.log(`  RM 静帧（ph=0）：逐字相同 ${rm.equal}｜长度 ${rm.len.join(' / ')}`);
    console.log(`    ${rm.head}`);
    console.log(`    ${rm.oldHead}`);
    await p1.close();
    /* (2) 醒态连续流动：抓 14 条实际路径，各自在 ±0.05s 窗口里找旧算式的同一个串 */
    const p2 = await mk(1440, 900, { face: 'wake' });
    await goto(p2, '/', '', 3000);
    const flow = await p2.evaluate(
      (src) =>
        new Promise((res) => {
          const oldPath = eval(src);
          const main = document.querySelector('.eeg-main');
          const rows = [];
          const t0 = performance.now();
          const mo = new MutationObserver(() => rows.push({ t: performance.now(), d: main.getAttribute('d') }));
          mo.observe(main, { attributes: true, attributeFilter: ['d'] });
          setTimeout(() => {
            mo.disconnect();
            const out = [];
            for (const r of rows.slice(0, 40)) {
              const est = r.t / 1000;
              let hit = null;
              for (let k = -100; k <= 100 && !hit; k++) {
                const ph = est + k * 0.0005;
                if (oldPath(ph) === r.d) hit = k * 0.0005;
              }
              out.push({ len: r.d.length, hit, est: +est.toFixed(4) });
            }
            res(out);
          }, 1500);
        }),
      OLD,
    );
    const hit = flow.filter((r) => r.hit !== null);
    const dev = hit.map((r) => r.hit * 1000);
    console.log(
      `  连续流动：抓 ${flow.length} 条实际路径，其中 ${hit.length} 条在 ±50ms 内找到旧算式的完全同串` +
        `（相位偏移 ${Math.min(...dev).toFixed(1)}–${Math.max(...dev).toFixed(1)}ms，均值 ${(dev.reduce((a, b) => a + b, 0) / dev.length).toFixed(1)}ms = rAF 时间戳与观察时刻之差）`,
    );
    console.log(`  路径长度 ${flow[0] ? flow[0].len : '-'} 字符`);
    await p2.close();
  }

  console.log('\n完成。');
  await browser.close();
})();
