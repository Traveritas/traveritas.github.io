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

const WAVE_PATHS: Record<string, string> = {
  W: 'M 0 6 Q 2 4.5 4 6 T 8 6 T 12 6 T 16 6 T 20 6 T 24 6 T 28 6 T 32 6 T 36 6 L 38 6',
  WASO: 'M 0 6 Q 2 4.5 4 6 T 8 6 T 12 6 T 16 6 T 20 6 T 24 6 T 28 6 T 32 6 T 36 6 L 38 6',
  N1: 'M 0 6 C 3 2.5, 6 2.5, 9.5 6 S 16 9.5, 19 6 S 25.5 2.5, 28.5 6 S 35 9.5, 38 6',
  N2: 'M 0 6 Q 3.5 6 7 6 Q 9 4.2 11 7.8 Q 13 2.5 15 9.5 Q 17 1 19 11 Q 21 2.5 23 9.5 Q 25 4.2 27 7.8 Q 29 6 32.5 6 L 38 6',
  N3: 'M 0 6 C 6 1, 13 1, 19 6 S 32 11, 38 6',
  REM: 'M 0 6 L 4 3 L 7 8 L 10 4 L 13 7.5 L 16 3.5 L 19 9 L 22 4 L 25 7.5 L 29 3 L 33 8 L 38 6',
};

let railProbe: HTMLElement | null = null;
let railDot: HTMLElement | null = null;
let railTime: HTMLElement | null = null;
let probeWavePath: SVGPathElement | null = null;
let probeWaveBg: SVGPathElement | null = null;
let probeWaveBox: HTMLElement | null = null;

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

    // 切换动态微波形形态（β、θ、纺锤波、δ、REM）
    const pathStr = WAVE_PATHS[st] || WAVE_PATHS.W;
    if (probeWavePath) {
      probeWavePath.setAttribute('d', pathStr);
    }
    if (probeWaveBg) {
      probeWaveBg.setAttribute('d', pathStr);
    }
    if (probeWaveBox) {
      probeWaveBox.classList.remove('wave-swap');
      void probeWaveBox.offsetWidth; // 重启动画
      probeWaveBox.classList.add('wave-swap');
    }
  }

  // 探针沿基准轨下移
  const target = railProbe || railDot;
  if (target) {
    const top = `${(4 + (m / NIGHT_LEN) * 92).toFixed(1)}%`;
    if (top !== appliedDotTop) {
      appliedDotTop = top;
      target.style.top = top;
    }
  }
  if (railTime) {
    const clock = fmtNightTime(m);
    if (clock !== appliedClock) {
      appliedClock = clock;
      railTime.textContent = clock;
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

  railProbe = document.getElementById('rail-probe');
  railDot = document.querySelector<HTMLElement>('.rail--night .rail-dot');
  railTime = document.getElementById('rail-time');
  probeWavePath = document.getElementById('probe-wave-path') as SVGPathElement | null;
  probeWaveBg = document.getElementById('probe-wave-bg') as SVGPathElement | null;
  probeWaveBox = document.getElementById('probe-wave-box');

  if (railProbe) {
    railProbe.style.position = 'absolute';
    const dot = railProbe.querySelector<HTMLElement>('.rail-dot');
    if (dot) {
      dot.style.position = 'relative';
      dot.style.left = 'auto';
      dot.style.top = 'auto';
    }
  }

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
