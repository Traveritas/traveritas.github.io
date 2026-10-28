/* ═══════════════════════════════════════════════════════════════════════════
   开屏 2 迭代 · 三案共用的挂载层

   它只做三件事：
     1. 把颗粒画布插进假首页（压住 .h-flow，压在大字与脑电线之下）；
     2. 用同一条时间轴驱动首页那几件字的入场（接管，不让它们在下面白演）；
     3. 提供统一的控制口 window.__boot = { ready, total, pause(), seek(ms), resume(), probe(ms), stats() }

   时间轴本身（纯函数）由每个候选自己写，见 a-step/b-flow/c-hybrid 的 index.html。
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (ms, a, b) => clamp01((ms - a) / (b - a));
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  global.mountBoot = function (cfg) {
    const doc = document;
    const TOTAL = cfg.total;
    const FADE = cfg.fade || [TOTAL - 240, TOTAL - 40];
    const E = cfg.entry;
    const SKIP = doc.documentElement.dataset.bootSkip !== undefined;
    const home = doc.getElementById('home');
    const HM = global.HomeMock;

    const els = {
      kicker: home.querySelector('.h-kicker'),
      brand: home.querySelector('.h-brand'),
      entries: Array.prototype.slice.call(home.querySelectorAll('.h-entry')),
      foot: [
        home.querySelector('.h-clock'),
        home.querySelector('.h-exits'),
        home.querySelector('.h-hint'),
      ].filter(Boolean),
    };

    /* 第一帧之前先把字压没：否则会先闪一帧「已经演完的首页」。
       无 JS 时这段不执行，字保持可见（不许留死幕）。 */
    els.kicker.style.opacity = '0';
    els.brand.style.opacity = '0';
    els.brand.style.filter = 'blur(14px)';
    for (const e of els.entries) {
      e.style.opacity = '0';
      e.style.transform = 'translateY(8px)';
    }
    for (const n of els.foot) n.style.opacity = '0';

    let cv = null;
    let dot = null;
    let grain = null;
    if (!SKIP) {
      const anchor = home.querySelector('.h-eeg');
      cv = doc.createElement('canvas');
      cv.className = 'boot-face';
      cv.setAttribute('aria-hidden', 'true');
      home.insertBefore(cv, anchor);
      /* 5px 网点跟着画布一起走：粗段是「印在网上的色块」，交接时一起淡掉 */
      dot = doc.createElement('i');
      dot.className = 'boot-dot';
      dot.setAttribute('aria-hidden', 'true');
      home.insertBefore(dot, anchor);
      grain = global.Grain.create(cv, { timeline: cfg.timeline });
    }

    let T = 0;
    let raf = 0;
    let t0 = 0;
    let paused = true;
    let cvHidden = false;
    let lastOpacity = -1;
    let lastDot = -1;
    let frames = 0;
    let domPaintMs = 0;

    /* st：颗粒引擎这一帧的状态。B 案用它给的 dot（0–1）让 5px 网点跟着显影淡入，
       否则首帧虽然画布是纯色，上面还铺着一层网点纹理，就不是「一个颜色块」了。 */
    function paintDom(ms, st) {
      const t = performance.now();

      const k = easeOutCubic(seg(ms, E.kicker[0], E.kicker[1]));
      els.kicker.style.opacity = String(k);

      const b = easeInOutCubic(seg(ms, E.brand[0], E.brand[1]));
      HM.focus(b);

      const lv = easeOutCubic(seg(ms, E.line[0], E.line[1]));
      HM.line(lv, ms / 1000 + (cfg.wobble || 0));

      for (let i = 0; i < els.entries.length; i++) {
        const a = E.entries[0] + i * 100;
        const e = easeOutCubic(seg(ms, a, a + E.entries[1]));
        els.entries[i].style.opacity = String(e);
        els.entries[i].style.transform = 'translateY(' + ((1 - e) * 8).toFixed(2) + 'px)';
      }

      const f = easeOutCubic(seg(ms, E.foot[0], E.foot[1]));
      for (const n of els.foot) n.style.opacity = String(f);

      if (cv) {
        const op = ms >= FADE[1] ? 0 : 1 - easeInOutCubic(seg(ms, FADE[0], FADE[1]));
        if (op !== lastOpacity) {
          cv.style.opacity = op.toFixed(4);
          lastOpacity = op;
        }
        if (dot) {
          /* 网点是假首页的印刷层，从第一帧就在（首帧也不是叠一层纯色，而是真的一格）；
             它只跟着画布一起淡出。 */
          const dotOp = 0.5 * op;
          if (dotOp !== lastDot) {
            dot.style.opacity = dotOp.toFixed(4);
            lastDot = dotOp;
          }
        }
        if (op <= 0) {
          if (!cvHidden) {
            cv.style.visibility = 'hidden';
            if (dot) dot.style.visibility = 'hidden';
            cvHidden = true;
          }
        } else if (cvHidden) {
          cv.style.visibility = '';
          if (dot) dot.style.visibility = '';
          cvHidden = false;
        }
      }
      domPaintMs += performance.now() - t;
    }

    /* 画布 + DOM 一起推到一个确定的时刻 */
    function paintAt(ms, force) {
      const st = grain ? grain.paint(ms, force) : null;
      paintDom(ms, st);
    }

    function tick(now) {
      if (paused) return;
      T = Math.min(TOTAL, now - t0);
      frames++;
      paintAt(T, false);
      if (T >= TOTAL) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function finish() {
      raf = 0;
      if (cv) {
        cv.style.opacity = '0';
        cv.style.visibility = 'hidden';
        if (dot) {
          dot.style.opacity = '0';
          dot.style.visibility = 'hidden';
        }
        cvHidden = true;
      }
    }

    function start() {
      paused = false;
      t0 = performance.now() - T;
      raf = requestAnimationFrame(tick);
    }

    const boot = {
      ready: false,
      total: TOTAL,
      get time() {
        return T;
      },
      /* 纯函数时间轴，给对比台画「格子 / 阶数随时间」的线用 */
      probe(ms) {
        return cfg.timeline(clamp(ms, 0, TOTAL), innerWidth, innerHeight);
      },
      stats() {
        const g = grain ? grain.stats() : { paints: 0, lastPaintMs: 0, fieldMs: 0, mean: null };
        return {
          frames,
          paints: g.paints,
          lastPaintMs: +g.lastPaintMs.toFixed(3),
          fieldMs: +g.fieldMs.toFixed(2),
          domMs: +domPaintMs.toFixed(1),
          canvas: g.cw ? g.cw + '×' + g.ch : '',
          /* B 案首帧「整屏一色」的那个颜色（0–1 sRGB）；A/C 用不到，会是 null 或同值 */
          mean: g.mean || null,
        };
      },
      pause() {
        paused = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
      seek(ms) {
        T = clamp(ms, 0, TOTAL);
        paused = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        t0 = performance.now() - T;
        paintAt(T, true);
      },
      resume() {
        if (T >= TOTAL) T = 0;
        if (raf) cancelAnimationFrame(raf);
        start();
      },
    };
    global.__boot = boot;

    if (SKIP) {
      /* 不放：直接落首页静置。画布没造，一帧都不会有。 */
      T = TOTAL;
      paintDom(T);
      doc.fonts.ready.then(() => {
        boot.ready = true;
      });
      return;
    }

    /* 第一帧：一片粗马赛克（此时字体还没到，画面里没有字） */
    paintAt(0, true);

    if (grain) {
      global.addEventListener('resize', () => {
        grain.resize();
        paintAt(T, true);
      });
    }

    doc.fonts.ready.then(() => {
      paintDom(T);
      boot.ready = true;
      start();
    });
  };
})(window);
