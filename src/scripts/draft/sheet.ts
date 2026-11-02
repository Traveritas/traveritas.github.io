/* ─────────────────────────────────────────────────────────────
   阅读面板：同一块材料从那张卡长出去，收起时落回它的原位。

   两套做法共用这一个壳（.d-sheet），
     · 甲（网点）：60ms 定影 → WAAPI 把 left/top/width/height 从卡片矩形长到面板矩形，
       720ms cubic-bezier(.34,.06,.2,1)；飞行途中墨反号、坡回到上浓下淡；字最后浮上来。
     · 乙（基准）：60ms 定影 → 先让面板以卡片那一刻的矩形与那一组值画一帧，再撤掉内联值，
       几何与三项面色交给 CSS 过渡（.64s / .66s）；字在 480ms 才显影，标题字距同时收一档。
   收起：两套都是「当场量一次那张卡」再回去——不是复用打开时的坐标。

   正文：随笔 / 项目取它自己那一页的 article.prose .md（和片空间的 reader 同一处取材）；
   瞬间没有单独的页，正文在构建期就写进了页面数据（html），直接用。
   ───────────────────────────────────────────────────────────── */

import type { Mode, Rect } from './layout';

export type Variant = 'halftone' | 'value';

export interface SheetLink {
  label: string;
  href: string;
}

export interface SheetData {
  kind: 'article' | 'project' | 'moment';
  scene: 'essay' | 'moment' | 'project';
  href: string;
  title: string;
  meta: string;
  tags: string;
  links: SheetLink[];
  html: string;
}

export interface SheetDeps {
  el: HTMLElement;
  board: HTMLElement;
  variant: Variant;
  data: Record<string, SheetData>;
  target: () => Rect;
  mode: () => Mode;
  reduced: boolean;
}

const WAIT_MS = { fix: 60, open: 720, close: 360, valueOpen: 640, valueClose: 380 } as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rectOf = (el: Element): Rect => {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, width: b.width, height: b.height };
};
const geo = (r: Rect) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
});

/* 面板里那几项会和卡片共用名字的面色（乙）：展开时先把卡的那一组搬到面板上 */
const FACE_VARS = ['--d-face-a', '--d-face-b', '--d-edge-hi', '--d-edge-lo', '--d-edge-ring'] as const;

const ARTICLES = new Map<string, string>();

function need<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`draft: 找不到 ${sel}`);
  return el;
}

/* 取材：同一页只取一次 */
function fetchBody(href: string): Promise<string> {
  const hit = ARTICLES.get(href);
  if (hit !== undefined) return Promise.resolve(hit);
  return fetch(href, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const md = doc.querySelector('article.prose .md');
      const body = md ? md.innerHTML : '';
      ARTICLES.set(href, body);
      return body;
    })
    .catch(() => '');
}

export function createSheet(deps: SheetDeps) {
  const { el, board, variant, data, target, mode, reduced } = deps;
  const metaEl = need<HTMLElement>('#d-sheet-meta');
  const titleEl = need<HTMLElement>('#d-sheet-title');
  const bodyEl = need<HTMLElement>('#d-sheet-body');
  const footEl = need<HTMLElement>('#d-sheet-foot');
  const closeBtn = need<HTMLButtonElement>('#d-sheet-close');

  let cur: HTMLElement | null = null;
  let busy = false;
  let token = 0;
  let openedKb = false;

  const isOpen = () => cur !== null;

  /* ── 内容 ── */
  function waitDots(): HTMLElement {
    const p = document.createElement('div');
    p.className = 'd-sheet__wait';
    p.setAttribute('aria-hidden', 'true');
    p.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    return p;
  }

  function foot(d: SheetData): void {
    footEl.replaceChildren();
    if (d.tags) {
      const p = document.createElement('p');
      p.className = 'tags';
      p.textContent = d.tags;
      footEl.append(p);
    }
    if (d.links.length) {
      const ul = document.createElement('ul');
      ul.className = 'links';
      for (const l of d.links) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.href;
        a.textContent = l.label + ' ↗';
        if (/^https?:/.test(l.href)) {
          a.target = '_blank';
          a.rel = 'noopener';
        }
        li.append(a);
        ul.append(li);
      }
      footEl.append(ul);
    }
    const whole = document.createElement('p');
    whole.className = 'whole';
    const a = document.createElement('a');
    a.href = d.href;
    a.textContent = '在单独的一页里读 ↗';
    whole.append(a);
    footEl.append(whole);
  }

  async function fill(d: SheetData, my: number): Promise<void> {
    metaEl.textContent = d.meta;
    titleEl.textContent = d.title;
    bodyEl.replaceChildren();
    bodyEl.scrollTop = 0;
    foot(d);

    if (d.kind === 'moment') {
      const wrap = document.createElement('div');
      wrap.className = 'md d-sheet__fill';
      wrap.innerHTML = d.html;
      if (my !== token) return;
      bodyEl.replaceChildren(wrap);
      return;
    }

    bodyEl.append(waitDots());
    const html = await fetchBody(d.href);
    if (my !== token) return;
    if (!html) {
      const p = document.createElement('p');
      p.className = 'd-sheet__fill';
      p.textContent = '正文没能取到——可以在单独的一页里读。';
      bodyEl.replaceChildren(p);
      return;
    }
    const prose = document.createElement('div');
    prose.className = `prose prose--${d.kind === 'article' ? 'essay' : 'project'}`;
    const md = document.createElement('div');
    md.className = 'md';
    md.innerHTML = html;
    prose.append(md);
    bodyEl.replaceChildren(prose);
    bodyEl.scrollTop = 0;
  }

  /* ── 面板的打扮 ── */
  const inkOf = (card: HTMLElement) => `d-ink-${card.dataset.ink || 'day'}`;
  const resetInk = () => {
    el.classList.remove('d-ink-day', 'd-ink-dusk', 'd-ink-deep', 'd-ink-reader');
  };

  function prime(card: HTMLElement, src: Rect): void {
    el.hidden = false;
    el.classList.remove('is-live', 'is-show', 'is-closing');
    el.classList.add('is-priming', 'is-fix');
    resetInk();
    /* 甲：面板接手时先是这张卡自己那一组墨，飞到夜面再反号（乙没有这套 ink 类） */
    if (variant === 'halftone') el.classList.add(inkOf(card));
    el.style.left = `${src.left}px`;
    el.style.top = `${src.top}px`;
    el.style.width = `${src.width}px`;
    el.style.height = `${src.height}px`;
    if (variant === 'value') {
      const cs = getComputedStyle(card);
      for (const v of FACE_VARS) el.style.setProperty(v, cs.getPropertyValue(v).trim());
    }
    // 让上面这一帧真的算成「起点」
    void el.offsetWidth;
  }

  function clearGeo(): void {
    el.style.left = '';
    el.style.top = '';
    el.style.width = '';
    el.style.height = '';
    if (variant === 'value') for (const v of FACE_VARS) el.style.removeProperty(v);
  }

  function watch(): void {
    el.hidden = false;
    el.classList.add('is-live');
    board.inert = true;
    document.documentElement.setAttribute('data-dopen', '');
  }

  function unlock(): void {
    el.classList.remove('is-live', 'is-show', 'is-closing', 'is-fix', 'is-priming');
    el.hidden = true;
    resetInk();
    clearGeo();
    board.inert = false;
    document.documentElement.removeAttribute('data-dopen');
    document.documentElement.removeAttribute('data-dlive');
  }

  /* ── 开 ── */
  async function open(card: HTMLElement): Promise<void> {
    if (busy || cur) return;
    const d = data[card.dataset.key || ''];
    if (!d) return;
    busy = true;
    cur = card;
    const my = ++token;
    openedKb = document.documentElement.dataset.dkb === '1';
    void fill(d, my);

    const stacked = mode() === 'stacked';
    const anim = !reduced && !stacked && variant === 'halftone';
    const css = !reduced && !stacked && variant === 'value';

    card.classList.add('is-fixing');
    if (anim || css) await sleep(WAIT_MS.fix);
    if (my !== token) return;

    const src = rectOf(card);
    const dst = target();
    prime(card, src);
    watch();

    if (stacked) {
      /* 窄屏：不长了，直接是那一张纸（原型同款）+ 淡入 */
      el.classList.remove('is-priming', 'is-fix');
      if (variant === 'halftone') el.classList.add('d-ink-reader');
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
      el.classList.add('is-show');
      card.classList.add(variant === 'halftone' ? 'is-taken' : 'is-gone');
      card.setAttribute('aria-expanded', 'true');
      busy = false;
      closeBtn.focus({ preventScroll: true });
      return;
    }

    if (anim) {
      /* 甲：同一块网版从卡片的矩形长出去（先亮起来，再从这一刻开始长，中间不能空一帧） */
      el.classList.add('is-live');
      card.classList.remove('is-fixing');
      const a = el.animate([geo(src), geo(dst)], {
        duration: WAIT_MS.open,
        easing: 'cubic-bezier(.34,.06,.2,1)',
        fill: 'forwards',
      });
      requestAnimationFrame(() => {
        el.classList.remove('is-priming');
      });
      requestAnimationFrame(() => {
        el.classList.remove(inkOf(card));
        el.classList.add('d-ink-reader');
        el.classList.remove('is-fix');
      });
      card.classList.add('is-taken');
      card.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        if (my === token) el.classList.add('is-show');
      }, WAIT_MS.open - 120);
      try {
        await a.finished;
      } catch {
        /* 被打断 */
      }
      a.cancel();
      if (my !== token) return;
      el.classList.remove('is-priming');
      el.style.left = `${dst.left}px`;
      el.style.top = `${dst.top}px`;
      el.style.width = `${dst.width}px`;
      el.style.height = `${dst.height}px`;
      busy = false;
      closeBtn.focus({ preventScroll: true });
      return;
    }

    if (css) {
      /* 乙：面从卡片那一刻的矩形与面色出发，撤掉内联值，交给 CSS 过渡 */
      el.classList.remove('is-priming');
      el.classList.add('is-live');
      document.documentElement.setAttribute('data-dlive', 'opening');
      card.classList.add('is-gone');
      card.setAttribute('aria-expanded', 'true');
      clearGeo();
      el.classList.remove('is-fix');
      setTimeout(() => {
        if (my !== token) return;
        el.classList.add('is-show');
      }, 480);
      setTimeout(() => {
        if (my !== token) return;
        document.documentElement.removeAttribute('data-dlive');
      }, WAIT_MS.valueOpen);
      busy = false;
      closeBtn.focus({ preventScroll: true });
      return;
    }

    /* 减动效 / 来不及演：直接落定 */
    el.classList.remove('is-priming', 'is-fix');
    card.classList.remove('is-fixing');
    if (variant === 'halftone') {
      el.classList.add('d-ink-reader');
      clearGeo();
    } else {
      el.classList.add('is-live');
      clearGeo();
    }
    el.classList.add('is-show');
    card.classList.add(variant === 'halftone' ? 'is-taken' : 'is-gone');
    card.setAttribute('aria-expanded', 'true');
    busy = false;
    closeBtn.focus({ preventScroll: true });
  }

  /* ── 收 ── */
  async function close(): Promise<void> {
    if (!cur || busy) return;
    const card = cur;
    busy = true;
    const my = ++token;
    const stacked = mode() === 'stacked';

    if (stacked || reduced) {
      el.classList.remove('is-show');
      await sleep(reduced ? 0 : 160);
      card.classList.remove('is-taken', 'is-gone', 'is-fixing');
      card.setAttribute('aria-expanded', 'false');
      cur = null;
      busy = false;
      unlock();
      if (!openedKb) card.classList.add('quiet');
      card.focus({ preventScroll: true });
      if (variant === 'value') document.documentElement.setAttribute('data-dhold', '1');
      return;
    }

    const from = rectOf(el);
    const to = rectOf(card);

    if (variant === 'halftone') {
      el.classList.remove('is-show');
      el.classList.add('is-closing');
      el.classList.remove('d-ink-reader');
      resetInk();
      el.classList.add(inkOf(card));
      card.classList.remove('is-taken');
      /* 往回缩的这张纸落在一张「已经在等它」的卡上：列先回来 */
      document.documentElement.removeAttribute('data-dopen');
      const a = el.animate([geo(from), geo(to)], {
        duration: WAIT_MS.close,
        easing: 'cubic-bezier(.42,0,.6,1)',
        fill: 'forwards',
      });
      try {
        await a.finished;
      } catch {
        /* 被打断 */
      }
      a.cancel();
      if (my !== token) return;
      cur = null;
      busy = false;
      card.setAttribute('aria-expanded', 'false');
      unlock();
      if (!openedKb) card.classList.add('quiet');
      card.focus({ preventScroll: true });
      return;
    }

    /* 乙：字先退；面按卡片此刻的矩形与那一组 fix 值回去 */
    el.classList.remove('is-show');
    document.documentElement.setAttribute('data-dlive', 'closing');
    const cs = getComputedStyle(card);
    el.style.left = `${to.left}px`;
    el.style.top = `${to.top}px`;
    el.style.width = `${to.width}px`;
    el.style.height = `${to.height}px`;
    for (const v of FACE_VARS) el.style.setProperty(v, cs.getPropertyValue(v).trim());
    await sleep(WAIT_MS.valueClose);
    if (my !== token) return;
    cur = null;
    busy = false;
    card.classList.remove('is-gone');
    card.setAttribute('aria-expanded', 'false');
    unlock();
    card.focus({ preventScroll: true });
    card.classList.remove('is-fixing');
    document.documentElement.setAttribute('data-dhold', '1');
    if (!openedKb) card.classList.add('quiet');
  }

  /* ── 接线 ── */
  closeBtn.addEventListener('click', () => {
    void close();
  });

  /* 面板外的指针按下去就收（与片空间里那套阅读窗同一个习惯） */
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!cur || busy) return;
      const t = e.target;
      if (t instanceof Node && (el.contains(t) || (cur && cur.contains(t)))) return;
      void close();
    },
    true,
  );

  /* 切到窄屏 / 宽屏时：把正在读的那块收回，免得几何对不上 */
  addEventListener('resize', () => {
    if (cur && !busy) void close();
  });

  return {
    open,
    close,
    isOpen,
  };
}
