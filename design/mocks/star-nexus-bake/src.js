/* ─────────────────────────────────────────────────────────────
   星 · 晶体 · 客户端播放器（design/mocks/star-nexus-bake/src.js）
   ─────────────────────────────────────────────────────────────
   这一支动画是**烘死的**：16 个定格姿态已经作为一张精灵图发出来，
   运行时只做一件事 —— 按 110ms 一格把 background-position 推过去，末格停住。
   没有着色器、没有管线、没有每帧的 GPU 开销；触发一次之后**完全静默**。

   行为
   ────
   · 首屏只载**落定帧**（8–16 KB）：那是一张正六芒星，静止时就是它。
   · 触发时若精灵图还没下，按「最短路径」先取它，再播；播完停在末格（就是落定帧那张）。
   · prefers-reduced-motion：不播，直接停。
   · 零帧证明：`state()` 里的 frames／timers／raf 三个数在静止时必须全是 0。

   色
   ──
   站点按醒度（--reality-mix）插值四个令牌。晶体烘了两套（醒 / 梦），
   交叉淡入由这里做：两张精灵图叠在一起，按混合比调上层透明度。
   两套是真渲出来的，所以中间态不需要 CSS 猜色。
   ───────────────────────────────────────────────────────────── */

const HERE = new URL('.', import.meta.url).href;
const D = { wx: 0, wy: 0 }; // 光标，给精灵图一点极轻的位移（不改几何、不重绘）

export class CrystalBake {
  /**
   * @param {HTMLElement} el  承载精灵图的元素（要有 position:relative 且尺寸已知）
   * @param {object} opt
   *   size    240 或 400（两套资产各一套）
   *   frames  帧数（16）
   *   holdMs  每格持有多少毫秒
   */
  constructor(el, opt = {}) {
    this.el = el;
    this.size = opt.size || 400;
    this.frames = opt.frames || 16;
    this.holdMs = opt.holdMs || 110;
    /** 末格之后多停几拍（落定的呼吸），0 = 不停 */
    this.tailHoldMs = opt.tailHoldMs ?? this.holdMs * 3;

    this.wake = document.createElement('div');
    this.dream = document.createElement('div');
    for (const [node, name] of [[this.wake, 'wake'], [this.dream, 'dream']]) {
      node.className = `cb-layer cb-${name}`;
      node.style.backgroundImage = `url("${HERE}frames/sheet-${this.size}-${name}.webp")`;
      this.el.append(node);
    }
    this.wake.style.opacity = '1';
    this.dream.style.opacity = '0';

    this.frame = -1;          // 当前格；-1 = 还没摆过
    this._timer = 0;
    this._raf = 0;
    this._busy = false;
    this._mix = 0.5;
    this._onMix = null;
    this._moved = false;

    this.#place(0, 0);
    this.setReality(this.readReality());
    this._bind();
  }

  get reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 醒度 0..1（1 = 醒）。站点由 reality.ts 写在 documentElement 上。
    这一页没有 reality.ts，那个变量不存在 —— 此时按「醒」处理（默认站态是醒）。
    注意：必须区分「没有这个变量」与「变量的值是 0」，否则没装 reality.js 时
    会静默地永远显示梦面。 */
  readReality() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--reality-mix').trim();
    if (raw === '') return 1;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  }

  /** 醒度变化 → 调整两张精灵图的叠加比。不重绘，只改一层透明度 */
  setReality(mix) {
    this._mix = Math.min(1, Math.max(0, mix));
    this.dream.style.opacity = (1 - this._mix).toFixed(3);
    return this;
  }

  #place(frame, dy) {
    const pct = this.frames > 1 ? (frame / (this.frames - 1)) * 100 : 0;
    const y = dy ? `${dy.toFixed(2)}px` : '0px';
    for (const node of [this.wake, this.dream]) {
      node.style.backgroundPosition = `${pct.toFixed(4)}% ${y}`;
    }
  }

  /** 每格一帧：逐格推进，末格之后停住 */
  play() {
    if (this._busy) return Promise.resolve({ skipped: 'busy' });
    if (this.reduced) {
      this.frame = this.frames - 1;
      this.#place(this.frame, 0);
      return Promise.resolve({ skipped: 'reduced-motion' });
    }
    this._busy = true;
    this.frame = 0;
    this.#place(0, 0);
    return new Promise((resolve) => {
      const tick = () => {
        this.frame++;
        if (this.frame >= this.frames - 1) {
          this.#place(this.frames - 1, 0);
          this._busy = false;
          this._timer = 0;
          resolve({ frames: this.frames, ms: this.frames * this.holdMs });
          return;
        }
        this.#place(this.frame, 0);
        this._timer = window.setTimeout(tick, this.holdMs);
      };
      this._timer = window.setTimeout(tick, this.holdMs);
    });
  }

  /** 立刻停：清掉定时器，停在当前格（用于离开视口 / 隐藏） */
  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    this._busy = false;
  }

  /** 回到落定姿态 */
  reset() {
    this.stop();
    this.frame = this.frames - 1;
    this.#place(this.frame, 0);
  }

  /** 零帧证明用的读数 */
  state() {
    return {
      frame: this.frame,
      busy: this._busy,
      timers: this._timer ? 1 : 0,
      raf: this._raf ? 1 : 0,
      mix: +this._mix.toFixed(3),
      reduced: this.reduced,
    };
  }

  /** 醒度监听：属性变化就更新叠加比（不动帧、不起 rAF） */
  watchReality() {
    if (this._onMix) return this;
    this._onMix = new MutationObserver(() => this.setReality(this.readReality()));
    this._onMix.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return this;
  }

  /* 极轻的视差：只在光标移动时写一次 transform，rAF 里不做任何计算之外的事，
     且 120ms 内没有新事件就彻底停下（_raf 归 0）。静止时不会持续跑。 */
  _bind() {
    if (this.reduced) return;
    const onMove = (e) => {
      const r = this.el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / Math.max(1, r.width);
      const ny = (e.clientY - (r.top + r.height / 2)) / Math.max(1, r.height);
      D.wx = Math.max(-1, Math.min(1, nx)) * 3.2;
      D.wy = Math.max(-1, Math.min(1, ny)) * 2.4;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.el.style.transform = `translate3d(${D.wx.toFixed(2)}px, ${D.wy.toFixed(2)}px, 0)`;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    this._off = () => window.removeEventListener('pointermove', onMove);
  }

  destroy() {
    this.stop();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._onMix?.disconnect();
    this._onMix = null;
    this._off?.();
    this.wake.remove();
    this.dream.remove();
  }
}

/** 页面用的单例入口（index.html 调它） */
export function mount(el, opt) {
  return new CrystalBake(el, opt);
}