/* 星尘：浮尘的冷版。点为单位更小、更稀、更冷，带一层极慢的明灭——
   浮尘是空气里的灰，星尘是深眠那片靛里自己亮着的东西。
   两版都留着，可以对照着挑。 */
(() => {
  'use strict';
  const { rgba } = DriftReg;

  /* 比浮尘冷：蓝白，不是暖白 */
  const TINT = { essay: [226, 236, 250], project: [206, 226, 255], moment: [222, 226, 248] };

  DriftReg.deco('stardust', {
    label: '星尘',
    perTile: 4,
    spread: 1.2,   // 比浮尘稀：星该是疏的
    alpha: 1,
    sizeJitter: 0.45,
    margin: 4,
    /* 尺寸的底数要够大：一枚 9 单位的软晕在焦平面上缩到六七个像素就没了。
       星是「硬而亮的点」——芯占实打实的 2 个单位（近处就是两三格干净的像素），
       晕只是给它一点余地，不靠晕去撑可见度。 */
    shapes: [
      { w: 6, h: 6, hot: 1, core: 2 },
      { w: 11, h: 11, hot: 0.7, core: 1 },
      { w: 18, h: 18, hot: 0.24 },
    ],

    paint(ctx, sh, { scene, M }) {
      const t = TINT[scene] || TINT.project;
      const cx = M + sh.w / 2;
      const cy = M + sh.h / 2;
      const r = Math.max(sh.w, sh.h) / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(t, sh.hot));
      g.addColorStop(0.3, rgba(t, sh.hot * 0.42));
      g.addColorStop(1, rgba(t, 0));
      ctx.fillStyle = g;
      ctx.fillRect(M, M, sh.w, sh.h);
      // 芯：实心的一块，不铺满整个形状——星点该有自己的大小
      if (sh.core) {
        const k = sh.core;
        ctx.fillStyle = rgba(t, 1);
        ctx.fillRect(Math.round(cx - k / 2), Math.round(cy - k / 2), k, k);
      }
    },

    /* 几乎不动：极慢的漂 + 各自相位的明灭。明灭用两个不成倍数的频率叠起来，
       免得看出周期——一片同时呼吸的星会立刻露馅。 */
    motion(d, t) {
      const p = d.p;
      const ph = p.ph;
      const sp = 0.00004 * p.w1;
      const tw = 0.62 + 0.38 * Math.sin(t * sp * 9.1 + ph) * Math.sin(t * sp * 5.7 + ph * 2.3);
      return {
        dx: Math.cos(t * sp + ph) * 10,
        dy: Math.sin(t * sp * 0.83 + ph * 1.6) * 10,
        alpha: 0.62 + 0.38 * tw,
      };
    },
  });
})();
