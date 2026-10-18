/* 远环：空间深处几个巨大的、极淡的环，缓慢呼吸，给这片空间一个尺度参照。
   它不是前景的物件，是背景里的结构——所以只铺在远层、不做弹簧迟滞、压到碎片后面，
   一旦被镜头推到面前就化掉。 */
(() => {
  'use strict';
  const { rgba } = DriftReg;

  /* 位置、大小、朝向从 key 再散一次；朝向尤其要紧——
     同一个椭圆转过不同角度，就长成不同倾斜的环。 */
  const R = (key, salt) => {
    let h = 2166136261;
    const s = `${key}|${salt}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const SCAT = 0.35;

  /* 环是结构：黑白灰的秩序感。随笔的浅底上要用偏灰的蓝压下去，
     近白的环在浅色里根本不存在；深靛与暮紫上才取冷色。 */
  const TINT = {
    essay: { k: 0.85, c: [110, 134, 176] },
    project: { k: 0.62, c: [176, 208, 228] },
    moment: { k: 0.75, c: [206, 198, 232] },
  };

  DriftReg.deco('rings', {
    label: '远环',
    perTile: 1,
    /* 环有上千单位宽，格子不能开得太大——否则视口里一个都落不下 */
    spread: 1.15,
    alpha: 0.66,
    layers: [1, 2, 3], // 只铺在远的三层；镜头推近时它们会自己淡掉
    zBias: -420, // 与碎片同深时退到后面
    noSpring: true, // 远处的结构不该跟着镜头晃
    margin: 70,
    shapes: [{ w: 1180, h: 960, band: 26 }],

    paint(ctx, sh, { scene, M }) {
      const d = TINT[scene] || TINT.essay;
      const t = d.c;
      const k = d.k;
      const { w, h, band } = sh;
      const cx = M + w / 2;
      const cy = M + h / 2;
      const rx = w / 2 - band * 1.7;
      const ry = h / 2 - band * 1.7;
      // 一侧被照亮、一侧几乎化掉：远处的结构总是只看得见半边
      const g = ctx.createLinearGradient(cx - rx * 0.7, cy - ry * 0.7, cx + rx * 0.7, cy + ry * 0.7);
      g.addColorStop(0, rgba(t, 0.74 * k));
      g.addColorStop(0.42, rgba(t, 0.5 * k));
      g.addColorStop(0.78, rgba(t, 0.15 * k));
      g.addColorStop(1, rgba(t, 0.04 * k));
      ctx.strokeStyle = g;
      const ring = (r) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * r, ry * r, 0, 0, 6.2832);
        ctx.stroke();
      };
      // 外圈：化开的一层雾，降采样之后环才不至于断成虚线
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = band * 3.4;
      ring(1);
      // 主带
      ctx.globalAlpha = 1;
      ctx.lineWidth = band;
      ring(1);
      // 内缘一道更亮的细线，只在近处看得见
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = band * 0.32;
      ring(0.9);
      ctx.globalAlpha = 1;
    },

    /* 呼吸：整环一起涨落，很慢。delta 太近就淡掉——环不该走到面前来 */
    motion(d, t) {
      const p = d.p;
      const k = d.key;
      const ph = R(k, 'ph') * 6.283;
      const sp = 0.00042 * (0.7 + R(k, 'w') * 0.6);
      const near = Math.min(1, Math.max(0, (d.delta - 0.78) / 0.42));
      return {
        dx: (R(k, 'x') - 0.5) * p.Pw * SCAT + Math.cos(t * sp + ph) * 44,
        dy: (R(k, 'y') - 0.5) * p.Ph * SCAT + Math.sin(t * sp * 1.23 + ph * 1.4) * 34,
        rot: (R(k, 'r') - 0.5) * 110 + Math.sin(t * sp * 0.4 + ph) * 3,
        scale: (0.72 + R(k, 's') * 0.63) * (1 + 0.045 * Math.sin(t * sp * 0.7 + ph)),
        // 呼吸不该让它消失，只该让它涨落
        alpha: near * (0.76 + 0.24 * Math.sin(t * sp * 0.9 + ph * 2)),
      };
    },
  });
})();
