/* 浮尘：空间里飘着极小的像素光点。最轻的一种装饰——
   不承担任何信息，只负责让「空」有厚度：近处的几点大而糊，远处密成一层微光。
   这也是 deco 接口的样板：见 variants/README.md 第 4 节。 */
(() => {
  'use strict';
  const { rgba } = DriftReg;

  /* 场景的「微光色」：随笔偏冷白，项目冷青，瞬间暖琥珀 */
  const TINT = { essay: [246, 249, 255], project: [150, 205, 218], moment: [240, 190, 150] };

  DriftReg.deco('motes', {
    label: '浮尘',
    perTile: 4,
    spread: 1,
    alpha: 0.9,
    sizeJitter: 0.35,
    margin: 4,
    /* 尺寸的底数要够大：一枚 9 单位的柔光缩到焦平面上只剩六七个像素，等于没有。
       芯占实打实的 3 个单位，晕只是余地。 */
    shapes: [
      { w: 8, h: 8, hot: 0.9, core: 3 },  // 硬芯：一格干净的像素
      { w: 14, h: 14, hot: 0.5 },         // 带一圈晕
      { w: 22, h: 22, hot: 0.2 },         // 大而糊的一团
    ],

    paint(ctx, sh, { scene, M }) {
      const t = TINT[scene] || TINT.essay;
      const cx = M + sh.w / 2;
      const cy = M + sh.h / 2;
      const r = Math.max(sh.w, sh.h) / 2;
      // 晕：从芯到边化开，边缘完全透明
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgba(t, sh.hot));
      g.addColorStop(0.35, rgba(t, sh.hot * 0.5));
      g.addColorStop(1, rgba(t, 0));
      ctx.fillStyle = g;
      ctx.fillRect(M, M, sh.w, sh.h);
      // 芯：实心的一块
      if (sh.core) {
        ctx.fillStyle = rgba(t, 0.98);
        ctx.fillRect(Math.round(cx - sh.core / 2), Math.round(cy - sh.core / 2), sh.core, sh.core);
      }
    },

    /* 极慢的浮：向上漂一点、左右摆一点，各自相位不同 */
    motion(d, t) {
      const p = d.p;
      const ph = p.ph;
      const sp = 0.00013 * p.w1;
      return {
        dx: Math.cos(t * sp + ph) * (14 + 18 * p.size),
        dy: Math.sin(t * sp * 1.37 + ph * 1.7) * (16 + 22 * p.size) - ((t * sp * 12) % 90),
        alpha: 0.72 + 0.28 * Math.sin(t * sp * 2.1 + ph * 3),
      };
    },
  });
})();
