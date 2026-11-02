/* ─────────────────────────────────────────────────────────────
   版：三栏从哪来，卡片放哪里。

   这里没有一处写死的 x / y。全部从两样东西量出来：
     · [data-w-head]（随笔 / 瞬间 / 项目三个栏头）此刻的 getBoundingClientRect()——
       栏头的左沿就是那一栏在这一高度上的左沿，栏头的底就是这一栏开始的地方；
     · 站上的 --seam-angle（tokens.css 的 14°）——整片空间的三栏是顺着这条缝斜下去的，
       栏越低越往左，所以每张卡的左沿要按它自己的锚点往里退。

   三栏贴缝的方式沿用片空间自己的做法（各栏对齐的那条边不一样）：
     随笔  贴在缝 1 的左边 → 以卡片的**底边**对齐栏沿线（底右角不越过缝）
     瞬间  两条缝中间       → 以卡片的**中线**对齐
     项目  贴在缝 2 的右边 → 以卡片的**顶边**对齐（顶左角不越过缝）

   栏宽取片空间里同一栏那几扇窗此刻的实宽（off 宽度 × 变换里的缩放，取中位），
   读不到时退回按视口推的一档。

   窄屏（三个栏头不在一行上）另走一条路：整页正常流、上下滚，栏头用 CSS translate
   单独抬到各自那一栏的顶上（不动 wander.js 写的 transform），滚动时整层跟着上走。
   ───────────────────────────────────────────────────────────── */

export type Scene = 'essay' | 'moment' | 'project';
export type Mode = 'wide' | 'stacked';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CardBox {
  el: HTMLElement;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ColumnBox {
  scene: Scene;
  head: Rect;
  cards: CardBox[];
}

export interface DraftLayout {
  mode: Mode;
  tan: number;
  heads: Rect[];
  columns: ColumnBox[];
  sheet: Rect;
}

const SCENES: readonly Scene[] = ['essay', 'moment', 'project'];
/* 栏头底 → 第一张卡；卡与卡之间；右边留出的边；底部留出的边 */
const HEAD_GAP = 30;
const ROW_GAP = 34;
const EDGE = 26;
const BOTTOM = 40;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function seamTan(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--seam-angle').trim();
  const m = /^(-?[\d.]+)deg$/.exec(raw);
  // 读不到令牌时按站上那条缝的 14° 兜底（这是退路，不是坐标）
  return Math.abs(Math.tan(((m ? parseFloat(m[1]) : 14) * Math.PI) / 180));
}

function rectOf(el: Element): Rect {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}

function headEls(): (HTMLElement | null)[] {
  return SCENES.map((s) => document.querySelector<HTMLElement>(`[data-w-head="${s}"]`));
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(end);
    setTimeout(end, 90);
  });
}

/* 栏头是 wander 每帧摆的：等它连续几帧不动了，量到的才是「已经落定」的那一版。
   注意「被摆过」和「还没被摆」长得几乎一样：没起脚本时三个栏头也稳稳地待在 (0,0)。
   所以先认 wander 写在栏头上的 transform——它一出现，位置才算真的。 */
async function settledHeads(maxMs = 6000): Promise<Rect[] | null> {
  const t0 = performance.now();
  let prev: Rect[] | null = null;
  let calm = 0;
  let placed = false;
  while (performance.now() - t0 < maxMs) {
    await frame();
    const els = headEls();
    if (els.some((e) => !e)) return null;
    const rs = els.map((e) => rectOf(e as HTMLElement));
    if (rs.some((r) => r.width < 2)) {
      prev = null;
      calm = 0;
      continue;
    }
    if (!placed) {
      placed = els.every((e) => (e as HTMLElement).style.transform !== '');
      if (!placed) continue;
    }
    const still = prev && rs.every((r, i) => Math.abs(r.left - prev![i].left) < 0.5 && Math.abs(r.top - prev![i].top) < 0.5);
    calm = still ? calm + 1 : 0;
    prev = rs;
    if (calm >= 3) return rs;
  }
  /* 一直没被摆过：说明那片空间没起来。返回 null，让调用方退回正常流，别按 (0,0) 去排 */
  return placed ? prev : null;
}

/* 栏宽：片空间里这一栏的窗，实宽 = 窗自己的宽度 × 变换里的缩放。
   取缩放的中位（悬停那一扇会多 2.5%，飞行中的那几扇会少几个点），再乘这一栏最宽的那一扇。 */
function columnWidth(scene: Scene): number {
  const stage = document.getElementById('w-stage');
  if (!stage) return 0;
  const els = Array.from(stage.querySelectorAll<HTMLElement>(`.w-space[data-wscene="${scene}"] .w-card`));
  const scales: number[] = [];
  let raw = 0;
  for (const el of els) {
    const own = el.offsetWidth;
    if (!own) continue;
    const w = el.getBoundingClientRect().width;
    if (w < 40) continue;
    scales.push(w / own);
    raw = Math.max(raw, own);
  }
  if (!scales.length || !raw) return 0;
  scales.sort((a, b) => a - b);
  const mid = scales[Math.floor(scales.length / 2)];
  return Math.round(raw * mid);
}

function fallbackWidth(vw: number): number {
  return Math.round(clamp(vw * 0.26, 220, 380));
}

export function headColumn(scene: Scene): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.d-col[data-d-col="${scene}"]`);
}

export function cardsOf(scene: Scene): HTMLElement[] {
  const col = headColumn(scene);
  return col ? Array.from(col.querySelectorAll<HTMLElement>('.d-card')) : [];
}

export interface LayoutDeps {
  board: HTMLElement;
  sheet: HTMLElement;
}

/* 窄屏：整页滚动时把栏头那一层一起带走（栏头是 fixed 的） */
let followBound = false;
function bindFollow(): void {
  if (followBound) return;
  followBound = true;
  addEventListener(
    'scroll',
    () => {
      const root = document.documentElement;
      if (!root.classList.contains('d-stacked')) return;
      const heads = document.getElementById('w-heads');
      if (heads) heads.style.transform = `translate3d(0, ${-Math.round(scrollY)}px, 0)`;
    },
    { passive: true },
  );
}

function resetHeads(): void {
  for (const el of headEls()) if (el) el.style.translate = '';
  const heads = document.getElementById('w-heads');
  if (heads) heads.style.transform = '';
}

/* 窄屏：把三个栏头挪到各自那一栏的顶上（translate 是独立属性，和 wander 写的 transform 相加） */
function nudgeHeads(rs: Rect[], tops: number[]): void {
  const els = headEls();
  els.forEach((el, i) => {
    if (!el) return;
    const target = tops[i] - 22 - rs[i].height;
    el.style.translate = `0 ${Math.round(target - rs[i].top)}px`;
  });
  const heads = document.getElementById('w-heads');
  if (heads) heads.style.transform = `translate3d(0, ${-Math.round(scrollY)}px, 0)`;
}

export function measure(deps: LayoutDeps, given?: Rect[] | null): DraftLayout {
  const root = document.documentElement;
  const sheet = deps.sheet;
  const rs = given ?? headEls().map((e) => (e ? rectOf(e) : { left: 0, top: 0, width: 0, height: 0 }));
  const tan = seamTan();
  const mode: Mode = Math.abs(rs[1].top - rs[0].top) > 8 ? 'stacked' : 'wide';

  root.classList.toggle('d-wide', mode === 'wide');
  root.classList.toggle('d-stacked', mode === 'stacked');
  bindFollow();

  const cardH = parseFloat(getComputedStyle(root).getPropertyValue('--d-card-h')) || 225;
  const vw = innerWidth;
  const vh = innerHeight;

  if (mode === 'stacked') {
    resetHeads();
    for (const scene of SCENES) {
      for (const el of cardsOf(scene)) {
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.hidden = false;
      }
    }
    /* 撤掉我们上一轮挪栏头的 translate 之后，重新量一次它们的原位——
       否则「原位」里还含着一份上一轮的位移，越量越偏 */
    const base = headEls().map((e) => (e ? rectOf(e) : { left: 0, top: 0, width: 0, height: 0 }));
    // 让正常流生效之后再量每一栏在文档里的顶
    const tops = SCENES.map((s) => {
      const col = headColumn(s);
      return col ? col.getBoundingClientRect().top + scrollY : 0;
    });
    nudgeHeads(base, tops);
    const sheetRect: Rect = { left: 12, top: 62, width: vw - 24, height: vh - 88 };
    sheet.style.setProperty('--d-pw', '100%');
    sheet.style.setProperty('--d-ph', '100%');
    return {
      mode,
      tan,
      heads: base,
      columns: SCENES.map((scene, k) => ({ scene, head: base[k], cards: [] })),
      sheet: sheetRect,
    };
  }

  resetHeads();
  const bottom = vh - BOTTOM;
  const columns: ColumnBox[] = SCENES.map((scene, k) => {
    const head = rs[k];
    const width = columnWidth(scene) || fallbackWidth(vw);
    const cards: CardBox[] = [];
    const els = cardsOf(scene);
    const first = Math.round(head.top + head.height + HEAD_GAP);
    const room = Math.max(1, Math.floor((bottom - first + ROW_GAP) / (cardH + ROW_GAP)));
    const rows = Math.min(els.length, Math.max(1, room));
    let top = first;
    els.forEach((el, i) => {
      if (i >= rows) {
        el.hidden = true;
        return;
      }
      const h = cardH;
      /* 各栏对齐的那条边：随笔底、瞬间中、项目顶（见文件头）。
         REF 是 wander 摆栏头时用的那个参照高度差（它三栏各用 colX 里不同的 hh/2），
         不补这一格，整栏会多退 3–6px。 */
      const ref = k === 0 ? 24 : k === 1 ? 12 : 0;
      const anchor = k === 0 ? top + h : k === 1 ? top + h / 2 : top;
      const left = Math.round(head.left - (anchor - head.top - ref) * tan);
      el.hidden = false;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${width}px`;
      cards.push({ el, left, top, width, height: h });
      top += h + ROW_GAP;
    });
    return { scene, head, cards };
  });

  /* 面板：从瞬间那一栏的左沿往右铺到右边留白——整块落在夜的那半边，浅墨的字才读得出来 */
  const sheetTop = 112;
  const momentLeft = rs[1].left - (sheetTop - rs[1].top) * tan + EDGE;
  const sheetW = Math.max(420, Math.min(740, vw - EDGE - momentLeft));
  const sheetL = Math.max(EDGE, Math.min(Math.round(momentLeft), vw - EDGE - sheetW));
  const sheetH = Math.max(360, Math.min(690, vh - sheetTop - EDGE));
  const sheetRect: Rect = { left: sheetL, top: sheetTop, width: Math.round(sheetW), height: Math.round(sheetH) };
  sheet.style.setProperty('--d-sheet-l', `${sheetRect.left}px`);
  sheet.style.setProperty('--d-sheet-t', `${sheetRect.top}px`);
  sheet.style.setProperty('--d-sheet-w', `${sheetRect.width}px`);
  sheet.style.setProperty('--d-sheet-h', `${sheetRect.height}px`);
  sheet.style.setProperty('--d-pw', `${sheetRect.width}px`);
  sheet.style.setProperty('--d-ph', `${sheetRect.height}px`);

  return { mode, tan, heads: rs, columns, sheet: sheetRect };
}

export { settledHeads };
