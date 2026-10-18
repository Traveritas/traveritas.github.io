/* ─────────────────────────────────────────────────────────────
   机制：与规则无关、可以单独开关的效果。?mech=a,b 追加，?mech=-a 去掉规则默认带的。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const { W, H, toPlane } = K.world;

  /* 浮现：进场时原件由近及远淡入、去虚 */
  K.mechs.arrive = (ctx) => {
    ctx.on('start', () => {
      if (ctx.RM || location.hash) return;
      const c = { x: ctx.vw / 2, y: ctx.vh / 2 };
      for (const rec of ctx.nodes.values()) {
        const r = ctx.screenRect(rec);
        const d = Math.hypot(r.left + r.width / 2 - c.x, r.top + r.height / 2 - c.y);
        rec.el.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 1100, delay: 120 + d * 0.5, easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'backwards' });
      }
    });
  };

  /* 远雾：离原件周期越远，整片蒙一层越厚的薄雾（封顶 0.12） */
  K.mechs.haze = (ctx) => {
    const el = ctx.els.haze;
    ctx.on('frame', () => {
      const p = toPlane(ctx.cam.x, ctx.cam.y);
      const d = Math.hypot((p.u - W / 2) / W, (p.v - H / 2) / H);
      el.style.opacity = Math.max(0, Math.min(0.12, (d - 1.2) / 5)).toFixed(3);
    });
  };
})();
