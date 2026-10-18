/* ─────────────────────────────────────────────────────────────
   详情 · 窗口展开（默认，?detail=window）
   clip-path 从方块轮廓展开到阅读栏；平面后退、变虚、压暗；同名元素 FLIP 飞过去；正文逐段浮起。
   收回时反过来，落回方块此刻的轮廓。

   详情（presenter）的形状：
     K.details[name] = (ctx) => ({
       modal: true,                 // true：阅读时平面 inert、不能拖；false：平面照常可拖、可点别的方块
       openMs: 720,                 // 多久后把焦点交给标题
       fitImage(im) → {w, h},       // 可选：瞬间大图的尺寸（默认按全屏算）
       enter(R),                    // 进场动画。R = { rec, dt, win, kind, k, tileRect, lookFrom, partial }
       exit(R) → Promise,           // 退场动画，结束时 resolve；之后内核移除 dt、恢复平面
     })
   ctx 里能用：animate、dur、flipPairs、flipFrom、screenRect、vw、vh、z、els{recede, dim, stage}、EASE_OPEN、EASE_CLOSE、
   colorOf(region)（时辰底色 rgb 字符串）。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  K.details = K.details || {};

  K.details.window = (ctx) => {
    const { animate, flipPairs, flipFrom, EASE_OPEN, EASE_CLOSE } = ctx;
    const OPEN_MS = 720;
    const CLOSE_MS = 600;
    const inset = (r, round) => `inset(${r.top}px ${ctx.vw - r.left - r.width}px ${ctx.vh - r.top - r.height}px ${r.left}px round ${round}px)`;

    return {
      modal: true,
      openMs: OPEN_MS,

      enter(R) {
        const { rec, dt, win, kind, tileRect } = R;
        const { recede, dim } = ctx.els;
        const vw = ctx.vw;
        const vh = ctx.vh;
        let sheet;
        if (kind === 'reading') {
          const cw = Math.min(vw, 880);
          sheet = { left: (vw - cw) / 2, top: 0, width: cw, height: vh };
        } else sheet = { left: 0, top: 0, width: vw, height: vh };
        R.toClip = inset(sheet, 0);
        const fp = flipPairs(rec, dt);
        rec.el.style.visibility = 'hidden';

        // ① 平面后退：缩小、变虚、压暗
        recede.style.transformOrigin = `${tileRect.left + tileRect.width / 2}px ${tileRect.top + tileRect.height / 2}px`;
        dim.style.background = ctx.colorOf(rec.t.r);
        animate(recede, [{ transform: 'scale(1)', filter: 'blur(0px)' }, { transform: 'scale(0.94)', filter: 'blur(2.5px)' }], { duration: 820, easing: EASE_OPEN });
        animate(dim, [{ opacity: 0 }, { opacity: kind === 'reading' ? 0.5 : 0.35 }], { duration: 760, easing: 'ease-out' });

        // ② 窗口：从方块的轮廓展开到阅读层
        animate(win, [{ clipPath: inset(tileRect, 2) }, { clipPath: R.toClip }], { duration: OPEN_MS, easing: EASE_OPEN });
        if (kind !== 'reading') animate(dt.querySelector('.dt-bg'), [{ opacity: 0.65 }, { opacity: 1 }], { duration: OPEN_MS, easing: 'ease-out' });

        // ③ 同名元素从方块里的位置飞到阅读层里的位置（从「不完整」的样子出发时，字一路补全）
        for (const p of fp) {
          animate(p.to, [{ transform: flipFrom(p), transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: OPEN_MS, easing: EASE_OPEN });
          if (p.name !== 'img' && R.partial) animate(p.to, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
        }

        // ④ 其余的字依次浮现
        const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md > *, .dt-cap > :not([data-f]), .dt-sibs')].filter((el) => !el.closest('[data-f]'));
        let n = 0;
        for (const el of rest) {
          if (el.classList.contains('md')) continue;
          const r = el.getBoundingClientRect();
          const visible = r.top < vh * 1.15;
          const delay = visible ? 360 + Math.min(n++, 10) * 48 : 700;
          if (el.classList.contains('dt-rule')) animate(el, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 760, delay: 300, easing: EASE_OPEN });
          else animate(el, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: visible ? 640 : 300, delay, easing: EASE_OPEN });
        }
        animate(dt.querySelector('.dt-close'), [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 480, easing: EASE_OPEN });
      },

      exit(R) {
        const { rec, dt, win } = R;
        const { recede, dim } = ctx.els;
        const tileRect = ctx.screenRect(rec);
        // 方块里同名元素的落点：平面此刻还缩在后退里，按「未缩放的方块框 ÷ 实测方块框」把实测位置换算回去
        const elRect = rec.el.getBoundingClientRect();
        const ratio = elRect.width ? tileRect.width / elRect.width : 1;
        const pairs = [];
        for (const to of dt.querySelectorAll('[data-f]')) {
          const tileEl = rec.el.querySelector(`[data-f="${to.dataset.f}"]`);
          if (!tileEl) continue;
          const c = tileEl.getBoundingClientRect();
          if (!c.width) continue;
          const left = tileRect.left + (c.left - elRect.left) * ratio;
          const top = tileRect.top + (c.top - elRect.top) * ratio;
          pairs.push({ name: to.dataset.f, to, a: { left, top, width: c.width * ratio, height: c.height * ratio }, fs: parseFloat(getComputedStyle(tileEl).fontSize) });
        }

        // ① 正文先退
        const rest = [...dt.querySelectorAll('.dt-col > :not([data-f]), .md, .dt-cap > :not([data-f]), .dt-sibs, .dt-close')];
        for (const el of rest) animate(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 200, easing: 'ease-in' });
        // ② 同名元素飞回方块
        for (const p of pairs) {
          p.to.getAnimations().forEach((x) => x.cancel());
          animate(p.to, [{ transform: 'none', transformOrigin: '0 0' }, { transform: flipFrom(p), transformOrigin: '0 0' }], { duration: CLOSE_MS, delay: 110, easing: EASE_CLOSE });
        }
        // ③ 窗口收回方块此刻的轮廓
        const w = animate(win, [{ clipPath: R.toClip }, { clipPath: inset(tileRect, 2) }], { duration: CLOSE_MS, delay: 110, easing: EASE_CLOSE });
        // ④ 平面回来
        const cur = getComputedStyle(recede).transform;
        recede.getAnimations().forEach((a) => a.cancel());
        animate(recede, [{ transform: cur === 'none' ? 'scale(0.94)' : cur, filter: 'blur(2.5px)' }, { transform: 'scale(1)', filter: 'blur(0px)' }], { duration: CLOSE_MS + 80, delay: 110, easing: EASE_CLOSE });
        const dimNow = getComputedStyle(dim).opacity;
        dim.getAnimations().forEach((a) => a.cancel());
        animate(dim, [{ opacity: dimNow }, { opacity: 0 }], { duration: CLOSE_MS, delay: 110, easing: 'ease-in-out' });
        return w ? w.finished : Promise.resolve();
      },
    };
  };
})();
