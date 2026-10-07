/* ─────────────────────────────────────────────────────────────
   关于页 · 晶体页的两样陪衬（原型：design/mocks/nexus-stage/）
   · 切片列：构建时已按醒面画好（about-slices.ts）；梦里四维在转，每帧重画线框，换回醒面时停在醒面那一帧。
   · 水面：切面线下一片静水。晶体正下方一道碎光的光路往近处散开，另有几条极淡的长水纹，越近越疏。
     碎光一明一灭，醒时慢、梦里勤。
   外部输入挂在 .about-stage 的 decor 属性上（about-exit.ts 写 show：水面与切片已经显现多少；没有演出时恒为 1）。
   性能：共享 30fps 帧钟，醒面 15fps；舞台离屏 / 标签页隐藏 / show 为 0 时不画。减少动效：只画一帧。
   ───────────────────────────────────────────────────────────── */

import { onFrame30, reducedMotion } from './lib';
import { onMixChange, wakeMix } from './reality';
import { SLICES, slicePaths } from './about-slices';
import { smooth } from './cell24';

export interface DecorCtl {
  show: number;
}
export type DecorEl = HTMLElement & { decor?: DecorCtl };

/* 碎光与水纹的排布：一次定死（伪随机，每次进页面一样） */
let seed = 7;
const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const GLINTS = Array.from({ length: 260 }, () => ({
  v: Math.pow(R(), 1.6), // 0 地平线 → 1 近处
  u: (R() + R() + R() - 1.5) / 1.5, // 横向偏离光路中心（近似正态）
  ph: R() * 6.28,
  sp: 0.4 + R() * 1.4,
  l: 0.5 + R(),
}));
const RIPPLES = Array.from({ length: 7 }, (_, i) => ({
  v: Math.pow((i + 1 + R() * 0.6) / 8, 1.7),
  x0: 0.05 + R() * 0.35,
  x1: 0.6 + R() * 0.35,
  ph: R() * 6,
}));

export function initAboutDecor() {
  const stage = document.querySelector<DecorEl>('.about-stage');
  if (!stage) return;
  const ctl = (stage.decor ??= { show: 1 });
  const crystal = stage.querySelector<HTMLElement>('.about-crystal');
  const cv = stage.querySelector<HTMLCanvasElement>('.about-water');
  const ctx = cv?.getContext('2d') ?? null;
  const slices = [...stage.querySelectorAll<SVGSVGElement>('.about-slice')].map((el) => {
    const [back, front] = el.querySelectorAll('path');
    return { spec: SLICES[Number(el.dataset.k)], back, front };
  });

  let dream = 1 - wakeMix();
  let t = 0,
    last = 0,
    acc = 0,
    slicesAt = 0; // 切片上次按哪个梦度画的（0 ＝ 构建时的醒面，不必重画）

  function drawSlices(d: number) {
    for (const s of slices) {
      const p = slicePaths(s.spec, t, d);
      s.back.setAttribute('d', p.back);
      s.front.setAttribute('d', p.front);
    }
    slicesAt = d;
  }

  function drawWater(d: number) {
    if (!cv || !ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1),
      W = cv.clientWidth,
      H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const s = crystal?.offsetWidth ?? 380;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 水纹：细、长、淡，像天光落在纹路上
    for (const r of RIPPLES) {
      const y = 8 + r.v * (H - 8) + Math.sin(t * 0.5 + r.ph) * 0.6 * (1 + 2 * d);
      const g = ctx.createLinearGradient(W * r.x0, 0, W * r.x1, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${(0.26 - r.v * 0.12).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(W * r.x0, y, W * (r.x1 - r.x0), 1 + r.v);
    }
    // 光路：越近越散、越长
    ctx.globalCompositeOperation = 'lighter';
    for (const g of GLINTS) {
      const tw = 0.5 + 0.5 * Math.sin(t * g.sp * (0.35 + 1.4 * d) + g.ph);
      const a = tw * tw * (0.95 - 0.5 * g.v) * (1 - Math.abs(g.u) * 0.55);
      if (a < 0.01) continue;
      const y = 6 + g.v * (H - 20);
      const x = W / 2 + g.u * s * (0.12 + 0.9 * g.v);
      const L = (3 + 14 * g.v) * g.l;
      ctx.fillStyle = `rgba(255,252,250,${a.toFixed(3)})`;
      ctx.fillRect(x - L / 2, y, L, 1 + g.v);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function render() {
    const d = smooth(dream);
    drawWater(d);
    // 梦里每帧重画；回到醒面时补画一次醒面，之后不再动
    if (d > 0.002 || slicesAt > 0) drawSlices(d);
  }

  const still = reducedMotion();
  let stop: (() => void) | null = null,
    onscreen = false;

  function frame(ts: number) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 30;
    last = ts;
    const target = 1 - wakeMix();
    dream += Math.sign(target - dream) * Math.min(Math.abs(target - dream), dt / 1.2);
    t += dt;
    acc += dt;
    if (ctl.show <= 0) return;
    if (dream < 0.02 && slicesAt === 0 && acc < 1 / 15 - 0.004) return; // 醒面 15fps 足够
    acc = 0;
    render();
  }
  function sync() {
    const run = onscreen && !document.hidden && !still;
    if (run && !stop) {
      last = 0;
      stop = onFrame30(frame);
    } else if (!run && stop) {
      stop();
      stop = null;
    }
  }
  new IntersectionObserver((es) => {
    onscreen = es[0].isIntersecting;
    sync();
  }).observe(stage);
  document.addEventListener('visibilitychange', sync);

  // 等一帧：醒度要等 BaseLayout 的 initReality 从会话里恢复
  requestAnimationFrame(() => {
    dream = 1 - wakeMix();
    t = 12; // 碎光从一个明暗错落的时刻开始，不要全体同时亮起
    render();
    if (still) addEventListener('resize', render);
  });
  // 减少动效：不闪不转，只在醒度变化时直接画到位
  if (still)
    onMixChange(() => {
      dream = 1 - wakeMix();
      render();
    });
}
