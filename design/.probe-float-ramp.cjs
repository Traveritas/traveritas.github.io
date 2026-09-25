/* ─────────────────────────────────────────────────────────────
   定格漂浮族「长按换面」过渡的活体抽查。

   用法：npm run build && node design/.probe-float-ramp.cjs [tag]
   输出：design/.shots-ramp/<tag>.json + 控制台摘要

   查三件事：
   1. 常驻性：.ord-digit / .float-ch / .brand-char 在醒面是否仍有 animation-name
      （本轮改造后应当「动画常驻、振幅归零」）；
   2. 连续性：长按入梦 / 回醒全过程中逐帧采样 .ord-digit 的 translate，
      求出每帧位移跳变的最大值与「换面那一帧」的跳变 —— 骤停会在这一列上现形
      （旧实现：hold 一激活整枚数字从 −3px 一步回 0）；
   3. 代价：Performance.getMetrics 的区间差值（主线程任务 / 样式重算 / 布局）
      ＋ 时间线里的帧数与事件账。**别读帧间隔 p50**：无头里它读的是调度节奏，
      不是造价（见 withTrace 上方注）。量账一律配 NOSAMPLE=1，否则采样器自己
      每帧 getComputedStyle 就把重算逼出来了。

   变体（第 4 个参数）：base / legacy 是决策用的一对；nowill / literal / ampvar /
   quant8 / quant32 / quant128 / prop / prop-nowill 是省法筛选的存档，都不管用。
   环境变量：TRACE=1 开时间线 · NOSAMPLE=1 不装采样器 · QUICK=1 只跑静置与入梦 ·
   ONLY=<路由>（不带前导斜杠，Git Bash 会改写以 / 开头的值）· SHIFT=<ms> 挪相位。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const TAG = process.argv[2] || 'run';
/* legacy ＝ 在同一个构建里把「旧机制」原样贴回来（按面开关动画、keyframes 不读 --still）：
   于是同一次加载、同一台机器上的前后对照，不再被两次构建与运行时抖动糊在一起。 */
const LEGACY = process.argv[3] === 'legacy';
/* 第四个参数：在同一构建里叠一层变体样式，用来把「常驻」的代价拆开看是哪一笔。
   （都不是候选实现，`literal` 那一版醒面会照常跳，只为量出「可合成」值多少钱。） */
const VARIANT = process.argv[4] || 'base';
const QUICK = process.env.QUICK === '1';
const OUT_DIR = path.join(__dirname, '.shots-ramp');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* 字面量 keyframes：不含任何 var()，因此浏览器可以把它送上合成线程（旧机制的写法） */
const LITERAL_KEYS = `
@keyframes ord-digit-float {
  0%, 87%, 100% { translate: 0 0; }
  13% { translate: 0 -1px; }
  25% { translate: 0 -2px; }
  37% { translate: 0 -3px; }
  63% { translate: 0 -2px; }
  75% { translate: 0 -1px; }
}
@keyframes float-char {
  0%, 87%, 100% { translate: 0 0; color: currentColor; }
  13% { translate: calc(var(--float-amp, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.33) calc(var(--float-amp, 3px) * -0.33); }
  25% { translate: calc(var(--float-amp, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.66) calc(var(--float-amp, 3px) * -0.66); color: color-mix(in srgb, var(--amber) var(--float-tint, 0%), currentColor); }
  37% { translate: calc(var(--float-amp, 3px) * var(--float-sway, 0) * var(--float-dir, 1)) calc(var(--float-amp, 3px) * -1); color: color-mix(in srgb, var(--amber) var(--float-tint, 0%), currentColor); }
  63% { translate: calc(var(--float-amp, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.66) calc(var(--float-amp, 3px) * -0.66); color: color-mix(in srgb, var(--amber) var(--float-tint, 0%), currentColor); }
  75% { translate: calc(var(--float-amp, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.33) calc(var(--float-amp, 3px) * -0.33); }
}
@keyframes brand-pixel-float {
  0% { transform: translateY(0px); color: var(--fg); }
  13% { transform: translateY(-1px); color: var(--fg); }
  25% { transform: translateY(-2px); color: color-mix(in srgb, var(--amber) 16%, var(--fg)); }
  37% { transform: translateY(-3px); color: color-mix(in srgb, var(--amber) 32%, var(--fg)); }
  63% { transform: translateY(-2px); color: color-mix(in srgb, var(--amber) 16%, var(--fg)); }
  75% { transform: translateY(-1px); color: var(--fg); }
  87%, 100% { transform: translateY(0px); color: var(--fg); }
}
`;

/* 旧机制的闸门：按面开关（与 LITERAL_KEYS 合成完整旧版） */
const LEGACY_GATES = `
.ord-digit { animation: none !important; will-change: auto !important; }
body[data-reality='dream']:not(.reality-holding) .ord-digit {
  animation: ord-digit-float 2.8s step-end infinite !important;
  will-change: translate !important;
}
.float-ch { animation: none !important; will-change: auto !important; }
body[data-reality='dream']:not(.reality-holding) .float-ch {
  animation: float-char var(--float-dur, 2.8s) step-end infinite !important;
  will-change: translate !important;
}
`;

const LEGACY_CSS = LITERAL_KEYS + LEGACY_GATES;

/* 变体表 */
const NO_WILL = `.ord-digit, .float-ch { will-change: auto !important; }`;
/* 把振幅收成元素级的一个长度变量：keyframes 里只剩一次 var（少数几次 calc 求值） */
const AMP_VAR_KEYS = `
.ord-digit { --ord-amp-now: calc(3px * var(--still, 0)); }
@keyframes ord-digit-float {
  0%, 87%, 100% { translate: 0 0; }
  13% { translate: 0 calc(var(--ord-amp-now, 0px) * -0.3333); }
  25% { translate: 0 calc(var(--ord-amp-now, 0px) * -0.6667); }
  37% { translate: 0 calc(var(--ord-amp-now, 0px) * -1); }
  63% { translate: 0 calc(var(--ord-amp-now, 0px) * -0.6667); }
  75% { translate: 0 calc(var(--ord-amp-now, 0px) * -0.3333); }
}
`;
/* 把振幅量化到 1/8 档：--still 在动而振幅只在跨档时变。
   依据：静置时（--still 恒定）常驻与按面开关的账几乎相同 ⇒ Blink 只在被读的值
   变了才重解 keyframes。那么把值的变化次数压掉，重解次数也应当按比例压掉。 */
const quantKeys = (n) => `
.ord-digit { --ord-amp-q: round(var(--still, 0), ${1 / n}); }
.float-ch { --flt-amp-q: calc(var(--float-amp, 3px) * round(var(--still, 0), ${1 / n})); }
@keyframes ord-digit-float {
  0%, 87%, 100% { translate: 0 0; }
  13% { translate: 0 calc(-1px * var(--ord-amp-q, 0)); }
  25% { translate: 0 calc(-2px * var(--ord-amp-q, 0)); }
  37% { translate: 0 calc(-3px * var(--ord-amp-q, 0)); }
  63% { translate: 0 calc(-2px * var(--ord-amp-q, 0)); }
  75% { translate: 0 calc(-1px * var(--ord-amp-q, 0)); }
}
@keyframes float-char {
  0%, 87%, 100% { translate: 0 0; color: currentColor; }
  13% { translate: calc(var(--flt-amp-q, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.33) calc(var(--flt-amp-q, 3px) * -0.33); }
  25% { translate: calc(var(--flt-amp-q, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.66) calc(var(--flt-amp-q, 3px) * -0.66); color: var(--float-peak); }
  37% { translate: calc(var(--flt-amp-q, 3px) * var(--float-sway, 0) * var(--float-dir, 1)) calc(var(--flt-amp-q, 3px) * -1); color: var(--float-peak); }
  63% { translate: calc(var(--flt-amp-q, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.66) calc(var(--flt-amp-q, 3px) * -0.66); color: var(--float-peak); }
  75% { translate: calc(var(--flt-amp-q, 3px) * var(--float-sway, 0) * var(--float-dir, 1) * 0.33) calc(var(--flt-amp-q, 3px) * -0.33); }
}
`;
const QUANT8_KEYS = quantKeys(8);
const QUANT32_KEYS = quantKeys(32);
const QUANT128_KEYS = quantKeys(128);
const PROP_STILL = `@property --still { syntax: "<number>"; inherits: true; initial-value: 0; }`;

/* 变体表 —— 2026-09-25 一轮省法筛选的存档。结论：都不管用，别重复试。
   量出来的只有两条：①「动画常驻」这一笔的账是「被读的变量在动」触发的，
   不看它的值变没变（所以量化振幅没用）；②真正省得下来的只有去掉 keyframes 里的
   var()（= 旧机制，可合成），而那等于放弃连续振幅。
   base/legacy 是决策用的那一对；其余四条是筛选过程，留着是为了不再走一遍。
   口径：NOSAMPLE=1 + Performance.getMetrics 差值（帧间隔 p50 不是造价，见 withTrace 注）。 */
const VARIANTS = {
  base: '',
  nowill: NO_WILL,
  literal: LITERAL_KEYS,
  ampvar: AMP_VAR_KEYS,
  quant8: QUANT8_KEYS,
  quant32: QUANT32_KEYS,
  quant128: QUANT128_KEYS,
  prop: PROP_STILL,
  'prop-nowill': PROP_STILL + NO_WILL,
};

/* ── 主线程账本：帧间隔在无头里是按调度器节奏走的，读不出造价；
      改读 Chrome 的时间线（这也是 Constructs.astro 那条实测注的口径：
      「全站样式重算 1026→766ms、动画 Tick 423→62ms」）。── */
const TRACE = process.env.TRACE === '1';
/* 逐帧采样器会自己逼出样式重算，量造价时用 NOSAMPLE=1 关掉它 */
const SAMPLE = process.env.NOSAMPLE !== '1';
const KEY_EVENTS = [
  'UpdateLayoutTree', // 样式重算
  'Animation', // 动画 tick
  'Paint',
  'RasterTask',
  'CompositeLayers',
  'Layout',
  'FunctionCall',
  'TimerFire',
  'MajorGC',
  'MinorGC',
];

async function withTrace(page, ms, act) {
  if (!TRACE) {
    await act();
    return null;
  }
  await page.tracing.start({ categories: ['devtools.timeline', 'benchmark'], path: null });
  await act();
  const buf = await page.tracing.stop();
  const json = JSON.parse(Buffer.from(buf).toString('utf8'));
  const ev = json.traceEvents || [];
  /* 只认渲染主线程：不筛会把合成/栅格/工作线程的时间一起算进来（合计能超过窗口本身） */
  const main = new Set(
    ev
      .filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
      .map((e) => `${e.pid}:${e.tid}`),
  );
  const byName = {};
  const counts = {};
  let total = 0;
  for (const e of ev) {
    if (e.ph !== 'X') continue;
    if (main.size && !main.has(`${e.pid}:${e.tid}`)) continue;
    counts[e.name] = (counts[e.name] || 0) + 1;
    if (!e.dur) continue;
    const ms2 = e.dur / 1000;
    byName[e.name] = (byName[e.name] || 0) + ms2;
    total += ms2;
  }
  const picked = {};
  for (const k of KEY_EVENTS) if (byName[k] !== undefined) picked[k] = Math.round(byName[k] * 10) / 10;
  /* 帧数：帧间隔在无头里按调度器节奏走（实测随笔页能到 126 次/秒），读它得不出造价；
     「这段窗口里主线程到底产出了多少帧」才回答得了『有没有被动画吃掉帧』。 */
  return {
    windowMs: ms,
    totalMs: Math.round(total * 10) / 10,
    byName: picked,
    frames: counts['ProxyMain::BeginMainFrame'] || 0,
    commits: counts['ProxyMain::BeginMainFrame::commit'] || 0,
  };
}

/* ── 主线程账本 ──
   Performance.getMetrics 是浏览器自己累计的计数器（TaskDuration / RecalcStyleDuration /
   LayoutDuration / ScriptDuration），读区间差值即可 —— 比读帧间隔稳得多，也没有
   时间线解析的开销。逐帧采样器会自己逼出重算，所以量账一律配 NOSAMPLE=1。── */
const METRIC_KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
async function metricsDelta(page, ms, act) {
  const pick = (m) => {
    const o = {};
    for (const k of METRIC_KEYS) o[k] = m[k] ?? 0;
    return o;
  };
  const m0 = pick(await page.metrics());
  await act();
  const m1 = pick(await page.metrics());
  const d = { windowMs: ms };
  for (const k of METRIC_KEYS) d[k] = Math.round((m1[k] - m0[k]) * 100000) / 100;
  return d;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* 清点：这一页上有多少个「定格漂浮族」元素，各自声明了什么动画 */
const COUNT = () => {
  const pick = (sel) => {
    const els = [...document.querySelectorAll(sel)];
    const first = els[0];
    return {
      n: els.length,
      anim: first ? getComputedStyle(first).animationName : null,
      willChange: first ? getComputedStyle(first).willChange : null,
      translate: first ? getComputedStyle(first).translate : null,
    };
  };
  return {
    reality: document.body.dataset.reality ?? null,
    mix: getComputedStyle(document.documentElement).getPropertyValue('--reality-mix').trim(),
    still: getComputedStyle(document.documentElement).getPropertyValue('--still').trim(),
    ord: pick('.ord-digit'),
    floatCh: pick('.float-ch'),
    brand: pick('.brand-char'),
    fldSq: pick('.fld-sq'),
    drift: pick('.drift'),
  };
};

/* 逐帧采样器：装进页面里，长按前后各跑一轮 */
const SAMPLER = () => {
  const w = window;
  w.__ramp = { rows: [], longTasks: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__ramp.longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    /* 无 longtask 支持就算了 */
  }
  /* translate 的序列化形如 "0px -3px"：取纵向那一段（浮动走的就是它）。
     "none" ＝ 没有动画也没有静态 translate ⇒ 基准位 0，这一步跳变本身就是骤停。 */
  const px = (v) => {
    const s = (v || '').trim();
    if (s === '' || s === 'none') return 0;
    const parts = s.split(/\s+/).filter((x) => /^-?[\d.]+px$/.test(x));
    if (!parts.length) return 0;
    const y = parts.length > 1 ? parts[1] : parts[0];
    return parseFloat(y);
  };
  const t0 = performance.now();
  let last = t0;
  const tick = (now) => {
    const digits = [...document.querySelectorAll('.md .ord-digit')].slice(0, 4);
    const brand = document.querySelector('.brand-char');
    w.__ramp.rows.push({
      t: Math.round(now - t0),
      dt: Math.round((now - last) * 100) / 100,
      mix: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reality-mix')) || 0,
      holding: document.body.classList.contains('reality-holding') ? 1 : 0,
      reality: document.body.dataset.reality === 'dream' ? 1 : 0,
      off: digits[0] ? (getComputedStyle(digits[0]).animationName === 'none' ? 1 : 0) : null,
      d: digits.map((d) => px(getComputedStyle(d).translate)),
      b: brand ? px(getComputedStyle(brand).transform.split(',')[5]) : null,
      bt: document.querySelector('.brand')?.textContent ?? null,
    });
    last = now;
    w.__raf = requestAnimationFrame(tick);
  };
  w.__raf = requestAnimationFrame(tick);
};

/* 长按：指针落在正文左侧的空白处（内容页只有空白处可长按） */
async function press(page, holdMs) {
  await page.mouse.move(24, 420);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, holdMs));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 900));
}

const summarize = (rows) => {
  const frames = rows.length;
  const span = frames > 1 ? rows[frames - 1].t - rows[0].t : 0;
  const dts = rows.slice(1).map((r) => r.dt);
  const sorted = [...dts].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const dropped = dts.filter((d) => d > 33).length;
  /* 逐帧跳变：只看同一枚数字相邻两帧的位移差 */
  let maxJump = 0;
  let jumpAt = null;
  let jumpWhen = null;
  let jumpFrames = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (!a.d.length || !b.d.length) continue;
    for (let k = 0; k < Math.min(a.d.length, b.d.length); k++) {
      if (a.d[k] === null || b.d[k] === null) continue;
      const j = Math.abs(a.d[k] - b.d[k]);
      if (j > 1.01) jumpFrames++;
      if (j > maxJump) {
        maxJump = j;
        jumpAt = b.t;
        jumpWhen = { mix: b.mix, holding: b.holding, reality: b.reality, from: a.d[k], to: b.d[k], dt: b.dt };
      }
    }
  }
  const offDuringHold = rows.filter((r) => r.holding === 1 && r.off === 1).length;
  const offOnDream = rows.filter((r) => r.reality === 1 && r.off === 1).length;
  /* 品牌词在长按期间出现过几个不同的字 —— 旧机制下它照旧每秒轮转一个。 */
  const brandWords = [...new Set(rows.filter((r) => r.holding === 1).map((r) => r.bt).filter(Boolean))];
  /* 换字的时刻表（只在字变了那一帧记一笔），用来判「轮转停了没有」 */
  const brandTimeline = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].bt && rows[i].bt !== rows[i - 1].bt) brandTimeline.push([rows[i].t, rows[i].holding, rows[i].bt]);
  }
  return {
    frames,
    spanMs: Math.round(span),
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    droppedOver33: dropped,
    longTasks: null,
    maxJumpPx: Math.round(maxJump * 1000) / 1000,
    maxJumpAtMs: jumpAt,
    maxJumpContext: jumpWhen,
    jumpFramesOver1px: jumpFrames,
    stoppedFramesWhileHolding: offDuringHold,
    stoppedFramesOnDream: offOnDream,
    brandWordsWhileHolding: brandWords,
    brandTimeline,
    traceSample: rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 40)) === 0).map((r) => ({
      t: r.t,
      mix: Math.round(r.mix * 1000) / 1000,
      hold: r.holding,
      d: r.d,
    })),
  };
};

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const report = { tag: TAG, pages: {} };

  /* ONLY 只跑一条路由（筛变体用）；Git Bash 会把以 / 开头的 env 值当路径改写，故不带斜杠传 */
  const only = process.env.ONLY;
  const paths = only ? [only.startsWith('/') ? only : `/${only}`] : ['/articles/hello-xingmeng/', '/', '/styleguide/'];
  for (const url of paths) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('xm-boot-seen', '1');
      sessionStorage.setItem('xm-reality', 'dream');
    });
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1800));
    if (LEGACY) await page.addStyleTag({ content: LEGACY_CSS });
    if (VARIANTS[VARIANT]) await page.addStyleTag({ content: VARIANTS[VARIANT] });

    const counts = { dream: await page.evaluate(COUNT) };

    /* 静置采样：什么都不按，只量「这些动画挂着本身」的代价 ——
       「常驻」二字到底花在哪，看这一列（长按那一列混着线程特效，说明不了常驻的账）。 */
    const idleCfg = 2500 + Number(process.env.SHIFT || 0);
    let idleRows = { rows: [], longTasks: [] };
    let idleTrace;
    const idleMetrics = await metricsDelta(page, idleCfg, async () => {
      idleTrace = await withTrace(page, idleCfg, async () => {
        /* 量造价时别装逐帧采样器：它每帧调 getComputedStyle/querySelectorAll，
           自己就把样式重算逼出来了，账会记到被量的东西头上。 */
        if (SAMPLE) await page.evaluate(SAMPLER);
        /* SHIFT 用来把长按挪到品牌字标轮转周期的另一个相位上 ——
           周期是 7×1000ms + 3000ms 呼吸 = 10s，不挪的话每次长按都落在同一档。 */
        await new Promise((r) => setTimeout(r, idleCfg));
        if (SAMPLE) {
          idleRows = await page.evaluate(() => {
            cancelAnimationFrame(window.__raf);
            return { rows: window.__ramp.rows, longTasks: window.__ramp.longTasks };
          });
        }
      });
    });
    const idle = idleRows;
    const idleSum = summarize(idle.rows);
    idleSum.longTasks = idle.longTasks;
    idleSum.trace = idleTrace;
    idleSum.metrics = idleMetrics;

    /* 入梦 → 醒：按住不放，跨过 2200ms 的闩锁点 */
    let toWakeRows = { rows: [], longTasks: [] };
    let wakeTrace;
    const wakeMetrics = await metricsDelta(page, 2500, async () => {
      wakeTrace = await withTrace(page, 2500, async () => {
        if (SAMPLE) await page.evaluate(SAMPLER);
        await press(page, 2500);
        if (SAMPLE) {
          toWakeRows = await page.evaluate(() => {
            cancelAnimationFrame(window.__raf);
            const r = window.__ramp;
            return { rows: r.rows, longTasks: r.longTasks };
          });
        }
      });
    });
    const toWake = toWakeRows;
    counts.wake = await page.evaluate(COUNT);

    /* 回梦：醒面静置后再按一次，方向相反（QUICK 只用来筛变体，这两段与后面那段一起省掉） */
    let s2 = null;
    if (!QUICK) {
      await page.evaluate(SAMPLER);
      await press(page, 1700);
      const toDream = await page.evaluate(() => {
        cancelAnimationFrame(window.__raf);
        const r = window.__ramp;
        return { rows: r.rows, longTasks: r.longTasks };
      });
      counts.after = await page.evaluate(COUNT);
      s2 = summarize(toDream.rows);
      s2.longTasks = toDream.longTasks;
    }

    const s1 = summarize(toWake.rows);
    s1.longTasks = toWake.longTasks;
    s1.trace = wakeTrace;
    s1.metrics = wakeMetrics;

    /* 上一段（toDream）按满 1700ms 已闩锁回梦面；这一段「按一半就松手」再静置观察 4s：
       品牌字标的轮转在长按中停住，松手退回梦面之后必须自己接上 ——
       否则一次中途取消就会把字标永久冻在某个词上。 */
    let resume = { timeline: [], state: {} };
    if (!QUICK) {
      await page.evaluate(SAMPLER);
      await press(page, 700);
      await new Promise((r) => setTimeout(r, 4000));
      const raw = await page.evaluate(() => {
        cancelAnimationFrame(window.__raf);
        return {
          rows: window.__ramp.rows.map((r) => ({ t: r.t, hold: r.holding, mix: r.mix, bt: r.bt })),
        };
      });
      let prev = null;
      const resumeTimeline = [];
      for (const r of raw.rows) {
        if (r.bt && r.bt !== prev) {
          resumeTimeline.push([r.t, r.hold, r.bt]);
          prev = r.bt;
        }
      }
      resume = {
        timeline: resumeTimeline,
        state: await page.evaluate(() => ({
          reality: document.body.dataset.reality,
          brand: document.querySelector('.brand')?.textContent ?? null,
        })),
      };
    }

    report.pages[url] = {
      counts,
      idle: idleSum,
      toWake: s1,
      toDream: s2,
      resume,
      errors,
    };
    await page.close();
  }

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT_DIR, `${TAG}.json`), JSON.stringify(report, null, 2));
  for (const [url, p] of Object.entries(report.pages)) {
    console.log(`\n=== ${url}`);
    console.log(
      '  清点  梦面：ord %d(anim=%s) float %d(anim=%s) brand %d(anim=%s) fld %d(anim=%s)',
      p.counts.dream.ord.n,
      p.counts.dream.ord.anim,
      p.counts.dream.floatCh.n,
      p.counts.dream.floatCh.anim,
      p.counts.dream.brand.n,
      p.counts.dream.brand.anim,
      p.counts.dream.fldSq.n,
      p.counts.dream.fldSq.anim,
    );
    console.log(
      '  清点  醒面：ord(anim=%s translate=%s) float(anim=%s translate=%s) brand %d(anim=%s) fld(anim=%s)',
      p.counts.wake.ord.anim,
      p.counts.wake.ord.translate,
      p.counts.wake.floatCh.anim,
      p.counts.wake.floatCh.translate,
      p.counts.wake.brand.n,
      p.counts.wake.brand.anim,
      p.counts.wake.fldSq.anim,
    );
    console.log(
      '  梦面静置：帧 %d / %dms  p50 %sms  p95 %sms  掉帧(>33ms) %d  长任务 %j',
      p.idle.frames,
      p.idle.spanMs,
      p.idle.p50,
      p.idle.p95,
      p.idle.droppedOver33,
      p.idle.longTasks,
    );
    console.log(
      '  入梦→醒：帧 %d / %dms  p50 %sms  p95 %sms  掉帧(>33ms) %d  长任务 %j',
      p.toWake.frames,
      p.toWake.spanMs,
      p.toWake.p50,
      p.toWake.p95,
      p.toWake.droppedOver33,
      p.toWake.longTasks,
    );
    console.log(
      '             最大一帧跳变 %spx @%sms（>1px 的帧 %d；长按中动画停摆的帧 %d）\n             品牌换字时刻表（t ms / 是否长按中 / 字）%j\n             %j',
      p.toWake.maxJumpPx,
      p.toWake.maxJumpAtMs,
      p.toWake.jumpFramesOver1px,
      p.toWake.stoppedFramesWhileHolding,
      p.toWake.brandTimeline,
      p.toWake.maxJumpContext,
    );
    if (p.idle.metrics) {
      console.log(
        '  主线程账本 静置 %dms：任务 %sms（脚本 %s / 样式重算 %s / 布局 %s）',
        p.idle.metrics.windowMs,
        p.idle.metrics.TaskDuration,
        p.idle.metrics.ScriptDuration,
        p.idle.metrics.RecalcStyleDuration,
        p.idle.metrics.LayoutDuration,
      );
      console.log(
        '  主线程账本 长按 %dms：任务 %sms（脚本 %s / 样式重算 %s / 布局 %s）',
        p.toWake.metrics.windowMs,
        p.toWake.metrics.TaskDuration,
        p.toWake.metrics.ScriptDuration,
        p.toWake.metrics.RecalcStyleDuration,
        p.toWake.metrics.LayoutDuration,
      );
    }
    if (p.idle.trace) {
      console.log(
        '  主线程账本 静置 %dms：合计 %sms 帧 %d  %j',
        p.idle.trace.windowMs,
        p.idle.trace.totalMs,
        p.idle.trace.frames,
        p.idle.trace.byName,
      );
    }
    if (p.toWake.trace) {
      console.log(
        '  主线程账本 长按 %dms：合计 %sms 帧 %d  %j',
        p.toWake.trace.windowMs,
        p.toWake.trace.totalMs,
        p.toWake.trace.frames,
        p.toWake.trace.byName,
      );
    }
    if (p.toDream) {
      console.log(
        '  醒→入梦：帧 %d / %dms  p50 %sms  p95 %sms  掉帧(>33ms) %d  长任务 %j',
        p.toDream.frames,
        p.toDream.spanMs,
        p.toDream.p50,
        p.toDream.p95,
        p.toDream.droppedOver33,
        p.toDream.longTasks,
      );
      console.log(
        '             最大一帧跳变 %spx @%sms（>1px 的帧 %d；挂着梦面却停摆的帧 %d）\n             %j',
        p.toDream.maxJumpPx,
        p.toDream.maxJumpAtMs,
        p.toDream.jumpFramesOver1px,
        p.toDream.stoppedFramesOnDream,
        p.toDream.maxJumpContext,
      );
    }
    if (p.resume.timeline.length) {
      console.log(
        '  中途松手后静置 4s：reality=%s brand=%s 松手后换字 %j  ⇒  %s',
        p.resume.state.reality,
        p.resume.state.brand,
        p.resume.timeline.filter((x) => x[1] === 0).map((x) => [x[0], x[2]]),
        p.resume.timeline.filter((x) => x[1] === 0).length >= 2 ? '轮转自己接上了 ✓' : '轮转没接上 ✗',
      );
    }
  }
  console.log(`\n报告：design/.shots-ramp/${TAG}.json`);
})();
