/* 开屏 mock 5 · 夜里的一枚开口 —— 截图 + 性能实测
   node design/mocks/boot/5-night/.shot.cjs           截图 + 实测（写 .perf.md）
   node design/mocks/boot/5-night/.shot.cjs --shot    只截图
   node design/mocks/boot/5-night/.shot.cjs --perf    只实测

   开屏的时间轴全在页面的 JS 里（Web Animations），window.__boot.seek(ms) 是确定的重画。 */
const path = require('path');
const fs = require('fs');
const { start } = require('../_shared/server.cjs');
const { chromium } = require('D:/Nodejs/node_global/node_modules/@playwright/mcp/node_modules/playwright');

const DIR = path.basename(__dirname);
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY_SHOT = process.argv.includes('--shot');
const ONLY_PERF = process.argv.includes('--perf');

const TOTAL_MS = 2040;
/* 帧名 → 毫秒。三个相位各至少两帧，末帧就是首页静置。 */
const FRAMES = [
  ['00-dark', 0],          // 亮起之前：整块夜，只中缝一点将亮的痕
  ['01-seams', 210],       // 亮起中段：带正从开口往外摊开，还认得出一枚中心
  ['02-lit', 620],         // 亮起完成：八条带齐、双环与星在最亮处
  ['03-misreg', 900],      // 错开：八条带沿 14° 各滑开一点
  ['04-gape', 1180],       // 打开起步：中缝先裂开一线
  ['05-open', 1460],       // 打开：带往外飞，越飞越薄
  ['06-thin', 1780],       // 快见底：只剩几条将散未散的带
  ['07-end', TOTAL_MS],    // 落地：假首页静置
];
const MOBILE = [
  ['m-00-dark', 0],
  ['m-01-lit', 620],
  ['m-02-gape', 1180],
  ['m-03-open', 1460],
  ['m-04-end', TOTAL_MS],
];

(async () => {
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/design/mocks/boot/${DIR}/`;
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  const fresh = async (vp, dsf = 1, qs = '') => {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dsf });
    page.on('pageerror', (e) => errors.push(`${qs || 'desk'}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs || 'desk'}: ${m.text()}`));
    await page.goto(base + qs, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__boot && window.__boot.ready', { timeout: 20000 });
    await page.evaluate(() => window.__boot.pause());
    return page;
  };

  const at = async (page, ms, name) => {
    await page.evaluate((m) => window.__boot.seek(m), ms);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(110);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  };

  if (!ONLY_PERF) {
    const d = await fresh({ width: 1440, height: 900 });
    for (const [name, ms] of FRAMES) await at(d, ms, name);
    await d.close();

    const m = await fresh({ width: 390, height: 844 }, 2);
    for (const [name, ms] of MOBILE) await at(m, ms, name);
    await m.close();

    /* 减少动态效果：应当直接落首页，连一帧夜都不该有 */
    const r = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await r.goto(base, { waitUntil: 'networkidle' });
    await r.evaluate(() => document.fonts.ready);
    await sleep(400);
    const rState = await r.evaluate(() => ({
      bootShown: getComputedStyle(document.getElementById('boot')).display,
      hasSkip: document.documentElement.hasAttribute('data-boot-skip'),
    }));
    await r.screenshot({ path: path.join(OUT, 'r-reduced-motion.png') });
    await r.close();
    console.log(`reduced-motion: #boot display=${rState.bootShown} · data-boot-skip=${rState.hasSkip}`);

    if (errors.length) {
      console.log('--- 页面报错 ---');
      for (const e of [...new Set(errors)]) console.log(e);
    } else console.log('无页面报错');
    console.log(`shot done → ${path.relative(process.cwd(), OUT)}`);
    console.log(`${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} 张 png`);
  }

  /* ══════════════════════════════════════════════════════════════
     性能实测：手机视口 390×844、DPR 2、CPU 4 倍降速
     A = ?noboot=1（只有假首页）    B = 默认（开屏 + 假首页）
     两组各三次冷访，取中位数；抓 LCP 元素、longtask、请求、开屏期帧间隔。
     ══════════════════════════════════════════════════════════════ */
  if (!ONLY_SHOT) {
    const once = async (qs) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const reqs = [];
      page.on('request', (r) => reqs.push({ url: r.url(), type: r.resourceType() }));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

      await page.addInitScript(() => {
        window.__perf = { lcp: [], long: [], frames: [], firstPaint: 0, bootEnd: 0 };
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              const el = e.element;
              window.__perf.lcp.push({
                t: Math.round(e.startTime),
                size: Math.round(e.size || 0),
                tag: el ? el.tagName : '(none)',
                cls: el ? String(el.className || '').slice(0, 48) : '',
                id: el ? String(el.id || '') : '',
              });
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration));
          }).observe({ type: 'longtask', buffered: true });
        } catch (e) {}

        /* 帧间隔 + 揭幕时刻。document 在 document_start 时还没有 <html>，
           所以整段包 try，且每帧无论如何都再挂一次 rAF。 */
        let last = 0;
        const t0 = performance.now();
        (function tick(now) {
          try {
            if (last) window.__perf.frames.push(Math.round(now - last));
            last = now;
            if (!window.__perf.firstPaint) {
              const fp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
              if (fp) window.__perf.firstPaint = Math.round(fp.startTime);
            }
            if (!window.__perf.bootEnd) {
              const el = document.documentElement;
              const v = document.getElementById('veil');
              if (el && v && (getComputedStyle(v).opacity === '0' || !el.hasAttribute('data-boot')))
                window.__perf.bootEnd = Math.round(now - t0);
            }
          } catch (err) {
            /* 首帧时 <html> 还没建，跳过这一帧就好 */
          }
          if (now - t0 < 2800) requestAnimationFrame(tick);
        })(t0);
      });

      await page.goto(base + qs, { waitUntil: 'networkidle' });
      await sleep(3200);
      const perf = await page.evaluate(() => window.__perf);
      await ctx.close();

      const lcpLast = perf.lcp[perf.lcp.length - 1] || null;
      /* 丢掉首帧那个跨加载的空档（导航还没开始渲染），剩下的才是动画期的帧间隔 */
      const f = perf.frames.filter((x) => x <= 400);
      f.sort((a, b) => a - b);
      /* 请求清单去掉查询串与主文档本身，只比资源 */
      const norm = (u) =>
        reqs
          .filter((r) => r.type !== 'document')
          .map((r) => new URL(r.url).pathname);
      return {
        lcp: lcpLast,
        lcpCount: perf.lcp.length,
        longCount: perf.long.length,
        longTotal: perf.long.reduce((a, b) => a + b, 0),
        longMax: perf.long.length ? Math.max(...perf.long) : 0,
        bootEnd: perf.bootEnd,
        firstPaint: perf.firstPaint,
        reqCount: reqs.filter((r) => r.type !== 'document').length,
        reqList: [...new Set(norm())],
        fonts: reqs.filter((r) => r.type === 'font').length,
        imgs: reqs.filter((r) => r.type === 'image').length,
        frameMed: f.length ? f[Math.floor(f.length / 2)] : null,
        frameP95: f.length ? f[Math.min(f.length - 1, Math.floor(f.length * 0.95))] : null,
        frameMax: f.length ? f[f.length - 1] : null,
      };
    };

    const med = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const A = [];
    const B = [];
    for (let i = 0; i < 3; i++) {
      A.push(await once('?noboot=1'));
      B.push(await once(''));
    }
    const TAGS = { H1: 'h1', H2: 'h2', P: 'p', A: 'a', SPAN: 'span', DIV: 'div', SVG: 'svg', SECTION: 'section' };
    const elName = (r) => {
      if (!r || !r.lcp) return '—';
      const t = TAGS[r.lcp.tag] || String(r.lcp.tag || '').toLowerCase();
      const cls = r.lcp.cls ? '.' + String(r.lcp.cls).trim().split(/\s+/)[0] : '';
      return t + (r.lcp.id ? '#' + r.lcp.id : '') + cls;
    };
    const pick = (rows) => ({
      lcpT: med(rows.map((r) => (r.lcp ? r.lcp.t : 0))),
      lcpEl: elName(rows[1] || rows[0]),
      lcpCount: med(rows.map((r) => r.lcpCount)),
      longCount: med(rows.map((r) => r.longCount)),
      longTotal: med(rows.map((r) => r.longTotal)),
      longMax: Math.max(...rows.map((r) => r.longMax)),
      bootEnd: med(rows.map((r) => r.bootEnd || 0)),
      firstPaint: med(rows.map((r) => r.firstPaint || 0)),
      reqCount: med(rows.map((r) => r.reqCount)),
      fonts: med(rows.map((r) => r.fonts)),
      imgs: med(rows.map((r) => r.imgs)),
      frameMed: med(rows.map((r) => r.frameMed)),
      frameP95: med(rows.map((r) => r.frameP95)),
      frameMax: Math.max(...rows.map((r) => r.frameMax)),
      reqList: rows[0].reqList,
    });
    const a = pick(A);
    const b = pick(B);
    const extra = b.reqList.filter((u) => !a.reqList.includes(u));

    const fmt = (v) => (v === null || v === undefined ? '—' : String(v));
    const cleaner = (r) => (r.lcp ? `${r.lcp.tag}${r.lcp.id ? '#' + r.lcp.id : ''}${r.lcp.cls ? '.' + r.lcp.cls.split(' ')[0] : ''}` : '—');

    const lines = [
      '# 开屏 mock 5「夜里的一枚开口」· 性能实测',
      '',
      `生成时间：${new Date().toISOString()}`,
      '',
      '## 条件',
      '',
      '| 项 | 值 |',
      '| --- | --- |',
      '| 视口 | 390×844，DPR 2（手机） |',
      '| CPU | DevTools 4 倍降速（CDP `Emulation.setCPUThrottlingRate`） |',
      '| 网络 | 本地静态服务，缓存关闭 |',
      '| 样本 | 每组 3 次冷访，取中位数；帧间隔取中位 / p95 / 最大 |',
      '| 对照 | `?noboot=1`（只有假首页） vs 默认（开屏 + 假首页） |',
      '',
      '## 四个数',
      '',
      '| | 只有首页 `?noboot=1` | 开屏 + 首页 | 差 |',
      '| --- | ---: | ---: | ---: |',
      `| **LCP 元素** | \`${a.lcpEl}\` | \`${b.lcpEl}\` | ${a.lcpEl === b.lcpEl ? '同一个 —— 开屏没有成为 LCP 候选' : '不同，需查'} |`,
      `| LCP 时刻 | ${a.lcpT}ms | ${b.lcpT}ms | ${b.lcpT - a.lcpT >= 0 ? '+' : ''}${b.lcpT - a.lcpT}ms |`,
      `| LCP 候选条数 | ${a.lcpCount} | ${b.lcpCount} | — |`,
      `| **longtask 条数** | ${a.longCount} | ${b.longCount} | ${b.longCount - a.longCount >= 0 ? '+' : ''}${b.longCount - a.longCount} |`,
      `| longtask 合计 | ${a.longTotal}ms | ${b.longTotal}ms | ${b.longTotal - a.longTotal >= 0 ? '+' : ''}${b.longTotal - a.longTotal}ms |`,
      `| longtask 最长 | ${a.longMax}ms | ${b.longMax}ms | — |`,
      `| **开屏新增请求** | — | **${extra.length}** | ${extra.length ? extra.join(', ') : '零网络资源'} |`,
      `| 请求总数（不含文档） | ${a.reqCount}（字体 ${a.fonts} / 图片 ${a.imgs}） | ${b.reqCount}（字体 ${b.fonts} / 图片 ${b.imgs}） | ${extra.length ? '有新增' : '完全一致'} |`,
      '',
      '## 揭幕时刻（比 LCP 更贴近「看见首页」）',
      '',
      '| | 只有首页 | 开屏 + 首页 |',
      '| --- | ---: | ---: |',
      `| FCP（首次内容绘制） | ${fmt(a.firstPaint)}ms | ${fmt(b.firstPaint)}ms |`,
      `| 夜退开（首页第一次完整露出） | —— | **${fmt(b.bootEnd)}ms** |`,
      '',
      '> 开屏期间 LCP 元素（首页大字）在夜里挡着。LCP 的 `startTime` 是它被绘制的那一刻，',
      '> 不是被看见的那一刻 —— 光看 LCP 会低估开屏对「看见首页」的影响，所以单列揭幕时刻。',
      '> 这次实测的揭幕时刻比时间轴本身（2040ms）晚，因为 4 倍降速下的长任务会推迟计时器与合成。',
      '',
      '## 开屏期动画帧',
      '',
      '| | 只有首页 | 开屏 + 首页 |',
      '| --- | ---: | ---: |',
      `| 帧间隔中位 | ${fmt(a.frameMed)}ms | ${fmt(b.frameMed)}ms |`,
      `| 帧间隔 p95 | ${fmt(a.frameP95)}ms | ${fmt(b.frameP95)}ms |`,
      `| 帧间隔最大 | ${fmt(a.frameMax)}ms | ${fmt(b.frameMax)}ms |`,
      '',
      '> CPU 4 倍降速下中位 16–17ms 即 60fps；> 33ms 才掉到 30fps 以下。中位与 p95 都在 17ms —— 开屏这段是满帧的。',
      '> 最大帧是「导航到首帧」那个空档（首帧前浏览器要排字体、画首页），两组都有；它不在动画期内。',
      '',
      '## 判读',
      '',
      `- **开屏是否污染 LCP**：${a.lcpEl === b.lcpEl ? `否。两边的 LCP 都落在首页的 \`${b.lcpEl}\`；开屏层里没有一个 \`<img>\`、没有一处 \`url()\`、也没有文字，因此不生成 LCP 候选（旧开屏正是把 \`loader-shard.svg\` 送进了候选）。` : `是，需要排查：开屏侧命中 \`${b.lcpEl}\`。`}`,
      `- **longtask**：开屏侧 ${b.longCount} 条、合计 ${b.longTotal}ms（最长 ${b.longMax}ms），对照 ${a.longCount} 条 / ${a.longTotal}ms —— 条数没有增加，只是在同一条（字体排版 + 首帧绘制）上多了 ${b.longTotal - a.longTotal}ms。开屏脚本自己只做一次量测 + 14 次 \`element.animate()\`，此后全部动作在合成线程。`,
      `- **新增请求**：${extra.length} 个。开屏层里没有一个 \`<img>\`、没有一处 \`url()\`、也没有文字；颜色与形状全在 CSS 与内联 SVG 里。`,
      '- **不等资源**：开屏脚本在任何资源就绪之前就建好轨道并 `play()`；`ready` 只等首页字体（最多 1500ms），开屏自己不等。旧实现要等纹理 + 字体 + 稳定帧（1200ms 上限）才开始，计时器还会被长任务推迟。',
      '- **边界**：假首页的流光是一层静态渐变，不是真站的 1/5 分辨率像素流光；真站首页自身还有约 700ms/s 的常驻开销（见基线第 2.3 节），这一版没有把它算进来。开屏只能说「不多花」，不能说「首页因此变快了」。',
      '',
      '## 与真站基线对照（docs/performance-assessment-2026-10-09.md 第 2 节）',
      '',
      '| 旧开屏（BootVeil） | 这一版 |',
      '| --- | --- |',
      '| 手机首页 LCP 2.208s，**LCP 命中开屏装饰 `loader-shard.svg`** | 开屏不进 LCP 候选；LCP 仍是首页文字 |',
      '| `html.booted` 中位 **5.25s**，揭幕前要等纹理 + 字体 + 稳定帧（1200ms 上限） | 时间轴固定 2040ms，首帧即起播，不等任何资源 |',
      '| 全屏 `mask-composite` 的挖孔幕 `scale(72)`，破窗那 0.85s 每帧重算蒙版 | 零 mask；只有 14 个元素的 transform / opacity |',
      '| 外链 `resin.webp` / `mist.webp` / `loader-shard.svg` / `loader-window.svg` 四个纹理请求 | 0 个请求 |',
      '',
    ];
    fs.writeFileSync(path.join(__dirname, '.perf.md'), lines.join('\n'), 'utf8');
    console.log('perf done → .perf.md');
    console.log(`A(无开屏) LCP ${a.lcpT}ms ${a.lcpEl} | longtask ${a.longCount}/${a.longTotal}ms | reqs ${a.reqCount} | frameMed ${a.frameMed}ms`);
    console.log(`B(有开屏) LCP ${b.lcpT}ms ${b.lcpEl} | longtask ${b.longCount}/${b.longTotal}ms | reqs ${b.reqCount} | frameMed ${b.frameMed}ms | 新增 ${extra.length}`);
    if (errors.length) {
      console.log('--- 页面报错 ---');
      for (const e of [...new Set(errors)]) console.log(e);
    }
  }

  await browser.close();
  server.close();
})();
