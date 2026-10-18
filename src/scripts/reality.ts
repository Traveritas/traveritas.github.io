/* ─────────────────────────────────────────────────────────────
   入梦检验 · 全站机制（2026-10-18 改为「塌缩圈」，蓝本：design/mocks/resolve/ 的长按）
   · 空白处按住：先静默 170ms（与点击区分，移动超过 10px 即取消），然后从指下扩出一圈
     「塌缩」——圈里的东西粗成像素格，圈心最粗、前沿一带一级级抖开，半径先慢后快地涨到
     盖住整屏（梦→醒约 1 秒，醒→梦略快）。文字在圈的前沿扫过时换面。
   · 塌满：停一拍（100ms）→ 闩锁另一面（松手不回）→ 每 50ms 退半级，400ms 解析回来。
   · 中途松手：半径按同一个级别函数收回去（也是一级一级解析回来），停在原面；松了又按，从头来。
   · 短按（≤170ms）＝点击，完全静默。
   · 键盘：焦点不在交互件时按住 Shift＋空格 等价，圈心在视口中央略偏上。
   · 画面由「圈的渲染者」负责：默认是 ring.ts 的一张覆盖全屏的像素画布（普通页面）；
     自己有画面的页（漫游 / 检索那片空间）用 setRingRenderer 接过去，在自己的着色器与窗里画。
     这里只给圈的几何：圈心、半径、退级（shift）与要去的那一面。
   · 双文案走 morph 引擎（[data-morph][data-dream]，元素内文本＝醒面真值）。
   · 配色不与夜色系统（night.ts 拥有 --bg/--fg/--fg-soft/--line）抢变量：强调色插值
     （--amber/--umber/--ghost-ink/--dream 随醒度暖↔冷）＋ --reality-mix（0=梦，1=醒）。
   · 无 JS：恒醒面真值（HTML 原文）。prefers-reduced-motion：不入梦，按压即瞬时两态切换。
     闩锁状态经 sessionStorage 跨页保持。
   · 调试：window.__fx.state()；性能：单 rAF 仅在非空闲时运转，各阶段墙钟兜底。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion, hexToRgb } from './lib';
import { getDuals, morphText, setMorphReality, setMorphPause } from './morph';
import { createDomRing } from './ring';

/* 强调色双色（醒面=醒灰冷）：梦端取 tokens 现值 */
const ACCENT: Record<string, [number[], number[]]> = {
  '--amber': [hexToRgb('#9a86c4'), hexToRgb('#a7b1ba')],
  '--umber': [hexToRgb('#4f4a66'), hexToRgb('#556270')],
  '--ghost-ink': [hexToRgb('#817ba3'), hexToRgb('#8e9aa6')],
  '--dream': [hexToRgb('#9389ae'), hexToRgb('#a39c92')],
};
const mixRgb = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(
    a[2] + (b[2] - a[2]) * t,
  )})`;

/* 节奏：一处改 */
const CLICK_MS = 170; // 静默判定窗：这之内松手是点击
const STEP = 72; // 圈里每粗一级的距离（px）：圈心最粗，往外每 STEP 细一级
const LEVELS = 4; // 最粗的一级（≈ 16px 的格）
const BEAT = 100; // 塌满后停一拍再闩锁
const RESOLVE_MS = 400; // 闩锁后解析回来：每 50ms 退半级
const MOVE_CANCEL = 10;
const EXCLUDE =
  'a,button,input,textarea,select,label,summary,[contenteditable],h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,time,code,pre,[data-morph],[data-nofx]';
/* 自成一片空间的页（主页 / 漫游）：字不可选，标题也能直接按住（入口与链接仍排除） */
const EXCLUDE_SPACE = 'a,button,input,textarea,select,label,summary,[contenteditable],[data-nofx]';
let ptrExclude = EXCLUDE;
const KBD_DENY = 'a,button,input,textarea,select,summary,[contenteditable],[data-nofx]';
const STORE_KEY = 'xm-reality';

export type Reality = 'dream' | 'wake';
type Mode = 'idle' | 'hold' | 'retract' | 'freeze';

/** 圈：视口坐标。级别函数 L(d) = clamp(floor(min((r − d)/step, levels) + bayer − shift), 0, levels)
    ——先钳到最粗那一档再退：解析回来时圈心那一片也一级级变细，不会停在最粗、最后一下跳回清楚 */
export interface Ring {
  on: boolean;
  x: number;
  y: number;
  r: number;
  step: number;
  levels: number;
  shift: number;
  to: Reality;
}
export type RingRenderer = (ring: Ring) => void;

export type RealityListener = (r: Reality) => void;
const realityListeners: RealityListener[] = [];

export function onRealityChange(fn: RealityListener) {
  realityListeners.push(fn);
  fn(reality);
}

export function getReality(): Reality {
  return reality;
}

/** 接管圈的画面（null 交还默认的像素画布） */
let customRing: RingRenderer | null = null;
let domRing: RingRenderer | null = null;
export function setRingRenderer(fn: RingRenderer | null) {
  if (domRing) domRing({ ...ring, on: false });
  customRing = fn;
}

/** 显式落定某一面（样式预览页的醒 / 梦开关）。
    与闩锁走同一条路径——强调色插值、双面文案、跨页记忆都随之对齐；手势进行中不抢占。 */
export function forceReality(target: Reality) {
  if (!body || mode !== 'idle' || target === reality) return;
  dir = target === 'wake' ? 'go' : 'back';
  reality = target;
  body.dataset.reality = target;
  notifyReality(target);
  store(target);
  setMorphReality(target);
  flipAllDuals(true);
  c = target === 'wake' ? 1 : 0;
  setTint(c);
}

function notifyReality(r: Reality) {
  for (const fn of realityListeners) fn(r);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('xm:reality', { detail: { reality: r } }));
  }
}
function store(r: Reality) {
  try {
    sessionStorage.setItem(STORE_KEY, r);
  } catch {
    /* 隐私模式静默 */
  }
}

let reality: Reality = 'wake';
let mode: Mode = 'idle';
let dir: 'go' | 'back' = 'go';
let src: 'ptr' | 'kb' | null = null;
let pid = -1;
let p = 0; // 半径进度 0..1（r = rEnd · p）
let c = 1; // 醒度 0..1（1 = 醒）
let px = 0;
let py = 0;
let rEnd = 1;
let growMs = 1000;
let holdT0 = 0;
let retractT0 = 0;
let retractFrom = 0;
let retractDur = 0;
let freezeT0 = 0;
let settleFrom = 1;
let settleTo = 1;
let startX = 0;
let startY = 0;
let rafId = 0;
let watchdog: ReturnType<typeof setTimeout> | 0 = 0;
let holdActive = false;
const ring: Ring = { on: false, x: 0, y: 0, r: 0, step: STEP, levels: LEVELS, shift: 0, to: 'wake' };

/* 减弱动效偏好：跟着系统设置走 */
let RM = reducedMotion();
if (typeof matchMedia !== 'undefined') {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    RM = e.matches;
  });
}
let docEl: HTMLElement;
let body: HTMLElement;

/* ---------- 圈 ---------- */
function drawRing(on: boolean, r = 0, shift = 0) {
  ring.on = on;
  ring.x = px;
  ring.y = py;
  ring.r = r;
  ring.shift = shift;
  ring.to = targetFace();
  const fn = customRing ?? domRing;
  if (fn) fn(ring);
}
/** 盖住整屏要的半径：最远的角再往外 LEVELS 级（圈心最粗那一档也铺满） */
function fullRadius(x: number, y: number) {
  const W = innerWidth;
  const H = innerHeight;
  return Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + LEVELS * STEP;
}

/* 醒度变化的订阅口：给读不到 CSS 变量的消费方（Worker 里的脑电，见 Eeg.astro） */
const mixListeners: (() => void)[] = [];
export function onMixChange(fn: () => void) {
  mixListeners.push(fn);
}

let lastMix = -1;
function setTint(cc: number) {
  const rounded = Math.round(cc * 1000) / 1000;
  if (rounded === lastMix) return;
  lastMix = rounded;
  for (const k in ACCENT) {
    const [d, w] = ACCENT[k];
    docEl.style.setProperty(k, mixRgb(d, w, rounded));
  }
  docEl.style.setProperty('--reality-mix', rounded.toFixed(3));
  for (const fn of mixListeners) fn();
}

/** 当前醒度 0..1 */
export function wakeMix(): number {
  return c;
}

/** 长按进行中（已过静默判定窗）：要去的面与距闩锁的剩余秒数；否则 null */
export function holdIntent(): { to: Reality; eta: number } | null {
  if (mode !== 'hold' || !holdActive) return null;
  return {
    to: targetFace(),
    eta: (Math.max(0, growMs - (performance.now() - holdT0 - CLICK_MS)) + BEAT) / 1000,
  };
}

/* ---------- 文字换面：圈的前沿扫过时换 ---------- */
function targetFace(): Reality {
  return dir === 'go' ? 'wake' : 'dream';
}
function flipDualsByRing(r: number) {
  for (const d of getDuals()) {
    if (!d.flipped && r >= d.dx) {
      d.flipped = true;
      morphText(d.el, targetFace() === 'wake' ? d.wake : d.dream, 560);
    } else if (d.flipped && r < d.dx - 8) {
      d.flipped = false;
      morphText(d.el, targetFace() === 'wake' ? d.dream : d.wake, 400);
    }
  }
}
function flipAllDuals(instant: boolean) {
  const face = targetFace();
  for (const d of getDuals()) {
    if (!instant && d.flipped) continue;
    d.flipped = true;
    if (instant) {
      morphText(d.el, face === 'wake' ? d.wake : d.dream, 0);
    } else {
      const r = d.el.getBoundingClientRect();
      const onscreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      morphText(d.el, face === 'wake' ? d.wake : d.dream, onscreen ? 600 : 0);
    }
  }
}
function restoreDuals() {
  const face = reality;
  for (const d of getDuals()) {
    if (d.flipped) {
      d.flipped = false;
      morphText(d.el, face === 'wake' ? d.wake : d.dream, 400);
    }
  }
}

/* ---------- 状态机 ---------- */
function beginHold(x: number, y: number, fromSrc: 'ptr' | 'kb') {
  if (mode === 'freeze') return; // 正在解析回来：这一拍不接新的按压
  if (mode === 'retract') finishRetract();
  if (mode !== 'idle') return;
  mode = 'hold';
  src = fromSrc;
  dir = reality === 'dream' ? 'go' : 'back';
  px = x;
  py = y;
  rEnd = fullRadius(x, y);
  // 盖满的时长随要走的距离：屏越大越久，但钳在一个手感范围里；醒→梦（回梦）快一些
  growMs = Math.min(1250, Math.max(820, rEnd * 0.55)) * (dir === 'go' ? 1 : 0.82);
  p = 0;
  holdT0 = performance.now();
  holdActive = false;
  // 前沿到达阈值：按压时一次性测量（元素中心到按压点的距离）。
  // 屏外元素不随圈换面（阈值无穷大），留到闩锁时统一换——免得屏外重排牵动滚动位置
  for (const d of getDuals()) {
    const r = d.el.getBoundingClientRect();
    const onscreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    d.dx = onscreen ? Math.hypot(r.left + r.width / 2 - px, r.top + r.height / 2 - py) : Infinity;
    d.flipped = false;
  }
  startLoop();
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (mode === 'hold') latch();
  }, CLICK_MS + growMs + BEAT + 200);
}
function releaseHold() {
  if (mode !== 'hold') return;
  const held = performance.now() - holdT0;
  src = null;
  pid = -1;
  body.classList.remove('reality-holding');
  clearTimeout(watchdog);

  if (held <= CLICK_MS || p <= 0) {
    mode = 'idle';
    p = 0;
    holdActive = false;
    drawRing(false);
    stopLoop();
    setMorphPause(false);
    return;
  }
  if (p >= 1) return; // 已经塌满、在那一拍里：照常闩锁

  mode = 'retract';
  retractT0 = performance.now();
  retractFrom = p;
  retractDur = 120 + 420 * p;
  watchdog = setTimeout(() => {
    if (mode === 'retract') finishRetract();
  }, retractDur + 200);
}
function latch() {
  mode = 'freeze';
  src = null;
  pid = -1;
  holdActive = false;
  clearTimeout(watchdog);
  body.classList.remove('reality-holding');
  reality = targetFace();
  body.dataset.reality = reality;
  notifyReality(reality);
  store(reality);
  setMorphReality(reality);
  flipAllDuals(RM);
  settleFrom = c;
  settleTo = dir === 'go' ? 1 : 0;
  freezeT0 = performance.now();
  if (RM) {
    c = settleTo;
    setTint(c);
    drawRing(false);
    mode = 'idle';
    p = 0;
    stopLoop();
    setMorphPause(false);
    return;
  }
  watchdog = setTimeout(() => finishFreeze(), RESOLVE_MS + 300);
}
function finishFreeze() {
  if (mode !== 'freeze') return;
  mode = 'idle';
  p = 0;
  holdActive = false;
  c = settleTo;
  setTint(c);
  drawRing(false);
  stopLoop();
  setMorphPause(false);
}
function finishRetract() {
  mode = 'idle';
  p = 0;
  holdActive = false;
  c = reality === 'wake' ? 1 : 0;
  setTint(c);
  drawRing(false);
  restoreDuals();
  stopLoop();
  setMorphPause(false);
}
function toggleInstant() {
  // RM：按压即瞬时两态切换
  dir = reality === 'dream' ? 'go' : 'back';
  reality = targetFace();
  body.dataset.reality = reality;
  notifyReality(reality);
  store(reality);
  setMorphReality(reality);
  flipAllDuals(true);
  c = reality === 'wake' ? 1 : 0;
  setTint(c);
}

/* ---------- 帧循环（仅非空闲时运转，各阶段墙钟兜底） ---------- */
function startLoop() {
  if (!rafId) rafId = requestAnimationFrame(loop);
}
function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}
/* 半径按 16px 取整：前沿一块一块地进，不是平滑地扫 */
const snap = (r: number) => Math.round(r / 16) * 16;
function loop(now: number) {
  rafId = 0;
  if (mode === 'hold') {
    const elapsed = now - holdT0;
    if (elapsed >= CLICK_MS) {
      if (!holdActive) {
        holdActive = true;
        body.classList.add('reality-holding');
        setMorphPause(true); // 按住 / 解析期间暂停走神，免得与换面打架
      }
      const t = Math.min(1, (elapsed - CLICK_MS) / growMs);
      p = t;
      const r = rEnd * Math.pow(t, 1.5); // 先慢后快
      c = dir === 'go' ? p * 0.85 : 1 - p * 0.85;
      setTint(c);
      drawRing(true, snap(r));
      flipDualsByRing(r);
      if (t >= 1 && elapsed - CLICK_MS >= growMs + BEAT) {
        latch();
        startLoop();
        return;
      }
    }
  } else if (mode === 'retract') {
    const k = Math.min(1, (now - retractT0) / retractDur);
    p = retractFrom * (1 - k);
    const r = rEnd * Math.pow(p, 1.5);
    c = dir === 'go' ? p * 0.85 : 1 - p * 0.85;
    setTint(c);
    drawRing(true, snap(r));
    flipDualsByRing(r);
    if (k >= 1) {
      finishRetract();
      return;
    }
  } else if (mode === 'freeze' && !RM) {
    const ft = now - freezeT0;
    c = settleFrom + (settleTo - settleFrom) * Math.min(1, ft / RESOLVE_MS);
    setTint(c);
    // 每 50ms 退半级：8 下退到底
    const shift = Math.min(LEVELS + 1, Math.floor(ft / 50) * 0.5);
    drawRing(true, rEnd, shift);
    if (ft >= RESOLVE_MS + 60) {
      finishFreeze();
      return;
    }
  }
  if (mode !== 'idle') rafId = requestAnimationFrame(loop);
}

/* ---------- 手势 ---------- */
function wireGestures() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const t = e.target;
    if (t instanceof Element && t.closest(ptrExclude)) return;
    if (src !== null) return;
    if (RM) {
      px = e.clientX;
      py = e.clientY;
      toggleInstant();
      return;
    }
    pid = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    beginHold(e.clientX, e.clientY, 'ptr');
  });
  document.addEventListener('pointermove', (e) => {
    if (mode !== 'hold' || src !== 'ptr' || e.pointerId !== pid) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL) releaseHold();
  });
  const onPtrEnd = (e: PointerEvent) => {
    if (mode !== 'hold' || src !== 'ptr' || e.pointerId !== pid) return;
    releaseHold();
  };
  document.addEventListener('pointerup', onPtrEnd);
  document.addEventListener('pointercancel', onPtrEnd);
  let scrollMark = 0;
  document.addEventListener('pointerdown', () => (scrollMark = scrollY), { capture: true });
  addEventListener(
    'scroll',
    () => {
      if (mode === 'hold' && Math.abs(scrollY - scrollMark) > 4) releaseHold();
    },
    { passive: true },
  );
  document.addEventListener('contextmenu', (e) => {
    if (mode === 'hold') e.preventDefault();
  });
  addEventListener('blur', () => {
    if (mode === 'hold') releaseHold();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'hold') releaseHold();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || !e.shiftKey) return;
    const ae = document.activeElement;
    if (ae instanceof Element && ae.closest(KBD_DENY)) return;
    e.preventDefault();
    if (src !== null) return;
    if (RM) {
      toggleInstant();
      return;
    }
    beginHold(Math.round(innerWidth / 2), Math.round(innerHeight * 0.45), 'kb');
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && mode === 'hold' && src === 'kb') releaseHold();
  });
}

/* ---------- 启动 ---------- */
function enterDream() {
  // 入场只演一次，且不写 reality。若这之前已有人显式落定醒面（样式预览页的 forceReality），就此让位
  if (reality !== 'dream') return;
  setMorphReality('dream');
  const duals = getDuals();
  const vis: typeof duals = [];
  for (const d of duals) {
    const r = d.el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight && r.width > 0) vis.push(d);
  }
  vis.forEach((d, j) => {
    setTimeout(() => morphText(d.el, d.dream, 820), 260 + j * 120);
  });
  const visSet = new Set(vis);
  for (const d of duals) if (!visSet.has(d)) morphText(d.el, d.dream, 0);
  c = 0;
  setTint(0);
}

export function initReality() {
  docEl = document.documentElement;
  body = document.body;
  domRing = createDomRing();
  if (document.getElementById('ns-hero') || document.getElementById('w-host')) ptrExclude = EXCLUDE_SPACE;

  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORE_KEY);
  } catch {
    /* ignore */
  }

  if (RM) {
    // RM：不入梦，恒醒面（按压仍可瞬时切换，但无动画）
    reality = 'wake';
    body.dataset.reality = 'wake';
    setMorphReality('wake');
    notifyReality(reality);
    c = 1;
    setTint(1);
    wireGestures();
    return;
  }

  wireGestures();

  if (stored === 'wake') {
    reality = 'wake';
    body.dataset.reality = 'wake';
    setMorphReality('wake');
    notifyReality(reality);
    for (const d of getDuals()) morphText(d.el, d.wake, 0);
    c = 1;
    setTint(1);
    return;
  }

  reality = 'dream';
  body.dataset.reality = 'dream';
  notifyReality(reality);
  c = 0;
  setTint(0);
  // 等开屏校准揭幕后入梦（无开屏/已看过则立即）
  const enter = () => setTimeout(enterDream, 120);
  if (docEl.classList.contains('booted')) enter();
  else {
    const t0 = performance.now();
    const waitBoot = () => {
      if (docEl.classList.contains('booted') || performance.now() - t0 > 3200) enter();
      else setTimeout(waitBoot, 120);
    };
    waitBoot();
  }
}

/* ---------- 调试接口 ---------- */
declare global {
  interface Window {
    __fx?: { state: () => { reality: Reality; holding: boolean; progress: number }; ring: Ring };
  }
}
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__fx = {
    state: () => ({ reality, holding: mode === 'hold' && holdActive, progress: +p.toFixed(3) }),
    ring,
  };
}
