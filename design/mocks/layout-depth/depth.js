/* ─────────────────────────────────────────────────────────────
   「景深叠层」原型 · 引擎
   所有薄片排在 Z 轴上；页面的原生滚动（带吸附）只负责给出「走到第几片」，
   相机在 rAF 里阻尼地追上去，每帧给每片玻璃写一次 transform / opacity / filter。
   不用 preserve-3d：每片都是透视舞台的直接子元素，相机变换并进各自的 transform，
   这样 backdrop-filter 才不被 3D 上下文压平；绘制先后由 z-index 按深度排。
   ───────────────────────────────────────────────────────────── */
(() => {
  const html = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
  const rgb = (a) => `rgb(${a[0]} ${a[1]} ${a[2]})`;

  const stage = $('.stage');
  const scroller = $('.scroller');
  const sky = $('.sky');
  const skySide = $('.sky-side');
  const mists = $$('.mist');
  const chromeEls = [$('.chrome'), $('.rail'), $('.hint')];
  const where = $('.where');
  const rail = $('.rail');
  const hint = $('.hint');
  const labelsBox = $('.labels');
  const toggle = $('.side-toggle');
  const reader = $('.reader');
  const rGlass = $('.r-glass', reader);
  const rCol = $('.r-col', reader);
  const rScroll = $('.r-scroll', reader);

  /* ── 时辰色板（src/styles/hours.css；home 是 tokens.css 的昼面略压一档） ── */
  const PAL = {
    home: { bg: [238, 241, 245], fg: [35, 40, 48], soft: [86, 96, 109], glow: [255, 255, 255], ga: 0.62 },
    shallow: { bg: [225, 231, 239], fg: [35, 40, 48], soft: [86, 96, 109], glow: [255, 255, 255], ga: 0.55 },
    deep: { bg: [20, 27, 41], fg: [230, 233, 239], soft: [154, 166, 184], glow: [120, 150, 200], ga: 0.2 },
    rem: { bg: [38, 33, 53], fg: [236, 230, 241], soft: [169, 159, 186], glow: [170, 140, 210], ga: 0.2 },
    dawn: { bg: [242, 235, 224], fg: [43, 38, 32], soft: [111, 100, 87], glow: [255, 236, 205], ga: 0.72 },
  };
  const BADGE = { shallow: '可言说的', deep: '可构造的', rem: '即逝的', dawn: '存在于此' };

  /* ── 薄片 ── */
  const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const rnd = rand(20261017);
  const items = $$('.sheet').map((el, i) => {
    // 有脚本时把 id 挪进 data-id：浏览器自己的 #锚点跳转会把文档滚回顶（目标在 fixed 舞台里）
    el.dataset.id = el.id;
    el.removeAttribute('id');
    const sec = el.closest('.sec');
    const hint = document.createElement('span');
    hint.className = 'open-hint';
    hint.textContent = el.classList.contains('k-threshold') ? '' : '回车展开';
    el.append(hint);
    return {
      el, i, sec,
      id: el.dataset.id || el.id,
      hour: sec.dataset.hour,
      tone: sec.dataset.tone,
      title: el.dataset.title,
      date: el.dataset.date,
      face: $('.face', el),
      jx: (rnd() - 0.5) * 2, jy: (rnd() - 0.5) * 2, jr: (rnd() - 0.5) * 2, jw: (rnd() - 0.5) * 2,
      z: 0,
      last: {},
    };
  });
  const N = items.length;
  if (matchMedia('(hover: none)').matches) hint.innerHTML = '上滑，向前 <i>↑</i> · 轻触展开';
  if (matchMedia('(hover: none)').matches) items.forEach((it) => { const h = $('.open-hint', it.el); if (h.textContent) h.textContent = '轻触展开'; });

  /* 版块边界上的雾层 */
  const fogs = [];
  items.forEach((it, i) => {
    if (i === 0 || items[i - 1].sec === it.sec) return;
    const f = document.createElement('div');
    f.className = 'fog';
    f.setAttribute('aria-hidden', 'true');
    const a = PAL[items[i - 1].hour], b = PAL[it.hour];
    // 雾是发光的：进深眠前是一层冷白的晨雾，深眠到异相之间是暗处一团淡紫的光，回到晨光前是暖白
    const FOG = { deep: [[214, 221, 234], [52, 60, 78]], rem: [[86, 80, 112], [236, 230, 241]], dawn: [[250, 243, 232], [111, 100, 87]] };
    const [fogc, fogink] = FOG[it.hour] || [[255, 255, 255], b.fg];
    f.style.setProperty('--fogc', fogc.join(' '));
    f.style.setProperty('--fogink', fogink.join(' '));
    f.innerHTML = `<div class="fog-word">${it.sec.dataset.name}</div><div class="fog-badge">${it.sec.dataset.badge}</div>`;
    stage.prepend(f);
    fogs.push({ el: f, before: i, z: 0, last: {} });
  });

  /* 页内位置轨 */
  items.forEach((it, i) => {
    if (i > 0 && items[i - 1].sec !== it.sec) rail.append(Object.assign(document.createElement('span'), { className: 'gap' }));
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', (it.sec.dataset.name ? it.sec.dataset.name + ' · ' : '') + it.title);
    b.title = it.title;
    b.addEventListener('click', () => go(i));
    rail.append(b);
    it.railBtn = b;
  });

  /* ── 度量 ── */
  let vw, vh, narrow, sw, sh, P, D, G, RISE, step, cx, cy;
  let side = { theta: 0, s: 1, R: 0, P: 6000, pivot: 0, axis: 'y' };
  function layout() {
    vw = innerWidth;
    vh = innerHeight;
    narrow = vw < 700;
    sw = Math.round(narrow ? Math.min(vw - 36, 460) : Math.min(800, Math.max(560, vw * 0.54)));
    sh = Math.round(narrow ? Math.min(vh * 0.56, 540) : Math.min(500, Math.max(380, vh * 0.56)));
    P = narrow ? 820 : 1200;
    D = narrow ? 560 : 680;
    G = D * 0.85;
    RISE = narrow ? 0.34 : 0.42;
    step = Math.round(vh);
    cx = Math.round(vw / 2);
    cy = Math.round(vh / 2 + (narrow ? 8 : 14));
    stage.style.perspective = P + 'px';
    stage.style.perspectiveOrigin = `${cx}px ${cy}px`;

    let z = 0;
    items.forEach((it, i) => {
      if (i > 0 && items[i - 1].sec !== it.sec) z += G;
      it.z = z;
      z += D;
      const s = it.el.style;
      s.width = sw + 'px';
      s.height = sh + 'px';
      s.left = Math.round(cx - sw / 2) + 'px';
      s.top = Math.round(cy - sh / 2) + 'px';
      it.el.classList.toggle('narrow', narrow);
    });
    fogs.forEach((f) => (f.z = (items[f.before - 1].z + items[f.before].z) / 2));

    scroller.innerHTML = items.map((_, k) => `<i style="top:${k * step}px"></i>`).join('');
    scroller.style.height = (N - 1) * step + vh + 'px';

    /* 侧看：整摞玻璃收紧间距后转到侧面，宽屏绕 Y（一排竖立的边），窄屏绕 X（一列横躺的边） */
    const zSpan = items[N - 1].z - items[0].z;
    side.axis = narrow ? 'x' : 'y';
    side.theta = narrow ? 82 : 79;
    // 侧看用一个近乎平行的长焦：透视距离拉到 6000，相机退后同样的倍数（推拉变焦），
    // 否则转过来以后靠近相机的那几片会被看成背面
    side.P = 6000;
    const k = narrow ? 0.7 : 0.62;
    side.R = side.P / k - side.P;
    const want = narrow ? vh * 0.7 : Math.min(vw * 0.74, 1180);
    side.s = want / (zSpan * Math.sin((side.theta * Math.PI) / 180) * k);
    side.pivot = (items[0].z + items[N - 1].z) / 2;
    buildLabels();
    force = true;
  }

  /* 滚动位置 → 相机深度（逐段线性：跨版块那一段走得更远，雾就在中间） */
  const zAt = (p) => {
    p = Math.max(0, Math.min(N - 1, p));
    const a = Math.floor(p), b = Math.min(N - 1, a + 1), t = p - a;
    return items[a].z + (items[b].z - items[a].z) * t;
  };
  const stopAt = () => Math.round(scrollY / step);

  /* ── 状态 ── */
  let cam = 0, camTarget = 0, lastT = performance.now();
  let u = 0; // 0 正面 → 1 侧看
  let tween = null; // { from, to, t0, dur, pivotFrom }
  let pivotFront = 0; // 侧看过渡时的正面支点
  let focus = 0, settled = false, idleTimer = 0, force = true;
  let readingIdx = -1, busy = false, shown = -1;


  /* ── 色：相机走到哪，天色就落到哪一段夜里 ── */
  function paletteAt(z) {
    let a = 0;
    while (a < N - 1 && items[a + 1].z <= z) a++;
    const b = Math.min(N - 1, a + 1);
    const A = PAL[items[a].hour], B = PAL[items[b].hour];
    if (A === B || a === b) return { ...A, t: 0, A, B };
    const t = smooth(0.3, 0.7, (z - items[a].z) / (items[b].z - items[a].z));
    return { bg: mix(A.bg, B.bg, t), fg: mix(A.fg, B.fg, t), soft: mix(A.soft, B.soft, t), glow: mix(A.glow, B.glow, t), ga: A.ga + (B.ga - A.ga) * t };
  }
  let lastBg = '';
  function paintSky(z) {
    const p = paletteAt(z);
    const key = p.bg.join() + p.fg.join() + u.toFixed(3);
    if (key === lastBg && !force) return;
    lastBg = key;
    sky.style.backgroundColor = rgb(p.bg);
    mists.forEach((m) => { m.style.setProperty('--glow', p.glow.join(' ')); m.style.setProperty('--mist-a', (p.ga * 0.9).toFixed(3)); });
    const ink = u > 0.5 ? null : p;
    chromeEls.forEach((el) => {
      el.style.setProperty('--c-ink', rgb(ink ? ink.fg : sideInk));
      el.style.setProperty('--c-soft', rgb(ink ? ink.soft : sideInk));
    });
    skySide.style.opacity = u.toFixed(3);
  }
  let sideInk = PAL.home.fg;

  /* ── 每帧：把相机变换并进每一片的 transform ── */
  function frame(now) {
    const dt = Math.min(64, now - lastT);
    lastT = now;
    if (RM) cam = camTarget;
    else cam += (camTarget - cam) * (1 - Math.exp(-dt / 120));
    if (Math.abs(camTarget - cam) < 0.15) cam = camTarget;

    if (tween) {
      const t = clamp((now - tween.t0) / tween.dur, 0, 1);
      u = tween.from + (tween.to - tween.from) * (RM ? (t < 1 ? tween.from : tween.to) : ease(t));
      if (t >= 1) { const done = tween.done; tween = null; done && done(); }
      force = true;
    }

    const moving = cam !== camTarget || tween || force;
    if (moving) render();
    force = false;
    requestAnimationFrame(frame);
  }

  let lastP = 0;
  function render() {
    const e = u; // 已经过缓动
    const theta = side.theta * e;
    const s = 1 + (side.s - 1) * e;
    const R = side.R * e;
    const Pc = P + (side.P - P) * e;
    if (Pc !== lastP) { stage.style.perspective = Pc.toFixed(1) + 'px'; lastP = Pc; }
    const pivot = (tween ? tween.pivotFront : cam) * (1 - e) + side.pivot * e;
    const w = 1 - e;
    const rad = (theta * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const rot = side.axis === 'y' ? `rotateY(${-theta}deg)` : `rotateX(${theta}deg)`;
    const isSettled = settled && !tween && u === 0;

    for (const it of items) {
      const d = it.z - cam;
      const ad = Math.abs(d);
      const fd = Math.min(1, ad / D);
      // 雾中等待的位置：向后越远越往上、略向左偏，各片带一点不规则的偏移与倾角
      const ox = (it.jx * 26 * fd - d * 0.03) * w;
      const oy = (-d * RISE + it.jy * 14 * fd) * w;
      const rz = it.jr * 1.1 * fd * w;
      const ry = it.jw * 5 * fd * w;
      const zz = -(it.z - pivot) * s;

      // 正面的雾：前方逐层变虚变淡，穿过的一片放大、变虚、化开
      let blur = 0, op = 1;
      if (d >= 0) {
        blur = Math.min(16, Math.pow(d / D, 1.15) * 4.4);
        op = clamp(1 - Math.max(0, d / D - 0.45) * 0.26, 0, 1);
        if (d > D * 5.4) op = 0;
      } else {
        blur = (ad / D) * 16;
        op = Math.pow(clamp(1 - ad / (P * 0.5), 0, 1), 1.4);
      }
      let fo = 1;
      if (RM && u === 0) {
        // 减弱动效：不飞行。玻璃原地不动（相邻两片同位，交接处看不出换片），只有字面先淡出再淡入
        op = ad <= D * 0.5 ? 1 : 0;
        fo = smooth(D * 0.5, D * 0.12, ad);
        blur = 0;
      }
      blur *= w;
      op = op * w + (u > 0 ? 0.96 : 0) * e;

      let tf;
      if (isSettled && ad < 0.5) tf = 'none';
      else if (RM && u === 0) tf = 'none';
      else
        tf =
          `translate3d(0,0,${(-R).toFixed(1)}px) ${rot} ` +
          `translate3d(${ox.toFixed(2)}px,${oy.toFixed(2)}px,${zz.toFixed(2)}px) rotateZ(${rz.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;

      // 近处（正对或刚穿过）保留玻璃后的磨砂，只虚化字面；远处整片虚化（玻璃早已在前片的霜后面）
      const near = u < 0.35 && ((d >= 0 && d < D * 0.72) || (d < 0 && ad < D * 0.22));
      const vis = op > 0.004;
      // 深度排序：转到侧面后用旋转后的 z
      const zDepth = side.axis === 'y' ? zz * cos - R : zz * cos - R;
      const zi = Math.round(5000 + zDepth / 2);

      const L = it.last;
      if (L.tf !== tf) it.el.style.transform = L.tf = tf;
      const ops = vis ? op.toFixed(3) : '0';
      if (L.op !== ops) it.el.style.opacity = L.op = ops;
      if (L.vis !== vis) it.el.style.visibility = (L.vis = vis) ? '' : 'hidden';
      if (L.zi !== zi) it.el.style.zIndex = L.zi = zi;
      if (L.near !== near) it.el.classList.toggle('near', (L.near = near));
      const bSheet = near || blur < 0.05 ? 'none' : `blur(${blur.toFixed(2)}px)`;
      const bFace = near && blur >= 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
      if (L.bs !== bSheet) it.el.style.filter = L.bs = bSheet;
      if (L.bf !== bFace) it.face.style.filter = L.bf = bFace;
      const fos = fo.toFixed(3);
      if (L.fo !== fos) it.face.style.opacity = L.fo = fos === '1.000' ? '' : fos;
    }

    for (const f of fogs) {
      const d = f.z - cam;
      let op = d >= 0 ? 0.97 * smooth(D * 2.6, D * 0.05, d) : 0.97 * Math.pow(clamp(1 + d / (P * 0.3), 0, 1), 1.6);
      // 版块名只在雾还在前方时看得清；走进雾里它先散开
      const wo = d > 0 ? smooth(0, D * 0.55, d) : 0;
      op *= 1 - Math.min(1, e * 2.5);
      if (RM) op = 0;
      const vis = op > 0.004;
      const tf = `translate3d(${(-d * 0.03).toFixed(1)}px,${(-d * RISE).toFixed(1)}px,${(-d).toFixed(1)}px)`;
      const near = vis && d > -P * 0.4 && d < D * 0.9;
      const L = f.last;
      if (L.tf !== tf) f.el.style.transform = L.tf = tf;
      const ops = op.toFixed(3);
      if (L.op !== ops) f.el.style.opacity = L.op = ops;
      if (L.vis !== vis) f.el.style.visibility = (L.vis = vis) ? '' : 'hidden';
      f.el.style.zIndex = Math.round(5000 - d / 2);
      if (L.near !== near) f.el.classList.toggle('near', (L.near = near));
      const wos = wo.toFixed(2);
      if (L.wo !== wos) f.el.style.setProperty('--wo', (L.wo = wos));
    }

    paintSky(cam);
    if (u === 0 && !tween) {
      let k = 0, best = Infinity;
      items.forEach((it, i) => { const dd = Math.abs(it.z - cam); if (dd < best) { best = dd; k = i; } });
      if (k !== shown) { shown = k; showPos(k); }
    }
  }

  /* ── 侧看的刻名：把每片最靠近相机的那条边投到屏幕上，标题沿边竖排（窄屏横排） ── */
  function project(x, y, z) {
    const k = side.P / (side.P - z);
    return [cx + x * k, cy + y * k, k];
  }
  function sidePoint(it, lx, ly) {
    const rad = (side.theta * Math.PI) / 180;
    const zz = -(it.z - side.pivot) * side.s;
    if (side.axis === 'y') {
      const xr = lx * Math.cos(rad) + zz * -Math.sin(rad) * 1;
      const zr = lx * Math.sin(rad) + zz * Math.cos(rad) - side.R;
      return project(xr, ly, zr);
    }
    const yr = ly * Math.cos(rad) - zz * Math.sin(rad);
    const zr = ly * Math.sin(rad) + zz * Math.cos(rad) - side.R;
    return project(lx, yr, zr);
  }
  let labs = [];
  function buildLabels() {
    labelsBox.innerHTML = '';
    labs = [];
    const secGroups = new Map();
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lab ' + (side.axis === 'y' ? 'v' : 'h');
      b.innerHTML = `<span class="lt">${it.title}</span>${it.date ? `<span class="ld">${it.date.replace(/-/g, '·')}</span>` : ''}`;
      const pal = PAL[it.hour];
      const dark = it.tone === 'dark';
      b.style.setProperty('--lab-ink', rgb(pal.fg));
      b.style.setProperty('--lab-soft', rgb(pal.soft));
      b.style.setProperty('--lab-hi', dark ? 'rgb(240 214 176)' : 'rgb(118 86 64)');
      b.addEventListener('click', () => flyTo(it.i));
      b.addEventListener('mouseenter', () => it.el.classList.add('hover'));
      b.addEventListener('mouseleave', () => it.el.classList.remove('hover'));
      if (side.axis === 'y') {
        // 竖立的边：取右边（转过来后离相机最近），从上端往下刻
        const top = sidePoint(it, sw / 2, -sh / 2);
        const bot = sidePoint(it, sw / 2, sh / 2);
        b.style.left = Math.round(top[0] + 9) + 'px';
        b.style.top = Math.round(top[1] + (bot[1] - top[1]) * 0.08) + 'px';
        b.style.maxHeight = Math.round((bot[1] - top[1]) * 0.86) + 'px';
      } else {
        // 横躺的边：取下边，标题写在边的上方、左对齐
        const l = sidePoint(it, -sw / 2, sh / 2);
        b.style.left = Math.round(l[0] + 14) + 'px';
        b.style.top = Math.round(l[1] - 40) + 'px';
      }
      labelsBox.append(b);
      labs.push(b);
      const key = it.sec;
      if (!secGroups.has(key)) secGroups.set(key, []);
      secGroups.get(key).push(it);
    });
    // 版块题签
    secGroups.forEach((group, sec) => {
      if (!sec.dataset.name) return;
      const c = document.createElement('div');
      c.className = 'cap ' + (side.axis === 'y' ? 'v' : 'h');
      c.innerHTML = `<b>${sec.dataset.name}</b>${BADGE[group[0].hour]}`;
      const pal = PAL[group[0].hour];
      c.style.setProperty('--lab-ink', rgb(pal.fg));
      c.style.setProperty('--lab-soft', rgb(pal.soft));
      if (side.axis === 'y') {
        const a = sidePoint(group[0], -sw / 2, sh / 2);
        const b = sidePoint(group[group.length - 1], sw / 2, sh / 2);
        const y = Math.max(a[1], b[1]) + 46;
        c.style.left = Math.round(a[0] + 10) + 'px';
        c.style.top = Math.round(y) + 'px';
        c.style.width = Math.max(120, Math.round(b[0] - a[0] - 10)) + 'px';
      } else {
        const a = sidePoint(group[0], -sw / 2, -sh / 2);
        c.style.left = Math.round(a[0] + 14) + 'px';
        c.style.top = Math.round(sidePoint(group[0], -sw / 2, sh / 2)[1] - 66) + 'px';
      }
      labelsBox.append(c);
    });
    // 侧看时的天：四段夜色按各版块在屏幕上的位置铺成一条横（窄屏竖）向的渐变
    const stops = items.map((it) => {
      const p = sidePoint(it, 0, 0);
      const pos = side.axis === 'y' ? p[0] / vw : p[1] / vh;
      return `${rgb(PAL[it.hour].bg)} ${(pos * 100).toFixed(1)}%`;
    });
    skySide.style.background = `linear-gradient(${side.axis === 'y' ? 90 : 180}deg, ${stops.join(', ')})`;
  }

  /* ── 移动 ── */
  function go(k, instant) {
    k = clamp(k, 0, N - 1);
    scrollTo({ top: k * step, behavior: instant || RM ? 'instant' : 'smooth' });
  }
  function onScroll() {
    if (u > 0 && !tween) return;
    camTarget = zAt(scrollY / step);
    if (settled) {
      settled = false;
      items[focus].el.classList.remove('settled');
      force = true;
    }
    hint.classList.toggle('gone', scrollY > step * 0.3);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(checkSettle, 140);
  }
  function checkSettle() {
    const k = stopAt();
    if (Math.abs(scrollY - k * step) > 2 || Math.abs(cam - items[k].z) > 1) {
      idleTimer = setTimeout(checkSettle, 90);
      return;
    }
    cam = camTarget = items[k].z;
    setFocus(k);
    settled = true;
    items[k].el.classList.add('settled');
    force = true;
  }
  function setFocus(k) {
    focus = k;
    showPos(k);
    const it = items[k];
    labs.forEach((b, i) => b.classList.toggle('cur', i === k));
    items.forEach((x, i) => x.el.classList.toggle('cur', i === k));
    if (readingIdx < 0 && u === 0) history.replaceState(null, '', '#' + it.id);
  }
  function showPos(k) {
    shown = k;
    const it = items[k];
    items.forEach((x, i) => x.railBtn.setAttribute('aria-current', i === k ? 'true' : 'false'));
    labs.forEach((b, i) => b.classList.toggle('cur', i === k));
    const name = it.sec.dataset.name;
    where.querySelector('.w-sec').textContent = name ? `${name} · ${BADGE[it.hour]}` : '';
    where.querySelector('.w-n').textContent = k ? `${String(k).padStart(2, '0')} / ${String(N - 1).padStart(2, '0')}` : '';
  }

  /* ── 侧看 ↔ 正面 ── */
  function toSide() {
    if (u === 1 || tween || readingIdx >= 0) return;
    html.classList.add('side', 'locked');
    toggle.setAttribute('aria-pressed', 'true');
    settled = false;
    items[focus].el.classList.remove('settled');
    labs.forEach((b) => b.classList.remove('on'));
    $$('.cap', labelsBox).forEach((c) => c.classList.remove('on'));
    tween = { from: 0, to: 1, t0: performance.now(), dur: RM ? 1 : 1250, pivotFront: cam, done: () => {
      labs.forEach((b, i) => setTimeout(() => b.classList.add('on'), RM ? 0 : i * 45));
      $$('.cap', labelsBox).forEach((c) => c.classList.add('on'));
      history.replaceState(null, '', '#index');
    } };
    setFocus(focus);
  }
  function flyTo(k) {
    if (tween) return;
    if (u === 0) return go(k);
    labs.forEach((b) => b.classList.remove('on'));
    $$('.cap', labelsBox).forEach((c) => c.classList.remove('on'));
    html.classList.remove('side');
    toggle.setAttribute('aria-pressed', 'false');
    // 相机先在侧看的掩护下跳到目标片，再整摞转回正面
    html.classList.remove('locked');
    scrollTo({ top: k * step, behavior: 'instant' });
    cam = camTarget = items[k].z;
    tween = { from: 1, to: 0, t0: performance.now(), dur: RM ? 1 : 1150, pivotFront: items[k].z, done: () => {
      u = 0;
      force = true;
      checkSettle();
    } };
  }
  toggle.addEventListener('click', () => (u === 0 ? toSide() : flyTo(focus)));

  /* ── 展开：玻璃转正铺满，字分四档从霜里析出 ── */
  const TONE_VARS = ['--ink', '--ink-soft', '--ink-faint', '--hair', '--g-top', '--g-mid', '--g-low', '--g-edge', '--g-lip', '--g-shadow', '--veil'];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function open(k) {
    if (busy || readingIdx >= 0 || u !== 0) return;
    const it = items[k];
    if (it.el.classList.contains('k-threshold')) return go(1);
    if (!settled || focus !== k) { go(k); return; }
    busy = true;
    readingIdx = k;
    const cs = getComputedStyle(it.sec);
    TONE_VARS.forEach((v) => reader.style.setProperty(v, cs.getPropertyValue(v)));
    reader.className = 'reader ' + it.tone;
    const body = $('.body', it.el).cloneNode(true);
    $$('.media', body).forEach((m) => m.classList.add('k-moment-media'));
    rCol.innerHTML = '';
    rCol.className = 'r-col' + (it.el.classList.contains('k-moment') ? ' is-moment' + (it.el.classList.contains('has-media') ? ' has-media' : '') : '');
    rCol.append(body);
    rCol.dataset.res = '0';
    rCol.dataset.ires = '0';
    rScroll.scrollTop = 0;
    const r = it.el.getBoundingClientRect();
    Object.assign(rGlass.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    reader.hidden = false;
    html.classList.add('locked', 'reading');
    history.replaceState(null, '', '#' + it.id + '/read');
    const inset = narrow ? 0 : 18;
    reader.style.setProperty('--ri', inset + 'px');
    if (RM) {
      reader.style.opacity = '0';
      Object.assign(rGlass.style, { top: inset + 'px', left: inset + 'px', width: vw - inset * 2 + 'px', height: vh - inset * 2 + 'px' });
      it.el.classList.add('lifted');
      await wait(20);
      reader.style.opacity = '1';
      reader.classList.add('open');
      rCol.dataset.res = '4';
      rCol.dataset.ires = '4';
    } else {
      it.el.classList.add('lifted');
      void rGlass.offsetWidth;
      reader.classList.add('fly');
      Object.assign(rGlass.style, {
        top: inset + 'px', left: inset + 'px', width: vw - inset * 2 + 'px', height: vh - inset * 2 + 'px',
        borderRadius: narrow ? '0px' : '8px',
      });
      reader.classList.add('open');
      await wait(400);
      for (let s = 1; s <= 4; s++) {
        rCol.dataset.res = String(s);
        if (s >= 2) rCol.dataset.ires = String(s - 1);
        await wait(s === 4 ? 160 : 130);
      }
      rCol.dataset.ires = '4';
    }
    $('.r-close', reader).focus({ preventScroll: true, focusVisible: false });
    busy = false;
  }
  async function close() {
    if (busy || readingIdx < 0) return;
    busy = true;
    const it = items[readingIdx];
    reader.classList.remove('open');
    if (RM) {
      reader.style.opacity = '0';
      await wait(300);
    } else {
      for (let s = 3; s >= 0; s--) {
        rCol.dataset.res = String(s);
        rCol.dataset.ires = String(Math.max(0, s - 1));
        await wait(70);
      }
      const r = it.el.getBoundingClientRect();
      reader.classList.add('back');
      Object.assign(rGlass.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '6px' });
      await wait(520);
    }
    it.el.classList.remove('lifted');
    await wait(RM ? 0 : 120);
    reader.hidden = true;
    reader.className = 'reader';
    reader.style.opacity = '';
    html.classList.remove('locked', 'reading');
    readingIdx = -1;
    busy = false;
    history.replaceState(null, '', '#' + it.id);
    it.el.focus?.({ preventScroll: true });
  }
  $('.r-close', reader).addEventListener('click', close);

  items.forEach((it) => {
    it.el.addEventListener('click', (e) => {
      if (e.target.closest('a[href^="http"]')) return;
      e.preventDefault();
      if (u > 0) return flyTo(it.i);
      if (settled && focus === it.i) open(it.i);
      else go(it.i);
    });
  });
  $$('.t-toc a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const k = items.findIndex((it) => '#' + it.id === a.getAttribute('href'));
      go(k);
    }),
  );
  $('.brand').addEventListener('click', (e) => { e.preventDefault(); u > 0 ? flyTo(0) : go(0); });

  /* ── 键盘 / 手势 ── */
  addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey) return;
    if (readingIdx >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      return;
    }
    if (u > 0) {
      if (tween) return;
      if (e.key === 'Escape' || e.key === '+' || e.key === '=') { e.preventDefault(); flyTo(focus); }
      else if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setFocus(Math.min(N - 1, focus + 1)); }
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setFocus(Math.max(0, focus - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); flyTo(focus); }
      return;
    }
    const k = stopAt();
    if (['ArrowDown', 'PageDown', ' ', 'j'].includes(e.key) && !e.shiftKey) { e.preventDefault(); go(k + 1); }
    else if (['ArrowUp', 'PageUp', 'k'].includes(e.key) || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); go(k - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(N - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); open(k); }
    else if (e.key === '-' || e.key === 'Escape') { e.preventDefault(); toSide(); }
  });
  // Ctrl + 滚轮（触控板捏合）外推＝侧看，内推＝回到正面
  addEventListener('wheel', (e) => {
    if (!e.ctrlKey) {
      if (u > 0) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (e.deltaY > 4 && u === 0) toSide();
    else if (e.deltaY < -4 && u === 1) flyTo(focus);
  }, { passive: false });

  /* ── 地址 ── */
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === 'index') { const k = focus; go(k, true); setTimeout(toSide, 60); return; }
    const [id, mode] = h.split('/');
    const k = items.findIndex((it) => it.id === id);
    if (k < 0) return;
    go(k, true);
    cam = camTarget = items[k].z;
    force = true;
    setTimeout(() => { checkSettle(); if (mode === 'read') setTimeout(() => open(k), 60); }, 60);
  }

  addEventListener('scroll', onScroll, { passive: true });
  // 舞台是 overflow:hidden 的滚动容器，浏览器按 #锚点 会把它内部滚走：始终归零
  stage.addEventListener('scroll', () => { stage.scrollTop = 0; stage.scrollLeft = 0; });
  // 尺寸变了才重排；保持在变化前所在的那一片（移动端载入时视口会先抖一下，不能退回 focus 的初值）
  addEventListener('resize', () => {
    if (innerWidth === vw && innerHeight === vh) return;
    const k = clamp(Math.round(scrollY / step), 0, N - 1);
    layout();
    go(k, true);
    cam = camTarget = items[k].z;
    force = true;
  });
  addEventListener('hashchange', () => { if (readingIdx < 0 && u === 0) fromHash(); });

  layout();
  stage.scrollTop = 0;
  history.scrollRestoration = 'manual';
  if (location.hash.length > 1) fromHash();
  else { scrollTo(0, 0); setTimeout(checkSettle, 60); }
  requestAnimationFrame(frame);

  // 截图脚本用的把手
  window.__depth = { go, open, close, toSide, flyTo, state: () => ({ cam, camTarget, u, focus, settled, readingIdx, step, N }), setCam: (z) => { cam = camTarget = z; force = true; } };
})();
