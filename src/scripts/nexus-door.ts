/* ─────────────────────────────────────────────────────────────
   关于页 · 通往 NEXUS 的门（晶体与 NEXUS 字是同一个链接 .about-crystal）
   · 悬停 / 聚焦：晶体缓缓停转（nexus-slice.ts 的 hover），字由淡转实（CSS）；顺手预取 NEXUS。
   · 点下去：约一秒的「穿入切面」—— 画布铺满整屏，镜头推进晶体（nexus-slice.ts 的 enter），
     光核漫开；同时一层白从晶体身后向外铺满（白在画布之下：晶体压在白上继续变大），
     最后晶体自己也化进白里（着色器的 uEnter），白透之后跳转。
     与 NEXUS 那边「走进晶体：整屏解析到底、化白」是同一道接缝：两边在白里交接。
     链接带 ?from=blog，留给 NEXUS 将来做到达的开场（现在那边不认，照常进家）。
   · 减少动效 / 画布没起来（静帧图）：只淡到白再跳。
   · 修饰键或中键点开新标签：不拦，照常走链接。
   · 从 NEXUS 后退回来（bfcache 恢复）：复位，不留一屏白。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';
import type { NexusEl } from './nexus-slice';

/* 节奏：一处改 */
const DUR = 1300; // 推进 + 化白（ms）
const VEIL = [0.3, 0.9] as const; // 白从晶体身后向外铺开的区间（占 DUR 的比例）
const HOLD = 140; // 白透之后再停一拍才跳
const FADE = 380; // 减动效 / 无画布时的淡白
const WHITE = '#fff';

export function initNexusDoor() {
  const found = document.querySelector<HTMLAnchorElement>('a.about-crystal');
  if (!found) return;
  const door: HTMLAnchorElement = found;
  const crystal = door.querySelector<NexusEl>('.nexus-slice');
  const ctl = crystal ? (crystal.nexus ??= { grow: 1, line: 0 }) : null;

  let prefetched = false;
  const prefetch = () => {
    if (prefetched) return;
    prefetched = true;
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = door.href;
    document.head.append(l);
  };
  const hover = (on: boolean) => {
    if (on) prefetch();
    if (ctl) ctl.hover = on ? 1 : 0;
  };
  door.addEventListener('pointerenter', () => hover(true));
  door.addEventListener('pointerleave', () => hover(false));
  door.addEventListener('focus', () => hover(true));
  door.addEventListener('blur', () => hover(false));

  let veil: HTMLElement | null = null;
  let raf = 0;
  let going = false;
  const block = (e: Event) => e.preventDefault();

  function reset() {
    cancelAnimationFrame(raf);
    going = false;
    veil?.remove();
    veil = null;
    removeEventListener('wheel', block);
    removeEventListener('touchmove', block);
    if (ctl) {
      ctl.enter = 0;
      ctl.hover = 0;
      ctl.draw?.();
    }
  }

  function go(href: string) {
    going = true;
    addEventListener('wheel', block, { passive: false });
    addEventListener('touchmove', block, { passive: false });
    veil = document.createElement('div');
    // 白在铺满整屏的画布（z 1000）之下；简版没有画布，一样盖住全页
    veil.style.cssText = `position:fixed;inset:0;z-index:999;pointer-events:none;background:${WHITE}`;
    document.body.append(veil);

    const leave = () => setTimeout(() => location.assign(href), HOLD);
    const t0 = performance.now();

    // 简版：只淡到白
    if (reducedMotion() || !ctl?.draw) {
      veil.style.opacity = '0';
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / FADE);
        veil!.style.opacity = k.toFixed(3);
        if (k < 1) raf = requestAnimationFrame(step);
        else leave();
      };
      raf = requestAnimationFrame(step);
      return;
    }

    // 白从晶体中心铺开：遮罩圆的半径从 0 长到盖住最远的屏角
    const r = door.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    const soft = Math.max(innerWidth, innerHeight) * 0.35;
    const mask = (rad: number) => {
      const m = `radial-gradient(circle at ${cx}px ${cy}px, #000 ${rad.toFixed(1)}px, transparent ${(rad + soft).toFixed(1)}px)`;
      veil!.style.maskImage = m;
    };
    mask(-soft);

    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DUR);
      ctl.enter = k;
      ctl.draw?.();
      const v = Math.min(1, Math.max(0, (k - VEIL[0]) / (VEIL[1] - VEIL[0])));
      const e = v * v * (3 - 2 * v);
      mask(-soft + e * (far + soft));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        veil!.style.maskImage = 'none';
        leave();
      }
    };
    raf = requestAnimationFrame(step);
  }

  door.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    if (!going) go(door.href);
  });

  addEventListener('pageshow', (e) => {
    if (e.persisted) reset();
  });
}
