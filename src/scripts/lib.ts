/* 共享小工具：钳制 / 插值 / 颜色 / 滚动节流 / 动效偏好 */

export const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexLerp(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

/** rAF 节流的滚动 + 尺寸监听；另挂低频轮询兜底，
    覆盖 rAF 被节流/停转的环境（后台窗口、遮挡中的 webview）。
    轮询直接执行 cb（并把 queued 复位），不等 rAF——否则 rAF 卡死时门永远关着。
    但只在「有事件排着、400ms 还没被 rAF 消化」时才执行：原先静置时也每 ~0.7s 空跑一次 cb，
    而 cb 里的 getBoundingClientRect 会强制同步刷新样式 —— 每一次都把全站正在跑的动画
    （构块场 160 块等）拉到主线程重算一遍。被卡住的滚动事件恢复出帧后浏览器会补发，
    不会丢。 */
export function onScrollRaf(cb: () => void): () => void {
  let queued = false;
  let queuedAt = 0;
  const fire = () => {
    queued = false;
    cb();
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    queuedAt = performance.now();
    requestAnimationFrame(fire);
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  const poll = setInterval(() => {
    // rAF 超过 400ms 没消化掉排队事件，就直接执行
    if (queued && performance.now() - queuedAt > 400) fire();
  }, 350);
  queue();
  return () => {
    removeEventListener('scroll', queue);
    removeEventListener('resize', queue);
    clearInterval(poll);
  };
}

/** 共享的 ~30fps 帧钟（常驻的环境动效用：脑电、缝线锚点游走）。
    不用「每帧 rAF + 时间差早退」：只要请求了 rAF，浏览器每个 vsync 都要跑一整遍
    主线程帧（动画更新 + 样式重算），早退省不掉这一遍，而且会把全站本可只在合成器上跑的
    动画（构块场 160 块、漂移）逐帧拉回主线程重算。这里先等 24ms 再请求 rAF ——
    60Hz 下恰好落在第二个 vsync（≈33ms），主线程帧数减半；所有订阅者在同一帧里执行，
    不会各自错相、再多出帧。后台标签页里 setTimeout 被节流，自然停摆。 */
type FrameFn = (ts: number) => void;
const frameSubs = new Set<FrameFn>();
let frameTimer = 0;
let frameRaf = 0;

function runFrame(ts: number) {
  frameRaf = 0;
  for (const fn of frameSubs) fn(ts);
  scheduleFrame();
}

function scheduleFrame() {
  if (!frameSubs.size || frameTimer || frameRaf) return;
  frameTimer = window.setTimeout(() => {
    frameTimer = 0;
    frameRaf = requestAnimationFrame(runFrame);
  }, 24);
}

/** 订阅帧钟；返回退订函数（最后一个退订后帧钟停转，不留空转的定时器） */
export function onFrame30(fn: FrameFn): () => void {
  frameSubs.add(fn);
  scheduleFrame();
  return () => {
    frameSubs.delete(fn);
  };
}

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
