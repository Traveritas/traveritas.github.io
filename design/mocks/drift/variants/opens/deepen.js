/* 沉入：镜头不动，空间朝里退。
   碎片自己长成阅读面（面板从它此刻的矩形、再往里收一点，长到阅读尺寸），
   周围的碎片同时往深处让开——缩小、变粗、变暗，像被新出现的这一层挡在后面；
   一层雾从四边合拢过来，只在中间留出阅读面的大小，阅读面的上沿先亮起一道线。 */
(() => {
  'use strict';
  const SINK = 0.955; // 整片空间往里的幅度（#drift 的缩放）
  const IN = 0.9; // 阅读面从碎片里再收一点长出来
  let fogEl = null;
  let lineEl = null;

  const panelRect = (api) => {
    const w = Math.min(760, api.vw - 24);
    const top = api.vw < 640 ? 64 : 72;
    return { left: (api.vw - w) / 2, top, width: w, height: api.vh - top - 20 };
  };
  const around = (r, k) => ({ left: r.left + (r.width * (1 - k)) / 2, top: r.top + (r.height * (1 - k)) / 2, width: r.width * k, height: r.height * k });
  /* 空间整体往里缩，屏上的一切（连同那块碎片）都绕视口中心收了一点 */
  const about = (r, k, cx, cy) => ({ left: cx + (r.left - cx) * k, top: cy + (r.top - cy) * k, width: r.width * k, height: r.height * k });

  DriftReg.open('deepen', {
    label: '沉入',
    /* 空间整体往里收；雾在面板之下（挡不住正文），上沿那道线在面板之上 */
    css: `html.reading[data-open='deepen'] #drift { transform: scale(0.955); transition: opacity 0.5s ease, filter 0.5s ease, transform 0.72s cubic-bezier(0.32, 0.72, 0, 1); }
      html[data-open='deepen'] .deepen-fog { position: fixed; inset: 0; z-index: 18; pointer-events: none; transform-origin: 50% 46%;
        background: radial-gradient(115% 88% at 50% 46%, transparent 36%, rgb(var(--panel) / 0.46) 70%, rgb(var(--panel) / 0.66) 100%); }
      html[data-open='deepen'] .deepen-line { position: fixed; z-index: 21; height: 2px; transform-origin: 50% 50%; pointer-events: none;
        background: linear-gradient(90deg, transparent, rgb(var(--lit) / 0.85) 10%, rgb(var(--lit) / 0.85) 90%, transparent); }`,

    run(api) {
      const r = api.rectOf();
      const pr = panelRect(api);
      fogEl = null;
      lineEl = null;
      const cx = r ? r.left + r.width / 2 : api.vw / 2;
      const cy = r ? r.top + r.height / 2 : api.vh / 2;
      /* 周围的碎片一起退到后面：位置往外让一点、缩小、变粗、变暗 */
      api.setFx({
        cx,
        cy,
        target(rec, fx, h) {
          const dx = rec.x - fx.cx;
          const dy = rec.y - fx.cy;
          const d = Math.hypot(dx, dy) || 1;
          const push = fx.amt * 88 * h.G * Math.max(0.18, 1 - d / (h.vw * 1.25));
          return { dx: (dx / d) * push, dy: (dy / d) * push, s: 1 - 0.07 * fx.amt };
        },
        lod(rec, lod, fx) {
          if (rec === fx.rec) return lod;
          const d = Math.hypot(rec.x - fx.cx, rec.y - fx.cy);
          return lod + Math.round(fx.amt * (1 + 2 * Math.max(0, 1 - d / (api.vw * 0.9))));
        },
        alpha(rec, a, fx) {
          if (rec === fx.rec) return a;
          return a * (1 - 0.45 * fx.amt);
        },
      });
      if (api.RM || !r) {
        api.openReader(pr);
        return;
      }
      const fog = document.createElement('div');
      fog.className = 'deepen-fog';
      document.body.appendChild(fog);
      fogEl = fog;
      fog.animate([{ transform: 'scale(1.08)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 760, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' });
      // 阅读面的上沿先亮起一道线，再往两边延展出去
      const line = document.createElement('div');
      line.className = 'deepen-line';
      Object.assign(line.style, { left: `${pr.left.toFixed(1)}px`, top: `${pr.top.toFixed(1)}px`, width: `${pr.width.toFixed(1)}px` });
      document.body.appendChild(line);
      lineEl = line;
      line.animate(
        [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1.01)', opacity: 1, offset: 0.5 }, { transform: 'scaleX(1)', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' }
      );
      // 面板从碎片此刻的位置（再往里收一点）长成阅读尺寸：这一层是从里面推出来的
      api.openReader(around(about(r, SINK, api.vw / 2, api.vh / 2), IN));
    },

    closed() {
      if (fogEl) fogEl.remove();
      if (lineEl) lineEl.remove();
      fogEl = null;
      lineEl = null;
    },
  });
})();
