/* 花瓣：一朵俯视的百合——四片宽瓣从一个花心甩向四个角，瓣长、开角、两侧的宽
   都各抖一点，不做机械的放射对称。瓣最宽处在靠瓣根的一侧，往瓣尖收成一条长尖，
   花心因此薄、瓣缘厚；亮棱只落在四个角上（描满一圈会读成「卡上画了一个圈」）。
   背面还压着一片更短更淡的瓣，把外形往外带一点，也给一点层次。
   正文收在花心那块干净的矩形里。 */
(() => {
  'use strict';
  const { rgba, hash } = DriftReg;

  const PAD = 42;   // 花瓣甩到卡外，余量要够（太窄时瓣尖会撞上画布边、被切成圆的）
  const INSET = 12; // 正文收进花心
  const N = 16;     // 每条侧线的采样段数

  const TONE = {
    essay: { hi: [255, 255, 255], lo: [78, 94, 126], warm: [246, 228, 226] },
    project: { hi: [190, 230, 242], lo: [0, 0, 0], warm: [226, 176, 158] },
    moment: { hi: [255, 230, 204], lo: [0, 0, 0], warm: [240, 186, 160] },
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

  /* 瓣的宽度曲线：最宽处在靠瓣根的一侧（约三分之一处），往瓣尖收成一条长而尖的
     尾巴。两头都收尖、中间鼓，才像花瓣而不是椭圆——也正因为靠瓣根处已经够宽，
     四个角才能被盖住。瓣尖那一段收得比瓣根急，尖才立得起来。 */
  const prof = (t) => (Math.pow(t, 0.35) * Math.pow(1 - t, 1.45)) / 0.4121;

  /* 一片瓣上的一点：t 沿轴，side 取两侧（一宽一窄）。轮廓的抖动是两条慢波——
     快波会让边看起来是脏的，慢波才像长的。 */
  function sidePoint(p, t, side) {
    const dx = p.tx - p.bx;
    const dy = p.ty - p.by;
    const L = Math.hypot(dx, dy);
    const nx = dy / L;
    const ny = -dx / L;
    const ph = p.ph + (side > 0 ? 0 : 2.1);
    const o = (side > 0 ? p.w1 : p.w2) * prof(t) + Math.sin(t * 4.6 + ph) * 2.6 + Math.sin(t * 11.3 + ph * 2) * 1.2;
    const k = side > 0 ? 1 : -1;
    return [p.bx + dx * t + nx * o * k, p.by + dy * t + ny * o * k];
  }

  /* 瓣的路径。给了 t0 就只走靠近瓣尖的那一段（亮棱只描这一段）。 */
  function petal(ctx, p, t0) {
    const a = t0 || 0;
    const s0 = sidePoint(p, a, 1);
    ctx.moveTo(s0[0], s0[1]);
    for (let i = 1; i < N; i++) {
      const q = sidePoint(p, a + (1 - a) * (i / N), 1);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.lineTo(p.tx, p.ty);
    for (let i = N - 1; i >= 1; i--) {
      const q = sidePoint(p, a + (1 - a) * (i / N), -1);
      ctx.lineTo(q[0], q[1]);
    }
    if (!t0) ctx.closePath();
  }

  /* 四片主瓣各甩向一个角。瓣长取「到画布边界的那一段」的 0.84–1.0：永远甩不出画布，
     长短还各不相同；瓣根在花心附近抖一点，四片就不是放射对称的。 */
  function geo(it, M) {
    const { w, h } = it;
    const s = seedOf(it);
    const cx = M + w / 2;
    const cy = M + h / 2;
    const X0 = M - PAD + 4;
    const X1 = M + w + PAD - 4;
    const Y0 = M - PAD + 4;
    const Y1 = M + h + PAD - 4;
    const mk = (k, sx, sy) => {
      const bx = cx + (hash(s, k + 5) - 0.5) * w * 0.10;
      const by = cy + (hash(s, k + 6) - 0.5) * h * 0.10;
      const a = Math.atan2(sy * (h / 2 + PAD * 0.62), sx * (w / 2 + PAD * 0.62)) + (hash(s, k + 1) - 0.5) * 0.26;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const ex = dx > 1e-6 ? (X1 - bx) / dx : dx < -1e-6 ? (X0 - bx) / dx : Infinity;
      const ey = dy > 1e-6 ? (Y1 - by) / dy : dy < -1e-6 ? (Y0 - by) / dy : Infinity;
      const L = Math.min(ex, ey) * (0.90 + hash(s, k) * 0.10);
      const jw = 0.94 + hash(s, k + 7) * 0.12;
      return {
        bx,
        by,
        tx: bx + dx * L,
        ty: by + dy * L,
        w1: w * 0.33 * jw,
        w2: w * 0.37 * jw,
        ph: hash(s, k + 4) * 6.283,
      };
    };
    const A = mk(10, -1, -1);
    const B = mk(20, 1, -1);
    const C = mk(30, 1, 1);
    const D = mk(40, -1, 1);
    // 背面那片：更短更淡，往左下甩出去
    const E = {
      bx: cx,
      by: cy + h * 0.06,
      tx: cx - w * (0.26 + hash(s, 51) * 0.10),
      ty: cy + h * (0.46 + hash(s, 52) * 0.12),
      w1: w * 0.18,
      w2: w * 0.22,
      ph: hash(s, 53) * 6.283,
    };
    return [E, A, B, C, D];
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

  DriftReg.look('petal', {
    label: '花瓣',
    margin: PAD,
    inset: INSET,

    surface(ctx, it, c, M) {
      const { w, h } = it;
      const t = TONE[it.scene] || TONE.essay;
      const g = geo(it, M);
      const cx = M + w / 2;
      const cy = M + h / 2;
      const main = (x) => { x.beginPath(); for (let i = 1; i < g.length; i++) petal(x, g[i]); };

      shadow(ctx, c, it.scene === 'essay' ? 0.42 : 0.54, main);

      // 背面那片：更淡，先把外形往外带一点
      ctx.beginPath();
      petal(ctx, g[0]);
      ctx.fillStyle = tint(c.fill, 0.44);
      ctx.fill();

      // 四片主瓣：一个联合的路径一次填掉——花心薄，往瓣缘一层层厚起来
      ctx.beginPath();
      for (let i = 1; i < g.length; i++) petal(ctx, g[i]);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(w * 0.52, h * 0.60);
      const body = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      body.addColorStop(0, tint(c.fill, 0.50));
      body.addColorStop(0.5, tint(c.fill, 0.74));
      body.addColorStop(0.82, tint(c.fill, 0.92));
      body.addColorStop(1, tint(c.fill, 1));
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      // 花心：一层极淡的暖，像光从瓣里透过来
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(w * 0.28, h * 0.30);
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      core.addColorStop(0, rgba(t.warm, 0.15));
      core.addColorStop(1, rgba(t.warm, 0));
      ctx.fillStyle = core;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();

      // 界线：只描每片瓣「最宽处往瓣尖」的那一半。描到瓣根的话，四片的根部会在
      // 花心周围各连出一个圈，交叠起来就是几道横穿卡面的圆弧——那是这一版最早
      // 的毛病。瓣根那一半本来就埋在别的瓣下面，不描也看不见。
      for (let i = 1; i < g.length; i++) {
        const p = g[i];
        const edge = ctx.createLinearGradient(p.bx, p.by, p.tx, p.ty);
        edge.addColorStop(0, rgba(t.lo, 0));
        edge.addColorStop(0.5, rgba(t.lo, 0.22));
        edge.addColorStop(1, rgba(t.lo, 0.40));
        ctx.beginPath();
        petal(ctx, p, 0.5);
        ctx.strokeStyle = edge;
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      // 瓣缘：只描靠近瓣尖的那一段——亮棱落在四个角上，尖部最亮
      for (let i = 1; i < g.length; i++) {
        const p = g[i];
        const rim = ctx.createLinearGradient(p.bx, p.by, p.tx, p.ty);
        rim.addColorStop(0, rgba(t.hi, 0));
        rim.addColorStop(0.5, rgba(t.hi, 0.30));
        rim.addColorStop(1, rgba(t.hi, 0.85));
        ctx.beginPath();
        petal(ctx, p, 0.42);
        ctx.strokeStyle = rim;
        ctx.lineWidth = 4.5;
        ctx.stroke();
      }
    },
  });
})();
