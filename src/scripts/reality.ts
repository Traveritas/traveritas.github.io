/* ─────────────────────────────────────────────────────────────
   入梦检验 · 全站机制（蓝本：design/mocks/p8-thread.html 终选修订版）
   · 空白处长按 2200ms：一根 -4° 细线自指下抽出，梦→醒；按满定格
     （成结 ◆ 倒旋入场＋琥珀环闪旋出＋全页 2.2px 微沉一拍），线结
     随即散尽，闩锁醒面（松手不回）。
   · 同手势 1300ms 回梦：线反向生长，指下收拢成结、倒旋收起（环闪
     内收——落款的倒放），线抽走褪出，闩锁梦面。
   · 中途松手 ≤600ms 退回原面；短按（≤260ms）＝判定窗口，完全静默（无状态变化、不展线、不动方块，为独立点击动画预留）。
   · 键盘：焦点不在交互件时按住 Shift＋空格 等价（裸空格保留给滚屏）。
   · 双文案走 morph 引擎（[data-morph][data-dream]，元素内文本＝醒面
     真值）；按住时文字随线到达换面，闩锁时全部对齐当前面。
   · 配色不与夜色系统（night.ts 拥有 --bg/--fg/--fg-soft/--line）抢
     变量：双色由强调色插值（--amber/--umber/--ghost-ink/--dream/--wash
     随醒度暖↔冷）＋morph 文字两面＋线结特效共同承担，无全屏渐变层。
     --reality-mix（0=梦，1=醒）与 --still（动效倍率，醒静梦动）供
     CSS 消费：漂移振幅、暗角/颗粒浓度、叠影错位、body 背景洗染。
   · 无 JS：恒醒面真值（HTML 原文）。prefers-reduced-motion：不入梦，
     按压即瞬时两态切换。闩锁状态经 sessionStorage 跨页保持。
   · 调试：window.__fx.state() / __fx.clicks；性能：单 rAF 仅在
     非空闲时运转，每帧只写 CSS 变量与 transform，各阶段墙钟兜底。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion, easeOut, hexToRgb } from './lib';
import { getDuals, morphText, setMorphReality, setMorphPause } from './morph';

const eo3 = easeOut;
const eio3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* 强调色双色（醒面=醒灰冷，doorcheck 语义）：梦端取 tokens 现值。
   --dream 醒端＝休眠的灰沙（缝线梦侧、药丸边、vtag 暖签随醒度褪暖）；
   大表面洗染由 GPU 独立的 .wash-backdrop 承担（梦暖褐 ↔ 醒冷灰），不在根节点逐帧重写 */
const ACCENT: Record<string, [number[], number[]]> = {
  '--amber': [hexToRgb('#d9a05b'), hexToRgb('#a7b1ba')],
  '--umber': [hexToRgb('#765640'), hexToRgb('#556270')],
  '--ghost-ink': [hexToRgb('#b98f74'), hexToRgb('#8e9aa6')],
  '--dream': [hexToRgb('#c2a382'), hexToRgb('#a39c92')],
};
const mixRgb = (a: number[], b: number[], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(
    a[2] + (b[2] - a[2]) * t,
  )})`;

const T_GO = 2200;
const T_BACK = 1300;
const RETRACT_MS = 560;
const SETTLE_MS = 280;
const CLICK_MS = 260;
const EXCLUDE =
  'a,button,input,textarea,select,label,summary,[contenteditable],h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,time,code,pre,[data-morph],[data-nofx]';
/* 主页例外：文字不可选后正文/标题也可直接长按（入口与链接仍排除）；
   其余页维持「空白处」语义，不打扰选字复制 */
let ptrExclude = EXCLUDE;
const KBD_DENY = 'a,button,input,textarea,select,summary,[contenteditable],[data-nofx]';
const STORE_KEY = 'xm-reality';

export type Reality = 'dream' | 'wake';
type Mode = 'idle' | 'hold' | 'retract' | 'freeze';

export type RealityListener = (r: Reality) => void;
const realityListeners: RealityListener[] = [];

export function onRealityChange(fn: RealityListener) {
  realityListeners.push(fn);
  fn(reality);
}

export function getReality(): Reality {
  return reality;
}

/** 显式落定某一面（样式预览页的醒 / 梦开关）。
    与闩锁走同一条路径——强调色插值、双面文案、跨页记忆都随之对齐，
    所以预览页看到的就是长按入梦后的同一状态；手势进行中不抢占。 */
export function forceReality(target: Reality) {
  if (!body || mode !== 'idle' || target === reality) return;
  dir = target === 'wake' ? 'go' : 'back';
  reality = target;
  body.dataset.reality = target;
  notifyReality(target);
  try {
    sessionStorage.setItem(STORE_KEY, target);
  } catch {
    /* 隐私模式静默 */
  }
  setMorphReality(target);
  flipAllDuals(true);
  if (thread) thread.style.display = 'none';
  hideKnot();
  c = target === 'wake' ? 1 : 0;
  setTint(c);
}

function notifyReality(r: Reality) {
  for (const fn of realityListeners) fn(r);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('xm:reality', { detail: { reality: r } }));
  }
}

let reality: Reality = 'wake';
let mode: Mode = 'idle';
let dir: 'go' | 'back' = 'go';
let src: 'ptr' | 'kb' | null = null;
let pid = -1;
let p = 0; // 进度 0..1
let c = 1; // 醒度 0..1（1 = 醒）
let px = 0;
let py = 0;
let holdT0 = 0;
let retractT0 = 0;
let retractFrom = 0;
let retractDur = 0;
let freezeT0 = 0;
let freezeW1 = 0;
let settleFrom = 1;
let settleTo = 1;
let knotAt = 0;
let scrollMark = 0;
let startX = 0;
let startY = 0;
let clicks = 0;
let rafId = 0;
let watchdog: ReturnType<typeof setTimeout> | 0 = 0;
let knotShown = false;
let holdActive = false;

const RM = reducedMotion();
let docEl: HTMLElement;
let body: HTMLElement;
let sinkTarget: HTMLElement | null = null;
let riseCut = false;
let sinkOn = false;
let sinkT0 = 0;

let fx: HTMLDivElement | null = null;
let thread: HTMLDivElement | null = null;
let tCore: HTMLElement | null = null;
let tBand: HTMLElement | null = null;
let knot: HTMLDivElement | null = null;
let flick: HTMLDivElement | null = null;

/* ---------- 特效层 DOM 与样式（自包含，不动 global.css） ---------- */
function buildFx() {
  if (fx) return;
  const style = document.createElement('style');
  style.textContent = `
.fx-reality{position:fixed;inset:0;z-index:210;pointer-events:none;overflow:hidden;transform:translateZ(0)}
.fx-reality .thread{position:absolute;left:0;top:0;width:0;height:0;display:none;transform-origin:0 0;will-change:transform}
.fx-reality .t-core{position:absolute;top:-0.5px;left:0;width:0;height:1px;opacity:1}
.fx-reality .t-band{position:absolute;top:-32px;left:0;width:0;height:64px;opacity:0;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
.fx-reality .thread.go .t-core{background:linear-gradient(90deg,
  rgba(167,177,186,0),rgba(167,177,186,.38) 8%,rgba(217,160,91,.8) 50%,
  rgba(167,177,186,.38) 92%,rgba(167,177,186,0))}
.fx-reality .thread.back .t-core{background:linear-gradient(90deg,
  rgba(194,163,130,0),rgba(194,163,130,.4) 8%,rgba(217,160,91,.8) 50%,
  rgba(194,163,130,.4) 92%,rgba(194,163,130,0))}
.fx-reality .thread.go .t-band{background:linear-gradient(180deg,
  rgba(157,170,182,0),rgba(157,170,182,.11) 50%,rgba(157,170,182,0))}
.fx-reality .thread.back .t-band{background:linear-gradient(180deg,
  rgba(198,166,130,0),rgba(198,166,130,.12) 50%,rgba(198,166,130,0))}
.fx-reality .knot{position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;display:none;
  transform:translate(-100px,-100px) rotate(45deg)}
.fx-reality .knot i{position:absolute;inset:-1px;display:block;border:1px solid rgba(167,177,186,.8);background:#4a525b}
.fx-reality .knot.on,.fx-reality .knot.off,.fx-reality .knot.pack{display:block}
.fx-reality .knot.on i{animation:xmKnotIn .3s cubic-bezier(.2,.8,.3,1) both;
  box-shadow:0 0 10px 1px rgba(217,160,91,.38)}
.fx-reality .knot.on::after{content:'';position:absolute;inset:-3px;display:block;
  border:1px solid rgba(217,160,91,.9);animation:xmKnotRing .55s cubic-bezier(.17,.67,.3,1) both}
.fx-reality .knot.off i{animation:xmKnotOff .16s ease-in both}
.fx-reality .knot.pack i{animation:xmKnotPack .36s cubic-bezier(.55,0,.85,.45) both}
.fx-reality .knot.pack::after{content:'';position:absolute;inset:-3px;display:block;
  border:1px solid rgba(217,160,91,.7);animation:xmKnotRingIn .44s cubic-bezier(.3,.6,.2,1) both}
@keyframes xmKnotIn{from{transform:scale(.2) rotate(-120deg);opacity:0}to{transform:scale(1) rotate(0deg);opacity:1}}
@keyframes xmKnotRing{from{transform:scale(.5) rotate(0deg);opacity:.95}to{transform:scale(3) rotate(90deg);opacity:0}}
@keyframes xmKnotRingIn{from{transform:scale(2.4) rotate(40deg);opacity:.75}to{transform:scale(.35) rotate(-50deg);opacity:0}}
@keyframes xmKnotPack{from{transform:scale(1.15) rotate(0deg);opacity:1}to{transform:scale(.1) rotate(-110deg);opacity:0}}
@keyframes xmKnotOff{to{transform:scale(.15) rotate(60deg);opacity:0}}
.fx-reality .flick{position:absolute;left:0;top:0;width:38px;height:1px;margin:0 0 0 -19px;display:none;
  background:linear-gradient(90deg,rgba(167,177,186,0),rgba(167,177,186,.55) 50%,rgba(167,177,186,0));
  transform:translate(var(--fx,0px),var(--fy,0px)) rotate(-4deg)}
.fx-reality .flick.go{display:block;animation:xmFlick .3s ease-out both}
@keyframes xmFlick{
  0%{transform:translate(var(--fx,0px),var(--fy,0px)) rotate(-4deg) scale(.15);opacity:0}
  35%{transform:translate(var(--fx,0px),var(--fy,0px)) rotate(-4deg) scale(1);opacity:1}
  100%{transform:translate(var(--fx,0px),var(--fy,0px)) rotate(-4deg) scale(.6);opacity:0}}
body.reality-holding{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;overflow-anchor:none}
@media (prefers-reduced-motion:reduce){
  .fx-reality .knot i,.fx-reality .knot::after,.fx-reality .flick{animation:none!important}
}`;
  document.head.appendChild(style);

  fx = document.createElement('div');
  fx.className = 'fx-reality';
  fx.setAttribute('aria-hidden', 'true');
  thread = document.createElement('div');
  thread.className = 'thread';
  const band = document.createElement('i');
  band.className = 't-band';
  tCore = document.createElement('i');
  tCore.className = 't-core';
  thread.append(band, tCore);
  tBand = band;
  knot = document.createElement('div');
  knot.className = 'knot';
  knot.appendChild(document.createElement('i'));
  flick = document.createElement('div');
  flick.className = 'flick';
  fx.append(thread, knot, flick);
  body.appendChild(fx);

  // .page 内的 fixed 氛围层（主页暗角 .vignette / 文章晓线 .dawn-glow）挪到
  // body：微沉给 .page 加 transform 的一瞬，fixed 后代会改锚到 .page（整页
  // 高的盒子），暗角会在震动瞬间闪变。它们本就按视口定位、参与根层叠，
  // 挪出后正常渲染不变，只是不再被微沉劫持。以后新增 fixed 氛围层也放
  // .page 外（或加进这个选择器）。
  document
    .querySelectorAll<HTMLElement>('.page .vignette, .page .dawn-glow')
    .forEach((el) => body.appendChild(el));
}

/* ---------- 绘制 ---------- */
function fullW() {
  return 2 * Math.max(px, innerWidth - px) + 80;
}

let threadBaseW = 0;
function initThreadBase(forceW?: number) {
  threadBaseW = forceW ?? fullW();
  if (tCore && tBand) {
    tCore.style.width = `${threadBaseW}px`;
    tCore.style.left = `${-threadBaseW / 2}px`;
    tBand.style.width = `${threadBaseW}px`;
    tBand.style.left = `${-threadBaseW / 2}px`;
  }
}

function drawThread(W: number, ang: number, coreOp: number, bandOp: number) {
  if (!thread || !tCore || !tBand) return;
  if (threadBaseW <= 0 || W > threadBaseW * 1.05) {
    initThreadBase(Math.max(fullW(), W));
  }
  const sx = threadBaseW > 0 ? W / threadBaseW : 0;
  thread.style.transform = `translate3d(${px}px,${py}px,0) rotate(${ang}deg) scaleX(${sx.toFixed(4)})`;
  tCore.style.opacity = `${coreOp}`;
  tBand.style.opacity = `${bandOp}`;
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
}

/** 当前醒度 0..1（chrome.ts 锚点游走等「醒静梦动」消费方使用） */
export function wakeMix(): number {
  return c;
}
function showKnot(pack: boolean) {
  if (!knot) return;
  knot.style.transform = `translate(${px}px,${py}px) rotate(45deg)`;
  knot.className = pack ? 'knot pack' : 'knot on';
  knotShown = true;
}
function hideKnot() {
  knotShown = false;
  if (knot) knot.className = 'knot';
}
function knotDissolve() {
  if (!knotShown || !knot) return;
  knotShown = false;
  knot.className = 'knot off';
  setTimeout(() => {
    if (!knotShown && knot) knot.className = 'knot';
  }, 200);
}

/* ---------- 全页微沉（墨线一弹的落印震感） ---------- */
function pageSink(now: number) {
  if (!sinkTarget || RM) return;
  // 入场动画 fill 会压住 inline transform，先解除（此时早已播完）
  if (!riseCut) {
    sinkTarget.style.animation = 'none';
    riseCut = true;
  }
  // 相对定位平移而非 transform：transform 会让 .page 变成层叠上下文，
  // 首屏负 z 纸壳（ps-sheet/leaf/wall，平时逃逸在根上下文、沉在全局
  // 缝线/脑电之下）被关进 .page、整叠纸瞬间盖住线——背景线闪没一拍。
  // relative+top 视觉等价（paint 时偏移、无 reflow），不产生层叠上下文，
  // 也不劫持 fixed 后代的包含块
  sinkTarget.style.position = 'relative';
  sinkOn = true;
  sinkT0 = now;
}
function pageSinkTick(now: number) {
  if (!sinkOn || !sinkTarget) return;
  const st = now - sinkT0;
  if (st < 175) {
    const jy = st < 50 ? 2.2 * Math.pow(st / 50, 3) : 2.2 * (1 - eo3((st - 50) / 120));
    sinkTarget.style.top = `${jy.toFixed(2)}px`;
  } else {
    pageSinkEnd();
  }
}
function pageSinkEnd() {
  if (!sinkOn) return;
  sinkOn = false;
  if (sinkTarget) {
    sinkTarget.style.top = '';
    sinkTarget.style.position = '';
  }
}

/* ---------- 线头一弹（已按需禁用，预留未来独立点击动画） ----------
function clickFlick() {
  if (!flick || RM) return;
  flick.style.setProperty('--fx', `${px}px`);
  flick.style.setProperty('--fy', `${py}px`);
  flick.className = 'flick';
  void flick.offsetWidth;
  flick.className = 'flick go';
  clicks++;
} */

/* ---------- 文字换面 ---------- */
function targetFace() {
  return dir === 'go' ? 'wake' : 'dream';
}
function flipDualsByThread(half: number) {
  for (const d of getDuals()) {
    if (!d.flipped && half >= d.dx) {
      d.flipped = true;
      morphText(d.el, targetFace() === 'wake' ? d.wake : d.dream, 660);
    } else if (d.flipped && half < d.dx - 8) {
      d.flipped = false;
      morphText(d.el, targetFace() === 'wake' ? d.dream : d.wake, 480);
    }
  }
}
function flipAllDuals(instant: boolean) {
  const face = targetFace();
  for (const d of getDuals()) {
    // 线到达时已翻过面的不再重复乱码（否则视觉上 morph 两次）
    if (!instant && d.flipped) continue;
    d.flipped = true;
    if (instant) {
      morphText(d.el, face === 'wake' ? d.wake : d.dream, 0);
    } else {
      // 可见的乱码过渡；屏外的直接落定（省 rAF）
      const r = d.el.getBoundingClientRect();
      const onscreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      morphText(d.el, face === 'wake' ? d.wake : d.dream, onscreen ? 700 : 0);
    }
  }
}
function restoreDuals() {
  const face = reality === 'wake' ? 'wake' : 'dream';
  for (const d of getDuals()) {
    if (d.flipped) {
      d.flipped = false;
      morphText(d.el, face === 'wake' ? d.wake : d.dream, 400);
    }
  }
}

/* ---------- 状态机 ---------- */
function beginHold(x: number, y: number, fromSrc: 'ptr' | 'kb') {
  const now = performance.now();
  if (mode !== 'idle') {
    if (mode === 'freeze' && now - freezeT0 > (dir === 'go' ? 340 : 480)) {
      mode = 'idle';
      p = 0;
      holdActive = false;
      pageSinkEnd();
      knotDissolve();
    } else {
      return;
    }
  }
  mode = 'hold';
  src = fromSrc;
  dir = reality === 'dream' ? 'go' : 'back';
  px = x;
  py = y;
  initThreadBase();
  p = 0;
  holdT0 = now;
  holdActive = false;
  scrollMark = scrollY;
  // 线到达阈值：按压时一次性测量（元素中心与按压点的横向距离）；
  // 屏外元素不参与随线渐进换面（阈值设为无穷大），留待闩锁时由 flipAllDuals 统一换面，
  // 避免屏外元素乱码重排引发 scrollHeight 抖动劫持视口滚动位置导致长按中断
  for (const d of getDuals()) {
    const r = d.el.getBoundingClientRect();
    const onscreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    d.dx = onscreen ? Math.max(14, Math.abs(r.left + r.width / 2 - px)) : Infinity;
    d.flipped = false;
  }
  startLoop();
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (mode === 'hold') latch();
  }, (dir === 'go' ? T_GO : T_BACK) + 120);
}
function releaseHold() {
  if (mode !== 'hold') return;
  const held = performance.now() - holdT0;
  src = null;
  pid = -1;
  body.classList.remove('reality-holding');
  clearTimeout(watchdog);

  if (held <= CLICK_MS) {
    mode = 'idle';
    p = 0;
    holdActive = false;
    if (thread) thread.style.display = 'none';
    stopLoop();
    setMorphPause(false);
    return;
  }

  mode = 'retract';
  retractT0 = performance.now();
  retractFrom = p;
  retractDur = Math.min(RETRACT_MS, 200 + p * 380);
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
  reality = dir === 'go' ? 'wake' : 'dream';
  body.dataset.reality = reality;
  notifyReality(reality);
  try {
    sessionStorage.setItem(STORE_KEY, reality);
  } catch {
    /* 隐私模式静默 */
  }
  setMorphReality(reality);
  flipAllDuals(RM);
  settleFrom = c;
  settleTo = dir === 'go' ? 1 : 0;
  freezeT0 = performance.now();
  if (RM) {
    c = settleTo;
    setTint(c);
    if (thread) thread.style.display = 'none';
    mode = 'idle';
    p = 0;
    stopLoop();
    setMorphPause(false);
    return;
  }
  freezeW1 = fullW();
  knotAt = dir === 'go' ? freezeT0 + 110 : freezeT0 + 40;
  watchdog = setTimeout(() => finishFreeze(), dir === 'go' ? 900 : 520);
}
function finishFreeze() {
  if (mode !== 'freeze') return;
  mode = 'idle';
  p = 0;
  holdActive = false;
  if (thread) thread.style.display = 'none';
  pageSinkEnd();
  if (dir === 'go') knotDissolve();
  else hideKnot();
  stopLoop();
  setMorphPause(false);
}
function finishRetract() {
  mode = 'idle';
  p = 0;
  holdActive = false;
  if (thread) thread.style.display = 'none';
  restoreDuals();
  stopLoop();
  setMorphPause(false);
}
function toggleInstant() {
  // RM：按压即瞬时两态切换
  dir = reality === 'dream' ? 'go' : 'back';
  reality = dir === 'go' ? 'wake' : 'dream';
  body.dataset.reality = reality;
  notifyReality(reality);
  try {
    sessionStorage.setItem(STORE_KEY, reality);
  } catch {
    /* ignore */
  }
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
function loop(now: number) {
  rafId = 0;
  if (mode === 'hold') {
    const elapsed = now - holdT0;
    if (elapsed < CLICK_MS) {
      p = 0;
    } else {
      if (!holdActive) {
        holdActive = true;
        body.classList.add('reality-holding');
        setMorphPause(true); // 按住/定格期间暂停走神，避免与线换面打架
        if (!RM) {
          if (thread) {
            thread.className = `thread ${dir}`;
            thread.style.display = 'block';
          }
          drawThread(0, -4, 1, 0);
          if (dir === 'back') knotDissolve();
        }
      }
      const T = dir === 'go' ? T_GO : T_BACK;
      p = Math.min(1, (elapsed - CLICK_MS) / (T - CLICK_MS));
      if (!RM) {
        c = dir === 'go' ? p : 1 - p;
        setTint(c);
        const W = p * fullW();
        drawThread(W, -4, 1, 0.16 + 0.5 * p);
        flipDualsByThread(W / 2);
      }
      if (p >= 1) {
        latch();
        startLoop(); // 闩锁后定格分支仍需渲染（绷直/成结/微沉）
        return;
      }
    }
  } else if (mode === 'retract') {
    const kk = Math.min(1, (now - retractT0) / retractDur);
    p = retractFrom * (1 - eo3(kk));
    if (!RM) {
      c = dir === 'go' ? p : 1 - p;
      setTint(c);
      const W = p * fullW();
      drawThread(W, -4, 1, 0.16 + 0.5 * p);
      flipDualsByThread(W / 2);
    }
    if (kk >= 1) {
      finishRetract();
      return;
    }
  } else if (mode === 'freeze' && !RM) {
    const ft = now - freezeT0;
    c = settleFrom + (settleTo - settleFrom) * Math.min(1, ft / SETTLE_MS);
    setTint(c);
    if (dir === 'go') {
      // 绷直 90ms → 收拢 240ms 成结 → 环闪旋出＋全页微沉；随后线结散尽
      const a = ft < 90 ? -4 * (1 - eo3(ft / 90)) : 0;
      const W = ft < 90 ? freezeW1 : freezeW1 + (10 - freezeW1) * eio3(Math.min(1, (ft - 90) / 240));
      drawThread(W, a, 1, Math.max(0, 0.75 - ft / 150));
      if (!knotShown && now >= knotAt) {
        showKnot(false);
        pageSink(now);
      }
      pageSinkTick(now);
      if (ft >= 340 && thread) thread.style.display = 'none';
      if (ft >= 840) {
        finishFreeze();
        return;
      }
    } else {
      // 回梦：线绷直，指下收拢成结、倒旋收起（环闪内收），线抽走褪出
      const a2 = ft < 80 ? -4 * (1 - eo3(ft / 80)) : 0;
      const op = Math.max(0, 1 - Math.max(0, ft - 80) / 220);
      drawThread(fullW(), a2, op, op * 0.75);
      if (!knotShown && ft >= 40) showKnot(true);
      if (ft >= 480) {
        finishFreeze();
        return;
      }
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
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 20) releaseHold();
  });
  const onPtrEnd = (e: PointerEvent) => {
    if (mode !== 'hold' || src !== 'ptr' || e.pointerId !== pid) return;
    releaseHold();
  };
  document.addEventListener('pointerup', onPtrEnd);
  document.addEventListener('pointercancel', onPtrEnd);
  addEventListener(
    'scroll',
    () => {
      if (mode !== 'hold') return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      // 若按压前就在页底，且当前仍停在（自适应重排后的）页底，说明是内容换面重排引起的视口贴底跟随，非用户意图滚屏
      if (scrollMark >= maxScroll - 6 && Math.abs(scrollY - maxScroll) <= 6) {
        scrollMark = scrollY;
        return;
      }
      if (Math.abs(scrollY - scrollMark) > 4) releaseHold();
    },
    { passive: true },
  );
  document.addEventListener('contextmenu', (e) => {
    if (body.classList.contains('reality-holding')) e.preventDefault();
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
  // 入场只演一次，且不写 reality / data-reality。若这之前已有人显式落定醒面
  // （样式预览页的 forceReality），就此让位——否则会把刚选好的醒面掀成
  // 「醒面外壳 + 梦面文案 + 梦色强调」的半截状态。
  if (reality !== 'dream') return;
  // 入梦：可见 dual 逐个乱码入梦面，其余直接置梦面（醒面真值只在
  // 无 JS / RM 时呈现）
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
  sinkTarget = document.querySelector<HTMLElement>('.page');
  buildFx();
  if (document.getElementById('ns-hero')) {
    ptrExclude = 'a,button,input,textarea,select,label,summary,[contenteditable],[data-nofx]';
  }

  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(STORE_KEY);
  } catch {
    /* ignore */
  }

  if (RM) {
    // RM：不入梦，恒醒面（按压仍可瞬时切换，但无长动画）
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
    // 上一页闩锁在醒面：本页直接醒面入场，不再入梦
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
    __fx?: { state: () => { reality: Reality; holding: boolean; progress: number }; clicks: number };
  }
}
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__fx = {
    state: () => ({ reality, holding: mode === 'hold' && holdActive, progress: +p.toFixed(3) }),
    get clicks() {
      return clicks;
    },
  };
}
