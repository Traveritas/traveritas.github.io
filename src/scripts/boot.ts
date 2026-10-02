/* ─────────────────────────────────────────────────────────────
   开屏 · 碎晶放射（动画全在 BootVeil.astro 的 CSS 里）
   · 主页每次进入都放；其余页面只在会话首访放：BootVeil 的内联脚本在首帧前读 xm-boot-seen，
     看过的会话 / 减弱动效 / 站内 View Transition 进来的页面打 data-boot-skip，面纱不出现。
   · 这里只做三件事：等蒙版与纹理到位再起播（.go，最多等 800ms），
     在破窗那一刻打 html.booted（页面自己的浮现编排接着走），收场后把整层拿掉。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';

const KEY = 'xm-boot-seen';
const ASSETS = ['/textures/loader-shard.svg', '/textures/loader-window.svg', '/textures/resin.webp'];

/* 相对 .go 的毫秒数，与 BootVeil 的 CSS 时间线对齐 */
const T_OPEN = 1450; // 破窗：打 booted
const T_END = 2350; // 完全收场：移除面纱

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

  const cap = new Promise((r) => setTimeout(r, 800));
  Promise.race([Promise.all(ASSETS.map(preload)), cap]).then(() => {
    veil.classList.add('go');
    setTimeout(() => {
      root.classList.add('booted');
      markSeen();
    }, T_OPEN);
    setTimeout(() => veil.remove(), T_END);
  });
}
