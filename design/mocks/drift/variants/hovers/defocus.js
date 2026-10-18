/* 退焦 · 悬停（接口见 variants/README.md 第 2 节）

   用「世界退焦」来突出目标：悬停的那一块留清楚，周围所有碎片被压粗一档、
   略降透明度——是别人的模糊换来的清晰。松开后它们隔一拍、一档对回来。

   这一块自己不加任何装饰：变化全在别处。 */
(() => {
  'use strict';

  /* 退焦的程度 0 → 1。进得快（≈0.14s），出得慢（≈0.3s），
     拿它去台阶式地加档，回来时才有「一档对回来」的余地。 */
  let q = 0;
  let hx = 0;
  let hy = 0;

  DriftReg.hover('defocus', {
    label: '退焦',
    clear: true, // 留下的那一块强制跳到最清楚档
    gate: () => true, // 粗块上也该有反馈：它周围的清楚度变化反而更明显
    tick(dt, t, api) {
      const h = api.hoverRec;
      const on = h && !api.reading;
      if (on) {
        hx = h.x;
        hy = h.y;
      }
      q += ((on ? 1 : 0) - q) * (api.RM ? 1 : 1 - Math.exp(-dt / (on ? 0.14 : 0.3)));
      if (!on && q < 0.02) q = 0;
    },
    lod(rec, lod, api) {
      if (rec === api.hoverRec) return lod; // clear 已经把它对到最清楚
      if (!q) return lod;
      /* 离留下那一块越远的，越早让出清晰度、也越晚对回来：模糊从它身边向外漫开，
         再沿同一条路退回。门槛拿 q 去比，回来就是一档一档的台阶，不是渐隐。 */
      const k = Math.min(1, Math.hypot(rec.x - hx, rec.y - hy) / (api.vh * 0.9));
      return q > 0.28 + (1 - k) * 0.6 ? lod + 1 : lod;
    },
    alpha(rec, a, api) {
      if (!q) return a;
      if (rec === api.hoverRec) return a + (1 - a) * 0.7 * q; // 留下的那一块浮起来一点
      return a * (1 - 0.22 * q);
    },
  });
})();
