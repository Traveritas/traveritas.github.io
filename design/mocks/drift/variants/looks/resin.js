/* 树脂：一块厚而圆润的半透明树脂。
   底子是场景的暖白，内部一团偏暖的散射晕、底部沉一点；边缘一圈更亮的边光，
   里面再压一道内棱——厚度感全在这两圈之间。圆角是量化成台阶的，仍留在像素语言里。
   正文压在深墨上，是四个外观里唯一「不透明地亮」的一个。 */
(() => {
  'use strict';
  const { rgba, hash } = DriftReg;

  const PAD = 20;  // 余量要容下边光的柔晕与投影
  const INSET = 8;
  const STEP = 6; // 圆角量化成几单位的台阶

  /* hi = 边光（跟着场景偏一点），warm = 内部散射，deep = 底部那点沉降
     （别用太饱和的褐，浅色底上会像被烤糊了一块） */
  const TONE = {
    essay: { hi: [255, 255, 255], warm: [255, 208, 164], deep: [122, 108, 92] },
    project: { hi: [216, 246, 252], warm: [255, 204, 156], deep: [104, 94, 82] },
    moment: { hi: [255, 238, 216], warm: [255, 200, 154], deep: [120, 100, 82] },
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

  /* 圆润的一团：圆角矩形，但弧线被量化到 step 的格子上——
     近处是台阶，降采样后仍是圆润的块，而不是方角。 */
  function blob(ctx, x, y, w, h, r, step) {
    const pts = [];
    const arc = (ax, ay, a0, a1) => {
      const n = Math.max(2, Math.ceil((r * Math.abs(a1 - a0)) / step));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n);
        pts.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]);
      }
    };
    arc(x + r, y + r, Math.PI, Math.PI * 1.5);
    arc(x + w - r, y + r, Math.PI * 1.5, Math.PI * 2);
    arc(x + w - r, y + h - r, 0, Math.PI * 0.5);
    arc(x + r, y + h - r, Math.PI * 0.5, Math.PI);
    ctx.beginPath();
    let px = 0;
    let py = 0;
    let first = true;
    for (const [ux, uy] of pts) {
      const qx = Math.round(ux / step) * step;
      const qy = Math.round(uy / step) * step;
      if (!first && qx === px && qy === py) continue;
      if (first) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
      first = false;
      px = qx;
      py = qy;
    }
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

  DriftReg.look('resin', {
    label: '树脂',
    margin: PAD,
    inset: INSET,
    paper: true, // 暖白的块上压深墨

    surface(ctx, it, c, M) {
      const { w, h } = it;
      const t = TONE[it.scene] || TONE.essay;
      const s = seedOf(it);
      const cx = M + w / 2;
      const cy = M + h / 2;
      const r = Math.max(26, Math.min(48, h * 0.16 * (0.92 + hash(s, 1) * 0.16)));
      const body = (x) => blob(x, M - 2, M - 2, w + 4, h + 4, r, STEP);

      shadow(ctx, c, it.scene === 'essay' ? 0.38 : 0.50, body);

      // 块外的一点渗出：树脂自己也在透一点光，边界因此不至于切得太硬
      ctx.save();
      blob(ctx, M - PAD, M - PAD, w + 2 * PAD, h + 2 * PAD, r + PAD, STEP);
      const bleed = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.24, cx, cy, Math.hypot(w, h) * 0.62);
      bleed.addColorStop(0, rgba(t.hi, 0.16));
      bleed.addColorStop(1, rgba(t.hi, 0));
      ctx.fillStyle = bleed;
      ctx.fill();
      ctx.restore();

      ctx.save();
      blob(ctx, M - 2, M - 2, w + 4, h + 4, r, STEP);
      ctx.clip();

      // 底子：场景的暖白，上面薄、往下厚
      const base = ctx.createLinearGradient(0, M, 0, M + h);
      base.addColorStop(0, tint(c.paper, 0.78));
      base.addColorStop(0.5, tint(c.paper, 0.86));
      base.addColorStop(1, tint(c.paper, 0.92));
      ctx.fillStyle = base;
      ctx.fillRect(M - PAD, M - PAD, w + 2 * PAD, h + 2 * PAD);

      // 内部散射：一团偏暖的晕，位置略偏左下
      ctx.save();
      ctx.translate(M + w * 0.44, M + h * 0.60);
      ctx.scale(w * 0.62, h * 0.78);
      const sc = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      sc.addColorStop(0, rgba(t.warm, 0.34));
      sc.addColorStop(0.55, rgba(t.warm, 0.14));
      sc.addColorStop(1, rgba(t.warm, 0));
      ctx.fillStyle = sc;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();

      // 迎光那一侧的一点高光芯
      ctx.save();
      ctx.translate(M + w * 0.36, M + h * 0.28);
      ctx.scale(w * 0.40, h * 0.46);
      const hot = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      hot.addColorStop(0, rgba(t.hi, 0.34));
      hot.addColorStop(1, rgba(t.hi, 0));
      ctx.fillStyle = hot;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();

      // 底部更沉：一点就够，多了会像烤糊
      const bot = ctx.createLinearGradient(0, M + h * 0.5, 0, M + h);
      bot.addColorStop(0, rgba(t.deep, 0));
      bot.addColorStop(1, rgba(t.deep, 0.20));
      ctx.fillStyle = bot;
      ctx.fillRect(M - PAD, M + h * 0.5, w + 2 * PAD, h * 0.5 + PAD);
      ctx.fillStyle = rgba(t.deep, 0.20);
      ctx.fillRect(M - PAD, M + h - 3, w + 2 * PAD, 3);
      ctx.restore();

      // 边光：先一圈宽的柔光，再一圈窄的亮棱
      const rim = ctx.createLinearGradient(M, M, M + w, M + h);
      rim.addColorStop(0, rgba(t.hi, 0.85));
      rim.addColorStop(0.45, rgba(t.hi, 0.42));
      rim.addColorStop(0.75, rgba(t.hi, 0.34));
      rim.addColorStop(1, rgba(t.hi, 0.55));
      ctx.strokeStyle = rim;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 9;
      body(ctx);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3.5;
      body(ctx);
      ctx.stroke();

      // 内棱：厚度感来自外棱与内棱之间那圈亮
      ctx.save();
      ctx.beginPath();
      ctx.rect(M - PAD, M - PAD, w + 2 * PAD, h * 0.66 + PAD);
      ctx.clip();
      ctx.strokeStyle = rgba(t.hi, 0.42);
      ctx.lineWidth = 6;
      blob(ctx, M + 9, M + 9, w - 18, h - 18, Math.max(14, r - 8), STEP);
      ctx.stroke();
      ctx.restore();
      // 内棱的下半段：只取底边那一段，别顺着两侧的角爬上去（那会像蹭脏了一块）
      ctx.save();
      ctx.beginPath();
      ctx.rect(M + 22, M + h * 0.72, w - 44, h * 0.28 + PAD);
      ctx.clip();
      ctx.strokeStyle = rgba(t.deep, 0.16);
      ctx.lineWidth = 6;
      blob(ctx, M + 9, M + 9, w - 18, h - 18, Math.max(14, r - 8), STEP);
      ctx.stroke();
      ctx.restore();
    },
  });
})();
