/* 薄玻璃窗 · 工具层原型 · 截图与自检
   node design/mocks/tool-window/.shot.cjs            → design/mocks/tool-window/.shots/
   ONLY=home,grid,read,gate,404,paths,verb,mobile,cmp,rm,many   只拍一部分

   看不到图时以这份报告为准：控制台 / 页面错误数、两档玻璃的四个数字、
   薄玻璃后面的有效底色上的对比度、三条召唤路径是否落到同一个面、十二件工具是否都在。
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
const VP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const fails = [];
const notes = [];
const ok = (cond, msg) => { (cond ? notes : fails).push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); return cond; };

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/tool-window/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const fresh = async (qs = '', vp = VP, opts = {}) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${qs}: ${e}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${qs}: ${m.text()}`));
    await page.setViewport(vp);
    if (opts.rm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(URL + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__t && document.documentElement.dataset.ready === "1"', { timeout: 20000 });
    await sleep(900);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const mouseOff = (page) => page.mouse.move(1000, 760, { steps: 4 });

  /* ── 四种语境的静置帧 ── */
  if (want('home')) {
    for (const [qs, name] of [
      ['?ctx=home', '01-home-wake'],
      ['?ctx=home&face=dream', '02-home-dream'],
      ['?ctx=home&dock=0&open=find', '03-home-open'],
    ]) { const p = await fresh(qs); await mouseOff(p); await sleep(400); await shot(p, name); await p.close(); }
  }
  if (want('grid')) {
    for (const [qs, name] of [
      ['?ctx=grid', '04-grid'],
      ['?ctx=grid&dock=0&open=sift&tint=moment', '05-grid-open-sift-rem'],
      ['?ctx=grid&dock=0&open=find&tint=project&many=1', '06-grid-many-find-deep'],
    ]) { const p = await fresh(qs); await mouseOff(p); await sleep(500); await shot(p, name); await p.close(); }
  }
  if (want('read')) {
    for (const [qs, name] of [
      ['?ctx=read', '07-read'],
      ['?ctx=read&face=dream&dock=0&open=read', '08-read-dream'],
      ['?ctx=read&dock=0&open=toc', '09-read-toc-open'],
    ]) { const p = await fresh(qs); await mouseOff(p); await sleep(500); await shot(p, name); await p.close(); }
  }
  if (want('gate')) {
    for (const [qs, name] of [['?ctx=gate', '10-gate'], ['?ctx=gate&face=dream&dock=0&open=where', '11-gate-dream-open']]) {
      const p = await fresh(qs); await mouseOff(p); await sleep(400); await shot(p, name); await p.close();
    }
  }
  if (want('404')) {
    for (const [qs, name] of [['?ctx=404', '12-404'], ['?ctx=404&dock=0&open=find', '13-404-open']]) {
      const p = await fresh(qs); await mouseOff(p); await sleep(400); await shot(p, name); await p.close();
    }
  }

  /* ── 三条召唤路径 ── */
  const faces = {};
  if (want('paths')) {
    /* 一 · 常驻边缘露头：静置时只剩窗沿与标题栏的一角 */
    const a = await fresh('?ctx=grid');
    await mouseOff(a);
    await sleep(700);
    const dockRest = await a.evaluate(() => ({ ...window.__t.face(), clip: getComputedStyle(document.querySelector('.t-win')).clipPath }));
    await shot(a, '20-path-edge-1-halfopen');
    /* 指针靠近 → 完全打开 */
    await a.mouse.move(64, 452, { steps: 10 });
    await sleep(1000);
    const edgeFace = await a.evaluate(() => window.__t.face());
    await shot(a, '21-path-edge-2-opened');
    faces.edge = edgeFace;
    ok(edgeFace.dock === 0 && edgeFace.open.length === 1, `边缘路：dock=${edgeFace.dock} open=[${edgeFace.open}]`);
    ok(dockRest.dock === 1 && /inset/.test(dockRest.clip), `静置时是半开的窗（clip-path ${dockRest.clip}）`);
    await a.close();

    /* 二 · 指针跟随 / 拖拽：把一扇搬到指针放下的地方，收成纸签再展开 */
    const b = await fresh('?ctx=grid');
    await mouseOff(b);
    await b.mouse.move(66, 452, { steps: 8 });
    await sleep(900);
    const grip = await b.evaluate(() => {
      const w = document.querySelector('.t-win[data-id="face"]');
      const r = w.querySelector('.t-grip').getBoundingClientRect();
      return { x: r.left + 30, y: r.top + 12 };
    });
    await b.mouse.move(grip.x, grip.y, { steps: 4 });
    await b.mouse.down();
    await b.mouse.move(330, 560, { steps: 16 });
    await b.mouse.up();
    await sleep(700);
    const afterDrag = await b.evaluate(() => ({ ...window.__t.face(), pos: window.__t.state.free.face }));
    await mouseOff(b);
    await sleep(600);
    await shot(b, '22-path-drag-1-moved');
    await b.evaluate(() => window.__t.slip('face'));
    await sleep(600);
    await shot(b, '23-path-drag-2-slip');
    await b.evaluate(() => { window.__t.slip('face'); window.__t.open('face'); });
    await sleep(700);
    await shot(b, '24-path-drag-3-back');
    faces.drag = await b.evaluate(() => window.__t.face());
    ok(afterDrag.pos && afterDrag.pos.x > 200, `拖拽路：窗落在 (${afterDrag.pos && afterDrag.pos.x}, ${afterDrag.pos && afterDrag.pos.y})，记在 localStorage`);
    ok(Object.keys(await b.evaluate(() => JSON.parse(localStorage.getItem('xm-tw-free') || '{}'))).includes('face'), '拖拽路：位置真的写进了 localStorage');
    await b.close();

    /* 三 · 快捷键 W（指针离开边缘，证明不是边缘那一条路） */
    const c = await fresh('?ctx=grid');
    await mouseOff(c);
    await sleep(500);
    await shot(c, '25-path-key-0-rest');
    await c.keyboard.press('w');
    await sleep(1000);
    faces.key = await c.evaluate(() => window.__t.face());
    await shot(c, '26-path-key-1-summoned');
    await c.keyboard.press('w');
    await sleep(900);
    await shot(c, '27-path-key-2-retired');
    ok(faces.key.dock === 0, `快捷键路：dock=${faces.key.dock}`);
    ok(JSON.stringify(faces.edge.open) === JSON.stringify(faces.key.open), `边缘与快捷键唤出的是同一个面：open=[${faces.edge.open}] vs [${faces.key.open}]`);
    ok(JSON.stringify(faces.edge.ids) === JSON.stringify(faces.key.ids) && faces.edge.ids.length === 9, `两条路的窗摞都是那九扇（${faces.edge.ids.length}）`);
    ok(JSON.stringify(faces.edge.ids) === JSON.stringify(faces.drag.ids), '拖拽路也是同一摞窗');
    await c.close();
  }

  /* ── 动词中途 ── */
  if (want('verb')) {
    for (const [v, name] of [['0', '30-verb-0-curled'], ['0.35', '31-verb-35'], ['0.7', '32-verb-70'], ['1', '33-verb-100']]) {
      const p = await fresh(`?ctx=read&verb=${v}`);
      await mouseOff(p);
      await sleep(700);
      await shot(p, name);
      await p.close();
    }
  }

  /* ── 工具的窗与内容的窗同框（这一案的验收关键） ── */
  if (want('cmp')) {
    const p = await fresh('?ctx=grid&dock=0&open=find,toc&multi=1&cmp=1');
    await mouseOff(p);
    await sleep(700);
    await shot(p, '40-CMP-two-grades-one-frame');
    const g = await p.evaluate(() => window.__t.grades());
    const close = await p.evaluate(() => {
      const t = document.querySelector('.t-win.is-open');
      const c = document.querySelector('.c-win[data-cmp]');
      const a = t.getBoundingClientRect(), b = c.getBoundingClientRect();
      return { tool: a.toJSON(), content: b.toJSON(), overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom };
    });
    notes.push(`    内容的窗  alpha=${g.content.alpha} blur=${g.content.blur}px edge=${g.content.edgeA} r=${g.content.radius}px 影=${g.content.shadowY}px  ${g.content.filter}`);
    notes.push(`    工具的窗  alpha=${g.tool.alpha} blur=${g.tool.blur}px edge=${g.tool.edgeA} r=${g.tool.radius}px 影=${g.tool.shadowY}px  ${g.tool.filter}`);
    ok(g.tool.alpha < g.content.alpha, `薄一档 · 底更透：${g.tool.alpha} < ${g.content.alpha}`);
    ok(g.tool.blur < g.content.blur, `薄一档 · 磨砂更浅：${g.tool.blur}px < ${g.content.blur}px`);
    ok(g.tool.edgeA < g.content.edgeA, `薄一档 · 边更细：${g.tool.edgeA} < ${g.content.edgeA}`);
    ok(g.tool.shadowY < g.content.shadowY, `薄一档 · 影更浅：${g.tool.shadowY}px < ${g.content.shadowY}px`);
    ok(g.tool.radius < g.content.radius, `薄一档 · 圆角更小：${g.tool.radius}px < ${g.content.radius}px`);
    ok(close.overlap, '对照帧里两档玻璃真的叠在同一块底上（同框且相压）');
    await p.close();
  }

  /* ── 窄屏 ── */
  if (want('mobile')) {
    for (const [qs, name] of [
      ['?ctx=read&dock=0&open=toc', '50-m-read'],
      ['?ctx=grid&dock=0&open=sift', '51-m-grid'],
      ['?ctx=home', '52-m-home'],
    ]) {
      const p = await fresh(qs, MOBILE);
      await mouseOff(p);
      await sleep(1400);
      const of = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, over: [...document.querySelectorAll('.t-win, .c-win')].filter((n) => { const r = n.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((n) => n.className + ':' + Math.round(n.getBoundingClientRect().right)) }));
      ok(of.sw <= of.cw + 1, `${name}：390×844 横向不溢出（scrollWidth ${of.sw} ≤ ${of.cw}）`);
      ok(of.over.length === 0, `${name}：没有窗越出视口 ${of.over.join(', ')}`);
      const geo = await p.evaluate(() => [...document.querySelectorAll('.t-win')].map((w) => { const r = w.getBoundingClientRect(); return `${w.dataset.id}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}×${Math.round(r.height)}`; }).join(' '));
      notes.push(`    ${name} 窗位 ${geo}`);
      /* 窄屏不压字：抽屉在底边，内容整体让开它 */
      const clash = await p.evaluate(() => {
        const bar = document.getElementById('t-shelf').getBoundingClientRect();
        const bad = [];
        document.querySelectorAll('.c-read, .t-col, .t-404, .t-gate, .c-brand').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.bottom > bar.top + 2 && r.top < bar.bottom - 2) bad.push(n.className.split(' ')[0] + ':' + Math.round(r.bottom) + '>' + Math.round(bar.top));
        });
        return { bad, barTop: Math.round(bar.top), barH: Math.round(bar.height) };
      });
      ok(clash.bad.length === 0, `${name}：内容没有压在抽屉下面（抽屉顶 ${clash.barTop}，让开高 ${clash.barH}）${clash.bad.join(', ')}`);
      await shot(p, name);
      await p.close();
    }
  }

  /* ── 动效退让 ── */
  if (want('rm')) {
    const p = await fresh('?ctx=grid&dock=0&open=find', VP, { rm: true });
    await mouseOff(p);
    await sleep(500);
    await shot(p, '60-reduced-motion');
    const d = await p.evaluate(() => {
      const w = document.querySelector('.t-win[data-id="find"]');
      return { body: w.querySelector('.t-body').style.height, trans: getComputedStyle(w).transitionDuration, opened: w.classList.contains('is-open') };
    });
    ok(/px/.test(d.body) && parseFloat(d.body) > 20, `prefers-reduced-motion 下动词退成直接显示（窗高已定 ${d.body}，过渡 ${d.trans}）`);
    await p.close();
  }

  /* ── 深底浅底对比度 + 十二件工具 ── */
  const audit = await fresh('?ctx=read&dock=0&open=find&multi=1');
  const contrast = await audit.evaluate(() => window.__t.contrast());
  const tools = await audit.evaluate(() => ({
    listed: window.__t.tools(),
    inDom: [...document.querySelectorAll('.t-win')].map((w) => w.dataset.id),
    controls: [...document.querySelectorAll('.t-win button, .t-win a, .t-win input')].length,
    openable: window.__t.winIds(),
  }));
  await audit.close();

  console.log('\n── 两档玻璃（薄一档）─────────────────────');
  console.log('    内容的窗 alpha .62 / blur 16px / edge .26 / r 3px / 影 62px');
  console.log('    工具的窗 alpha .34 / blur 7px  / edge .18 / r 2px / 影 18px');
  console.log('\n── 薄玻璃后面的有效底色上的对比度 ─────────');
  console.log('    ctx    玻璃     档     有效底    正文   次级   淡');
  for (const r of contrast) {
    console.log(`    ${r.ctx.padEnd(6)} ${r.glass.padEnd(8)} ${r.grade.padEnd(6)} ${r.eff.padEnd(9)} ${String(r.fg).padStart(5)} ${String(r.soft).padStart(6)} ${String(r.faint).padStart(5)}`);
  }
  for (const r of contrast) {
    ok(r.fg >= 4.5, `对比度 · ${r.ctx}/${r.grade} 正文 ${r.fg} ≥ 4.5`);
    ok(r.soft >= 3, `对比度 · ${r.ctx}/${r.grade} 小标签 ${r.soft} ≥ 3`);
  }
  console.log('\n── 十二件工具 ───────────────────────────');
  console.log('    名录：' + tools.listed.join(' · '));
  console.log(`    窗：${tools.inDom.join(', ')}（${tools.inDom.length} 扇）· 可点的控件 ${tools.controls} 个`);
  ok(tools.listed.length === 12, `十二件工具都在名录里（${tools.listed.length}）`);
  ok(tools.inDom.length === 9, `九扇窗都在 DOM 里（${tools.inDom.length}）`);
  ok(tools.controls >= 24, `窗里的控件都能点（${tools.controls}）`);

  await browser.close();
  server.close();

  console.log('\n── 自检 ─────────────────────────────────');
  [...notes, ...fails].forEach((l) => console.log('    ' + l));
  console.log(`\n控制台与页面错误：${errors.length}`);
  if (errors.length) errors.slice(0, 20).forEach((e) => console.log('    ! ' + e));
  console.log(`结论：${fails.length === 0 && errors.length === 0 ? '全部通过' : `${fails.length} 项未过 / ${errors.length} 个错误`}`);
  if (fails.length || errors.length) process.exitCode = 1;
})();
