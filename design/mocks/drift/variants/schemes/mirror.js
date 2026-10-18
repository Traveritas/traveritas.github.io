/* 镜映 · 表面性质改变（方案；接口见 variants/README.md 第 5、6 节）

   物是一面小镜子 / 一汪静水。它不映具体的东西，映的是这个空间本身——那层光与色。
   三种底因此不是三套画法，是同一层水被三种光穿过：
     随笔  把天光压暗、往冷里偏。镜面的定义是「有比四周更暗的反射」，
           近白的浅底上只有这一条路，所以面比四周暗一档、界线靠暗缘与投影压实；
     项目  是深水：底本来就暗，镜面于是暗到几乎无底，认得出来的是被压扁的冷光与边上一道亮线；
     瞬间  盛着暮色，沉在紫里，浮一点琥珀。

   悬停：一道反光跟着指针在面上走——六个方案里只有这里，指针的位置被世界看见。
   聚焦：镜面转正、正对镜头，反光收成一点，像它认出了你。
   展开：镜面立起来成为读面，正文从倒影的暗度里浮上来——翻的是那层水，不是字。

   连续是默认（README 第 6 节）：镜面全程平滑渐变、柔边、细纹，没有一格像素是画上去的。
   像素留给空间自己（失焦分档、流光）——镜面本来就该映着那个空间，不该跟着它一起定格。
*/
(() => {
  'use strict';
  const { rgba, hash } = DriftReg;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const MARGIN = 20; // 投影、渗出与上缘那道亮线都画在这里
  const RADIUS = 10; // 圆角（世界单位）；CSS 那边的反光层要跟着对齐。水缘是切过的，不圆润
  const WOB = 1.15; // 水缘的起伏：只到「不是用尺子画的」为止，再多就成了波浪

  /* ══ 三种光下的水 ══
     face/stop  水自己的底色（上 → 下）。随笔这一段是整套里最要紧的：
                面必须比四周暗，而面上又压着深墨的字，于是只能在中间让出一条最深的带——
                上缘与下缘各留亮一点，给「随笔」那行棕字与末尾那行弱字留出余地。
     band       映下来的那道横光。随笔映的是远处更暗的一片（暗带），
                项目与瞬间映的是空间自己的光（亮带）——同一个位置，两种读法。
     spec       面上那道细长的镜光：有东西被照着，它才是一面镜子。
     edge       迎光的细线取场景自己的光，三种底因此各自有各自的那一下。 */
  const TONE = {
    essay: {
      face: [[182, 197, 216], [120, 140, 172], [144, 163, 191], [188, 202, 220]],
      stop: [0, 0.30, 0.62, 1],
      deep: [56, 72, 98], deepA: 0.32,
      pool: [30, 40, 58], // 展开时沉在面上的那层水
      band: [52, 68, 94], bandA: 0.34, bandX: 0.46, bandY: 0.30, bandW: 0.80, bandH: 0.24,
      spec: [255, 255, 255], specA: 0.36, specX: 0.30, specY: 0.19, specAng: -21, specLen: 0.44, specWid: 0.090,
      rim: [66, 82, 106], rimA: 0.62, vigA: 0.28, bleedA: 0.16,
      edge: [255, 255, 255], edgeA: 0.70,
      rip: [80, 100, 130], ripA: 0.13, ripples: 7,
      drop: [38, 48, 70], dropA: 0.36,
    },
    project: {
      face: [[10, 17, 30], [4, 8, 18], [12, 21, 36], [7, 12, 24]],
      stop: [0, 0.32, 0.66, 1],
      deep: [0, 0, 0], deepA: 0.44,
      pool: [3, 7, 14],
      band: [140, 196, 216], bandA: 0.34, bandX: 0.38, bandY: 0.34, bandW: 0.82, bandH: 0.21,
      spec: [198, 236, 246], specA: 0.34, specX: 0.26, specY: 0.21, specAng: -19, specLen: 0.42, specWid: 0.075,
      rim: [150, 205, 218], rimA: 0.42, vigA: 0.32, bleedA: 0.10,
      edge: [176, 220, 232], edgeA: 0.56,
      rip: [128, 186, 208], ripA: 0.14, ripples: 8,
      drop: [0, 0, 0], dropA: 0.48,
    },
    moment: {
      face: [[34, 25, 48], [17, 11, 27], [37, 27, 52], [23, 16, 34]],
      stop: [0, 0.32, 0.66, 1],
      deep: [8, 4, 16], deepA: 0.44,
      pool: [13, 8, 22],
      band: [232, 176, 132], bandA: 0.34, bandX: 0.40, bandY: 0.36, bandW: 0.80, bandH: 0.23,
      spec: [252, 214, 176], specA: 0.32, specX: 0.28, specY: 0.21, specAng: -19, specLen: 0.42, specWid: 0.075,
      rim: [240, 186, 150], rimA: 0.38, vigA: 0.30, bleedA: 0.10,
      edge: [248, 208, 172], edgeA: 0.52,
      rip: [222, 168, 128], ripA: 0.13, ripples: 8,
      drop: [6, 3, 12], dropA: 0.48,
    },
  };

  /* ══ 水缘 ══
     圆角矩形，但每条边都被几道很缓的正弦推一推——一条完美的直线会立刻把它变回一块板。
     返回点列，fill / clip / stroke 都用它，一张卡只算一次。 */
  function edgePoints(x, y, w, h, r, seed) {
    const pts = [];
    const step = 5;
    const nx = Math.max(2, Math.round((w - 2 * r) / step));
    const ny = Math.max(2, Math.round((h - 2 * r) / step));
    const na = Math.max(3, Math.round(((Math.PI / 2) * r) / step));
    const add = (px, py) => pts.push([px, py]);
    for (let i = 0; i <= nx; i++) add(x + r + (i / nx) * (w - 2 * r), y);
    for (let i = 1; i <= na; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / na); add(x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r); }
    for (let i = 1; i <= ny; i++) add(x + w, y + r + (i / ny) * (h - 2 * r));
    for (let i = 1; i <= na; i++) { const a = (Math.PI / 2) * (i / na); add(x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r); }
    for (let i = 1; i <= nx; i++) add(x + w - r - (i / nx) * (w - 2 * r), y + h);
    for (let i = 1; i <= na; i++) { const a = Math.PI + (Math.PI / 2) * (i / na); add(x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r); }
    for (let i = 1; i <= ny; i++) add(x, y + h - r - (i / ny) * (h - 2 * r));
    for (let i = 1; i <= na; i++) { const a = -Math.PI + (Math.PI / 2) * (i / na); add(x + r + Math.cos(a) * r, y + r + Math.sin(a) * r); }
    // 起伏的频率按弧长给：几道叠起来才不像一条被揉皱的边
    const ph = seed * 6.283;
    const out = [];
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const s = len / 46;
      const k = Math.sin(s * 2.3 + ph) * 0.55 + Math.sin(s * 5.1 + ph * 1.7) * 0.3 + Math.sin(s * 9.4 + ph * 0.6) * 0.15;
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[(i + 1) % pts.length];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      out.push([p[0] + (dy / d) * WOB * k, p[1] - (dx / d) * WOB * k]);
    }
    return out;
  }
  /* k：沿法向往外撑多少（投影与渗出的柔边要画在水缘外面） */
  function tracePath(ctx, pts, k) {
    const n = pts.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      const px = pts[i][0] + (dy / d) * (k || 0);
      const py = pts[i][1] - (dx / d) * (k || 0);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /* ══ 反光跟着指针 ══
     面上那道光的位置由指针决定，但比指针慢半拍——镜面是转过来的，不是贴上去的。
     归一化到镜面自身（世界单位）而不是屏幕：远处小块的面上，光也一样走得完整。 */
  let gx = 50;
  let gy = 50;
  let tx = 50;
  let ty = 50;
  let fw = 0; // 聚焦的进度：镜面转正、反光收成一点
  let fOn = false;

  const GLINT = [40, 34]; // 反光的柔光层（占面宽的百分比）
  const HOT = [12, 10]; // 里面的热点
  const GLINT_F = [17, 14]; // 聚焦：收成一点
  const HOT_F = [5.5, 4.6];

  const frac = (rec, api) => {
    const s = rec.s || 1;
    const M = rec.it.M || 0;
    const left = rec.x - (rec.it.cw * s) / 2 + M * s;
    const top = rec.y - (rec.it.ch * s) / 2 + M * s;
    return {
      x: clamp((api.mouse.x - left) / (rec.it.w * s), -0.3, 1.3),
      y: clamp((api.mouse.y - top) / (rec.it.h * s), -0.3, 1.3),
    };
  };
  const put = (el, ax, ay, aw, ah, bw, bh) => {
    el.style.setProperty('--gx', `${ax.toFixed(2)}%`);
    el.style.setProperty('--gy', `${ay.toFixed(2)}%`);
    el.style.setProperty('--gw', `${aw.toFixed(2)}%`);
    el.style.setProperty('--gh', `${ah.toFixed(2)}%`);
    el.style.setProperty('--hw', `${bw.toFixed(2)}%`);
    el.style.setProperty('--hh', `${bh.toFixed(2)}%`);
  };
  const putRest = (el) => put(el, gx, gy, GLINT[0], GLINT[1], HOT[0], HOT[1]);

  /* ══ 展开用的小工具 ══ */
  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  let box = null; // 留在屏上的那层水
  DriftReg.scheme('mirror', {
    label: '镜映',

    /* 样式写在方案自己这一层：内联的四段不走登记函数，只有这里的 css 会被插进 <head> */
    css: `
/* 反光层：两层椭圆跟着 --gx/--gy 走——一层紧的热点、一层很宽的柔光，
   再加一道固定的斜光当玻璃自身的底色。位置与大小每帧由脚本写进去。
   尺寸全按百分比给：面上的反光要跟着这一块一起缩放，才像长在它上面。 */
html[data-scheme='mirror'] .frag::before {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  border-radius: 10px;
  pointer-events: none;
  opacity: 0;
  transform: scale(1.012);
  box-shadow: inset 0 0 0 1px rgb(var(--lit) / 0);
  transition: opacity .44s cubic-bezier(.32, .72, 0, 1), transform .6s cubic-bezier(.32, .72, 0, 1), box-shadow .5s cubic-bezier(.32, .72, 0, 1);
  background:
    radial-gradient(ellipse var(--hw, 12%) var(--hh, 10%) at var(--gx, 50%) var(--gy, 50%),
      rgb(var(--lit) / .58) 0, rgb(var(--lit) / .26) 34%, rgb(var(--lit) / 0) 100%),
    radial-gradient(ellipse var(--gw, 40%) var(--gh, 34%) at var(--gx, 50%) var(--gy, 50%),
      rgb(var(--lit) / .17) 0, rgb(var(--lit) / .07) 48%, rgb(var(--lit) / 0) 100%),
    linear-gradient(102deg,
      rgb(var(--lit) / 0) 28%, rgb(var(--lit) / .06) 46%, rgb(var(--lit) / .10) 53%, rgb(var(--lit) / 0) 72%);
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
html[data-scheme='mirror'] .frag.hot::before,
html[data-scheme='mirror'] .frag.m-focus::before {
  opacity: 1;
  transform: scale(1);
  /* 它认出你的时候，边上也亮一线 */
  box-shadow: inset 0 0 0 1px rgb(var(--lit) / .18);
}
/* 聚焦：镜面正对镜头，面上的光收成一点——这时候那一点是硬的、亮的 */
html[data-scheme='mirror'] .frag.m-focus::before {
  background:
    radial-gradient(ellipse var(--hw, 5.5%) var(--hh, 4.6%) at var(--gx, 50%) var(--gy, 50%),
      rgb(var(--lit) / .92) 0, rgb(var(--lit) / .40) 40%, rgb(var(--lit) / 0) 100%),
    radial-gradient(ellipse var(--gw, 17%) var(--gh, 14%) at var(--gx, 50%) var(--gy, 50%),
      rgb(var(--lit) / .20) 0, rgb(var(--lit) / .08) 50%, rgb(var(--lit) / 0) 100%),
    linear-gradient(102deg,
      rgb(var(--lit) / 0) 28%, rgb(var(--lit) / .05) 46%, rgb(var(--lit) / .08) 53%, rgb(var(--lit) / 0) 72%);
}

/* 展开：沉在阅读面上的那层水。翻的是它，不是字。 */
html[data-scheme='mirror'] .m-water {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  transform-origin: 50% 50%;
  will-change: transform, opacity;
}
/* page 那一档自带一页暖纸：立起来这一步借的是它的几何，但读到的面还是镜面本身，
   不是纸。所以把玻璃与墨色换回场景自己的那一套——正文的排版一个字没动。 */
html[data-scheme='mirror'] .rd-page .rd-glass {
  background: rgb(var(--panel) / var(--panel-a));
  backdrop-filter: blur(18px) saturate(1.1);
  -webkit-backdrop-filter: blur(18px) saturate(1.1);
  box-shadow: inset 0 2px 0 rgb(var(--lit) / .45), 0 34px 72px -26px rgb(0 0 0 / .5);
}
html[data-scheme='mirror'] .rd-page .rd-col {
  --fg: inherit;
  --soft: inherit;
  --faint: inherit;
  --ink: inherit;
  --lit: inherit;
  color: var(--fg);
}
`,

    /* ── 外观：一面镜 / 一汪水 ── */
    look: {
      margin: MARGIN,
      inset: 0,

      surface(ctx, it, c, M) {
        const { w, h } = it;
        const T = TONE[it.scene] || TONE.essay;
        const seed = hash(it.id, 'mirror');
        const pts = edgePoints(M, M, w, h, Math.min(RADIUS, h * 0.11), seed);
        const cx = M + w / 2;
        const cy = M + h / 2;

        // 投影：镜面本来就比四周暗，影子只是把这条界线再压实一点
        ctx.save();
        ctx.filter = 'blur(7px)';
        ctx.translate(5, 8);
        ctx.fillStyle = rgba(T.drop, T.dropA);
        tracePath(ctx, pts, 0);
        ctx.fill();
        ctx.restore();

        // 面外的一圈渗出：水不会切得那么硬，浅底上这一圈也是界线的一部分
        ctx.save();
        const bleed = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.34, cx, cy, Math.hypot(w, h) * 0.60);
        bleed.addColorStop(0, rgba(T.rim, 0));
        bleed.addColorStop(1, rgba(T.rim, T.bleedA));
        ctx.fillStyle = bleed;
        tracePath(ctx, pts, 11);
        ctx.fill();
        ctx.restore();

        ctx.save();
        tracePath(ctx, pts, 0);
        ctx.clip();

        // 水自己的底色
        const g = ctx.createLinearGradient(0, M, 0, M + h);
        T.face.forEach((col, i) => g.addColorStop(T.stop[i], rgba(col, 1)));
        ctx.fillStyle = g;
        ctx.fillRect(M - MARGIN, M - MARGIN, w + 2 * MARGIN, h + 2 * MARGIN);

        // 深处：上缘内侧压一道，厚度从这道明暗里出来
        const deep = ctx.createLinearGradient(0, M, 0, M + h * 0.44);
        deep.addColorStop(0, rgba(T.deep, T.deepA));
        deep.addColorStop(1, rgba(T.deep, 0));
        ctx.fillStyle = deep;
        ctx.fillRect(M - MARGIN, M - MARGIN, w + 2 * MARGIN, h * 0.44 + MARGIN);

        // 映下来的那道横光：很宽的一片。随笔映的是更暗的一片，项目与瞬间映的是光
        ctx.save();
        ctx.translate(M + w * T.bandX, M + h * T.bandY);
        ctx.scale(w * T.bandW, h * T.bandH);
        const band = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        band.addColorStop(0, rgba(T.band, T.bandA));
        band.addColorStop(0.5, rgba(T.band, T.bandA * 0.42));
        band.addColorStop(1, rgba(T.band, 0));
        ctx.fillStyle = band;
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();

        // 镜光：一道细长的亮，斜着躺在面上；里面再收一条更细更硬的芯。
        // 有东西被照着、而且照得尖，它才是一面镜子，而不是一块深色的板。
        // 位置与角度每块错开一点：一样的反光落在每块上，看着就成了贴上去的花纹。
        const jx = (hash(it.id, 'sx') - 0.5) * 0.10;
        const jy = (hash(it.id, 'sy') - 0.5) * 0.08;
        const ja = (hash(it.id, 'sa') - 0.5) * 13;
        ctx.save();
        ctx.translate(M + w * (T.specX + jx), M + h * (T.specY + jy));
        ctx.rotate(((T.specAng + ja) * Math.PI) / 180);
        ctx.scale(w * T.specLen, h * T.specWid);
        const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        spec.addColorStop(0, rgba(T.spec, T.specA));
        spec.addColorStop(0.30, rgba(T.spec, T.specA * 0.72));
        spec.addColorStop(0.68, rgba(T.spec, T.specA * 0.18));
        spec.addColorStop(1, rgba(T.spec, 0));
        ctx.fillStyle = spec;
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
        ctx.save();
        ctx.translate(M + w * (T.specX + jx), M + h * (T.specY + jy));
        ctx.rotate(((T.specAng + ja) * Math.PI) / 180);
        ctx.scale(w * T.specLen * 0.92, h * T.specWid * 0.30);
        const core = ctx.createLinearGradient(-1, 0, 1, 0);
        core.addColorStop(0, rgba(T.spec, 0));
        core.addColorStop(0.24, rgba(T.spec, T.specA * 0.50));
        core.addColorStop(0.5, rgba(T.spec, T.specA * 0.66));
        core.addColorStop(0.76, rgba(T.spec, T.specA * 0.50));
        core.addColorStop(1, rgba(T.spec, 0));
        ctx.fillStyle = core;
        ctx.fillRect(-2, -1, 4, 2);
        ctx.restore();

        // 四边往里沉一点：镜子的暗在边上最重
        const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.40, cx, cy, Math.hypot(w, h) * 0.58);
        vig.addColorStop(0, rgba(T.rim, 0));
        vig.addColorStop(1, rgba(T.rim, T.vigA));
        ctx.fillStyle = vig;
        ctx.fillRect(M - MARGIN, M - MARGIN, w + 2 * MARGIN, h + 2 * MARGIN);

        // 细纹：静水不是平的。几道很缓的横纹，浅到只在水面上留一点起伏
        ctx.lineWidth = 2.2;
        for (let i = 0; i < T.ripples; i++) {
          const t = (i + 0.5) / T.ripples;
          const y0 = M + h * (0.08 + t * 0.85);
          const a = T.ripA * (0.25 + 0.75 * Math.sin(Math.PI * clamp(t * 1.06, 0, 1)));
          ctx.strokeStyle = rgba(T.rip, a);
          ctx.beginPath();
          for (let k = 0; k <= 14; k++) {
            const u = k / 14;
            const x = M + u * w;
            const y = y0 + Math.sin(u * 5.6 + i * 1.7 + seed * 6.283) * 3.2 + Math.sin(u * 2.2 + i * 0.9) * 2.0;
            k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();

        // 水缘：一道暗线界定它，再一道迎光的细线只留在上半边
        ctx.lineWidth = 2.8;
        ctx.strokeStyle = rgba(T.rim, T.rimA);
        tracePath(ctx, pts, 0.4);
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.rect(M - MARGIN, M - MARGIN, w + 2 * MARGIN, h * 0.52 + MARGIN);
        ctx.clip();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rgba(T.edge, T.edgeA);
        tracePath(ctx, pts, -1.4);
        ctx.stroke();
        ctx.restore();
      },
    },

    /* ── 悬停：一道反光跟着指针在面上走 ── */
    hover: {
      enter(rec, api) {
        const f = frac(rec, api);
        gx = tx = f.x * 100;
        gy = ty = f.y * 100;
        putRest(rec.el);
      },

      tick(dt, t, api) {
        if (fOn) return; // 聚焦时由 focus.tick 接管，不然两边会互相盖
        const rec = api.hoverRec;
        if (rec && !api.reading) {
          const f = frac(rec, api);
          tx = f.x * 100;
          ty = f.y * 100;
        }
        const k = api.RM ? 1 : 1 - Math.exp(-dt / 0.085);
        gx += (tx - gx) * k;
        gy += (ty - gy) * k;
        if (rec) putRest(rec.el);
      },

      /* 镜面朝指针转一点：转的是面，所以反光也跟着走 */
      tilt(rec, api) {
        const w = (rec.it.w * rec.s) / 2;
        const h = (rec.it.h * rec.s) / 2;
        const nx = (api.mouse.x - rec.x) / (w || 1);
        const ny = (api.mouse.y - rec.y) / (h || 1);
        // 指针离开卡面就慢慢放平——镜头飞过来时，镜面正好转正
        const near = 1 - clamp((Math.hypot(nx, ny) - 1) / 0.9, 0, 1);
        return { x: clamp(ny, -1, 1) * 2.4 * near, y: clamp(nx, -1, 1) * 2.4 * near };
      },

      /* 邻近的碎片让开一点：反光要有一块安静的地方才照得出东西 */
      neighbor(rec, hover, api) {
        const dx = rec.x - hover.x;
        const dy = rec.y - hover.y;
        const d = Math.hypot(dx, dy) || 1;
        const R = 470 * api.G;
        if (d > R) return null;
        const push = (1 - d / R) * 15 * api.G;
        return { dx: (dx / d) * push, dy: (dy / d) * push };
      },

      alpha(rec, a, api) {
        return rec === api.hoverRec ? Math.max(a, 0.94) : a;
      },
    },

    /* ── 聚焦：镜面转正、正对镜头，反光收成一点 ── */
    focus: {
      on(rec) {
        fOn = true;
        rec.el.classList.add('m-focus');
      },
      off(rec) {
        fOn = false;
        rec.el.classList.remove('m-focus');
        putRest(rec.el);
      },
      tick(dt, t, api) {
        const rec = api.rec;
        fw += ((fOn ? 1 : 0) - fw) * (api.RM ? 1 : 1 - Math.exp(-dt / 0.34));
        if (!rec) return;
        if (fw < 0.01 && !fOn) return;
        // 反光从指针刚才的位置收向正中；面上那道光也一起收小
        const k = api.RM ? 1 : 1 - Math.exp(-dt / 0.20);
        gx += (50 - gx) * k * fw;
        gy += (50 - gy) * k * fw;
        tx = gx;
        ty = gy;
        put(rec.el, gx, gy,
          lerp(GLINT[0], GLINT_F[0], fw), lerp(GLINT[1], GLINT_F[1], fw),
          lerp(HOT[0], HOT_F[0], fw), lerp(HOT[1], HOT_F[1], fw));
      },
      /* 镜面要一块安静的地方：四周退得远一点、暗得狠一点 */
      yield(rec, on, api) {
        const host = api.rec;
        if (!host) return null;
        const dx = rec.x - host.x;
        const dy = rec.y - host.y;
        const d = Math.hypot(dx, dy) || 1;
        const extra = (1 - clamp(d / (api.vw * 0.72), 0, 1)) * 26 * api.G * on;
        return {
          dx: (dx / d) * extra,
          dy: (dy / d) * extra,
          lod: on > 0.45 ? 1 : 0,
          alpha: 1 - 0.42 * on,
        };
      },
    },

    /* ── 展开：镜面立起来成为读面，正文从倒影的暗度里浮上来 ── */
    open: {
      run(api) {
        const r = api.rectOf();
        const pr = panelRect(api);
        const T = TONE[api.scene] || TONE.essay;
        if (box) { box.remove(); box = null; }
        const cx = r ? r.left + r.width / 2 : api.vw / 2;
        const cy = r ? r.top + r.height / 2 : api.vh / 2;
        // 镜面立起来，四周的碎片被推远、退焦——空间给这一面让开
        api.setFx({
          cx,
          cy,
          target(rec, fx, h) {
            const dx = rec.x - fx.cx;
            const dy = rec.y - fx.cy;
            const d = Math.hypot(dx, dy) || 1;
            const push = fx.amt * 96 * h.G * Math.max(0.18, 1 - d / (h.vw * 1.1));
            return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.07 * fx.amt };
          },
          lod(rec, lod, fx) {
            if (rec === fx.rec) return lod;
            const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
            return lod + (d < api.vw * 0.42 ? Math.round(fx.amt) : 0);
          },
          alpha(rec, a, fx) {
            return rec === fx.rec ? a : a * (1 - 0.26 * fx.amt);
          },
        });
        api.hide();
        if (api.RM || !r) {
          api.openReader(pr, { mode: 'page' });
          return;
        }
        // page：面板从碎片原位立起来（rotateX 24° → 正对），碎片自己那张图先跟着长
        api.openReader(r, { mode: 'page' });
        // 面板刚生成，就盖一层水上去：正文先以倒影的暗度出现，再浮上来。
        // 翻的是这层水，不是字——字只跟着水一起亮起来（翻字就成了特效）。
        const shell = document.querySelector('.rd-shell');
        if (!shell) return;
        const water = document.createElement('div');
        water.className = 'm-water';
        water.setAttribute('aria-hidden', 'true');
        const deep = T.pool;
        water.style.background = [
          `repeating-linear-gradient(180deg, ${rgba(T.rip, 0.07)} 0 1px, rgba(0, 0, 0, 0) 1px 13px)`,
          `linear-gradient(180deg, rgba(0, 0, 0, 0) 44%, ${rgba(T.edge, 0.18)} 49%, rgba(0, 0, 0, 0) 54%)`,
          `linear-gradient(180deg, ${rgba(deep, 0.94)} 0%, ${rgba(deep, 0.76)} 46%, ${rgba(deep, 0.50)} 100%)`,
        ].join(',');
        shell.appendChild(water);
        box = water;
        water.animate(
          [
            { transform: 'scaleY(-1)', opacity: 0, offset: 0, easing: 'cubic-bezier(.4,0,.2,1)' },
            { transform: 'scaleY(-1)', opacity: 0.9, offset: 0.17, easing: 'linear' },
            { transform: 'scaleY(-1.03)', opacity: 0.92, offset: 0.32, easing: 'cubic-bezier(.42,0,.6,1)' },
            { transform: 'scaleY(0.05)', opacity: 0.62, offset: 0.52, easing: 'cubic-bezier(.4,.1,.3,1)' },
            { transform: 'scaleY(1)', opacity: 0.5, offset: 0.68, easing: 'linear' },
            { transform: 'scaleY(1)', opacity: 0, offset: 1 },
          ],
          { duration: 1060, delay: 150, fill: 'both', easing: 'linear' }
        ).finished.then(() => {
          if (box === water) { water.remove(); box = null; }
        });
        // 正文的那一手：先压低对比（像沉在水里），再一点点回到正常
        const scroll = shell.querySelector('.rd-scroll');
        if (scroll)
          scroll.animate(
            [
              { filter: 'contrast(0.26) blur(2.6px) saturate(0.5)', offset: 0 },
              { filter: 'contrast(0.62) blur(1px) saturate(0.8)', offset: 0.55 },
              { filter: 'contrast(1) blur(0) saturate(1)', offset: 1 },
            ],
            { duration: 860, delay: 380, fill: 'both', easing: 'cubic-bezier(.32,.6,.2,1)' }
          );
      },

      closed() {
        if (box) box.remove();
        box = null;
      },
    },
  });
})();
