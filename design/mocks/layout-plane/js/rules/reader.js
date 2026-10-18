/* ─────────────────────────────────────────────────────────────
   规则 · 读者的记忆：没去过的地方模糊；走过的路被踩亮，副本变清楚；
   打开过的副本永远清楚。状态存进 localStorage，下次再来时平面记得来访者的足迹。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const T = K.tiers;
  const { W, H, toPlane } = K.world;

  const GRID_SIZE = 320;
  const LV_START = 0.55;
  const LV_STEP = 0.62;
  const STORAGE_KEY = 'plane.reader.v1';

  function levelOf(t, i, j) {
    if (i === 0 && j === 0) return 0;
    const cx = (t.x + t.w / 2 + i * W - W / 2) / W;
    const cy = (t.y + t.h / 2 + j * H - H / 2) / H;
    const r = Math.hypot(cx, cy);
    return Math.max(1, Math.min(5, 1 + Math.floor((r - LV_START) / LV_STEP)));
  }

  function gridKey(x, y) {
    return `${Math.floor(x / GRID_SIZE)},${Math.floor(y / GRID_SIZE)}`;
  }

  K.rules.reader = () => {
    let ctx;
    let steps = new Map(); // grid key → count (0-9)
    let opened = new Set(); // rec.key
    let lastGridKey = null;
    let saveTimer = null;

    // 读存盘
    function loadState() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (data && data.steps) {
          steps = new Map(data.steps);
        }
        if (data && data.opened) {
          opened = new Set(data.opened);
        }
      } catch {}
    }

    // 防抖存盘
    function saveState() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const data = {
            steps: Array.from(steps.entries()),
            opened: Array.from(opened),
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {}
      }, 500);
    }

    // 取格子的bonus
    function bonusAt(gk) {
      const count = steps.get(gk) || 0;
      if (count >= 6) return 3;
      if (count >= 3) return 2;
      if (count >= 1) return 1;
      return 0;
    }

    // 取周围9格的键（含自己）
    function surrounding9(gk) {
      const [xi, yi] = gk.split(',').map(Number);
      const keys = [];
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          keys.push(`${xi + di},${yi + dj}`);
        }
      }
      return keys;
    }

    return {
      name: 'reader',
      mechs: ['arrive', 'haze'],
      init(c) {
        ctx = c;

        // 清空存盘（地址带 ?reader-reset）
        if (new URLSearchParams(location.search).has('reader-reset')) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
        loadState();

        // frame 事件：记录足迹
        ctx.on('frame', () => {
          // 镜头本来就在屏上坐标里（已斜切），与 look() 里算的方块中心同一坐标系
          const gk = gridKey(ctx.cam.x, ctx.cam.y);
          if (gk !== lastGridKey) {
            lastGridKey = gk;
            // 中心格和周围8格都加一次
            const surrounding = surrounding9(gk);
            for (const key of surrounding) {
              const old = steps.get(key) || 0;
              const newCount = Math.min(9, old + 1);
              if (newCount !== old) {
                steps.set(key, newCount);
              }
            }
            // 刷新受影响的方块
            const surr9 = new Set(surrounding);
            for (const rec of ctx.nodes.values()) {
              const recGk = gridKey(rec.g.x + rec.g.w / 2, rec.g.y + rec.g.h / 2);
              if (surr9.has(recGk)) {
                ctx.refresh(rec);
              }
            }
            saveState();
          }
        });

        // 绘制踩亮的路（canvas）
        const trail = document.createElement('canvas');
        trail.style.cssText = 'position:absolute;inset:0;pointer-events:none';
        const trailCtx = trail.getContext('2d');
        ctx.els.stage.insertBefore(trail, ctx.els.recede);
        trailCtx.globalCompositeOperation = 'source-over';

        // 重新绘制footprint trail
        const redrawTrail = () => {
          // 检查canvas尺寸，必要时重设
          const dpr = devicePixelRatio;
          const targetW = ctx.vw * dpr;
          const targetH = ctx.vh * dpr;
          if (trail.width !== targetW || trail.height !== targetH) {
            trail.width = targetW;
            trail.height = targetH;
            trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }

          trailCtx.clearRect(0, 0, ctx.vw, ctx.vh);
          const o = { x: ctx.vw / 2 - ctx.cam.x * ctx.z, y: ctx.vh / 2 - ctx.cam.y * ctx.z };

          for (const [gkStr, count] of steps.entries()) {
            if (count === 0) continue;
            const [xi, yi] = gkStr.split(',').map(Number);
            const gx = xi * GRID_SIZE + GRID_SIZE / 2;
            const gy = yi * GRID_SIZE + GRID_SIZE / 2;
            const sx = o.x + gx * ctx.z;
            const sy = o.y + gy * ctx.z;

            // 只画视口内的圆
            const r = 260 * ctx.z;
            if (sx + r < 0 || sx - r > ctx.vw || sy + r < 0 || sy - r > ctx.vh) continue;

            const a = 0.07 * Math.min(count, 4);
            const grad = trailCtx.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, `rgba(255, 214, 160, ${a})`);
            grad.addColorStop(1, 'rgba(255, 214, 160, 0)');
            trailCtx.fillStyle = grad;
            trailCtx.fillRect(sx - r, sy - r, r * 2, r * 2);
          }
        };

        ctx.on('frame', redrawTrail);

        T.buildVariants(() => ctx.repaintAll((r) => r.t.kind === 'img'));
      },

      place(t, i, j) {
        const lv = levelOf(t, i, j);
        if (t.kind === 'label' && lv >= 3) return null;
        if (lv === 5 && K.hash(t.idx + 7, i, j) < 0.45) return null;
        return { lv, extra: 0 };
      },

      look(rec) {
        const baseLv = rec.s.lv;
        let bonus = 0;

        if (opened.has(rec.key)) {
          bonus = 99; // 打开过的固定0档
        } else {
          // 屏上坐标中心（含14°斜切）→ 格子键
          const t = rec.t;
          const x = t.x + rec.i * W + t.w / 2;
          const y = t.y + rec.j * H + t.h / 2 + K.world.drop(x);
          const gk = gridKey(x, y);
          bonus = bonusAt(gk);
        }

        const hover = rec === ctx.hover && !ctx.reading ? 1 : 0;
        return Math.max(0, Math.min(T.MAX, baseLv + 1 - bonus - hover - (rec.lift || 0)));
      },

      paint: (rec, lv, prev, quiet) => T.paint(rec, lv, prev, quiet),
      box: (rec, lv, b) => T.box(rec, lv, b),
      canHover: (rec) => !rec.orig && rec.s.lv <= 4,
      canOpen: (rec) => rec.s.lv + 1 < 5, // lv < 5档

      opening(rec) {
        // 记录打开过
        opened.add(rec.key);
        saveState();
      },

      closed() {
        // 收回后，已打开的副本立即清楚（0档）
        for (const r of ctx.nodes.values()) {
          if (opened.has(r.key)) {
            ctx.refresh(r, { quiet: true });
          }
        }
      },

      isPartial: (rec, lv) => lv > 0,
      detail: (rec, dt, k, lv) => T.recall(rec, dt, k, lv, ctx.animate),
    };
  };
})();
