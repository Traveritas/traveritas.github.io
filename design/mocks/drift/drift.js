/* ─────────────────────────────────────────────────────────────
   浮游碎片。
   每个场景（随笔 / 瞬间 / 项目）是一片在三个方向上都无缝循环的空间：
   · z：镜头在 Z 上的位置 Zc；碎片分 L 层，层按周期 D 无限重复。δ = 层到镜头的距离（0, D]，
     屏上缩放 = G / δ，δ = 1 是焦平面。太近的层淡出，越过镜头后在最远处重新淡入——滚轮可以一直往里推。
   · x / y：每层把场景的全部内容排一遍，各层的平面周期不同，重复错开、不成网格；每过一个 z 周期，层里的排法也换一次。
   失焦＝像素化：离焦平面越远（|ln δ| 越大），用越粗的那一档。
   迟滞与超调：每块副本在屏幕空间里有自己的弹簧，近处硬、跟得紧；远处软、拖得久、晃得多。

   变体（地址参数，右下角面板可点选）：
     ?bg=    direct | ratio | heavy | stir（默认）      背景怎样跟着镜头
     ?look=  frost（默认）| glow | slab | print + variants/looks/*     碎片外观
     ?hover= pull（默认）| sweep | lean + variants/hovers/*            悬停
     ?open=  fly（默认）| grow | pixel | page + variants/opens/*       点开
     ?deco=  none（默认）| variants/decos/*                            场景里的装饰

   四个维度的可插拔接口在 reg.js；变体各自是 variants/ 下的一个文件。
   ───────────────────────────────────────────────────────────── */
(async () => {
  'use strict';
  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const drift = document.getElementById('drift');
  const veil = document.getElementById('veil');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reg = window.DriftReg;

  const q = new URLSearchParams(location.search);
  const pick = (k, opts) => (opts.includes(q.get(k)) ? q.get(k) : opts[0]);
  const V = {
    bg: pick('bg', ['heavy', 'stir', 'direct', 'ratio']),
    look: pick('look', ['frost', 'glow', 'slab', 'print', ...reg.names.looks]),
    hover: pick('hover', ['pull', 'sweep', 'lean', ...reg.names.hovers]),
    open: pick('open', ['fly', 'grow', 'pixel', 'page', ...reg.names.opens]),
    deco: pick('deco', ['none', ...reg.names.decos]),
    scheme: '',
  };

  /* ══ 方案（?scheme=）══
     一份设计原语：一件东西 + 它被靠近时怎么动 + 它怎么变成可读的面。
     三部分不是三个决定，所以方案把 look / hover / open / focus 一次给全。
     单轴的四个参数仍然管用——方案只是把它们一起换掉。 */
  const SCHEME = reg.schemes[q.get('scheme')] || null;
  if (SCHEME) {
    V.scheme = SCHEME.name;
    for (const k of ['look', 'hover', 'open']) {
      const part = SCHEME[k];
      if (!part) continue;
      if (typeof part === 'string') V[k] = part;
      else {
        const nm = `~${SCHEME.name}`;
        reg[`${k}s`][nm] = Object.assign({ name: nm, kind: k }, part);
        V[k] = nm;
      }
    }
  }
  for (const k in V) root.dataset[k] = V[k];
  const hoverDef = () => reg.hovers[V.hover] || null;
  const openDef = () => reg.opens[V.open] || null;
  const schemeFocus = () => (SCHEME && SCHEME.focus) || null;

  const D = 2.5; // z 周期
  const L = 5; // 每个周期的层数
  const GAP = D / L;
  const NEAR0 = 0.42; // δ 小于它看不见（太近）
  const NEAR1 = 0.72; // 到这里完全不透明
  const FAR0 = 2.05; // 从这里开始往远处淡出
  const MARGIN = 160;
  const LOD_B = [0.17, 0.42, 0.8]; // |ln δ| 的分档

  const PX = 5;
  const light = window.DriftLight(document.getElementById('light'), PX);
  const ALL = await window.DriftCards.build(V.look);
  const deco = window.DriftDeco(drift);
  await deco.build(V.deco);
  let curOpen = null; // 当前点开的变体（有 closing / closed 钩子时由它接管收回）
  let curApi = null;
  const reader = window.DriftReader({
    onDim: (v) => (dimT = v),
    onClosing: () => {
      if (curOpen && curOpen.closing) curOpen.closing(curApi);
      else if (fx) fx.goal = 0;
    },
    onClosed: () => {
      if (curOpen && curOpen.closed) curOpen.closed(curApi);
      if (reading) reading.rec && (reading.rec.el.style.visibility = '');
      // 跳焦收回：碎片先停在最粗那档，再一档档对回焦
      if (fx && fx.mode === 'pixel' && fx.lodForce != null) {
        const f = fx;
        const timer = setInterval(() => {
          f.lodForce--;
          if (f.lodForce <= lodOf(G / rectScale(f.rec)) || f.lodForce <= 0) { f.lodForce = null; clearInterval(timer); }
        }, RM ? 0 : 80);
      }
      curOpen = null;
      curApi = null;
      reading = null;
      root.classList.remove('reading');
    },
  });

  /* ══ 确定性的随机 ══ */
  const hash = (...n) => {
    let h = 2166136261;
    for (const v of n) {
      const s = String(v);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ══ 层的排法：一层里每个条目占一格，格子顺序与格内位置随 (场景, 层, z 周期) 变 ══ */
  const layouts = new Map();
  function layout(scene, l, c) {
    const key = `${scene}:${l}:${c}`;
    if (layouts.has(key)) return layouts.get(key);
    const its = ALL[scene];
    const n = its.length;
    const f = Math.sqrt(Math.max(2, n) / 2);
    const Pw = Math.round((1500 + 260 * (l % 3)) * f);
    const Ph = Math.round((1080 + 190 * ((l + 1) % 3)) * f);
    const cols = Math.ceil(Math.sqrt(n * (Pw / Ph)));
    const rows = Math.ceil(n / cols);
    const cells = [...Array(cols * rows).keys()].sort((a, b) => hash(key, a) - hash(key, b));
    const cw = Pw / cols;
    const ch = Ph / rows;
    const pos = its.map((it, i) => {
      const cell = cells[i];
      const cx = (cell % cols) * cw + cw / 2;
      const cy = Math.floor(cell / cols) * ch + ch / 2;
      const jx = Math.max(0, (cw - it.w) / 2 - 40) * (hash(key, i, 'x') * 2 - 1);
      const jy = Math.max(0, (ch - it.h) / 2 - 40) * (hash(key, i, 'y') * 2 - 1);
      return { x: cx + jx, y: cy + jy };
    });
    // 整层再错开一个随机偏移，周期之间不对齐
    const ox = hash(key, 'ox') * Pw;
    const oy = hash(key, 'oy') * Ph;
    const L_ = { Pw, Ph, pos: pos.map((p) => ({ x: p.x + ox, y: p.y + oy })) };
    layouts.set(key, L_);
    return L_;
  }

  /* ══ 镜头 ══ */
  let vw = innerWidth;
  let vh = innerHeight;
  let G = clamp(vw / 1200, 0.5, 1);
  let scene = 'essay';
  const first = layout(scene, 0, 0).pos[0];
  const cam = { x: first.x + 150, y: first.y + 70, z: -1 };
  let zT = cam.z;
  const vel = { x: 0, y: 0 };
  const pend = { x: 0, y: 0 };
  let fly = null;
  let dim = 0;
  let dimT = 0;
  let reading = null;
  let fx = null; // 展开时周围碎片的反应：{ mode, rec, amt, goal, cx, cy }
  let hoverRec = null;
  const mouse = { x: vw / 2, y: vh / 2 };

  /* ══ 交给变体（variants/*）的把手：值是活的，一律走 getter ══ */
  const hApi = () => ({
    get mouse() { return mouse; },
    get G() { return G; },
    get vw() { return vw; },
    get vh() { return vh; },
    get hoverRec() { return hoverRec; },
    get reading() { return reading; },
    get scene() { return scene; },
    get cam() { return cam; },
    get t() { return performance.now(); },
    recs, root, RM, reg,
  });
  function openApi(rec, opts) {
    return {
      rec, it: rec.it, opts, root, reader, RM, reg,
      get G() { return G; },
      get vw() { return vw; },
      get vh() { return vh; },
      get cam() { return cam; },
      get zT() { return zT; },
      set zT(v) { zT = v; },
      get scene() { return scene; },
      rectOf: () => (recs.get(rec.key) ? rectOf(rec) : null),
      lodOf, rectScale,
      hide: () => { rec.el.style.visibility = 'hidden'; },
      show: () => { rec.el.style.visibility = ''; },
      setFx: (o) => (fx = Object.assign({ mode: 'custom', rec, amt: 0, goal: 1, cx: rec.x, cy: rec.y, lodForce: null }, o)),
      clearFx: () => { fx = null; },
      openReader: (rect, extra) => reader.open(rec.it, rec.it.k, rect || rectOf(rec), Object.assign({}, opts, extra)),
      flyTo: (to, dur, done) => { fly = { t0: performance.now(), dur: RM ? 0 : dur, from: { ...cam }, to, done }; },
      now: () => performance.now(),
    };
  }

  /* ══ 聚焦 ══
     第一次点 = 聚焦：镜头飞到那块、让它落在焦平面正中（于是它变清楚），
     四道细线角从四方浮出来框住它，周围的碎片往外让开、退焦——世界为它腾出一块地方。
     再点一次才展开。收回后回到聚焦态，Esc 再退一层。 */
  let focusRec = null;
  let focusOn = 0; // 0→1：四角、方案自己的聚焦效果、周围碎片的让位都按它进
  const focusUI = document.createElement('div');
  focusUI.id = 'focus';
  focusUI.setAttribute('aria-hidden', 'true');
  focusUI.innerHTML = '<div class="fc">'
    + '<i style="--ox:-30px;--oy:-30px;--d:0ms"></i>'
    + '<i style="--ox:30px;--oy:-30px;--d:70ms"></i>'
    + '<i style="--ox:30px;--oy:30px;--d:140ms"></i>'
    + '<i style="--ox:-30px;--oy:30px;--d:210ms"></i>'
    + '</div>';
  stage.appendChild(focusUI);
  const fcEl = focusUI.firstElementChild;

  function focusApi(rec) {
    return {
      rec, it: rec && rec.it, root, RM, reg, scheme: SCHEME, ui: focusUI, get on() { return focusOn; },
      get G() { return G; },
      get vw() { return vw; },
      get vh() { return vh; },
      get cam() { return cam; },
      get scene() { return scene; },
      rectOf: () => (rec && recs.get(rec.key) ? rectOf(rec) : null),
      lodOf, rectScale,
      unfocus: () => setFocus(null),
      open: () => rec && openRec(rec),
      now: () => performance.now(),
    };
  }

  function placeFocusUI() {
    if (!focusRec) return;
    const r = rectOf(focusRec);
    fcEl.style.transform = `translate3d(${r.left.toFixed(1)}px,${r.top.toFixed(1)}px,0)`;
    fcEl.style.width = `${r.width.toFixed(1)}px`;
    fcEl.style.height = `${r.height.toFixed(1)}px`;
  }

  function setFocus(rec) {
    if (rec === focusRec) return;
    const fd = schemeFocus();
    if (focusRec) {
      focusRec.el.classList.remove('focused');
      if (fd && fd.off) fd.off(focusRec, focusApi(focusRec));
    }
    focusRec = rec;
    if (!rec) {
      fcEl.classList.remove('on');
      return;
    }
    vel.x = vel.y = pend.x = pend.y = 0;
    const tg = target(rec, performance.now());
    const to = { x: tg.wx, y: tg.wy, z: rec.l * GAP + rec.c * D - 1 };
    const dist = Math.hypot(((to.x - cam.x) * G) / vw, to.z - cam.z);
    rec.el.classList.add('focused');
    fly = {
      t0: performance.now(),
      dur: RM ? 0 : clamp(520 + dist * 260, 560, 900),
      from: { ...cam },
      to,
      done: () => {
        if (focusRec !== rec) return;
        fcEl.classList.add('on');
        if (fd && fd.on) fd.on(rec, focusApi(rec));
      },
    };
  }

  /* ══ 背景跟镜头的方式 ══ */
  const bg = { ox: 0, oy: 0, vx: 0, vy: 0, stirX: 0, stirY: 0, flowX: 0, flowY: 0, lx: cam.x, ly: cam.y, lz: cam.z };
  function background(dt) {
    // 镜头此刻在屏上的速度（px/秒），换成 uv/秒
    const vx = ((cam.x - bg.lx) * G) / Math.max(dt, 1e-3) / vh;
    const vy = ((cam.y - bg.ly) * G) / Math.max(dt, 1e-3) / vh;
    bg.lx = cam.x;
    bg.ly = cam.y;
    const B = 0.72; // 着色器里的空间比例：平移 Δ 个 uv × B 才是 Δ 的视觉行程
    let pan;
    if (V.bg === 'direct') pan = { x: cam.x * 0.00042, y: cam.y * 0.00042 };
    else if (V.bg === 'ratio') pan = { x: ((cam.x * G * 0.06) / vh) * B, y: ((cam.y * G * 0.06) / vh) * B };
    else if (V.bg === 'heavy') {
      // 独立的软弹簧（ω ≈ 2.2，ζ ≈ 0.9）追 cam × 0.08：起步慢、停得晚
      const k = 2.2 * 2.2;
      const c = 2 * 0.9 * 2.2;
      const tx = cam.x * 0.08;
      const ty = cam.y * 0.08;
      let left = dt;
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        left -= h;
        bg.vx += (-k * (bg.ox - tx) - c * bg.vx) * h;
        bg.vy += (-k * (bg.oy - ty) - c * bg.vy) * h;
        bg.ox += bg.vx * h;
        bg.oy += bg.vy * h;
      }
      pan = { x: ((bg.ox * G) / vh) * B, y: ((bg.oy * G) / vh) * B };
    } else {
      // stir：平移极小，速度喂进流场——起势快（70ms），消散慢（≈1.2s 内衰减殆尽）
      pan = { x: ((cam.x * G * 0.03) / vh) * B, y: ((cam.y * G * 0.03) / vh) * B };
      const fast = Math.hypot(vx, vy) > Math.hypot(bg.stirX, bg.stirY);
      const k = 1 - Math.exp(-dt / (fast ? 0.07 : 0.4));
      bg.stirX += (vx - bg.stirX) * k;
      bg.stirY += (vy - bg.stirY) * k;
      // 流痕顺着拖动方向漂走
      bg.flowX += bg.stirX * dt * 0.1;
      bg.flowY += bg.stirY * dt * 0.1;
    }
    return { pan, stir: V.bg === 'stir' ? { x: bg.stirX, y: bg.stirY } : { x: 0, y: 0 }, flow: { x: bg.flowX, y: bg.flowY } };
  }

  /* ══ 副本：DOM 池 + 弹簧 ══ */
  const recs = new Map();
  const pool = [];
  let frame = 0;
  let sceneBorn = performance.now();

  function makeEl() {
    const el = pool.pop() || document.createElement('div');
    el.className = 'frag';
    el.style.visibility = '';
    el.style.opacity = '0';
    if (!el.parentNode) drift.appendChild(el);
    return el;
  }
  function release(rec) {
    recs.delete(rec.key);
    if (rec === hoverRec) hoverRec = null;
    rec.el.classList.remove('hot');
    rec.el.style.opacity = '0';
    rec.el.style.backgroundImage = '';
    pool.push(rec.el);
  }

  /* 一块副本此刻该在哪：屏上中心、缩放、δ、透明度、档位 */
  function target(rec, t) {
    const { it, l, c, i, j, n } = rec;
    const lay = layout(scene, l, c);
    let delta = l * GAP + c * D - cam.z;
    const delta0 = delta;
    // page：其余碎片沿 Z 退远
    if (fx && fx.mode === 'page' && rec !== fx.rec) delta *= 1 + 0.75 * fx.amt;
    let s = G / delta;
    const p = lay.pos[n];
    const wx = p.x + i * lay.Pw;
    const wy = p.y + j * lay.Ph;
    const u = clamp((delta - 0.5) / 1.8, 0, 1);
    const ph = rec.ph;
    const bob = RM ? 0 : (3 + 7 * u) * G;
    let x = vw / 2 + (wx - cam.x) * s + Math.cos(t * 0.00031 * rec.w1 + ph) * bob * 0.6;
    let y = vh / 2 + (wy - cam.y) * s + Math.sin(t * 0.00042 * rec.w1 + ph) * bob;
    // grow：其余碎片被从展开处向外推开
    if (fx && fx.mode === 'grow' && rec !== fx.rec) {
      const dx = x - fx.cx;
      const dy = y - fx.cy;
      const d = Math.hypot(dx, dy) || 1;
      const push = fx.amt * 340 * G * Math.max(0.25, 1 - d / (vw * 0.9));
      x += (dx / d) * push;
      y += (dy / d) * push;
    }
    // lean：悬停那块旁边的碎片微微让开
    if (V.hover === 'lean' && hoverRec && rec !== hoverRec && !reading) {
      const dx = x - hoverRec.x;
      const dy = y - hoverRec.y;
      const d = Math.hypot(dx, dy) || 1;
      const R = 420 * G;
      if (d < R) {
        const push = (1 - d / R) * 22 * G;
        x += (dx / d) * push;
        y += (dy / d) * push;
      }
    }
    // pull：悬停的那份沿 Z 往镜头浮一点
    if (V.hover === 'pull' && rec === hoverRec && !reading) s *= 1.08;
    // 注册表里的悬停变体：让开（neighbor）/ 缩放（scale）
    const hd = hoverDef();
    if (hd && hoverRec && !reading) {
      if (hd.neighbor && rec !== hoverRec) {
        const d = hd.neighbor(rec, hoverRec, hApi());
        if (d) { x += d.dx || 0; y += d.dy || 0; }
      }
      if (hd.scale && rec === hoverRec) s *= hd.scale(rec, hApi()) || 1;
    }
    // 自定义展开：其余碎片被怎样挪动 / 缩放
    if (fx && fx.target && rec !== fx.rec) {
      const d = fx.target(rec, fx, hApi());
      if (d) { x += d.dx || 0; y += d.dy || 0; if (d.s) s *= d.s; }
    }
    return { x, y, s, delta, delta0, wx, wy };
  }

  const rectScale = (rec) => rec.s; // 弹簧此刻的缩放 = G / δ
  function lodOf(delta) {
    const b = Math.abs(Math.log(delta));
    return b < LOD_B[0] ? 0 : b < LOD_B[1] ? 1 : b < LOD_B[2] ? 2 : 3;
  }
  function alphaOf(delta) {
    const near = clamp((delta - NEAR0) / (NEAR1 - NEAR0), 0, 1);
    const far = clamp((D - delta) / (D - FAR0), 0, 1);
    const b = Math.abs(Math.log(delta));
    return near * near * far * (1 - Math.min(0.32, b * 0.28));
  }

  function sync(t) {
    frame++;
    const its = ALL[scene];
    for (let l = 0; l < L; l++) {
      let delta = mod(l * GAP - cam.z, D);
      if (delta < 1e-4) delta = D;
      if (delta < NEAR0) continue;
      const c = Math.round((cam.z + delta - l * GAP) / D);
      const lay = layout(scene, l, c);
      const s = G / delta;
      const hw = (vw / 2 + MARGIN) / s;
      const hh = (vh / 2 + MARGIN) / s;
      its.forEach((it, n) => {
        const p = lay.pos[n];
        const ax = it.cw / 2;
        const ay = it.ch / 2;
        const i0 = Math.ceil((cam.x - hw - ax - p.x) / lay.Pw);
        const i1 = Math.floor((cam.x + hw + ax - p.x) / lay.Pw);
        const j0 = Math.ceil((cam.y - hh - ay - p.y) / lay.Ph);
        const j1 = Math.floor((cam.y + hh + ay - p.y) / lay.Ph);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const key = `${scene}:${l}:${c}:${n}:${i}:${j}`;
            let rec = recs.get(key);
            if (!rec) {
              rec = { key, it, l, c, i, j, n, el: makeEl(), lod: -1, ph: hash(key, 'ph') * 6.283, w1: 0.7 + hash(key, 'w') * 0.6, jit: 0.85 + hash(key, 'k') * 0.3, born: t, vx: 0, vy: 0, vs: 0, rx: 0, ry: 0, vrx: 0, vry: 0, fx: 0, fy: 0 };
              rec.el.style.width = `${it.cw}px`;
              rec.el.style.height = `${it.ch}px`;
              rec.el.style.setProperty('--m', `${it.M}px`);
              rec.el.dataset.key = key;
              const tg = target(rec, t);
              rec.x = tg.x;
              rec.y = tg.y;
              rec.s = tg.s;
              recs.set(key, rec);
            }
            rec.seen = frame;
          }
      });
    }
    // 正在读的那块即使出了视口也留着（收回时要落回它）
    for (const rec of recs.values()) if (rec.seen !== frame && !(reading && reading.rec === rec)) release(rec);
  }

  /* 弹簧：近处 k 大、阻尼比高；远处 k 小、欠阻尼（拖得久、超调） */
  function step(rec, tg, dt, tilt) {
    const u = clamp((tg.delta - 0.5) / 1.8, 0, 1);
    const k = lerp(320, 46, u) * rec.jit;
    const z = lerp(0.92, 0.36, u);
    const c = 2 * z * Math.sqrt(k);
    if (RM) {
      rec.x = tg.x; rec.y = tg.y; rec.s = tg.s; rec.rx = tilt.x; rec.ry = tilt.y;
      return;
    }
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      rec.vx += (-k * (rec.x - tg.x) - c * rec.vx) * h;
      rec.vy += (-k * (rec.y - tg.y) - c * rec.vy) * h;
      rec.vs += (-k * (rec.s - tg.s) - c * rec.vs) * h;
      rec.x += rec.vx * h;
      rec.y += rec.vy * h;
      rec.s += rec.vs * h;
      // 倾斜：固定一组中等偏软的弹簧
      rec.vrx += (-140 * (rec.rx - tilt.x) - 16 * rec.vrx) * h;
      rec.vry += (-140 * (rec.ry - tilt.y) - 16 * rec.vry) * h;
      rec.rx += rec.vrx * h;
      rec.ry += rec.vry * h;
    }
  }

  function draw(t, dt) {
    const sceneFade = clamp((t - sceneBorn) / 900, 0, 1);
    const hd = hoverDef();
    for (const rec of recs.values()) {
      const tg = target(rec, t);
      // lean：悬停那块朝光标倾斜（最多 4.5°）
      let tilt = { x: 0, y: 0 };
      if (V.hover === 'lean' && rec === hoverRec && !reading) {
        const nx = clamp((mouse.x - rec.x) / ((rec.it.w * rec.s) / 2), -1, 1);
        const ny = clamp((mouse.y - rec.y) / ((rec.it.h * rec.s) / 2), -1, 1);
        tilt = { x: -ny * 4.5, y: nx * 4.5 };
      }
      if (hd && hd.tilt && rec === hoverRec && !reading) tilt = hd.tilt(rec, hApi()) || tilt;
      step(rec, tg, dt, tilt);
      let lod = lodOf(tg.delta);
      if (V.hover === 'pull' && rec === hoverRec && !reading) lod = 0;
      if (hd && hd.clear && rec === hoverRec && !reading) lod = 0;
      if (fx && fx.mode === 'grow' && rec !== fx.rec) lod = Math.min(3, lod + Math.round(fx.amt));
      if (fx && fx.mode === 'pixel' && rec === fx.rec && fx.lodForce != null) lod = fx.lodForce;
      if (hd && hd.lod) lod = clamp(Math.round(hd.lod(rec, lod, hApi())), 0, 3);
      if (fx && fx.lod) lod = clamp(Math.round(fx.lod(rec, lod, fx)), 0, 3);
      // 聚焦：周围的碎片往外让开一点、退一档焦、暗下来——世界为它腾出一块地方。
      // 悬停的倾斜与展开的长大里那点「邻居让位」是同一个动作，这里是它的第三种用法。
      let fy = null;
      if (focusRec && rec !== focusRec && focusOn > 0.02) {
        const fd = schemeFocus();
        const r0 = rectOf(rec);
        const r1 = rectOf(focusRec);
        const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2);
        const dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const push = (1 - Math.min(1, d / (vw * 0.75))) * 54 * G * focusOn;
        fy = (fd && fd.yield && fd.yield(rec, focusOn, focusApi(focusRec))) || {};
        const k = RM ? 1 : 0.16;
        rec.fx += ((dx / d) * push + (fy.dx || 0) - rec.fx) * k;
        rec.fy += ((dy / d) * push + (fy.dy || 0) - rec.fy) * k;
        lod = clamp(lod + (fy.lod != null ? fy.lod : Math.round(focusOn)), 0, 3);
      } else if (rec.fx || rec.fy) {
        const k = RM ? 1 : 0.16;
        rec.fx -= rec.fx * k;
        rec.fy -= rec.fy * k;
        if (Math.abs(rec.fx) + Math.abs(rec.fy) < 0.3) rec.fx = rec.fy = 0;
      }
      if (lod !== rec.lod) {
        rec.lod = lod;
        rec.el.style.backgroundImage = `url(${rec.it.lod[lod]})`;
        rec.el.dataset.lod = lod;
      }
      const born = clamp((t - rec.born) / 700, 0, 1);
      const stagger = clamp(sceneFade * 1.6 - (tg.delta0 / D) * 0.6, 0, 1);
      let a = alphaOf(tg.delta) * born * stagger;
      if (V.hover === 'pull' && rec === hoverRec && !reading) a = Math.max(a, 0.96);
      if (fx && rec !== fx.rec && fx.mode !== 'fly') a *= 1 - 0.35 * fx.amt;
      if (hd && hd.alpha) a = clamp(hd.alpha(rec, a, hApi()), 0, 1);
      if (fx && fx.alpha) a = clamp(fx.alpha(rec, a, fx), 0, 1);
      if (fy) a *= (fy.alpha != null ? fy.alpha : 1 - 0.3 * focusOn);
      const el = rec.el;
      const w = rec.it.cw;
      const h = rec.it.ch;
      const tiltT = Math.abs(rec.rx) + Math.abs(rec.ry) > 0.01 ? ` perspective(900px) rotateX(${rec.rx.toFixed(2)}deg) rotateY(${rec.ry.toFixed(2)}deg)` : '';
      el.style.transform = `translate3d(${(rec.x + rec.fx - w / 2).toFixed(1)}px,${(rec.y + rec.fy - h / 2).toFixed(1)}px,0) scale(${Math.max(0.01, rec.s).toFixed(4)})${tiltT}`;
      // 悬停那块只往前浮一点（约 0.4 层），不越过真正更近的层
      el.style.zIndex = String(Math.round((D - tg.delta0) * 1000) + (rec === hoverRec ? 400 : 0));
      const ao = a.toFixed(3);
      if (el.style.opacity !== ao) el.style.opacity = ao;
      el.style.pointerEvents = a > 0.25 ? '' : 'none';
    }
    placeFocusUI();
  }

  /* ══ 主循环 ══ */
  let last = performance.now();
  const T0 = last;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fly) {
      const p = clamp((now - fly.t0) / fly.dur, 0, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      cam.x = lerp(fly.from.x, fly.to.x, e);
      cam.y = lerp(fly.from.y, fly.to.y, e);
      cam.z = lerp(fly.from.z, fly.to.z, e);
      zT = cam.z;
      if (p >= 1) { const f = fly; fly = null; f.done && f.done(); }
    } else {
      if (!drag && (vel.x || vel.y)) {
        cam.x += vel.x * dt * 1000;
        cam.y += vel.y * dt * 1000;
        const k = Math.exp(-dt * 1000 / 340);
        vel.x *= k;
        vel.y *= k;
        if (Math.hypot(vel.x, vel.y) < 0.004) vel.x = vel.y = 0;
      }
      if (pend.x || pend.y) {
        const k = 1 - Math.exp(-dt * 1000 / 110);
        cam.x += pend.x * k;
        cam.y += pend.y * k;
        pend.x -= pend.x * k;
        pend.y -= pend.y * k;
        if (Math.abs(pend.x) + Math.abs(pend.y) < 0.2) pend.x = pend.y = 0;
      }
      cam.z += (zT - cam.z) * (RM ? 1 : 1 - Math.exp(-dt * 1000 / 170));
    }
    if (fx) {
      fx.amt += (fx.goal - fx.amt) * (RM ? 1 : 1 - Math.exp(-dt * 1000 / (fx.goal ? 150 : 220)));
      if (!fx.goal && fx.amt < 0.01 && !reading) fx = null;
    }
    dim += (dimT - dim) * (1 - Math.exp(-dt * 1000 / 220));
    focusOn += ((focusRec ? 1 : 0) - focusOn) * (RM ? 1 : 1 - Math.exp(-dt * 1000 / 260));
    if (!focusRec && focusOn < 0.01) focusOn = 0;
    const fd = schemeFocus();
    if (fd && fd.tick) fd.tick(dt, now, focusApi(focusRec));
    const hd = hoverDef();
    if (hd && hd.tick) hd.tick(dt, now, hApi());
    sync(now);
    draw(now, dt);
    const env = { t: now, dt, cam, G, vw, vh, D, GAP, L, NEAR0, MARGIN, alphaOf, lodOf, RM, scene };
    deco.sync(now, env);
    deco.draw(now, dt, env);
    const b = background(dt);
    if (light) light.draw({ t: (now - T0) / 1000, pan: b.pan, zoom: cam.z, stir: b.stir, flow: b.flow, mouse, dim, dt: dt * 1000 });
    veil.style.opacity = (dim * 0.55).toFixed(3);
    requestAnimationFrame(tick);
  }

  /* ══ 输入 ══ */
  let drag = null;
  let suppress = false;
  const pointers = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    if (reading || fly) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
      return;
    }
    vel.x = vel.y = 0;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, s: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    suppress = false;
  });
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      zT += Math.log(d / pinch.d) * 1.1;
      cam.x -= (mx - pinch.mx) / G;
      cam.y -= (my - pinch.my) / G;
      pinch = { d, mx, my };
      suppress = true;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
      drag.moved = true;
      root.classList.add('dragging');
      setHover(null);
      try { stage.setPointerCapture(e.pointerId); } catch {}
    }
    if (drag.moved) {
      cam.x -= (e.clientX - drag.lx) / G;
      cam.y -= (e.clientY - drag.ly) / G;
      drag.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      while (drag.s.length > 2 && e.timeStamp - drag.s[0].t > 90) drag.s.shift();
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  function up(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppress = true;
      const a = drag.s[0];
      const b = drag.s[drag.s.length - 1];
      const dt = Math.max(16, b.t - a.t);
      if (!RM && e.timeStamp - b.t < 60) {
        vel.x = -(b.x - a.x) / dt / G;
        vel.y = -(b.y - a.y) / dt / G;
      }
      root.classList.remove('dragging');
    }
    drag = null;
  }
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  /* 滚轮 / 触控板捏合：沿 Z 推拉；Shift + 滚轮或横向滚动：平移 */
  stage.addEventListener('wheel', (e) => {
    if (reading || fly) return;
    e.preventDefault();
    let dy = e.deltaY;
    let dx = e.deltaX;
    if (e.deltaMode === 1) { dy *= 32; dx *= 32; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (Math.abs(dx) > Math.abs(dy) * 1.2) { pend.x += dx / G; return; }
    zT += dy * (e.ctrlKey ? 0.012 : 0.0016);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (reading || fly || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('#vpanel')) return;
    if (e.key === 'Escape' && focusRec) { setFocus(null); return; }
    const st = (e.shiftKey ? 560 : 280) / G;
    const map = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
    if (map[e.key]) {
      e.preventDefault();
      pend.x += map[e.key][0];
      pend.y += map[e.key][1];
    } else if (e.key === '+' || e.key === '=') zT += 0.5;
    else if (e.key === '-') zT -= 0.5;
    else if ({ 1: 'essay', 2: 'moment', 3: 'project' }[e.key]) setScene({ 1: 'essay', 2: 'moment', 3: 'project' }[e.key]);
  });

  /* ══ 悬停 ══
     pull：不论在哪层，那份立刻跳到清晰档，并沿 Z 往镜头浮一点（弹簧）
     sweep：一道像素光带沿 14° 扫过卡面，边缘提亮（CSS）
     lean：朝光标倾 3–5°，邻近碎片微微让开 */
  function setHover(rec) {
    if (rec === hoverRec) return;
    const hd = hoverDef();
    if (hoverRec) {
      hoverRec.el.classList.remove('hot');
      if (hd && hd.leave) hd.leave(hoverRec, hApi());
    }
    hoverRec = rec;
    if (rec) {
      rec.el.classList.remove('hot');
      void rec.el.offsetWidth; // 让 sweep 的扫光每次重新开始
      rec.el.classList.add('hot');
      if (hd && hd.enter) hd.enter(rec, hApi());
    }
  }
  drift.addEventListener('pointerover', (e) => {
    if (drag?.moved || reading || fly || focusRec || e.pointerType === 'touch') return;
    const el = e.target.closest('.frag');
    const rec = el && recs.get(el.dataset.key);
    if (!rec || +el.style.opacity <= 0.25) return setHover(null);
    // 默认只对够清楚的那几档开放（粗块上做悬停没有意义）；变体可以用 gate 自己定规矩
    const hd = hoverDef();
    const ok = hd && hd.gate ? hd.gate(rec, hApi()) : V.hover === 'pull' || rec.lod <= 1;
    setHover(ok ? rec : null);
  });
  drift.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.frag')) setHover(null);
  });

  /* ══ 点开 ══
     先聚焦、再点一次才展开——见上面「聚焦」一节。聚焦态下不开悬停：
     它已经比悬停更进一层了，再叠一层轻反馈只会互相打架。

     fly：镜头穿过景深飞到那块，它一路从像素变清楚，然后从它的矩形展开
     grow：不动镜头，卡片从原位长大成阅读尺寸，周围碎片被弹簧推开、更虚，收回时回流
     pixel：卡片先一档档变粗，再在阅读尺寸上一档档变清楚——跳焦的反向
     page：卡片朝镜头滑近成一页纸，其余碎片沿 Z 退远 */
  const rectOf = (rec) => ({ left: rec.x - (rec.it.w * rec.s) / 2, top: rec.y - (rec.it.h * rec.s) / 2, width: rec.it.w * rec.s, height: rec.it.h * rec.s });

  function openRec(rec) {
    vel.x = vel.y = pend.x = pend.y = 0;
    const wasHover = rec === hoverRec;
    setHover(null);
    reading = { rec };
    root.classList.add('reading');
    const opts = { mode: V.open, lods: rec.it.lod, getRect: () => (recs.get(rec.key) ? rectOf(rec) : null) };

    // 注册表里的展开变体：把整个开合过程交给它
    const od = openDef();
    if (od && od.run) {
      curOpen = od;
      curApi = openApi(rec, opts);
      od.run(curApi);
      return;
    }
    curOpen = null;
    curApi = null;

    if (V.open === 'fly') {
      const tg = target(rec, performance.now());
      const to = { x: tg.wx, y: tg.wy, z: rec.l * GAP + rec.c * D - 1 };
      const dist = Math.hypot(((to.x - cam.x) * G) / vw, to.z - cam.z);
      fly = {
        t0: performance.now(),
        dur: RM ? 0 : clamp(520 + dist * 260, 560, 900),
        from: { ...cam },
        to,
        done: () => {
          const w = rec.it.w * G;
          const h = rec.it.h * G;
          const rect = { left: vw / 2 - w / 2, top: vh / 2 - h / 2, width: w, height: h };
          rec.el.style.visibility = 'hidden';
          reader.open(rec.it, rec.it.k, rect, opts);
        },
      };
      return;
    }

    // 其余三种：镜头不动
    const r = rectOf(rec);
    fx = { mode: V.open, rec, amt: 0, goal: 1, cx: rec.x, cy: rec.y, lodForce: null };
    if (V.open === 'pixel') {
      // 先一档档变粗（从它此刻的档位起，每 80ms 粗一档），粗到底再展开
      const startLod = wasHover ? 0 : rec.lod;
      let k = startLod;
      fx.lodForce = k;
      const timer = setInterval(() => {
        k++;
        if (k <= 3) { fx.lodForce = k; return; }
        clearInterval(timer);
        rec.el.style.visibility = 'hidden';
        reader.open(rec.it, rec.it.k, rectOf(rec), opts);
      }, RM ? 0 : 80);
      return;
    }
    rec.el.style.visibility = 'hidden';
    reader.open(rec.it, rec.it.k, r, opts);
  }

  drift.addEventListener('click', (e) => {
    if (suppress || reading || fly) return;
    const el = e.target.closest('.frag');
    const rec = el && recs.get(el.dataset.key);
    if (!rec) return;
    // 第一次点 = 聚焦；已经聚焦的那块再点一次才展开
    if (focusRec === rec) openRec(rec);
    else setFocus(rec);
  });
  /* 点空处退出聚焦 */
  stage.addEventListener('click', (e) => {
    if (suppress || reading || fly || !focusRec) return;
    if (e.target.closest && e.target.closest('.frag')) return;
    setFocus(null);
  });

  /* ══ 场景 ══ */
  const tabs = [...document.querySelectorAll('.scenes button')];
  /* 镜头停在 z 时，落在焦平面（δ 最接近 1）的那一层的第一块 */
  function focusPos(name, z) {
    let best = null;
    for (let l = 0; l < L; l++) {
      let delta = mod(l * GAP - z, D);
      if (delta < 1e-4) delta = D;
      if (!best || Math.abs(delta - 1) < Math.abs(best.delta - 1)) best = { l, delta };
    }
    const c = Math.round((z + best.delta - best.l * GAP) / D);
    return layout(name, best.l, c).pos[0];
  }
  function setScene(name, { instant = false } = {}) {
    if (name === scene || reading) return;
    setFocus(null);
    setHover(null);
    // 旧场景的碎片向镜头这边涌过来、散开
    for (const rec of recs.values()) {
      const el = rec.el;
      const tr = el.style.transform;
      el.style.zIndex = '0';
      recs.delete(rec.key);
      el.classList.remove('hot');
      el.style.pointerEvents = 'none';
      el.animate([{ opacity: el.style.opacity, transform: tr }, { opacity: 0, transform: `${tr} scale(1.35)` }], { duration: RM || instant ? 0 : 520, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
        .finished.then((an) => {
          an.cancel();
          el.style.opacity = '0';
          el.style.backgroundImage = '';
          pool.push(el);
        });
    }
    scene = name;
    root.dataset.scene = name;
    tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === name)));
    if (light) light.setScene(name, instant);
    deco.setScene(name);
    sceneBorn = performance.now() + (instant ? 0 : 180);
    // 镜头向前涌一截，新场景的碎片从远处显出来
    if (!RM && !instant) zT += 0.6;
    if (instant) cam.z = zT;
    const p = focusPos(name, zT);
    // 直接跳过去：不同场景的平面互不相干，飞过去的路上没有东西可看
    cam.x = p.x + 150;
    cam.y = p.y + 70;
    bg.lx = cam.x;
    bg.ly = cam.y;
    if (V.bg === 'heavy') { bg.ox = cam.x * 0.08; bg.oy = cam.y * 0.08; }
    syncPanel();
  }
  tabs.forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
  document.getElementById('brand').addEventListener('click', (e) => e.preventDefault());

  addEventListener('resize', () => {
    vw = innerWidth;
    vh = innerHeight;
    G = clamp(vw / 1200, 0.5, 1);
    if (light) light.resize();
  });

  /* ══ 变体面板（原型调试用）：点选即换地址重载，场景保留 ══ */
  const BASE = {
    bg: [['heavy', '重弹簧'], ['stir', '搅动'], ['direct', '直连'], ['ratio', '低比']],
    look: [['frost', '磨砂'], ['glow', '漏光'], ['slab', '厚玻璃'], ['print', '相纸']],
    hover: [['pull', '拉近'], ['sweep', '扫光'], ['lean', '倾斜']],
    open: [['fly', '飞入'], ['grow', '长大'], ['pixel', '跳焦'], ['page', '成页']],
    deco: [['none', '无']],
  };
  const from = (kind) => reg.names[kind].map((n) => [n, reg[kind][n].label || n]);
  const GROUPS = [
    ['scheme', '方案', [['', '无']].concat(from('schemes'))],
    ['bg', '背景', BASE.bg],
    ['look', '外观', BASE.look.concat(from('looks'))],
    ['hover', '悬停', BASE.hover.concat(from('hovers'))],
    ['open', '展开', BASE.open.concat(from('opens'))],
    ['deco', '装饰', BASE.deco.concat(from('decos'))],
  ];
  const panel = document.createElement('aside');
  panel.id = 'vpanel';
  panel.setAttribute('aria-label', '变体');
  let collapsed = true;
  try { collapsed = localStorage.getItem('drift.vpanel') !== 'open'; } catch {}
  panel.innerHTML = `<button type="button" class="vp-toggle" aria-expanded="${!collapsed}">变体</button><div class="vp-body">${GROUPS.map(([k, label, opts]) => `<div class="vp-row"><span>${label}</span>${opts.map(([v, t]) => `<a href="#" data-k="${k}" data-v="${v}" aria-current="${V[k] === v}">${t}</a>`).join('')}</div>`).join('')}</div>`;
  panel.classList.toggle('open', !collapsed);
  document.body.appendChild(panel);
  panel.querySelector('.vp-toggle').addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    panel.querySelector('.vp-toggle').setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('drift.vpanel', open ? 'open' : 'closed'); } catch {}
  });
  function syncPanel() {
    panel.querySelectorAll('a[data-k]').forEach((a) => {
      const p = new URLSearchParams(location.search);
      p.set(a.dataset.k, a.dataset.v);
      p.set('scene', scene);
      // 单轴只在「无方案」下才有意义：方案会把它盖掉，所以点了单轴就退出方案
      if (V.scheme && ['look', 'hover', 'open'].includes(a.dataset.k)) p.delete('scheme');
      a.href = `?${p}`;
    });
  }
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-k]');
    if (!a) return;
    e.preventDefault();
    location.search = a.getAttribute('href').slice(1);
  });

  if (q.get('scene')) setScene(q.get('scene'), { instant: true });
  syncPanel();
  root.classList.add('ready');
  requestAnimationFrame(tick);

  window.__drift = { cam, get zT() { return zT; }, set zT(v) { zT = v; }, recs, setScene, vel, V, get G() { return G; }, get hover() { return hoverRec; }, get fx() { return fx; }, bg, deco, reg, scheme: SCHEME, setFocus, openRec, get focus() { return focusRec; }, get focusOn() { return focusOn; }, layout: (l, c) => layout(scene, l, c), get scene() { return scene; } };
})();
