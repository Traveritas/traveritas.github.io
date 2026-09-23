/* ─────────────────────────────────────────────────────────────
   主页 · 过夜：滚动 → 时刻 → 轨图描线 + 钟与分期。
   段落位置取自真实 DOM（src/data/night.ts 的 SECTIONS）。
   背景色由 CSS 静态长卷环境渐变完全承载，JS 不触碰任何根变量。
   轨道时钟按滚动位置连续映射到 23:07 → 06:31。
   ───────────────────────────────────────────────────────────── */

import {
  SECTIONS,
  NIGHT_LEN,
  STAGE_INFO,
  stageAt,
  fmtNightTime,
} from '../data/night';
import { onScrollRaf } from './lib';

interface Anchor {
  /** 段顶到达视口中心时的 scrollY */
  x: number;
  m: number;
}

let anchors: Anchor[] = [];
let maxScroll = 1;

function measure() {
  const vh = innerHeight;
  anchors = [];
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const top = el.getBoundingClientRect().top + scrollY;
    anchors.push({ x: top - vh / 2, m: s.from });
  }
  maxScroll = Math.max(document.documentElement.scrollHeight - vh, 1);
  // 页底强制天亮：最后一个锚点 = 最大滚动处 → 06:31
  anchors.push({ x: maxScroll, m: NIGHT_LEN });
}

let lastScrollAt = 0;
let measureT = 0;

function measureSoon() {
  clearTimeout(measureT);
  measureT = window.setTimeout(measure, Math.max(0, 200 - (performance.now() - lastScrollAt)));
}

function minuteAt(): number {
  const y = scrollY;
  if (!anchors.length) return 0;
  if (y <= anchors[0].x) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (y >= a.x && y < b.x) {
      const t = (y - a.x) / Math.max(b.x - a.x, 1);
      return a.m + (b.m - a.m) * t;
    }
  }
  return NIGHT_LEN;
}

let railDot: HTMLElement | null = null;
let railTime: HTMLElement | null = null;
let railStage: HTMLElement | null = null;

let appliedStage = '';
let appliedClock = '';
let appliedDotTop = '';

function paint() {
  const m = minuteAt();
  const st = stageAt(m);
  const stage = st.toLowerCase();
  if (stage !== appliedStage) {
    appliedStage = stage;
    document.body.dataset.stage = stage;
  }

  if (railDot) {
    const top = `${(6 + (m / NIGHT_LEN) * 84).toFixed(1)}%`;
    if (top !== appliedDotTop) {
      appliedDotTop = top;
      railDot.style.top = top;
    }
  }
  if (railTime) {
    const clock = fmtNightTime(m);
    if (clock !== appliedClock) {
      appliedClock = clock;
      railTime.textContent = clock;
    }
  }
  if (railStage) {
    const info = STAGE_INFO[st];
    const label = `${info.zh} · ${info.wave}`;
    if (railStage.textContent !== label) {
      railStage.textContent = label;
      railStage.classList.remove('swap');
      void railStage.offsetWidth; // 重启动画
      railStage.classList.add('swap');
    }
  }
}

export function initNight() {
  if (!document.getElementById('ns-hero')) return;

  measure();
  addEventListener('scroll', () => (lastScrollAt = performance.now()), { passive: true });
  addEventListener('resize', measureSoon);
  addEventListener('load', measureSoon);
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(measureSoon);
  }
  setTimeout(measureSoon, 1200);
  setTimeout(measureSoon, 3000);

  railDot = document.querySelector<HTMLElement>('.rail--night .rail-dot');
  railTime = document.getElementById('rail-time');
  railStage = document.getElementById('rail-stage');

  let measuredOnce = false;

  paint();
  requestAnimationFrame(() => {
    measure();
    paint();
  });

  onScrollRaf(() => {
    if (!measuredOnce) {
      measuredOnce = true;
      measure();
    }
    paint();
  });
}
