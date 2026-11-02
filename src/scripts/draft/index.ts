/* ─────────────────────────────────────────────────────────────
   /draft/ 的启动：把两套材料接上真实的内容与真实的栏。

   做四件事：
     1. 等片空间的栏头落定，按它量出三栏（layout.ts），把卡片摆上去；
     2. 卡片点开 → 阅读面板（sheet.ts），Esc / — 收起，焦点回卡；
     3. 把 wander 的键盘手势挡在门外（V 换视图 / 1 2 3 换场景 / 方向键走窗）——
        这一页那片空间只当背景，方向键要留给页面自己滚；
     4. 窗口变了重排一次；窄屏把整页交回正常流。

   片空间自己（#w-stage）的卡片层由页面里的内联脚本藏掉（visibility: hidden），
   这里不动它：背景的流光、栏头、导航、左下星、Ave 都照旧。
   ───────────────────────────────────────────────────────────── */

import { measure, settledHeads, type DraftLayout } from './layout';
import { createSheet, type SheetData, type Variant } from './sheet';

export interface DraftItem extends SheetData {
  key: string;
  desc: string;
  show: string;
  date: string;
  right: string;
  tagsText: string;
  img: { src: string; w: number; h: number; alt: string } | null;
}

type Payload = Record<string, DraftItem[]>;

function parseData(el: HTMLElement): DraftItem[] {
  try {
    const raw = JSON.parse(el.textContent || '');
    const out: DraftItem[] = [];
    for (const list of Object.values(raw as Payload)) if (Array.isArray(list)) out.push(...list);
    return out;
  } catch {
    return [];
  }
}

export function initDraft(): void {
  const root = document.documentElement;
  const board = document.getElementById('d-board');
  const sheetEl = document.getElementById('d-sheet');
  const dataEl = document.getElementById('d-data');
  if (!board || !sheetEl || !dataEl) return;

  const items = parseData(dataEl);
  const data: Record<string, SheetData> = {};
  for (const it of items) data[it.key] = it;

  const variant: Variant = root.dataset.dv === 'value' ? 'value' : 'halftone';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lay: DraftLayout | null = null;

  const sheet = createSheet({
    el: sheetEl,
    board,
    variant,
    data,
    target: () => lay?.sheet ?? { left: 26, top: 112, width: 720, height: 600 },
    mode: () => lay?.mode ?? 'wide',
    reduced,
  });

  /* ── 版：量一次，摆一次 ── */
  let queued = 0;
  let first = true;

  async function relayout(): Promise<void> {
    queued = 0;
    const heads = await settledHeads(first ? 7000 : 2500);
    first = false;
    /* 栏头一直没被摆过（那片空间没起来）：不按 (0,0) 去排，退回正常流的名录 */
    if (!heads) {
      root.classList.add('d-on');
      return;
    }
    lay = measure({ board: board as HTMLElement, sheet: sheetEl as HTMLElement }, heads);
    root.classList.add('d-on');
  }

  function queue(delay = 140): void {
    if (queued) clearTimeout(queued);
    queued = window.setTimeout(() => {
      void relayout();
    }, delay);
  }

  /* ── 卡片：点开 ── */
  const cards = Array.from(board.querySelectorAll<HTMLElement>('.d-card'));
  for (const card of cards) {
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (!card.hidden) void sheet.open(card);
    });
    /* 键盘：Enter / Space 和鼠标是同一件事（原生对 <button> 也会给一次 click，
       这里显式接一次再 preventDefault，免得开两回、也免得 Space 把页面滚一下） */
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (!card.hidden) void sheet.open(card);
    });
  }

  /* ── 键盘 ──
     • Esc 收面板；Tab 记「这是键盘进来的」（乙的四角裁切标记只认它）；
     • wander 的手势键（V / 1 2 3 / 方向键 / ±）一律不往上传：
       它们会把背景切到漫游、把方向键从页面滚动里抢走。 */
  const WANDER_KEYS = new Set(['v', 'V', '1', '2', '3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '=']);

  addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') {
        root.dataset.dkb = '1';
        for (const c of cards) c.classList.remove('quiet');
        if (sheet.isOpen()) {
          trapTab(e);
          return;
        }
      }
      if (e.key === 'Escape' && sheet.isOpen()) {
        e.preventDefault();
        e.stopPropagation();
        void sheet.close();
        return;
      }
      if (WANDER_KEYS.has(e.key)) e.stopPropagation();
    },
    true,
  );

  /* 面板里只有这一处纸：Tab 在它自己的可停项之间转 */
  function trapTab(e: KeyboardEvent): void {
    const focusables = Array.from(
      sheetEl!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    ).filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const at = focusables.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
    e.preventDefault();
    focusables[next].focus({ preventScroll: true });
  }

  addEventListener('pointerdown', () => {
    root.dataset.dkb = '0';
  }, true);

  /* 收起后鼠标一动，悬停立刻恢复（乙：别让一张自己亮起来的卡抢掉「收」这个动作） */
  addEventListener(
    'pointermove',
    () => {
      if ('dhold' in root.dataset) delete root.dataset.dhold;
    },
    { passive: true },
  );

  /* ── 尺寸变了：重摆；窄屏收起正在读的那块 ── */
  addEventListener('resize', () => queue(160));

  /* 字体到位后行高会变，窄屏的栏高跟着变：再量一次 */
  if (document.fonts?.ready) void document.fonts.ready.then(() => queue(60));

  /* 第一版量到之后再看一眼：片空间的窗在入场动画里缩着，栏宽头一回可能量小了 */
  window.setTimeout(() => queue(0), 1400);

  /* 起不来也不能把内容一直扣着 */
  window.setTimeout(() => {
    if (!root.classList.contains('d-on')) root.classList.add('d-on');
  }, 7000);

  queue(0);
}
