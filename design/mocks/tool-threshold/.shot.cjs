/* 切面 threshold · 截图 + 对比度核对
   node design/mocks/tool-threshold/.shot.cjs        → design/mocks/tool-threshold/.shots/
   ONLY=home,grid,read,gate,404,dream,paths,verb,mobile,tools,notches,contrast   只跑一部分

   动词是 CSS transform，由 --rise 驱动；?verb=0..1 直接停在某一帧（frozen）。
   三条召唤路径都靠真事件驱动：边缘点刻痕、指针扫过、快捷键 T + ←/→ + 回车。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('./serve.cjs');
const puppeteer = require(process.env.PUPPETEER_DIR || path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.join(__dirname, '.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const report = [];
const say = (s) => { report.push(s); console.log(s); };

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/tool-threshold/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const fresh = async (qs = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${qs}: ${e.message || e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${qs}: ${m.text()}`); });
    await page.setViewport(vp);
    await page.goto(URL + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__th', { timeout: 20000 });
    await sleep(1500);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  /* 停用动画：把 --rise 与所有过渡钉住，保证拍到确定的一帧 */
  const freeze = (page) => page.evaluate(() => window.__th.freeze());

  /* 把指针挪到某片刻痕上方（三条路里的第二条靠真事件） */
  const toNotch = async (page, i) => {
    const nk = await page.evaluate((k) => window.__th.nk(k), i);
    await page.mouse.move(Math.round(nk.x), Math.round(nk.y) - 12, { steps: 8 });
    await sleep(420);
    return nk;
  };
  const faceTag = (page) => page.evaluate(() => {
    const f = document.querySelector('#face');
    const h = document.querySelector('#face-body .f-h');
    return (f && !f.hidden ? (h ? h.textContent.trim() : f.getAttribute('aria-label')) : null);
  });

  /* ── 四种语境的静置帧 ── */
  if (want('home')) {
    for (const [q, n] of [['?ctx=home', '01-home-wake'], ['?ctx=home&face=dream', '01b-home-dream']]) {
      const p = await fresh(q); await shot(p, n); await p.close();
    }
  }
  if (want('grid')) {
    for (const [q, n] of [
      ['?ctx=grid&scene=essay', '02-grid-light'],
      ['?ctx=grid&scene=project', '02b-grid-deep'],
      ['?ctx=grid&scene=moment', '02c-grid-other'],
      ['?ctx=grid&scene=moment&face=dream', '02d-grid-other-dream'],
    ]) { const p = await fresh(q); await shot(p, n); await p.close(); }
  }
  if (want('read')) {
    for (const [q, n] of [['?ctx=read', '03-read-light'], ['?ctx=read&face=dream', '03b-read-dream']]) {
      const p = await fresh(q); await shot(p, n); await p.close();
    }
  }
  if (want('gate')) { const p = await fresh('?ctx=gate'); await shot(p, '04-gate'); await p.close(); }
  if (want('404')) { const p = await fresh('?ctx=404'); await shot(p, '05-404'); await p.close(); }
  if (want('dream')) { const p = await fresh('?ctx=home&face=dream'); await shot(p, '06-home-dream'); await p.close(); }

  /* ── 十二片刻痕的索引帧（只为看清，截图脚本临时揭示标签） ── */
  if (want('notches')) {
    const p = await fresh('?ctx=grid');
    await p.addStyleTag({ content: '.nk-lab{opacity:1 !important;transform:none !important}.nk-tick{height:12px !important}' });
    await sleep(300);
    await shot(p, '00-notches-all');
    await p.close();
  }

  /* ── 三条召唤路径：唤出的必须是同一个面 ── */
  const pathTags = {};
  if (want('paths')) {
    // 1 · 边缘露头：刻痕常驻，指针靠近就升起，直接点
    const p1 = await fresh('?ctx=grid');
    await toNotch(p1, 0);
    await shot(p1, '07-path-edge-risen');
    await p1.mouse.down(); await p1.mouse.up();
    await sleep(900);
    await shot(p1, '07b-path-edge-face');
    pathTags.edge = await faceTag(p1);
    await p1.close();

    // 2 · 指针沿线扫过：刻痕逐个升起，落定后展开同一个面
    const p2 = await fresh('?ctx=grid');
    for (let i = 8; i >= 0; i--) await toNotch(p2, i);
    await toNotch(p2, 0);
    await shot(p2, '08-path-pointer-sweep');
    await p2.mouse.down(); await p2.mouse.up();
    await sleep(900);
    await shot(p2, '08b-path-pointer-face');
    pathTags.pointer = await faceTag(p2);
    await p2.close();

    // 3 · 快捷键 T：游标沿线走，回车落定
    const p3 = await fresh('?ctx=grid');
    await p3.keyboard.press('t');
    await sleep(200);
    await p3.keyboard.press('ArrowRight');
    await p3.keyboard.press('ArrowRight');
    await sleep(300);
    await shot(p3, '09-path-keys-cursor');
    await p3.keyboard.press('ArrowLeft');
    await p3.keyboard.press('ArrowLeft');
    await sleep(300);
    await p3.keyboard.press('Enter');
    await sleep(900);
    await shot(p3, '09b-path-keys-face');
    pathTags.keys = await faceTag(p3);
    await p3.close();

    const same = pathTags.edge && pathTags.edge === pathTags.pointer && pathTags.pointer === pathTags.keys;
    say(`召唤路径 · 边缘=${pathTags.edge} 指针=${pathTags.pointer} 快捷键=${pathTags.keys} → ${same ? '同一个面 OK' : '不一致 !!!'}`);
  }

  /* ── 「线以下不动」：升起前后，世界的位置与高度一字不变 ── */
  if (want('paths')) {
    const p = await fresh('?ctx=read');
    const rect = () => {
      const w = document.querySelector('#world');
      const r = w.getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height), sh: w.scrollHeight, st: w.scrollTop };
    };
    const before = await p.evaluate(rect);
    await p.evaluate(() => window.__th.open('contents'));
    await sleep(900);
    const after = await p.evaluate(rect);
    const same = JSON.stringify(before) === JSON.stringify(after);
    say(`线以下不动 · 升起前 ${JSON.stringify(before)} / 升起后 ${JSON.stringify(after)} → ${same ? 'OK' : '动了 !!!'}`);
    await shot(p, '11-face-open-world-still');
    await p.close();
  }

  /* ── 动词中途一帧 ── */
  if (want('verb')) {
    for (const [v, n] of [['0.25', '10-verb-025'], ['0.55', '10b-verb-055']]) {
      const p = await fresh(`?ctx=grid&verb=${v}&tool=find`);
      await sleep(400);
      await shot(p, n);
      await p.close();
    }
  }

  /* ── 十二件工具各一个面 ── */
  if (want('tools')) {
    const faces = [
      ['find', '?ctx=grid', '12-find'],
      ['view', '?ctx=grid', '13-view'],
      ['scene', '?ctx=grid', '14-scene'],
      ['home', '?ctx=grid', '15-home'],
      ['nexus', '?ctx=grid', '16-nexus'],
      ['exits', '?ctx=grid', '17-exits'],
      ['face', '?ctx=grid', '18-face'],
      ['sound', '?ctx=grid', '19-sound'],
      ['contents', '?ctx=read', '20-contents'],
      ['reading', '?ctx=read', '21-reading'],
      ['filter', '?ctx=grid&scene=moment', '22-filter'],
      ['time', '?ctx=grid', '23-time'],
    ];
    for (const [id, q, n] of faces) {
      const p = await fresh(q);
      await p.evaluate((x) => window.__th.open(x), id);
      await sleep(900);
      await shot(p, n);
      await p.close();
    }
    // 检索真搜一次
    const p = await fresh('?ctx=grid');
    await p.evaluate(() => window.__th.open('find'));
    await sleep(700);
    await p.type('#f-q', '显影', { delay: 60 });
    await sleep(700);
    await shot(p, '24-find-query');
    await p.close();
    // 入口与失线页上各升起一片，证明四种语境都成立
    for (const [q, id, n] of [['?ctx=gate', 'find', '25-gate-face'], ['?ctx=404', 'time', '26-404-face'], ['?ctx=home', 'nexus', '27-home-face']]) {
      const pp = await fresh(q);
      await pp.evaluate((x) => window.__th.open(x), id);
      await sleep(900);
      await shot(pp, n);
      await pp.close();
    }
  }

  /* ── 390×844 ── */
  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    for (const [q, n] of [['?ctx=grid', '30-m-grid'], ['?ctx=read', '31-m-read']]) {
      const p = await fresh(q, vp);
      const of = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      say(`移动端 ${n} · scrollWidth=${of.sw} innerWidth=${of.iw} → ${of.sw <= of.iw + 1 ? '不溢出 OK' : '溢出 !!!'}`);
      await shot(p, n);
      await p.close();
    }
    const p = await fresh('?ctx=grid', vp);
    await p.evaluate(() => window.__th.open('filter'));
    await sleep(900);
    await shot(p, '32-m-filter');
    await p.close();
  }

  /* ── 对比度：深底浅底各核一次 ── */
  if (want('contrast')) {
    const probe = () => {
      const parse = (c) => { const m = String(c).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const over = (t, b) => { const a = t[3]; return [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1]; };
      const effBg = (el) => {
        const layers = []; let n = el;
        while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; } n = n.parentElement; }
        if (!layers.length) return [255, 255, 255, 1];
        let base = layers[layers.length - 1];
        for (let i = layers.length - 2; i >= 0; i--) base = over(layers[i], base);
        return base;
      };
      const ratio = (f, b) => { const a = lum(f), b2 = lum(b); const hi = Math.max(a, b2), lo = Math.min(a, b2); return (hi + 0.05) / (lo + 0.05); };
      const tests = [
        ['正文', '#world h1, #world .read p, #world .w-404 p, #world .card .t, #world .w-home h1', 4.5],
        ['柔正文', '#world .lead, #world .card .d, #world .rmeta, #world .w-404 p', 4.5],
        ['小标签', '.nk-lab, .w-head .cnt, .card .m, .gate-crystal .gc-tag, .gate-note', 3],
        ['面内', '#face .f-link, #face .f-note, #face .f-h', 3],
      ];
      const out = [];
      for (const [name, sel, min] of tests) {
        const el = document.querySelector(sel);
        if (!el) { out.push([name, sel, null, min]); continue; }
        const fg = parse(getComputedStyle(el).color) || [0, 0, 0, 1];
        const bg = effBg(el);
        const f2 = fg[3] < 1 ? over(fg, bg) : fg;
        out.push([name, sel, +ratio(f2, bg).toFixed(2), min]);
      }
      return out;
    };
    say('\n对比度（正文类 ≥ 4.5 · 小标签类 ≥ 3；面内近似把玻璃叠在 --bg 上算）');
    let bad = 0;
    for (const [q, label] of [['?ctx=read', '浅底 · 阅读'], ['?ctx=grid&scene=project', '深底 · 项目'], ['?ctx=gate', 'NEXUS 天光'], ['?ctx=404', '失线']]) {
      const p = await fresh(q);
      await p.evaluate(() => window.__th.open('filter'));
      await sleep(700);
      const rows = await p.evaluate(probe);
      say(`  ${label}`);
      for (const [name, sel, r, min] of rows) {
        if (r == null) { say(`    -- ${name.padEnd(4, '　')}   n/a      ${sel}`); continue; }
        const ok = r >= min;
        if (!ok) bad++;
        say(`    ${ok ? 'ok ' : '!! '}${name.padEnd(4, '　')} ${String(r).padStart(6)} / ≥${min}   ${sel}`);
      }
      await p.close();
    }
    say(bad ? `对比度有 ${bad} 处不达标` : '对比度全部达标');
  }

  await browser.close();
  server.close();
  say(`\n控制台 / 页面错误数：${errors.length}`);
  if (errors.length) say(errors.join('\n'));
  fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n'), 'utf8');
})().catch((e) => { console.error(e); process.exit(1); });
