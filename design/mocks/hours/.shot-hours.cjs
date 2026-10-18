/* ─────────────────────────────────────────────────────────────
   「版块＝时辰」原型的截图对照：路由 × 醒/梦 × 桌面/手机 × 变体（off / a / b）。
   用法：npm run build && node design/mocks/hours/.shot-hours.cjs
   输出：design/mocks/hours/.shots/
     <视图>-<两态>-<路由>-<变体>-<段>.png   单张（桌面 1440×900；手机 390×844 @2x）
     cmp-<视图>-<两态>-<路由>-<段>.png       同一画面三个变体并排（现状 | A | B）
     index.html                                对照总览（浏览器直接打开）
     report.json                               每页的注入状态、控制台报错、文字对比度
   全量约 10 分钟（每页约 5 秒）。
   收窄范围（迭代时省时间）：环境变量 VARIANTS=a,b  VIEWS=d  STATES=wake  MAXSEG=1
     ROUTES=/projects/,/moments/  —— 在 Git Bash 里传 ROUTES 要加 MSYS_NO_PATHCONV=1，
     否则「/」会被改写成 Git 的安装路径。
   只重拍 a,b 时，并排图仍会用磁盘上已有的 off 截图。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start, hourOf } = require('./serve-hours.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });

const list = (env, dflt) => (process.env[env] || dflt).split(',').map((s) => s.trim()).filter(Boolean);
const ROUTES = list('ROUTES', '/,/articles/,/articles/co-creation-notes/,/projects/,/projects/personal-website/,/moments/,/about/,/tags/醒梦/,/404.html');
const VARIANTS = list('VARIANTS', 'off,a,b');
const STATES = list('STATES', 'wake,dream');
const VIEWS = list('VIEWS', 'd,m');
const MAXSEG = +(process.env.MAXSEG || 2);
const ALL_VARIANTS = ['off', 'a', 'b'];
const LABEL = { off: '现状', a: 'A 整夜', b: 'B 浅色时辰' };
const VIEWPORT = {
  d: { width: 1440, height: 900, deviceScaleFactor: 1 },
  m: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugOf = (route) => route.replace(/[\/.]+/g, '_').replace(/^_|_$/g, '') || 'home';

/* 文字对比度：前景对「最近的不透明祖先底色」，找不到就对 --bg（不计渐变与叠加层，只抓明显的错） */
function probeContrast() {
  const parse = (s) => {
    if (!s) return null;
    let m = s.match(/^color\(srgb\s+([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    m = s.match(/^rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:fixed;left:-9px;top:0;width:1px;height:1px;background:var(--bg)';
  document.body.appendChild(tmp);
  const bg = parse(getComputedStyle(tmp).backgroundColor);
  tmp.remove();
  const SEL = {
    h1: 'main h1',
    lede: '.lede',
    year: '.year',
    'row-title': '.row-title',
    'row-desc': '.row-desc',
    'row-date': '.row-date',
    'body-p': '.md p',
    meta: '.prose-meta',
    nav: '.site-nav a',
    footer: '.site-footer span',
  };
  const contrast = {};
  for (const [k, s] of Object.entries(SEL)) {
    const el = [...document.querySelectorAll(s)].find((e) => e.getClientRects().length);
    if (!el || !bg) continue;
    let base = bg;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) {
        base = c;
        break;
      }
    }
    let fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    if (fg[3] < 1) fg = [0, 1, 2].map((i) => fg[i] * fg[3] + base[i] * (1 - fg[3]));
    contrast[k] = +ratio(fg, base).toFixed(2);
  }
  const root = document.documentElement;
  return {
    injected: [...document.styleSheets].some((s) => (s.href || '').includes('/__hours/hours.css')),
    hour: root.dataset.hour || null,
    hours: root.dataset.hours || null,
    bg: bg && bg.slice(0, 3).map(Math.round),
    contrast,
  };
}

async function shoot(browser, port) {
  const report = [];
  for (const view of VIEWS) {
    for (const state of STATES) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT[view]);
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      // 预热：跳过开屏面纱，并按要拍的面写好入梦检验的会话档位（站点默认落在梦面）
      await page.goto(`http://127.0.0.1:${port}/robots.txt`);
      await page.evaluate((s) => {
        sessionStorage.setItem('xm-boot-seen', '1');
        if (s === 'wake') sessionStorage.setItem('xm-reality', 'wake');
        else sessionStorage.removeItem('xm-reality');
      }, state);
      errs.length = 0; // 预热页是纯文本，Chrome 会顺带请求 /favicon.ico 而 404，不算进第一页
      for (const route of ROUTES) {
        for (const v of VARIANTS) {
          const slug = slugOf(route);
          try {
            await page.goto(`http://127.0.0.1:${port}${encodeURI(route)}?v=${v}`, { waitUntil: 'networkidle2', timeout: 60000 });
          } catch (e) {
            errs.push(`goto ${route}: ${e.message}`);
          }
          await page.evaluate(() => document.fonts && document.fonts.ready);
          await sleep(route === '/' ? 5000 : 2600);
          const probe = await page.evaluate(probeContrast);
          const H = await page.evaluate(() => document.documentElement.scrollHeight);
          const vh = VIEWPORT[view].height;
          const n = Math.max(1, Math.min(MAXSEG, Math.ceil(H / vh)));
          let k = 0;
          for (let i = 0; i < n; i++) {
            const y = Math.min(i * vh, Math.max(0, H - vh));
            await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
            await sleep(route === '/' ? 1200 : 600);
            await page.screenshot({ path: path.join(OUT, `${view}-${state}-${slug}-${v}-${k}.png`) });
            k++;
          }
          report.push({ view, state, variant: v, route, expectHour: hourOf(route), H, shots: k, ...probe, errs: errs.splice(0) });
          console.log(view, state, v, route, `H=${H}`, `shots=${k}`, probe.injected ? `hour=${probe.hour}` : '(未注入)');
        }
      }
      await page.close();
    }
  }
  return report;
}

/* 同一画面三个变体并排成一张（读磁盘上已有的单张，所以只重拍 a,b 时也能拼出现状列） */
async function composite(browser, port) {
  const groups = new Map();
  for (const f of fs.readdirSync(OUT)) {
    const m = /^(d|m)-(wake|dream)-(.+)-(off|a|b)-(\d+)\.png$/.exec(f);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}-${m[3]}-${m[5]}`;
    if (!groups.has(key)) groups.set(key, {});
    groups.get(key)[m[4]] = f;
  }
  const page = await browser.newPage();
  const made = [];
  for (const [key, files] of [...groups].sort()) {
    const mobile = key.startsWith('m-');
    const w = mobile ? 300 : 640;
    const cols = ALL_VARIANTS.filter((v) => files[v]);
    const html = `<body style="margin:0;padding:8px;display:flex;gap:8px;background:#8b9096;font:13px/1.6 system-ui">${cols
      .map(
        (v) =>
          `<figure style="margin:0;width:${w}px"><figcaption style="color:#fff;padding:0 0 4px">${LABEL[v]}</figcaption><img src="http://127.0.0.1:${port}/__hours/.shots/${files[v]}?t=${Date.now()}" style="width:${w}px;display:block"></figure>`,
      )
      .join('')}</body>`;
    await page.setViewport({ width: cols.length * (w + 8) + 8, height: 400, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    const out = `cmp-${key}.png`;
    await page.screenshot({ path: path.join(OUT, out), fullPage: true });
    made.push(out);
  }
  await page.close();
  const items = made
    .map((f) => `<section><h2>${f.replace(/^cmp-|\.png$/g, '')}</h2><img src="${f}" loading="lazy"></section>`)
    .join('\n');
  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>版块＝时辰 · 对照</title>
<style>body{margin:24px;background:#5f646a;color:#fff;font:14px/1.6 system-ui}h2{font:500 13px ui-monospace,monospace;margin:28px 0 8px}img{max-width:100%;display:block}</style>
<h1>版块＝时辰 · 现状 | A 整夜 | B 浅色时辰</h1>
<p>文件名：视图（d 桌面 / m 手机）- 两态 - 路由 - 第几屏</p>
${items}`,
  );
  return made.length;
}

(async () => {
  if (!fs.existsSync(path.resolve(__dirname, '..', '..', '..', 'dist', 'index.html'))) {
    console.error('dist/ 不存在，先在仓库根目录跑 npm run build');
    process.exit(1);
  }
  const { server, port } = await start(0);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader'],
  });
  try {
    const report = await shoot(browser, port);
    const prev = fs.existsSync(path.join(OUT, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8')) : [];
    const keyOf = (r) => `${r.view}|${r.state}|${r.variant}|${r.route}`;
    const merged = new Map(prev.map((r) => [keyOf(r), r]));
    for (const r of report) merged.set(keyOf(r), r);
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify([...merged.values()], null, 2));
    const n = await composite(browser, port);
    const errs = report.filter((r) => r.errs.length).length;
    const lost = report.filter((r) => r.variant !== 'off' && !r.injected).length;
    console.log(`\n完成：${report.length} 页，${n} 张并排图 → design/mocks/hours/.shots/index.html`);
    console.log(`有报错的页：${errs}；该注入却没注入 hours.css 的页：${lost}`);
  } finally {
    await browser.close();
    server.close();
  }
})();
