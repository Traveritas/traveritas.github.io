/* 拾得 · 外壳：旋转对称的放射细线，分几层叠在不同深度上

   稀有度不靠光效，藏在花纹里：
     常见的几档是规整的几何（花瓣 / 圆 / 波 / 星），只画到一部分，像刚开始成形；
     越稀有，内侧越多「长出来」的层——从中心往外生长的枝，分叉、末端卷起、结一粒芽；
       大体对称，但每一支都有一点自己的偏差，最稀有的一档偏差最大；
       它是随着靠近焦平面一点点长出来的（远处只是一粒种子）。
     阶数、层数、转速照旧：越稀有阶数越高、层越多、转得越慢。

   前后关系（这一版的改动）：
     层按半径分圈，互不重叠；从里到外一层比一层远（单调，不再前后交替）；
     每一层底下垫一片很淡的「树脂片」（半透明的填色），后面的层要隔着前面几片才看得到——
     越往后越淡、线越细、越虚。

   build(item) → { tier, T, R, layers:[{ dz, rOut, r0, grow, rank, speed, phase, a, paths:[{ pts, o, d, lv }] }] }
     pts 单位坐标（层的外半径 = 1）；o / d：这一笔在「成形」进度里从哪儿开始、用多长画完；lv：粗细档（0 主干 → 3 芽）
   draw(ctx, layer, px, angle, c, sheet)：c = 完整度 0..1；sheet = { rgb, a } 树脂片的颜色 */
(() => {
  const TAU = Math.PI * 2;
  const hash = (...n) => {
    let h = 2166136261;
    for (const v of n) {
      const s = String(v);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };

  /* grow：内侧几层是生长纹；arms：生长纹的支数；jit：每一支的偏差 */
  const TIERS = [
    { folds: 6, layers: 2, base: 0.32, R: 120, speed: 0.16, dbl: 0, grow: 0 }, //       1/2 – 1/9
    { folds: 8, layers: 3, base: 0.5, R: 150, speed: 0.11, dbl: 0, grow: 0 }, //        1/10 – 1/99
    { folds: 12, layers: 3, base: 0.68, R: 185, speed: 0.07, dbl: 0, grow: 1, gw: 1.6, lvMax: 1, arms: 6, jit: 0.04 }, // 1/100 – 1/999
    { folds: 16, layers: 3, base: 0.84, R: 225, speed: 0.045, dbl: 1, grow: 1, gw: 2.4, lvMax: 2, arms: 6, jit: 0.1 }, // 1/1,000 – 1/99,999
    { folds: 24, layers: 3, base: 0.94, R: 260, speed: 0.022, dbl: 1, grow: 1, gw: 3.2, lvMax: 2, arms: 8, jit: 0.16 }, // 1/100,000 –
    { folds: 17, layers: 3, base: 1, R: 300, speed: 0.008, dbl: 1, grow: 1, gw: 4.2, lvMax: 3, arms: 7, jit: 0.26 }, // 1/100,000,000 –
  ];
  const tierOf = (odds) => {
    const e = Math.log10(Math.max(1, odds));
    return e < 1 ? 0 : e < 2 ? 1 : e < 3 ? 2 : e < 5 ? 3 : e < 8 ? 4 : 5;
  };

  /* ── 规整的纹样（单位坐标，返回 [{pts, k}]，k = 第几重） ── */
  const poly = (f, n) => {
    const a = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const [x, y] = f(i / n);
      a[i * 2] = x;
      a[i * 2 + 1] = y;
    }
    return a;
  };
  const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  const KINDS = {
    ring: (n, r0, r1) => [{ pts: poly((t) => P(r1, t * TAU), 160), k: 0 }],
    dots: (n, r0, r1) => Array.from({ length: n * 2 }, (_, k) => ({ pts: poly((t) => { const c = P(r1, (k / (n * 2)) * TAU); return [c[0] + Math.cos(t * TAU) * 0.012, c[1] + Math.sin(t * TAU) * 0.012]; }, 10), k: k >> 1 })),
    petals: (n, r0, r1, w) =>
      Array.from({ length: n }, (_, k) => {
        const a0 = (k / n) * TAU;
        const hw = (w * Math.PI) / n;
        return {
          k,
          pts: poly((t) => {
            const side = t < 0.5 ? 1 : -1;
            const u = t < 0.5 ? t * 2 : 2 - t * 2;
            return P(r0 + (r1 - r0) * u, a0 + side * hw * Math.sin(u * Math.PI));
          }, 48),
        };
      }),
    circles: (n, r0, r1) =>
      Array.from({ length: n }, (_, k) => {
        const c = P((r0 + r1) / 2, (k / n) * TAU);
        const rc = (r1 - r0) / 2;
        return { k, pts: poly((t) => [c[0] + Math.cos(t * TAU) * rc, c[1] + Math.sin(t * TAU) * rc], 56) };
      }),
    wave: (n, r0, r1) =>
      Array.from({ length: n }, (_, k) => ({
        k,
        pts: poly((t) => {
          const a = ((k + t) / n) * TAU;
          return P((r0 + r1) / 2 + ((r1 - r0) / 2) * Math.cos(n * a), a);
        }, 36),
      })),
    star: (n, r0, r1) => {
      const m = Math.max(2, Math.floor(n / 3));
      return Array.from({ length: n }, (_, k) => {
        const a = P(r1, (k / n) * TAU);
        const b = P(r1, ((k + m) / n) * TAU);
        return { k, pts: poly((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], 8) };
      });
    },
    rays: (n, r0, r1) =>
      Array.from({ length: n }, (_, k) => {
        const a = (k / n) * TAU + Math.PI / n;
        return { k, pts: poly((t) => P(r0 + (r1 - r0) * t, a), 6) };
      }),
    arcs: (n, r0, r1) =>
      Array.from({ length: n }, (_, k) => {
        const a = (k / n) * TAU;
        const span = (0.32 * TAU) / n;
        return { k, pts: poly((t) => P(r1, a - span + 2 * span * t), 14) };
      }),
  };
  const INNER = ['petals', 'circles', 'wave'];
  const OUTER = ['star', 'arcs', 'rays', 'wave'];
  const EDGE = ['arcs', 'dots', 'ring'];
  const CAP = { circles: 12, petals: 16, wave: 24, star: 24, rays: 48, arcs: 36, dots: 48, ring: 1 };
  const DENSE = { wave: 1, arcs: 1, star: 1, rays: 1 };

  /* ── 生长纹 ──
     每一支从内圈出发往外长：主干带一点弯，沿途分出两三根侧枝（有时左右对生、有时互生），
     侧枝末端有的卷起来，最后结一粒芽。形状由「这一层」决定（每支共用），偏差由「这一支」决定。 */
  function grow(n, r0, r1, rnd, jit, lvMax) {
    // 一道细环把各支连在一起（枝从环上长出去）
    const out = [{ pts: poly((t) => P(r0, t * TAU), 120), o: 0, d: 0.25, lv: 1 }];
    for (let k = 0; k < n; k++) {
      const J = (...key) => (hash(rnd.seed, 'arm', k, ...key) - 0.5) * 2 * jit;
      const a0 = (k / n) * TAU + J('a') * 0.5;
      branch(out, P(r0, a0), a0 + J('h') * 0.6, (r1 - r0) * 0.92 * (1 + J('l') * 0.6), 0, 0.08, 0.6, 'r', rnd, J, lvMax);
    }
    return out;
  }
  function branch(out, [x, y], heading, len, lv, o, d, id, rnd, J, lvMax) {
    const steps = [30, 18, 11, 7][lv];
    const bend = (rnd('b', id) - 0.5) * (lv ? 1.8 : 0.9) + J('b', id) * 1.4;
    const curl = lv && rnd('c', id) < 0.55 ? (rnd('cs', id) < 0.5 ? -1 : 1) * (3 + 4 * rnd('cm', id)) : 0;
    const pts = new Float32Array((steps + 1) * 2);
    const at = [];
    let h = heading;
    let px = x;
    let py = y;
    const ds = len / steps;
    for (let s = 0; s <= steps; s++) {
      pts[s * 2] = px;
      pts[s * 2 + 1] = py;
      at.push([px, py, h]);
      const t = s / steps;
      h += (bend + curl * t * t * t) / steps;
      px += Math.cos(h) * ds;
      py += Math.sin(h) * ds;
    }
    out.push({ pts, o, d, lv: Math.min(lv, 2) });
    if (lv >= lvMax) {
      // 芽
      const [ex, ey] = at[steps];
      const r = 0.012 + 0.01 * rnd('bud', id);
      out.push({ pts: poly((t) => [ex + Math.cos(t * TAU) * r, ey + Math.sin(t * TAU) * r], 10), o: Math.min(0.97, o + d), d: 0.06, lv: 3 });
      return;
    }
    const forks = lv === 0 ? [0.32, 0.56, 0.78] : [0.45, 0.72];
    forks.forEach((f, fi) => {
      if (rnd('skip', id, fi) < (lv ? 0.35 : 0.12)) return;
      const [bx, by, bh] = at[Math.round(f * steps)];
      const pair = lv === 0 && rnd('pair', id, fi) < 0.5; // 对生
      const sides = pair ? [1, -1] : [fi % 2 ? -1 : 1];
      for (const sd of sides) {
        const cid = `${id}${fi}${sd > 0 ? 'p' : 'n'}`;
        const ang = bh + sd * (0.5 + 0.45 * rnd('ang', id, fi)) * (1 + J('ang', cid) * 0.8);
        const cl = len * (0.5 - 0.1 * fi) * (0.8 + 0.4 * rnd('len', id, fi)) * (1 + J('len', cid));
        branch(out, [bx, by], ang, cl, lv + 1, o + f * d, d * 0.62, cid, rnd, J, lvMax);
      }
    });
  }

  function build(item) {
    const tier = tierOf(item.odds);
    const T = TIERS[tier];
    const nL = T.layers;
    // 分圈：生长纹的圈宽一些；圈与圈之间留一道缝，互不重叠
    const W = Array.from({ length: nL }, (_, i) => (i < T.grow ? T.gw : 1));
    const sum = W.reduce((a, b) => a + b, 0);
    const GAP = 0.035;
    const START = 0.24;
    let at = START;
    const layers = [];
    for (let i = 0; i < nL; i++) {
      const lid = `${item.id}:${i}`;
      const rnd = Object.assign((...k) => hash(lid, ...k), { seed: lid });
      const bw = ((1 - START - GAP * (nL - 1)) * W[i]) / sum;
      const rIn = at;
      const rOutU = at + bw;
      at = rOutU + GAP;
      const rOut = T.R * rOutU;
      const r0 = rIn / rOutU; // 本层单位坐标里的内圈
      const isGrow = i < T.grow;
      const edge = nL > 2 && i === nL - 1;
      const paths = [];
      if (isGrow) {
        paths.push(...grow(T.arms, r0, 1, rnd, T.jit, T.lvMax));
      } else {
        const list = edge ? EDGE : i < nL / 2 ? INNER : OUTER;
        const kind = list[Math.floor(rnd('kind') * list.length)];
        const fm = i === 0 ? 1 : [0.5, 1, 1, 2][Math.floor(rnd('fm') * 4)];
        const n = Math.max(3, Math.min(CAP[kind], Math.round(T.folds * fm)));
        const add = (arr) => { for (const p of arr) paths.push({ pts: p.pts, o: (p.k / n) / 3, d: 0.667, lv: 0 }); };
        const w = 0.35 + 0.3 * rnd('w');
        add(KINDS[kind](n, r0, 1, w));
        if (DENSE[kind]) for (let dd = 1; dd <= T.dbl; dd++) {
          const s = 1 - dd * 0.05;
          add(KINDS[kind](n, r0 * s, s, w));
        }
        if (!edge && rnd('ring') < 0.45) add(KINDS.ring(n, 0, Math.max(0.05, r0 - 0.02)));
      }
      // 生长纹偶尔伸出圈外一点：整体收回到外圈以内
      let M = 1;
      for (const p of paths) for (let j = 0; j < p.pts.length; j += 2) M = Math.max(M, Math.hypot(p.pts[j], p.pts[j + 1]));
      if (M > 1.04) for (const p of paths) for (let j = 0; j < p.pts.length; j++) p.pts[j] /= M / 1.04;
      const rank = nL > 1 ? i / (nL - 1) : 0;
      layers.push({
        i,
        rOut,
        r0,
        grow: isGrow,
        rank,
        // 从里到外一层比一层远；最里一层贴着物件、略靠前
        dz: -0.015 + rank * 0.15,
        speed: T.speed * (0.65 + 0.7 * rnd('sp')) * (i % 2 ? -1 : 1) * (isGrow ? 0.35 : 1),
        phase: rnd('ph') * TAU,
        a: 1,
        paths,
      });
    }
    return { tier, T, R: T.R, layers };
  }

  /* 画一层：px = 画布边长；c = 完整度；sheet = 树脂片 */
  const LV_W = [1, 0.72, 0.5, 0.5];
  function draw(ctx, layer, px, angle, c, sheet) {
    const r = (px / 2) * 0.92;
    const cx = px / 2;
    if (sheet && sheet.a > 0) {
      // 一片很淡的半透明圆片 / 圆环：中间实、两边虚，没有硬边
      const r0 = layer.i === 0 ? 0 : layer.r0 * r * 0.9;
      const g = ctx.createRadialGradient(cx, cx, r0, cx, cx, r * 1.04);
      g.addColorStop(0, `rgb(${sheet.rgb} / 0)`);
      g.addColorStop(layer.i === 0 ? 0.05 : 0.25, `rgb(${sheet.rgb} / ${sheet.a})`);
      g.addColorStop(0.78, `rgb(${sheet.rgb} / ${sheet.a * 0.8})`);
      g.addColorStop(1, `rgb(${sheet.rgb} / 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cx, r * 1.04, 0, TAU);
      ctx.fill();
    }
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const base = ctx.lineWidth;
    for (let lv = 0; lv < 4; lv++) {
      ctx.lineWidth = Math.max(0.5, base * LV_W[lv]);
      ctx.beginPath();
      let any = false;
      for (const p of layer.paths) {
        if (p.lv !== lv) continue;
        const f = Math.min(1, Math.max(0, (c - p.o) / p.d));
        if (f <= 0) continue;
        any = true;
        const pts = p.pts;
        const n = pts.length / 2 - 1;
        const end = f * n;
        for (let j = 0; j <= Math.ceil(end); j++) {
          let x = pts[j * 2];
          let y = pts[j * 2 + 1];
          if (j > end) {
            const q = end - (j - 1);
            x = pts[(j - 1) * 2] + (x - pts[(j - 1) * 2]) * q;
            y = pts[(j - 1) * 2 + 1] + (y - pts[(j - 1) * 2 + 1]) * q;
          }
          const X = cx + (x * ca - y * sa) * r;
          const Y = cx + (x * sa + y * ca) * r;
          j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
      }
      if (any) ctx.stroke();
    }
    ctx.lineWidth = base;
  }

  window.CollectOrnament = { build, draw, tierOf, TIERS };
})();
