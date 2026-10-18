/* 潜影 · 显影 — 截图与自检
   node design/mocks/tool-latent/.shot.cjs        → design/mocks/tool-latent/.shots/
   ONLY=still,summon,verb,core,mobile,retract    只拍一部分

   除截图外还写一份 .shots/report.json：
     errors    控制台与页面报错（必须为空）
     contrast  深底 / 浅底各一份，正文类 ≥ 4.5、小标签类 ≥ 3
     tools     十二件工具是否都找得到、都打得开
     layout    390×844 有没有溢出
     trace     静置时边缘那条痕的浓度（应当只比周围高一点点，且 > 0）
*/
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

const report = { errors: [], contrast: {}, tools: {}, layout: {}, trace: {}, notes: [] };

(async () => {
  const server = await start(0);
  const BASE = `http://localhost:${server.address().port}/tool-latent/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const fresh = async (qs = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }, wait = 1500) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => report.errors.push(`${qs}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && report.errors.push(`${qs}: ${m.text()}`));
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(BASE + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__l && window.__p', { timeout: 20000 });
    await sleep(wait);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const geo = (page) => page.evaluate(() => window.__l.ring());

  /* ── 1 · 四种语境的静置帧 ─────────────────────────────── */
  if (want('still')) {
    const stills = [
      ['01-still-home', '?ctx=home'],
      ['02-still-grid-essay', '?ctx=grid&scene=essay'],
      ['03-still-grid-project', '?ctx=grid&scene=project'],
      ['04-still-grid-moment', '?ctx=grid&scene=moment'],
      ['05-still-read', '?ctx=read'],
      ['06-still-gate', '?ctx=gate'],
      ['07-still-404', '?ctx=404'],
    ];
    for (const [name, qs] of stills) {
      const p = await fresh(qs);
      await shot(p, name);
      /* 静置时那条痕的浓度：应当 > 0 且远低于满墨 */
      if (name === '02-still-grid-essay' || name === '03-still-grid-project') {
        report.trace[name] = await p.evaluate(() => {
          const t = document.getElementById('trace');
          const cs = getComputedStyle(t);
          return { devp: cs.getPropertyValue('--devp').trim(), opacity: cs.opacity };
        });
      }
      await p.close();
    }
  }

  /* ── 2 · 两面（都显影着看，才看得出字换了）────────────── */
  if (want('faces')) {
    for (const face of ['wake', 'dream']) {
      const p = await fresh(`?ctx=grid&scene=essay&face=${face}`);
      await p.evaluate(() => window.__l.summon('key'));
      await sleep(1100);
      await shot(p, `08-face-${face}`);
      if (face === 'dream') await shot(p, '09-face-dream-project');
      await p.close();
    }
    const p = await fresh('?ctx=grid&scene=project&face=dream');
    await p.evaluate(() => window.__l.summon('key'));
    await sleep(1100);
    await shot(p, '09-face-dream-dark');
    await p.close();
  }

  /* ── 3 · 三条召唤路径 ─────────────────────────────────── */
  if (want('summon')) {
    /* ① 指针跟随 / 停驻：落点附近的一小片先显影（?dwell=0 只留这一小片） */
    let p = await fresh('?ctx=grid&scene=essay&dwell=0');
    const g1 = await geo(p);
    await p.mouse.move(g1.cx + 230, g1.cy + 60, { steps: 10 });
    await sleep(1200);
    await shot(p, '10a-pointer-patch');
    await p.evaluate(() => window.__l.forceRetract());
    await sleep(1800);
    await p.mouse.move(g1.cx + 30, g1.cy - g1.labelR + 8, { steps: 8 });
    await sleep(1200);
    await shot(p, '10b-pointer-patch-top');
    await p.close();

    /* ② 指针停驻：同一片自己长满整圈 */
    p = await fresh('?ctx=grid&scene=essay');
    const g2 = await geo(p);
    await p.mouse.move(g2.cx + 230, g2.cy + 60, { steps: 12 });
    await sleep(1400);
    await shot(p, '10c-pointer-dwell');
    await p.close();

    /* ③ 常驻边缘露头 */
    p = await fresh('?ctx=grid&scene=essay');
    await p.mouse.move(1290, 860, { steps: 6 });
    await sleep(900);
    await shot(p, '10d-edge-hint');
    await p.mouse.move(1440 - 40, 450, { steps: 14 });
    await sleep(1600);
    await shot(p, '10-summon-edge');
    await p.close();

    /* ④ 快捷键 */
    p = await fresh('?ctx=grid&scene=project');
    await p.keyboard.press('d');
    await sleep(1800);
    await shot(p, '11-summon-key');
    await p.close();

    /* ⑤ 三条路唤出的是同一个面：逐帧比一次密度 */
    const gk = await fresh('?ctx=grid&scene=essay');
    await gk.keyboard.press('d');
    await sleep(1300);
    const keyD = await gk.evaluate(() => window.__l.densities());
    await gk.evaluate(() => window.__l.forceRetract());
    await sleep(1800);
    await gk.mouse.move(1440 - 40, 450, { steps: 12 });
    await sleep(1500);
    const edgeD = await gk.evaluate(() => window.__l.densities());
    await gk.evaluate(() => window.__l.forceRetract());
    await sleep(1800);
    await gk.mouse.move(720 + 230, 450 + 60, { steps: 12 });
    await sleep(1500);
    const ptrD = await gk.evaluate(() => window.__l.densities());
    report.sameFace = {
      key: keyD.map((x) => x.dev), edge: edgeD.map((x) => x.dev), pointer: ptrD.map((x) => x.dev),
    };
    await gk.close();

    /* 褪回灰：指针挪开 */
    p = await fresh('?ctx=grid&scene=moment');
    await p.evaluate(() => window.__l.summon('key'));
    await sleep(1100);
    await shot(p, '13-retract-before');
    await p.mouse.move(90, 840, { steps: 10 });
    await sleep(700);
    await shot(p, '13-retract-700ms');
    await sleep(1000);
    await shot(p, '13-retract-1700ms');
    await p.close();
  }

  /* ── 4 · 动词中途（?verb=0..1 停在显影的某一帧）───────── */
  if (want('verb')) {
    for (const v of ['0.25', '0.5', '0.75', '1']) {
      const p = await fresh(`?ctx=grid&scene=essay&verb=${v}`);
      await shot(p, `14-verb-${v.replace('.', '')}`);
      await p.close();
    }
    const p = await fresh('?ctx=grid&scene=project&verb=0.5');
    await shot(p, '14-verb-05-dark');
    await p.close();
  }

  /* ── 5 · 十二件工具逐个打开 ───────────────────────────── */
  if (want('core')) {
    const ids = await fresh('?ctx=read');
    const list = await ids.evaluate(() => window.__l.TOOLS.map((t) => ({ id: t.id, core: t.core })));
    await ids.close();
    const host = await fresh('?ctx=read');
    await host.evaluate(() => window.__l.summon('key'));
    await sleep(1000);
    for (const t of list) {
      const ok = await host.evaluate((id) => {
        const r = window.__l.openNode(id);
        const box = document.getElementById('coreBox');
        return { opened: !!r, html: box.innerHTML.length, text: box.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) };
      }, t.id);
      report.tools[t.id] = { hasCore: !!t.core, ...ok };
      if (t.core) {
        await sleep(650);
        await shot(host, `20-core-${t.id}`);
        await host.evaluate(() => window.__l.closeCore());
        await sleep(200);
      }
    }
    await host.close();
  }

  /* ── 6 · 对比度：深底与浅底各一份，静置与显影后各量一次 ── */
  if (want('contrast')) {
    const probes = [
      ['light-essay', '?ctx=grid&scene=essay'],
      ['light-read', '?ctx=read'],
      ['light-gate', '?ctx=gate'],
      ['light-404', '?ctx=404'],
      ['dark-home', '?ctx=home'],
      ['dark-project', '?ctx=grid&scene=project'],
      ['dark-moment', '?ctx=grid&scene=moment'],
    ];
    for (const [key, qs] of probes) {
      const p = await fresh(qs);
      report.contrast[key] = { still: await p.evaluate(() => window.__l.probe('still')) };
      await p.evaluate(() => window.__l.summon('key'));
      await sleep(1300);
      report.contrast[key].live = await p.evaluate(() => window.__l.probe('live'));
      await p.close();
    }
  }

  /* ── 7 · 390×844 ──────────────────────────────────────── */
  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh('?ctx=grid&scene=essay', vp, 1800);
    await shot(p, '30-m-still');
    report.layout.mStill = await p.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      over: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    await p.evaluate(() => window.__l.summon('key'));
    await sleep(1200);
    await shot(p, '31-m-live');
    report.layout.mLive = await p.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      over: document.documentElement.scrollWidth > innerWidth + 1,
      nodes: document.querySelectorAll('.node').length,
    }));
    await p.evaluate(() => window.__l.openNode('find'));
    await sleep(700);
    await shot(p, '32-m-core-find');
    report.layout.mCore = await p.evaluate(() => {
      const c = document.getElementById('core');
      const r = c.getBoundingClientRect();
      return { over: document.documentElement.scrollWidth > innerWidth + 1, w: Math.round(r.width), h: Math.round(r.height) };
    });
    await p.evaluate(() => window.__l.openNode('filter'));
    await sleep(700);
    await shot(p, '33-m-core-filter');
    report.layout.mFilter = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1 }));
    await p.close();

    const p2 = await fresh('?ctx=read', vp, 1800);
    await p2.evaluate(() => window.__l.summon('key'));
    await sleep(1100);
    await shot(p2, '34-m-read-live');
    await p2.close();
  }

  /* ── 7.5 · 中文小字不能落到 Plex Mono（它没有中文字形）── */
  if (want('fonts')) {
    const list = ['?ctx=home', '?ctx=grid&scene=essay', '?ctx=grid&scene=project',
      '?ctx=grid&scene=moment', '?ctx=read', '?ctx=gate', '?ctx=404'];
    report.fonts = [];
    for (const qs of list) {
      const p = await fresh(qs, { width: 1440, height: 900 }, 900);
      await p.evaluate(() => window.__l.summon('key'));
      await sleep(700);
      const bad = await p.evaluate(() => {
        const out = [];
        document.querySelectorAll('*').forEach((el) => {
          if (el.children.length) return;
          const t = (el.textContent || '').trim();
          if (!t || !/[一-鿿]/.test(t)) return;
          if (/IBM Plex Mono/.test(getComputedStyle(el).fontFamily)) out.push(t.slice(0, 20));
        });
        return out;
      });
      if (bad.length) report.fonts.push({ qs, bad });
      await p.close();
    }
  }

  /* ── 8 · 减动效：动词退成直接显示 ─────────────────────── */
  if (want('rm')) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => report.errors.push('rm: ' + e));
    p.on('console', (m) => m.type() === 'error' && report.errors.push('rm: ' + m.text()));
    await p.setViewport({ width: 1440, height: 900 });
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.goto(BASE + '?ctx=grid&scene=essay', { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction('window.__l && window.__p', { timeout: 20000 });
    await sleep(1200);
    await shot(p, '50-rm-still');
    report.reducedMotion = await p.evaluate(() => {
      const l = document.getElementById('latent');
      const before = getComputedStyle(l).transitionProperty;
      window.__l.summon('key');
      const after = getComputedStyle(document.querySelector('.node-cn')).color;
      return { transition: before, devpRightAfterSummon: getComputedStyle(document.querySelector('.node')).getPropertyValue('--devp'), color: after };
    });
    await sleep(120);
    await shot(p, '51-rm-live');
    await p.close();
  }

  /* ── 9 · 检索：匹配的显影、不匹配的退成灰 ─────────────── */
  if (want('find')) {
    const p = await fresh('?ctx=grid&scene=essay');
    await p.evaluate(() => window.__l.summon('key'));
    await sleep(1000);
    await p.evaluate(() => window.__l.openNode('find'));
    await sleep(700);
    await p.evaluate(() => window.__l.setQuery('显影'));
    await sleep(1200);
    await shot(p, '40-find-develop');
    report.find = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.row')].map((r) => ({
        slug: r.dataset.slug, devp: getComputedStyle(r).getPropertyValue('--devp').trim(),
        color: getComputedStyle(r.querySelector('.row-t')).color,
      }));
      return { count: rows.length, rows };
    });
    await p.evaluate(() => window.__l.setQuery(''));
    await sleep(600);
    await shot(p, '41-find-cleared');
    await p.close();
  }

  await browser.close();
  server.close();

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  /* ── 控制台摘要 ───────────────────────────────────────── */
  const line = (s) => console.log(s);
  line('');
  line('错误数  ' + report.errors.length);
  if (report.errors.length) report.errors.slice(0, 20).forEach((e) => line('  ! ' + e));

  if (Object.keys(report.contrast).length) {
    line('');
    line('对比度（正文类 ≥ 4.5 · 小标签类 ≥ 3）');
    let bad = 0;
    for (const [k, v] of Object.entries(report.contrast)) {
      for (const phase of ['still', 'live']) {
        const pr = v[phase];
        if (!pr) continue;
        /* 静置帧量的是画面；显影后画面按设计退到 0.45，只量工具自己的那几个标签 */
        const group = phase === 'still' ? 'page' : 'tool';
        const items = pr.items.filter((i) => i.group === group);
        const worst = { body: 99, small: 99 };
        items.forEach((it) => { if (it.ratio < worst[it.kind]) worst[it.kind] = it.ratio; });
        const ok = worst.body >= 4.5 && worst.small >= 3;
        if (!ok) bad++;
        line(`  ${ok ? 'OK ' : 'NG '} ${k.padEnd(14)} ${phase.padEnd(6)} bg=${pr.bg}  正文最低 ${worst.body}  小标签最低 ${worst.small}`);
        if (!ok) items.filter((i) => i.ratio < (i.kind === 'body' ? 4.5 : 3)).forEach((i) => line(`      · ${i.name} ${i.ratio} op=${i.opacity} (${i.fg} on ${i.bg})`));
        if (phase === 'live') {
          const pg = pr.items.filter((i) => i.group === 'page');
          const low = pg.reduce((m, i) => Math.min(m, i.ratio), 99);
          line(`        （显影后画面退到 0.45，最低 ${low.toFixed(2)}，按设计如此）`);
        }
      }
    }
    line(bad ? `  → ${bad} 项没过` : '  → 全部通过');
  }

  if (Object.keys(report.tools).length) {
    line('');
    line('十二件工具');
    let miss = 0;
    for (const [id, t] of Object.entries(report.tools)) {
      const ok = t.hasCore ? (t.opened && t.html > 40) : true;
      if (!ok) miss++;
      line(`  ${ok ? 'OK ' : 'NG '} ${id.padEnd(9)} ${t.hasCore ? (t.opened ? '打开 ' + t.html + ' 字节' : '打不开') : '直接动作（回主页 / 去 NEXUS）'}`);
    }
    line(miss ? `  → ${miss} 件有问题` : '  → 十二件都在');
  }

  if (Object.keys(report.layout).length) {
    line('');
    line('390×844');
    for (const [k, v] of Object.entries(report.layout)) line(`  ${v.over ? 'NG ' : 'OK '} ${k} ${JSON.stringify(v)}`);
  }

  if (Object.keys(report.trace).length) {
    line('');
    line('静置时那条痕的浓度');
    for (const [k, v] of Object.entries(report.trace)) line(`  ${k}  ${JSON.stringify(v)}`);
  }

  if (report.fonts) {
    line('');
    line('中文小字没有落到 Plex Mono');
    line(report.fonts.length ? '  NG ' + JSON.stringify(report.fonts) : '  OK 七个语境都没有');
  }

  if (report.reducedMotion) {
    line('');
    line('减动效：动词退成直接显示');
    line('  transition ' + report.reducedMotion.transition + ' · 唤出那一刻的浓度 ' + report.reducedMotion.devpRightAfterSummon);
  }

  if (report.sameFace) {
    line('');
    line('三条路唤出的是同一个面（十二枚字的浓度）');
    const k = report.sameFace.key, e = report.sameFace.edge, p2 = report.sameFace.pointer;
    line('  快捷键 ' + k.join(' '));
    line('  边缘痕 ' + e.join(' '));
    line('  指针停 ' + p2.join(' '));
    const same = (a2, b2) => a2.length === b2.length && a2.every((x, i) => x === b2[i]);
    line('  快捷键=边缘痕 ' + (same(k, e) ? '是' : '否') + ' · 快捷键=指针停 ' + (same(k, p2) ? '是' : '否'));
  }

  if (report.find) {
    line('');
    line('检索「显影」');
    line('  条目 ' + report.find.count);
    report.find.rows.forEach((r) => line(`  ${r.devp.padEnd(6)} ${r.color.padEnd(20)} ${r.slug}`));
  }

  line('');
  line('截图 → ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
