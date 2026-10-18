/* ─────────────────────────────────────────────────────────────
   机制：提灯。光标周围一圈都被想起，替代逐块悬停；触屏按住时提灯。
   指针到方块的距离 d < 120px → lift 2；d < 360px → lift 1；否则 0。
   光晕跟随指针，灯灭时淡出（除非 ctx.RM 为真）。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;

  K.mechs.lantern = (ctx) => {
    // 禁用逐块悬停
    ctx.options.hover = false;

    const stage = ctx.els.stage;
    let pointerPos = null;
    let pendingPos = null; // 待处理的指针位置（rAF 合并）
    let touchLantern = null; // { id }

    // 创建光晕元素
    const halo = document.createElement('div');
    halo.style.position = 'absolute';
    halo.style.left = '0';
    halo.style.top = '0';
    halo.style.pointerEvents = 'none';
    halo.style.borderRadius = '50%';
    halo.style.opacity = '0';
    halo.style.transition = ctx.RM ? 'none' : 'opacity 0.4s';
    halo.style.background = 'radial-gradient(circle, rgb(255 248 236 / 0.10) 0, rgb(255 248 236 / 0.04) 40%, transparent 70%)';
    const recede = document.getElementById('recede');
    stage.insertBefore(halo, recede);

    // 点到矩形的最近距离（点在矩形内则为 0）
    function distToRect(px, py, rx, ry, rw, rh) {
      const dx = Math.max(0, rx - px, px - (rx + rw));
      const dy = Math.max(0, ry - py, py - (ry + rh));
      return Math.hypot(dx, dy);
    }

    // 屏幕坐标转平面坐标
    function toPlane(sx, sy) {
      return {
        x: ctx.cam.x + (sx - ctx.vw / 2) / ctx.z,
        y: ctx.cam.y + (sy - ctx.vh / 2) / ctx.z,
      };
    }

    // 更新所有方块的 lift
    function updateLifts(wx, wy) {
      for (const rec of ctx.nodes.values()) {
        if (rec.orig) continue;
        const d = distToRect(wx, wy, rec.g.x, rec.g.y, rec.g.w, rec.g.h);
        const newLift = d < 120 ? 2 : d < 360 ? 1 : 0;
        if (rec.lift !== newLift) {
          rec.lift = newLift;
          ctx.refresh(rec);
        }
      }
    }

    // 清除所有 lift
    function clearLifts() {
      for (const rec of ctx.nodes.values()) {
        if (rec.orig || !rec.lift) continue;
        rec.lift = 0;
        ctx.refresh(rec);
      }
    }

    // 更新光晕位置和可见性
    function updateHalo(sx, sy) {
      const diameter = 720 * ctx.z;
      const radius = diameter / 2;
      halo.style.width = `${diameter}px`;
      halo.style.height = `${diameter}px`;
      halo.style.transform = `translate3d(${sx - radius}px, ${sy - radius}px, 0)`;
      halo.style.opacity = '1';
    }

    // 灭灯
    function extinguish() {
      pointerPos = null;
      pendingPos = null;
      halo.style.opacity = '0';
      clearLifts();
    }

    // 鼠标/笔移动：只记坐标，自己请求一帧合并计算（平面静止时内核不会发 frame）
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (!pendingPos || ctx.reading) return;
      pointerPos = pendingPos;
      pendingPos = null;
      const plane = toPlane(pointerPos.sx, pointerPos.sy);
      updateLifts(plane.x, plane.y);
    };
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      pendingPos = { sx: e.clientX, sy: e.clientY };
      updateHalo(e.clientX, e.clientY);
      if (!raf) raf = requestAnimationFrame(flush);
    });

    // 指针离开舞台
    stage.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      extinguish();
    });

    // 每帧重算（合并 pointermove，镜头在动或阅读时清 lifts）
    ctx.on('frame', () => {
      if (ctx.reading) {
        if (pointerPos) clearLifts();
        return;
      }
      // 如果有待处理的坐标，更新 pointerPos 并计算 lifts
      if (pendingPos) {
        pointerPos = pendingPos;
        const plane = toPlane(pointerPos.sx, pointerPos.sy);
        updateLifts(plane.x, plane.y);
      } else if (pointerPos) {
        // 没有新坐标但指针存在，镜头动过，需要重算 lifts（z 变化）
        const plane = toPlane(pointerPos.sx, pointerPos.sy);
        updateLifts(plane.x, plane.y);
      }
      // 更新光晕大小（即使坐标没变，z 也可能变了）
      if (pointerPos) {
        updateHalo(pointerPos.sx, pointerPos.sy);
      }
      pendingPos = null;
    });

    // 触屏长按提灯
    let touchDownPos = null;
    let touchDownId = null;
    let touchLongPressTimer = null;

    const activateTouchLantern = (id, sx, sy) => {
      touchLantern = { id };
      pointerPos = { sx, sy };
      const plane = toPlane(sx, sy);
      updateLifts(plane.x, plane.y);
      updateHalo(sx, sy);
    };

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      touchDownPos = { x: e.clientX, y: e.clientY };
      touchDownId = e.pointerId;
      if (touchLongPressTimer) clearTimeout(touchLongPressTimer);
      touchLongPressTimer = setTimeout(() => {
        activateTouchLantern(e.pointerId, e.clientX, e.clientY);
      }, 350);
    });

    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId !== touchDownId) return;

      const moved = Math.hypot(e.clientX - touchDownPos.x, e.clientY - touchDownPos.y);

      // 手指已移动超过 8px（拖拽），取消长按
      if (moved > 8) {
        if (touchLongPressTimer) clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
        if (touchLantern && touchLantern.id === e.pointerId) {
          touchLantern = null;
          extinguish();
        }
        return;
      }

      // 如果已经激活，手指移动时跟踪
      if (touchLantern && touchLantern.id === e.pointerId) {
        pendingPos = { sx: e.clientX, sy: e.clientY };
        updateHalo(e.clientX, e.clientY);
      }
    });

    const endTouchLantern = (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId !== touchDownId) return;

      if (touchLongPressTimer) clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;

      if (touchLantern && touchLantern.id === e.pointerId) {
        touchLantern = null;
        extinguish();
      }

      touchDownPos = null;
      touchDownId = null;
    };

    stage.addEventListener('pointerup', endTouchLantern);
    stage.addEventListener('pointercancel', endTouchLantern);
  };
})();
