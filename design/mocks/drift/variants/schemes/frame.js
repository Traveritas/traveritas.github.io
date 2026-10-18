/* 虚框 · 框是内容所依附的那一层 ──────────────────────────────────────

   物：一块哑光的树脂板。四边模压出一道窄边——外沿一道细线、一圈半透明的斜边，再往里
   就是面；正文印在这块面上，不是嵌在框的窗口里：边上没有另设一道密封条，模压的边把影
   直接投在面的边缘上，字与框共处一层。
   板上另浮着一道只描线的细框：它没有材质、透得出底下的板与字——这就是「虚」的那一个框。

   两道框静止时就错着位。同一个世界的两层，对位没对严，四个角上互相穿过（交错）。
   错位的方向与大小按碎片定，不是一个模子盖出来的。

   悬停：虚框朝板边滑近一点——两层在轻微地互相滑动，不是跳。
   聚焦：虚框滑到与板边严丝合缝，两层成为一个框；而四周碎片的对位松开来（世界为它让开）。
   展开：虚框朝外张开、化掉；板的面连同印在上面的字浮起来，成为读面。
   收回：虚框从外面收回来，先错回交错的样子，再并拢到对齐——回来的是同两层。

   为什么不做像素版（用户点名鼓励过的那个方向）：
   碎片是这个原型里唯一保持「精美与连续」的一极（README 第 6 节），像素与定格已经
   由空间承担（流光、失焦分档）。框若也做成一格格，读面就成了屏幕，字也就不再是
   「印在平面上」，而是显示在一个面上。而「虚」用「一个没有实体的框」来说，比用
   「一格格拼起来的框」更准：它是一道边，只是这道边暂时不属于任何一件东西。
   将来真要做像素版，该动的是这道虚框——把它的线换成按 6 单位一格的点阵，板与字
   留在连续里；这样两层的差别本身就是「实与虚」的差别。

   三种光是同一副框，只是各自的对比方向相反：随笔的底近白，框靠压深才立得住
   （细框取深青灰、板边也是暗的）；项目与瞬间的底是深的，框就反过来靠外沿那道亮线
   现身。所以不是三套画法，是同一道模压边被三种光穿过。
   ─────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const { rgba, hash, stepPath } = DriftReg;
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── 尺寸（世界单位；焦平面上 1 单位 = 1px）──
     模压的边只占板边往里 BAND 这一圈，再往里就是面。边要窄：它跟着碎片一起被放大
     （展开时会长到阅读面那么大），宽一点就成了显示器边框。 */
  const M = 18; // 板外的余量：虚框的错位、投影、内影都落在这里
  const BAND = 6; // 模压边的宽（从板边到面）
  const SH = 15; // 内影从面的边缘往里走多远（要止在正文之前）
  const INSET = 6; // 虚框相对板边的内缩；css 里的 calc(var(--m) + 6px) 是同一个数

  /* ── 三种光下的模压边 ──
     同一道边，只有对比的方向相反：随笔的底近白，所以边取深青灰、靠 line 压出一道外沿；
     项目与瞬间的底深，边沉下去，靠 line 那道亮线现身。drop 是板投在背景上的影。 */
  const TONE = {
    essay: {
      edgeHi: [74, 88, 114], edgeHiA: 0.27,
      edge: [52, 64, 86], edgeA: 0.34,
      edgeLo: [32, 42, 62], edgeLoA: 0.42,
      line: [30, 40, 60], lineA: 0.46,
      shadow: [30, 40, 60], shadowA: 0.30,
      sheen: [255, 255, 255], sheenA: 0.16,
      vig: [70, 84, 108], vigA: 0.18,
      drop: [40, 50, 72], dropA: 0.24,
    },
    project: {
      edgeHi: [150, 196, 210], edgeHiA: 0.24,
      edge: [40, 58, 78], edgeA: 0.34,
      edgeLo: [0, 0, 0], edgeLoA: 0.46,
      line: [170, 214, 226], lineA: 0.42,
      shadow: [0, 0, 0], shadowA: 0.24,
      sheen: [255, 255, 255], sheenA: 0.10,
      vig: [0, 0, 0], vigA: 0.22,
      drop: [0, 0, 0], dropA: 0.40,
    },
    moment: {
      edgeHi: [230, 182, 148], edgeHiA: 0.22,
      edge: [56, 42, 60], edgeA: 0.34,
      edgeLo: [0, 0, 0], edgeLoA: 0.46,
      line: [244, 206, 174], lineA: 0.38,
      shadow: [0, 0, 0], shadowA: 0.24,
      sheen: [255, 255, 255], sheenA: 0.09,
      vig: [0, 0, 0], vigA: 0.20,
      drop: [8, 4, 14], dropA: 0.40,
    },
  };

  /* 角上的阶梯（三级，每级 3 单位）——与 stepPath 画出来的是同一副角。
     虚框是 css 画的，要走同一副外形就只能裁出来。 */
  const CLIP = 'polygon(9px 0, calc(100% - 9px) 0, calc(100% - 9px) 3px, calc(100% - 6px) 3px, calc(100% - 6px) 6px, '
    + 'calc(100% - 3px) 6px, calc(100% - 3px) 9px, 100% 9px, 100% calc(100% - 9px), calc(100% - 3px) calc(100% - 9px), '
    + 'calc(100% - 3px) calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) calc(100% - 3px), '
    + 'calc(100% - 9px) calc(100% - 3px), calc(100% - 9px) 100%, 9px 100%, 9px calc(100% - 3px), 6px calc(100% - 3px), '
    + '6px calc(100% - 6px), 3px calc(100% - 6px), 3px calc(100% - 9px), 0 calc(100% - 9px), 0 9px, 3px 9px, 3px 6px, '
    + '6px 6px, 6px 3px, 9px 3px)';

  /* ══ 样式 ══
     只有方案顶层的 css 会被 drift.js 自动插进 <head>（内联的四段不走登记函数）。 */
  const CSS = `
@property --frm-k { syntax: '<number>'; inherits: true; initial-value: 1; }
@property --frm-w { syntax: '<number>'; inherits: true; initial-value: 1; }

/* 虚框的线与影：随笔的底近白，取深青灰；项目与瞬间的底深，取场景自己的亮色。
   --frm-lit 是那道内嵌亮线的浓度，聚焦时由脚本每帧写进去（不走过渡，免得被滤平）。
   --frm-cast 是虚框投在板面上的影——它落在字上，是「这一层浮着」最直接的一句话。
   --frm-w 是整片世界的对位：静止是 1，聚焦时松开一点。过渡挂在这一条上、不挂在
   .frame-loose 上，否则退出聚焦时（类被摘掉）它会一步弹回。 */
html[data-scheme='frame'] {
  --frm-edge: 44 56 78; --frm-edge-a: .64; --frm-drop: 40 50 72; --frm-drop-a: .30;
  --frm-cast: drop-shadow(3px 4px 4px rgb(var(--frm-drop) / var(--frm-drop-a)));
  --frm-w: 1;
  transition: --frm-w 1.05s cubic-bezier(.32, .72, 0, 1);
}
html[data-scheme='frame'][data-scene='project'] { --frm-edge: 176 216 228; --frm-edge-a: .52; --frm-drop: 0 0 0; --frm-drop-a: .44; }
html[data-scheme='frame'][data-scene='moment'] { --frm-edge: 240 198 166; --frm-edge-a: .50; --frm-drop: 8 4 14; --frm-drop-a: .44; }

/* 虚的那一道框：只有边，没有实体。位置 = 板边内缩 INSET，再整体错开 (--fx0, --fy0)。
   --frm-k 是「对位」：1 = 完全错开（静止），0 = 严丝合缝（聚焦）。悬停时落到 .5，
   所以两层是滑近的——一个数同时管悬停与聚焦，位移小、慢，也不跟 transform 过渡打架。
   角上的阶梯裁成与板同一副（都是三级 3 单位）——两层要是同一个东西，不能连角都不一样。
   影走 drop-shadow 而不是 box-shadow：只有它会跟着裁过的外形走。 */
html[data-scheme='frame'] .frag::before {
  content: '';
  position: absolute;
  inset: calc(var(--m, 0px) + ${INSET}px);
  border: 2px solid rgb(var(--frm-edge) / var(--frm-edge-a));
  pointer-events: none;
  clip-path: ${CLIP};
  transform: translate(
    calc(var(--fx0, 5px) * var(--frm-k, 1) * var(--frm-w, 1)),
    calc(var(--fy0, 4px) * var(--frm-k, 1) * var(--frm-w, 1)));
  box-shadow: inset 1px 1px 0 rgb(var(--lit) / var(--frm-lit, .5));
  filter: var(--frm-cast);
  transition: --frm-k .56s cubic-bezier(.32, .72, 0, 1), border-color .5s ease, box-shadow .5s ease;
}

/* 每块从同一副错位里取不同的方向：同一件东西，不是同一枚印章 */
html[data-scheme='frame'] .frag:nth-child(5n + 2)::before { --fx0: 5px; --fy0: -5px; }
html[data-scheme='frame'] .frag:nth-child(5n + 3)::before { --fx0: -6px; --fy0: 5px; }
html[data-scheme='frame'] .frag:nth-child(5n + 4)::before { --fx0: -5px; --fy0: -4px; }
html[data-scheme='frame'] .frag:nth-child(5n)::before { --fx0: 4px; --fy0: 6px; }

/* 悬停：虚框朝板边滑近——两层在轻微地互相滑动。进得快一点，松得慢一点 */
html[data-scheme='frame'] .frag.hot::before {
  --frm-k: .5;
  transition-duration: .44s;
  box-shadow: inset 1px 1px 0 rgb(var(--lit) / .68);
}

/* 聚焦：两层并拢成一个框，边与亮线都实一点 */
html[data-scheme='frame'] .frag.frame-aligned::before { --frm-k: 0; --frm-edge-a: .92; }
/* 世界为它让开：其余碎片的对位一起松开（挂在 html 上，一条过渡带整片场景走） */
html[data-scheme='frame'].frame-loose { --frm-w: 1.55; }

/* 收回：虚框从外面回来，先错回交错的样子，再并拢到对齐 */
@keyframes frame-again {
  0% { --frm-k: 0; }
  42% { --frm-k: 1.06; }
  68% { --frm-k: .84; }
  100% { --frm-k: 0; }
}
html[data-scheme='frame'] .frag.frame-again::before {
  --frm-w: 1;
  animation: frame-again .96s cubic-bezier(.34, .72, .3, 1) both;
}

/* 景深：远处那道线不再是一根线，化进板里——分档要跟它所在的碎片同一步，
   不然一块已经化开的碎片上会留着一根清楚的框。 */
html[data-scheme='frame'] .frag[data-lod='1']::before { filter: var(--frm-cast) blur(.5px); }
html[data-scheme='frame'] .frag[data-lod='2']::before { filter: var(--frm-cast) blur(1.4px); opacity: .74; }
html[data-scheme='frame'] .frag[data-lod='3']::before { filter: var(--frm-cast) blur(2.6px); opacity: .5; }

/* 展开：板的面（连着印在上面的字）浮向读面；虚框与它同行，先朝外张开再化掉。
   这一层压在阅读层之上——落点与 reader 的 rd-card 是同一个矩形，交出去看不接缝。 */
html[data-scheme='frame'] .frame-stage { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
html[data-scheme='frame'] .frame-plate {
  position: absolute;
  left: 0;
  top: 0;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  perspective-origin: 50% 50%;
  will-change: transform;
}
html[data-scheme='frame'] .frame-hollow {
  position: absolute;
  border: 2px solid rgb(var(--frm-edge) / .92);
  transform-origin: 50% 50%;
  clip-path: ${CLIP};
  box-shadow: inset 1px 1px 0 rgb(var(--lit) / .7);
  filter: var(--frm-cast);
}
html[data-scheme='frame'] .frame-glow { position: absolute; }
`;

  /* ══ 展开途中的那一层 ══ */
  let stage = null;
  let timers = [];
  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    if (stage) {
      stage.remove();
      stage = null;
    }
  }

  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };

  DriftReg.scheme('frame', {
    label: '虚框',
    css: CSS,

    /* ══ 外观：一块哑光的树脂板 ══
       只画「框」这一层：模压的边、面、内影、材质。正文由 cards.js 接着画在这块面上。 */
    look: {
      label: '虚框',
      margin: M,
      inset: 0,
      paper: false,

      surface(ctx, it, c, m) {
        const { w, h } = it;
        const T = TONE[it.scene] || TONE.essay;
        const sd = hash(it.id, 'frame');
        const px = m + BAND;
        const py = m + BAND;
        const pw = w - 2 * BAND;
        const ph = h - 2 * BAND;

        // 投影：板浮着一点，影子错在右下、糊开
        ctx.save();
        ctx.filter = 'blur(9px)';
        ctx.translate(4, 7);
        ctx.fillStyle = rgba(T.drop, T.dropA);
        stepPath(ctx, m, m, w, h, 3);
        ctx.fill();
        ctx.restore();

        // 模压的边：整块板先铺一道对角渐变（左上迎光、右下背光）
        stepPath(ctx, m, m, w, h, 3);
        let g = ctx.createLinearGradient(m, m, m + w, m + h);
        g.addColorStop(0, rgba(T.edgeHi, T.edgeHiA));
        g.addColorStop(0.45, rgba(T.edge, T.edgeA));
        g.addColorStop(1, rgba(T.edgeLo, T.edgeLoA));
        ctx.fillStyle = g;
        ctx.fill();

        // 板的外沿一道细线：浅底上框靠它立住，深底上它就是那道被照着的棱
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(T.line, T.lineA);
        stepPath(ctx, m + 0.75, m + 0.75, w - 1.5, h - 1.5, 3);
        ctx.stroke();
        ctx.restore();

        // ── 面：正文就印在这一块上 ──
        stepPath(ctx, px, py, pw, ph, 3);
        ctx.fillStyle = c.fill;
        ctx.fill();

        ctx.save();
        stepPath(ctx, px, py, pw, ph, 3);
        ctx.clip();

        // 面上的光：左上迎光，往右下化开
        g = ctx.createLinearGradient(px, py, px + pw * 0.8, py + ph * 0.9);
        g.addColorStop(0, rgba(T.sheen, T.sheenA));
        g.addColorStop(0.5, rgba(T.sheen, T.sheenA * 0.22));
        g.addColorStop(1, rgba(T.sheen, 0));
        ctx.fillStyle = g;
        ctx.fillRect(px, py, pw, ph);

        // 树脂涂不匀：两三团极淡的偏色，是这块面上唯一的花纹
        for (let i = 0; i < 3; i++) {
          const bx = px + (0.14 + hash(sd, i * 3) * 0.72) * pw;
          const by = py + (0.14 + hash(sd, i * 3 + 1) * 0.72) * ph;
          const br = (0.34 + hash(sd, i * 3 + 2) * 0.4) * Math.max(pw, ph);
          const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          bg.addColorStop(0, rgba(i % 2 ? [188, 200, 214] : [140, 152, 170], it.scene === 'essay' ? 0.07 : 0.05));
          bg.addColorStop(1, rgba([160, 170, 186], 0));
          ctx.fillStyle = bg;
          ctx.fillRect(px, py, pw, ph);
        }

        // 颗粒：哑光树脂自己的，很细
        const n = Math.round((pw * ph) / 64);
        for (let i = 0; i < n; i++) {
          const a = 0.025 + hash(sd, 900 + i) * 0.045;
          const dark = hash(sd, 3000 + i) < 0.58;
          ctx.fillStyle = dark ? rgba([70, 80, 100], a) : rgba([255, 255, 255], a * 0.9);
          ctx.fillRect(px + Math.floor(hash(sd, i) * pw), py + Math.floor(hash(sd, 1800 + i) * ph), 1, 1);
        }

        // 内影：模压的边把影投在自己这块面上——所以字与框在同一层，中间没有窗口
        const edge = (x, y, gw, gh, vert, far) => {
          const e = vert
            ? ctx.createLinearGradient(0, far ? y + gh : y, 0, far ? y + gh - SH : y + SH)
            : ctx.createLinearGradient(far ? x + gw : x, 0, far ? x + gw - SH : x + SH, 0);
          e.addColorStop(0, rgba(T.shadow, T.shadowA));
          e.addColorStop(1, rgba(T.shadow, 0));
          ctx.fillStyle = e;
          ctx.fillRect(x, y, gw, gh);
        };
        edge(px, py, pw, SH, true, false);
        edge(px, py + ph - SH, pw, SH, true, true);
        edge(px, py, SH, ph, false, false);
        edge(px + pw - SH, py, SH, ph, false, true);

        // 四角沉一点：面才不是一张平贴的纸
        const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.34, px + pw / 2, py + ph / 2, Math.hypot(pw, ph) * 0.56);
        vg.addColorStop(0, rgba(T.vig, 0));
        vg.addColorStop(1, rgba(T.vig, T.vigA));
        ctx.fillStyle = vg;
        ctx.fillRect(px, py, pw, ph);
        ctx.restore();
      },
    },

    /* ══ 悬停：两层在轻微地互相滑动 ══
       滑近那一下由 css 的 --frm-k 走（一个数，.44s 进 / .56s 松），这里只补两件它
       管不到的事：指针下那一块跳到清晰档，近旁的碎片被带得偏一点。 */
    hover: {
      clear: true,
      neighbor(rec, hover, api) {
        const dx = rec.x - hover.x;
        const dy = rec.y - hover.y;
        const d = Math.hypot(dx, dy) || 1;
        const R = 430 * api.G;
        if (d >= R) return null;
        const f = 1 - d / R;
        const push = f * f * 13 * api.G;
        // 两层滑动带起的气流：往外推一点，再顺着相位斜一点
        const tang = f * 6 * api.G * Math.sin(rec.ph);
        return { dx: (dx / d) * push - (dy / d) * tang, dy: (dy / d) * push + (dx / d) * tang };
      },
      alpha(rec, a, api) {
        return rec === api.hoverRec ? Math.max(a, 0.96) : a;
      },
    },

    /* ══ 聚焦：两层并拢成一个框；世界的对位松开 ══ */
    focus: {
      on(rec, api) {
        rec.el.classList.add('frame-aligned');
        rec.el.classList.remove('frame-again');
        api.root.classList.add('frame-loose');
      },

      off(rec, api) {
        rec.el.classList.remove('frame-aligned');
        rec.el.classList.remove('frame-again');
        rec.el.style.removeProperty('--frm-lit');
        api.root.classList.remove('frame-loose');
      },

      tick(dt, t, api) {
        const rec = api.rec;
        if (!rec || !rec.el) return;
        // 框被看清了：那道内嵌的亮线极慢地过一口气——像有光从框上移过。
        // 走 inline 的自定义属性、不走过渡，免得被滤平；RM 时停在一个定值上。
        const b = api.RM ? 0.7 : 0.68 + Math.sin(t / 1700) * 0.12;
        rec.el.style.setProperty('--frm-lit', b.toFixed(3));
      },

      /* 让位：主程序已经把它们往外推开了。这里把远近分开——近的退两档焦，
         再顺着自己的方位斜滑一点；世界不是被推开，是对位松了、各自散开。 */
      yield(rec, on, api) {
        const r = api.rectOf();
        if (!r) return null;
        const dx = rec.x - (r.left + r.width / 2);
        const dy = rec.y - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - d / (api.vw * 0.82));
        const g = api.G;
        const sw = f * 15 * g * on;
        return {
          dx: (dx / d) * f * 17 * g * on - (dy / d) * sw,
          dy: (dy / d) * f * 17 * g * on + (dx / d) * sw,
          lod: Math.round(on * (0.6 + 1.4 * f)),
          alpha: 1 - 0.32 * on,
        };
      },
    },

    /* ══ 展开：虚框朝外张开，板的面浮起来成为读面 ══ */
    open: {
      run(api) {
        const it = api.it;
        const rec = api.rec;
        const r = api.rectOf();
        const pr = panelRect(api);
        stop();
        const cx = r ? r.left + r.width / 2 : api.vw / 2;
        const cy = r ? r.top + r.height / 2 : api.vh / 2;

        // 世界为它让开：近处的碎片往外退、退焦、暗下去
        api.setFx({
          cx,
          cy,
          target(rec2, fx, h) {
            const dx = rec2.x - fx.cx;
            const dy = rec2.y - fx.cy;
            const d = Math.hypot(dx, dy) || 1;
            const f = Math.max(0, 1 - d / (h.vw * 1.02));
            const push = f * f * 128 * h.G * fx.amt;
            return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.05 * fx.amt };
          },
          lod(rec2, lod, fx) {
            if (rec2 === fx.rec) return lod;
            const d = Math.hypot(rec2.x - fx.cx, rec2.y - fx.cy);
            return lod + (d < api.vw * 0.55 ? Math.round(fx.amt) : 0);
          },
          alpha(rec2, a, fx) {
            return rec2 === fx.rec ? a : a * (1 - 0.26 * fx.amt);
          },
        });

        api.hide();
        if (api.RM || !r) {
          api.openReader(pr, { mode: 'grow' });
          return;
        }

        const s = api.rectScale(rec); // 聚焦态下约等于 1
        const cw = it.cw;
        const ch = it.ch;
        /* 落点与阅读面同宽。reader 的 grow 会在同一个矩形上生成 rd-card
           （整张卡面铺满阅读面的宽），所以这里也按「整张卡面同宽」落——
           两边是同一张图、同一个尺寸，交出去的那一帧看不出换了东西。 */
        const k = pr.width / cw;
        const ph = ch * k;
        const arrive = { left: pr.left, top: pr.top + Math.max(0, (pr.height - ph) / 2) + 14, width: pr.width, height: ph };
        // 把 (cw × ch) 这一层的左上角放到 (l, t)、缩放到 sc
        const T = (l, t, sc) => `translate(${(l - (cw * (1 - sc)) / 2).toFixed(1)}px,${(t - (ch * (1 - sc)) / 2).toFixed(1)}px) scale(${sc.toFixed(4)})`;

        const layer = document.createElement('div');
        layer.className = 'frame-stage';
        layer.setAttribute('aria-hidden', 'true');

        const plate = document.createElement('div');
        plate.className = 'frame-plate';
        Object.assign(plate.style, { width: `${cw}px`, height: `${ch}px`, backgroundImage: `url(${it.lod[0]})` });

        // 虚框：与碎片上那一道同尺寸、同位置（此刻它已经对齐）
        const hollow = document.createElement('div');
        hollow.className = 'frame-hollow';
        Object.assign(hollow.style, { left: `${it.M}px`, top: `${it.M}px`, width: `${it.w}px`, height: `${it.h}px` });
        plate.appendChild(hollow);

        // 光落上去的那一下：面浮起来时被照着
        const glow = document.createElement('div');
        glow.className = 'frame-glow';
        Object.assign(glow.style, {
          left: `${it.M}px`,
          top: `${it.M}px`,
          width: `${it.w}px`,
          height: `${it.h}px`,
          background: 'linear-gradient(to bottom, rgb(var(--lit) / .22), rgb(var(--lit) / .05) 48%, transparent 78%)',
          opacity: '0',
        });
        plate.appendChild(glow);

        layer.appendChild(plate);
        document.body.appendChild(layer);
        stage = layer;

        const x0 = r.left - it.M * s;
        const y0 = r.top - it.M * s;
        const ax = arrive.left;
        const ay = arrive.top;
        plate.style.transform = T(x0, y0, s);

        // 虚框朝外张开、朝后仰开、化掉：张开的是框。它先离开，面才浮起来
        hollow.animate(
          [
            { transform: 'perspective(1100px) translate(0, 0) scale(1) rotateX(0deg)', opacity: 1, offset: 0, easing: 'cubic-bezier(.3, .6, .2, 1)' },
            { transform: 'perspective(1100px) translate(0, -11px) scale(1.17) rotateX(-15deg)', opacity: .62, offset: .45, easing: 'cubic-bezier(.4, .1, .4, 1)' },
            { transform: 'perspective(1100px) translate(0, -36px) scale(1.44) rotateX(-36deg)', opacity: 0, offset: 1 },
          ],
          { duration: 520, fill: 'both' }
        );

        // 板的面（连着印在上面的字）浮起来：先抬一下、朝后仰一点，再摊到读面上
        const u = 0.56;
        plate.animate(
          [
            { transform: `perspective(1500px) ${T(x0, y0, s)} rotateX(0deg)`, offset: 0, easing: 'cubic-bezier(.3, .42, .24, 1)' },
            { transform: `perspective(1500px) ${T(x0, y0 - 30, s * 1.05)} rotateX(8deg)`, offset: .22, easing: 'cubic-bezier(.36, .12, .24, 1)' },
            { transform: `perspective(1500px) ${T(lerp(x0, ax, u), lerp(y0 - 30, ay, u), lerp(s, k, u * 0.8))} rotateX(3deg)`, offset: .6, easing: 'cubic-bezier(.4, .14, .22, 1)' },
            { transform: `perspective(1500px) ${T(ax, ay, k)} rotateX(0deg)`, offset: 1 },
          ],
          { duration: 780, delay: 40, fill: 'both' }
        );

        glow.animate([{ opacity: 0 }, { opacity: 1, offset: .34 }, { opacity: 0 }], { duration: 900, delay: 70, fill: 'both', easing: 'cubic-bezier(.3, .6, .3, 1)' });

        // 面到了就交出去：面板从它落定的那块矩形长成阅读尺寸，同一帧里换，不留接缝
        timers.push(setTimeout(() => {
          api.openReader(arrive, { mode: 'grow' });
          if (stage === layer) {
            layer.remove();
            stage = null;
          }
        }, 880));
      },

      /* 收回：虚框从外面收回来，先错回交错的样子，再并拢到对齐（回到聚焦态） */
      closed(api) {
        stop();
        const rec = api.rec;
        if (!rec || !rec.el || api.RM) return;
        rec.el.classList.add('frame-again');
        timers.push(setTimeout(() => rec.el.classList.remove('frame-again'), 1020));
      },
    },
  });
})();
