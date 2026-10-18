/* 罗盘环 · 截图 + 自查
   node design/mocks/tool-ring/.shot.cjs        → design/mocks/tool-ring/.shots/
   ONLY=home,grid,...   只拍一部分

   除了出图，还核对：控制台 / 页面错误数（必须 0）、十二件工具都在、三条召唤路径都通、
   390×844 不溢出、四种语境深底浅底的对比度（正文 ≥ 4.5、小标签 ≥ 3、发丝 ≥ 1.15）。
   动词的中间帧：把环的时钟停住（__ring.freeze）再一帧帧推（__ring.advance），拍到的是确定的那一帧。 */
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
const fails = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

(async () => {
  const server = await start(0);
  const URL = `http://localhost:${server.address().port}/tool-ring/`;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });

  const fresh = async (qs = '', vp = { width: 1440, height: 900, deviceScaleFactor: 1 }) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`${qs}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${qs}: ${m.text()}`); });
    await page.setViewport(vp);
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    await page.goto(URL + qs, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction('window.__ring && window.__scene', { timeout: 20000 });
    await sleep(900);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const move = async (page, x, y) => { await page.mouse.move(x, y, { steps: 8 }); await sleep(420); };

  /* 真像素核对：把截图交回页面里解码，量几块地方的实际亮度与对比度。
     这是「环在浅底与深底上都看得见」的实证 —— 不看图也拿得到数 */
  const probe = async (page, regions) => {
    const b64 = await page.screenshot({ encoding: 'base64' });
    return page.evaluate(async (b64, regions) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const L = (r, gg, bb) => {
        const f = [r, gg, bb].map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      const out = {};
      for (const [k, [x, y, w, h]] of Object.entries(regions)) {
        const d = g.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
        let sum = 0, n = 0, hi = 0, lo = 1;
        for (let i = 0; i < d.length; i += 4) {
          const v = L(d[i], d[i + 1], d[i + 2]);
          sum += v; n++;
          if (v > hi) hi = v;
          if (v < lo) lo = v;
        }
        out[k] = { mean: +(sum / n).toFixed(3), hi: +hi.toFixed(3), lo: +lo.toFixed(3) };
      }
      const ratio = (a, b) => +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
      if (out.plate && out.ground) out['面板板子 / 底子'] = ratio(out.plate.mean, out.ground.mean);
      if (out.petal && out.ground) out['花瓣 / 底子'] = ratio(out.petal.mean, out.ground.mean);
      if (out.ringInk && out.ground) out['环上墨 / 底子'] = ratio(out.ringInk.hi, out.ground.mean);
      return out;
    }, b64, regions);
  };

  /* ── 十二件工具都在？ ── */
  {
    const p = await fresh('?ctx=grid');
    const inv = await p.evaluate(() => {
      const petals = [...document.querySelectorAll('#petals .petal')];
      const hits = [...document.querySelectorAll('#petals .p-hit')];
      const ticks = [...document.querySelectorAll('#compass .c-tick')];
      return {
        petals: petals.length, hits: hits.length, ticks: ticks.length,
        ids: petals.map((e) => e.dataset.id),
        labels: petals.map((e) => e.querySelector('.p-in b').textContent),
        panelFns: Object.keys(window.RING.panels).length,
        tools: window.RING.TOOLS.map((t) => t.id),
      };
    });
    ok(inv.petals === 12, `瓣数 ${inv.petals} ≠ 12`);
    ok(inv.hits === 12, `命中区 ${inv.hits} ≠ 12`);
    ok(inv.ticks === 12, `刻度 ${inv.ticks} ≠ 12`);
    ok(inv.panelFns === 12, `面板 ${inv.panelFns} ≠ 12`);
    ok(inv.tools.every((t) => inv.ids.includes(t)), `瓣与工具清单不一致：${inv.ids}`);
    notes.push(`十二件工具：${inv.labels.join(' · ')}`);
    await p.close();
  }

  /* ── 四种语境静置 + 两面 ── */
  const ctxShots = [
    ['01-ctx-home', '?ctx=home', 900, 520],
    ['02-ctx-grid', '?ctx=grid', 620, 420],
    ['03-ctx-read', '?ctx=read', 1180, 700],
    ['04-ctx-gate', '?ctx=gate', 900, 300],
    ['05-ctx-404', '?ctx=404', 900, 520],
    ['06-face-dream-grid', '?ctx=grid&face=dream', 620, 420],
    ['06b-face-dream-home', '?ctx=home&face=dream', 900, 520],
  ];
  if (want('ctx')) {
    for (const [name, qs, x, y] of ctxShots) {
      const p = await fresh(qs);
      await move(p, x, y);
      await sleep(500);
      await shot(p, name);
      /* 对照度自查：这一页的夜色 + 目录页三栏各自的夜色 */
      const rep = await p.evaluate(() => {
        const out = [window.__scene.report()];
        if (window.__scene.state.ctx === 'grid') {
          out.push(
            window.__scene.report('strange', '.col[data-scene="moment"]'),
            window.__scene.report('deep', '.col[data-scene="project"]'),
          );
        }
        return out;
      });
      for (const r of rep) {
        const bad = r.rows.filter((x) => !x.pass);
        const line = r.rows.map((x) => `${x.k} ${x.ratio}${x.pass ? '' : ' ✗(需' + x.need + ')'}`).join(' | ');
        notes.push(`[对比度] ${name} · ${r.pal} · ${r.scope} → ${line}`);
        if (bad.length) fails.push(`对比度不足 ${name} · ${r.pal}：${bad.map((x) => `${x.k} ${x.ratio}<${x.need}`).join(', ')}`);
      }
      await p.close();
    }
  }

  /* ── 路径① 常驻边缘露头 ── */
  if (want('edge')) {
    const p = await fresh('?ctx=home');
    await move(p, 1330, 430);
    await sleep(2900); /* 指针停住 → 环贴到最近的一缘 */
    const peekOn = await p.evaluate(() => ({
      here: document.getElementById('peek').classList.contains('is-here'),
      ring: getComputedStyle(document.getElementById('ring')).opacity,
    }));
    ok(peekOn.here, '指针停住后边缘露头没出现');
    await shot(p, '07-path-edge-peek');
    const box = await p.evaluate(() => {
      const r = document.getElementById('peek').getBoundingClientRect();
      return { x: r.left + 26, y: r.top + r.height / 2 };
    });
    await p.mouse.click(Math.min(box.x, 1434), box.y);
    await sleep(1100);
    const opened = await p.evaluate(() => ({ open: window.__ring.state.open, v: window.__ring.state.V }));
    ok(opened.open && opened.v > 0.9, `点边缘那一段弧没绽开（V=${opened.v}）`);
    await shot(p, '08-path-edge-open');
    await p.close();
  }

  /* ── 路径② 指针跟随（主路径）── */
  if (want('follow')) {
    const p = await fresh('?ctx=grid');
    await move(p, 380, 300);
    await shot(p, '09a-path-follow-rest');
    /* 快划一下：环随速度多转一点 */
    await p.mouse.move(1100, 640, { steps: 3 });
    await sleep(80);
    const spin = await p.evaluate(() => window.__ring.state.rot);
    notes.push(`[跟随] 快划后环转过 ${spin.toFixed(1)}°`);
    await sleep(500);
    /* 按住 260ms → 环绽开 */
    await p.mouse.move(700, 470, { steps: 6 });
    await sleep(360);
    await p.mouse.down();
    await sleep(820);
    const held = await p.evaluate(() => ({ open: window.__ring.state.open, v: window.__ring.state.V }));
    ok(held.open && held.v > 0.9, `按住没绽开（V=${held.v}）`);
    await shot(p, '09b-path-follow-bloom');
    await p.mouse.up();
    await sleep(200);
    /* 指针走远 → 合拢 */
    await p.mouse.move(1380, 840, { steps: 8 });
    await sleep(900);
    const closed = await p.evaluate(() => window.__ring.state.V);
    ok(closed < 0.15, `离开后没合拢（V=${closed}）`);
    await shot(p, '09c-path-follow-closed');
    await p.close();
  }

  /* ── 路径③ 快捷键 ── */
  if (want('key')) {
    const p = await fresh('?ctx=read');
    await move(p, 120, 780);
    await p.keyboard.press('KeyR');
    await sleep(900);
    const st = await p.evaluate(() => ({
      open: window.__ring.state.open,
      v: window.__ring.state.V,
      x: Math.round(window.__ring.state.ax),
      y: Math.round(window.__ring.state.ay),
      focused: document.activeElement && document.activeElement.getAttribute('aria-label'),
    }));
    ok(st.open && st.v > 0.9, `按 R 没绽开（V=${st.v}）`);
    ok(Math.abs(st.x - 720) < 3, `R 没把环唤到中央（x=${st.x}）`);
    notes.push(`[快捷键] R → 环到 (${st.x}, ${st.y})，焦点在「${st.focused}」`);
    await shot(p, '10-path-key');
    /* 同一条路：方向键换瓣、Enter 落下 */
    await p.keyboard.press('ArrowRight');
    await sleep(500);
    const f2 = await p.evaluate(() => window.__ring.state.focus);
    ok(f2 && f2 !== 'home', `方向键没换瓣（focus=${f2}）`);
    await shot(p, '10b-path-key-next');
    await p.keyboard.press('Escape');
    await sleep(700);
    ok(!(await p.evaluate(() => window.__ring.state.open)), 'Esc 没合拢');
    await p.close();
  }

  /* ── 同一个面：三条路唤出的是同一个 ── */
  if (want('same')) {
    const p = await fresh('?ctx=grid');
    await move(p, 700, 460);
    const a = await p.evaluate(() => {
      window.__ring.bloom(700, 460);
      return null;
    });
    await sleep(800);
    const viaFollow = await p.evaluate(() => ({
      ids: [...document.querySelectorAll('#petals .petal')].map((e) => e.dataset.id),
      n: document.querySelectorAll('#petals .petal').length,
      v: window.__ring.state.V,
    }));
    await p.keyboard.press('KeyR');
    await sleep(800);
    const viaKey = await p.evaluate(() => ({
      ids: [...document.querySelectorAll('#petals .petal')].map((e) => e.dataset.id),
      n: document.querySelectorAll('#petals .petal').length,
      v: window.__ring.state.V,
    }));
    ok(JSON.stringify(viaFollow.ids) === JSON.stringify(viaKey.ids), '两条路唤出的面不一样');
    ok(viaFollow.n === 12 && viaKey.n === 12, '唤出的面不是十二片');
    notes.push('[同一个面] 指针跟随与快捷键唤出的瓣完全一致（12 片）');
    await shot(p, '11-same-face');
    await p.close();
  }

  /* ── 动词中途 + 按住中途 ── */
  if (want('verb')) {
    for (const v of [0.25, 0.5, 0.75]) {
      const p = await fresh(`?ctx=home&verb=${v}`);
      await move(p, 900, 520);
      await sleep(400);
      await p.evaluate((vv) => window.__ring.setVerb(vv), v);
      await sleep(260);
      await shot(p, `12-verb-${String(v).replace('.', '')}`);
      const st = await p.evaluate(() => ({ v: window.__ring.state.V, rot: window.__ring.state.rot }));
      ok(Math.abs(st.v - v) < 0.001, `?verb=${v} 没停在那一帧（V=${st.v}）`);
      await p.close();
    }
    /* 按住中途：刻度一道道亮起 */
    const p = await fresh('?ctx=grid&verb=0.55');
    await move(p, 700, 440);
    await p.evaluate(() => window.__ring.holdAt(0.58));
    await sleep(200);
    const lit = await p.evaluate(() => document.querySelectorAll('#compass .c-tick.is-hot').length);
    ok(lit > 0 && lit < 12, `按住中途亮起的刻度数不对：${lit}`);
    notes.push(`[按住中途] 12 道刻度里亮起 ${lit} 道`);
    await shot(p, '13-hold-mid');
    await p.evaluate(() => window.__ring.holdAt(null));
    await p.close();
  }

  /* ── 靠近一片瓣：它张开自己的花瓣玻璃 ── */
  if (want('focus')) {
    const p = await fresh('?ctx=grid');
    await move(p, 700, 470);
    await p.evaluate(() => window.__ring.bloom(700, 470));
    await sleep(900);
    for (const [id, name] of [['find', '14a-focus-find'], ['filter', '14b-focus-filter'], ['read', '14c-focus-read'], ['hour', '14d-focus-hour'], ['toc', '14e-focus-toc']]) {
      await p.evaluate((i) => window.__ring.focus(i), id);
      await sleep(600);
      const live = await p.evaluate(() => {
        const el = document.getElementById('panel');
        const r = el.getBoundingClientRect();
        return { live: el.classList.contains('is-live'), h: el.offsetHeight, w: el.offsetWidth, r: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } };
      });
      ok(live.live && live.h > 40, `瓣「${id}」的花瓣玻璃没张开`);
      ok(live.r.l >= 0 && live.r.r <= 1441 && live.r.t >= 0 && live.r.b <= 901, `瓣「${id}」的面板出界 ${JSON.stringify(live.r)}`);
      await shot(p, name);
    }
    /* 检索真的能筛 */
    await p.evaluate(() => window.__ring.focus('find'));
    await sleep(500);
    await p.evaluate(() => {
      const i = document.querySelector('#panel input');
      i.value = '显影';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(500);
    const found = await p.evaluate(() => ({
      n: document.querySelector('#panel .p-count .n').textContent,
      veiled: document.querySelectorAll('.row.is-veiled').length,
      total: document.querySelectorAll('.row').length,
    }));
    ok(Number(found.n) < found.total, `检索「显影」没筛掉东西（命中 ${found.n} / ${found.total}）`);
    notes.push(`[检索] 「显影」命中 ${found.n} / ${found.total}，退焦 ${found.veiled} 条`);
    await shot(p, '15-find-query');
    /* 筛：标签（先把检索框的字清掉） */
    await p.evaluate(() => window.__scene.setQuery(''));
    await sleep(300);
    await p.evaluate(() => window.__ring.focus('filter'));
    await sleep(500);
    await p.evaluate(() => {
      const c = [...document.querySelectorAll('#panel [data-key="tags"] .p-chip')].find((b) => b.dataset.t === '知觉');
      if (c) c.click();
    });
    await sleep(500);
    const filt = await p.evaluate(() => ({
      pressed: document.querySelectorAll('#panel .p-chip[aria-pressed="true"]').length,
      rows: document.querySelectorAll('.row:not(.is-veiled)').length,
    }));
    ok(filt.pressed === 1, `标签没被选中（${filt.pressed}）`);
    notes.push(`[筛] 按「知觉」后剩 ${filt.rows} 条`);
    await shot(p, '16-filter-tag');
    await p.close();
  }

  /* ── 十二件工具逐件走一遍（都在、都能用）── */
  if (want('tools')) {
    const p = await fresh('?ctx=grid');
    await move(p, 700, 470);
    await p.evaluate(() => window.__ring.bloom(700, 470));
    await sleep(900);
    const before = await p.evaluate(() => ({ ...window.__scene.state, tags: [...window.__scene.state.tags] }));
    const out = [];
    for (const id of ['view', 'scene', 'face', 'sound']) {
      const r = await p.evaluate((i) => { window.__ring.state.focus = null; window.__ring.geo.find((g) => g.id === i).hit.click(); return { ...window.__scene.state, tags: [...window.__scene.state.tags] }; }, id);
      out.push(`${id}: ${JSON.stringify({ ctx: r.ctx, view: r.view, scene: r.scene, face: r.face, sound: r.sound })}`);
    }
    const after = await p.evaluate(() => ({ ...window.__scene.state, tags: [...window.__scene.state.tags] }));
    ok(after.view !== before.view, '视图没变');
    ok(after.scene !== before.scene, '场景没变');
    ok(after.face !== before.face, '面没变');
    ok(after.sound !== before.sound, '环境声没变');
    notes.push(`[act 类工具] ${out.join(' / ')}`);
    /* 归处 / 门：点下就成 */
    await p.evaluate(() => { window.__ring.state.focus = null; window.__ring.geo.find((g) => g.id === 'gate').hit.click(); });
    await sleep(700);
    const g1 = await p.evaluate(() => window.__scene.state.ctx);
    ok(g1 === 'gate', `点「门」没到 gate（${g1}）`);
    await shot(p, '17-act-gate');
    await p.evaluate(() => { window.__ring.bloom(700, 470); });
    await sleep(700);
    await p.evaluate(() => { window.__ring.state.focus = null; window.__ring.geo.find((g) => g.id === 'home').hit.click(); });
    await sleep(700);
    const g2 = await p.evaluate(() => window.__scene.state.ctx);
    ok(g2 === 'home', `点「归处」没回主页（${g2}）`);
    /* 出口：两个真去处 */
    await p.evaluate(() => window.__ring.bloom(700, 470));
    await sleep(600);
    await p.evaluate(() => window.__ring.focus('exits'));
    await sleep(500);
    const ex = await p.evaluate(() => [...document.querySelectorAll('#panel .p-act')].map((a) => a.getAttribute('href')));
    ok(ex.length === 2 && ex.every((h) => h && h.length > 3), `出口的链接不对：${ex}`);
    notes.push(`[出口] ${ex.join(' , ')}`);
    await shot(p, '18-exits');
    /* 目录 / 读：要在阅读页才看得出 */
    await p.evaluate(() => window.__scene.setCtx('read'));
    await sleep(700);
    await p.evaluate(() => { window.__ring.bloom(700, 470); window.__ring.focus('toc'); });
    await sleep(600);
    const toc = await p.evaluate(() => ({
      items: document.querySelectorAll('#panel .p-item').length,
      heads: document.querySelectorAll('.prose h2, .prose h3').length,
    }));
    ok(toc.items === toc.heads && toc.items > 0, `目录条目 ${toc.items} ≠ 正文小节 ${toc.heads}`);
    notes.push(`[目录] 阅读页列出 ${toc.items} 条（h2 主 / h3 细）`);
    await shot(p, '19-toc');
    await p.evaluate(() => window.__ring.focus('read'));
    await sleep(500);
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('#panel [data-key="size"] button')].find((x) => x.dataset.v === 'l');
      b.click();
    });
    await sleep(500);
    const rs = await p.evaluate(() => getComputedStyle(document.querySelector('.prose')).fontSize);
    ok(parseFloat(rs) > 17, `字号「大」没生效（${rs}）`);
    notes.push(`[读] 字号切到「大」后正文 ${rs}`);
    await shot(p, '20-read-large');
    await p.evaluate(() => window.__ring.focus('hour'));
    await sleep(500);
    const hr = await p.evaluate(() => ({
      clock: document.querySelector('#panel .p-clock .t').textContent,
      stage: document.querySelector('#panel .p-clock .st').textContent,
      marks: [...document.querySelectorAll('#panel .p-mark')].map((b) => b.textContent),
    }));
    ok(/^\d\d:\d\d$/.test(hr.clock), `刻的时刻不对：${hr.clock}`);
    notes.push(`[刻] ${hr.clock} · ${hr.stage}；路标 ${hr.marks.join(' / ')}`);
    await shot(p, '21-hour');
    await p.close();
  }

  /* ── 390×844 ── */
  if (want('mobile')) {
    const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const p = await fresh('?ctx=grid', vp);
    await sleep(400);
    await shot(p, '22-m-390-rest');
    const over1 = await p.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth }));
    ok(over1.w <= over1.vw + 1, `390 静置横向溢出：${over1.w} > ${over1.vw}`);
    /* 触屏：一个手势按住 */
    await p.touchscreen.tap(195, 470);
    await sleep(300);
    await p.evaluate(() => {
      window.__ring.state.seen = true;
      window.__ring.bloom(195, 430);
    });
    await sleep(900);
    const m = await p.evaluate(() => {
      const g = window.__ring.geo;
      const k = window.__ring.state.k;
      const far = Math.max(...g.map((x) => (x.r1 + x.L) * k));
      const p2 = document.getElementById('panel').getBoundingClientRect();
      return { far: Math.round(far), k, vw: innerWidth, vh: innerHeight, panel: { l: p2.left, r: p2.right, t: p2.top, b: p2.bottom }, w: document.documentElement.scrollWidth };
    });
    ok(m.far * 2 < m.vw, `390 上花开得太宽：${m.far * 2} > ${m.vw}`);
    ok(m.w <= m.vw + 1, `390 绽开后横向溢出：${m.w} > ${m.vw}`);
    notes.push(`[390×844] 环缩放 ${m.k}，花开半径 ${m.far}px（屏宽 ${m.vw}）`);
    await shot(p, '23-m-390-bloom');
    await p.evaluate(() => window.__ring.focus('filter'));
    await sleep(700);
    const p2 = await p.evaluate(() => {
      const r = document.getElementById('panel').getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth };
    });
    ok(p2.l >= -1 && p2.r <= p2.w + 1 && p2.t >= -1 && p2.b <= p2.h + 1, `390 上面板出界 ${JSON.stringify(p2)}`);
    ok(p2.sw <= p2.w + 1, `390 面板撑出横向滚动 ${p2.sw}`);
    await shot(p, '24-m-390-panel');
    await p.close();
  }

  /* ── 减弱动效：动词退成直接显示 ── */
  if (want('rm')) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errors.push(`rm: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`rm: ${m.text()}`); });
    await p.setViewport({ width: 1440, height: 900 });
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await p.goto(URL + '?ctx=read', { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction('window.__ring');
    await sleep(600);
    await p.evaluate(() => window.__ring.bloom(720, 420));
    await sleep(120);
    const v = await p.evaluate(() => ({ v: window.__ring.state.V, rot: window.__ring.state.rot, spin: getComputedStyle(document.querySelector('.c-ring .ring-spin')).animationName }));
    ok(v.v === 1, `减弱动效下动词没有直接到位（V=${v.v}）`);
    ok(v.spin === 'none', `减弱动效下光核还在转（${v.spin}）`);
    notes.push('[减弱动效] 动词直接显示（V=1），光核不转');
    await shot(p, '25-rm-bloom');
    await p.close();
  }

  /* ── 十二片瓣的排法挤不挤：标签两两不重叠 ── */
  if (want('layout')) {
    const p = await fresh('?ctx=grid');
    await move(p, 720, 450);
    await p.evaluate(() => window.__ring.bloom(720, 450));
    await sleep(1000);
    const lay = await p.evaluate(() => {
      const lab = [...document.querySelectorAll('#petals .p-in')].map((e) => {
        const r = e.getBoundingClientRect();
        return { id: e.closest('.petal').dataset.id, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
      });
      const hits = [];
      for (let i = 0; i < lab.length; i++)
        for (let j = i + 1; j < lab.length; j++) {
          const a = lab[i];
          const b = lab[j];
          const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (ox > 1 && oy > 1) hits.push(`${a.id}×${b.id} (${Math.round(ox)}×${Math.round(oy)})`);
        }
      return { lab, hits, vw: innerWidth, vh: innerHeight };
    });
    ok(lay.hits.length === 0, `瓣上的名字互相压住了：${lay.hits.join(', ')}`);
    const out = lay.lab.filter((l) => l.l < 2 || l.r > lay.vw - 2 || l.t < 2 || l.b > lay.vh - 2);
    ok(out.length === 0, `瓣名出屏：${out.map((o) => o.id).join(', ')}`);
    notes.push(`[排法] 十二个瓣名两两不重叠、都在屏内（名字高 ${Math.round(lay.lab[0].h)}px，最宽 ${Math.round(Math.max(...lay.lab.map((l) => l.w)))}px）`);
    await shot(p, '26-layout-labels');
    await p.close();
  }

  /* ── 深底 / 浅底各量一次真像素：环与花瓣玻璃到底看不看得见 ── */
  if (want('pixels')) {
    /* 深底：瞬间那一栏（异相）。瓣是稀疏图形，所以看最亮/最暗的那一档，不看平均 */
    const dk = await fresh('?ctx=grid&scene=moment');
    await move(dk, 700, 520);
    await dk.evaluate(() => window.__ring.bloom(700, 520));
    await sleep(900);
    const m1 = await probe(dk, {
      ground: [600, 640, 200, 120],
      ringInk: [640, 440, 120, 40],
      petal: [560, 380, 300, 280],
    });
    const petalDark = Math.max(m1.petal.hi / (m1.ground.mean + 0.05), 1) * 1;
    const rd = +(((m1.petal.hi + 0.05) / (m1.ground.mean + 0.05))).toFixed(2);
    const rr = +(((m1.ringInk.hi + 0.05) / (m1.ground.mean + 0.05))).toFixed(2);
    notes.push(`[像素·深底 异相] 底子 ${m1.ground.mean} → 瓣最亮 ${m1.petal.hi}（/底子 ${rd}），环上最亮 ${m1.ringInk.hi}（/底子 ${rr}）`);
    ok(rd >= 1.3, `深底上花瓣看不见（${rd}）`);
    ok(rr >= 1.3, `深底上环的墨看不见（${rr}）`);
    await dk.evaluate(() => window.__ring.focus('find'));
    await sleep(700);
    const box = await dk.evaluate(() => {
      const r = document.getElementById('panel').getBoundingClientRect();
      return [Math.round(r.left + 8), Math.round(r.top + 6), 6, 6];
    });
    const m2 = await probe(dk, { plate: box, ground: [600, 660, 200, 100] });
    notes.push(`[像素·深底] 面板板子 ${m2.plate.mean} / 底子 ${m2.ground.mean} → ${m2['面板板子 / 底子']}`);
    ok(m2['面板板子 / 底子'] >= 1.15, `深底上面板板子与底子分不开（${m2['面板板子 / 底子']}）`);
    await shot(dk, '27-pixels-deep');
    await dk.close();

    /* 浅底：随笔那一栏（浅梦） */
    const lt = await fresh('?ctx=grid&scene=essay');
    await move(lt, 240, 520);
    await lt.evaluate(() => window.__ring.bloom(240, 520));
    await sleep(900);
    const m3 = await probe(lt, {
      ground: [60, 700, 200, 120],
      ringInk: [180, 440, 120, 40],
      petal: [90, 380, 300, 280],
    });
    const rl = +(((m3.ground.mean + 0.05) / (m3.petal.lo + 0.05))).toFixed(2);
    const rf = +(((m3.petal.hi + 0.05) / (m3.ground.mean + 0.05))).toFixed(2);
    const rrl = +(((m3.ground.mean + 0.05) / (m3.ringInk.lo + 0.05))).toFixed(2);
    notes.push(`[像素·浅底 浅梦] 底子 ${m3.ground.mean} → 瓣面最亮 ${m3.petal.hi}（/底子 ${rf}）、瓣沿最暗 ${m3.petal.lo}（/底子 ${rl}），环上最暗 ${m3.ringInk.lo}（/底子 ${rrl}）`);
    ok(rl >= 1.2, `浅底上花瓣的边看不见（${rl}）`);
    ok(rrl >= 1.15, `浅底上环的墨看不见（${rrl}）`);
    await lt.evaluate(() => window.__ring.focus('find'));
    await sleep(700);
    const box2 = await lt.evaluate(() => {
      const r = document.getElementById('panel').getBoundingClientRect();
      return [Math.round(r.left + 6), Math.round(r.top + 3), Math.round(r.width - 12), 7];
    });
    const m4 = await probe(lt, { plate: box2, ground: [60, 720, 200, 100] });
    notes.push(`[像素·浅底] 面板板子 ${m4.plate.mean} / 底子 ${m4.ground.mean} → ${m4['面板板子 / 底子']}`);
    await shot(lt, '28-pixels-shallow');
    await lt.close();
  }

  await browser.close();
  server.close();

  console.log('── 罗盘环 · 自查 ──');
  for (const n of notes) console.log('  · ' + n);
  console.log(`  错误数：${errors.length}`);
  if (errors.length) console.log(errors.join('\n'));
  console.log(`  断言失败：${fails.length}`);
  if (fails.length) console.log('  ✗ ' + fails.join('\n  ✗ '));
  console.log(fails.length === 0 && errors.length === 0 ? '全部通过。' : '还有问题。');
  if (errors.length || fails.length) process.exitCode = 1;
})();
