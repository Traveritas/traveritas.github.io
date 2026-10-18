/* 绽开：卡片在原地像花一样裂开。
   卡面沿中心切成几片花瓣——切片的边界由同一串角度推出，相邻两片共用一条边，
   所以合起来与原卡面完全重合，「裂开」的第一帧看不出来。
   张开时各片朝外漂开、微微旋转、各自差一点亮度（花不是均匀的），
   中间让出一块光，阅读面板从光里浮起来；收回时花瓣从外面合拢，落回碎片原处。 */
(() => {
  'use strict';
  const { hash } = DriftReg;
  const N = 6; // 花瓣数
  const OPEN = 'cubic-bezier(.3,.5,.25,1)'; // 花是匀着开的，不要一口气冲到尽头
  const SHUT = 'cubic-bezier(.42,.08,.2,1)';
  let box = null; // 本轮留在屏上的叠层
  let fxRef = null; // 别的碎片的反应（置回 0 需要它的引用）
  let timers = [];

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
  /* 绕中心缩放一个矩形：面板从不完全到位的尺寸轻轻长上来 */
  const around = (r, k) => ({ left: r.left + (r.width * (1 - k)) / 2, top: r.top + (r.height * (1 - k)) / 2, width: r.width * k, height: r.height * k });
  /* 副本的底图要跟碎片此刻那一档一致（碎片多半不在清晰档），否则第一帧就看得出换了东西 */
  const sheet = (el, it, lod) => {
    el.style.backgroundImage = `url(${it.lod[lod]})`;
    el.style.imageRendering = lod ? 'pixelated' : 'auto';
  };
  const stopTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  /* 花瓣＝卡面的扇形切片；张开的方向、远近、转角都带一点抖动，免得像机械等分 */
  function grow(api, r) {
    const it = api.it;
    const s = r.width / it.w;
    const cw = it.cw * s;
    const ch = it.ch * s;
    const left = r.left - (it.M || 0) * s;
    const top = r.top - (it.M || 0) * s;
    const sd = seedOf(api.rec.key);
    const layer = document.createElement('div');
    layer.className = 'bloom-layer';
    // 相邻切片共用的边界角度（首尾不抖，合起来才不漏缝）
    const B = [];
    for (let i = 0; i <= N; i++) B.push(i * (360 / N) - 180 / N + (i && i < N ? (hash(sd, 900 + i) - 0.5) * 22 : 0));
    const petals = [];
    for (let i = 0; i < N; i++) {
      const d = hash(sd, i);
      const rot = hash(sd, 50 + i);
      const bri = hash(sd, 80 + i);
      const p = document.createElement('div');
      p.className = 'bloom-petal';
      const R = 260; // 扇形半径（%）：够大到盖住整块卡面
      // 相邻切片只留一丝搭接：搭多了会叠出亮线，完全不留又会有缝
      const edge = [B[i] - 0.15, B[i + 1] + 0.15].map((a) => {
        const rad = (a * Math.PI) / 180;
        return `${(50 + R * Math.cos(rad)).toFixed(2)}% ${(50 + R * Math.sin(rad)).toFixed(2)}%`;
      });
      Object.assign(p.style, {
        left: `${left.toFixed(1)}px`,
        top: `${top.toFixed(1)}px`,
        width: `${cw.toFixed(1)}px`,
        height: `${ch.toFixed(1)}px`,
        backgroundSize: `${cw.toFixed(1)}px ${ch.toFixed(1)}px`,
        clipPath: `polygon(50% 50%, ${edge.join(', ')})`,
        filter: `brightness(${(1 + (bri - 0.5) * 0.035).toFixed(3)}) drop-shadow(0 14px 26px rgba(28, 36, 54, 0.26))`,
      });
      sheet(p, it, api.rec.lod);
      layer.appendChild(p);
      const mid = (((B[i] + B[i + 1]) / 2) * Math.PI) / 180;
      const dist = cw * (0.36 + d * 0.26);
      petals.push({ el: p, dx: Math.cos(mid) * dist, dy: Math.sin(mid) * dist * 0.78, rot: (rot - 0.5) * 32, sc: 1.05 + bri * 0.1 });
    }
    return { layer, petals, cw, ch, cx: left + cw / 2, cy: top + ch / 2 };
  }

  /* 花瓣离开原位之后对回焦：这一步在移动里发生，几乎看不出来 */
  function focus(it, g, delay) {
    timers.push(setTimeout(() => g.petals.forEach((p) => sheet(p.el, it, 0)), delay));
  }

  /* k：张开到几成（0 原位、1 全开）；o：那一刻的不透明度 */
  const at = (p, k, o) => ({
    transform: `translate3d(${(p.dx * k).toFixed(1)}px,${(p.dy * k).toFixed(1)}px,0) rotate(${(p.rot * k).toFixed(2)}deg) scale(${(1 + (p.sc - 1) * k).toFixed(3)})`,
    opacity: o,
  });

  DriftReg.open('bloom', {
    label: '绽开',
    /* 叠层在阅读层之上（20 之上）：花瓣从面板前飞过，再让位给正文 */
    css: `html[data-open='bloom'] .bloom-layer { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
      html[data-open='bloom'] .bloom-petal { position: absolute; transform-origin: 50% 50%; will-change: transform, opacity; }
      html[data-open='bloom'] .bloom-core { position: absolute; border-radius: 50%; transform-origin: 50% 50%; will-change: transform, opacity;
        background: radial-gradient(closest-side, rgb(var(--lit) / 0.5), rgb(var(--lit) / 0.12) 40%, transparent 70%); }`,

    run(api) {
      const r = api.rectOf();
      const pr = panelRect(api);
      const cx = r ? r.left + r.width / 2 : api.vw / 2;
      const cy = r ? r.top + r.height / 2 : api.vh / 2;
      box = null;
      fxRef = null;
      stopTimers();
      /* 花开时近处的东西往外退半步：只挪位置，不改变它们自己的样子 */
      api.setFx({
        cx,
        cy,
        target(rec, fx, h) {
          fxRef = fx;
          const dx = rec.x - fx.cx;
          const dy = rec.y - fx.cy;
          const d = Math.hypot(dx, dy) || 1;
          const push = fx.amt * 120 * h.G * Math.max(0.2, 1 - d / (h.vw * 1.1));
          return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.04 * fx.amt };
        },
      });
      api.hide();
      if (api.RM || !r) {
        api.openReader(pr);
        return;
      }
      const g = grow(api, r);
      document.body.appendChild(g.layer);
      box = g.layer;
      focus(api.it, g, 160);
      // 花心的一点光：花瓣让开时先亮起来，正文从那里浮出
      const gs = Math.max(g.cw, g.ch) * 1.35;
      const core = document.createElement('div');
      core.className = 'bloom-core';
      Object.assign(core.style, { left: `${(g.cx - gs / 2).toFixed(1)}px`, top: `${(g.cy - gs / 2).toFixed(1)}px`, width: `${gs.toFixed(1)}px`, height: `${gs.toFixed(1)}px` });
      g.layer.insertBefore(core, g.layer.firstChild);
      core.animate(
        [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(.9)', opacity: 0.55, offset: 0.45 }, { transform: 'scale(1.35)', opacity: 0 }],
        { duration: 880, delay: 60, easing: 'ease-out', fill: 'both' }
      );
      let last = null;
      g.petals.forEach((p, i) => {
        last = p.el.animate(
          [
            { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
            { ...at(p, 0.5, 0.94), offset: 0.45 },
            { ...at(p, 1, 0), offset: 1 },
          ],
          { duration: 820, delay: i * 40, easing: OPEN, fill: 'both' }
        );
      });
      last.finished.then(() => {
        if (box === g.layer) { g.layer.remove(); box = null; }
      });
      timers.push(setTimeout(() => api.openReader(around(pr, 0.94)), 380));
    },

    closing(api) {
      // 定义了 closing 就没有默认的 fx 回落，自己置回
      if (fxRef) fxRef.goal = 0;
      stopTimers();
      if (api.RM) return;
      const r = api.rectOf();
      if (!r) return;
      const g = grow(api, r);
      document.body.appendChild(g.layer);
      box = g.layer;
      focus(api.it, g, 120);
      // 合拢用 500+90ms 走完，比阅读层收面板（610ms）早一点到位，
      // 于是碎片露出来的那一帧，花瓣已经站在原处
      g.petals.forEach((p, i) => {
        p.el.animate(
          [
            { ...at(p, 1, 0), offset: 0 },
            { ...at(p, 0.32, 0.85), offset: 0.45 },
            { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1, offset: 1 },
          ],
          { duration: 500, delay: (g.petals.length - 1 - i) * 18, easing: SHUT, fill: 'both' }
        );
      });
    },

    closed() {
      stopTimers();
      if (box) box.remove();
      box = null;
      fxRef = null;
    },
  });
})();
