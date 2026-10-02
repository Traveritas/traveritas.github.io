/* ─────────────────────────────────────────────────────────────
   【原型】开屏 · 碎晶放射的驱动（见 components/chrome/LoaderProto.astro）。
   动画全在 CSS 里；这里只做三件事：
   · 等蒙版与纹理到位再起播（.go），免得晶片先以空形演一遍；
   · 在破窗那一刻打 html.booted（页面自己的浮现编排接着走）；
   · 收场后把整层拿掉。
   ───────────────────────────────────────────────────────────── */

const ASSETS = ['/textures/loader-shard.svg', '/textures/loader-window.svg', '/textures/resin.webp'];

/* [破窗（打 booted）, 完全收场]，相对 .go 的毫秒数，与 CSS 时间线对齐 */
const TIMING: Record<string, [number, number]> = {
  v1: [1450, 2350],
};

function preload(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
    img.decode?.().then(resolve, resolve);
  });
}

export function initLoaderProto() {
  const root = document.documentElement;
  if (!root.dataset.lp) return;

  document.querySelector('[data-lp-replay]')?.addEventListener('click', () => location.reload());

  const intro = root.dataset.lpIntro ?? '';
  const veil = document.querySelector<HTMLElement>('.lp-veil');
  const t = TIMING[intro];
  if (!t || !veil) {
    veil?.remove();
    root.classList.add('booted');
    return;
  }

  const cap = new Promise((r) => setTimeout(r, 800));
  Promise.race([Promise.all(ASSETS.map(preload)), cap]).then(() => {
    veil.classList.add('go');
    setTimeout(() => root.classList.add('booted'), t[0]);
    setTimeout(() => veil.remove(), t[1]);
  });
}
