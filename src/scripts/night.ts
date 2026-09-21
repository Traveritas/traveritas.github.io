/* ─────────────────────────────────────────────────────────────
   主页 · 过夜：滚动 → 时刻 → 色板按停靠点阶跃 + 轨图描线 + 钟与分期。
   段落位置取自真实 DOM（src/data/night.ts 的 SECTIONS）。
   ───────────────────────────────────────────────────────────── */

import {
  SECTIONS,
  PALETTE,
  STAGE_MS,
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

/** 阶段式取色：m 落在哪个阶段区间，就用该区间锚站的整组三色——
    「长段稳定＋少数几次快速换站」，杜绝连续插值的不可读过渡带，
    也避免逐停靠点密集换站读起来像加速渐变 */
function paletteAt(m: number): { bg: string; ink: string; soft: string } {
  let i = STAGE_MS.length - 1;
  while (i > 0 && m < STAGE_MS[i]) i--;
  const target = STAGE_MS[i];
  return PALETTE.find((p) => p.m === target) ?? PALETTE[0];
}

let railDot: HTMLElement | null = null;
let railTime: HTMLElement | null = null;
let railStage: HTMLElement | null = null;

export function initNight() {
  if (!document.getElementById('ns-hero')) return;

  measure();
  addEventListener('resize', measure);
  addEventListener('load', measure);
  // 字体与懒加载会改动布局，分次重测
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(measure);
  }
  setTimeout(measure, 1200);
  setTimeout(measure, 3000);

  railDot = document.querySelector<HTMLElement>('.rail--night .rail-dot');
  railTime = document.getElementById('rail-time');
  railStage = document.getElementById('rail-stage');

  const root = document.documentElement;
  let measuredOnce = false;

  onScrollRaf(() => {
    // 首次滚动时重测一次：加载瞬间的视口/布局可能是暂态值
    if (!measuredOnce) {
      measuredOnce = true;
      measure();
    }
    const m = minuteAt();
    const pal = paletteAt(m);
    root.style.setProperty('--bg', pal.bg);
    root.style.setProperty('--fg', pal.ink);
    root.style.setProperty('--fg-soft', pal.soft);

    const ir = parseInt(pal.ink.slice(1, 3), 16);
    const ig = parseInt(pal.ink.slice(3, 5), 16);
    const ib = parseInt(pal.ink.slice(5, 7), 16);
    root.style.setProperty('--line', `rgba(${ir},${ig},${ib},0.16)`);

    const st = stageAt(m);
    document.body.dataset.stage = st;

    if (railDot) railDot.style.top = `${(6 + (m / NIGHT_LEN) * 84).toFixed(1)}%`;
    if (railTime) railTime.textContent = fmtNightTime(m);
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
  });
}
