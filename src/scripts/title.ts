/* ─────────────────────────────────────────────────────────────
   标签页标题管理（醒/梦双态 + 页面可见性悬停）
   · 醒/梦双态联动：
     - 醒态：呈现醒面标题（如「随笔 — Traveritas」或「Traveritas的个人网站」）
     - 梦态：呈现梦面标题（如「断章 — AveritA」或「AveritA的昼梦叙集」）
     随 reality.ts 入梦检验（空白长按）双向切换。
   · 页面可见性（切换/离开标签页）：
     - 当切出当前标签页（document.hidden 为 true）时：
       醒态：呈现「世界在此处悬停 — Traveritas」
       梦态：呈现「在边缘处留白 — AveritA」
     - 当切回本站时即刻无缝恢复当前现实状态对应的页面标题。
   · 无 JS / SSR 爬虫：静态呈现醒面标题，保证 SEO 与可访问性。
   ───────────────────────────────────────────────────────────── */

import { onRealityChange, type Reality } from './reality';

const DEFAULT_AWAY: Record<Reality, string> = {
  wake: '世界在此处悬停 — Traveritas',
  dream: '在边缘处留白 — AveritA',
};

export function initTitle(): void {
  if (typeof document === 'undefined') return;

  const titleEl = document.querySelector('title');
  if (!titleEl) return;

  const wakeTitle = titleEl.dataset.wake || document.title;
  const dreamTitle = titleEl.dataset.dream || wakeTitle;
  const awayWake = titleEl.dataset.awayWake || DEFAULT_AWAY.wake;
  const awayDream = titleEl.dataset.awayDream || DEFAULT_AWAY.dream;

  let currentReality: Reality = 'wake';

  function updateTitle(): void {
    if (document.hidden) {
      document.title = currentReality === 'dream' ? awayDream : awayWake;
    } else {
      document.title = currentReality === 'dream' ? dreamTitle : wakeTitle;
    }
  }

  // 监听入梦检验现实状态变更（醒 ↔ 梦）
  onRealityChange((r) => {
    currentReality = r;
    updateTitle();
  });

  // 监听浏览器标签页切换可见性（切走 / 切回）
  document.addEventListener('visibilitychange', updateTitle);
}
