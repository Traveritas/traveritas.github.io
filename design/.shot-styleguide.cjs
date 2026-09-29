/* ─────────────────────────────────────────────────────────────
   样式预览页（/styleguide/）的活体抽查：截图 + 计算值断言。
   用法：npm run build && node design/.shot-styleguide.cjs
   输出：design/.shots-styleguide/*.png + report.json

   口径沿用 design/mocks/.shot-cursor.cjs：
   · 自带以 dist/ 为 root 的临时静态服务器（随机端口，跑完自关）；
   · Chrome 指到本机安装；viewport 1440×900；
   · 采样前把 --still 置 0 并强制一次重排（浮动类 keyframes 带相位噪声）。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '.shots-styleguide');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
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

const SHOTS = [
  { n: '01-top', at: null },
  { n: '02-prose-cols', at: '#sg-prose' },
  { n: '03-parts', at: '#sg-parts' },
  { n: '04-dual', at: '#sg-dual' },
  { n: '05-chrome', at: '#sg-chrome' },
  { n: '06-local', at: '#sg-local' },
];

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));

  const base = `http://127.0.0.1:${port}/styleguide/`;
  await page.goto(base, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  /* 采样前锁相位：--still 归零 + 强制重排（浮动动画带相位噪声） */
  const still = async () => {
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--still', '0');
      void document.body.offsetHeight;
    });
  };
  await still();

  const report = { errors, faces: {}, shots: [] };

  /** 面切换：走控制条上的按钮（与长按入梦同一条路径） */
  const setFace = async (face) => {
    await page.click(`[data-sg-face="${face}"]`);
    await new Promise((r) => setTimeout(r, 700));
    await still();
  };

  /** 收集一面的关键计算值 */
  const probe = async (face) => {
    return page.evaluate(() => {
      const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
      const q = (s) => document.querySelector(s);
      const cols = [...document.querySelectorAll('#sg-prose .sg-cols--3 .prose')].map((el) => ({
        cls: el.className,
        font: cs(el, 'font-family').split(',')[0],
        size: cs(el, 'font-size'),
        lh: cs(el, 'line-height'),
        ls: cs(el, 'letter-spacing'),
        align: cs(el, 'text-align'),
      }));
      const stages = [...document.querySelectorAll('.sg-stage .seam')].map((el) => ({
        opacity: cs(el, 'opacity'),
        mask: cs(el, 'mask-image').slice(0, 24),
      }));
      const rail = q('.sg-stage .rail');
      return {
        face: document.body.dataset.reality,
        mix: cs(document.documentElement, '--reality-mix').trim(),
        still: cs(document.documentElement, '--still').trim(),
        amber: cs(document.documentElement, '--amber').trim(),
        amberRead: q('[data-sg-token="--amber"]')?.textContent?.trim(),
        measureRead: q('[data-sg-w="sg-m-measure"]')?.textContent?.trim(),
        containerRead: q('[data-sg-w="sg-m-container"]')?.textContent?.trim(),
        gapRead: q('[data-sg-h="sg-m-gap"]')?.textContent?.trim(),
        cols,
        sideDream: cs(q('.md div[data-side="dream"]'), 'display'),
        sideWake: cs(q('.md div[data-side="wake"]'), 'display'),
        stages,
        rail: rail ? { opacity: cs(rail, 'opacity'), vis: cs(rail, 'visibility') } : null,
        railScoped: cs(q('.rail'), 'opacity'),
        ledgerGrid: cs(q('.ledger a'), 'grid-template-columns'),
        /* 伪元素要显式给 pseudo 参数，否则拿不到内容（踩坑同 content-typography.md 第五节） */
        taskChecked: (() => {
          const el = q('.prose--project .md li:has(input:checked)');
          return el ? getComputedStyle(el, '::before').content : null;
        })(),
        taskOpen: (() => {
          const el = q('.prose--project .md li:has(input:not(:checked))');
          return el ? getComputedStyle(el, '::before').content : null;
        })(),
        essayTaskChecked: (() => {
          const el = q('.prose--essay .md li:has(input:checked)');
          return el ? getComputedStyle(el, '::before').content : null;
        })(),
        essayTaskOpen: (() => {
          const el = q('.prose--essay .md li:has(input:not(:checked))');
          return el ? getComputedStyle(el, '::before').content : null;
        })(),
        h2Essay: (() => {
          const el = q('.prose--essay .md h2');
          return el
            ? {
                content: getComputedStyle(el, '::before').content,
                size: getComputedStyle(el, '::before').fontSize,
                color: getComputedStyle(el, '::before').color,
              }
            : null;
        })(),
        h2Project: (() => {
          const el = q('.prose--project .md h2');
          const b = el ? getComputedStyle(el, '::before') : null;
          return b ? { content: b.content, border: b.borderTopWidth, gap: b.marginRight } : null;
        })(),
        essayTaskInputShown: cs(q('.prose--essay .md li input'), 'display'),
        barButtons: document.querySelectorAll('.sg-bar button').length,
        specCount: document.querySelectorAll('.sg-spec').length,
        sectionCount: document.querySelectorAll('.sg-sec').length,
      };
    });
  };

  const shots = [];
  for (const s of SHOTS) {
    if (s.at) {
      await page.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, s.at);
      await new Promise((r) => setTimeout(r, 350));
      await still();
    }
    const file = path.join(OUT, `${s.n}.png`);
    await page.screenshot({ path: file });
    shots.push({ ...s, file });
  }
  report.shots = shots;

  /* 站点默认入梦（无 sessionStorage 档位时 reality.ts 落到梦面），
     故两面都必须显式切，别指望初始态是醒面 */
  report.faces.wake = await (async () => {
    await setFace('wake');
    return probe();
  })();
  await setFace('dream');
  await page.evaluate(() => {
    document.querySelector('#sg-dual')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise((r) => setTimeout(r, 350));
  await still();
  await page.screenshot({ path: path.join(OUT, '07-dual-dream.png') });
  report.faces.dream = await probe();

  /* 叠影滑杆：梦里看残影（醒面 --still=0，残影本就该归零）。
     采样前必须撤掉锁相的那支内联 --still，否则错位量与不透明度恒为 0。 */
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--still');
    const el = document.querySelector('[data-sg-echo]');
    el.value = '1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
  report.ghostAtEcho1 = await page.evaluate(() => {
    const g = document.querySelector('#sg-echo-zone .ghost');
    const s = getComputedStyle(g);
    return { transform: s.transform, opacity: s.opacity, still: getComputedStyle(document.documentElement).getPropertyValue('--still').trim() };
  });
  await page.screenshot({ path: path.join(OUT, '09-ghost-echo1.png') });

  /* 参考线与轮廓开关是否生效 */
  await page.click('[data-sg-toggle="sg-grid"]');
  report.gridOn = await page.evaluate(() =>
    document.documentElement.classList.contains('sg-grid'),
  );
  await page.click('[data-sg-toggle="sg-off-rail"]');
  report.railHidden = await page.evaluate(() => {
    const r = document.querySelector('.rail');
    return r ? getComputedStyle(r).display : 'none-el';
  });
  await page.screenshot({ path: path.join(OUT, '08-overlays.png') });

  /* 窄档：并置栏应自动叠成单栏，仪表轨应隐藏 */
  for (const vp of [
    { n: '10-w900', w: 900, h: 900 },
    { n: '11-w390', w: 390, h: 844 },
  ]) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await new Promise((r) => setTimeout(r, 400));
    await still();
    await page.screenshot({ path: path.join(OUT, `${vp.n}.png`) });
    await page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, '#sg-prose');
    await new Promise((r) => setTimeout(r, 300));
    await still();
    await page.screenshot({ path: path.join(OUT, `${vp.n}-prose.png`) });
    report[`cols@${vp.w}`] = await page.evaluate(() => {
      const box = document.querySelector('#sg-prose .sg-cols--3');
      return {
        columns: box ? getComputedStyle(box).gridTemplateColumns : null,
        specW: Math.round(document.querySelector('#sg-prose .sg-cols--3 .sg-spec').getBoundingClientRect().width),
        bodyW: Math.round(document.querySelector('.sg-body').getBoundingClientRect().width),
        railDisplay: (() => {
          const r = document.querySelector('.sg-stage .rail');
          return r ? getComputedStyle(r).display : null;
        })(),
      };
    });
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nerrors: ${errors.length}`);
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
