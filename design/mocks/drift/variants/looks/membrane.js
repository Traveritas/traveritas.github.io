/* 薄膜：极薄的一层膜，边缘压着低饱和的干涉色带——淡紫 / 淡青 / 淡金，
   像肥皂泡或油膜那样只在边上看得出颜色。四个里最轻的一个：
   花心几乎透过去，靠一圈界线与那点异质色把边界认出来。
   少量克制异质色作记忆点，别的三个都不带颜色，这里可以带。 */
(() => {
  'use strict';
  const { rgba, hash } = DriftReg;

  const PAD = 18;
  const INSET = 6;
  const BANDS = [[3.5, 0.42], [8, 0.32], [12.5, 0.22], [17, 0.12]]; // [离边多远, 浓度]

  /* 干涉色：一条从淡紫到淡青再到淡金的带，四条色带共用这一道渐变 */
  const IRID = {
    essay: { a: [166, 152, 222], b: [136, 198, 216], c: [228, 196, 138], line: [88, 84, 128], hi: [255, 255, 255] },
    project: { a: [146, 132, 212], b: [122, 198, 216], c: [220, 186, 132], line: [8, 12, 26], hi: [196, 234, 244] },
    moment: { a: [188, 142, 212], b: [140, 190, 214], c: [232, 186, 140], line: [14, 8, 22], hi: [255, 232, 210] },
  };

  const seedOf = (it) => {
    let s = 2166136261;
    for (let i = 0; i < it.id.length; i++) s = Math.imul(s ^ it.id.charCodeAt(i), 16777619);
    return s >>> 0;
  };
  const rgb = (str) => {
    if (str[0] === '#') { const v = parseInt(str.slice(1), 16); return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: 1 }; }
    const p = /rgba?\(([^)]+)\)/.exec(str)[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const tint = (str, k) => { const q = rgb(str); return `rgba(${q.r}, ${q.g}, ${q.b}, ${+(q.a * k).toFixed(3)})`; };

  /* 膜的轮廓：切角 + 边微微鼓起，四边的鼓与切都不对称——
     一条直边会立刻把它变回矩形。k = 往里收多少（负数是往外扩）。 */
  function film(ctx, M, w, h, s, k) {
    const x = M + k;
    const y = M + k;
    const ww = w - 2 * k;
    const hh = h - 2 * k;
    const c = (i) => Math.max(3, 8 + hash(s, i) * 9 - k * 0.9);
    const o = (i) => hash(s, 100 + i) * 6;
    const om = (i) => o(i) + 3; // 边中鼓一点：膜被绷着的样子
    const P = [
      [x + c(1), y - o(1)],
      [x + ww / 2, y - om(2)],
      [x + ww - c(3), y - o(3)],
      [x + ww + o(4), y + c(4)],
      [x + ww + om(5), y + hh / 2],
      [x + ww + o(6), y + hh - c(6)],
      [x + ww - c(7), y + hh + o(7)],
      [x + ww / 2, y + hh + om(8)],
      [x + c(9), y + hh + o(9)],
      [x - o(10), y + hh - c(10)],
      [x - om(11), y + hh / 2],
      [x - o(12), y + c(12)],
    ];
    ctx.beginPath();
    P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }

  /* 投影：外形错开一点、糊开了画在下面。远处降采样后就是一圈柔和的暗。
     不用网点：网点在浅色底上会散成一片小点，看着像脏；而且复杂外形的 clip
     会让每一格都重走一遍路径，几千格就是几秒。 */
  function shadow(ctx, c, alpha, path) {
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.translate(6, 8);
    ctx.fillStyle = rgba(c.drop, alpha);
    path(ctx);
    ctx.fill();
    ctx.restore();
  }

  DriftReg.look('membrane', {
    label: '薄膜',
    margin: PAD,
    inset: INSET,

    surface(ctx, it, c, M) {
      const { w, h } = it;
      const t = IRID[it.scene] || IRID.essay;
      const s = seedOf(it);

      shadow(ctx, c, it.scene === 'essay' ? 0.30 : 0.42, (x) => film(x, M, w, h, s, 0));

      ctx.save();
      film(ctx, M, w, h, s, 0);
      ctx.clip();

      // 一层极薄的膜：花心几乎透过去，越往边上越实
      ctx.save();
      ctx.translate(M + w / 2, M + h / 2);
      ctx.scale(w * 0.54, h * 0.64);
      const body = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      body.addColorStop(0, tint(c.fill, 0.34));
      body.addColorStop(0.55, tint(c.fill, 0.58));
      body.addColorStop(1, tint(c.fill, 0.95));
      ctx.fillStyle = body;
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();

      // 迎光的一侧薄薄提亮、对角压一点：远处降采样后至少还留着明暗
      const wash = ctx.createLinearGradient(M, M, M + w, M + h);
      wash.addColorStop(0, rgba(t.hi, 0.16));
      wash.addColorStop(0.55, rgba(t.hi, 0.02));
      wash.addColorStop(1, rgba(t.line, 0.10));
      ctx.fillStyle = wash;
      ctx.fillRect(M - PAD, M - PAD, w + 2 * PAD, h + 2 * PAD);

      // 干涉色带：只在边上露，越往里越淡
      const irid = ctx.createLinearGradient(M - PAD, M - PAD, M + w + PAD, M + h + PAD);
      irid.addColorStop(0, rgba(t.a, 1));
      irid.addColorStop(0.5, rgba(t.b, 1));
      irid.addColorStop(1, rgba(t.c, 1));
      ctx.strokeStyle = irid;
      ctx.lineWidth = 6;
      for (const [k, a] of BANDS) {
        ctx.globalAlpha = a;
        film(ctx, M, w, h, s, k);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // 界线：外面一线暗（浅色底上认得出边界），里面一线亮
      film(ctx, M, w, h, s, 0);
      ctx.strokeStyle = rgba(t.line, it.scene === 'essay' ? 0.40 : 0.52);
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = rgba(t.hi, 0.42);
      ctx.lineWidth = 1.8;
      film(ctx, M, w, h, s, 2.4);
      ctx.stroke();

      // 膜外的一点晕：极淡，让边界不至于切得太硬
      ctx.strokeStyle = rgba(t.a, 0.13);
      ctx.lineWidth = 7;
      film(ctx, M, w, h, s, -4);
      ctx.stroke();
    },
  });
})();
