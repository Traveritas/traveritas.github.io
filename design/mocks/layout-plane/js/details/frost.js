/* ─────────────────────────────────────────────────────────────
   详情 · 霜里析出（?detail=frost）
   点开时整屏起霜（磨砂盖住平面），然后标题、导语、正文一跳一跳地从霜里显影，
   分档位进行（呼应平面的记忆档）。
   组 A 标题 → 组 B 导语/配图 → 组 C 首屏内正文；各组内部一跳一跳。
   收回时反过来：字退回霜里，霜化开。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  K.details = K.details || {};

  K.details.frost = (ctx) => {
    const { animate, flipPairs, flipFrom, EASE_OPEN, EASE_CLOSE } = ctx;
    const OPEN_MS = 1100;
    const FROST_DURATION = 480;
    const EMERGE_DURATION = 520;
    const CLOSE_DURATION = 300;
    let styleInserted = false;

    function ensureStyle() {
      if (styleInserted) return;
      styleInserted = true;
      const style = document.createElement('style');
      style.id = 'detail-frost';
      style.textContent = `
.dt[data-detail='frost'] {
  pointer-events: none;
}

.dt[data-detail='frost'] .dt-win {
  pointer-events: auto;
  z-index: 2; /* 默认就是 absolute + inset:0，盖在霜层之上 */
}

.dt[data-detail='frost'] .dt-bg {
  display: none;
}

.dt[data-detail='frost'] .dt-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--fg) 22%, transparent) transparent;
}

.dt[data-detail='frost'] .dt-col {
  position: relative;
  width: min(34em, calc(100vw - 48px));
  margin: 0 auto;
  padding: 128px 0 140px;
  font-size: 17px;
}

.dt[data-detail='frost'] .dt-title {
  margin: 22px 0 0;
  font: 500 38px/1.4 var(--font-display);
  letter-spacing: 0.03em;
  text-wrap: balance;
  transform-origin: 0 0;
}

.dt[data-detail='frost'] .dt-lede {
  margin: 18px 0 0;
  font: 400 16px/1.9 var(--font-display);
  color: var(--soft);
  transform-origin: 0 0;
}

.dt[data-detail='frost'] .dt-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font: 400 11px/1.6 var(--font-mono);
  letter-spacing: 0.16em;
  color: var(--faint);
}

.dt[data-detail='frost'] .dt-rule {
  margin: 44px 0 0;
  height: 1px;
  width: 72px;
  background: color-mix(in srgb, var(--fg) 22%, transparent);
  border: 0;
  transform-origin: 0 50%;
}

.dt[data-detail='frost'] .dt-close {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  width: auto;
  opacity: 0;
}

.dt[data-detail='frost'] .frost {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  backdrop-filter: blur(0px);
}
      `;
      document.head.appendChild(style);
    }

    return {
      modal: true,
      openMs: OPEN_MS,

      enter(R) {
        ensureStyle();
        const { rec, dt, win } = R;
        const vw = ctx.vw;
        const vh = ctx.vh;
        rec.el.style.visibility = 'hidden';

        // ① 插入霜层
        const frost = document.createElement('div');
        frost.className = 'frost';
        frost.style.background = `color-mix(in srgb, ${ctx.colorOf(rec.t.r)} 55%, transparent)`;
        dt.insertBefore(frost, dt.firstChild);

        // ② 测量窗口布局
        const sheet = {
          left: (vw - Math.min(vw, 880)) / 2 + (vw < 640 ? 24 : 24),
          top: 0,
          width: Math.min(vw, 880) - 48,
          height: vh
        };

        // ③ 平面后退（缩到 0.97，中心在源方块中心）
        const tileRect = ctx.screenRect(rec);
        const tileCx = tileRect.left + tileRect.width / 2;
        const tileCy = tileRect.top + tileRect.height / 2;
        ctx.els.recede.style.transformOrigin = `${tileCx}px ${tileCy}px`;
        animate(ctx.els.recede, [
          { transform: 'scale(1)' },
          { transform: 'scale(0.97)' }
        ], { duration: FROST_DURATION, easing: EASE_OPEN });

        // ④ 霜层从清晰到模糊
        animate(frost, [
          { opacity: 0, backdropFilter: 'blur(0px)' },
          { opacity: 1, backdropFilter: 'blur(22px)' }
        ], { duration: FROST_DURATION, easing: EASE_OPEN });

        // ⑤ 显影：分三组依次进行
        // 组 A：标题（220ms 起）
        const titleEl = dt.querySelector('.dt-title');
        if (titleEl) {
          animate(titleEl, [
            { filter: 'blur(10px)', opacity: 0.15, letterSpacing: '0.3em' },
            { filter: 'blur(0px)', opacity: 1, letterSpacing: 'normal' }
          ], { duration: EMERGE_DURATION, delay: 220, easing: 'steps(4, end)' });
        }

        // 组 B：导语、配图、分隔线（420ms 起）
        const groupB = [...dt.querySelectorAll('.dt-meta, .dt-lede, .dt-rule, .dt-img')];
        for (const el of groupB) {
          animate(el, [
            { filter: 'blur(10px)', opacity: 0.15 },
            { filter: 'blur(0px)', opacity: 1 }
          ], { duration: EMERGE_DURATION, delay: 420, easing: 'steps(4, end)' });
        }

        // 组 C：首屏内可见的正文（600ms 起，依次错开 30ms，最多 12 个）
        const groupC = [
          ...dt.querySelectorAll('.md > *, .dt-cap > *, .big, .dt-links, .dt-sibs')
        ].filter(el => {
          // 排除那些已在组 B 里的元素
          return !el.closest('.dt-meta, .dt-lede, .dt-rule, .dt-img');
        });

        let visibleCount = 0;
        for (let i = 0; i < groupC.length; i++) {
          const el = groupC[i];
          const r = el.getBoundingClientRect();
          const visible = r.top < vh;

          if (visible && visibleCount < 12) {
            const delay = 600 + visibleCount * 30;
            animate(el, [
              { filter: 'blur(10px)', opacity: 0.15 },
              { filter: 'blur(0px)', opacity: 1 }
            ], { duration: EMERGE_DURATION, delay, easing: 'steps(4, end)' });
            visibleCount++;
          } else if (!visible) {
            // 首屏外的正文直接在 900ms 时出现
            animate(el, [
              { filter: 'blur(10px)', opacity: 0.15 },
              { filter: 'blur(0px)', opacity: 1 }
            ], { duration: 1, delay: 900, easing: 'linear' });
          }
        }

        // ⑥ 返回按钮 900ms 时淡入
        const closeBtn = dt.querySelector('.dt-close');
        if (closeBtn) {
          animate(closeBtn, [
            { opacity: 0 },
            { opacity: 1 }
          ], { duration: 200, delay: 900, easing: 'ease-out' });
        }
      },

      exit(R) {
        const { rec, dt } = R;
        const frost = dt.querySelector('.frost');

        // ① 所有可见正文同时反向（300ms，steps(3, end)）
        const allText = [
          ...dt.querySelectorAll('.dt-title, .dt-meta, .dt-lede, .dt-rule, .dt-img, .md > *, .dt-cap > *, .big, .dt-links, .dt-sibs, .dt-close')
        ];

        const p = new Promise((resolve) => {
          for (const el of allText) {
            const current = getComputedStyle(el);
            const currentOpacity = parseFloat(current.opacity);
            const currentFilter = current.filter;

            // 只有可见的元素（opacity > 0）才做反向动画
            if (currentOpacity > 0) {
              animate(el, [
                { filter: currentFilter || 'blur(0px)', opacity: currentOpacity },
                { filter: 'blur(10px)', opacity: 0 }
              ], { duration: CLOSE_DURATION, easing: 'steps(3, end)' });
            }
          }

          // 延迟 300ms 后，霜层开始消退
          setTimeout(() => {
            if (frost) {
              const frostAnim = animate(frost, [
                { opacity: 1, backdropFilter: 'blur(22px)' },
                { opacity: 0, backdropFilter: 'blur(0px)' }
              ], { duration: 380, easing: EASE_CLOSE });

              // 同时 recede 回到 scale(1)
              animate(ctx.els.recede, [
                { transform: 'scale(0.97)' },
                { transform: 'scale(1)' }
              ], { duration: 380, easing: EASE_CLOSE });

              // 霜层动画结束时 resolve
              if (frostAnim) {
                frostAnim.finished.then(() => resolve());
              } else {
                resolve();
              }
            } else {
              resolve();
            }
          }, CLOSE_DURATION);
        });

        return p;
      }
    };
  };
})();
