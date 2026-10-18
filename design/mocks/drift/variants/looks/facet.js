/* 棱面：一块被切过的碎水晶。
   卡面由若干多边形棱面拼成，每块的明暗与偏色略有出入——近处看是折射与内反射，
   降采样到远处就只剩明暗面：一块碎块，而不是一张发白的玻璃方片。
   外沿一亮一暗两道棱，是它在浅色底上也能立住的原因。 */
(() => {
  'use strict';
  const { rgba, hash } = DriftReg;

  const PAD = 20;   // 画到卡外的余量：碎块的尖角、棱光与投影都在这里
  const NSEED = 8;  // 棱面的块数

  /* 场景的玻璃色：迎光面 / 背光面 / 一点折射进来的偏色 */
  const TONE = {
    essay: { hi: [255, 255, 255], lo: [72, 88, 120], warm: [200, 214, 246] },
    project: { hi: [188, 228, 240], lo: [0, 0, 0], warm: [112, 188, 212] },
    moment: { hi: [255, 226, 198], lo: [0, 0, 0], warm: [226, 164, 136] },
  };

  /* 同一张卡每次画出来都一样，不同卡不一样 */
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

  /* 凸多边形被一条直线切掉一半（Sutherland–Hodgman 的一步） */
  function halfPlane(poly, nx, ny, d) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = nx * a[0] + ny * a[1] - d;
      const db = nx * b[0] + ny * b[1] - d;
      if (da <= 0) out.push(a);
      if ((da < 0) !== (db < 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  /* 一块棱面 = 一个种子点的 Voronoi 单元：矩形被与其余种子的中垂线一块块切出来 */
  function cell(box, pts, i) {
    let poly = box;
    const [x0, y0] = pts[i];
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const [x1, y1] = pts[j];
      poly = halfPlane(poly, x1 - x0, y1 - y0, (x1 * x1 + y1 * y1 - x0 * x0 - y0 * y0) / 2);
      if (poly.length < 3) return null;
    }
    return poly;
  }

  /* 种子绕中心一圈，半径与角度都错开：切出来的棱面大小不匀，才像天然的解理 */
  function seeds(cx, cy, w, h, s) {
    const pts = [];
    for (let i = 0; i < NSEED; i++) {
      const a = (i / NSEED) * Math.PI * 2 + (hash(s, 60 + i) - 0.5) * 1.0;
      const r = 0.30 + hash(s, 80 + i) * 0.56;
      pts.push([cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r]);
    }
    return pts;
  }

  /* 碎块外形：四角沿对角线拉出去，边仍是直的——像切割过的一块料。
     四角都落在卡片矩形之外，正文区因此一定被盖住。 */
  function shard(ctx, M, w, h, s) {
    const C = (k) => 5 + hash(s, k) * (PAD - 7);
    const TL = [M - C(1), M - C(2)];
    const TR = [M + w + C(3), M - C(4)];
    const BR = [M + w + C(5), M + h + C(6)];
    const BL = [M - C(7), M + h + C(8)];
    const along = (a, b, k) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      const nx = dy / L;
      const ny = -dx / L;
      return [0.32, 0.68].map((t, i) => {
        const j = (hash(s, k + i * 13) - 0.5) * 3;
        return [a[0] + dx * t + nx * j, a[1] + dy * t + ny * j];
      });
    };
    ctx.beginPath();
    ctx.moveTo(TL[0], TL[1]);
    for (const p of along(TL, TR, 11)) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(TR[0], TR[1]);
    for (const p of along(TR, BR, 21)) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(BR[0], BR[1]);
    for (const p of along(BR, BL, 31)) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(BL[0], BL[1]);
    for (const p of along(BL, TL, 41)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    return [TL, TR, BR, BL];
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

  DriftReg.look('facet', {
    label: '棱面',
    margin: PAD,

    surface(ctx, it, c, M) {
      const { w, h } = it;
      const t = TONE[it.scene] || TONE.essay;
      const s = seedOf(it);
      const cx = M + w / 2;
      const cy = M + h / 2;
      const box = [[M - PAD, M - PAD], [M + w + PAD, M - PAD], [M + w + PAD, M + h + PAD], [M - PAD, M + h + PAD]];

      shadow(ctx, c, it.scene === 'essay' ? 0.44 : 0.55, (x) => shard(x, M, w, h, s));

      ctx.save();
      shard(ctx, M, w, h, s);
      ctx.clip();
      ctx.fillStyle = tint(c.fill, 0.88);
      ctx.fillRect(M - PAD, M - PAD, w + 2 * PAD, h + 2 * PAD);

      // 棱面：明暗按它在光里的位置定，再各带一点抖动与偏色
      const pts = seeds(cx, cy, w, h, s);
      const L = Math.hypot(w, h) / 2;
      for (let i = 0; i < pts.length; i++) {
        const poly = cell(box, pts, i);
        if (!poly) continue;
        let ax = 0;
        let ay = 0;
        for (const p of poly) { ax += p[0]; ay += p[1]; }
        ax /= poly.length;
        ay /= poly.length;
        const proj = ((cx - ax) * 0.72 + (cy - ay) * 0.69) / L; // 左上为正
        const jit = (hash(s, 120 + i) - 0.5) * 0.06;
        ctx.beginPath();
        poly.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fillStyle = proj >= 0
          ? rgba(t.hi, Math.min(0.32, 0.04 + proj * 0.30 + jit))
          : rgba(t.lo, Math.min(0.34, 0.04 - proj * 0.32 + jit));
        ctx.fill();
        // 一两条偏色的面：像有别处的光折进来
        if (hash(s, 200 + i) < 0.45) {
          ctx.fillStyle = rgba(t.warm, 0.05 + hash(s, 300 + i) * 0.06);
          ctx.fill();
        }
        // 棱线：近处才看得见的一圈内反射
        ctx.strokeStyle = rgba(t.hi, 0.12 + hash(s, 400 + i) * 0.10);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 迎光的一侧薄薄提亮、对角沉下去：远处就剩这两个明暗面
      const wash = ctx.createLinearGradient(M - PAD, M - PAD, M + w + PAD, M + h + PAD);
      wash.addColorStop(0, rgba(t.hi, 0.18));
      wash.addColorStop(0.45, rgba(t.hi, 0.02));
      wash.addColorStop(0.55, rgba(t.lo, 0.04));
      wash.addColorStop(1, rgba(t.lo, 0.22));
      ctx.fillStyle = wash;
      ctx.fillRect(M - PAD, M - PAD, w + 2 * PAD, h + 2 * PAD);
      ctx.restore();

      // 外沿：一道亮棱、对角一道暗棱
      const rim = ctx.createLinearGradient(M - PAD, M - PAD, M + w + PAD, M + h + PAD);
      rim.addColorStop(0, rgba(t.hi, 0.90));
      rim.addColorStop(0.40, rgba(t.hi, 0.34));
      rim.addColorStop(0.60, rgba(t.lo, 0.24));
      rim.addColorStop(1, rgba(t.lo, 0.60));
      const [TL, TR] = shard(ctx, M, w, h, s);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 5;
      ctx.stroke();

      // 一道短的亮棱：降采样后就是边上最亮的一格，碎块的「脆」全在这里
      ctx.beginPath();
      ctx.moveTo(TL[0] + (TR[0] - TL[0]) * 0.28, TL[1] + (TR[1] - TL[1]) * 0.28);
      ctx.lineTo(TL[0] + (TR[0] - TL[0]) * 0.60, TL[1] + (TR[1] - TL[1]) * 0.60);
      ctx.strokeStyle = rgba(t.hi, 0.75);
      ctx.lineWidth = 7;
      ctx.stroke();
    },
  });
})();
