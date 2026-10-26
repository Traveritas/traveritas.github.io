/* ─────────────────────────────────────────────────────────────
   拾得 · 原型：漫游里偶尔会遇见一件小东西。

   判定：镜头每往前越过一层（GAP），远处就生成一层新的窗——同一刻掷一次。
     只算往前推到过的最远处（每个场景各记一个），退回去再推过来不重掷；
     过渡（切视图、换场景、飞过去）进行中不掷，只把基线挪到当前。
     从最稀有的往下逐件掷 1/odds，中了第一件就停。
   出现：和窗走同一套景深——从最远那一层浮上来，离焦平面越远越像素化，经过焦平面时清楚，再从身边糊过去。
   拾起：只有它在焦平面附近（|ln δ| < 0.16，触屏放宽到 0.24）时点它才算收下；
     不在焦平面时点它，镜头往前推到让它落在焦平面（和窗一样）；错过了就没了。

   挂在 wander 原型上（只读 window.__w，不改那边的文件）。

   地址参数：?luck=N 把每次判定的机会放大 N 倍（看效果用）· ?dev=1 打开调试条（召来某一件、清空）
            ?ink=scene|white|tier 外壳线色（默认 scene：取当前夜色的反光色、再提亮一点）
   ───────────────────────────────────────────────────────────── */
(async () => {
  'use strict';
  while (!window.__w) await new Promise((r) => setTimeout(r, 50));
  const W = window.__w;
  const ITEMS = window.CollectItems;
  /* ?shell=contour|text|moire|agate|glass|window：换一种外壳（shells.js）；不给就是放射细线 */
  const SHELL = new URLSearchParams(location.search).get('shell') || '';
  const O = Object.assign({}, window.CollectOrnament, (window.CollectShells || {})[SHELL] || {});
  const BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const RARE_FIRST = [...ITEMS].sort((a, b) => b.odds - a.odds);

  const q = new URLSearchParams(location.search);
  const LUCK = q.has('luck') ? Math.max(0, +q.get('luck') || 0) : 1; // ?luck=0：不掷（截图用）
  const DEV = q.has('dev');
  const INK = q.get('ink') || 'scene';
  const TILT = q.get('tilt') === '1'; // ?tilt=1：外壳整体倾斜成一只浅碗（另一种表现前后的办法）
  const SHEET = q.get('sheet') === '1'; // ?sheet=1：每层底下垫一片很淡的树脂片（默认不垫）
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = matchMedia('(pointer: coarse)').matches;

  /* 和 wander.js 同一套景深常数 */
  const D = 2.5;
  const GAP = 0.5;
  const NEAR0 = 0.42;
  const NEAR1 = 0.72;
  const FAR0 = 2.05;
  const LOD_B = [0.17, 0.42, 0.8];
  const LODS = [1, 6, 12, 24];
  const WINDOW = COARSE ? 0.24 : 0.16;
  /* 停一下：稀有度达到这个门槛的东西经过焦平面时，镜头在它面前停一小会儿，免得一滚就错过。
     门槛以后放进设置；原型里 ?hold=N 改（0 = 都不停），默认 1/1000 起 */
  const HOLD_AT = q.has('hold') ? Math.max(0, +q.get('hold') || 0) : 1000;
  const HOLD_MS = 1800;
  const OBJ_R = 54; // 物件那一层的半径（世界 px）

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
  const lodOf = (delta) => {
    const b = Math.abs(Math.log(delta));
    return b < LOD_B[0] ? 0 : b < LOD_B[1] ? 1 : b < LOD_B[2] ? 2 : 3;
  };
  const alphaOf = (delta) => {
    const near = clamp((delta - NEAR0) / (NEAR1 - NEAR0), 0, 1);
    const far = clamp((D - delta) / (D - FAR0), 0, 1);
    return near * near * far * (1 - Math.min(0.32, Math.abs(Math.log(delta)) * 0.28));
  };
  const fmtOdds = (n) => `1/${Math.round(n).toLocaleString('en-US')}`;
  const now = () => W.clock.t;

  let vw = innerWidth;
  let vh = innerHeight;
  let G = clamp(vw / 1200, 0.5, 1);
  const DPR = Math.min(2, devicePixelRatio || 1);
  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; G = clamp(vw / 1200, 0.5, 1); });
  const mouse = { x: vw / 2, y: vh / 2 };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  /* ══ 存档：localStorage，一个对象 ══ */
  const KEY = 'collect.v1';
  let store = { items: {}, rolls: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.items) store = Object.assign(store, s); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };

  /* ══ 占位物件的图：画一次 ══ */
  const ART = {};
  for (const it of ITEMS) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.lineWidth = 2.2;
    c.lineJoin = c.lineCap = 'round';
    it.art(c, 256);
    ART[it.id] = cv;
  }
  /* 物件自己的颜色：图里不透明像素的平均（玛瑙带取它当底色） */
  const TINT = {};
  for (const it of ITEMS) {
    const d = ART[it.id].getContext('2d').getImageData(0, 0, 256, 256).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 160) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    TINT[it.id] = n ? [r / n, g / n, b / n].map(Math.round).join(' ') : '170 176 190';
  }
  const envOf = (rec, lod) => ({ ink: inkOf(rec.orn.tier), light: lightScene, tint: TINT[rec.item.id], glass: glassRGB, item: rec.item, lod });

  /* ══ 线色 ══ */
  const TIER_INK = ['205 212 222', '200 214 226', '212 208 232', '226 214 236', '238 226 214', '250 242 226'];
  /* scene：浅色的夜（随笔）里白线会化进底色，改用这一夜的边色（冷灰蓝）、再淡一点；深色的夜里用反光色提亮 */
  let sceneInk = '230 236 242';
  let lightScene = false;
  let hushRGB = '4 6 12';
  let glassRGB = '250 251 253';
  const rgbOf = (v) => v.split(/[\s,]+/).map(Number);
  const hexRGB = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function readInk() {
    const sp = spaceOf(W.scene) || document.documentElement;
    const cs = getComputedStyle(sp);
    const bg = hexRGB(cs.getPropertyValue('--bg').trim() || '#0d1524');
    lightScene = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 > 0.55;
    // 最稀有那两档靠近时，周围退进这一夜的底色里（浅夜变白、深夜变暗）
    hushRGB = lightScene ? bg.map((x) => Math.round(lerp(x, 255, 0.35))).join(' ') : '4 6 12';
    glassRGB = rgbOf(cs.getPropertyValue('--glass').trim() || '16 26 42').join(' ');
    const v = cs.getPropertyValue(lightScene ? '--edge' : '--sheen').trim();
    if (!v) return;
    sceneInk = rgbOf(v).map((x) => Math.round(lightScene ? x : lerp(x, 255, 0.45))).join(' ');
  }
  const inkOf = (tier) => (INK === 'white' ? '255 255 255' : INK === 'tier' ? TIER_INK[tier] : sceneInk);
  const spaceOf = (s) => document.querySelector(`#stage .space[data-scene="${s}"]`);

  /* ══ 一件「正在出现」的东西 ══ */
  const live = new Set();
  function makeLayer(parent, S) {
    const el = document.createElement('div');
    el.className = 'cx-l';
    el.style.width = el.style.height = `${S}px`;
    const cv = document.createElement('canvas');
    el.appendChild(cv);
    parent.appendChild(el);
    return { el, cv, ctx: cv.getContext('2d'), S, lod: -1, res: 0, _t: '', _a: '', _z: '' };
  }
  function spawn(item, ahead = D - GAP / 2, at = null) {
    if (live.size >= 4) return;
    const parent = spaceOf(W.scene);
    if (!parent) return;
    const orn = O.build(item);
    const rec = {
      item, orn, scene: W.scene, parent,
      z: W.cam.z + ahead,
      wx: W.cam.x + (at ? at.x : (Math.random() * 2 - 1) * 0.3) * (vw / G),
      wy: W.cam.y + (at ? at.y : (Math.random() * 2 - 1) * 0.24) * (vh / G),
      born: now(), ph: Math.random() * 6.283, out: 0, taken: 0, gone: false,
      layers: [], obj: null, hush: orn.tier >= 4,
    };
    // 外层先挂（在 DOM 里靠前），z-index 另外按深度给
    for (let i = orn.layers.length - 1; i >= 0; i--) {
      const L = orn.layers[i];
      rec.layers[i] = Object.assign(makeLayer(parent, Math.ceil((L.rOut / 0.96) * 2)), { L });
    }
    rec.obj = makeLayer(parent, OBJ_R * 2);
    rec.obj.el.classList.add('cx-o');
    rec.obj.el.setAttribute('aria-label', item.name);
    bindTap(rec);
    live.add(rec);
    if (DEV) devLog(`遇见 ${item.name}（${fmtOdds(item.odds)}）`);
    return rec;
  }
  function drop(rec) {
    rec.gone = true;
    for (const l of rec.layers) l.el.remove();
    rec.obj.el.remove();
    live.delete(rec);
  }

  /* ══ 判定 ══ */
  const hw = {}; // 每个场景往前推到过的最远一层
  let lastMode = '';
  let lastScene = '';
  function roll() {
    store.rolls++;
    for (const it of RARE_FIRST) {
      if (Math.random() < LUCK / it.odds) { spawn(it); break; }
    }
  }
  function judge() {
    const k = Math.floor(W.cam.z / GAP);
    const s = W.scene;
    if (W.mode !== 'explore' || now() < W.busy) {
      if (hw[s] == null || k > hw[s]) hw[s] = k;
      return;
    }
    if (hw[s] == null) { hw[s] = k; return; }
    let n = 0;
    while (k > hw[s] && n < 6) { hw[s]++; n++; roll(); }
    if (k > hw[s]) hw[s] = k; // 一下子飞得太远：只掷前几层
    if (n) { save(); if (DEV) devStat(); }
  }

  /* ══ 拾起 ══ */
  const RANGE = (rec) => Math.abs(Math.log(rec.z - W.cam.z));
  function bindTap(rec) {
    const el = rec.obj.el;
    let down = null;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 10) tap(rec);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(rec); } });
  }
  function tap(rec) {
    if (rec.taken || rec.gone) return;
    if (RANGE(rec) < WINDOW) take(rec);
    else W.zT = rec.z - 1; // 推到焦平面
  }
  function take(rec) {
    rec.taken = now();
    const it = rec.item;
    const s = store.items[it.id] || (store.items[it.id] = { n: 0, first: Date.now() });
    s.n++;
    s.last = Date.now();
    save();
    const p = rec.obj;
    note(rec, p.x, p.y);
    renderPocket(true);
    if (!panel.hidden) renderList();
    if (DEV) devLog(`拾起 ${it.name}`);
  }

  /* ══ 每帧 ══ */
  const pocket = document.getElementById('cx-pocket');
  const hushEl = document.getElementById('cx-hush');
  function pocketXY() {
    const r = pocket.getBoundingClientRect();
    return { x: r.left + 14, y: r.top + r.height / 2 };
  }
  function placeLayer(l, x, y, s, a, z, lod, draw, extra = '') {
    // 分辨率：清楚的一档按屏幕像素画（焦平面附近 s≈G，取一个固定值，免得每帧重新分配画布），其余按失焦倍率降采样
    const res = lod === 0 ? Math.ceil(l.S * G * DPR * 1.15) : Math.max(4, Math.ceil(l.S / LODS[lod]));
    let dirty = false;
    if (res !== l.res) { l.res = res; l.cv.width = l.cv.height = res; dirty = true; }
    if (lod !== l.lod) { l.lod = lod; l.el.dataset.lod = lod; dirty = true; }
    draw(l, res, dirty);
    const tr = `translate3d(${(x - l.S / 2).toFixed(1)}px,${(y - l.S / 2).toFixed(1)}px,0) scale(${Math.max(0.01, s).toFixed(4)})${extra}`;
    if (tr !== l._t) { l.el.style.transform = tr; l._t = tr; }
    const as = a.toFixed(3);
    if (as !== l._a) { l.el.style.opacity = as; l.el.style.visibility = a > 0.004 ? '' : 'hidden'; l._a = as; }
    const zs = String(z);
    if (zs !== l._z) { l.el.style.zIndex = zs; l._z = zs; }
    l.x = x;
    l.y = y;
    l.s = s;
  }
  let prevT = now();
  let hush = 0;
  function frame() {
    const t = now();
    const dt = clamp((t - prevT) / 1000, 0, 0.05);
    prevT = t;
    if (W.mode !== lastMode || W.scene !== lastScene) { lastMode = W.mode; lastScene = W.scene; readInk(); }
    judge();

    let hushGoal = 0;
    let hushAt = null;
    for (const rec of [...live]) {
      const cam = W.cam;
      // 离开漫游 / 换了场景：淡出
      const away = W.mode !== 'explore' || W.scene !== rec.scene;
      rec.out = clamp(rec.out + (away ? dt / 0.35 : 0), 0, 1);
      const dObj = rec.z - cam.z;
      if (rec.out >= 1 || (!rec.taken && dObj < NEAR0 - 0.02)) { drop(rec); continue; }
      const born = clamp((t - rec.born) / 900, 0, 1);
      const focus = clamp(1 - Math.abs(Math.log(dObj)) / 0.5, 0, 1);
      // 停一下：镜头要越过它的焦平面时，把推拉的目标按在焦平面上，停 HOLD_MS；之后照常
      if (HOLD_AT && rec.item.odds >= HOLD_AT && !rec.taken && !rec.out && W.mode === 'explore') {
        const zF = rec.z - 1;
        if (!rec.held && W.zT >= zF - 0.01) { rec.held = t; if (DEV) devLog(`停在 ${rec.item.name} 面前`); }
        if (rec.held && t - rec.held < HOLD_MS && W.zT > zF) W.zT = zF;
      }
      const T = rec.orn.T;
      const c = lerp(T.base, 1, inOut(focus));
      // 生长纹：远处只是一粒种子，往焦平面靠近时一点点长出来；过了焦平面就不再缩回去
      const ahead = dObj > 1 ? clamp(1 - (dObj - 1) / 1.15, 0, 1) : 1;
      const cg = lerp(0.1, 1, inOut(ahead));
      const tk = rec.taken ? clamp((t - rec.taken) / 1500, 0, 1) : 0;
      if (tk >= 1) { drop(rec); continue; }
      const bob = RM ? 0 : 5 * G;
      const bx = Math.cos(t * 0.00027 + rec.ph) * bob * 0.6;
      const by = Math.sin(t * 0.00036 + rec.ph) * bob;
      const ink = inkOf(rec.orn.tier);
      const fade = born * (1 - rec.out);

      // 外壳各层
      const nL = rec.layers.length;
      rec.layers.forEach((l, i) => {
        const L = l.L;
        const delta = Math.max(0.05, dObj + L.dz);
        const s0 = G / delta;
        const mx = (mouse.x - vw / 2) / vw;
        const my = (mouse.y - vh / 2) / vh;
        const px = -mx * L.dz * 420 * G;
        const py = -my * L.dz * 320 * G;
        let x = vw / 2 + (rec.wx - cam.x) * s0 + bx + px;
        let y = vh / 2 + (rec.wy - cam.y) * s0 + by + py;
        let extra = '';
        if (TILT) {
          // 倾斜：整朵外壳像一只浅碗，朝镜头微微仰起，跟着指针转一点；外圈沿法线往下沉
          const ax = 0.62 + my * 0.3;
          const ay = mx * 0.5;
          const hgt = -L.rank * 0.32 * rec.orn.R;
          x += hgt * Math.sin(ay) * s0;
          y += -hgt * Math.sin(ax) * s0;
          extra = ` perspective(${(1400).toFixed(0)}px) rotateX(${ax.toFixed(3)}rad) rotateY(${ay.toFixed(3)}rad)`;
        }
        let s = s0;
        let a = alphaOf(delta) * fade;
        let spin = 0;
        let cc = c;
        if (tk) { // 收拢：外层先合
          const k = clamp(tk * 1.7 - ((nL - 1 - i) / nL) * 0.55, 0, 1);
          const e = k * k;
          s *= 1 - 0.82 * e;
          a *= 1 - k;
          spin = e * 1.4 * Math.sign(L.speed || 1);
          cc = 1;
        }
        if (L.grow && !tk) cc = cg;
        // 越往后越淡、越虚
        a *= lerp(1, 0.5, L.rank * (L.sharp ? 0.4 : 1)); // 写着字的层不要淡太多
        const lod = lodOf(delta);
        const ang = L.phase + (RM ? 0 : (t / 1000) * L.speed) + spin;
        placeLayer(l, x, y, s, a, Math.round((D - delta) * 1000), lod, (l, res) => {
          const ctx = l.ctx;
          ctx.clearRect(0, 0, res, res);
          const ia = [0.82, 0.64, 0.48, 0.34][lod] * L.a * (lightScene && INK === 'scene' ? 0.7 : 1);
          ctx.strokeStyle = `rgb(${ink} / ${ia.toFixed(3)})`;
          ctx.lineWidth = lod === 0 ? DPR * lerp(1.15, 0.7, L.rank) : 1;
          ctx.lineJoin = ctx.lineCap = 'round';
          O.draw(ctx, L, res, ang, cc, SHEET ? { rgb: glassRGB, a: lightScene ? 0.16 : 0.2 } : null, envOf(rec, lod));
        }, extra);
        // 清楚的那一档：后面的层再虚一点
        const blur = lod === 0 && L.rank > 0 && !L.sharp ? (L.rank * 1.1).toFixed(2) : '0';
        if (blur !== l._b) { l._b = blur; l.cv.style.filter = blur === '0' ? '' : `blur(${blur}px)`; }
      });

      // 物件
      const o = rec.obj;
      {
        const delta = Math.max(0.05, dObj);
        let s = G / delta;
        let x = vw / 2 + (rec.wx - cam.x) * s + bx;
        let y = vh / 2 + (rec.wy - cam.y) * s + by;
        let a = alphaOf(delta) * fade;
        if (tk) { // 飞向口袋
          const e = inOut(clamp((tk - 0.2) / 0.8, 0, 1));
          const P = pocketXY();
          x = lerp(x, P.x, e);
          y = lerp(y, P.y, e);
          s *= lerp(1, 0.16, e);
          a *= 1 - clamp((tk - 0.82) / 0.18, 0, 1);
        }
        const lod = tk ? 0 : lodOf(delta);
        placeLayer(o, x, y, s, a, Math.round((D - delta) * 1000) + (tk ? 2000 : 2), lod, (l, res, dirty) => {
          if (!dirty) return;
          l.ctx.clearRect(0, 0, res, res);
          l.ctx.imageSmoothingQuality = 'high';
          l.ctx.drawImage(ART[rec.item.id], 0, 0, res, res);
        });
        const ready = !tk && !rec.out && Math.abs(Math.log(delta)) < WINDOW;
        o.el.classList.toggle('ready', ready);
        o.el.style.pointerEvents = a > 0.25 && !tk ? 'auto' : 'none';
        if (ready !== o.ready) {
          o.ready = ready;
          o.el.tabIndex = ready ? 0 : -1;
          o.el.setAttribute('role', 'button');
          o.el.setAttribute('aria-hidden', ready ? 'false' : 'true');
        }
        if (rec.hush && !tk) {
          const g = focus * a;
          if (g > hushGoal) { hushGoal = g; hushAt = { x, y, r: rec.orn.R * s }; }
        }
      }
    }

    // 最稀有的两档：靠近焦平面时，周围的光暗下去一点，只留它那一圈
    hush += (hushGoal - hush) * (1 - Math.exp(-dt / 0.5));
    if (hushAt) {
      hushEl.style.background = `radial-gradient(circle at ${hushAt.x.toFixed(0)}px ${hushAt.y.toFixed(0)}px, rgb(${hushRGB} / 0) ${(hushAt.r * 1.02).toFixed(0)}px, rgb(${hushRGB} / 0.62) ${(hushAt.r * 1.9).toFixed(0)}px)`;
    }
    hushEl.style.opacity = hush.toFixed(3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ══ 拾起时的一行字 ══ */
  const notes = document.getElementById('cx-notes');
  function note(rec, x, y) {
    const it = rec.item;
    const n = document.createElement('div');
    n.className = 'cx-note';
    n.innerHTML = `<b></b><span class="o"></span><p></p>`;
    n.querySelector('b').textContent = it.name;
    n.querySelector('.o').textContent = fmtOdds(it.odds);
    n.querySelector('p').textContent = it.text.wake;
    n.style.left = `${clamp(x, 140, vw - 140)}px`;
    n.style.top = `${clamp(y + OBJ_R * G + 18, 80, vh - 120)}px`;
    notes.appendChild(n);
    setTimeout(() => n.classList.add('out'), 3600);
    setTimeout(() => n.remove(), 4800);
  }

  /* ══ 口袋与清单 ══ */
  const panel = document.getElementById('cx-panel');
  const list = document.getElementById('cx-list');
  const count = document.getElementById('cx-count');
  function renderPocket(pulse) {
    const n = ITEMS.filter((it) => store.items[it.id]).length;
    count.textContent = `${n}/${ITEMS.length}`;
    if (pulse) { pocket.classList.remove('got'); void pocket.offsetWidth; pocket.classList.add('got'); }
  }
  function thumb(it, found) {
    const S = 88;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S * DPR;
    cv.style.width = cv.style.height = `${S}px`;
    const c = cv.getContext('2d');
    c.scale(DPR, DPR);
    const orn = O.build(it);
    c.strokeStyle = found ? `rgb(${inkOf(orn.tier)} / 0.55)` : 'rgb(160 170 186 / 0.28)';
    c.lineWidth = 0.6;
    // 外壳缩到缩略图里：每层按半径比例画
    for (const L of orn.layers) {
      const px = (L.rOut / orn.R) * S * 0.98;
      c.save();
      c.translate((S - px) / 2, (S - px) / 2);
      O.draw(c, L, px, L.phase, found ? 1 : 0.22, null, { ink: inkOf(orn.tier), light: lightScene, tint: TINT[it.id], glass: glassRGB, item: it, lod: 0 });
      c.restore();
    }
    if (found) c.drawImage(ART[it.id], S * 0.3, S * 0.3, S * 0.4, S * 0.4);
    return cv;
  }
  function renderList() {
    list.textContent = '';
    for (const it of [...ITEMS].sort((a, b) => a.odds - b.odds)) {
      const s = store.items[it.id];
      const li = document.createElement('li');
      li.className = s ? 'found' : 'unknown';
      li.appendChild(thumb(it, !!s));
      const tx = document.createElement('div');
      tx.innerHTML = `<h3><b></b><span class="o"></span></h3><p class="w"></p><p class="d"></p>`;
      tx.querySelector('b').textContent = s ? it.name : '——';
      tx.querySelector('.o').textContent = fmtOdds(it.odds) + (s && s.n > 1 ? ` · ×${s.n}` : '');
      tx.querySelector('.w').textContent = s ? it.text.wake : '';
      tx.querySelector('.d').textContent = s ? it.text.dream : '';
      li.appendChild(tx);
      list.appendChild(li);
    }
  }
  function setPanel(open) {
    panel.hidden = !open;
    pocket.setAttribute('aria-expanded', String(open));
    if (open) renderList();
  }
  pocket.addEventListener('click', () => setPanel(panel.hidden));
  panel.querySelector('.cx-x').addEventListener('click', () => setPanel(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) setPanel(false); });
  for (const el of [pocket, panel]) for (const ev of ['pointerdown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());

  // 导出 / 导入：一段可以抄走的字（清缓存以后贴回来）
  const code = document.getElementById('cx-code');
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.trim()))));
  document.getElementById('cx-export').addEventListener('click', () => {
    code.hidden = false;
    code.value = enc({ v: 1, items: store.items });
    code.select();
  });
  document.getElementById('cx-import').addEventListener('click', () => {
    if (code.hidden || !code.value.trim()) { code.hidden = false; code.value = ''; code.placeholder = '把之前导出的那段字贴在这里，再点一次「导入」'; code.focus(); return; }
    try {
      const o = dec(code.value);
      for (const [id, s] of Object.entries(o.items || {})) {
        if (!BY_ID[id]) continue;
        const cur = store.items[id];
        store.items[id] = cur ? { n: Math.max(cur.n, s.n), first: Math.min(cur.first, s.first), last: Math.max(cur.last || 0, s.last || 0) } : s;
      }
      save();
      renderList();
      renderPocket(true);
      code.value = '';
      code.hidden = true;
    } catch { code.value = ''; code.placeholder = '这段字读不出来'; }
  });
  renderPocket(false);

  /* ══ 调试条（?dev=1） ══ */
  const dev = document.getElementById('cx-dev');
  let devStat = () => {};
  let devLog = () => {};
  if (DEV) {
    dev.hidden = false;
    dev.innerHTML = `<div class="st"></div><div class="bt"></div><ol class="lg"></ol>`;
    const st = dev.querySelector('.st');
    const bt = dev.querySelector('.bt');
    const lg = dev.querySelector('.lg');
    devStat = () => { st.textContent = `判定 ${store.rolls} 次 · luck ×${LUCK}`; };
    devLog = (m) => { const li = document.createElement('li'); li.textContent = m; lg.prepend(li); while (lg.children.length > 6) lg.lastChild.remove(); };
    for (const it of ITEMS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${it.name} ${fmtOdds(it.odds)}`;
      b.addEventListener('click', () => { if (W.mode === 'explore') spawn(it); });
      bt.appendChild(b);
    }
    const r = document.createElement('button');
    r.type = 'button';
    r.textContent = '清空存档';
    r.addEventListener('click', () => { store = { items: {}, rolls: 0 }; save(); renderPocket(false); if (!panel.hidden) renderList(); devStat(); });
    bt.appendChild(r);
    for (const ev of ['pointerdown', 'wheel']) dev.addEventListener(ev, (e) => e.stopPropagation());
    devStat();
  }

  window.__cx = { spawn: (id, ahead, at) => spawn(BY_ID[id], ahead, at), take, setPanel, live, store, roll, ITEMS };
})();
