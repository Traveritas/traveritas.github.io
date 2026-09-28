/* ─────────────────────────────────────────────────────────────
   全局 chrome：发丝进度线 / 叠影 --echo / past-hero /
   缝线锚点（函数图巡行：随结停靠、逐站沿线越走越远；
   停靠点附近沿线大幅无规律游走交给 Seam.astro 的 CSS）/ 阅读深度轨。
   ───────────────────────────────────────────────────────────── */

import { clamp, onFrame30, onScrollRaf, reducedMotion } from './lib';

const DEG = (14 * Math.PI) / 180;
const DX = Math.cos(DEG);
const DY = Math.sin(DEG);

/** 每站沿线的增量：刻度锚点越走越远 */
const SPREAD = 0.115;

let seamAnchor: HTMLElement | null = null;
let seamW = 0;
let knots: HTMLElement[] = [];
let hoverKnot: HTMLElement | null = null;
let baseT: number | null = null; // 首屏锚位（醒/梦两字中点在缝线上的投影）
let lastStop = 0.46; // 无结在带内时钉在上一站，不回退
let anchorT = 46; // 当前锚点位置（线宽百分比）
let anchorTarget = 46;
let anchorStop: (() => void) | null = null; // 帧钟订阅（null ＝ 锚点静止、不占帧）
let anchorMovedAt = 0;
let anchorShown = '';

/** 视口坐标点 → 缝线上的位置（0–1 线宽分数） */
function projectPoint(px: number, py: number): number {
  return ((px - innerWidth / 2) * DX + (py - innerHeight / 2) * DY) / seamW + 0.5;
}

function projectKnot(k: HTMLElement): number {
  const r = k.getBoundingClientRect();
  return projectPoint(r.left + r.width / 2, r.top + r.height / 2);
}

function heroBase(): number {
  const w = document.querySelector<HTMLElement>('.ch-wake');
  const d = document.querySelector<HTMLElement>('.ch-dream');
  if (!w || !d) return 0.46;
  const wr = w.getBoundingClientRect();
  const dr = d.getBoundingClientRect();
  return projectPoint(
    (wr.left + wr.width / 2 + dr.left + dr.width / 2) / 2,
    (wr.top + wr.height / 2 + dr.top + dr.height / 2) / 2,
  );
}

/** 锚点不跑出视口的线上限 */
function onScreenMax(): number {
  const L = seamW || 1;
  const tx = 0.5 + (innerWidth / 2 - 28) / (L * DX);
  const ty = 0.5 + (innerHeight / 2 - 28) / (L * DY);
  return Math.max(0.55, Math.min(tx, ty));
}

/** 阅读带内的结（top ∈ 5%–62%，最靠近 37% 视高者） */
function focusKnot(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const k of knots) {
    const r = k.getBoundingClientRect();
    if (r.top > innerHeight * 0.05 && r.top < innerHeight * 0.62) {
      const dist = Math.abs(r.top - innerHeight * 0.37);
      if (dist < bestD) {
        bestD = dist;
        best = k;
      }
    }
  }
  return best;
}

/* 锚点沿线的位置：轨道点在 CSS 里停在 left: 50%，这里只写 translate（线宽百分比 → px）。
   原先逐帧写 left ⇒ 每帧一次重排；translate 不进布局，且值没变就不写（不产生样式失效） */
function applyAnchor() {
  if (!seamAnchor) return;
  const v = `${(((anchorT - 50) / 100) * seamW).toFixed(2)}px 0`;
  if (v === anchorShown) return;
  anchorShown = v;
  seamAnchor.style.translate = v;
}

/* 趋近停靠点。游走（醒静梦动，三个正弦相加）已交给 Seam.astro 里三层嵌套的 CSS 动画、
   由合成器跑；这里只剩「换站时滑过去」这一段，落定就退订帧钟 —— 原先是常驻的 60fps rAF，
   逐帧写 left，锚点不动时也一直占着主线程帧。 */
function anchorStep() {
  /* 帧钟约 30fps：原先 60fps 下每帧趋近 8%，这里取 1−0.92² ≈ 15.4%，每秒收敛量不变 */
  anchorT += (anchorTarget - anchorT) * 0.1536;
  anchorMovedAt = performance.now();
  if (Math.abs(anchorTarget - anchorT) < 0.01) {
    anchorT = anchorTarget;
    stopAnchor();
  }
  applyAnchor();
}

function startAnchor() {
  if (!seamAnchor || anchorStop || reducedMotion()) return;
  anchorStop = onFrame30(anchorStep);
}

function stopAnchor() {
  anchorStop?.();
  anchorStop = null;
}

function markActive(focus: HTMLElement | null) {
  for (const n of knots) {
    n.closest('.stitch-head')?.classList.toggle('is-active', n === focus);
  }
}

function kickAnchor() {
  if (!seamAnchor) return;
  if (baseT == null) baseT = heroBase();
  const b = baseT ?? 0.46;
  const focus = hoverKnot ?? focusKnot();
  if (focus) {
    const idx = Math.max(0, knots.indexOf(focus));
    lastStop = projectKnot(focus) + idx * SPREAD;
    markActive(focus);
  } else {
    markActive(null);
  }
  const hi = onScreenMax();
  anchorTarget = clamp(lastStop, Math.min(0.08, b), hi) * 100;
  if (reducedMotion()) {
    anchorT = anchorTarget;
    applyAnchor();
    return;
  }
  startAnchor();
}

export function initChrome() {
  const seam = document.querySelector<HTMLElement>('.seam');
  seamAnchor = seam?.querySelector<HTMLElement>('.seam-anchor-track') ?? null;
  // 阅读页把锚点 display:none 掉了：不画的东西不巡行（原先照样逐帧跑）
  if (seamAnchor && !seamAnchor.getClientRects().length) seamAnchor = null;
  if (seam) {
    seamW = seam.offsetWidth || 1;
    addEventListener('resize', () => {
      seamW = seam.offsetWidth || 1;
      baseT = null;
      anchorShown = '';
      applyAnchor();
    });
  }

  knots = [...document.querySelectorAll<HTMLElement>('.knot')];
  for (const k of knots) {
    k.addEventListener('pointerenter', () => {
      hoverKnot = k;
      kickAnchor();
    });
    k.addEventListener('pointerleave', () => {
      hoverKnot = null;
      kickAnchor();
    });
  }

  // rAF 被节流的环境里，用低频定时器拖着锚点继续游走
  setInterval(() => {
    if (anchorStop && performance.now() - anchorMovedAt > 600) anchorStep();
  }, 700);

  const hairline = document.querySelector<HTMLElement>('.hairline-fill');
  const rail = document.querySelector<HTMLElement>('.rail[data-depth]');
  const depthTarget = rail?.dataset.depth
    ? document.querySelector<HTMLElement>(rail.dataset.depth)
    : null;
  const depthDot = rail?.querySelector<HTMLElement>('.rail-dot');
  const dawnGlow = document.querySelector<HTMLElement>('.dawn-glow');

  const heroEl = document.getElementById('ns-hero');
  const dawnEl = document.getElementById('ns-dawn');
  let heroBottom = innerHeight;
  let dawnTriggerY = Infinity;

  function measureBounds() {
    const vh = innerHeight;
    if (heroEl) {
      heroBottom = heroEl.offsetTop + heroEl.offsetHeight;
    }
    if (dawnEl) {
      dawnTriggerY = dawnEl.getBoundingClientRect().top + scrollY - vh * 0.45;
    }
  }

  if (heroEl) {
    measureBounds();
    window.addEventListener('resize', measureBounds, { passive: true });
    window.addEventListener('load', measureBounds, { passive: true });
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(measureBounds);
    }
    setTimeout(measureBounds, 1200);
  }

  onScrollRaf(() => {
    // 读操作前置（避免写后读引发 Layout Thrashing）
    let prog = 0;
    if (depthTarget) {
      const r = depthTarget.getBoundingClientRect();
      prog = clamp((innerHeight * 0.6 - r.top) / Math.max(r.height, 1), 0, 1);
    }

    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;

    // 首页左轨：首屏完全消失后才进入，触及破晓明亮处收起（内页无首屏，恒为浮现态）
    if (heroEl) {
      const pastHero = scrollY >= heroBottom;
      const inDawn = scrollY >= dawnTriggerY;
      document.body.classList.toggle('past-hero', pastHero);
      document.body.classList.toggle('in-dawn', inDawn);
    } else {
      document.body.classList.add('past-hero');
      document.body.classList.remove('in-dawn');
    }

    // scaleX 而非 width：不进布局（渐变随盒子一起压缩，与按宽度裁出的一截逐像素相同）
    if (hairline) hairline.style.transform = `scaleX(${p.toFixed(4)})`;

    if (depthTarget) {
      if (depthDot) depthDot.style.top = `${(6 + prog * 84).toFixed(1)}%`;
      if (dawnGlow) dawnGlow.style.opacity = (0.12 + prog * 0.85).toFixed(3);
    }

    kickAnchor();
  });
}
