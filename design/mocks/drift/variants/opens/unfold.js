/* 折展：一叠玻璃片被摊开成阅读面。
   卡面先被复制成四层薄片，各差一点偏移、大小、转角与透明度——像一叠没有对齐的玻璃，
   最上面那张就是碎片自己，所以开始的那一帧也看不出来。
   展开时它们先后朝外摊开、转正，再依次铺到阅读面的位置上对齐，
   在最上面那张融进面板的同时，面板从它的尺寸轻轻长到阅读尺寸。 */
(() => {
  'use strict';
  let box = null;
  let timers = [];

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

  /* 四层薄片：叠着时的偏移 / 大小 / 转角 / 透明度，摊开时各自的去处 */
  const PLAN = [
    { o: [0, 0], a: 0, sc: 1, op: 1, f: [18, -12], fa: -1.8, fs: 1.02, fop: 1 },
    { o: [-15, -11], a: -2.6, sc: 0.985, op: 0.5, f: [-84, -52], fa: -5.2, fs: 1.03, fop: 0.72 },
    { o: [18, 13], a: 2.1, sc: 0.972, op: 0.34, f: [88, 56], fa: 4.4, fs: 1.03, fop: 0.6 },
    { o: [-29, -21], a: 3.4, sc: 0.958, op: 0.22, f: [-132, -84], fa: 7, fs: 1.03, fop: 0.48 },
  ];

  DriftReg.open('unfold', {
    label: '折展',
    css: `html[data-open='unfold'] .unfold-layer { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
      html[data-open='unfold'] .unfold-pane { position: absolute; transform-origin: 50% 50%; background-size: 100% 100%; will-change: transform, opacity; }`,

    run(api) {
      const r = api.rectOf();
      const pr = panelRect(api);
      const it = api.it;
      const cx = r ? r.left + r.width / 2 : api.vw / 2;
      const cy = r ? r.top + r.height / 2 : api.vh / 2;
      box = null;
      stopTimers();
      /* 玻璃片往两侧摊开：周围的碎片被这一摞推得偏开一点，近处的退到玻璃后面（更粗一档） */
      api.setFx({
        cx,
        cy,
        target(rec, fx, h) {
          const dx = rec.x - fx.cx;
          const dy = rec.y - fx.cy;
          const d = Math.hypot(dx, dy) || 1;
          const push = fx.amt * 90 * h.G * Math.max(0.2, 1 - d / (h.vw * 1.2));
          return { dx: ((dx / d) * 0.4 + (dx < 0 ? -1 : 1) * 0.6) * push, dy: (dy / d) * push * 0.5 };
        },
        lod(rec, lod, fx) {
          if (rec === fx.rec) return lod;
          const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
          return lod + (d < api.vw * 0.45 ? Math.round(fx.amt) : 0);
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
      const u = cw / 420; // 偏移量按卡面大小伸缩
      // 铺到阅读面上：宽度对齐面板，左上角落在面板的左上角
      const k = pr.width / cw;
      const tx = pr.left + (cw * k) / 2 - (left + cw / 2);
      const ty = pr.top + (ch * k) / 2 - (top + ch / 2);
      const layer = document.createElement('div');
      layer.className = 'unfold-layer';
      const panes = [];
      PLAN.forEach((pl, i) => {
        const p = document.createElement('div');
        p.className = 'unfold-pane';
        Object.assign(p.style, {
          left: `${left.toFixed(1)}px`,
          top: `${top.toFixed(1)}px`,
          width: `${cw.toFixed(1)}px`,
          height: `${ch.toFixed(1)}px`,
          zIndex: String(20 - i),
          // 玻璃的上沿留一道亮边：叠着的时候能看出是一摞片
          borderTop: `1px solid rgb(var(--lit) / ${i ? 0.5 : 0})`,
          filter: `brightness(${(1 + i * 0.08).toFixed(3)})`,
        });
        sheet(p, it, api.rec.lod);
        layer.appendChild(p);
        panes.push(p);
        const kv = (v) => (v * u).toFixed(1);
        // 末帧必须落在 offset:1 上：只写到 0.92 的话，浏览器在尾段会把值插回起点。
        // 缓动写在每帧上（摊开慢、铺过去慢起快落），时间轴才是均匀的
        p.animate(
          [
            { transform: `translate3d(${kv(pl.o[0])}px,${kv(pl.o[1])}px,0) rotate(${pl.a}deg) scale(${pl.sc})`, opacity: pl.op, offset: 0, easing: 'cubic-bezier(.3,.55,.3,1)' },
            { transform: `translate3d(${kv(pl.f[0])}px,${kv(pl.f[1])}px,0) rotate(${pl.fa}deg) scale(${pl.fs})`, opacity: pl.fop, offset: 0.3, easing: 'cubic-bezier(.4,.1,.25,1)' },
            { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(0deg) scale(${k.toFixed(4)})`, opacity: 0.4, offset: 0.78, easing: 'linear' },
            { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(0deg) scale(${k.toFixed(4)})`, opacity: 0, offset: 0.92 },
            { transform: `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) rotate(0deg) scale(${k.toFixed(4)})`, opacity: 0, offset: 1 },
          ],
          { duration: 900, delay: i * 55, easing: 'linear', fill: 'both' }
        );
      });
      document.body.appendChild(layer);
      box = layer;
      // 摊开之后整摞一起对回焦
      timers.push(setTimeout(() => panes.forEach((p) => sheet(p, it, 0)), 200));
      // 最里面那张（起得最晚）也融掉之后，这摞东西就没有了
      panes[panes.length - 1].getAnimations()[0].finished.then(() => {
        if (box === layer) { layer.remove(); box = null; }
      });
      timers.push(setTimeout(() => api.openReader(around(pr, 0.93)), 460));
    },

    closed() {
      stopTimers();
      if (box) box.remove();
      box = null;
    },
  });
})();
