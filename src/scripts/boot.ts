/* ─────────────────────────────────────────────────────────────
   开屏 · 校准·穿针（每会话一次）
   方波校准 1s 描完 → 收成一根线 → 一枚针落下穿线（第一针）
   → 揭幕（html.booted 触发缝线划出与首屏逐级浮现）。
   任意输入跳过；reduced-motion / 无 JS 直接进页
   （无 JS 时靠 CSS 兜底动画自动揭幕）。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';

const KEY = 'xm-boot-seen';

export function initBoot() {
  const veil = document.getElementById('bootveil');
  const root = document.documentElement;
  const done = () => {
    root.classList.add('booted');
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* 隐私模式下静默 */
    }
    setTimeout(() => veil?.remove(), 900);
  };

  if (!veil) {
    root.classList.add('booted');
    return;
  }

  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY) === '1';
  } catch {
    /* ignore */
  }

  if (seen || reducedMotion()) {
    veil.remove();
    done();
    return;
  }

  const pct = document.getElementById('bootpct');
  const skip = () => {
    veil.classList.add('ph-out');
    done();
  };
  addEventListener('pointerdown', skip, { once: true });
  addEventListener('keydown', skip, { once: true });
  addEventListener('wheel', skip, { once: true, passive: true });
  addEventListener('touchstart', skip, { once: true, passive: true });

  // 计数 000 → 100（与方波描线同步）
  const t0 = performance.now();
  const count = () => {
    const p = Math.min((performance.now() - t0) / 1000, 1);
    if (pct) pct.textContent = String(Math.floor(p * 100)).padStart(3, '0');
    if (p < 1) requestAnimationFrame(count);
  };
  requestAnimationFrame(count);

  setTimeout(() => veil.classList.add('ph-thread'), 1050); // 方波收成线
  setTimeout(() => veil.classList.add('ph-needle'), 1350); // 针落下
  setTimeout(() => veil.classList.add('ph-stitch'), 1850); // 第一针
  setTimeout(() => {
    root.classList.add('booted');
  }, 2050); // 缝线开始划出
  setTimeout(() => {
    veil.classList.add('ph-out');
    done();
  }, 2350);
}
