/* ─────────────────────────────────────────────────────────────
   主页 · 过夜：滚动 → 时刻 → 色板插值 + 轨图描线 + 钟与分期。
   段落位置取自真实 DOM（src/data/night.ts 的 SECTIONS）。
   ───────────────────────────────────────────────────────────── */

import {
  SECTIONS,
  PALETTE,
  NIGHT_LEN,
  STAGE_INFO,
  stageAt,
  fmtNightTime,
} from '../data/night';
import { clamp, onScrollRaf } from './lib';

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

type Rgb = [number, number, number];

const hexRgb = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];
const rgbHex = (c: Rgb): string =>
  '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const lerpC = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const lumC = (c: Rgb): number => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratioC = (a: Rgb, b: Rgb): number => {
  const x = lumC(a);
  const y = lumC(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** 换面护栏：ink/soft 与 bg 亮度重合时（开灯/关灯的半途），
    沿所在侧推离 bg 直到达标——滚动中文字永不沉底。 */
function guard(c: Rgb, bg: Rgb, floor: number): Rgb {
  if (ratioC(c, bg) >= floor) return c;
  const darken = lumC(c) < lumC(bg);
  let out: Rgb = [c[0], c[1], c[2]];
  for (let i = 0; i < 12 && ratioC(out, bg) < floor; i++) {
    out = darken
      ? [out[0] * 0.75, out[1] * 0.75, out[2] * 0.75]
      : [out[0] + (255 - out[0]) * 0.3, out[1] + (255 - out[1]) * 0.3, out[2] + (255 - out[2]) * 0.3];
  }
  return out;
}

function paletteAt(m: number): { bg: string; ink: string; soft: string } {
  let i = 0;
  while (i < PALETTE.length - 2 && m > PALETTE[i + 1].m) i++;
  const a = PALETTE[i];
  const b = PALETTE[i + 1] ?? a;
  const t = clamp((m - a.m) / Math.max(b.m - a.m, 1), 0, 1);
  const bg = lerpC(hexRgb(a.bg), hexRgb(b.bg), t);
  const ink = guard(lerpC(hexRgb(a.ink), hexRgb(b.ink), t), bg, 3.4);
  const soft = guard(lerpC(hexRgb(a.soft), hexRgb(b.soft), t), bg, 3.0);
  return { bg: rgbHex(bg), ink: rgbHex(ink), soft: rgbHex(soft) };
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
    // 分期选择器（index.astro）用小写 'n3'/'rem'，dataset 属性匹配大小写敏感
    document.body.dataset.stage = st.toLowerCase();

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
