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
    轮询直接执行 cb，不经 queued 门——否则 rAF 卡死时门永远关着。 */
export function onScrollRaf(cb: () => void): () => void {
  let queued = false;
  let lastRun = 0;
  const fire = () => {
    queued = false;
    lastRun = performance.now();
    cb();
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fire);
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  const poll = setInterval(() => {
    // rAF 超过 400ms 没消化掉排队事件，就直接执行
    if (performance.now() - lastRun > 400) {
      queued = false;
      fire();
    }
  }, 350);
  queue();
  return () => {
    removeEventListener('scroll', queue);
    removeEventListener('resize', queue);
    clearInterval(poll);
  };
}

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
