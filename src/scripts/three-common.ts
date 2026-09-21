/* Three.js 轻量通用件：懒加载渲染器 + 可见性门控 + 帧率节流
   性能纪律（tech-stack-decision.md）：无后处理、DPR ≤ 1.5、
   微动效 30fps、prefers-reduced-motion 一律静帧。 */

import { reducedMotion } from './lib';

export interface LiteScene {
  canvas: HTMLCanvasElement;
  start(): void;
}

export function makeLoop(
  canvas: HTMLCanvasElement,
  frame: (t: number, dt: number) => void,
  opts: { fps?: number; preroll?: boolean } = {},
): LiteScene {
  const fps = opts.fps ?? 30;
  let raf = 0;
  let last = 0;
  let running = false;
  let stilled = false; // reduced-motion 下只静帧一次
  let lastFrameAt = 0;

  const renderFrame = (t: number) => {
    lastFrameAt = performance.now();
    frame(t, 0.016);
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / fps - 1) return;
    const dt = (now - last) / 1000;
    last = now;
    renderFrame(now / 1000);
  };

  const start = () => {
    if (running) return;
    if (reducedMotion()) {
      if (stilled) return;
      stilled = true;
      // 静帧：摆好姿势渲一帧即停
      renderFrame(2.5);
      return;
    }
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.isIntersecting ? start : stop)();
    },
    { rootMargin: '160px' },
  );
  io.observe(canvas);

  // 轮询兜底：IO 回调在渲染被节流的环境里可能迟迟不送达；
  // rAF 停转时（后台/遮挡窗口）也补一帧，保证画布不至于空白
  const near = () => {
    const r = canvas.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  setInterval(() => {
    if (!near()) {
      stop();
      return;
    }
    start();
    if (running && performance.now() - lastFrameAt > 600) {
      renderFrame(performance.now() / 1000);
    }
  }, 900);

  return { canvas, start };
}

export function liteDpr(canvas: HTMLCanvasElement, mobileCap = 1.25): number {
  const cap = canvas.clientWidth < 720 ? mobileCap : 1.5;
  return Math.min(devicePixelRatio || 1, cap);
}
