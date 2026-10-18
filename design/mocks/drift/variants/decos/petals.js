/* 落花：几片半透明的花瓣在空间里慢慢旋着往下落。
   浮尘让「空」有厚度，落花让空里有事正在发生——
   近处看得清花型（百合式的简约轮廓，两肩一高一低、尖端偏向一侧），远处只剩一块色斑。 */
(() => {
  'use strict';
  const { rgba } = DriftReg;

  /* 每片自己的随机数：key 是它的格位，同一个 key 永远得到同一片花。
     位置、大小、相位都从这里再散一次——同一个格子里的几片不该落在同一处。 */
  const R = (key, salt) => {
    let h = 2166136261;
    const s = `${key}|${salt}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  /* 散开的幅度（相对格宽）。超过半个格，花瓣会漂出本格的覆盖范围、在屏幕外被换掉 */
  const SCAT = 0.35;

  /* 花瓣的色：粉是温度与记忆。
     `k` 是这一场景里该压多实——浅底的随笔上，太淡的花会整片化掉；
     深靛的项目上，同样的量已经够亮。 */
  const TINT = {
    essay: { k: 1, deep: [196, 136, 164], pale: [255, 238, 242], vein: [172, 106, 136], rim: [255, 251, 253] },
    project: { k: 0.6, deep: [212, 154, 184], pale: [255, 244, 249], vein: [182, 116, 156], rim: [255, 250, 253] },
    moment: { k: 0.78, deep: [226, 160, 158], pale: [255, 238, 226], vein: [192, 120, 116], rim: [255, 248, 240] },
  };

  /* 花瓣轮廓：底端收成一点，最宽处偏下，两肩一鼓一收、尖端偏向一侧——
     花型不该是机械放射对称的。 */
  function petalPath(ctx, x, y, w, h) {
    const cx = x + w / 2;
    const bx = cx - w * 0.05;
    const tx = cx + w * 0.13;
    const base = y + h;
    ctx.beginPath();
    ctx.moveTo(bx, base);
    ctx.bezierCurveTo(cx - w * 0.46, base - h * 0.26, tx - w * 0.42, base - h * 0.7, tx, y);
    ctx.bezierCurveTo(tx + w * 0.36, base - h * 0.72, bx + w * 0.44, base - h * 0.24, bx, base);
    ctx.closePath();
  }

  DriftReg.deco('petals', {
    label: '落花',
    perTile: 2,
    spread: 1.25,
    alpha: 0.75,
    margin: 6,
    /* 一个形状就够：同一片花靠旋转与缩放长出各自的姿态 */
    shapes: [{ w: 54, h: 88 }],

    paint(ctx, sh, { scene, M }) {
      const t = TINT[scene] || TINT.essay;
      const k = t.k;
      const { w, h } = sh;
      const x = M;
      const y = M;
      // 底色：根部深、尖端浅——一片透光的树脂
      petalPath(ctx, x, y, w, h);
      const g = ctx.createLinearGradient(0, y + h, 0, y);
      g.addColorStop(0, rgba(t.deep, 0.78 * k));
      g.addColorStop(0.52, rgba(t.deep, 0.46 * k));
      g.addColorStop(1, rgba(t.pale, 0.66 * k));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // 侧向的明暗：中脉一侧迎光、另一侧沉下去，薄片才有厚度
      const s = ctx.createLinearGradient(x, y + h * 0.2, x + w, y + h * 0.9);
      s.addColorStop(0, rgba(t.pale, 0.42 * k));
      s.addColorStop(0.46, rgba(t.pale, 0.06));
      s.addColorStop(1, rgba(t.vein, 0.32 * k));
      ctx.fillStyle = s;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      // 中脉与边光：只有清晰档看得见，远了自然化掉
      ctx.strokeStyle = rgba(t.vein, 0.38 * k);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.44, y + h * 0.96);
      ctx.quadraticCurveTo(x + w * 0.46, y + h * 0.52, x + w * 0.62, y + h * 0.05);
      ctx.stroke();
      petalPath(ctx, x, y, w, h);
      ctx.strokeStyle = rgba(t.rim, 0.5 * k);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    },

    /* 一趟落下的时间与行程都由 key 定；两端把不透明度化掉，
       回位的瞬间就落在一片淡出里，看不见。 */
    motion(d, t) {
      const p = d.p;
      const k = d.key;
      const ph = R(k, 'ph') * 6.283;
      const sp = 0.0004 * (0.7 + R(k, 'w') * 0.8);
      const size = 0.62 + R(k, 's') * 0.9;
      const T = 22000 + R(k, 'T') * 16000;
      const u = (t / T + R(k, 'u')) % 1;
      const fade = Math.min(1, u / 0.15, (1 - u) / 0.15);
      return {
        dx: (R(k, 'x') - 0.5) * p.Pw * SCAT + Math.cos(t * sp + ph) * (26 + 26 * size) + Math.sin(t * sp * 0.37 + ph) * 22,
        dy: (R(k, 'y') - 0.5) * p.Ph * SCAT + u * (190 + 150 * size) + Math.sin(t * sp * 0.83 + ph * 1.6) * (20 + 16 * size),
        rot: (R(k, 'r') - 0.5) * 150 + t * 0.0015 * (R(k, 'dir') < 0.5 ? -1 : 1) + Math.sin(t * sp * 0.55 + ph) * 11,
        scale: size,
        alpha: fade * (0.72 + 0.28 * Math.sin(t * sp * 2.3 + ph)),
      };
    },
  });
})();
