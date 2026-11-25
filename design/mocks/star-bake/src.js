/* ─────────────────────────────────────────────────────────────
   星 · 预渲染烘焙 · 客户端（design/mocks/star-bake/src.js）
   ─────────────────────────────────────────────────────────────
   这份脚本要证明三件事，其余一概不做：

   ① **静置是零帧。** 休息态就是一张图（frames/<set>/<size>/<set>-<size>-00.png 与
      星位那一张），页面加载完不排任何 rAF、不挂任何 timer。
      下面的 `meter` 记着「起过几个 rAF、活过几个 timer」，页面上直接读它。
   ② **翻动是触发一次、放完就停。** 播的时候用一条 setTimeout 链，一格一换图；
      最后一格落定之后 `clearTimeout` 并把句柄置 0，之后不再有任何帧。
      不用 CSS `steps()`、不用 `animation`：那会留一条常驻的合成动画，
      哪怕画面早就落定了，合成器仍然每帧醒来。这条在 notes 里有对比读数。
   ③ **色相是活的。** 图上只有 alpha。颜色来自 CSS 变量（`currentColor`），
      所以 reality.ts 把 `--amber / --umber / --wake / --dream` 改写时，
      这颗星跟着走，不需要重烘任何一张图。

   对外只有 `window.__star`：`flip() / busy() / state() / reset()`。
   ───────────────────────────────────────────────────────────── */

const DEFAULTS = {
  /** 发射的这一套（12 / 16 / 24 与 even/greedy 由页面按需要改） */
  set: 'even16',
  /** 取哪一档像素。页面上的展示位是 240，主视觉位是 400 */
  size: 240,
  /** 一帧持有多少毫秒（star-v-motion 的定格节奏：110 是「看得出停住」的下限） */
  holdMs: 110,
  /** 帧号宽度（文件名里补两位） */
  pad: 2,
};

const FRAME_DIR = (set, size) => `frames/${set}/${size}`;

/* ── 计量器：这是「零帧」那条要求的证据，不是调试信息 ───────────────────
   做法是**把 window.requestAnimationFrame / setTimeout 换成计数版**，
   而不是让页面自己走一个辅助函数 —— 后者只能证明「我自己没起帧」，
   前者能证明「这一页上没有任何人起帧」。将来接进站点时，别人的脚本也会被数到。 */
const meter = {
  rafStarted: 0,
  rafAlive: 0,
  timersStarted: 0,
  timersAlive: 0,
  imagesLoaded: 0,
  framesShown: 0,
};

const _raf = window.requestAnimationFrame.bind(window);
const _caf = window.cancelAnimationFrame.bind(window);
const _setT = window.setTimeout.bind(window);
const _clrT = window.clearTimeout.bind(window);

/** 未结算的定时器：id → { settled } */
const TIMERS = new Map();

window.requestAnimationFrame = function (fn) {
  meter.rafStarted++;
  meter.rafAlive++;
  return _raf((t) => {
    meter.rafAlive--;
    fn(t);
  });
};
window.cancelAnimationFrame = function (id) {
  /* 不在这里减 rafAlive：包装里那一帧跑不跑都会归零，
     而 cancel 的可能是已跑完的 id，减了会变负 */
  return _caf(id);
};
window.setTimeout = function (fn, ms, ...rest) {
  meter.timersStarted++;
  meter.timersAlive++;
  const id = _setT(function (...a) {
    const rec = TIMERS.get(id);
    if (rec) {
      rec.settled = true;
      TIMERS.delete(id);
    }
    meter.timersAlive--;
    if (typeof fn === 'function') fn.apply(this, a);
  }, ms, ...rest);
  TIMERS.set(id, { settled: false });
  return id;
};
window.clearTimeout = function (id) {
  const rec = TIMERS.get(id);
  if (rec && !rec.settled) {
    TIMERS.delete(id);
    meter.timersAlive--;
  }
  return _clrT(id);
};

/* ── 播放器 ─────────────────────────────────────────────────────────── */
class Star {
  constructor(el, opts = {}) {
    this.el = el;
    this.o = { ...DEFAULTS, ...opts };
    this.frames = [];
    this.cur = 0;
    this.timer = 0;
    this.loaded = false;
    this.lastResult = null;
    this.onstate = null;
  }

  /** 一轮需要的全部帧名。第 0 格是休息态（= 第 n 帧的正位，剥离出来单独一张，
      这样默认加载的就是它，不用把整叠预载进来） */
  names() {
    const { set, size, pad } = this.o;
    const n = Number(this.o.n || 16);
    const out = [];
    for (let i = 0; i < n; i++) out.push(`${FRAME_DIR(set, size)}/${set}-${size}-${String(i).padStart(pad, '0')}.png`);
    return out;
  }

  async preload() {
    this.frames = this.names();
    const imgs = this.frames.map(
      (src) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => {
            meter.imagesLoaded++;
            res(im);
          };
          im.onerror = () => res(null);
          im.src = src;
        }),
    );
    this.imgs = await Promise.all(imgs);
    this.loaded = true;
    this.state();
    return this.imgs.filter(Boolean).length;
  }

  /**
   * 播一次。**只在这一段里有帧。**
   *
   * 为什么是 setTimeout 链而不是 rAF：
   *   · 这里要的是「一格停 110ms」，不是「每屏一次」；
   *   · rAF 在隐藏标签页里会停，回来后会把落下的那一串补成一跳 —— 定格的样子就破了；
   *   · 链的长度是有限的（n 格），最后一下自己收尾，不存在「一直在转」的可能。
   * 为什么不用 CSS animation + steps()：
   *   · 那条路要么常驻（animation-fill-mode / 循环），要么得靠 animationend 去摘；
   *   · 而且 steps() 的每一格仍然由合成器推进，即使这一帧的画面与上一帧完全相同，
   *     合成器也不会跳过。颗星在页面上是装饰，静置时连合成器都不该醒。
   */
  flip() {
    /* 减弱动效：一格都不播。只把最后一张（落定的正位）留在屏幕上 ——
       落定后的剪影与休息态完全重合（IoU 1.0000），所以这一步在画面上什么也没发生。 */
    if (reduced.matches) {
      this.cur = this.frames.length ? this.frames.length - 1 : 0;
      if (this.loaded) this.show(this.cur);
      this.lastResult = { frames: 0, ms: 0, skipped: 'reduced-motion' };
      this.state();
      return false;
    }
    if (this.busy() || !this.loaded) return false;
    const n = this.frames.length;
    const t0 = performance.now();
    let i = 0;
    const tick = () => {
      i++;
      if (i >= n) {
        /* 落定：最后一格留在屏幕上，句柄归零，之后不再排任何定时器 */
        this.cur = n - 1;
        this.show(this.cur);
        this.timer = 0;
        this.lastResult = { frames: n, ms: Math.round(performance.now() - t0) };
        this.state();
        return;
      }
      this.cur = i;
      this.show(i);
      this.timer = window.setTimeout(tick, this.o.holdMs);
    };
    this.cur = 0;
    this.show(0);
    this.state();
    this.timer = window.setTimeout(tick, this.o.holdMs);
    return true;
  }

  /** 回到休息态：句柄清掉，图换回第 0 张，一个帧都不再排 */
  reset() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    this.cur = 0;
    this.show(0);
    this.state();
  }

  show(i) {
    const src = this.frames[i];
    if (!src) return;
    const el = this.el;
    const url = `url('${src}')`;
    if (el.style.getPropertyValue('--m') !== url) el.style.setProperty('--m', url);
    meter.framesShown++;
  }

  busy() {
    return !!this.timer;
  }

  state() {
    const s = {
      set: this.o.set,
      size: this.o.size,
      frame: this.cur,
      n: this.frames.length,
      busy: this.busy(),
      lastResult: this.lastResult,
      meter: { ...meter },
    };
    if (this.onstate) this.onstate(s);
    return s;
  }
}

/* ── 页面装配 ───────────────────────────────────────────────────────── */
const registry = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

function mount(root, opts) {
  const el = typeof root === 'string' ? document.querySelector(root) : root;
  if (!el) return null;
  const star = new Star(el, opts);
  registry.push(star);
  star.onstate = (s) => {
    el.dispatchEvent(new CustomEvent('star:state', { detail: s }));
  };
  return star;
}

/** 休息态：把第 0 帧挂上去就完事。不再做任何事。 */
function mountRest(root, opts) {
  const el = typeof root === 'string' ? document.querySelector(root) : root;
  if (!el) return null;
  const { set, size } = { ...DEFAULTS, ...opts };
  const img = el.querySelector('img') || el.appendChild(document.createElement('img'));
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = `${FRAME_DIR(set, size)}/${set}-${size}-00.png`;
  meter.imagesLoaded++;
  return el;
}

window.__star = {
  /** 对外唯一入口：翻一次。不依赖页面上的按钮 */
  flip: (i = 0) => registry[i]?.flip() ?? false,
  busy: (i = 0) => registry[i]?.busy() ?? false,
  state: (i = 0) => registry[i]?.state() ?? null,
  reset: (i = 0) => registry[i]?.reset(),
  /** 每一个实例的帧号 / 是否在动 */
  all: () => registry.map((s) => s.state()),
  /** 零帧的证据 */
  meter: () => ({ ...meter }),
  mount,
  mountRest,
  reducedMotion: () => reduced.matches,
};

/** 探针：静置 1.2s 的 rAF 计数。
 *  探针自己走**不计数**的原生 _raf，所以读数里只有页面自己起的帧。 */
window.__star.idleProbe = (ms = 1200) =>
  new Promise((res) => {
    const before = { ...meter };
    let ticks = 0;
    let stop = false;
    const t0 = performance.now();
    const loop = () => {
      ticks++;
      if (!stop) _raf(loop);
    };
    _raf(loop);
    _setT(() => {
      stop = true;
      res({
        ms: Math.round(performance.now() - t0),
        probeFrames: ticks,
        pageRafStarted: meter.rafStarted - before.rafStarted,
        pageTimersStarted: meter.timersStarted - before.timersStarted,
        pageFramesShown: meter.framesShown - before.framesShown,
        rafAlive: meter.rafAlive,
        timersAlive: meter.timersAlive,
      });
    }, ms);
  });

export { Star, meter, mount, mountRest };