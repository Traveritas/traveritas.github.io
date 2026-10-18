/* ─────────────────────────────────────────────────────────────
   天气：瞬间区的细雨、项目区的星尘（随笔区的「风」在流光着色器里）。

   不再是一个装饰一个 DOM 元素（drift 里细雨 200 个节点），而是两张低分辨率画布（1/3 视口，
   pixelated 放大）：一张在窗的后面，一张在窗的前面，只放少数几粒离镜头很近的。
   于是天气天然是像素的——和流光同一种颗粒，而窗保持干净。

   每粒有自己的深度 δ（与窗同一套：屏上缩放 G/δ，镜头推拉时一起穿过），
   位置在屏幕空间里按视差环绕，所以无限、也不用铺格子。
   每个场景只画在自己的区里（按斜缝裁），检索视图里雨只下在瞬间那一栏。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = 3; // 画布缩小倍数

  const hash = (a, b) => {
    let h = 2166136261;
    for (const s of [String(a), String(b)]) {
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* 两种天气的粒子：back 在窗后，front 在窗前（只取很近的几粒） */
  const SPEC = {
    moment: { kind: 'rain', back: 150, front: 10, tint: [214, 208, 236] },
    project: { kind: 'star', back: 110, front: 6, tint: [206, 226, 255] },
  };

  function particles(scene) {
    const sp = SPEC[scene];
    const out = [];
    const mk = (n, front) => {
      for (let i = 0; i < n; i++) {
        const k = `${scene}:${front ? 'f' : 'b'}:${i}`;
        out.push({
          front,
          ux: hash(k, 'x'),
          uy: hash(k, 'y'),
          // 深度：后层 0.75–2.4，前层 0.46–0.7（很大、很粗、很少）
          d0: front ? 0.46 + hash(k, 'd') * 0.24 : 0.75 + hash(k, 'd') * 1.65,
          ph: hash(k, 'p') * 6.283,
          T: 2600 + hash(k, 'T') * 1500,
          u0: hash(k, 'u'),
          size: 0.6 + hash(k, 's') * 0.8,
          sp: 0.6 + hash(k, 'w') * 0.8,
        });
      }
    };
    mk(sp.back, false);
    mk(sp.front, true);
    return out;
  }

  window.WanderWeather = function createWeather(back, front) {
    const bx = back.getContext('2d');
    const fx = front.getContext('2d');
    const P = { moment: particles('moment'), project: particles('project') };
    let W = 0;
    let H = 0;
    function resize() {
      W = back.width = front.width = Math.ceil(innerWidth / K);
      H = back.height = front.height = Math.ceil(innerHeight / K);
    }
    resize();

    function rain(ctx, p, sx, sy, s, a, tint, t) {
      const u = mod(t / p.T + p.u0, 1);
      const fade = Math.min(1, u / 0.13, (1 - u) / 0.13);
      const len = 150 * s * p.size;
      const fall = u * (190 + 150 * p.size) * s;
      const y0 = sy + fall;
      const lean = Math.tan((-4 * Math.PI) / 180);
      const x0 = sx;
      const y1 = y0 + len;
      const x1 = x0 - lean * len;
      const g = ctx.createLinearGradient(0, y0 / K, 0, y1 / K);
      const al = a * fade;
      g.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
      g.addColorStop(0.3, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.3 * al})`);
      g.addColorStop(0.86, `rgba(${tint[0]},${tint[1]},${tint[2]},${al})`);
      g.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.25 * al})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, (3.2 * s) / K);
      ctx.beginPath();
      ctx.moveTo(Math.round(x0 / K) + 0.5, y0 / K);
      ctx.lineTo(Math.round(x1 / K) + 0.5, y1 / K);
      ctx.stroke();
    }
    function star(ctx, p, sx, sy, s, a, tint, t) {
      const sp = 0.00004 * p.sp;
      const tw = 0.62 + 0.38 * Math.sin(t * sp * 9.1 + p.ph) * Math.sin(t * sp * 5.7 + p.ph * 2.3);
      const x = Math.round((sx + Math.cos(t * sp + p.ph) * 10 * s) / K);
      const y = Math.round((sy + Math.sin(t * sp * 0.83 + p.ph * 1.6) * 10 * s) / K);
      const al = a * (0.5 + 0.5 * tw);
      const c = `${tint[0]},${tint[1]},${tint[2]}`;
      const big = s * p.size > 1.1;
      // 一格亮芯 + 十字四邻的余光；很近的再大一圈
      ctx.fillStyle = `rgba(${c},${al * 0.32})`;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
      if (big) {
        ctx.fillStyle = `rgba(${c},${al * 0.12})`;
        ctx.fillRect(x - 2, y - 1, 5, 3);
        ctx.fillRect(x - 1, y - 2, 3, 5);
      }
      ctx.fillStyle = `rgba(${c},${al})`;
      ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
    }

    /* env: { t, G, vw, vh, zoom, cams: { scene: {x, y} }, regions: { scene: polygon|null }, show: { scene: 0..1 }, RM } */
    function draw(env) {
      bx.clearRect(0, 0, W, H);
      fx.clearRect(0, 0, W, H);
      const { t, G, vw, vh } = env;
      for (const scene of ['moment', 'project']) {
        const vis = env.show[scene] || 0;
        const poly = env.regions[scene];
        if (vis < 0.01 || !poly) continue;
        const sp = SPEC[scene];
        const cam = env.cams[scene];
        for (const ctx of [bx, fx]) {
          ctx.save();
          ctx.beginPath();
          poly.forEach(([x, y], i) => (i ? ctx.lineTo(x / K, y / K) : ctx.moveTo(x / K, y / K)));
          ctx.closePath();
          ctx.clip();
        }
        for (const p of P[scene]) {
          // 推拉：深度随镜头的 z 走，越过镜头后回到最远处
          const span = p.front ? 0.3 : 1.7;
          const lo = p.front ? 0.44 : 0.72;
          const d = lo + mod(p.d0 - lo - env.zoom * 0.5, span);
          const s = G / d;
          const W2 = vw + 360;
          const H2 = vh + 420;
          const sx = mod(p.ux * W2 * 3 - cam.x * s, W2) - 180;
          const sy = mod(p.uy * H2 * 3 - cam.y * s, H2) - (sp.kind === 'rain' ? 380 : 210);
          // 两端（太近 / 太远）淡出
          const edge = clamp((d - lo) / 0.12, 0, 1) * clamp((lo + span - d) / 0.25, 0, 1);
          const far = clamp((d - 0.8) / 1.4, 0, 1);
          const a = vis * edge * (sp.kind === 'rain' ? 0.62 * (1 - 0.45 * far) : 0.95 * (1 - 0.5 * far));
          if (a < 0.01) continue;
          const ctx = p.front ? fx : bx;
          if (sp.kind === 'rain') rain(ctx, p, sx, sy, s, a, sp.tint, env.RM ? 0 : t);
          else star(ctx, p, sx, sy, s, a, sp.tint, env.RM ? 0 : t);
        }
        bx.restore();
        fx.restore();
      }
    }
    return { resize, draw };
  };
})();
