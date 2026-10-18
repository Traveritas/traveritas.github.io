/* ─────────────────────────────────────────────────────────────
   NEXUS 的入口（/gate/）· 进场
   关于页退场演出的后半段（线已经是平的切面线）搬到这里、改成按时间走：进门约三秒——
     切面线从中心划开 → 线下水面亮起碎光 → 晶体从一个点长出来（nexus-slice.ts 的 grow）
     → 线上的切片由内向外显现 → NEXUS 字亮起，门才开（之前不能点、不能被 Tab 到）。
   值写在消费元素自己身上（同 about-exit 的做法）：.about-stage 的 --water / --grow / --line、
   .about-crystal 的 opacity 与 inert、各 .about-slice 与 .about-tag 的 opacity、stage.decor.show。
   无脚本 / 减动效：html 上没有 g-arrive，舞台就是静止的终态（gate.astro 的默认排法）。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';
import type { NexusEl } from './nexus-slice';
import type { DecorEl } from './about-decor';

/* 时间轴（ms）：一处改节奏 */
const T = {
  line: [0, 1100],
  water: [500, 1900],
  grow: [800, 2500],
  slices: [1700, 3000],
  tag: [2700, 3300],
} as const;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => x * x * (3 - 2 * x);
const seg = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a), 0, 1);

export function initGateArrive() {
  const root = document.documentElement;
  const stage = document.querySelector<DecorEl>('.about-stage');
  // 切面线也画进晶体看到的环境里（透过晶体是被折弯、错位的那一段）：入口页上它一直在
  const still = stage?.querySelector<NexusEl>('.nexus-slice');
  if (still) (still.nexus ??= { grow: 1, line: 1 }).line = 1;
  if (!stage || reducedMotion() || !root.classList.contains('g-arrive')) {
    root.classList.remove('g-arrive');
    return;
  }
  const slices = [...stage.querySelectorAll<SVGSVGElement>('.about-slice')];
  const decor = (stage.decor ??= { show: 1 });
  const tag = stage.querySelector<HTMLElement>('.about-tag');
  const crystal = stage.querySelector<NexusEl>('.nexus-slice');
  const box = stage.querySelector<HTMLElement>('.about-crystal');
  const ctl = crystal ? (crystal.nexus ??= { grow: 1, line: 1 }) : null;
  if (ctl) ctl.grow = 0;
  if (box) box.inert = true;

  let t0 = 0;
  function frame(now: number) {
    if (!t0) t0 = now;
    const t = now - t0;
    stage!.style.setProperty('--line', smooth(seg(t, T.line)).toFixed(3));
    const wv = smooth(seg(t, T.water));
    stage!.style.setProperty('--water', wv.toFixed(3));
    decor.show = Math.max(wv, seg(t, T.slices));
    const g = seg(t, T.grow);
    if (ctl) ctl.grow = g;
    stage!.style.setProperty('--grow', smooth(g).toFixed(3));
    if (box) box.style.opacity = g > 0 ? '1' : '0';
    const [k0, k1] = T.slices;
    for (const el of slices) {
      const i = Number(el.dataset.i ?? 0);
      const a = k0 + (i / 4) * (k1 - k0 - 400);
      el.style.opacity = smooth(clamp((t - a) / 400, 0, 1)).toFixed(3);
    }
    if (tag) tag.style.opacity = smooth(seg(t, T.tag)).toFixed(3);
    if (t < T.tag[0]) requestAnimationFrame(frame);
    else {
      if (box) box.inert = false;
      if (t < T.tag[1]) requestAnimationFrame(frame);
    }
  }
  // 等开屏面纱揭开再开始（没有面纱 / 已看过则立即）
  const go = () => requestAnimationFrame(frame);
  if (root.classList.contains('booted')) go();
  else {
    const s = performance.now();
    const wait = () => (root.classList.contains('booted') || performance.now() - s > 3200 ? go() : setTimeout(wait, 80));
    wait();
  }
}
