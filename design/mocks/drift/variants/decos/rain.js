/* 细雨：垂直、微微倾斜的细线从上方缓缓落下，给空间一层「正在发生的事」。
   一条线就是一个实例；远处被降采样吃掉是意料之中的——雨的远，本来就该只剩一点湿意。 */
(() => {
  'use strict';
  const { rgba } = DriftReg;

  /* 位置、长短、相位从 key 再散一次，雨才不成列 */
  const R = (key, salt) => {
    let h = 2166136261;
    const s = `${key}|${salt}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  const SCAT = 0.35;

  /* 雨是蓝的：距离与安静。浅底的随笔上要用偏灰的蓝才看得见——
     近白的雨丝落在近白的雾里，等于没有。 */
  const TINT = {
    essay: { k: 1, c: [128, 152, 188] },
    project: { k: 0.95, c: [176, 214, 232] },
    moment: { k: 0.95, c: [214, 208, 236] },
  };

  DriftReg.deco('rain', {
    label: '细雨',
    perTile: 4,
    spread: 0.9,
    alpha: 0.66,
    margin: 3,
    /* 7 单位宽、150 长：细，但比降采样的粒度粗一点，中近处才留得住 */
    shapes: [{ w: 7, h: 150 }],

    paint(ctx, sh, { scene, M }) {
      const d = TINT[scene] || TINT.essay;
      const t = d.c;
      const k = d.k;
      const { w, h } = sh;
      const x = M;
      const y = M;
      // 上端几乎没有、越往下越实——像是刚刚划过这一格
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, rgba(t, 0));
      g.addColorStop(0.24, rgba(t, 0.36 * k));
      g.addColorStop(0.84, rgba(t, 1 * k));
      g.addColorStop(1, rgba(t, 0.3 * k));
      ctx.fillStyle = g;
      // 外圈化开一点，细线才不至于硬成一道划痕
      ctx.globalAlpha = 0.42;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      const cw = Math.max(2, w * 0.5);
      ctx.fillRect(x + (w - cw) / 2, y, cw, h);
    },

    /* 一趟落下由 u 驱动，两端把不透明度化掉，回位的瞬间就不会被看见；
       越远缩得越小、也越淡——雨在深处只剩一点湿意。 */
    motion(d, t) {
      const p = d.p;
      const k = d.key;
      const ph = R(k, 'ph') * 6.283;
      const size = 0.6 + R(k, 's') * 0.8;
      const T = 2600 + R(k, 'T') * 1500;
      const u = (t / T + R(k, 'u')) % 1;
      const fade = Math.min(1, u / 0.13, (1 - u) / 0.13);
      const far = Math.min(1, Math.max(0, (d.delta - 0.7) / 1.1));
      return {
        dx: (R(k, 'x') - 0.5) * p.Pw * SCAT + Math.sin(t * 0.0007 + ph) * 5,
        dy: (R(k, 'y') - 0.5) * p.Ph * SCAT + u * (190 + 150 * size),
        // 全体朝同一个方向偏一点，只有极小的抖动——雨丝该是平行的
        rot: -4 + (R(k, 'r') - 0.5) * 2.4 + Math.sin(t * 0.0005 + ph) * 1.1,
        scale: size * (1 - 0.34 * far),
        alpha: fade * (0.6 + 0.4 * (1 - far)),
      };
    },
  });
})();
