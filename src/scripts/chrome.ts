/* ─────────────────────────────────────────────────────────────
   全局 chrome：发丝进度线 / 叠影 --echo / past-hero /
   缝线锚点（函数图巡行：随结停靠、逐站沿线越走越远、
   停靠点附近沿线大幅无规律游走）/ 阅读深度轨。
   ───────────────────────────────────────────────────────────── */

import { clamp, onScrollRaf, reducedMotion } from './lib';
import { wakeMix } from './reality';

const DEG = (14 * Math.PI) / 180;
const DX = Math.cos(DEG);
const DY = Math.sin(DEG);

/** 每站沿线的增量：刻度锚点越走越远 */
const SPREAD = 0.115;
/** 停靠点附近沿线游走的幅度（线宽分数） */
const WANDER = 0.05;

let seamAnchor: HTMLElement | null = null;
let seamW = 0;
let knots: HTMLElement[] = [];
let hoverKnot: HTMLElement | null = null;
let baseT: number | null = null; // 首屏锚位（醒/梦两字中点在缝线上的投影）
let lastStop = 0.46; // 无结在带内时钉在上一站，不回退
let anchorT = 46; // 当前锚点位置（线宽百分比）
let anchorTarget = 46;
let anchorRaf = 0;
let anchorMovedAt = 0;

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

/** 沿线游走：三层不同频正弦叠出的无规律漂移（-1..1） */
function wanderAt(t: number): number {
  return (
    (Math.sin(t * 0.31) + Math.sin(t * 0.53 + 1.7) + Math.sin(t * 0.11 + 4.2)) / 3
  );
}

function applyAnchor() {
  if (seamAnchor) seamAnchor.style.left = `${anchorT}%`;
}

function anchorStep() {
  // 醒静梦动：游走幅度随醒度衰减，醒面锚点钉定在停靠处
  const w = reducedMotion() ? 0 : wanderAt(performance.now() / 1000) * (WANDER * 100) * (1 - wakeMix());
  anchorT += (anchorTarget + w - anchorT) * 0.08;
  anchorMovedAt = performance.now();
  applyAnchor();
}

function anchorLoop() {
  anchorStep();
  anchorRaf = requestAnimationFrame(anchorLoop); // 游走常驻，不收敛
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
  if (!anchorRaf) anchorRaf = requestAnimationFrame(anchorLoop);
}

export function initChrome() {
  const seam = document.querySelector<HTMLElement>('.seam');
  seamAnchor = seam?.querySelector<HTMLElement>('.seam-anchor') ?? null;
  if (seam) {
    seamW = seam.offsetWidth || 1;
    addEventListener('resize', () => {
      seamW = seam.offsetWidth || 1;
      baseT = null;
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
    if (anchorRaf && performance.now() - anchorMovedAt > 600) anchorStep();
  }, 700);

  const hairline = document.querySelector<HTMLElement>('.hairline-fill');
  const rail = document.querySelector<HTMLElement>('.rail[data-depth]');
  const depthTarget = rail?.dataset.depth
    ? document.querySelector<HTMLElement>(rail.dataset.depth)
    : null;
  const depthDot = rail?.querySelector<HTMLElement>('.rail-dot');
  const dawnGlow = document.querySelector<HTMLElement>('.dawn-glow');

  onScrollRaf(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;

    // 首页左轨：滚过首屏才浮现（内页无首屏，恒为浮现态）
    const hasHero = !!document.getElementById('ns-hero');
    document.body.classList.toggle('past-hero', !hasHero || scrollY > innerHeight * 0.5);

    if (hairline) hairline.style.width = `${p * 100}%`;

    // 叠影错位：页首半分离 → 中段最大 → 页尾合拢
    const echo = p < 0.5 ? 0.5 + p : 1 - (p - 0.5) * 2;
    doc.style.setProperty('--echo', echo.toFixed(3));

    if (depthTarget) {
      const r = depthTarget.getBoundingClientRect();
      const prog = clamp((innerHeight * 0.6 - r.top) / Math.max(r.height, 1), 0, 1);
      if (depthDot) depthDot.style.top = `${(6 + prog * 84).toFixed(1)}%`;
      if (dawnGlow) dawnGlow.style.opacity = (0.12 + prog * 0.85).toFixed(3);
    }

    kickAnchor();
  });
}
