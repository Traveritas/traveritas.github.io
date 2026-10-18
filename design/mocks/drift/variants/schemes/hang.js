/* 悬落 · 整件东西移动过来 ──────────────────────────────────────────

   物：一片吊着的玻璃压花屏。磨砂玻璃里压着一枝干花，两根细线从玻璃的上角斜上去，
   收到一根哑光的横杆上；横杆正中一颗小珠，一根吊线从画面上沿垂下来接住它。
   挑它，是因为「吊着的东西」里只有它天生就是一片面——玻璃是磨砂的、半透的、低饱和的，
   正文落上去不必解释；而两根线、一根杆、一颗珠，是这个空间里最不必解释的现实物。
   风铃吊着的是声音，灯吊着的是光，画框吊着的是墙；一片压花玻璃吊着的是它自己。
   世界负责陌生，它负责熟悉。

   悬停：它绕自己的挂点摆一下，定格的——几帧写死的角度，不插值。
   聚焦：它荡到静止、垂正，光从上面落下来；周围的碎片往上退一点。
   展开：它离开原位、朝你摊平成阅读面，横杆与吊线松开、往上散掉；周围的碎片往上让开。
   收回：阅读面缩回它原来吊着的地方，它还在轻晃。

   镜头不动。聚焦已经做过镜头的事了，动的是物件自己——六个方案里只有这一个的展开
   真的动用了空间。
   ───────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const { rgba, stepPath } = DriftReg;

  /* ── 尺寸（世界单位；焦平面上 1 单位 = 1px） ── */
  const M = 84; // 卡面外的余量：上方整条留给吊线与横杆
  const ROD_UP = 62; // 横杆顶在玻璃上沿之上多高
  const ROD_H = 9;
  const ROD_W = 0.86; // 横杆占卡宽的比例
  const CORD_W = 3; // 吊线宽：细，但要在 6 单位一像素的那档上还留得住

  /* ── 定格的摆 ──
     吊着的东西本该连续地摆。这里让它一格一格地走：这个空间的时间本来就是被采样过的
     （流光、失焦分档都是分档的），而悬落是六个方案里唯一一个「物件自己在空间里移动」
     的——把这一格留给它，连续留给碎片。
     邻居的气流读同一组角度、再被弹簧抹平：物件是定格的，空气是连续的。 */
  const FRAMES = [-3.4, 2.2, -1.4, 0.85, -0.5, 0.28, 0, 0];
  const FRAME_MS = 130;
  /* 收回：阅读面缩回它原来吊着的地方之后，它从略低处升回原位、还在轻晃。
     抬起的量也走同一张表——定格的不只是角度。 */
  const RETURN = [-3.2, 2.0, -1.2, 0.72, -0.4, 0.2, 0];
  const RISE = [15, 9, 4.5, 2, 0.6, 0, 0];

  const rgbOf = (s) => {
    const v = parseInt(String(s).replace('#', ''), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  /* 聚焦时落下来的那道光：比玻璃高出一截，光才是从上面下来的，不是凭空亮在玻璃上 */
  const FALL_UP = 190;
  const FALL_PAD = 46;
  const fallRect = (r) => ({ left: r.left - FALL_PAD, top: r.top - FALL_UP, width: r.width + FALL_PAD * 2, height: r.height + FALL_UP });
  const placeFall = (el, r) => {
    const f = fallRect(r);
    el.style.left = `${f.left}px`;
    el.style.top = `${f.top}px`;
    el.style.width = `${f.width}px`;
    el.style.height = `${f.height}px`;
  };

  /* 展开途中的那一层，和收回时的定时器。同一时刻只有一次展开，所以放在模块级。 */
  let stage = null;
  let backEl = null; // 正在晃回来的那块碎片
  let timers = [];
  let raf = 0;
  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // 晃到一半就被下一次展开接上时，得把它停在原地——不然它会一直斜着
    if (backEl) {
      backEl.classList.remove('hang-back');
      backEl.style.removeProperty('--hang-a');
      backEl.style.removeProperty('--hang-y');
      backEl = null;
    }
    if (stage) {
      stage.remove();
      stage = null;
    }
  }

  DriftReg.scheme('hang', {
    label: '悬落',

    /* ══ 外观：吊着的一片压花玻璃 ══
       卡面只画「底子」——玻璃、横杆、吊线、小珠。正文由 cards.js 画在玻璃上。 */
    look: {
      margin: M,
      inset: 0,
      paper: false,

      surface(ctx, it, c, m, reg) {
        const { w, h } = it;
        const cx = m + w / 2;
        const soft = rgbOf(c.soft);
        const ink = rgbOf(c.ink);
        const fg = rgbOf(c.fg);
        const rodW = Math.round(w * ROD_W);
        const rodTop = m - ROD_UP;
        const rodBot = rodTop + ROD_H;

        /* 吊线：主线上端淡出——线是没入上方的空气里的，不是被画面切断了；
           所以摆动的挂点取在卡面上沿正中，线在那里就不见了。 */
        const cord = (x0, y0, x1, y1, a0, a1) => {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, rgba(soft, a0));
          g.addColorStop(0.34, rgba(soft, a1));
          g.addColorStop(1, rgba(soft, a1));
          ctx.strokeStyle = g;
          ctx.lineWidth = CORD_W;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        };
        cord(cx, 0, cx, rodTop + 2, 0, 0.55);
        cord(cx - rodW / 2 + 3, rodBot - 3, m + 2, m, 0.5, 0.5);
        cord(cx + rodW / 2 - 3, rodBot - 3, m + w - 2, m, 0.5, 0.5);

        /* 横杆：哑光的树脂条，两端各收一级台阶（和全站的边同一种话）。
           上沿迎光、下沿压暗——它是一根有厚度、被光从上面照着的东西。 */
        const rg = ctx.createLinearGradient(0, rodTop, 0, rodBot);
        rg.addColorStop(0, rgba(fg, 0.46));
        rg.addColorStop(0.45, rgba(soft, 0.42));
        rg.addColorStop(1, rgba(soft, 0.26));
        ctx.beginPath();
        ctx.rect(cx - rodW / 2, rodTop + 3, rodW, ROD_H - 6);
        ctx.rect(cx - rodW / 2 + 3, rodTop, rodW - 6, 3);
        ctx.rect(cx - rodW / 2 + 3, rodBot - 3, rodW - 6, 3);
        ctx.fillStyle = rg;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = c.lit;
        ctx.fillRect(cx - rodW / 2 + 3, rodTop, rodW - 6, 1);
        ctx.fillStyle = c.shade;
        ctx.fillRect(cx - rodW / 2 + 3, rodBot - 1, rodW - 6, 1);
        ctx.globalAlpha = 1;

        /* 小珠：吊线与横杆相接的地方，整件东西唯一的一点暖色 */
        ctx.fillStyle = rgba(ink, 0.48);
        ctx.fillRect(cx - 5, rodTop - 1, 10, 11);
        ctx.fillStyle = rgba(ink, 0.86);
        ctx.fillRect(cx - 3, rodTop + 1, 6, 7);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = c.lit;
        ctx.fillRect(cx - 2, rodTop + 2, 3, 3);
        ctx.globalAlpha = 1;

        /* ── 玻璃 ── */
        stepPath(ctx, m, m, w, h, 3);
        ctx.fillStyle = c.fill;
        ctx.fill();
        ctx.save();
        ctx.clip();

        // 上方来的光：上半片亮，往下化开
        ctx.globalAlpha = 0.4;
        let g = ctx.createLinearGradient(0, m, 0, m + h * 0.62);
        g.addColorStop(0, c.lit);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(m, m, w, h * 0.62);
        ctx.globalAlpha = 1;

        // 横杆投下的影：贴着上沿，几十个单位就散尽
        ctx.globalAlpha = 0.5;
        g = ctx.createLinearGradient(0, m, 0, m + 34);
        g.addColorStop(0, c.dark);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(m, m, w, 34);
        ctx.globalAlpha = 1;

        // 下缘压深，玻璃才不像一张平贴的纸
        ctx.globalAlpha = 0.5;
        g = ctx.createLinearGradient(0, m + h * 0.58, 0, m + h);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, c.shade);
        ctx.fillStyle = g;
        ctx.fillRect(m, m + h * 0.58, w, h * 0.42);
        ctx.globalAlpha = 1;

        // 斜过玻璃的一道极淡的返光
        ctx.save();
        ctx.translate(cx - w * 0.16, m + h * 0.4);
        ctx.rotate(-0.3);
        const gl = ctx.createLinearGradient(-w, 0, w, 0);
        gl.addColorStop(0.36, 'rgba(255,255,255,0)');
        gl.addColorStop(0.5, rgba([255, 255, 255], 0.1));
        gl.addColorStop(0.64, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(-w, -h, w * 2, h * 2);
        ctx.restore();

        /* 玻璃下压着的一枝：全站花母题在这里的一个落点。
           它不承担信息，只承担熟悉——远看化成一团微温的痕，近看才认得出是叶子。 */
        ctx.save();
        ctx.translate(m + w - 6, m + h - 66);
        ctx.rotate(-0.42);
        ctx.strokeStyle = rgba(ink, 0.22);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 44);
        ctx.quadraticCurveTo(-2, 6, -18, -32);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          ctx.save();
          ctx.translate(-2 - 12 * t, 32 - 62 * t);
          ctx.rotate(-0.62 + i * 0.4);
          ctx.beginPath();
          ctx.ellipse(0, 0, 15 - i * 1.6, 5.6, 0, 0, 6.2832);
          ctx.fillStyle = rgba(ink, 0.15 + i * 0.014);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        // 上沿的一道亮边：玻璃的厚度在这里
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = c.lit;
        ctx.fillRect(m + 3, m, w - 6, 2);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(m, m + 3, 1, h - 6);
        ctx.globalAlpha = 1;
        ctx.restore();

        // 背光的两条边
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = c.shade;
        ctx.fillRect(m + 3, m + h - 1, w - 6, 1);
        ctx.fillRect(m + w - 1, m + 3, 1, h - 6);
        ctx.globalAlpha = 1;
      },
    },

    /* ══ 悬停：轻轻荡一下，带起一点气流 ══ */
    hover: {
      enter(rec, api) {
        rec.__h0 = api.t;
        rec.__a = api.RM ? 0 : FRAMES[0];
        rec.el.style.setProperty('--hang-src', `url(${rec.it.lod[rec.lod]})`);
        rec.el.style.setProperty('--hang-a', `${rec.__a}deg`);
        rec.el.style.removeProperty('--hang-y');
      },

      leave(rec) {
        rec.el.style.removeProperty('--hang-a');
      },

      /* 卡面让给一层会转的复制（见 css）：旋转的原点在吊线没入空气的地方，
         所以摆的是它底下那件东西，线还挂在原处。 */
      tick(dt, t, api) {
        const rec = api.hoverRec;
        if (!rec || api.RM) return;
        if (rec.__hl !== rec.lod) {
          rec.__hl = rec.lod;
          rec.el.style.setProperty('--hang-src', `url(${rec.it.lod[rec.lod]})`);
        }
        const i = Math.min(FRAMES.length - 1, Math.floor((t - (rec.__h0 || t)) / FRAME_MS));
        rec.__a = FRAMES[i];
        rec.el.style.setProperty('--hang-a', `${FRAMES[i]}deg`);
      },

      /* 气流：它荡到哪边，近旁的碎片就被带得偏一点、抬一点。
         读的是同一组定格角度，但这里只是喂给弹簧的目标——落到屏上已经是连续的。 */
      neighbor(rec, hover, api) {
        const dx = rec.x - hover.x;
        const dy = rec.y - hover.y;
        const d = Math.hypot(dx, dy) || 1;
        const R = 560 * api.G;
        if (d >= R) return null;
        const f = (1 - d / R) ** 2;
        const a = hover.__a || 0;
        return {
          dx: a * 2.6 * f * api.G + (dx / d) * f * 9 * api.G,
          dy: (dy / d) * f * 9 * api.G - f * 4 * api.G,
        };
      },
    },

    /* ══ 聚焦：荡到静止、垂正，光落下来 ══ */
    focus: {
      on(rec, api) {
        const r = api.rectOf();
        if (!r) return;
        const el = document.createElement('div');
        el.className = 'hang-fall';
        // 最亮的一段留在玻璃之上：光是落下来的，玻璃只接到它的尾巴，
        // 否则正文那一行会被冲淡。两圈径向叠出光柱，四边都是软的，不留直边。
        el.style.background = 'radial-gradient(38% 86% at 50% 30%, rgb(var(--lit) / 0.32), rgb(var(--lit) / 0.06) 62%, transparent 80%),'
          + 'radial-gradient(86% 124% at 50% 42%, rgb(var(--lit) / 0.12), transparent 76%)';
        placeFall(el, r);
        api.ui.appendChild(el);
        if (!api.RM)
          el.animate([{ opacity: 0, transform: 'translateY(-44px)' }, { opacity: 1, transform: 'none' }], {
            duration: 1000,
            easing: 'cubic-bezier(0.3, 0.62, 0.24, 1)',
            fill: 'both',
          });
      },

      off(rec, api) {
        api.ui.querySelectorAll('.hang-fall').forEach((e) => e.remove());
      },

      tick(dt, t, api) {
        if (!api.rec) return;
        const el = api.ui.querySelector('.hang-fall');
        const r = el && api.rectOf();
        if (r) placeFall(el, r);
      },

      /* 让位：默认的径向推开之外，再往上抬一点——空间不是把它推开，是给它让出一块地方 */
      yield(rec, on, api) {
        const r = api.rectOf();
        if (!r) return null;
        const d = Math.hypot(rec.x - (r.left + r.width / 2), rec.y - (r.top + r.height / 2));
        const f = Math.max(0, 1 - d / (api.vw * 0.85));
        return { dy: -12 * f * on * api.G, lod: Math.round(on * (0.6 + f)) };
      },
    },

    /* ══ 展开：它离开原位，朝你摊平成阅读面 ══ */
    open: {
      run(api) {
        const it = api.it;
        const rec = api.rec;
        const r = api.rectOf();
        const pr = panelRect(api);
        const cx = r ? r.left + r.width / 2 : api.vw / 2;
        const cy = r ? r.top + r.height / 2 : api.vh / 2;

        clear();

        /* 世界为它让开：近处的碎片往上退、往外让一点；远处的只是变粗、变暗。 */
        api.setFx({
          cx,
          cy,
          target(rec2, fx, h) {
            const dx = rec2.x - fx.cx;
            const dy = rec2.y - fx.cy;
            const d = Math.hypot(dx, dy) || 1;
            const f = Math.max(0, 1 - d / (h.vw * 0.92));
            return {
              dx: (dx / d) * f * 40 * h.G * fx.amt,
              dy: (dy / d) * f * 22 * h.G * fx.amt - f * 74 * h.G * fx.amt,
              s: 1 - 0.05 * fx.amt,
            };
          },
          lod(rec2, lod, fx) {
            if (rec2 === fx.rec) return lod;
            const d = Math.hypot(rec2.x - fx.cx, rec2.y - fx.cy);
            return lod + Math.round(fx.amt * (0.5 + 1.5 * Math.max(0, 1 - d / (api.vw * 0.9))));
          },
          alpha(rec2, a, fx) {
            return rec2 === fx.rec ? a : a * (1 - 0.3 * fx.amt);
          },
        });
        api.hide();
        if (api.RM || !r) {
          api.openReader(pr);
          return;
        }

        const s = api.rectScale(rec); // 它此刻的缩放（聚焦态，约等于 1）
        const cw = it.cw;
        const ch = it.ch;
        const src = `url(${it.lod[0]})`;
        const k = pr.width / it.w; // 玻璃摊到阅读面的宽
        const ph = it.h * k;
        /* 落点：与阅读面同宽，还是玻璃自己的比例——摊平的是宽度，往下的那一截交给面板去长 */
        const arrive = { left: pr.left, top: pr.top + (pr.height - ph) / 2 + 20, width: pr.width, height: ph };
        const x0 = cx - cw / 2;
        const y0 = cy - ch / 2;
        const x1 = arrive.left + arrive.width / 2 - cw / 2;
        const y1 = arrive.top + arrive.height / 2 - ch / 2;
        const T = (x, y, sc) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;

        /* 两层共用同一张卡面：上面一层是横杆与吊线，下面一层是玻璃。
           剪开而不是各画一次，是为了第一帧和碎片本身严丝合缝——开始的那一帧看不出来。 */
        const layer = document.createElement('div');
        layer.className = 'hang-stage';
        const mk = (cls, clip) => {
          const d = document.createElement('div');
          d.className = cls;
          Object.assign(d.style, { width: `${cw}px`, height: `${ch}px`, backgroundImage: src, clipPath: clip });
          layer.appendChild(d);
          return d;
        };
        const susp = mk('hang-susp', `inset(0 0 ${ch - it.M}px 0)`);
        const pane = mk('hang-pane', `inset(${it.M}px 0 ${it.M}px 0)`);
        document.body.appendChild(layer);
        stage = layer;

        const from = T(x0, y0, s);
        susp.style.transform = from;
        pane.style.transform = from;

        // 横杆与吊线松开、往上散掉：这一下是「整件东西移动过来」里最清楚的一拍
        susp.animate([{ transform: from, opacity: 1 }, { transform: T(x0, y0 - 36, s), opacity: 0 }], {
          duration: 460,
          delay: 30,
          easing: 'cubic-bezier(0.4, 0, 0.5, 1)',
          fill: 'both',
        });

        // 玻璃：先把线里的余量提起来、朝后仰一下，再放下来摊平
        const u = 0.6;
        pane.animate(
          [
            { transform: `perspective(1500px) ${from} rotateX(0deg)`, offset: 0, easing: 'cubic-bezier(0.34, 0.5, 0.3, 1)' },
            { transform: `perspective(1500px) ${T(x0, y0 - 28, s * 1.06)} rotateX(7deg)`, offset: 0.24, easing: 'cubic-bezier(0.36, 0.12, 0.24, 1)' },
            { transform: `perspective(1500px) ${T(lerp(x0, x1, u), lerp(y0 - 28, y1, u), lerp(s, k, u * 0.72))} rotateX(2.6deg)`, offset: 0.6, easing: 'cubic-bezier(0.4, 0.14, 0.22, 1)' },
            { transform: `perspective(1500px) ${T(x1, y1, k)} rotateX(0deg)`, offset: 1 },
          ],
          { duration: 820, fill: 'both' }
        );

        // 光落到玻璃上：最后一段才亮起来
        const glow = document.createElement('div');
        glow.className = 'hang-glow';
        Object.assign(glow.style, {
          left: `${it.M}px`,
          top: `${it.M}px`,
          width: `${it.w}px`,
          height: `${it.h}px`,
          background: 'linear-gradient(to bottom, rgb(var(--lit) / 0.26), rgb(var(--lit) / 0.05) 52%, transparent 82%)',
          opacity: '0',
        });
        pane.appendChild(glow);
        glow.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 400, easing: 'cubic-bezier(0.3, 0.6, 0.3, 1)', fill: 'both' });

        // 玻璃到了就交出去：面板从它落定的那块矩形长成阅读尺寸。
        // 玻璃先一步融掉，正文才起来——两段不重叠，就不会同时看见两份标题。
        timers.push(
          setTimeout(() => {
            pane.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.5, 1)', fill: 'both' });
          }, 700)
        );
        timers.push(setTimeout(() => api.openReader(arrive), 720));
        timers.push(
          setTimeout(() => {
            if (stage === layer) {
              layer.remove();
              stage = null;
            }
          }, 1120)
        );
      },

      /* 收回：阅读面缩回它原来吊着的地方，它还在轻晃。
         晃的是同一组定格角度——所以走的和来的是同一种步子。 */
      closed(api) {
        clear();
        const rec = api.rec;
        if (!rec) return;
        const el = rec.el;
        el.style.setProperty('--hang-src', `url(${rec.it.lod[rec.lod] || rec.it.lod[0]})`);
        if (api.RM) return;
        el.style.setProperty('--hang-a', `${RETURN[0]}deg`);
        el.style.setProperty('--hang-y', `${RISE[0]}px`);
        el.classList.add('hang-back');
        backEl = el;
        const t0 = performance.now();
        const step = () => {
          const i = Math.floor((performance.now() - t0) / 150);
          if (i >= RETURN.length) {
            el.classList.remove('hang-back');
            el.style.removeProperty('--hang-a');
            el.style.removeProperty('--hang-y');
            if (backEl === el) backEl = null;
            raf = 0;
            return;
          }
          el.style.setProperty('--hang-a', `${RETURN[i]}deg`);
          el.style.setProperty('--hang-y', `${RISE[i]}px`);
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
    },

    css: `
/* 悬停与收回：整块卡面让给一层会转的复制。旋转的原点落在吊线没入空气的地方（50% 0），
   所以吊线始终挂在原处，摆的是它底下那件东西。角度由脚本按定格表一帧一帧写进 --hang-a。 */
html[data-scheme='hang'] .frag.hot,
html[data-scheme='hang'] .frag.hang-back { background-image: none !important; }
html[data-scheme='hang'] .frag.hot::before,
html[data-scheme='hang'] .frag.hang-back::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--hang-src, inherit);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transform-origin: 50% 0;
  transform: translateY(var(--hang-y, 0px)) rotate(var(--hang-a, 0deg));
}
html[data-scheme='hang'] .frag.hot { filter: brightness(1.05) drop-shadow(0 8px 24px rgb(var(--lit) / 0.16)); }

/* 展开：物件自己从原位移到阅读面，镜头不动。这一层压在阅读层之上——
   玻璃融进面板的同时正文才起来。 */
html[data-scheme='hang'] .hang-stage { position: fixed; inset: 0; z-index: 24; pointer-events: none; }
html[data-scheme='hang'] .hang-susp,
html[data-scheme='hang'] .hang-pane {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 50% 50%;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  will-change: transform, opacity;
}
html[data-scheme='hang'] .hang-glow { position: absolute; }

/* 聚焦：光从上面落下来 */
html[data-scheme='hang'] .hang-fall { position: absolute; pointer-events: none; }
`,
  });
})();
