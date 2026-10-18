/* ─────────────────────────────────────────────────────────────
   场景里的装饰：与碎片共用同一套空间（层 / z 周期 / 平面周期 / 失焦档），
   于是自动获得景深、像素化、视差与「分层落定」的手感，只是不承担内容。

   一个装饰变体（?deco=）登记成这样：

     DriftReg.deco('motes', {
       label: '浮尘',
       perTile: 5,        // 每个平面周期里放几个
       spread: 1,         // 平面周期 × 这个数（>1 更稀，<1 更密）
       alpha: 0.5,        // 基础不透明度
       layers: null,      // 只铺在哪些层（默认全部 0..L-1）
       zBias: 0,          // 层级微调（正数更靠前）
       noSpring: false,   // true = 不做弹簧迟滞，直接跟镜头
       shapes: [ { w: 6, h: 6, ...自定义字段 } ],
       paint(ctx, sh, env),          // 把一个形状画进 (M,M)-(M+w,M+h)；env = { scene, ink, M }
       motion(d, t) { return { dx, dy, rot, scale, alpha }; },  // 世界单位的漂移 + 旋转 / 缩放 / 透明度倍数
     });

   实例的 (层, z 周期, 格) 用哈希定位，重复错开、不成网格——和碎片的排法一个思路。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  window.DriftDeco = (driftEl) => {
    const R = Math.min(2, Math.max(1, devicePixelRatio || 1));
    const layer = document.createElement('div');
    layer.id = 'deco';
    layer.setAttribute('aria-hidden', 'true');
    driftEl.appendChild(layer);

    const reg = window.DriftReg;
    /* 装饰不跟碎片同深，而是浮在层与层之间：同深时 z 相等，DOM 靠后的卡片总是赢，
       于是一大半装饰被压在卡片背后、白画。偏 0.17 层（层距 0.5）就够错开。 */
    const OFF = 0.17;
    let def = null;
    let shapes = []; // [{ spec, urls, w, h, M, cw, ch }]
    let scene = 'essay';
    let frame = 0;
    const recs = new Map();
    const pool = [];

    const hash = reg.hash;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;

    function makeEl() {
      const el = pool.pop() || document.createElement('div');
      el.className = 'deco';
      el.style.visibility = '';
      el.style.opacity = '0';
      if (!el.parentNode) layer.appendChild(el);
      return el;
    }
    function release(rec) {
      recs.delete(rec.key);
      rec.el.style.opacity = '0';
      rec.el.style.backgroundImage = '';
      pool.push(rec.el);
    }

    async function paintShapes(name) {
      const out = [];
      for (const sh of def.shapes || []) {
        const M = sh.M != null ? sh.M : def.margin || 0;
        const cw = sh.w + 2 * M;
        const ch = sh.h + 2 * M;
        const cv = document.createElement('canvas');
        cv.width = Math.round(cw * R);
        cv.height = Math.round(ch * R);
        const ctx = cv.getContext('2d');
        ctx.scale(R, R);
        ctx.textBaseline = 'alphabetic';
        def.paint(ctx, sh, { scene, ink: reg.ink(scene), M, name });
        out.push({ spec: sh, urls: await reg.toLODs(cv, cw, ch), w: sh.w, h: sh.h, M, cw, ch });
      }
      shapes = out;
      // 尺寸变了：把所有实例丢掉，下一帧按新尺寸重建
      for (const rec of [...recs.values()]) release(rec);
    }

    async function build(name) {
      def = reg.get('deco', name);
      if (!def) { shapes = []; return; }
      await paintShapes(name);
    }
    async function setScene(name) {
      if (name === scene) return;
      scene = name;
      if (def) await paintShapes(def.name);
    }

    /* 实例的排法：每层、每个 z 周期各排一遍 */
    function place(l, c, k) {
      const key = `d:${def.name}:${l}:${c}:${k}`;
      const spread = def.spread || 1;
      const Pw = (1180 + 260 * (l % 3)) * spread;
      const Ph = (900 + 200 * ((l + 1) % 3)) * spread;
      const si = Math.floor(hash(key, 's') * shapes.length) % Math.max(1, shapes.length);
      return {
        Pw,
        Ph,
        x: hash(key, 'x') * Pw,
        y: hash(key, 'y') * Ph,
        si,
        rot: (hash(key, 'r') - 0.5) * 2 * (def.rot || 0),
        size: 1 + (hash(key, 'z') - 0.5) * 2 * (def.sizeJitter || 0),
        ph: hash(key, 'ph') * 6.283,
        w1: 0.6 + hash(key, 'w') * 0.8,
        jit: 0.85 + hash(key, 'k') * 0.3,
      };
    }

    function sync(t, env) {
      frame++;
      if (!def || !shapes.length) return;
      const { cam, G, vw, vh, D, GAP, L, NEAR0, MARGIN } = env;
      const perTile = def.perTile || 3;
      const layers = def.layers || null;
      for (let l = 0; l < L; l++) {
        if (layers && !layers.includes(l)) continue;
        let delta = ((l * GAP + OFF - cam.z) % D + D) % D;
        if (delta < 1e-4) delta = D;
        if (delta < NEAR0) continue;
        const c = Math.round((cam.z + delta - l * GAP - OFF) / D);
        const s = G / delta;
        const hw = (vw / 2 + MARGIN) / s;
        const hh = (vh / 2 + MARGIN) / s;
        const p0 = place(l, c, 0);
        const i0 = Math.ceil((cam.x - hw - p0.Pw) / p0.Pw);
        const i1 = Math.floor((cam.x + hw) / p0.Pw);
        const j0 = Math.ceil((cam.y - hh - p0.Ph) / p0.Ph);
        const j1 = Math.floor((cam.y + hh) / p0.Ph);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++)
            for (let k = 0; k < perTile; k++) {
              const p = place(l, c, k);
              const key = `d:${def.name}:${l}:${c}:${k}:${i}:${j}`;
              let rec = recs.get(key);
              if (!rec) {
                const sh = shapes[p.si] || shapes[0];
                rec = { key, p, l, c, i, j, sh, el: makeEl(), lod: -1, seen: 0, x: 0, y: 0, s: 1, vx: 0, vy: 0, vs: 0, first: true };
                rec.el.style.width = `${sh.cw}px`;
                rec.el.style.height = `${sh.ch}px`;
                recs.set(key, rec);
              }
              rec.seen = frame;
              rec.wx = p.x + i * p.Pw;
              rec.wy = p.y + j * p.Ph;
            }
      }
      for (const rec of [...recs.values()]) if (rec.seen !== frame) release(rec);
    }

    function draw(t, dt, env) {
      if (!def || !shapes.length) return;
      const { cam, G, vw, vh, alphaOf, lodOf, RM } = env;
      const D = env.D;
      for (const rec of recs.values()) {
        const { p } = rec;
        let delta = ((rec.l * env.GAP + rec.c * D + OFF - cam.z) % D + D) % D;
        if (delta < 1e-4) delta = D;
        const m = (def.motion && (rec.delta = delta, def.motion(rec, t))) || {};
        const s = (G / delta) * (m.scale || 1) * p.size;
        const tx = vw / 2 + (rec.wx + (m.dx || 0) - cam.x) * (G / delta);
        const ty = vh / 2 + (rec.wy + (m.dy || 0) - cam.y) * (G / delta);
        // 与碎片同一种迟滞：近处跟得紧，远处拖得久
        if (RM || def.noSpring) { rec.x = tx; rec.y = ty; rec.s = s; }
        else {
          const u = clamp((delta - 0.5) / 1.8, 0, 1);
          const k = lerp(320, 46, u) * p.jit;
          const z = lerp(0.92, 0.36, u);
          const cc = 2 * z * Math.sqrt(k);
          let left = dt;
          while (left > 0) {
            const h = Math.min(left, 1 / 120);
            left -= h;
            rec.vx += (-k * (rec.x - tx) - cc * rec.vx) * h;
            rec.vy += (-k * (rec.y - ty) - cc * rec.vy) * h;
            rec.vs += (-k * (rec.s - s) - cc * rec.vs) * h;
            rec.x += rec.vx * h;
            rec.y += rec.vy * h;
            rec.s += rec.vs * h;
          }
        }
        const lod = lodOf(delta);
        if (lod !== rec.lod) {
          rec.lod = lod;
          rec.el.style.backgroundImage = `url(${rec.sh.urls[lod]})`;
          rec.el.dataset.lod = lod;
        }
        const a = clamp((def.alpha != null ? def.alpha : 0.5) * alphaOf(delta) * (m.alpha != null ? m.alpha : 1), 0, 1);
        const el = rec.el;
        el.style.transform = `translate3d(${(rec.x - rec.sh.cw / 2).toFixed(1)}px,${(rec.y - rec.sh.ch / 2).toFixed(1)}px,0) scale(${Math.max(0.01, rec.s).toFixed(4)}) rotate(${((m.rot || 0) + p.rot).toFixed(2)}deg)`;
        el.style.zIndex = String(Math.round((D - delta) * 1000) + (def.zBias || 0));
        const ao = a.toFixed(3);
        if (el.style.opacity !== ao) el.style.opacity = ao;
        el.style.visibility = a > 0.008 ? '' : 'hidden';
      }
    }

    return {
      get name() { return def && def.name; },
      build,
      setScene,
      sync,
      draw,
      get count() { return recs.size; },
      recs,
    };
  };
})();
