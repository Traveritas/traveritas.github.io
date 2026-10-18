/* ─────────────────────────────────────────────────────────────
   解析度 · 原型脚本
   一张「解析度场」铺满页面：注视的东西完全解析，四周粗一些。
   醒的不清楚＝磨砂（连续），梦的不清楚＝像素格（离散）；同一套对焦逻辑。
   正文永远全分辨率——变粗的只有底色、封面、取景角这些外围的东西。

   三件事：
     1 对焦：卡片 / 目录行静止时封面粗、标题字距松、四角取景角张开；
       悬停或键盘聚焦时一级一级解析（3 步约 270ms），离开时退回（约 125ms）。
     2 长按：从按下处一圈一圈塌粗（格子逐级变粗、交界按块抖开、颜色暗一档），
       塌满停一拍，醒↔梦翻面，再一级一级解析回来。中途松手，原路解析回去。
     3 底色场：内页底色是一张极低分辨率的色场——正文列附近细，越往视口边越粗，
       级与级之间按块抖开。平时静止，只在翻面 / 长按时动。
     （附）落地：页面先粗着落下，再分三步解析。

   网格：基础格 B = round(2·dpr) 个设备像素（≈2 CSS px），8×8 基础格为一块（≈16px）；
   级别 L：1=2px · 2=4px · 3=8px · 4=16px 的格，都是 2 的幂，对齐在同一网格上。
   抖动：4×4 Bayer，按块取阈值。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const root = document.documentElement;
  const Q = new URLSearchParams(location.search);
  const S = {
    mode: Q.get('mode') === 'b' ? 'b' : 'a',
    hour: Q.get('hour') === 'deep' ? 'deep' : 'shallow',
    reality: Q.get('state') === 'dream' ? 'dream' : 'wake',
  };
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.get('rm') === '1';
  const HOVERLESS = matchMedia('(hover: none)').matches;
  const ARRIVE = Q.get('arrive') !== '0';

  /* ── 参数 ── */
  const P = {
    focusIn: [40, 100, 130], // 进：3→2 在 40ms，2→1 再隔 100ms，1→0 再隔 130ms（≈270ms 到位）
    focusOut: [0, 60, 65], // 出：立刻退一级，之后 60 / 65ms（≈125ms 回静）
    holdDelay: 170, // 按下后先静默这么久，区分点击
    band: 72, // 塌缩圈：每一级的宽度（CSS px）
    growMin: 760,
    growMax: 1150,
    peakHold: 100, // 塌满后停一拍
    tick: 50, // 解析回来：每 50ms 退半级（抖开的一半先退）
    riseTick: 34, // 控制条切换时：每 34ms 粗半级
    arriveFrom: 3, // 落地从 8px 起
  };

  /* ── 色板（取自 tokens / hours.css，按时辰）── */
  const PAL = {
    shallow: {
      bg: [225, 231, 239],
      deep: [199, 209, 224],
      glow: [251, 252, 255],
      glowA: 0.7,
      warm: [233, 219, 217],
      cool: [207, 219, 236],
      milk: [241, 244, 248],
      glass: [255, 255, 255, 0.5],
      dimK: 0.93,
      step: 0.13,
      q: 3,
    },
    deep: {
      bg: [20, 27, 41],
      deep: [9, 13, 22],
      glow: [110, 140, 192],
      glowA: 0.26,
      warm: [44, 35, 56],
      cool: [25, 39, 66],
      milk: [36, 46, 66],
      glass: [165, 180, 215, 0.1],
      dimK: 0.76,
      step: 0.16,
      q: 2,
    },
  };

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bay = (bx, by) => BAYER[((by & 3) << 2) | (bx & 3)];
  const SAT_BY_K = [1, 0.96, 0.9, 0.82, 0.74]; // 越粗越淡一点
  const FROST_R = [0, 2.5, 6, 12]; // 磨砂三级的模糊半径（CSS px）
  const FROST_MILK = [0, 0.06, 0.13, 0.22]; // 磨砂三级的乳白层
  const DITHER_Q = Q.get('qd') === '1'; // 色阶之间是否再按格抖动（默认关：会出零星的亮点）
  const S14 = Math.sin((14 * Math.PI) / 180);
  const C14 = Math.cos((14 * Math.PI) / 180);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();

  /* 方案 × 两态 → 封面的低分辨率种类、静止级别、底色场 */
  function conf() {
    const dream = S.reality === 'dream';
    if (S.mode === 'a')
      return dream
        ? { kind: 'pixel', rest: 3, bg: 'pixel', bgMax: 4, bgBand: 110 }
        : { kind: 'frost', rest: 3, bg: 'frost', bgMax: 0, bgBand: 110 };
    return dream
      ? { kind: 'pixel', rest: 3, bg: 'pixel', bgMax: 4, bgBand: 95 }
      : { kind: 'pixel', rest: 2, bg: 'pixel', bgMax: 3, bgBand: 130 };
  }

  /* ── 网格 ── */
  let vw, vh, dpr, B, cpx, cw, ch, nbx, nby;
  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    dpr = devicePixelRatio || 1;
    B = Math.max(1, Math.round(2 * dpr));
    cpx = B / dpr; // 一个基础格的 CSS 宽
    cw = Math.ceil(vw / cpx);
    ch = Math.ceil(vh / cpx);
    nbx = Math.ceil(cw / 8);
    nby = Math.ceil(ch / 8);
  }

  /* ── 色场：连续函数，任何一格取它在格心的值（色场本身极平滑，格心≈格内平均） ── */
  let pal = PAL[S.hour];
  let fr = 0,
    fg = 0,
    fb = 0;
  function mixTo(c, a) {
    fr += (c[0] - fr) * a;
    fg += (c[1] - fg) * a;
    fb += (c[2] - fb) * a;
  }
  function fieldExact(x, y) {
    const p = pal;
    const W = vw,
      H = vh;
    const u = x / W - 0.5,
      v = y / H - 0.5;
    fr = p.bg[0];
    fg = p.bg[1];
    fb = p.bg[2];
    // 四角沉下去
    let e = (u * u * 1.4 + v * v) * 2.1;
    if (e > 1) e = 1;
    mixTo(p.deep, e * e * (3 - 2 * e) * 0.9);
    // 两处光池 + 一道 14° 的淡光带（旧缝线留下的方向）
    const a1 = (x - 0.13 * W) / (0.5 * W),
      b1 = (y - 0.1 * H) / (0.6 * H);
    const a2 = (x - 0.87 * W) / (0.42 * W),
      b2 = (y - 0.88 * H) / (0.5 * H);
    const n = (-(x - 0.5 * W) * S14 + (y - 0.47 * H) * C14) / (0.08 * H + 36);
    const g = Math.exp(-(a1 * a1 + b1 * b1)) + 0.7 * Math.exp(-(a2 * a2 + b2 * b2)) + 0.5 * Math.exp(-n * n);
    mixTo(p.glow, p.glowA * Math.min(1, g));
    // 一处带色的池：醒偏雾蓝、梦偏灰粉
    const dream = S.reality === 'dream';
    const tx = dream ? 0.8 : 0.18,
      ty = dream ? 0.3 : 0.74;
    const a3 = (x - tx * W) / (0.36 * W),
      b3 = (y - ty * H) / (0.42 * H);
    mixTo(dream ? p.warm : p.cool, 0.8 * Math.exp(-(a3 * a3 + b3 * b3)));
  }
  /* 粗格落到色阶上：级别越粗台阶越大；台阶之间按格做有序抖动（b＝这一格的 Bayer 阈值） */
  /* 色场按 4px 一格预先取样（每次换态 / 换时辰 / 改尺寸时算一次），之后取色只查表 */
  const FGS = 4;
  let FG = new Float32Array(3),
    fgw = 1,
    fgh = 1;
  function buildFieldGrid() {
    fgw = Math.ceil(vw / FGS) + 1;
    fgh = Math.ceil(vh / FGS) + 1;
    FG = new Float32Array(fgw * fgh * 3);
    for (let j = 0; j < fgh; j++)
      for (let i = 0; i < fgw; i++) {
        fieldExact(i * FGS + FGS / 2, j * FGS + FGS / 2);
        const o = (j * fgw + i) * 3;
        FG[o] = fr;
        FG[o + 1] = fg;
        FG[o + 2] = fb;
      }
  }
  function field(x, y) {
    const i = clamp((x / FGS) | 0, 0, fgw - 1),
      j = clamp((y / FGS) | 0, 0, fgh - 1);
    const o = (j * fgw + i) * 3;
    fr = FG[o];
    fg = FG[o + 1];
    fb = FG[o + 2];
  }
  const qz = (c, L, b) => {
    if (L < 2) return c;
    const s = pal.q * (L - 1);
    return DITHER_Q ? Math.floor(c / s + b) * s : Math.round(c / s) * s;
  };
  /* 每粗一级，色往四角的沉色挪一小格：级与级的交界因此看得见，交界本身按块抖开 */
  const levelTone = (L) => {
    if (L > 1) mixTo(pal.deep, pal.step * (L - 1));
  };
  const cellBay = (x0, y0, s) => bay((x0 / s) | 0, (y0 / s) | 0);
  const pack = (r, g, b) => (255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255);

  /* 底色场的连续级别：正文列（56rem）里是 1，出了列每 bgBand px 粗一级；上下边缘也粗一点 */
  function bgLevelF(x, y, band) {
    const colW = Math.min(vw - 48, 896);
    const narrow = vw < 700;
    const marg = narrow ? 0 : 36;
    const dx = Math.max(0, Math.abs(x - vw / 2) - colW / 2 - marg);
    const ty = narrow ? 120 : 84;
    const dy = Math.max(0, ty - y, y - (vh - ty)) * (narrow ? 1.5 : 0.9);
    return 1 + Math.hypot(dx, dy) / band;
  }

  /* ── 画布 ── */
  const fieldCv = document.getElementById('field');
  const frostCv = document.getElementById('frost');
  const veilCv = document.getElementById('veil');
  const fctx = fieldCv.getContext('2d');
  const sctx = frostCv.getContext('2d');
  const vctx = veilCv.getContext('2d');
  let bgL = new Uint8Array(0);
  let vL = new Int8Array(0);
  let vImg, vU32;
  let veilDirty = true;

  function sizeGrid(cv, w, h, scale) {
    cv.width = w;
    cv.height = h;
    cv.style.width = w * scale + 'px';
    cv.style.height = h * scale + 'px';
  }

  function sizeCanvases() {
    sizeGrid(fieldCv, cw, ch, cpx);
    sizeGrid(veilCv, cw, ch, cpx);
    vImg = vctx.createImageData(cw, ch);
    vU32 = new Uint32Array(vImg.data.buffer);
    bgL = new Uint8Array(nbx * nby);
    vL = new Int8Array(nbx * nby);
    veilDirty = true;
  }

  /* 3 · 底色场 */
  function renderField() {
    const c = conf();
    pal = PAL[S.hour];
    buildFieldGrid();
    if (c.bg === 'frost') {
      // 醒：同一张场，16px 一格取样，平滑放大再轻轻模糊；四周按同一个级别函数加一层乳白
      fieldCv.style.visibility = 'hidden';
      frostCv.style.visibility = 'visible';
      const st = 16,
        pad = 48;
      const w = Math.ceil((vw + pad * 2) / st),
        h = Math.ceil((vh + pad * 2) / st);
      sizeGrid(frostCv, w, h, st);
      const img = sctx.createImageData(w, h);
      const u = new Uint32Array(img.data.buffer);
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const x = i * st - pad + st / 2,
            y = j * st - pad + st / 2;
          field(x, y);
          const t = clamp(bgLevelF(x, y, c.bgBand) - 1, 0, 3) / 3;
          mixTo(pal.milk, t * 0.55);
          u[j * w + i] = pack(fr, fg, fb);
        }
      sctx.putImageData(img, 0, 0);
      bgL.fill(1);
      return;
    }
    // 梦（及方案 B 的醒）：每块按级别取格，格心取色，粗格落到色阶上
    frostCv.style.visibility = 'hidden';
    fieldCv.style.visibility = 'visible';
    const img = fctx.createImageData(cw, ch);
    const u = new Uint32Array(img.data.buffer);
    for (let by = 0; by < nby; by++)
      for (let bx = 0; bx < nbx; bx++) {
        const cx = (bx * 8 + 4) * cpx,
          cy = (by * 8 + 4) * cpx;
        const L = clamp(Math.floor(bgLevelF(cx, cy, c.bgBand) + bay(bx, by) - 0.5), 1, c.bgMax);
        bgL[by * nbx + bx] = L;
        fillCells(u, bx, by, L, (x0, y0, x1, y1) => {
          field((x0 + x1) / 2, (y0 + y1) / 2);
          levelTone(L);
          const b = cellBay(x0, y0, x1 - x0);
          return pack(qz(fr, L, b), qz(fg, L, b), qz(fb, L, b));
        });
      }
    fctx.putImageData(img, 0, 0);
  }

  /* 一块里按级别铺格：s = 2^(L-1) 个基础格；col(x0,y0,x1,y1 CSS px) 给出这一格的颜色 */
  function fillCells(u, bx, by, L, col) {
    const xb = bx * 8,
      yb = by * 8;
    const xe = Math.min(xb + 8, cw),
      ye = Math.min(yb + 8, ch);
    if (L <= 0) {
      for (let y = yb; y < ye; y++) u.fill(0, y * cw + xb, y * cw + xe);
      return;
    }
    const s = 1 << (L - 1);
    for (let y0 = yb; y0 < ye; y0 += s)
      for (let x0 = xb; x0 < xe; x0 += s) {
        const v = col(x0 * cpx, y0 * cpx, (x0 + s) * cpx, (y0 + s) * cpx);
        const y1 = Math.min(y0 + s, ye),
          x1 = Math.min(x0 + s, xe);
        for (let y = y0; y < y1; y++) u.fill(v, y * cw + x0, y * cw + x1);
      }
  }

  /* ─────────────────────────────────────────────────────────────
     封面：一次算好整叠层
     base：2px 一格的平均（求和表 SAT，任意矩形的平均 O(1)，塌缩层也从这里取色）
     px1–px4：2/4/8/16px 的格（框内平均 → 按级略降饱和）
     fr1–fr3：预先模糊的低分辨率图（画布 filter 只在建层时跑一次）
     ───────────────────────────────────────────────────────────── */
  class Cover {
    constructor(el) {
      this.el = el;
      this.img = el.querySelector('img');
      this.k = 0;
      this.ok = false;
      this.rect = null;
      this.fx = null;
    }

    drawCover(ctx, dx, dy, dw, dh) {
      const img = this.img;
      const nw = img.naturalWidth,
        nh = img.naturalHeight;
      const sc = Math.max(dw / nw, dh / nh);
      const sw = dw / sc,
        sh = dh / sc;
      ctx.drawImage(img, (nw - sw) / 2, (nh - sh) / 2, sw, sh, dx, dy, dw, dh);
    }

    build() {
      const r = this.el.getBoundingClientRect();
      const w = Math.max(8, Math.round(r.width)),
        h = Math.max(8, Math.round(r.height));
      this.w = w;
      this.h = h;
      const w2 = Math.ceil(w / 2),
        h2 = Math.ceil(h / 2);
      this.w2 = w2;
      this.h2 = h2;
      this.el.querySelectorAll('canvas').forEach((c) => c.remove());

      // 与 <img> 同一几何：盒子的 108%，四边各出 4%
      const base = document.createElement('canvas');
      base.width = w2;
      base.height = h2;
      const bctx = base.getContext('2d', { willReadFrequently: true });
      bctx.imageSmoothingQuality = 'high';
      this.drawCover(bctx, -0.04 * w2, -0.04 * h2, 1.08 * w2, 1.08 * h2);
      const d = bctx.getImageData(0, 0, w2, h2).data;
      const W1 = w2 + 1;
      const sat = new Float64Array(W1 * (h2 + 1) * 3);
      for (let y = 0; y < h2; y++) {
        let rr = 0,
          rg = 0,
          rb = 0;
        for (let x = 0; x < w2; x++) {
          const i = (y * w2 + x) * 4;
          rr += d[i];
          rg += d[i + 1];
          rb += d[i + 2];
          const o = ((y + 1) * W1 + x + 1) * 3,
            up = (y * W1 + x + 1) * 3;
          sat[o] = sat[up] + rr;
          sat[o + 1] = sat[up + 1] + rg;
          sat[o + 2] = sat[up + 2] + rb;
        }
      }
      this.sat = sat;

      // 像素层
      for (let k = 1; k <= 4; k++) {
        const s = 1 << k; // CSS px
        const cols = Math.ceil(w / s),
          rows = Math.ceil(h / s);
        const cv = document.createElement('canvas');
        cv.className = 'px px' + k;
        cv.width = cols;
        cv.height = rows;
        cv.style.width = cols * s + 'px';
        cv.style.height = rows * s + 'px';
        const ctx = cv.getContext('2d');
        const id = ctx.createImageData(cols, rows);
        const u = new Uint32Array(id.data.buffer);
        const sf = SAT_BY_K[k];
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            this.avg(i * s, j * s, (i + 1) * s, (j + 1) * s);
            desat(sf);
            u[j * cols + i] = pack(fr, fg, fb);
          }
        ctx.putImageData(id, 0, 0);
        cv.setAttribute('aria-hidden', 'true');
        this.el.appendChild(cv);
      }

      // 磨砂层：先在加了边的临时画布上铺一张放大的垫底（边缘外也有颜色），再把正图压上去模糊
      for (let k = 1; k <= 3; k++) {
        const rad = FROST_R[k] / 2; // 基础格单位
        const pad = Math.ceil(rad * 3) + 2;
        const tmp = document.createElement('canvas');
        tmp.width = w2 + pad * 2;
        tmp.height = h2 + pad * 2;
        const t = tmp.getContext('2d');
        t.imageSmoothingQuality = 'high';
        t.filter = `blur(${rad}px) saturate(${SAT_BY_K[k + 1]})`;
        t.save();
        // 垫底：同一张图按 1.5 倍铺满整张临时画布
        this.drawCover(t, -0.25 * tmp.width, -0.25 * tmp.height, 1.5 * tmp.width, 1.5 * tmp.height);
        t.restore();
        t.drawImage(base, pad, pad);
        const cv = document.createElement('canvas');
        cv.className = 'fr fr' + k;
        cv.width = w2;
        cv.height = h2;
        cv.style.width = w2 * 2 + 'px';
        cv.style.height = h2 * 2 + 'px';
        const ctx = cv.getContext('2d');
        ctx.drawImage(tmp, pad, pad, w2, h2, 0, 0, w2, h2);
        const m = pal.milk;
        ctx.fillStyle = `rgb(${m[0]} ${m[1]} ${m[2]} / ${FROST_MILK[k]})`;
        ctx.fillRect(0, 0, w2, h2);
        cv.setAttribute('aria-hidden', 'true');
        this.el.appendChild(cv);
      }
      this.ok = true;
      this.el.classList.add('ready');
    }

    /* 盒内坐标（CSS px）一块矩形的平均色 → fr/fg/fb */
    avg(x0, y0, x1, y1) {
      const W1 = this.w2 + 1;
      let a = clamp(Math.floor(x0 / 2), 0, this.w2),
        b = clamp(Math.ceil(x1 / 2), 0, this.w2);
      let c = clamp(Math.floor(y0 / 2), 0, this.h2),
        d = clamp(Math.ceil(y1 / 2), 0, this.h2);
      if (b <= a) b = Math.min(a + 1, this.w2), (a = b - 1);
      if (d <= c) d = Math.min(c + 1, this.h2), (c = d - 1);
      const n = (b - a) * (d - c);
      const s = this.sat;
      const i11 = (d * W1 + b) * 3,
        i01 = (c * W1 + b) * 3,
        i10 = (d * W1 + a) * 3,
        i00 = (c * W1 + a) * 3;
      fr = (s[i11] - s[i01] - s[i10] + s[i00]) / n;
      fg = (s[i11 + 1] - s[i01 + 1] - s[i10 + 1] + s[i00 + 1]) / n;
      fb = (s[i11 + 2] - s[i01 + 2] - s[i10 + 2] + s[i00 + 2]) / n;
    }

    setK(k) {
      if (k === this.k && this.el.dataset.k !== undefined) return;
      this.k = k;
      this.el.dataset.k = String(k);
    }
  }

  function desat(f) {
    if (f >= 1) return;
    const l = 0.299 * fr + 0.587 * fg + 0.114 * fb;
    fr = l + (fr - l) * f;
    fg = l + (fg - l) * f;
    fb = l + (fb - l) * f;
  }

  /* ─────────────────────────────────────────────────────────────
     1 · 对焦
     data-f：3 静 → 0 对准。f 同时驱动取景角、字距、封面级别（按本态静止级别折算）
     ───────────────────────────────────────────────────────────── */
  class Fx {
    constructor(el) {
      this.el = el;
      this.covers = [];
      this.f = 3;
      this.timer = 0;
      this.hover = false;
      this.focus = false;
      this.set(3);
    }

    set(f) {
      this.f = f;
      this.el.dataset.f = String(f);
      const rest = conf().rest;
      const k = Math.ceil((f * rest) / 3);
      for (const c of this.covers) c.setK(k);
    }

    go(target) {
      clearTimeout(this.timer);
      if (RM) return this.set(target);
      if (target === this.f) return;
      const seq = target < this.f ? P.focusIn : P.focusOut;
      let i = target < this.f ? 3 - this.f : this.f; // 从序列的哪一格接上
      const step = () => {
        if (this.f === target) return;
        this.set(this.f + (target < this.f ? -1 : 1));
        i++;
        if (this.f !== target) this.timer = setTimeout(step, seq[Math.min(i, 2)]);
      };
      this.timer = setTimeout(step, seq[Math.min(i, 2)]);
    }

    sync() {
      this.go(this.hover || this.focus ? 0 : 3);
    }
  }

  const fxs = [...document.querySelectorAll('.fx')].map((el) => new Fx(el));
  const covers = [];
  for (const fx of fxs) {
    for (const el of fx.el.querySelectorAll('.cv')) {
      const c = new Cover(el);
      c.fx = fx;
      fx.covers.push(c);
      covers.push(c);
    }
    fx.set(3);
    if (!HOVERLESS) {
      fx.el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        fx.hover = true;
        fx.sync();
      });
      fx.el.addEventListener('pointerleave', () => {
        fx.hover = false;
        fx.sync();
      });
    }
    fx.el.addEventListener('focusin', () => {
      fx.focus = true;
      fx.sync();
    });
    fx.el.addEventListener('focusout', () => {
      fx.focus = false;
      fx.sync();
    });
  }

  /* 触屏没有悬停：读线（视口 45% 处）附近的那一张就是注视的那一张 */
  let scrollRaf = 0;
  function scrollFocus() {
    scrollRaf = 0;
    const line = vh * 0.45;
    let best = null,
      bd = vh * 0.3;
    for (const fx of fxs) {
      const r = fx.el.getBoundingClientRect();
      const d = Math.max(0, r.top - line, line - r.bottom);
      if (d < bd) {
        bd = d;
        best = fx;
      }
    }
    for (const fx of fxs) {
      fx.hover = fx === best;
      fx.sync();
    }
  }
  if (HOVERLESS)
    addEventListener(
      'scroll',
      () => {
        if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollFocus);
      },
      { passive: true },
    );

  /* ─────────────────────────────────────────────────────────────
     塌缩层（veil）：盖在封面、薄片之上，文字之下
     每块按「级别函数」取级；取色＝该格下面那层东西的平均（封面 SAT / 薄片玻璃叠底色场 / 底色场），
     再暗一档。只重画级别变了的块，一帧一次 putImageData。
     ───────────────────────────────────────────────────────────── */
  const sheets = [...document.querySelectorAll('.sheet')];
  let surf = { cv: [], gl: [] };
  function refreshSurfaces() {
    const cv = [],
      gl = [];
    for (const c of covers) {
      if (!c.ok) continue;
      const r = c.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      c.rect = r;
      cv.push(c);
    }
    for (const s of sheets) {
      const r = s.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      gl.push(r);
    }
    surf = { cv, gl };
  }

  const inR = (r, x, y) => x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  const hit = (r, x0, y0, x1, y1) => x1 > r.left && x0 < r.right && y1 > r.top && y0 < r.bottom;

  function paintVeil(levelOf) {
    refreshSurfaces();
    const c = conf();
    const pixelBg = c.bg === 'pixel';
    let changed = false;
    const blkCss = 8 * cpx;
    for (let by = 0; by < nby; by++)
      for (let bx = 0; bx < nbx; bx++) {
        const bi = by * nbx + bx;
        const x0 = bx * blkCss,
          y0 = by * blkCss;
        const cx = x0 + blkCss / 2,
          cy = y0 + blkCss / 2;
        const L = levelOf(bx, by, cx, cy);
        let eff = 0;
        // 这一块压着的东西（先封面后薄片），格子取色时只查它们
        const cand = [];
        const glc = [];
        if (L > 0) {
          eff = Math.max(L, pixelBg ? bgL[bi] : 1);
          for (const cvr of surf.cv) if (hit(cvr.rect, x0, y0, x0 + blkCss, y0 + blkCss)) cand.push(cvr);
          for (const g of surf.gl) if (hit(g, x0, y0, x0 + blkCss, y0 + blkCss)) glc.push(g);
        }
        if (eff === vL[bi] && !veilDirty) continue;
        vL[bi] = eff;
        changed = true;
        fillVeilBlock(bx, by, eff, cand, glc);
      }
    veilDirty = false;
    if (changed) vctx.putImageData(vImg, 0, 0);
  }

  /* 塌缩层的一块：格子里取平均，但封面 / 薄片的轮廓按基础格切开——
     物体的边保持笔直，变粗的只是它里面 */
  const covers4 = (r, ax, ay, bx1, by1) => r.left <= ax && r.right >= bx1 && r.top <= ay && r.bottom >= by1;
  function fillVeilBlock(bx, by, eff, cand, glc) {
    const u = vU32;
    const cf = conf();
    const pixelCv = cf.kind === 'pixel';
    const frostBg = cf.bg === 'frost';
    const xb = bx * 8,
      yb = by * 8;
    const xe = Math.min(xb + 8, cw),
      ye = Math.min(yb + 8, ch);
    if (eff <= 0) {
      for (let y = yb; y < ye; y++) u.fill(0, y * cw + xb, y * cw + xe);
      return;
    }
    const s = 1 << (eff - 1);
    const k = pal.dimK;
    for (let y0 = yb; y0 < ye; y0 += s)
      for (let x0 = xb; x0 < xe; x0 += s) {
        const x1 = Math.min(x0 + s, xe),
          y1 = Math.min(y0 + s, ye);
        const ax = x0 * cpx,
          ay = y0 * cpx,
          bx1 = (x0 + s) * cpx,
          by1 = (y0 + s) * cpx;
        const mx = (ax + bx1) / 2,
          my = (ay + by1) / 2;
        const b = cellBay(ax, ay, bx1 - ax);
        const baseCol = (glassed) => {
          field(mx, my);
          // 醒的底有一层乳白：塌缩层取色也带上，圈内外才接得上
          if (frostBg) mixTo(pal.milk, (clamp(bgLevelF(mx, my, cf.bgBand) - 1, 0, 3) / 3) * 0.55);
          // 圈里每粗一级再沉半格：一圈圈的级别看得出来
          mixTo(pal.deep, pal.step * 0.5 * (eff - 1));
          if (glassed) {
            const a = pal.glass[3];
            fr += (pal.glass[0] - fr) * a;
            fg += (pal.glass[1] - fg) * a;
            fb += (pal.glass[2] - fb) * a;
          }
          return pack(qz(fr * k, eff, b), qz(fg * k, eff, b), qz(fb * k, eff, b));
        };
        const coverCol = (cvr) => {
          // 封面自己已经这么粗：留空，让封面自己的格子露出来（两套格子才不会叠着错位）
          if (pixelCv && eff <= cvr.k) return 0;
          const r = cvr.rect;
          cvr.avg(Math.max(ax, r.left) - r.left, Math.max(ay, r.top) - r.top, Math.min(bx1, r.right) - r.left, Math.min(by1, r.bottom) - r.top);
          desat(SAT_BY_K[eff]);
          return pack(fr * k, fg * k, fb * k);
        };
        let tc = null,
          tg = null,
          partial = false;
        for (const cvr of cand)
          if (hit(cvr.rect, ax, ay, bx1, by1)) {
            (tc || (tc = [])).push(cvr);
            if (!covers4(cvr.rect, ax, ay, bx1, by1)) partial = true;
          }
        for (const g of glc)
          if (hit(g, ax, ay, bx1, by1)) {
            (tg || (tg = [])).push(g);
            if (!covers4(g, ax, ay, bx1, by1)) partial = true;
          }
        if (!partial) {
          const v = tc ? coverCol(tc[0]) : baseCol(!!tg);
          for (let y = y0; y < y1; y++) u.fill(v, y * cw + x0, y * cw + x1);
          continue;
        }
        // 跨在轮廓上的格：逐个基础格判归属，各取各的平均
        const cache = new Map();
        for (let y = y0; y < y1; y++) {
          const py = (y + 0.5) * cpx;
          for (let x = x0; x < x1; x++) {
            const px = (x + 0.5) * cpx;
            let key = null;
            if (tc) for (const cvr of tc) if (inR(cvr.rect, px, py)) { key = cvr; break; }
            if (!key) key = tg && tg.some((g) => inR(g, px, py)) ? 'g' : 'b';
            let v = cache.get(key);
            if (v === undefined) {
              v = typeof key === 'string' ? baseCol(key === 'g') : coverCol(key);
              cache.set(key, v);
            }
            u[y * cw + x] = v;
          }
        }
      }
  }

  function clearVeil() {
    vU32.fill(0);
    vL.fill(0);
    vctx.clearRect(0, 0, cw, ch);
  }

  /* ─────────────────────────────────────────────────────────────
     2 · 长按 / 落地 / 切换 —— 一台小状态机，只在非空闲时跑 rAF
       wait → grow →(塌满) peak →(一拍) 翻面 → resolve → idle
       grow 中松手 → shrink → idle
       rise（控制条切换）→ 换 → resolve
     ───────────────────────────────────────────────────────────── */
  const LP = { ph: 'idle', x: 0, y: 0, R: 0, Rend: 0, T: 0, t0: 0, R0: 0, Ts: 0, u: 0, last: 0, wait: 0, then: null, frozen: false };
  let raf = 0;

  const ringLevel = (bx, by, cx, cy) => {
    const d = Math.hypot(cx - LP.x, cy - LP.y);
    return clamp(Math.floor((LP.R - d) / P.band + bay(bx, by)), 0, 4);
  };
  const uniLevel = (bx, by) => clamp(Math.floor(LP.u + bay(bx, by)), 0, 4);

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame() {
    raf = 0;
    const t = now();
    if (LP.ph === 'grow') {
      const k = clamp((t - LP.t0) / LP.T, 0, 1);
      LP.R = Math.floor((LP.Rend * Math.pow(k, 1.5)) / 16) * 16;
      paintVeil(ringLevel);
      if (k >= 1) {
        LP.ph = 'peak';
        LP.last = t;
      }
    } else if (LP.ph === 'peak') {
      if (t - LP.last >= P.peakHold) {
        flip();
        LP.ph = 'resolve';
        LP.u = 4;
        LP.last = t;
        paintVeil(uniLevel);
      }
    } else if (LP.ph === 'shrink') {
      const k = clamp((t - LP.t0) / LP.Ts, 0, 1);
      LP.R = Math.floor((LP.R0 * (1 - k)) / 16) * 16;
      paintVeil(ringLevel);
      if (k >= 1) return idle();
    } else if (LP.ph === 'rise') {
      if (t - LP.last >= P.riseTick) {
        LP.u += 0.5;
        LP.last = t;
        paintVeil(uniLevel);
        if (LP.u >= 4) {
          const f = LP.then;
          LP.then = null;
          if (f) f();
          veilDirty = true;
          LP.ph = 'resolve';
          paintVeil(uniLevel);
        }
      }
    } else if (LP.ph === 'resolve') {
      if (t - LP.last >= P.tick) {
        LP.u -= 0.5;
        LP.last = t;
        if (LP.u <= 0) return idle();
        paintVeil(uniLevel);
      }
    } else return;
    if (!LP.frozen) kick();
  }

  function idle() {
    LP.ph = 'idle';
    LP.frozen = false;
    root.classList.remove('holding');
    clearVeil();
  }

  function press(x, y) {
    if (LP.ph === 'peak' || LP.ph === 'rise') return;
    clearTimeout(LP.wait);
    LP.x = x;
    LP.y = y;
    if (LP.ph === 'shrink' || LP.ph === 'grow') return beginGrow(); // 松了又按：从当前半径接着塌
    LP.ph = 'wait';
    LP.wait = setTimeout(beginGrow, P.holdDelay);
  }

  function beginGrow() {
    root.classList.add('holding');
    if (RM) {
      // 减弱动效：不画圈，按满即翻
      LP.ph = 'rmwait';
      LP.wait = setTimeout(() => {
        if (LP.ph !== 'rmwait') return;
        flip();
        idle();
      }, 650);
      return;
    }
    if (LP.ph === 'resolve') clearVeil();
    const dmax = Math.max(Math.hypot(LP.x, LP.y), Math.hypot(vw - LP.x, LP.y), Math.hypot(LP.x, vh - LP.y), Math.hypot(vw - LP.x, vh - LP.y));
    LP.Rend = dmax + 4 * P.band + 32;
    LP.T = clamp(LP.Rend * 0.55, P.growMin, P.growMax);
    const R = LP.ph === 'shrink' || LP.ph === 'grow' ? LP.R : 0;
    LP.t0 = now() - LP.T * Math.pow(R / LP.Rend, 1 / 1.5);
    LP.ph = 'grow';
    kick();
  }

  function release() {
    clearTimeout(LP.wait);
    if (LP.ph === 'wait' || LP.ph === 'rmwait') {
      LP.ph = 'idle';
      root.classList.remove('holding');
    } else if (LP.ph === 'grow') {
      LP.ph = 'shrink';
      LP.R0 = LP.R;
      LP.t0 = now();
      LP.Ts = 120 + 420 * (LP.R / LP.Rend);
      kick();
    }
  }

  /* 控制条切换 / 落地：整页一起粗上去（或直接从粗处开始），换，再解析回来 */
  function transition(apply) {
    if (RM || LP.ph === 'grow' || LP.ph === 'peak') {
      apply();
      return;
    }
    LP.then = apply;
    LP.ph = 'rise';
    LP.u = 0;
    LP.last = 0;
    kick();
  }

  function arrive() {
    if (RM || !ARRIVE) return;
    LP.ph = 'resolve';
    LP.u = P.arriveFrom;
    LP.last = now();
    veilDirty = true;
    paintVeil(uniLevel);
    kick();
  }

  /* ── 输入 ── */
  const NOPRESS = 'a, button, input, textarea, select, .ctl';
  let downAt = null;
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest(NOPRESS)) return;
    downAt = [e.clientX, e.clientY];
    press(e.clientX, e.clientY);
  });
  addEventListener('pointermove', (e) => {
    if (LP.ph === 'wait' && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) release();
  });
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('blur', release);
  addEventListener('contextmenu', (e) => {
    if (LP.ph !== 'idle') e.preventDefault();
  });

  let spaceDown = false;
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target.closest && e.target.closest('a, button, input, textarea, select')) return;
    e.preventDefault();
    if (e.repeat || spaceDown) return;
    spaceDown = true;
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('fx')) {
      const r = a.getBoundingClientRect();
      press(r.left + r.width / 2, r.top + r.height / 2);
    } else press(vw / 2, vh / 2);
  });
  addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !spaceDown) return;
    spaceDown = false;
    release();
  });

  /* ── 状态 ── */
  function applyState() {
    pal = PAL[S.hour];
    const c = conf();
    root.dataset.hour = S.hour;
    root.dataset.reality = S.reality;
    root.dataset.mode = S.mode;
    root.dataset.kind = c.kind;
    const dream = S.reality === 'dream';
    for (const el of document.querySelectorAll('.t[data-w]')) el.textContent = dream ? el.dataset.d : el.dataset.w;
    for (const fx of fxs) fx.set(fx.f);
    renderField();
    veilDirty = true;
    for (const b of document.querySelectorAll('.ctl [data-set]')) {
      const [k, v] = b.dataset.set.split(':');
      b.setAttribute('aria-pressed', String(S[k] === v));
    }
    const q = new URLSearchParams(location.search);
    q.set('mode', S.mode);
    q.set('hour', S.hour);
    q.set('state', S.reality);
    history.replaceState(null, '', '?' + q.toString());
  }

  function flip() {
    S.reality = S.reality === 'dream' ? 'wake' : 'dream';
    applyState();
  }

  let rebuildFrost = false;
  for (const b of document.querySelectorAll('.ctl [data-set]')) {
    b.addEventListener('click', () => {
      const [k, v] = b.dataset.set.split(':');
      if (S[k] === v) return;
      transition(() => {
        S[k] = v;
        if (k === 'hour') rebuildFrost = true;
        applyState();
        if (rebuildFrost) {
          rebuildFrost = false;
          for (const c of covers) c.build();
          for (const fx of fxs) fx.set(fx.f);
        }
      });
    });
  }
  document.querySelector('[data-replay]').addEventListener('click', () => {
    LP.ph = 'idle';
    arrive();
  });

  /* ── 尺寸变化：整套重建 ── */
  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      measure();
      sizeCanvases();
      renderField();
      for (const c of covers) if (c.img.complete) c.build();
      for (const fx of fxs) fx.set(fx.f);
      idle();
    }, 160);
  });

  /* ── 启动 ── */
  measure();
  sizeCanvases();
  applyState();
  // 落地：先把底色层（没有封面）粗着盖上，等封面算好再一步步解析
  if (ARRIVE && !RM) {
    LP.u = P.arriveFrom;
    paintVeil(uniLevel);
  }
  const loads = covers.map((c) =>
    (c.img.complete ? Promise.resolve() : new Promise((r) => c.img.addEventListener('load', r, { once: true })))
      .then(() => c.img.decode && c.img.decode().catch(() => {}))
      .then(() => c.build()),
  );
  Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]).then(() => {
    for (const fx of fxs) fx.set(fx.f);
    if (HOVERLESS) scrollFocus();
    arrive();
    root.dataset.ready = '1';
  });

  /* ── 截图与调试用的口子 ── */
  window.__res = {
    S,
    P,
    conf,
    fxs,
    focus(i, on = true) {
      fxs[i].hover = on;
      fxs[i].set(on ? 0 : 3);
    },
    /* 把长按定在某一刻：k=0..1（塌缩进度），不再往下走 */
    ring(x, y, k) {
      LP.x = x;
      LP.y = y;
      const dmax = Math.max(Math.hypot(x, y), Math.hypot(vw - x, y), Math.hypot(x, vh - y), Math.hypot(vw - x, vh - y));
      LP.Rend = dmax + 4 * P.band + 32;
      LP.R = Math.floor((LP.Rend * Math.pow(k, 1.5)) / 16) * 16;
      LP.ph = 'frozen';
      veilDirty = true;
      paintVeil(ringLevel);
    },
    uniform(u) {
      LP.u = u;
      LP.ph = 'frozen';
      veilDirty = true;
      paintVeil(uniLevel);
    },
    clear() {
      idle();
    },
    phase: () => LP.ph,
    _apply: () => { const a = performance.now(); applyState(); const b = performance.now(); return b - a; },
    _field: () => { const a = performance.now(); renderField(); return performance.now() - a; },
  };
})();
