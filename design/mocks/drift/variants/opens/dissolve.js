/* 溶散：卡片先化成一团像素雾，再在阅读位置上重新凝聚。
   卡面被切成一片像素格——拼起来就是碎片本身，所以散开的第一帧也看不出来；
   然后每一格一档档变粗、变亮、朝外飘走（雾），再落到阅读面上排回一块画面，
   由粗到细对回焦，最后让位给正文。阅读面上那块画面的位置与阅读层里碎片画面的位置一致。 */
(() => {
  'use strict';
  const { hash } = DriftReg;
  const COLS = 10;
  const ROWS = 7;
  const TOTAL = 900; // 一粒像素的一生（毫秒）
  let box = null;
  let timers = [];
  let grains = [];

  const seedOf = (key) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  const stopTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  DriftReg.open('dissolve', {
    label: '溶散',
    css: `html[data-open='dissolve'] .dissolve-layer { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
      html[data-open='dissolve'] .dissolve-grain { position: absolute; transform-origin: 0 0; background-repeat: no-repeat; will-change: transform, opacity, filter; }
      html[data-open='dissolve'] .dissolve-mist { position: absolute; border-radius: 50%; transform-origin: 50% 50%; will-change: transform, opacity;
        background: radial-gradient(closest-side, rgb(var(--lit) / 0.4), rgb(var(--lit) / 0.1) 46%, transparent 72%); }`,

    run(api) {
      const r = api.rectOf();
      const pr = panelRect(api);
      const it = api.it;
      const cx = r ? r.left + r.width / 2 : api.vw / 2;
      const cy = r ? r.top + r.height / 2 : api.vh / 2;
      box = null;
      grains = [];
      stopTimers();
      /* 雾往外摊：近处的碎片跟着粗一档、暗一点，像是被雾笼住 */
      api.setFx({
        cx,
        cy,
        target(rec, fx, h) {
          const dx = rec.x - fx.cx;
          const dy = rec.y - fx.cy;
          const d = Math.hypot(dx, dy) || 1;
          const push = fx.amt * 70 * h.G * Math.max(0.2, 1 - d / (h.vw * 1.2));
          return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.05 * fx.amt };
        },
        lod(rec, lod, fx) {
          if (rec === fx.rec) return lod;
          const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
          return lod + (d < api.vw * 0.5 ? Math.round(fx.amt) : 0);
        },
        alpha(rec, a, fx) {
          if (rec === fx.rec) return a;
          return a * (1 - 0.18 * fx.amt);
        },
      });
      api.hide();
      if (api.RM || !r) {
        api.openReader(pr);
        return;
      }
      const s = r.width / it.w;
      const cw = it.cw * s;
      const ch = it.ch * s;
      const left = r.left - (it.M || 0) * s;
      const top = r.top - (it.M || 0) * s;
      // 阅读面上那块画面：与阅读层里碎片画面同一处（面板宽、比例随卡面）
      const pw = pr.width - 48;
      const ph = Math.min(pr.height - 48, (pw * it.ch) / it.cw);
      const ww = (ph * it.cw) / it.ch;
      const picLeft = pr.left + (pr.width - ww) / 2;
      const picTop = pr.top + 24;
      const k = ww / cw;
      const sd = seedOf(api.rec.key);
      const layer = document.createElement('div');
      layer.className = 'dissolve-layer';
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++) {
          // 像素格的边界取整：拼起来与原卡面严丝合缝
          const x0 = Math.round((cw * col) / COLS);
          const x1 = Math.round((cw * (col + 1)) / COLS);
          const y0 = Math.round((ch * row) / ROWS);
          const y1 = Math.round((ch * (row + 1)) / ROWS);
          const g = document.createElement('div');
          g.className = 'dissolve-grain';
          Object.assign(g.style, {
            left: `${(left + x0).toFixed(1)}px`,
            top: `${(top + y0).toFixed(1)}px`,
            width: `${x1 - x0}px`,
            height: `${y1 - y0}px`,
            backgroundImage: `url(${it.lod[api.rec.lod]})`,
            backgroundSize: `${cw.toFixed(1)}px ${ch.toFixed(1)}px`,
            backgroundPosition: `${-x0}px ${-y0}px`,
            imageRendering: api.rec.lod ? 'pixelated' : 'auto',
          });
          layer.appendChild(g);
          const h1 = hash(sd, row * COLS + col);
          const h2 = hash(sd, 400 + row * COLS + col);
          const ang = Math.atan2(top + (y0 + y1) / 2 - cy, left + (x0 + x1) / 2 - cx);
          const d = 40 + h1 * 120;
          const sx = Math.cos(ang) * d;
          const sy = Math.sin(ang) * d - 24 - h2 * 40; // 雾是往上飘的
          const ss = 1.25 + h2 * 0.7;
          const sr = (h1 - 0.5) * 24;
          const tx = picLeft + x0 * k - (left + x0);
          const ty = picTop + y0 * k - (top + y0);
          const at2 = (f) => `translate3d(${(sx * f).toFixed(1)}px,${(sy * f).toFixed(1)}px,0)`;
          grains.push(g);
          g.animate(
            [
              { transform: 'translate3d(0,0,0) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)', offset: 0, easing: 'ease-out' },
              { transform: `${at2(0.7)} scale(${(1 + (ss - 1) * 0.7).toFixed(3)}) rotate(${(sr * 0.7).toFixed(2)}deg)`, opacity: 0.6, filter: 'brightness(1.4)', offset: 0.14 },
              { transform: `${at2(1)} scale(${ss.toFixed(3)}) rotate(${sr.toFixed(2)}deg)`, opacity: 0.48, filter: 'brightness(1.5)', offset: 0.22, easing: 'ease-in-out' },
              { transform: `${at2(1.12)} scale(${(ss * 1.04).toFixed(3)}) rotate(${(sr * 1.15).toFixed(2)}deg)`, opacity: 0.42, filter: 'brightness(1.55)', offset: 0.42, easing: 'cubic-bezier(.35,.05,.25,1)' },
              { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${k.toFixed(4)}) rotate(0deg)`, opacity: 1, filter: 'brightness(1.06)', offset: 0.7, easing: 'linear' },
              { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${k.toFixed(4)}) rotate(0deg)`, opacity: 1, filter: 'brightness(1.06)', offset: 0.84 },
              { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${(k * 1.03).toFixed(4)}) rotate(0deg)`, opacity: 0, filter: 'brightness(1.15)', offset: 1 },
            ],
            { duration: TOTAL, delay: Math.round(h1 * 70), easing: 'linear', fill: 'both' }
          );
        }
      // 化开的那一下：卡片的位置上先起一层雾
      const ms = Math.max(cw, ch) * 2.2;
      const mist = document.createElement('div');
      mist.className = 'dissolve-mist';
      Object.assign(mist.style, { left: `${(cx - ms / 2).toFixed(1)}px`, top: `${(cy - ms / 2).toFixed(1)}px`, width: `${ms.toFixed(1)}px`, height: `${ms.toFixed(1)}px` });
      layer.insertBefore(mist, layer.firstChild);
      mist.animate(
        [{ transform: 'scale(.35)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.75, offset: 0.35 }, { transform: 'scale(1.55)', opacity: 0 }],
        { duration: 760, easing: 'ease-out', fill: 'both' }
      );
      document.body.appendChild(layer);
      box = layer;
      // 一档档变粗（从它此刻那一档起），聚回阅读面时再一档档对回焦
      const seq = [];
      for (const v of [api.rec.lod, Math.min(3, api.rec.lod + 1), 3, 1, 0]) if (!seq.length || seq[seq.length - 1] !== v) seq.push(v);
      const when = [0, 110, 200, 500, 700];
      const step = (lod) => grains.forEach((g) => {
        g.style.backgroundImage = `url(${it.lod[lod]})`;
        g.style.imageRendering = lod ? 'pixelated' : 'auto';
      });
      seq.forEach((v, i) => {
        if (i) timers.push(setTimeout(() => step(v), when[i]));
      });
      // 面板在雾里浮出：正文随后从像素里显影
      timers.push(setTimeout(() => api.openReader(pr), 620));
      // 散完就把这一层收走：七十粒像素没必要陪读到最后
      timers.push(setTimeout(() => {
        if (box === layer) { layer.remove(); box = null; }
      }, TOTAL + 300));
    },

    closed() {
      stopTimers();
      if (box) box.remove();
      box = null;
      grains = [];
    },
  });
})();
