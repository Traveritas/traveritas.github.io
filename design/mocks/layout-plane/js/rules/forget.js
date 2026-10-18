/* ─────────────────────────────────────────────────────────────
   规则 · 遗忘：离原件越远的副本记得越少。
   原件 0 档；副本至少 1 档，按副本中心到原件周期中心的距离（以周期为单位）逐档变粗，5 档封顶。
   悬停想起一档；打开一块时，屏上其余的按距离依次再忘一档，收回时就近先想起。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const T = K.tiers;
  const { W, H } = K.world;

  const LV_START = 0.55;
  const LV_STEP = 0.62;
  function levelOf(t, i, j) {
    if (i === 0 && j === 0) return 0;
    const cx = (t.x + t.w / 2 + i * W - W / 2) / W;
    const cy = (t.y + t.h / 2 + j * H - H / 2) / H;
    const r = Math.hypot(cx, cy);
    return Math.max(1, Math.min(5, 1 + Math.floor((r - LV_START) / LV_STEP)));
  }

  K.rules.forget = () => {
    let ctx;
    const setExtra = (n) => (rec, quiet) => {
      rec.s.extra = n;
      ctx.refresh(rec, { quiet });
    };
    return {
      name: 'forget',
      mechs: ['arrive', 'haze'],
      init(c) {
        ctx = c;
        T.buildVariants(() => ctx.repaintAll((r) => r.t.kind === 'img'));
      },
      place(t, i, j) {
        const lv = levelOf(t, i, j);
        if (t.kind === 'label' && lv >= 3) return null;
        if (lv === 5 && K.hash(t.idx + 7, i, j) < 0.45) return null; // 最远处的色块也时有时无
        return { lv, extra: 0 };
      },
      look(rec) {
        const hover = rec === ctx.hover && !ctx.reading ? 1 : 0;
        // rec.lift：机制给的「被想起」档数（比如提灯），与悬停叠加
        return Math.max(0, Math.min(T.MAX, rec.s.lv + rec.s.extra - hover - (rec.lift || 0)));
      },
      paint: (rec, lv, prev, quiet) => T.paint(rec, lv, prev, quiet),
      box: (rec, lv, b) => T.box(rec, lv, b),
      canHover: (rec) => !rec.orig && rec.s.lv <= 4,
      canOpen: (rec) => rec.s.lv < 5,
      isPartial: (rec, lv) => lv > 0,
      opening(rec) { ctx.ripple(rec, setExtra(1), 40, 0.32, 420); },
      closing(rec) { ctx.ripple(rec, setExtra(0), 220, 0.22, 360); },
      closed() {
        for (const r of ctx.nodes.values()) if (r.s.extra) setExtra(0)(r, true);
      },
      focusOn(rec) { rec.s.extra = 0; },
      detail: (rec, dt, k, lv) => T.recall(rec, dt, k, lv, ctx.animate),
    };
  };
})();
