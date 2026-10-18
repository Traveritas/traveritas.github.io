/* ─────────────────────────────────────────────────────────────
   详情 · 侧栏斜入（?detail=slant）
   沿 14° 方向从右侧（桌面）或下方（窄屏）滑入一条侧栏；
   平面保持可拖可点；源方块加 is-reading 标记保持可见。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  K.details = K.details || {};

  K.details.slant = (ctx) => {
    const { animate, flipPairs, flipFrom, EASE_OPEN, EASE_CLOSE } = ctx;
    const OPEN_MS = 620;
    const CLOSE_MS = 420;
    let styleInserted = false;

    function ensureStyle() {
      if (styleInserted) return;
      styleInserted = true;
      const style = document.createElement('style');
      style.id = 'detail-slant';
      style.textContent = `
.dt[data-detail='slant'] {
  pointer-events: none;
}

.dt[data-detail='slant'] .dt-win {
  pointer-events: auto;
  backdrop-filter: blur(18px);
  will-change: transform;
}

.dt[data-detail='slant'] .dt-bg {
  display: none;
}

.dt[data-detail='slant'] .dt-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--fg) 22%, transparent) transparent;
}

.dt[data-detail='slant'] .dt-col {
  width: 100%;
  margin: 0;
  padding: 72px 48px 140px;
}

.dt[data-detail='slant'] .dt-close {
  position: absolute;
  pointer-events: auto;
  width: auto;
  top: 20px;
  left: 24px;
}

.t.is-reading {
  outline: 1px solid var(--amber);
  outline-offset: 4px;
}

@media (min-width: 900px) {
  .dt[data-detail='slant'] .dt-win {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: auto;
    width: min(600px, 46vw);
    border-left: 1px solid rgb(255 250 242 / 0.5);
  }
}

@media (max-width: 899px) {
  .dt[data-detail='slant'] .dt-win {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    height: 78vh;
    border-top: 1px solid rgb(255 250 242 / 0.5);
  }

  .dt[data-detail='slant'] .dt-col {
    padding: 72px 24px 140px;
  }
}
      `;
      document.head.appendChild(style);
    }

    return {
      modal: false,
      openMs: OPEN_MS,

      fitImage(im) {
        const vw = ctx.vw;
        const vh = ctx.vh;
        const small = vw < 900;
        const maxW = Math.min(vw - (small ? 48 : 96), small ? vw - 48 : Math.min(600, vw * 0.46) - 48);
        const maxH = vh * 0.55;
        let w = maxW;
        let h = (w * im.h) / im.w;
        if (h > maxH) { h = maxH; w = (h * im.w) / im.h; }
        return { w: Math.round(w), h: Math.round(h) };
      },

      enter(R) {
        ensureStyle();
        const { rec, dt, win } = R;
        const vw = ctx.vw;
        const vh = ctx.vh;
        const isDesktop = vw >= 900;
        const panelW = isDesktop ? Math.min(600, vw * 0.46) : 0;
        const sheetH = isDesktop ? 0 : vh * 0.78;

        // 设置栏背景（按时辰底色 96% + 半透明）
        win.style.background = `color-mix(in srgb, ${ctx.colorOf(rec.t.r)} 96%, transparent)`;

        // 测量同名元素的位置（必须在栏还没移动前）
        const fp = flipPairs(rec, dt);

        // ① 栏进场
        if (isDesktop) {
          animate(win, [
            { transform: 'translate(120px, 30px)', opacity: 0 },
            { transform: 'none', opacity: 1 }
          ], { duration: OPEN_MS, easing: EASE_OPEN });
        } else {
          animate(win, [
            { transform: 'translateY(100%)', opacity: 0 },
            { transform: 'none', opacity: 1 }
          ], { duration: OPEN_MS, easing: EASE_OPEN });
        }

        // ② FLIP：只对 title 和 meta
        for (const p of fp) {
          if (p.name === 'title' || p.name === 'meta') {
            animate(p.to, [
              { transform: flipFrom(p), transformOrigin: '0 0' },
              { transform: 'none', transformOrigin: '0 0' }
            ], { duration: OPEN_MS, easing: EASE_OPEN });
          }
        }

        // ③ 其余正文淡入（错开 40ms）
        const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md > *, .dt-cap > :not([data-f]), .dt-sibs')]
          .filter((el) => !el.closest('[data-f]'));
        let n = 0;
        for (const el of rest) {
          if (el.classList.contains('md')) continue;
          const delay = 240 + Math.min(n++, 10) * 40;
          animate(el, [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'none' }
          ], { duration: 240, delay, easing: EASE_OPEN });
        }

        // ④ 源方块加标记（保持可见）
        rec.el.classList.add('is-reading');

        // ⑤ 镜头飞移：让源方块居中于栏外区域
        const g = rec.g;
        if (isDesktop) {
          ctx.flyTo(g.x + g.w / 2 + panelW / (2 * ctx.z), g.y + g.h / 2, 160);
        } else {
          ctx.flyTo(g.x + g.w / 2, g.y + g.h / 2 + sheetH / (2 * ctx.z), 160);
        }
      },

      exit(R) {
        const { rec, dt, win } = R;
        const isDesktop = ctx.vw >= 900;

        // ① 正文淡出
        const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md, .dt-cap > :not([data-f]), .dt-sibs, .dt-close')];
        for (const el of rest) {
          animate(el, [
            { opacity: getComputedStyle(el).opacity },
            { opacity: 0 }
          ], { duration: 160, easing: 'ease-in' });
        }

        // ② 栏退场
        let anim;
        if (isDesktop) {
          anim = animate(win, [
            { transform: 'none', opacity: 1 },
            { transform: 'translate(120px, 30px)', opacity: 0 }
          ], { duration: CLOSE_MS, easing: EASE_CLOSE });
        } else {
          anim = animate(win, [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(100%)', opacity: 0 }
          ], { duration: CLOSE_MS, easing: EASE_CLOSE });
        }

        // ③ 移除源方块标记
        rec.el.classList.remove('is-reading');

        return anim ? anim.finished : Promise.resolve();
      }
    };
  };
})();
