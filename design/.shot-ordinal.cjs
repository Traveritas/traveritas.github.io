/* ─────────────────────────────────────────────────────────────
   小节序号「定格漂浮」的活体抽查。
   用法：npm run build && node design/.shot-ordinal.cjs
   输出：design/.shots-ordinal/*.png + report.json

   查五件事：
   1. 醒面：序号在、**位移恒为 0**（动画常驻，振幅乘 --still 归零）；
   2. 梦面：每枚数字有 ord-digit-float（step-end 零补间）、--i 错相生效、
      波峰那一档浮到 −3px；
   3. 两面之间 .ord 的占位与标题文字的起点**逐像素相同** —— 序号不该让标题
      位移（幅只走 translate，所以这条必须成立）；
   4. 序号不另起字体：随笔侧读到的 font-family 是宋体、项目侧是黑体，与标题同源；
   5. 无 JS（清掉 reality.ts 写的 --reality-mix 与 data-reality）：零位移
      （动画仍在，但 --still 为 0）；
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '.shots-ordinal');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
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

/* 页内探针：把两态下序号的可计算样式与几何一次读全，好逐项断言 */
const PROBE = () => {
  const ords = [...document.querySelectorAll('.md .ord')];
  const root = getComputedStyle(document.documentElement);
  const num = (v) => Math.round(v * 10) / 10;

  const read = (o) => {
    /* 浮动的单位是 .ord-digit（一枚数字）；序号本身只是一个行内记号 */
    const digits = [...o.querySelectorAll('.ord-digit')];
    const cs = getComputedStyle(digits[0]);
    const box = o.getBoundingClientRect();
    const digitBox = digits[0].getBoundingClientRect();
    return {
      digits: digits.map((d) => d.textContent).join(''),
      box: { w: num(box.width), h: num(box.height), left: num(box.left), top: num(box.top) },
      digitCount: digits.length,
      digitBox: { w: num(digitBox.width), h: num(digitBox.height) },
      /* 醒面必须是 0px 0px（零位移），梦面是量化后的 −Npx */
      shifts: digits.map((d) => getComputedStyle(d).translate),
      anim: cs.animationName,
      animDur: cs.animationDuration,
      animEase: cs.animationTimingFunction,
      animDelay: cs.animationDelay,
      /* 逐枚数字的相位：错相要看整枚序号，不能只看第一枚 */
      delays: digits.map((d) => getComputedStyle(d).animationDelay),
      iVar: digits[0].style.getPropertyValue('--i'),
      color: cs.color,
      font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      tabular: cs.fontVariantNumeric,
      willChange: cs.willChange,
    };
  };

  /* 标题文字的起点：从 .ord 之后到 h2 末尾取一个 range —— 序号换介质时
     这个数必须一动不动，否则就是「入梦把标题挤了一下」。 */
  const textStart = () => {
    const h = document.querySelector('.md h2');
    if (!h) return null;
    const ord = h.querySelector('.ord');
    const r = document.createRange();
    r.selectNodeContents(h);
    if (ord) r.setStartAfter(ord);
    const b = r.getBoundingClientRect();
    return { left: num(b.left), top: num(b.top), width: num(b.width) };
  };

  /* 落位：序号盒的光学中心 vs 标题文字中心。delta > 0 ＝ 序号偏低，
     就是 essay 变体 vertical-align: middle 需要补的那一段。 */
  const align = () => {
    const h = document.querySelector('.md h2');
    if (!h) return null;
    const ord = h.querySelector('.ord');
    const r = document.createRange();
    r.selectNodeContents(h);
    r.setStartAfter(ord);
    const t = r.getBoundingClientRect();
    const o = ord.getBoundingClientRect();
    const delta = (t.top + t.bottom) / 2 - (o.top + o.bottom) / 2;
    const fs = parseFloat(getComputedStyle(h).fontSize);
    return {
      delta: num(delta),
      fontSize: fs,
      emFix: Math.round((delta / fs) * 1000) / 1000,
      ordBox: { top: num(o.top), bottom: num(o.bottom) },
      textBox: { top: num(t.top), bottom: num(t.bottom) },
    };
  };

  return {
    reality: document.body.dataset.reality ?? null,
    holding: document.body.classList.contains('reality-holding'),
    mix: root.getPropertyValue('--reality-mix').trim(),
    count: ords.length,
    nums: ords.map((o) => o.textContent.trim()),
    text: document.querySelector('.md h2')?.textContent ?? null,
    h2Font: (() => {
      const h = document.querySelector('.md h2');
      return h ? getComputedStyle(h).fontFamily.split(',')[0].replace(/["']/g, '') : null;
    })(),
    textStart: textStart(),
    align: align(),
    first: ords[0] ? read(ords[0]) : null,
    all: ords.map(read),
  };
};

(async () => {
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });

  const report = { errors: [], cases: {} };

  /* 一页一案：面由 sessionStorage 的闩锁决定（reality.ts 的 xm-reality），
     开屏走「站内切换」快档（xm-boot-seen）以免每张图都在校准里等 3 秒。 */
  const shot = async (url, face, tag) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(
      (f) => {
        sessionStorage.setItem('xm-boot-seen', '1');
        sessionStorage.setItem('xm-reality', f);
      },
      face,
    );
    await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1600));

    const probe = await page.evaluate(PROBE);

    /* 裁到前三个 h2 的并集，留出上下呼吸。
       clip 走**页面坐标**（视口矩形 + 滚动量），配 captureBeyondViewport：
       .md 在首屏之下，只给视口坐标会截到别处。 */
    const regionOf = (count) =>
      page.evaluate((n) => {
        const hs = [...document.querySelectorAll('.md h2')].slice(0, n);
        if (!hs.length) return null;
        const rs = hs.map((h) => h.getBoundingClientRect());
        const top = Math.min(...rs.map((r) => r.top)) + scrollY;
        const bottom = Math.max(...rs.map((r) => r.bottom)) + scrollY;
        const left = Math.min(...rs.map((r) => r.left)) + scrollX;
        const right = Math.max(...rs.map((r) => r.right)) + scrollX;
        return { x: left - 24, y: top - 20, width: right - left + 48, height: bottom - top + 40 };
      }, count);

    const clip = await regionOf(3);
    if (clip) await page.screenshot({ path: path.join(OUT, `${tag}.png`), clip, captureBeyondViewport: true });

    /* 单枚序号的 6× 特写：序号只有 ~12px 高，不放大看不出字形与落位 */
    const ordClip = await page.evaluate(() => {
      const o = document.querySelector('.md .ord');
      if (!o) return null;
      const b = o.getBoundingClientRect();
      return {
        x: b.left + scrollX - 8,
        y: b.top + scrollY - 10,
        width: b.width + 16,
        height: b.height + 20,
      };
    });
    if (ordClip) {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 6 });
      await new Promise((r) => setTimeout(r, 200));
      await page.screenshot({ path: path.join(OUT, `${tag}-zoom.png`), clip: ordClip, captureBeyondViewport: true });
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    }

    report.cases[tag] = { url, face, probe, errors };
    report.errors.push(...errors.map((e) => `${tag}: ${e}`));
    return page;
  };

  await shot('/articles/hello-xingmeng/', 'wake', 'essay-wake');
  const dreamPage = await shot('/articles/hello-xingmeng/', 'dream', 'essay-dream');
  await shot('/projects/personal-website/', 'wake', 'project-wake');
  await shot('/projects/personal-website/', 'dream', 'project-dream');

  /* ── 梦面：把每一枚数字定死在同一相位，看「顶点浮到 −3px」那一下 ──
     用 WAAPI 定 currentTime（37% ＝ 1.036s）：currentTime 把 animation-delay
     也算在内，所以先把每枚自己那 −0.4s 的错相抹平，再定相位。 */
  const apexPeak = await dreamPage.evaluate(() => {
    for (const digit of document.querySelectorAll('.md .ord-digit')) {
      const a = digit.getAnimations()[0];
      if (!a) continue;
      a.effect.updateTiming({ delay: 0 });
      a.pause();
      a.currentTime = 1036; /* 2.8s 的 37%：整条阶梯的波峰 */
    }
    const cs = getComputedStyle(document.querySelector('.md .ord-digit'));
    return { translate: cs.translate };
  });
  await new Promise((r) => setTimeout(r, 250));
  const apexClip = await dreamPage.evaluate(() => {
    const hs = [...document.querySelectorAll('.md h2')].slice(0, 2);
    const rs = hs.map((h) => h.getBoundingClientRect());
    const top = Math.min(...rs.map((r) => r.top)) + scrollY;
    const bottom = Math.max(...rs.map((r) => r.bottom)) + scrollY;
    const left = Math.min(...rs.map((r) => r.left)) + scrollX;
    const right = Math.max(...rs.map((r) => r.right)) + scrollX;
    return { x: left - 24, y: top - 20, width: right - left + 48, height: bottom - top + 40 };
  });
  await dreamPage.screenshot({
    path: path.join(OUT, 'essay-dream-apex.png'),
    clip: apexClip,
    captureBeyondViewport: true,
  });
  report.cases['essay-dream-apex'] = { peak: apexPeak };

  /* ── 无 JS：清掉 reality.ts 写下的 --reality-mix 与 data-reality，
        剩下的必须与醒面逐像素相同（「HTML 原文＝醒面真值」） ── */
  await dreamPage.evaluate(() => {
    document.documentElement.style.removeProperty('--reality-mix');
    document.body.removeAttribute('data-reality');
  });
  await new Promise((r) => setTimeout(r, 250));
  report.cases['no-js'] = { probe: await dreamPage.evaluate(PROBE) };

  /* ── 样式预览页的序号样张：01–12（用页面自己的醒/梦切面开关） ── */
  for (const face of ['wake', 'dream']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${port}/styleguide/`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.click(`[data-sg-face="${face}"]`);
    await new Promise((r) => setTimeout(r, 1000));
    const holder = await page.evaluateHandle(() =>
      document.querySelector('.sg-ord-row')?.closest('.sg-spec'),
    );
    const el = holder.asElement();
    if (el) await el.screenshot({ path: path.join(OUT, `sg-ord-${face}.png`) });
    report.cases[`sg-ord-${face}`] = {
      reality: await page.evaluate(() => document.body.dataset.reality),
      count: await page.evaluate(() => document.querySelectorAll('.sg-ord-row .ord').length),
      nums: await page.evaluate(() =>
        [...document.querySelectorAll('.sg-ord-row .ord')].map((n) => n.textContent.trim()),
      ),
      anim: await page.evaluate(
        () => getComputedStyle(document.querySelector('.sg-ord-row .ord-digit')).animationName,
      ),
    };
    await page.close();
  }

  /* ── 断言 ── */
  const c = report.cases;
  const checks = [];
  const eq = (name, a, b) => checks.push({ name, pass: a === b, got: a, want: b });

  eq('醒面 data-reality', c['essay-wake'].probe.reality, 'wake');
  eq('醒目 mix', c['essay-wake'].probe.mix, '1.000');
  /* 醒面动画**常驻**（2026-09-25 起）：不再按 data-reality / reality-holding 开关，
     换面时就没有「摘掉动画」这一下骤停；醒面靠 --still 归零把振幅收到 0。
     所以这里断的不再是「没有动画」，而是「动画在、位移为 0」。 */
  eq('醒面动画常驻', c['essay-wake'].probe.first.anim, 'ord-digit-float');
  /* translate 归零时序列化成 0px（两枚数字的基准位） */
  const zero = (shifts) => shifts.every((s) => s === 'none' || /^0px/.test(s));
  checks.push({
    name: '醒面零位移',
    pass: zero(c['essay-wake'].probe.first.shifts),
    got: c['essay-wake'].probe.first.shifts.join(' '),
    want: 'none / 0px',
  });
  eq('醒面序号 3 枚', c['essay-wake'].probe.count, 3);
  eq('醒面序号 01/02/03', c['essay-wake'].probe.nums.join(','), '01,02,03');
  eq('醒面两枚数字', c['essay-wake'].probe.first.digitCount, 2);
  /* 序号不另起字体：它读到的字必须与它所在的 h2 一模一样 */
  eq('序号与 h2 同字（随笔）', c['essay-wake'].probe.first.font, c['essay-wake'].probe.h2Font);
  eq('序号与 h2 同字（项目）', c['project-wake'].probe.first.font, c['project-wake'].probe.h2Font);

  eq('梦面 data-reality', c['essay-dream'].probe.reality, 'dream');
  eq('梦面 mix', c['essay-dream'].probe.mix, '0.000');
  eq('梦面动画名', c['essay-dream'].probe.first.anim, 'ord-digit-float');
  eq('梦面动画曲线', c['essay-dream'].probe.first.animEase.replace('steps(1)', 'step-end'), 'step-end');
  eq('梦面动画时长', c['essay-dream'].probe.first.animDur, '2.8s');
  /* 错相从**定格之前**的探针里读：定格会把所有相位改成同一个值 */
  const delays = c['essay-dream'].probe.all[0].delays;
  checks.push({
    name: '梦面两枚数字相位不同',
    pass: new Set(delays).size === 2 && delays.length === 2,
    got: delays.join(' '),
    want: '两个不同相位（0s / -0.4s）',
  });

  /* 两面之间：记号的占位与标题文字起点必须一模一样。
     序号在两面共用同一套字、浮动又只走 translate ⇒ 这里应当**逐像素相同**。 */
  const w = c['essay-wake'].probe.first.box;
  const d = c['essay-dream'].probe.first.box;
  eq('两面 .ord 盒宽一致', w.w, d.w);
  eq('两面 .ord 盒高一致', w.h, d.h);
  eq('两面 .ord 盒位一致', w.left, d.left);
  eq('两面标题文字起点一致', c['essay-wake'].probe.textStart.left, c['essay-dream'].probe.textStart.left);
  eq('两面标题文字起点一致(y)', c['essay-wake'].probe.textStart.top, c['essay-dream'].probe.textStart.top);

  /* 两位数字等宽 ⇒ 板宽与章节数无关（tabular-nums） */
  const widths = c['essay-dream'].probe.all.map((o) => o.box.w);
  checks.push({
    name: '各章节序号等宽（「11」类不缩窄）',
    pass: new Set(widths).size === 1,
    got: widths.join(' '),
    want: '三枚序号同宽',
  });

  /* 无 JS ＝ 醒面（--reality-mix 恒 1 ⇒ --still 恒 0） */
  eq('无 JS 动画常驻', c['no-js'].probe.first.anim, 'ord-digit-float');
  checks.push({
    name: '无 JS 零位移',
    pass: zero(c['no-js'].probe.first.shifts),
    got: c['no-js'].probe.first.shifts.join(' '),
    want: 'none / 0px',
  });
  eq('无 JS 序号仍在', c['no-js'].probe.nums.join(','), '01,02,03');

  /* 项目变体：印章板 */
  eq('项目面序号 01', c['project-wake'].probe.nums.join(','), '01,02');
  eq('项目梦面动画在', c['project-dream'].probe.first.anim, 'ord-digit-float');
  eq('波峰那一档：浮到 -3px', apexPeak.translate, '0px -3px');
  /* 样式预览页那排样张：01–12，两个面都要在 */
  eq('预览页样张 12 枚', c['sg-ord-wake'].count, 12);
  eq('预览页样张编号 01–12', c['sg-ord-wake'].nums.join(' '), '01 02 03 04 05 06 07 08 09 10 11 12');
  eq('预览页醒面动画常驻', c['sg-ord-wake'].anim, 'ord-digit-float');
  eq('预览页梦面在漂浮', c['sg-ord-dream'].anim, 'ord-digit-float');

  report.checks = checks;
  report.failed = checks.filter((x) => !x.pass);
  report.apexPeak = apexPeak;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  for (const x of checks) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.name}${x.pass ? '' : `  got=${x.got} want=${x.want}`}`);
  console.log('\npeak frame:', JSON.stringify(report.apexPeak));
  console.log('errors:', report.errors.length ? report.errors : '0');
  console.log(`${checks.filter((x) => x.pass).length}/${checks.length} passed`);

  await browser.close();
  server.close();
  process.exit(report.failed.length || report.errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
