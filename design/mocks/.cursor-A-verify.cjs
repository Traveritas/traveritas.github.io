/* ─────────────────────────────────────────────────────────────
   方案 A · 自验脚本（仅本稿用；共用的 .shot-cursor.cjs 不动）
     · 真实指针交互（hover / 按下 / 长按 / 滚动 / 拖拽 / 离开）
     · 读真实数字：热点偏差、静息 5s 内 rAF 次数、will-change、元素数、装饰最大偏移
     · 降级：?cursor=off / ?reduced=1 / touch / forced-colors
   用法：node design/mocks/.cursor-A-verify.cjs [diag]
   ───────────────────────────────────────────────────────────── */
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const puppeteer = require(path.join(os.tmpdir(), 'node_modules', 'puppeteer-core'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const FILE = 'cursor-A-afterimage';   // 注意：脚本自己补 .html（共用脚本同此口径，勿带后缀）
const OUT = path.join(__dirname, '.shots-cursor-A');
const DIAG = process.argv[2] === 'diag';
fs.mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png',
};
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/favicon.ico') return (res.writeHead(204), res.end());
      const p = path.join(ROOT, urlPath);
      if (!p.startsWith(ROOT)) return (res.writeHead(403), res.end('forbidden'));
      fs.readFile(p, (err, data) => {
        if (err) { console.log('  [srv 404]', urlPath); return (res.writeHead(404, { 'Cache-Control': 'no-store' }), res.end('not found')); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { meta: { file: FILE, viewport: '1440x900', at: new Date().toISOString() }, steps: [], degrade: {} };

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/design/mocks/${FILE}.html`;
  console.log('serving', base);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${path.join(os.tmpdir(), 'chrome-cursor-verify-A')}`],
  });
  const errs = [];
  async function page(q, opts = {}) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push(q + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(q + ' console: ' + m.text()); });
    if (DIAG) p.on('response', (r) => { if (r.status() >= 400) console.log('  [diag]', r.status(), r.url()); });
    await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, hasTouch: !!opts.touch });
    const i = q.indexOf('@');
    const at = i >= 0 ? q.slice(i + 1) : null;
    await p.goto(base + (i >= 0 ? q.slice(0, i) : q), { waitUntil: 'networkidle0', timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await sleep(600);
    if (at) {
      await p.evaluate((sel) => { const el = document.querySelector(sel); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60); }, at);
      await sleep(500);
    }
    return p;
  }
  /* 把目标滚到视口中央再返回其视口坐标（避免目标落在视口外） */
  async function aim(p, sel) {
    await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await sleep(250);
    return p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; }, sel);
  }
  const probe = (p) => p.evaluate(() => (window.__curA ? window.__curA.probe() : null));
  const shell = (p) => p.evaluate(() => (window.__shell ? window.__shell.state() : null));
  const full = (p) => p.evaluate(() => ({ a: window.__curA ? window.__curA.probe() : null, s: window.__shell ? window.__shell.state() : null, probe: window.__cur ? window.__cur.report() : null, cls: document.body.className }));
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png'), captureBeyondViewport: false });

  /* ── 0 · 真实移动 → 落点、装饰偏移、热点同帧、连续移动中的存活峰值 ── */
  {
    const p = await page('?probe=1&ui=0');
    await p.mouse.move(400, 380, { steps: 8 });
    await p.mouse.move(900, 420, { steps: 26 });
    const a = await full(p);
    out.steps.push({ step: 'move(真实指针 · 26 步)', probe: a.a, shell: a.s, hotspot: a.probe.hotspot, rafTotal: a.probe.rafTotal });
    /* 连续移动中采样（脚本里没有「按住移动」的机位，故用平滑 move 流） */
    let stop = false;
    const mover = (async () => {
      let i = 0;
      while (!stop && i < 900) {
        await p.mouse.move(660 + Math.sin(i * 0.075) * 330, 430 + Math.sin(i * 0.11) * 130, { steps: 1 });
        await sleep(7); i++;
      }
    })();
    await sleep(260);
    let peak = 0, peakOff = 0, peakAt = null;
    for (let i = 0; i < 22; i++) {
      const s = await probe(p);
      if (s && s.live > peak) { peak = s.live; peakOff = s.maxOffset; }
      if (s && s.live >= 4 && !peakAt) { peakAt = s; await shot(p, 'r01-live-move'); }
      await sleep(11);
    }
    stop = true; await mover;
    out.steps.push({ step: '连续移动中（22 次采样）', livePeak: peak, maxOffsetAtPeak: peakOff, sample: peakAt });
    await sleep(900);
    const b = await full(p);
    out.steps.push({ step: 'move 后 900ms（沉降）', probe: b.a, hotspot: b.probe.hotspot, rafTotal: b.probe.rafTotal });
    const t0 = b.probe.rafTotal;
    const w0 = b.a.willChange;
    await sleep(5200);
    const c = await full(p);
    out.rest = { rafTotalAtRest0: t0, rafTotalAfter5s: c.probe.rafTotal, rafDelta5s: c.probe.rafTotal - t0,
      rafLast5s: c.probe.rafLast5s, willChangeAtRest0: w0, willChange: c.probe.willChange,
      slotElements: c.probe.slotElements, loop: c.a.loop, live: c.a.live, domNodes: c.a.domNodes };
    await shot(p, 'r02-live-rest');
    await p.close();
  }

  /* ── 1 · 真实悬停链接 / 正文 / 输入框 / 可拖元素 ── */
  {
    const p = await page('?probe=1&ui=0');
    const rect = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; }, sel);
    const link = await aim(p, '.lab-chain a');
    await p.mouse.move(link.x - 70, link.y, { steps: 12 });
    await sleep(120);
    const approach = await probe(p);
    /* 在链接上持续横向移动 → 间隔收紧（×0.5）后只剩紧密的短排 */
    let stopL = false;
    const lm = (async () => { let i = 0; while (!stopL && i < 400) { await p.mouse.move(link.l + 8 + ((i * 6) % Math.max(20, link.w - 16)), link.y + ((i % 3) - 1), { steps: 1 }); await sleep(7); i++; } })();
    await sleep(240);
    let lPeak = 0, lSample = null;
    for (let i = 0; i < 16; i++) { const s = await probe(p); if (s && s.live > lPeak) { lPeak = s.live; lSample = s; } if (s && s.live >= 4) { await shot(p, 'r03-live-link-tighten'); break; } await sleep(10); }
    stopL = true; await lm;
    out.steps.push({ step: 'hover-link 接近时', probe: approach });
    out.steps.push({ step: 'hover-link 移动中（收紧：间隔 3.5px）', livePeak: lPeak, probe: lSample });
    await sleep(700);                          // 停住 → 排空 → 只剩本体
    const lRest = await probe(p);
    out.steps.push({ step: 'hover-link 停住 700ms（只剩本体）', probe: lRest });
    await shot(p, 'r04-live-link-settled');
    const pr = await aim(p, '.lab-prose p');
    await p.mouse.move(pr.x, pr.y, { steps: 12 });
    await sleep(400);
    out.steps.push({ step: 'hover-text', probe: await probe(p) });
    await shot(p, 'r05-live-text');
    const tb = await aim(p, '#lab-text');
    await p.mouse.move(tb.x, tb.y, { steps: 10 });
    await sleep(250);
    out.steps.push({ step: 'input(#lab-text)', probe: await probe(p) });
    await shot(p, 'r06-live-input');
    await p.mouse.click(tb.l + 30, tb.y);
    await p.keyboard.type('半句');
    await sleep(300);
    out.steps.push({ step: 'input 敲字后（不抢插入符）', probe: await probe(p), value: await p.evaluate(() => document.getElementById('lab-text').value) });
    await p.close();
  }

  /* ── 2 · 真实点按（≤260ms）→ 越位再吸回 ── */
  {
    const p = await page('?probe=1&ui=0');
    await p.mouse.move(560, 300, { steps: 6 });
    await p.mouse.move(760, 380, { steps: 10 });
    await p.mouse.down(); await sleep(90); await p.mouse.up();
    await sleep(30);
    await shot(p, 'r07-live-click');                 // 越位途中的一帧
    const a = await probe(p);
    out.steps.push({ step: 'click 后 ~150ms（越位途中）', probe: a });
    await sleep(500);
    out.steps.push({ step: 'click 后 ~650ms（已吸回）', probe: await probe(p) });
    await p.close();
  }

  /* ── 3 · 真实长按（外壳 __shell.hold，抽线同时发生） ── */
  {
    const p = await page('?probe=1&ui=0');
    const hb = await aim(p, '.lab-hold');                 // 空白长按区：无正文，残点不被抑制
    await p.mouse.move(hb.x - 90, hb.y - 20, { steps: 10 });
    await p.mouse.move(hb.x - 40, hb.y - 6, { steps: 10 });
    const beforeHold = await probe(p);
    await p.evaluate((x, y) => window.__shell.hold(x, y), beforeHold.x, beforeHold.y);
    await sleep(120);
    out.steps.push({ step: '长按开始 120ms（残点开始回流）', probe: await probe(p) });
    await sleep(580);
    const a = await full(p);
    out.steps.push({ step: '长按 700ms（残点已清空 + reality-holding）', probeBefore: beforeHold, probe: a.a, shell: a.s, cls: a.cls,
      threadDisplay: await p.evaluate(() => getComputedStyle(document.querySelector('.fx .thread')).display) });
    await shot(p, 'r08-live-hold');
    await sleep(1700);                       // 按满 2200+120 → 闩锁
    const b = await full(p);
    out.steps.push({ step: '长按至闩锁（成结 + 双态切换）', probe: b.a, shell: b.s, cls: b.cls });
    await shot(p, 'r09-live-latch');
    await p.evaluate(() => window.__shell.release());
    await sleep(400);
    out.steps.push({ step: '闩锁后 400ms（轴迁移完成）', probe: await probe(p) });
    await p.close();
  }

  /* ── 4 · 真实拖拽 / 真实滚动 / 真实离开窗口 ── */
  {
    const p = await page('?probe=1&ui=0');
    const box = await aim(p, '[data-drag]');
    await p.mouse.move(box.x, box.y, { steps: 8 });
    await sleep(80);
    out.steps.push({ step: 'hover 可拖元素（未按下）', probe: await probe(p) });
    await p.mouse.down();
    await sleep(30);
    out.steps.push({ step: 'pointerdown 于可拖元素', probe: await probe(p) });
    await p.mouse.move(box.x + 34, box.y + 22, { steps: 10 });
    await p.mouse.move(box.x + 62, box.y + 34, { steps: 12 });
    await sleep(40);
    out.steps.push({ step: 'drag 中（间隔 ×1.8）', probe: await probe(p) });
    await shot(p, 'r10-live-drag');
    await p.mouse.up();
    await sleep(200);
    /* 滚动抑制：先制造残点，再滚 */
    await p.mouse.move(600, 420, { steps: 4 });
    await p.mouse.move(760, 450, { steps: 14 });
    const before = await probe(p);
    await p.evaluate(() => window.scrollBy(0, 260));
    await sleep(80);
    out.steps.push({ step: 'scroll 后 80ms（残点抑制）', probeBefore: before, probe: await probe(p) });
    await shot(p, 'r11-live-scroll');
    /* 离开窗口（真实 pointerout，relatedTarget=null） */
    await p.evaluate(() => document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null, bubbles: true })));
    await sleep(120);
    const c = await full(p);
    out.steps.push({ step: 'leave（fx-cursor-out）', cls: c.cls, opacity: await p.evaluate(() => getComputedStyle(document.getElementById('cursor-slot')).opacity) });
    await shot(p, 'r12-live-leave');
    await p.close();
  }

  /* ── 5 · 降级：cursor=off / reduced / touch / forced-colors ── */
  {
    const p = await page('?probe=1&cursor=off');
    await p.mouse.move(700, 400, { steps: 6 });
    await sleep(200);
    out.degrade['cursor=off'] = await p.evaluate(() => ({ fx: document.body.classList.contains('fx-cursor-on'), cursor: getComputedStyle(document.body).cursor, slotVis: getComputedStyle(document.getElementById('cursor-slot')).visibility }));
    await shot(p, 'r13-off');
    await p.close();
  }
  {
    const p = await page('?probe=1&reduced=1');
    await p.mouse.move(700, 400, { steps: 6 });
    await sleep(200);
    out.degrade['reduced=1'] = await p.evaluate(() => ({ fx: document.body.classList.contains('fx-cursor-on'), cursor: getComputedStyle(document.body).cursor }));
    await shot(p, 'r14-reduced');
    await p.close();
  }
  {
    const p = await page('?probe=1&ui=0', { touch: true });
    await p.mouse.move(700, 400, { steps: 6 });          // 真实鼠标事件先开门
    await sleep(150);
    const opened = await p.evaluate(() => document.body.classList.contains('fx-cursor-on'));
    await p.touchscreen.tap(700, 400);                  // 真实 touch 指针 → 立即摘掉
    await sleep(250);
    out.degrade['pointerType=touch'] = await p.evaluate((o) => ({ openedByMouse: o, afterTouch: document.body.classList.contains('fx-cursor-on'), lastPointerType: window.__cur ? window.__cur.report().lastPointerType : null }), opened);
    await shot(p, 'r15-touch');
    await p.close();
  }
  {
    const p = await page('?probe=1');
    await p.mouse.move(700, 400, { steps: 6 });
    await sleep(150);
    const before = await p.evaluate(() => ({ fx: document.body.classList.contains('fx-cursor-on') }));
    const cdp = await p.target().createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await p.mouse.move(720, 420, { steps: 4 });
    await sleep(300);
    out.degrade['forced-colors'] = { before, after: await p.evaluate(() => ({ fx: document.body.classList.contains('fx-cursor-on'), cursor: getComputedStyle(document.body).cursor, slotVis: getComputedStyle(document.getElementById('cursor-slot')).visibility })) };
    await shot(p, 'r16-forced-colors');
    await p.close();
  }

  fs.writeFileSync(path.join(OUT, 'verify-A.json'), JSON.stringify(out, null, 2));
  await browser.close();
  server.close();
  console.log('\nconsole+page errors:', errs.length);
  if (errs.length) console.log('PROBLEMS:\n  ' + errs.slice(0, 12).join('\n  '));
  console.log('\n== 实测摘要 ==');
  console.log('rest:', JSON.stringify(out.rest));
  for (const s of out.steps) {
    const p = s.probe;
    console.log('-', s.step, p ? `name=${p.name} live=${p.live} maxOff=${p.maxOffset} axis=${p.axisDeg}° step=${p.step} dreamT=${p.dreamT} scale=${p.scale} loop=${p.loop}` : JSON.stringify(s).slice(0, 160));
  }
  console.log('degrade:', JSON.stringify(out.degrade, null, 1));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
