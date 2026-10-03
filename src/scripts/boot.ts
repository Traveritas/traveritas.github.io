/* ─────────────────────────────────────────────────────────────
   开屏 · 碎晶放射（动画全在 BootVeil.astro 的 CSS 里）
   · 主页每次进入都放；其余页面只在会话首访放：BootVeil 的内联脚本在首帧前读 xm-boot-seen，
     看过的会话 / 减弱动效 / 站内 View Transition 进来的页面打 data-boot-skip，面纱不出现。
   · 这里只做三件事：等蒙版与纹理到位、页面头几帧的排版与光栅化忙完再起播（.go，最多等 1.2s），
     在破窗那一刻打 html.booted（页面自己的浮现编排接着走），收场后把整层拿掉。
   · 为什么等页面「静下来」：首访时页面头一回排版、光栅化、起 WebGL 会连着占住主线程与 GPU
     两三百毫秒，开屏若此刻起播，迸出那一下正好被吞掉。素幕本是一整块纯色，多垫这一会儿看不出来。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';

const KEY = 'xm-boot-seen';
const ASSETS = ['/textures/loader-shard.svg', '/textures/loader-window.svg', '/textures/resin.webp'];

/* 相对 .go 的毫秒数，与 BootVeil 的 CSS 时间线对齐 */
const T_OPEN = 1450; // 破窗：打 booted
const T_END = 2350; // 完全收场：移除面纱

/* 连着几帧都准点出来，才算页面头几轮的重活忙完了 */
function settle() {
  return new Promise<void>((resolve) => {
    let last = 0;
    let calm = 0;
    const tick = (t: number) => {
      calm = last && t - last < 24 ? calm + 1 : 0;
      last = t;
      if (calm >= 3) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
    img.decode?.().then(resolve, resolve);
  });
}

export function initBoot() {
  const veil = document.getElementById('bootveil');
  const root = document.documentElement;
  const markSeen = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* 隐私模式下静默 */
    }
  };

  if (!veil || 'bootSkip' in root.dataset || reducedMotion()) {
    veil?.remove();
    root.classList.add('booted');
    markSeen();
    return;
  }

  const fonts = document.fonts?.ready.catch(() => {});
  const ready = Promise.all([...ASSETS.map(preload), fonts]).then(settle);
  const cap = new Promise((r) => setTimeout(r, 1200));
  Promise.race([ready, cap]).then(() => {
    veil.classList.add('go');
    setTimeout(() => {
      root.classList.add('booted');
      markSeen();
    }, T_OPEN);
    setTimeout(() => veil.remove(), T_END);
  });
}
