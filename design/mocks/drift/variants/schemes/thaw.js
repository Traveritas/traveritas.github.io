/* 霜化：一片结着霜的玻璃。
   内容在霜下面，不是另画上去的——霜是遮蔽物，内容是被遮住的东西。
   于是浅底上霜是冷白的一层、化开后是深墨；深底上霜是灰白的一层、化开后是浅字。
   三种底共用同一件东西，不必各做一套。

   悬停是一点温度：霜从落点化开一小块，露出底下那一小片清楚的字，移开慢慢结回去。
   聚焦时霜先薄一层——它被看清了。展开时整片霜从中心往边缘退干净，退干净了就是正文，
   没有面板：阅读面就是这块玻璃自己。收回后碎片重新露出来，霜从边缘再爬满。 */
(() => {
  'use strict';
  const { rgba, hash, inject } = DriftReg;
  const root = document.documentElement;

  /* ══ 三种光 ══
     玻璃的底 / 霜的色与密度。随笔是冷灰蓝的浅底（霜薄、冷白），
     项目是深靛（霜厚、灰白），瞬间是暮紫（霜带一点暖）。
     浅底上霜要比玻璃亮，才不成蒙在上面的一层灰；深底上霜要比玻璃淡，才不成一块白斑。
     这几个数与下面 CSS 里的 --thaw-pane / --thaw-rime 是同一套：卡面是 canvas 画的、
     霜面是 CSS 画的，两边各要一份，改一处要改两处。 */
  const PANE = {
    essay: { rgb: [210, 219, 233], a: 0.88 },
    project: { rgb: [30, 45, 68], a: 0.88 },
    moment: { rgb: [62, 48, 80], a: 0.88 },
  };
  const RIME = {
    essay: { rgb: [250, 252, 255] },
    project: { rgb: [202, 214, 228] },
    moment: { rgb: [236, 214, 196] },
  };

  const MELT_H = 58; // 化开多大（世界单位；焦平面上 1 单位 = 1px）
  const MELT_E = 22; // 化开处的柔边
  const WIDE = 620; // 盖住整片玻璃的洞（比半对角大一点）
  const SETTLE = 500; // 退干净之后留下的那点：四角还剩一线霜，别把它退成一块光板

  /* 碎片的外形（四角三级像素阶梯，每级 3 单位）。霜面要裁成同一个外形，
     否则方角的霜会糊到切角外面去。 */
  const EDGE = 'polygon(9px 0, calc(100% - 9px) 0, calc(100% - 9px) 3px, calc(100% - 6px) 3px, calc(100% - 6px) 6px, '
    + 'calc(100% - 3px) 6px, calc(100% - 3px) 9px, 100% 9px, 100% calc(100% - 9px), calc(100% - 3px) calc(100% - 9px), '
    + 'calc(100% - 3px) calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) calc(100% - 3px), '
    + 'calc(100% - 9px) calc(100% - 3px), calc(100% - 9px) 100%, 9px 100%, 9px calc(100% - 3px), 6px calc(100% - 3px), '
    + '6px calc(100% - 6px), 3px calc(100% - 6px), 3px calc(100% - 9px), 0 calc(100% - 9px), 0 9px, 3px 9px, 3px 6px, '
    + '6px 6px, 6px 3px, 9px 3px)';

  inject('scheme-thaw', `
@property --thaw-wake { syntax: '<number>'; inherits: true; initial-value: 1; }
@property --thaw-far { syntax: '<number>'; inherits: true; initial-value: 1; }

html[data-scheme='thaw'] { --thaw-rime: 250 252 255; --thaw-veil: 0.88; --thaw-pane: 210 219 233; --thaw-pane-a: 0.88; --thaw-edge: ${EDGE}; }
html[data-scheme='thaw'][data-scene='project'] { --thaw-rime: 202 214 228; --thaw-veil: 0.92; --thaw-pane: 30 45 68; --thaw-pane-a: 0.88; }
html[data-scheme='thaw'][data-scene='moment'] { --thaw-rime: 236 214 196; --thaw-veil: 0.9; --thaw-pane: 62 48 80; --thaw-pane-a: 0.88; }

/* 霜面：盖在卡面之上的一层。
   正文是画在卡面上的，霜要遮住它只能另起一层——所以霜是 ::before，不是画进 canvas 的。
   碎片与阅读面共用这一套：展开时退掉的，与刚才盖着的是同一层。
   三层由下到上：结构（厚薄与走向）、边缘堆积（边比中间厚）、颗粒。 */
html[data-scheme='thaw'] .frag::before,
html[data-scheme='thaw'] .rd-glass::before {
  content: '';
  position: absolute;
  inset: var(--m, 0px);
  pointer-events: none;
  opacity: calc(var(--thaw-veil) * var(--thaw-wake, 1) * var(--thaw-far, 1) * var(--thaw-breath, 1));
  clip-path: var(--thaw-edge);
  background-image:
    var(--thaw-grain, linear-gradient(transparent, transparent)),
    radial-gradient(ellipse 76% 66% at 50% 50%, transparent 46%, rgb(var(--thaw-rime) / 0.42) 100%),
    var(--thaw-rime-img, linear-gradient(transparent, transparent));
  background-size: 64px 64px, auto, var(--thaw-s, 108% 108%);
  background-repeat: repeat, no-repeat, no-repeat;
  background-position: 0 0, 0 0, var(--thaw-cx, 0%) var(--thaw-cy, 0%);
  mask-image: var(--thaw-mask, none);
  -webkit-mask-image: var(--thaw-mask, none);
}

/* 每一块从同一张霜上取不同的一角：同一件东西，不是同一枚印章 */
html[data-scheme='thaw'] .frag:nth-child(5n + 2)::before { --thaw-cx: 100%; }
html[data-scheme='thaw'] .frag:nth-child(5n + 3)::before { --thaw-cx: 100%; --thaw-cy: 100%; }
html[data-scheme='thaw'] .frag:nth-child(5n + 4)::before { --thaw-cy: 100%; }
html[data-scheme='thaw'] .frag:nth-child(5n)::before { --thaw-cx: 50%; --thaw-cy: 100%; }

/* 景深：远处的霜不再是一粒粒的，收成一层薄雾——颗粒在这一档上只会变成噪点块。
   结构也放大一点，于是远处的碎片就是一块被霜糊住的色块，跟它的失焦档同一步。 */
html[data-scheme='thaw'] .frag[data-lod='1']::before { --thaw-grain: linear-gradient(transparent, transparent); --thaw-s: 140% 140%; }
html[data-scheme='thaw'] .frag[data-lod='2']::before { --thaw-grain: linear-gradient(transparent, transparent); --thaw-s: 200% 200%; image-rendering: pixelated; }
html[data-scheme='thaw'] .frag[data-lod='3']::before { --thaw-grain: linear-gradient(transparent, transparent); --thaw-s: 300% 300%; image-rendering: pixelated; }

/* 聚焦：霜先薄一层——它被看清了，于是它也醒了。
   薄这一下走过渡；醒的那口气（--thaw-breath，每帧都在变）不走，免得被过渡滤平。 */
html[data-scheme='thaw'] .frag { transition: --thaw-wake 0.62s ease; }
html[data-scheme='thaw'] .frag.thaw-thin { --thaw-wake: 0.62; }
/* 被看的那一块之外重新结上霜：世界让开，是霜从别处爬过来。
   挂在 html 上、只让 html 走过渡——两百块碎片跟着一个插值，不各起一条动画。 */
html[data-scheme='thaw'].thaw-world { --thaw-far: 1.1; transition: --thaw-far 1.1s ease; }

/* 阅读面就是这块玻璃自己：面板的底换成同一片玻璃，正文直接落在上面（没有面板）。
   留一点透光与模糊——磨砂玻璃本来就该把后面的世界化开。 */
html[data-scheme='thaw'].thaw-pane .rd-glass {
  background-color: rgb(var(--thaw-pane) / var(--thaw-pane-a));
  background-image: linear-gradient(180deg, rgb(var(--thaw-rime) / 0.1), transparent 42%, rgb(0 0 0 / 0.06));
  box-shadow: inset 0 1px 0 rgb(var(--thaw-rime) / 0.5), inset 0 -1px 0 rgb(0 0 0 / 0.1);
  backdrop-filter: blur(9px) saturate(1.03);
  -webkit-backdrop-filter: blur(9px) saturate(1.03);
}
html[data-scheme='thaw'].thaw-pane .rd-card { display: none; }
/* 阅读面比碎片大得多：结构图按卡片上的密度平铺过去，不跟着拉大——
   长到阅读尺寸的还是同一片霜，不是把霜放大。 */
html[data-scheme='thaw'] .rd-glass::before {
  background-size: 64px 64px, auto, 470px 300px;
  background-repeat: repeat, no-repeat, repeat;
}
`);

  /* ══ 霜的两张图 ══
     结构：大尺度的厚薄 + 细的针（一片一片的走向）。三种光只换颜色，形状是同一套。
     颗粒：极细的一层噪点，单独一张小图，铺在最上面。
     两张都是连续的画，不是噪点块：柔的斑与渐变的边打底，颗粒只是压在上面很薄的一层。
     结构图画成上下左右接得上的：碎片取它的一角，阅读面拿它平铺——
     同一片霜，长到多大都是同一个密度。 */
  function rimeCanvas(scene) {
    const W = 240;
    const H = 152;
    const col = (RIME[scene] || RIME.essay).rgb;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const x = cv.getContext('2d');
    /* 每一笔在九个位置上各落一遍：这样右边缘接得上左边缘，平铺看不出缝 */
    const wrapped = (draw) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          x.save();
          x.translate(dx * W, dy * H);
          draw();
          x.restore();
        }
    };
    x.fillStyle = rgba(col, 0.46);
    x.fillRect(0, 0, W, H);
    // 厚处：柔和的斑，有大有小
    for (let i = 0; i < 16; i++) {
      const cx = hash(scene, i) * W;
      const cy = hash(scene, i + 60) * H;
      const r = (0.16 + hash(scene, i + 120) * 0.42) * W;
      const a = 0.3 + hash(scene, i + 180) * 0.6;
      wrapped(() => {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(0.58, rgba(col, a * 0.48));
        g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    // 薄处：擦回来一点，好让底下的字在薄的地方透出一点影子
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) {
      const cx = hash(scene, i + 300) * W;
      const cy = hash(scene, i + 360) * H;
      const r = (0.12 + hash(scene, i + 420) * 0.28) * W;
      const a = 0.34 + hash(scene, i + 480) * 0.5;
      wrapped(() => {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
    }
    x.globalCompositeOperation = 'source-over';
    // 走向：顺着一个方向拉几道细长的带——霜是一层层结上去的，不是一团云
    for (let i = 0; i < 6; i++) {
      const oy = (hash(scene, i + 600) - 0.5) * H * 1.2;
      const r = W * (0.45 + hash(scene, i + 660) * 0.6);
      const a = 0.34 + hash(scene, i + 720) * 0.4;
      wrapped(() => {
        x.save();
        x.translate(W / 2, H / 2 + oy);
        x.rotate(-0.34);
        x.scale(3.6, 0.22);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g;
        x.fillRect(-r, -r, r * 2, r * 2);
        x.restore();
      });
    }
    // 细的针：霜多半是顺着一个方向一丛丛长出来的，光靠斑块只是一层雾
    x.lineCap = 'round';
    for (let i = 0; i < 76; i++) {
      const px = hash(scene, i + 900) * W;
      const py = hash(scene, i + 960) * H;
      const ang = -0.34 + (hash(scene, i + 1020) - 0.5) * 0.9;
      const len = 7 + hash(scene, i + 1080) * 24;
      const a = 0.13 + hash(scene, i + 1140) * 0.28;
      const lw = 0.7 + hash(scene, i + 1200) * 1.2;
      wrapped(() => {
        x.strokeStyle = rgba(col, a);
        x.lineWidth = lw;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
        x.stroke();
      });
    }
    return cv;
  }

  function grainCanvas() {
    const N = 64;
    const cv = document.createElement('canvas');
    cv.width = N;
    cv.height = N;
    const x = cv.getContext('2d');
    const d = x.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const a = hash('grain', i);
      const b = hash('grain.b', i);
      d.data[i * 4] = 255;
      d.data[i * 4 + 1] = 255;
      d.data[i * 4 + 2] = 255;
      d.data[i * 4 + 3] = Math.round((a * a * 0.4 + (b < 0.06 ? 0.42 : 0)) * 255);
    }
    x.putImageData(d, 0, 0);
    return cv;
  }

  const toURL = (cv) => new Promise((res) => cv.toBlob((b) => res(URL.createObjectURL(b))));
  (async () => {
    try {
      const grain = await toURL(grainCanvas());
      const rime = {};
      for (const s of ['essay', 'project', 'moment']) rime[s] = await toURL(rimeCanvas(s));
      inject('scheme-thaw-tex', `html[data-scheme='thaw'] { --thaw-grain: url("${grain}"); }
        html[data-scheme='thaw'][data-scene='essay'] { --thaw-rime-img: url("${rime.essay}"); }
        html[data-scheme='thaw'][data-scene='project'] { --thaw-rime-img: url("${rime.project}"); }
        html[data-scheme='thaw'][data-scene='moment'] { --thaw-rime-img: url("${rime.moment}"); }`);
    } catch {}
  })();

  /* ══ 洞 ══
     霜退到哪儿了。整套里唯一在变的数——化开、退干净、重新结满，都是它在走。
     化开处不是空的：还留着一层薄薄的湿膜（0.18），玻璃才还是玻璃，不成一个窟窿。
     没有洞时把遮罩整个撤掉：一层恒定的遮罩会让每一块碎片都多走一遍合成。
     --thaw-hx/hy/h/e 只是把它同时写在元素上，方便在页面上核对，遮罩本身在这里拼。 */
  function setHole(el, hx, hy, h, e) {
    const s = el.style;
    s.setProperty('--thaw-hx', `${hx.toFixed(2)}%`);
    s.setProperty('--thaw-hy', `${hy.toFixed(2)}%`);
    s.setProperty('--thaw-h', `${h.toFixed(1)}px`);
    s.setProperty('--thaw-e', `${e.toFixed(1)}px`);
    if (h > 0.5) s.setProperty('--thaw-mask', `radial-gradient(circle at ${hx.toFixed(2)}% ${hy.toFixed(2)}%, rgb(0 0 0 / 0.18) 0 ${h.toFixed(1)}px, #000 ${(h + e).toFixed(1)}px, #000 100%)`);
    else s.removeProperty('--thaw-mask');
  }

  /* 一条自己的时间线：退干净与重新结满都是同一个数在走，所以只写一处。
     洞的位置也一起走——展开是从指针刚化开的那一块接着退，不是另起一个洞。 */
  let tl = null;
  let raf = 0;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  function step() {
    raf = 0;
    if (!tl) return;
    const p = tl.dur ? Math.min(1, (performance.now() - tl.t0) / tl.dur) : 1;
    const k = ease(p);
    const at2 = (a, b) => a + (b - a) * k;
    setHole(tl.el, at2(tl.x0, tl.x1), at2(tl.y0, tl.y1), at2(tl.h0, tl.h1), at2(tl.e0, tl.e1));
    if (p < 1) raf = requestAnimationFrame(step);
    else {
      const d = tl.done;
      tl = null;
      d && d();
    }
  }
  function tween(el, from, to, dur, done) {
    tl = { el, x0: from[0], y0: from[1], h0: from[2], e0: from[3], x1: to[0], y1: to[1], h1: to[2], e1: to[3], dur, t0: performance.now(), done };
    if (!raf) raf = requestAnimationFrame(step);
  }

  /* ══ 悬停：指针是一点温度 ══
     同时只悬停一块，所以一份状态就够。离开后不是瞬间复原：洞按一条慢的时间常数收回去。 */
  const melt = { rec: null, on: false, x: 50, y: 50, h: 0 };
  const at = (rec, mx, my) => {
    const w = rec.it.w * rec.s || 1;
    const h = rec.it.h * rec.s || 1;
    return [((mx - (rec.x - w / 2)) / w) * 100, ((my - (rec.y - h / 2)) / h) * 100];
  };

  /* 阅读面的矩形（与 reader.js 同一套） */
  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  let pane = null;
  let timers = [];
  const stopTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  DriftReg.scheme('thaw', {
    label: '霜化',

    /* ── 物：一片结着霜的玻璃 ──
       卡面只画玻璃本身：底、一层从上看下去的光、迎光的上沿。
       霜在另一层（上面的 CSS），因为霜要盖住画在卡面上的正文。 */
    look: {
      label: '霜化',
      margin: 0,
      inset: 0,
      surface(ctx, it, c, M) {
        const { w, h } = it;
        const p = PANE[it.scene] || PANE.essay;
        const r = (RIME[it.scene] || RIME.essay).rgb;
        DriftReg.stepPath(ctx, M, M, w, h, 3);
        ctx.fillStyle = rgba(p.rgb, p.a);
        ctx.fill();
        ctx.save();
        ctx.clip();
        const g = ctx.createLinearGradient(M, M, M, M + h);
        g.addColorStop(0, rgba(r, 0.09));
        g.addColorStop(0.46, rgba(r, 0));
        g.addColorStop(1, rgba([0, 0, 0], 0.07));
        ctx.fillStyle = g;
        ctx.fillRect(M, M, w, h);
        ctx.fillStyle = rgba(r, 0.5);
        ctx.fillRect(M, M, w, 1);
        ctx.fillStyle = rgba([0, 0, 0], 0.09);
        ctx.fillRect(M, M + h - 1, w, 1);
        ctx.restore();
      },
    },

    /* ── 悬停 ── */
    hover: {
      label: '霜化',
      clear: true, // 化开的那一小块要看见清楚的字，所以这一块跳到清晰档
      gate: (rec) => rec.lod <= 1,

      enter(rec, api) {
        // 换块了：上一块的洞立刻收掉（它不会再被 tick 推到）
        if (melt.rec && melt.rec !== rec) setHole(melt.rec.el, 50, 50, 0, 0);
        if (melt.rec !== rec) melt.h = 0;
        melt.rec = rec;
        melt.on = true;
        const [x, y] = at(rec, api.mouse.x, api.mouse.y);
        melt.x = x;
        melt.y = y;
        if (api.RM) {
          melt.h = MELT_H;
          setHole(rec.el, melt.x, melt.y, melt.h, MELT_E);
        }
      },

      leave(rec) {
        if (melt.rec === rec) melt.on = false;
        else setHole(rec.el, 50, 50, 0, 0);
      },

      tick(dt, t, api) {
        const rec = melt.rec;
        if (!rec) return;
        // 这一块已经离场（换了场景或被回收）：把变量清干净，别留给下一个占用它的人
        if (api.recs.get(rec.key) !== rec) {
          setHole(rec.el, 50, 50, 0, 0);
          melt.rec = null;
          return;
        }
        if (melt.on && rec === api.hoverRec) {
          const [x, y] = at(rec, api.mouse.x, api.mouse.y);
          melt.x = Math.max(-8, Math.min(108, x));
          melt.y = Math.max(-8, Math.min(108, y));
          melt.h += (MELT_H - melt.h) * (api.RM ? 1 : 1 - Math.exp(-dt / 0.14));
        } else {
          melt.h += (0 - melt.h) * (api.RM ? 1 : 1 - Math.exp(-dt / 0.46));
          if (melt.h < 0.5) {
            setHole(rec.el, melt.x, melt.y, 0, 0);
            melt.rec = null;
            return;
          }
        }
        setHole(rec.el, melt.x, melt.y, melt.h, MELT_E * (melt.h / MELT_H));
      },

      /* 温度从落点散出去：邻近的碎片被推开一点，再顺着一个方向滑一点——
         是空气在动，不是炸开。 */
      neighbor(rec, hover, api) {
        const dx = rec.x - hover.x;
        const dy = rec.y - hover.y;
        const d = Math.hypot(dx, dy) || 1;
        const R = 340 * api.G;
        if (d > R) return null;
        const w = 1 - d / R;
        const ux = dx / d;
        const uy = dy / d;
        const push = w * w * 15 * api.G;
        const slide = w * 9 * api.G * Math.sin(rec.ph);
        return { dx: ux * push - uy * slide, dy: uy * push + ux * slide };
      },
    },

    /* ── 聚焦：霜薄一层，周围的世界让开 ── */
    focus: {
      on(rec, api) {
        rec.el.classList.add('thaw-thin');
        root.classList.add('thaw-world');
        if (!api.RM) rec.el.style.setProperty('--thaw-breath', '1');
      },
      off(rec, api) {
        rec.el.classList.remove('thaw-thin');
        rec.el.style.removeProperty('--thaw-breath');
        root.classList.remove('thaw-world');
      },
      tick(dt, t, api) {
        const rec = api.rec;
        if (!rec || !rec.el || api.RM) return;
        // 它被看清了，于是它也醒了：极慢的一口气
        rec.el.style.setProperty('--thaw-breath', (1 + Math.sin(t / 1500) * 0.05).toFixed(3));
      },
      /* 主程序已经把它周围的碎片往外推开了；这里再加一点侧向的滑移，
         让「让开」是旋开的，不是炸开的。 */
      yield(rec, on, api) {
        const r = api.rectOf();
        if (!r) return {};
        const ux0 = rec.x - (r.left + r.width / 2);
        const uy0 = rec.y - (r.top + r.height / 2);
        const d = Math.hypot(ux0, uy0) || 1;
        const ux = ux0 / d;
        const uy = uy0 / d;
        const g = api.G;
        return { dx: (ux * 12 - uy * 26) * g * on, dy: (uy * 12 + ux * 26) * g * on, alpha: 1 - 0.2 * on };
      },
    },

    /* ── 展开：整片霜从中心往边缘退干净 ──
       阅读面就是这块玻璃自己长到阅读尺寸——没有面板。第一帧它与碎片严丝合缝：
       同一片玻璃、同一层薄着的霜，所以换过来看不出来。 */
    open: {
      label: '霜化',

      run(api) {
        const r = api.rectOf();
        const pr = panelRect(api);
        pane = null;
        stopTimers();
        if (!r) {
          api.openReader(pr, { mode: 'grow' });
          return;
        }
        /* 这一块的霜退开，周围的世界让开一点、退一档、暗一点 */
        api.setFx({
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          target(rec, fx, h) {
            const dx = rec.x - fx.cx;
            const dy = rec.y - fx.cy;
            const d = Math.hypot(dx, dy) || 1;
            const w = Math.max(0, 1 - d / (h.vw * 1.1));
            const push = fx.amt * 130 * h.G * w * w;
            return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.03 * fx.amt };
          },
          lod(rec, lod, fx) {
            if (rec === fx.rec) return lod;
            const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
            return lod + (d < api.vw * 0.5 ? Math.round(fx.amt) : 0);
          },
          alpha(rec, a, fx) {
            if (rec === fx.rec) return a;
            return a * (1 - 0.24 * fx.amt);
          },
        });
        if (api.RM) {
          api.openReader(pr, { mode: 'grow' });
          return;
        }
        root.classList.add('thaw-pane');
        api.hide();
        api.openReader(pr, { mode: 'grow' });
        const glass = document.querySelector('.rd-glass');
        if (!glass) {
          root.classList.remove('thaw-pane');
          return;
        }
        pane = glass;
        // 一开始就是碎片刚才的样子：薄着的那一层霜，接着指针化开的那一块——不是另起一个洞
        glass.style.setProperty('--thaw-wake', '0.62');
        const from = melt.rec === api.rec ? [melt.x, melt.y, melt.h * api.rectScale(api.rec), MELT_E * (melt.h / MELT_H)] : [50, 50, 0, 0];
        melt.rec = null; // 洞从这一刻起归阅读面，悬停不再碰它
        setHole(glass, from[0], from[1], from[2], from[3]);
        // 等它长到阅读尺寸再退：霜从中心往边缘退，退干净了就是正文
        timers.push(setTimeout(() => {
          if (pane === glass) tween(glass, from, [50, 50, SETTLE, 170], 950);
        }, 380));
      },

      closed(api) {
        const rec = api.rec;
        stopTimers();
        if (tl && tl.el === pane) tl = null;
        pane = null;
        root.classList.remove('thaw-pane');
        if (!rec || !rec.el) return;
        if (melt.rec === rec) melt.rec = null; // 收回这一下由下面这条时间线接管
        // 收回后碎片重新露出来：霜从边缘再爬满
        const el = rec.el;
        setHole(el, 50, 50, WIDE, 220);
        tween(el, [50, 50, WIDE, 220], [50, 50, 0, 0], api.RM ? 0 : 700, () => setHole(el, 50, 50, 0, 0));
      },
    },
  });
})();
