/* ═══════════════════════════════════════════════════════════════════════════
   开屏 2 迭代 · 颗粒引擎（三案共用）

   一句话：把首页那片流光在 1/5 分辨率上**一次性算成一张场**（场 = 每画布像素的
   未量化颜色），之后每一帧只做「按时间轴给的格子大小求块均值 → 量化 → 写像素」。
   于是「粗到细」这件事变成两个数字：一个格子边长、一个量化阶数。两者都可以是小数。

   为什么先算场、再按块求均值：
   - 点采样（上一版的做法）在格子边界移动时，每块的颜色会跳来跳去 —— 连续细化时
     整片会「沸腾」。块均值（盒式降采样）是同一张图的不同分辨率版本，边界移动时
     颜色连续变化，沸腾就没了。
   - 场的均价用积分图求，每个块 O(1)，与格子大小无关。
   - 噪声只算一遍：末级 5px 一格时，上一版每帧要算 51840 次 fbm（实测 7.8ms），
     这版只需对场做量化（实测见 NOTES）。

   纯函数部分（每个候选自己写、导出到 __boot.probe）：
       timeline(ms, vw) → { cellPx, levels, octaves, dither, state? }
   引擎照这个输出画，不自己编时间。

   抖动（dither）：
   - Bayer 的索引锁在**画布像素格**上（和首页 shader 的 bayer(fc0) 同一个格子），
     不跟着「块」走。所以格子怎么变，网点都不会爬、不会跳。
   - 强度由时间轴给：0 = 纯平色块（粗段读起来干净），1 = 首页满强度（末帧）。
   - 粗格子 + 满强度抖动会在大色块里长出 5px 网点，和首页的 5px 网点互相打架；
     所以粗段给 0，细段才让抖动长出来。
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const PX = 5; // 1 画布像素 = 5 屏 px，与首页 light.js 的同款分辨率
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  /* 对数插值：格子边长按比例变化时，人眼看到的「变细速度」才是均匀的 */
  const logLerp = (a, b, t) => a * Math.pow(b / a, t);

  /* ── 噪声：值噪声 + fbm。照上一版 2-grain 的种子与结构，保持同一张光 ── */
  const PERM = new Uint8Array(512);
  const RND = new Float32Array(256);
  (function seed() {
    let s = 0x2f6e2b1;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 256; i++) RND[i] = rnd();
    for (let i = 0; i < 256; i++) PERM[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = PERM[i];
      PERM[i] = PERM[j];
      PERM[j] = t;
    }
    for (let i = 0; i < 256; i++) PERM[256 + i] = PERM[i];
  })();

  function vnoise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const X = xi & 255;
    const Y = yi & 255;
    const p0 = PERM[X];
    const p1 = PERM[X + 1];
    const n00 = RND[PERM[p0 + Y]];
    const n10 = RND[PERM[p1 + Y]];
    const n01 = RND[PERM[p0 + Y + 1]];
    const n11 = RND[PERM[p1 + Y + 1]];
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return a + (b - a) * v;
  }

  /* 3 倍频（首页 fbm 是 4 倍频；上一版 2-grain 在 1/5 分辨率上用 2–3 倍频，
     多出来的高频本来就会被 5px 一格抹掉） */
  const OCT = 3;
  const ROTX = 0.8;
  const ROTY = 0.6;
  const SC = 2.03;
  function fbm(x, y) {
    let a = 0.5;
    let sum = 0;
    for (let i = 0; i < OCT; i++) {
      sum += a * vnoise(x, y);
      const nx = (ROTX * x - ROTY * y) * SC + 11.7;
      y = (ROTY * x + ROTX * y) * SC + 11.7;
      x = nx;
      a *= 0.5;
    }
    return sum * 1.1428;
  }

  /* 两段域扭曲：与上一版、与 light.js 的 field 同构 */
  function field(x, y) {
    const qx = fbm(x, y);
    const qy = fbm(x + 5.2, y + 1.3);
    return fbm(x + 1.7 * qx + 3.1, y + 1.7 * qy + 7.7);
  }

  /* ── 4 色域（sRGB 0–1）：底 · 中 · 光带 · 亮芯，顺序同 light.js ── */
  const PAL = {
    home: new Float32Array([0.055, 0.06, 0.12, 0.12, 0.12, 0.23, 0.29, 0.27, 0.44, 0.8, 0.72, 0.78]),
    essay: new Float32Array([0.78, 0.82, 0.88, 0.68, 0.73, 0.82, 0.84, 0.87, 0.92, 0.9, 0.9, 0.9]),
    moment: new Float32Array([0.11, 0.09, 0.17, 0.23, 0.17, 0.3, 0.52, 0.33, 0.41, 0.88, 0.63, 0.43]),
    project: new Float32Array([0.05, 0.08, 0.14, 0.1, 0.17, 0.27, 0.22, 0.42, 0.5, 0.62, 0.8, 0.84]),
  };
  const CORE = 0.34; // 亮芯强度（首页 gr.y = 0.3，这里沿用上一版 2-grain 的 0.34）

  /* 三池夜色：位置与椭圆跟假首页那四条 radial-gradient 对齐，
     所以开屏的构图从第一帧起就是首页的构图 */
  const POOL = [
    { pal: PAL.essay, cx: 0.06, cy: 0.18, rx: 0.58, ry: 0.46, k: 0.68, p: 1.3 },
    { pal: PAL.moment, cx: 0.46, cy: 0.62, rx: 0.46, ry: 0.4, k: 0.7, p: 1.5 },
    { pal: PAL.project, cx: 0.88, cy: 0.78, rx: 0.5, ry: 0.44, k: 0.72, p: 1.4 },
  ];

  const C3 = new Float32Array(3);
  function colorize(P, v, out) {
    const s1 = sstep(0.08, 0.5, v);
    const s2 = sstep(0.5, 0.86, v);
    const band = sstep(0.6, 0.74, v) * (1 - sstep(0.78, 0.94, v)) * 0.58 * CORE;
    const s3 = sstep(0.84, 1, v) * CORE;
    for (let k = 0; k < 3; k++) {
      const c0 = P[k];
      const c1 = P[3 + k];
      const c2 = P[6 + k];
      const c3 = P[9 + k];
      let c = c0 + (c1 - c0) * s1;
      c += (c2 - c) * s2;
      c += c3 * band;
      c += (c3 - c) * s3;
      out[k] = c;
    }
    return out;
  }

  /* ═══ 场：1/5 分辨率的未量化颜色 + 一张积分图 ═══
     场是静态的（开屏 2s 内流光不漂移）。真站是 WebGL 每帧现算，不存在这一步。 */
  function buildField(cw, ch, VW, VH) {
    const stride = (cw + 1) * 3;
    const sum = new Float64Array((cw + 1) * (ch + 1) * 3);
    const flat = new Float32Array(cw * ch * 3);
    const inv = 0.72 / ch; // 与 light.js / 上一版一致：uv = (画布px − 中心)/画布高
    const hw = cw * 0.5;
    const hh = ch * 0.5;

    const p0 = POOL[0];
    const p1 = POOL[1];
    const p2 = POOL[2];
    const ax0 = p0.rx * VW, ay0 = p0.ry * VW;
    const ax1 = p1.rx * VW, ay1 = p1.ry * VW;
    const ax2 = p2.rx * VW, ay2 = p2.ry * VW;
    const kx0 = 1 / ax0, ky0 = 1 / ay0;
    const kx1 = 1 / ax1, ky1 = 1 / ay1;
    const kx2 = 1 / ax2, ky2 = 1 / ay2;
    const cx0 = p0.cx * VW, cy0 = p0.cy * VH;
    const cx1 = p1.cx * VW, cy1 = p1.cy * VH;
    const cx2 = p2.cx * VW, cy2 = p2.cy * VH;
    const glowX = 0.7 * VW;
    const glowY = 0.1 * VH;
    const glowRX = 0.7 * VW;
    const glowRY = 0.6 * VW;

    const C = C3;
    let totR = 0, totG = 0, totB = 0;
    for (let y = 0; y < ch; y++) {
      const uy = (y + 0.5 - hh) * inv;
      const sy = (y + 0.5) * PX;
      const dy0 = (sy - cy0) * ky0;
      const dy1 = (sy - cy1) * ky1;
      const dy2 = (sy - cy2) * ky2;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      const rowOut = (y + 1) * stride;
      const rowPrev = y * stride;
      let fo = y * cw * 3;
      for (let x = 0; x < cw; x++) {
        const ux = (x + 0.5 - hw) * inv;
        const sx = (x + 0.5) * PX;

        /* 明暗值 */
        const f = field(ux, uy);
        let v = (f - 0.3) / 0.42;
        v = v < 0 ? 0 : v > 1 ? 1 : v;

        /* 三池权重：椭圆距离被噪声推一下，边缘不是干净的圆弧 */
        let w0 = 1 - (Math.sqrt((sx - cx0) * (sx - cx0) * kx0 * kx0 + dy0 * dy0) + (f - 0.5) * 0.3) / p0.k;
        let w1 = 1 - (Math.sqrt((sx - cx1) * (sx - cx1) * kx1 * kx1 + dy1 * dy1) + (f - 0.5) * 0.3) / p1.k;
        let w2 = 1 - (Math.sqrt((sx - cx2) * (sx - cx2) * kx2 * kx2 + dy2 * dy2) + (f - 0.5) * 0.3) / p2.k;
        w0 = w0 <= 0 ? 0 : Math.pow(w0, p0.p);
        w1 = w1 <= 0 ? 0 : Math.pow(w1, p1.p);
        w2 = w2 <= 0 ? 0 : Math.pow(w2, p2.p);
        let s = w0 + w1 + w2;
        if (s > 1) {
          w0 /= s;
          w1 /= s;
          w2 /= s;
        }

        /* 上色：靛夜底 + 三池 */
        colorize(PAL.home, v, C);
        let r = C[0];
        let g = C[1];
        let b = C[2];
        if (w0 > 0.001) {
          colorize(p0.pal, v, C);
          r += (C[0] - r) * w0;
          g += (C[1] - g) * w0;
          b += (C[2] - b) * w0;
        }
        if (w1 > 0.001) {
          colorize(p1.pal, v, C);
          r += (C[0] - r) * w1;
          g += (C[1] - g) * w1;
          b += (C[2] - b) * w1;
        }
        if (w2 > 0.001) {
          colorize(p2.pal, v, C);
          r += (C[0] - r) * w2;
          g += (C[1] - g) * w2;
          b += (C[2] - b) * w2;
        }

        /* 70% 10% 那团紫光，垫在三池底下 */
        const gx = (sx - glowX) / glowRX;
        const gy = (sy - glowY) / glowRY;
        const gd = 1 - Math.sqrt(gx * gx + gy * gy) / 0.7;
        if (gd > 0) {
          const a = gd * gd * 0.5;
          r += (0.157 - r) * a;
          g += (0.141 - g) * a;
          b += (0.251 - b) * a;
        }

        flat[fo++] = r;
        flat[fo++] = g;
        flat[fo++] = b;
        totR += r;
        totG += g;
        totB += b;
        accR += r;
        accG += g;
        accB += b;
        const o = rowOut + (x + 1) * 3;
        const q = rowPrev + (x + 1) * 3;
        sum[o] = sum[q] + accR;
        sum[o + 1] = sum[q + 1] + accG;
        sum[o + 2] = sum[q + 2] + accB;
      }
    }
    const n = cw * ch;
    /* 全场的平均色：B 案首帧「整屏一个颜色块」就是它。
       用像素平均而不是块平均：块边界在 0ms 还没有意义，均值必须与格宽无关。 */
    const mean = new Float32Array([totR / n, totG / n, totB / n]);
    return { cw, ch, stride, sum, flat, mean, VW, VH };
  }

  /* ── Bayer 4×4：索引锁在画布像素格上（首页 shader 的 bayer(fc0) 同款） ── */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const DOFF = new Float32Array(16);
  for (let i = 0; i < 16; i++) DOFF[i] = (BAYER[i] + 0.5) / 16 - 0.5;

  function create(canvas, cfg) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const timeline = cfg.timeline;
    let VW = 0, VH = 0, cw = 0, ch = 0;
    let F = null;
    let img = null;
    let buf32 = null;
    let BX = new Int32Array(2048);
    let BY = new Int32Array(2048);
    let lastKey = '';
    let paints = 0;
    let lastPaintMs = 0;
    let fieldMs = 0;
    let lastState = null;

    function resize() {
      VW = Math.max(1, innerWidth);
      VH = Math.max(1, innerHeight);
      cw = Math.ceil(VW / PX);
      ch = Math.ceil(VH / PX);
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = cw * PX + 'px';
      canvas.style.height = ch * PX + 'px';
      img = ctx.createImageData(cw, ch);
      buf32 = new Uint32Array(img.data.buffer);
      const t0 = performance.now();
      F = buildField(cw, ch, VW, VH);
      fieldMs = performance.now() - t0;
      const n = Math.max(cw, ch) + 2;
      if (n > BX.length) {
        BX = new Int32Array(n);
        BY = new Int32Array(n);
      }
      lastKey = '';
    }

    /* 一块的颜色 = 场在这个块上的均值（盒式降采样）。
       area = 1 时直接读场，省掉积分图那四次读。 */
    function meanOf(x0, y0, x1, y1, out) {
      const area = (x1 - x0) * (y1 - y0);
      if (area === 1) {
        const i = (y0 * cw + x0) * 3;
        out[0] = F.flat[i];
        out[1] = F.flat[i + 1];
        out[2] = F.flat[i + 2];
        return out;
      }
      const st = F.stride;
      const s = F.sum;
      const o00 = y0 * st + x0 * 3;
      const o10 = y0 * st + x1 * 3;
      const o01 = y1 * st + x0 * 3;
      const o11 = y1 * st + x1 * 3;
      const ia = 1 / area;
      out[0] = (s[o11] - s[o01] - s[o10] + s[o00]) * ia;
      out[1] = (s[o11 + 1] - s[o01 + 1] - s[o10 + 1] + s[o00 + 1]) * ia;
      out[2] = (s[o11 + 2] - s[o01 + 2] - s[o10 + 2] + s[o00 + 2]) * ia;
      return out;
    }

    function paint(ms, force) {
      const st = timeline(ms, VW, VH);
      /* 缓存键：格宽 / 阶 / 抖动 / 块级抖动。B 案起帧的一格比整屏还大，
         它每帧都在变，所以自然播放时每帧都会真的重画。 */
      const key = st.cellPx + '|' + st.levels + '|' + st.dither + '|' + (st.blockDither || 0);
      lastState = st;
      if (!force && key === lastKey) return st;
      lastKey = key;
      const t0 = performance.now();

      const L = st.levels;
      const invL = 1 / L;
      const k255 = 255 / L;
      const dAmp = st.dither;
      const c = Math.max(1, st.cellPx / PX); // 一格 = 几个画布像素（连续，可含小数）

      /* 块边界（画布 px），舍入到整画布像素：块只能落在画布像素格上 */
      let nx = 0;
      BX[0] = 0;
      for (let i = 1; ; i++) {
        let x = Math.round(i * c);
        if (x > cw) x = cw;
        if (x > BX[nx]) BX[++nx] = x;
        if (x >= cw) break;
      }
      let ny = 0;
      BY[0] = 0;
      for (let i = 1; ; i++) {
        let y = Math.round(i * c);
        if (y > ch) y = ch;
        if (y > BY[ny]) BY[++ny] = y;
        if (y >= ch) break;
      }

      const M = new Float32Array(3); // 三案共用，复用
      const hasDither = dAmp > 0.0005;
      const bd = st.blockDither || 0;
      const hasBlockDither = bd > 0.0005;

      for (let j = 0; j < ny; j++) {
        const y0 = BY[j];
        const y1 = BY[j + 1];
        const ry4 = (j & 3) << 2;
        for (let i = 0; i < nx; i++) {
          const x0 = BX[i];
          const x1 = BX[i + 1];
          meanOf(x0, y0, x1, y1, M);
          let r = M[0], g = M[1], b = M[2];
          r = r < 0 ? 0 : r > 1 ? 1 : r;
          g = g < 0 ? 0 : g > 1 ? 1 : g;
          b = b < 0 ? 0 : b > 1 ? 1 : b;
          /* 块级抖动：整块同一个偏移，Bayer 索引用「块序号」。
             这就是上一版 2-grain 粗段的质感 —— 相邻块会落在相邻的一阶上，
             色块之间有极轻的印刷噪点，不会平得像塑料。
             连续版默认不用（块边界一直在动，块索引一变就闪）；B 案可用 ?print=1 打开做对照。 */
          const bOff = hasBlockDither ? DOFF[ry4 | (i & 3)] * bd : 0;

          if (!hasDither) {
            /* 平色块：一块一个颜色，一段一段跳级时读起来就是「一格一格的」 */
            const qr = clamp((r * L + 0.5 + bOff) | 0, 0, L);
            const qg = clamp((g * L + 0.5 + bOff) | 0, 0, L);
            const qb = clamp((b * L + 0.5 + bOff) | 0, 0, L);
            const c32 =
              0xff000000 |
              (((qb * k255 + 0.5) | 0) << 16) |
              (((qg * k255 + 0.5) | 0) << 8) |
              ((qr * k255 + 0.5) | 0);
            for (let y = y0; y < y1; y++) {
              const base = y * cw + x0;
              buf32.fill(c32, base, base + (x1 - x0));
            }
          } else if (x1 - x0 === 1 && y1 - y0 === 1) {
            /* 末级：一格 = 一个画布像素，直接按屏幕锁定的 Bayer 量化 */
            const d = DOFF[((y0 & 3) << 2) | (x0 & 3)] * dAmp + bOff;
            const qr = clamp((r * L + 0.5 + d) | 0, 0, L);
            const qg = clamp((g * L + 0.5 + d) | 0, 0, L);
            const qb = clamp((b * L + 0.5 + d) | 0, 0, L);
            buf32[y0 * cw + x0] =
              0xff000000 |
              (((qb * k255 + 0.5) | 0) << 16) |
              (((qg * k255 + 0.5) | 0) << 8) |
              ((qr * k255 + 0.5) | 0);
          } else {
            /* 中间级：整块一个色，但块内每个画布像素按 Bayer 抖一下。
               抖动指数锁在 (x&3, y&3) 上 —— 块边界怎么挪，网点都不动。 */
            for (let y = y0; y < y1; y++) {
              let o = y * cw + x0;
              const ry = (y & 3) << 2;
              for (let x = x0; x < x1; x++) {
                const d = DOFF[ry | (x & 3)] * dAmp + bOff;
                const qr = clamp((r * L + 0.5 + d) | 0, 0, L);
                const qg = clamp((g * L + 0.5 + d) | 0, 0, L);
                const qb = clamp((b * L + 0.5 + d) | 0, 0, L);
                buf32[o++] =
                  0xff000000 |
                  (((qb * k255 + 0.5) | 0) << 16) |
                  (((qg * k255 + 0.5) | 0) << 8) |
                  ((qr * k255 + 0.5) | 0);
              }
            }
          }
        }
      }

      ctx.putImageData(img, 0, 0);
      lastPaintMs = performance.now() - t0;
      paints++;
      return st;
    }

    resize();

    return {
      resize,
      paint,
      fieldMs: () => fieldMs,
      stats: () => ({
        paints,
        lastPaintMs,
        fieldMs,
        cw,
        ch,
        /* B 案首帧那个「整屏一色」就是它（0–1 sRGB） */
        mean: F ? [+F.mean[0].toFixed(4), +F.mean[1].toFixed(4), +F.mean[2].toFixed(4)] : null,
      }),
      state: () => lastState,
    };
  }

  global.Grain = {
    PX,
    create,
    clamp,
    clamp01,
    sstep,
    lerp,
    logLerp,
    /* 供候选的时间轴复用：把「设计稿上的格宽」在窄屏上向末级 5px 收敛。
       桌面 1440 上原样，390 宽手机上粗段减半 —— 不然第一级只有 6 列，构图画不出来。 */
    mobileScale(vw) {
      return clamp(vw / 1200, 0.5, 1);
    },
    scaledCell(cell, vw) {
      const k = clamp(vw / 1200, 0.5, 1);
      return 5 + (cell - 5) * k;
    },
  };
})(window);
