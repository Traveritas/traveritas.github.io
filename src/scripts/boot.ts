/* ─────────────────────────────────────────────────────────────
   开屏 · 意识调频（两档最短停留）
   · 首次进入（每会话一次）：全套基线校准，揭幕前至少停留 3s
     （方波 1.5s → 聚合基线 → 坐标落定 → 揭幕）。
   · 站内切换（同会话后续页面）：快版调频，至少停留 1s
     （方波压缩到 0.5s，直接进基线校准段）。
   · 两档都不可跳过；reduced-motion / 无 JS 直接进页
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

  if (reducedMotion()) {
    veil.remove();
    done();
    return;
  }

  // 计数 000 → 100（与方波描线同步，时长随档位）
  const pct = document.getElementById('bootpct');
  const runCount = (dur: number) => {
    const t0 = performance.now();
    const count = () => {
      const p = Math.min((performance.now() - t0) / dur, 1);
      if (pct) pct.textContent = String(Math.floor(p * 100)).padStart(3, '0');
      if (p < 1) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  };

  /** tBoot：html.booted（页内缝线划出、首屏浮现开始）；tOut：揭幕淡出 */
  const settle = (tBoot: number, tOut: number) => {
    setTimeout(() => root.classList.add('booted'), tBoot);
    setTimeout(() => {
      veil.classList.add('ph-out');
      done();
    }, tOut);
  };

  if (seen) {
    // 站内切换：快版调频，≥1s
    veil.classList.add('ph-fast');
    runCount(900);
    setTimeout(() => veil.classList.add('ph-thread'), 430);
    setTimeout(() => veil.classList.add('ph-needle'), 650);
    setTimeout(() => veil.classList.add('ph-stitch'), 820);
    settle(900, 1050);
  } else {
    // 首次进入：全套基准校准，≥3s
    runCount(1500);
    setTimeout(() => veil.classList.add('ph-thread'), 1500);
    setTimeout(() => veil.classList.add('ph-needle'), 1950);
    setTimeout(() => veil.classList.add('ph-stitch'), 2500);
    settle(2600, 3100);
  }
}
