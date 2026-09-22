/* ─────────────────────────────────────────────────────────────
   主页 · 过夜：滚动 → 时刻 → 三段换面 + 轨图描线 + 钟与分期。
   段落位置取自真实 DOM（src/data/night.ts 的 SECTIONS）。
   底色是三段平台（ZONES）：token 只在段真正改变时写入，别的帧一个字节
   都不碰根元素（自定义属性一变就是全文档样式失效）；换面的盖与揭交给
   全屏幕布（NightVeil.astro，只动 opacity 的合成器动画）。
   轨道时钟仍按分钟连续走。
   ───────────────────────────────────────────────────────────── */

import {
  SECTIONS,
  ZONES,
  ZONE_HYSTERESIS,
  NIGHT_LEN,
  STAGE_INFO,
  stageAt,
  fmtNightTime,
} from '../data/night';
import { onScrollRaf, reducedMotion } from './lib';

interface Anchor {
  /** 段顶到达视口中心时的 scrollY */
  x: number;
  m: number;
}

let anchors: Anchor[] = [];
let maxScroll = 1;
/** 换面触发点（scrollY）：ZONES[i+1].enter 换算而来；越过的个数 = 当前段序号 */
let zoneTriggers: number[] = [];

function measure() {
  const vh = innerHeight;
  anchors = [];
  zoneTriggers = [];
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    const top = el.getBoundingClientRect().top + scrollY;
    anchors.push({ x: top - vh / 2, m: s.from });
  }
  maxScroll = Math.max(document.documentElement.scrollHeight - vh, 1);
  // 页底强制天亮：最后一个锚点 = 最大滚动处 → 06:31
  anchors.push({ x: maxScroll, m: NIGHT_LEN });
  // 换面触发：enter.vh 是段顶所在的视口比例（负值＝段顶已越过视口顶端）
  for (const z of ZONES) {
    if (!z.enter) continue;
    const el = document.getElementById(z.enter.section);
    // 段不见了宁可这一段换不过去（停在上一段），也不要乱换：占位保住序号对齐
    zoneTriggers.push(el ? el.getBoundingClientRect().top + scrollY - vh * z.enter.vh : Number.POSITIVE_INFINITY);
  }
}

let lastScrollAt = 0;
let measureT = 0;

/** 重测入口：滚动中先挂起。触发点是按滚动像素存的，若在滚动途中重测而段界
    又恰有挪动，读者会看到一次「无故换面」——触控板的连续滚动里尤其明显。
    等滚动停了（或 200ms 内没有新滚动）再测。 */
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

/** 当前段序：越过触发点即 +1；回撤要退出 ZONE_HYSTERESIS 才 -1，
    在边界上反复蹭不会来回重放淡变 */
function zoneAt(y: number, cur: number): number {
  let i = cur;
  while (i < zoneTriggers.length && y >= zoneTriggers[i]) i++;
  while (i > 0 && y < zoneTriggers[i - 1] - ZONE_HYSTERESIS) i--;
  return i;
}

let railDot: HTMLElement | null = null;
let railTime: HTMLElement | null = null;
let railStage: HTMLElement | null = null;
let veil: HTMLElement | null = null;

/* 幕布节奏：盖住 85ms（NightVeil.astro 的 .cover）→ 落色 → 揭开（时长自适应）。
   全部用「观测」而不是「猜」：盖住要读到 opacity 真到 1 才落色；揭开要等
   新色真的画出来（连等两帧 + 按实测帧间隔拉长揭开时长）。负载重时帧稀，
   定时器猜的时机必然错位——落色赶在幕布盖严之前、或揭开赶在新帧画完之前，
   就会看到「先变亮→再变暗→瞬间变亮」。 */
const COVER_CAP_MS = 600;
const REVEAL_MIN_MS = 260;
const REVEAL_MAX_MS = 560;
let coverT = 0;
let revealT = 0;

/* 上一次落定的值：与 DOM 相同就不写（滚动里绝大多数帧因此完全无写入） */
let appliedZone = -1;
/** 此刻该在的段（每帧刷新）；幕布演出中改主意只记在这里 */
let wantZone = -1;
/** 幕布是否在演。不用类名判断——后台标签页定时器会被节流，类可能还没摘掉 */
let blinking = false;
let appliedStage = '';
let appliedClock = '';
let appliedDotTop = '';

function applyZone(i: number, root: HTMLElement) {
  if (i === appliedZone) return;
  appliedZone = i;
  const z = ZONES[i];
  root.style.setProperty('--bg', z.bg);
  root.style.setProperty('--fg', z.ink);
  root.style.setProperty('--fg-soft', z.soft);
  root.style.setProperty('--line', z.line);
  document.body.dataset.zone = z.name;
}

/** 一幕：盖住 → 读到真全遮 → 落色 → 等新色画出来 → 揭开。
    只动 opacity 的合成器动画，主线程只在落色那一帧有开销
    （此前用 @property 淡变，0.35s 里每帧写 root 变量 = 每帧全文档重算＋
    整视口重绘，玻璃片 backdrop-filter 还要重取样）。 */
function startBlink(root: HTMLElement) {
  const v = veil;
  if (!v) return;
  blinking = true;
  const target = wantZone; // 本幕的目标：幕中改主意由下一幕接续，本幕不改
  v.style.setProperty('--nv', ZONES[target].bg); // 幕布色 = 目标底色，揭开不跳色
  v.classList.remove('cover');
  void v.offsetWidth; // 重放（与 railStage 的 swap 同法）
  v.classList.add('cover');

  // ① 等幕布真的盖严：轮询计算值。负载重时合成器与主线程都会拖，
  //    靠定时器猜会在幕布还没盖严时落色——正是一半亮一半暗的来源
  const coverAt = performance.now();
  const awaitCover = () => {
    if (performance.now() - coverAt < COVER_CAP_MS && parseFloat(getComputedStyle(v).opacity) < 0.995) {
      requestAnimationFrame(awaitCover);
      return;
    }
    // ② 全遮这一拍落色（看不见）
    applyZone(target, root);
    // ③ 等新色真的画出来：连着两帧 rAF（每帧都会走 style→layout→paint），
    //    负载重时每帧都是几十毫秒，这一步自然顺延
    let frameAt = 0;
    requestAnimationFrame((ts1) => {
      frameAt = ts1;
      requestAnimationFrame((ts2) => {
        // ④ 揭开：时长按实测帧间隔放大（重绘慢的机器上揭开也慢），
        //    保证新一屏的重绘在幕布还厚的时候就完成
        const dt = Math.max(ts2 - frameAt, 16);
        const revealMs = Math.min(REVEAL_MAX_MS, Math.max(REVEAL_MIN_MS, dt * 6));
        v.style.setProperty('--reveal', `${revealMs}ms`);
        v.classList.remove('cover');
        clearTimeout(revealT);
        revealT = window.setTimeout(() => {
          blinking = false;
          // 幕中还跨过（触控板在边界上搓）：接着演下一幕。
          // 绝不中途改幕布颜色或瞬时落色——那会造出「亮幕里突然变暗、又瞬间变亮」的闪
          if (wantZone >= 0 && wantZone !== appliedZone) startBlink(root);
        }, revealMs + 60);
      });
    });
  };
  clearTimeout(coverT);
  coverT = window.setTimeout(awaitCover, 0);
}

/** 每帧把「此刻该在的段」交给状态机：没跨就什么也不做；
    跨了就演一幕；幕中只更新目标，由上一幕结束时接续 */
function requestZone(i: number, root: HTMLElement) {
  wantZone = i;
  if (blinking) return;
  if (i === appliedZone) return;
  // 首帧瞬时落色（不进幕布）：刷新在页面中段直接落在夜面/纸面，
  // 不会先闪一下昼面再演一次熄灯
  if (appliedZone < 0 || !veil || reducedMotion()) {
    applyZone(i, root);
    return;
  }
  startBlink(root);
}

function paint(root: HTMLElement) {
  const y = scrollY;
  requestZone(zoneAt(y, appliedZone < 0 ? 0 : appliedZone), root);

  const m = minuteAt();
  const st = stageAt(m);
  // 分期选择器（index.astro）用小写 'n3'/'rem'，dataset 属性匹配大小写敏感
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
  // 滚动中的重测一律走 measureSoon（挂起到滚动停下）
  addEventListener('scroll', () => (lastScrollAt = performance.now()), { passive: true });
  addEventListener('resize', measureSoon);
  addEventListener('load', measureSoon);
  // 字体与懒加载会改动布局，分次重测
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(measureSoon);
  }
  setTimeout(measureSoon, 1200);
  setTimeout(measureSoon, 3000);

  railDot = document.querySelector<HTMLElement>('.rail--night .rail-dot');
  railTime = document.getElementById('rail-time');
  railStage = document.getElementById('rail-stage');
  veil = document.getElementById('nightveil');

  const root = document.documentElement;
  let measuredOnce = false;

  // 首帧瞬时落色，然后重测一次布局（字体/懒加载会挪动段界）
  paint(root);
  requestAnimationFrame(() => {
    measure();
    paint(root);
  });

  onScrollRaf(() => {
    // 首次滚动时重测一次：加载瞬间的视口/布局可能是暂态值
    if (!measuredOnce) {
      measuredOnce = true;
      measure();
    }
    paint(root);
  });
}
