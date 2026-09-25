/* ─────────────────────────────────────────────────────────────
   Phase 19 · 正文元素补齐（p19-prose-elements.html）的截图与实测

   用法：node design/.shot-p19.cjs
   输出：design/.shots-p19/*.png + report.json
         （report.json 含每张图的实测计算值：A/B 两稿的 ::before content、
           边距、字号、列宽，以及控制台错误数）

   口径沿用 design/mocks/.shot-cursor.cjs 与 .shot-styleguide.cjs：
   · 自带以仓库根为 root 的临时静态服务器（随机端口，跑完自关）；
   · Chrome 指本机安装；viewport 1440×900；
   · 采样前冻结动效（?freeze=1），避免引文漂移与颗粒相位带噪声。
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE = '/design/mocks/p19-prose-elements.html';
const OUT = path.join(__dirname, '.shots-p19');
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
  '.ttf': 'font/ttf',
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

/* 机位：n = 文件名，q = 查询串，at = 滚动目标选择器 */
const SHOTS = [
  { n: '01-read-dream', q: '?freeze=1&ui=0&face=dream', at: '#r01' },
  { n: '02-read-wake', q: '?freeze=1&ui=0&face=wake', at: '#r01' },
  { n: '03-read-deep', q: '?freeze=1&ui=0&zone=deep', at: '#r01' },
  { n: '04-read-paper', q: '?freeze=1&ui=0&zone=paper', at: '#r01' },
  { n: '05-h3-a', q: '?freeze=1&ui=0&h3=a', at: '#r02' },
  { n: '06-h3-b', q: '?freeze=1&ui=0&h3=b', at: '#r02' },
  { n: '07-ol-a', q: '?freeze=1&ui=0&ol=a', at: '#r03' },
  { n: '08-ol-b', q: '?freeze=1&ui=0&ol=b', at: '#r03' },
  { n: '09-table-a', q: '?freeze=1&ui=0&tbl=a', at: '#r04' },
  { n: '10-table-b', q: '?freeze=1&ui=0&tbl=b', at: '#r04' },
  { n: '11-figure-a', q: '?freeze=1&ui=0&fig=a', at: '#r05' },
  { n: '12-figure-b', q: '?freeze=1&ui=0&fig=b', at: '#r05' },
  { n: '13-code-a', q: '?freeze=1&ui=0&code=a', at: '#r06' },
  { n: '14-code-b', q: '?freeze=1&ui=0&code=b', at: '#r06' },
  { n: '15-decisions', q: '?freeze=1&ui=0', at: '#r07' },
  { n: '16-all-b', q: '?freeze=1&ui=0&opt=b', at: '#r02' },
  /* 前 / 后 对照：?legacy=1 还原现状的两处写法缺陷 */
  { n: '19-legacy-ol', q: '?freeze=1&ui=0&legacy=1', at: '#r03' },
  { n: '20-legacy-code', q: '?freeze=1&ui=0&legacy=1', at: '#r06' },
];

/* 实测：A 与 B 各读一遍关键计算值 */
const PROBE = {
  '.col--essay .md h3': ['font-size', 'letter-spacing', 'margin-top'],
  '.col--project .md h3': ['font-size', 'letter-spacing'],
  '.col--essay .md h3::before': ['content', 'width', 'background-color'],
  '.col--project .md h3::before': ['content', 'font-size'],
  '.col--essay .md ol > li': ['padding-left'],
  '.col--project .md ol > li': ['padding-left'],
  '.col--essay .md ol > li::before': ['content', 'font-size'],
  '.col--project .md ol > li::before': ['content', 'font-size', 'font-family'],
  '.col--essay .md td': ['padding-top', 'border-bottom-width'],
  '.col--project .md table': ['border-top-width', 'background-color'],
  '.col--essay .md figcaption': ['font-size'],
  '.col--essay .md figcaption::before': ['content'],
  '.col--project .md figure': ['border-top-width'],
  '.col--essay .md pre': ['border-left-width', 'background-color', 'scrollbar-width'],
  '.col--project .md pre': ['border-left-width'],
  '.col--essay .md code': ['background-color', 'border-bottom-width', 'font-size'],
  '.col--essay .md blockquote': ['animation-name', 'animation-duration'],
  '.col--project .md blockquote': ['animation-name', 'animation-duration'],
  '.col--essay .md div[data-side]': ['margin-bottom'],
  '.col--project .md div[data-side]': ['margin-bottom'],
  '.col--essay .md h3': ['font-size'],
  '.col--essay .prose': ['width', 'font-size'],
  '.col--project .prose': ['width', 'font-size'],
};

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

  const base = `http://127.0.0.1:${port}${PAGE}`;
  const read = async (opts) => {
    await page.goto(`${base}?${opts}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 450));
    return page.evaluate((probeMap) => {
      const out = {};
      for (const key in probeMap) {
        /* 键写作 "选择器::before"；querySelector 遇到伪元素只是永不匹配，
           要显式把伪元素交给 getComputedStyle 的第二个参数 */
        const [sel, pseudoName] = key.split('::');
        const pseudo = pseudoName ? `::${pseudoName}` : null;
        const el = document.querySelector(sel);
        if (!el) {
          out[key] = null;
          continue;
        }
        const rec = {};
        for (const prop of probeMap[key]) {
          rec[prop] = getComputedStyle(el, pseudo).getPropertyValue(prop).trim();
        }
        out[key] = rec;
      }
      return { opts: location.search, state: window.__p19.state(), probes: out };
    }, PROBE);
  };

  const report = { errors, shots: [], probes: {} };

  for (const s of SHOTS) {
    await page.goto(`${base}${s.q}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 450));
    if (s.at) {
      await page.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, s.at);
      await new Promise((r) => setTimeout(r, 300));
    }
    const file = path.join(OUT, `${s.n}.png`);
    await page.screenshot({ path: file });
    report.shots.push({ ...s, file });
  }

  report.probes.A = await read('freeze=1&ui=0&opt=a');
  report.probes.B = await read('freeze=1&ui=0&opt=b');
  report.probes.deepA = await read('freeze=1&ui=0&opt=a&zone=deep');

  /* 窄屏：两栏应叠成单栏，表格不应顶宽页面 */
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${base}?freeze=1&ui=0`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: path.join(OUT, '17-w390-read.png') });
  report.narrow = await page.evaluate(() => {
    const w = (s) => {
      const el = document.querySelector(s);
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    };
    return {
      html: document.documentElement.clientWidth,
      body: w('body'),
      container: w('.container'),
      table: w('.col--essay .md table'),
      scrollW: document.documentElement.scrollWidth,
      cols: getComputedStyle(document.querySelector('.cols')).gridTemplateColumns,
    };
  });
  await page.evaluate(() => document.querySelector('#r04')?.scrollIntoView({ behavior: 'instant' }));
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: path.join(OUT, '18-w390-table.png') });

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`shots: ${report.shots.length}  errors: ${errors.length}`);
  console.log(JSON.stringify(errors, null, 1));
  console.log('narrow:', JSON.stringify(report.narrow));
  console.log('A/B 关键差异：');
  const keys = [
    '.col--essay .md h3::before',
    '.col--project .md h3::before',
    '.col--essay .md ol > li::before',
    '.col--project .md ol > li::before',
    '.col--essay .md figcaption::before',
    '.col--project .md table',
    '.col--project .md figure',
    '.col--essay .md pre',
    '.col--essay .md code',
    '.col--project .md blockquote',
    '.col--essay .md div[data-side]',
    '.col--project .md div[data-side]',
  ];
  for (const k of keys) {
    console.log(' ', k);
    console.log('    A:', JSON.stringify(report.probes.A.probes[k]));
    console.log('    B:', JSON.stringify(report.probes.B.probes[k]));
  }
  console.log('deep zone table/code bg:');
  console.log('  ', JSON.stringify(report.probes.deepA.probes['.col--project .md table']));
  console.log('  ', JSON.stringify(report.probes.deepA.probes['.col--essay .md pre']));

  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
