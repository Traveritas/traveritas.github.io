/* ─────────────────────────────────────────────────────────────
   脑电波的离屏绘制（Eeg.astro 把 <canvas> 的控制权交到这里）。
   为什么搬进 Worker：波形每帧都在变，主线程上无论写 SVG 的 d 还是画 canvas，
   每一帧都要跑一遍主线程渲染（动画更新 + 样式重算 + 分层提交），并把全站本可只在
   合成器上跑的动画（构块场 160 块、漂移）一起逐帧拉回主线程重算 —— 低端机上这就是
   常驻的卡顿。OffscreenCanvas 从 Worker 直接提交给合成器，不经过主线程。
   路径与 SVG 回退端同源（eeg-wave.ts，Path2D 直接描同一串），样式照抄 Eeg.astro 的 CSS。
   ───────────────────────────────────────────────────────────── */

import { createEegWave, EEG_ECHO_COUNT } from './eeg-wave';

interface Colors {
  umber: string;
  amber: string;
  wake: string;
  dream: string;
}

type Msg =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      W: number;
      H: number;
      dpr: number;
      beat: number;
      d: number;
      colors: Colors;
      still: boolean;
    }
  | { type: 'size'; W: number; H: number; dpr: number }
  | { type: 'mix'; d: number; colors: Colors }
  | { type: 'hidden'; hidden: boolean };

/* 与 Eeg.astro 里 .eeg-main / .eeg-echo-* 的 CSS 逐项对应（SVG 回退端仍读 CSS） */
const MAIN_STYLE = { width: 1.2, op: 0.62, color: 'umber' as const };
const ECHO_STYLE = [
  { width: 1.15, op: 0.34, color: 'amber' as const, dash: [] as number[] },
  { width: 1.05, op: 0.26, color: 'wake' as const, dash: [] as number[] },
  { width: 0.95, op: 0.19, color: 'dream' as const, dash: [5, 7] },
];

let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
let wave: ReturnType<typeof createEegWave>;
let W = 0;
let H = 0;
let dpr = 1;
let d = 0;
let colors: Colors;
let still = false; // 减动效：只画静帧，不起循环
let hidden = false;
let echoesOn = false;
let lastDraw = 0;
let ph = 0;
let mainPath: Path2D | null = null;
const echoPaths: (Path2D | null)[] = Array.from({ length: EEG_ECHO_COUNT }, () => null);

function paint() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 视口坐标 → 设备像素；再绕视口中心转 14°（＝ SVG 里 <g transform="rotate(14 cx cy)">）
  const cx = W / 2;
  const cy = H * 0.5;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cx, cy);
  ctx.rotate((14 * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.miterLimit = 4; // SVG 的默认值（canvas 默认 10）
  // 残影在前、主波压在最上（＝ SVG 里的文档顺序）
  if (echoesOn) {
    for (let i = 0; i < ECHO_STYLE.length; i++) {
      const p = echoPaths[i];
      if (!p) continue;
      const st = ECHO_STYLE[i];
      ctx.globalAlpha = st.op * d; // ＝ opacity: calc(var(--echo-op) * var(--still))
      ctx.strokeStyle = colors[st.color];
      ctx.lineWidth = st.width;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.setLineDash(st.dash);
      ctx.stroke(p);
    }
  }
  if (mainPath) {
    ctx.globalAlpha = MAIN_STYLE.op;
    ctx.strokeStyle = colors[MAIN_STYLE.color];
    ctx.lineWidth = MAIN_STYLE.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.stroke(mainPath);
  }
}

/** 推进到秒针 t；force ＝ 路径没变也重画（换色 / 换尺寸之后） */
function render(t: number, force = false) {
  ph = t;
  lastDraw = performance.now();
  const f = wave.step(ph, d, W, H);
  if (f) {
    if (f.main) mainPath = new Path2D(f.main);
    f.echoes.forEach((s, i) => {
      if (s) echoPaths[i] = new Path2D(s);
    });
    echoesOn = f.echoesOn;
  } else if (!force) return;
  paint();
}

function resize(w: number, h: number, r: number) {
  W = w;
  H = h;
  dpr = r;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}

/* 帧钟：24ms 后再等一个 rAF ⇒ 60Hz 下约 30fps（与主线程那条 onFrame30 同一节拍）。
   Worker 里没有 rAF 的环境退回纯定时器 */
const hasRaf = typeof self.requestAnimationFrame === 'function';
function schedule() {
  setTimeout(() => {
    if (hasRaf) self.requestAnimationFrame(tick);
    else tick(performance.now());
  }, 24);
}
function tick(ts: number) {
  if (!hidden) render(ts / 1000);
  schedule();
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    canvas = m.canvas;
    const c = canvas.getContext('2d');
    if (!c || typeof Path2D !== 'function') {
      self.postMessage({ type: 'fail' });
      return;
    }
    ctx = c;
    wave = createEegWave(m.beat);
    d = m.d;
    colors = m.colors;
    still = m.still;
    resize(m.W, m.H, m.dpr);
    render(0, true);
    self.postMessage({ type: 'ready' });
    if (still) return;
    schedule();
    // rAF 被节流/停转的环境里由低频定时器兜底补帧（同原先主线程版）
    setInterval(() => {
      if (!hidden && performance.now() - lastDraw > 500) render(performance.now() / 1000);
    }, 400);
    return;
  }
  if (!ctx) return;
  if (m.type === 'size') {
    resize(m.W, m.H, m.dpr);
    render(ph, true);
  } else if (m.type === 'mix') {
    d = m.d;
    colors = m.colors;
    render(ph, true);
  } else if (m.type === 'hidden') {
    hidden = m.hidden;
  }
};
