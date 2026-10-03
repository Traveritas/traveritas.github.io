/* ─────────────────────────────────────────────────────────────
   页内导览轨（Gauge.astro）：随笔 / 瞬间 / 项目三个目录页 + 阅读页。
   · 静息：发丝线 + 琥珀游标（滚动百分比）+ 节点刻度；
   · 浮起：悬停 / 聚焦 / 拖动时显出节点名，轨可点按跳转、拖动擦过；
   · 展开：点按游标（不拖动）或浮起时游标旁的「展开」，侧面玻璃薄片——目录页寻找 / 标签 / 年月，阅读页目录 / 字号 / 行距。
   节点全部从页面 DOM 里取：目录页认 [data-g-node]（只标年份，条目不上轨），
   阅读页认正文 h2 / h3；筛选对象是 [data-g-item]（data-tags 以 | 分隔，data-ym = 2026-09）。
   ───────────────────────────────────────────────────────────── */

import { clamp, onScrollRaf, reducedMotion } from './lib';

interface GNode {
  el: HTMLElement;
  label: string;
  major: boolean;
  /** 跳到此节点时的 scrollY */
  land: number;
  tick: HTMLElement;
  toc?: HTMLElement;
}

/** 节点停在视口上方这么一截处（视高比例） */
const LEAD = 0.16;
/** 拖动时离刻度这么近（px）就吸附过去 */
const SNAP_PX = 7;

const textOf = (el: HTMLElement) => {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('.ord, .ghost, [aria-hidden="true"]').forEach((x) => x.remove());
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const smooth = (): ScrollBehavior => (reducedMotion() ? 'instant' : 'smooth');

export function initGauge() {
  const root = document.querySelector<HTMLElement>('.gauge');
  if (!root) return;
  const kind = root.dataset.kind === 'reading' ? 'reading' : 'index';
  const track = root.querySelector<HTMLElement>('.g-track')!;
  const ticks = root.querySelector<HTMLElement>('.g-ticks')!;
  const probe = root.querySelector<HTMLElement>('.g-probe')!;
  const fill = root.querySelector<HTMLElement>('.g-fill')!;
  const body = root.querySelector<HTMLElement>('.g-body')!;
  const opener = root.querySelector<HTMLButtonElement>('.g-open')!;
  const panel = root.querySelector<HTMLElement>('.g-panel')!;

  /* ── 节点 ── */
  const sel = kind === 'reading' ? 'article.prose .md h2, article.prose .md h3' : '[data-g-node]';
  const nodes: GNode[] = [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
    const major = kind === 'reading' ? el.tagName === 'H2' : el.dataset.gNode === 'major';
    const label = el.dataset.gLabel ?? textOf(el);
    const tick = document.createElement('span');
    tick.className = major ? 'g-tick is-major' : 'g-tick';
    const lab = document.createElement('span');
    lab.className = 'g-label';
    lab.textContent = label;
    tick.append(lab);
    ticks.append(tick);
    return { el, label, major, land: 0, tick };
  });

  let max = 1;
  let trackH = 1;
  let current: GNode | null = null;

  function measure() {
    max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    trackH = Math.max(1, track.clientHeight);
    const lead = innerHeight * LEAD;
    for (const n of nodes) {
      const top = n.el.getBoundingClientRect().top + scrollY;
      n.land = clamp(top - lead, 0, max);
      n.tick.style.top = `${((n.land / max) * 100).toFixed(2)}%`;
    }
    update();
  }

  function update() {
    const p = clamp(scrollY / max, 0, 1);
    body.style.setProperty('--p', p.toFixed(4));
    fill.style.transform = `scaleY(${p.toFixed(4)})`;
    // 游标旁的刻度名让给「展开」
    for (const n of nodes) n.tick.classList.toggle('is-near', Math.abs(n.land / max - p) * trackH < 12);

    let cur: GNode | null = null;
    for (const n of nodes) if (n.land <= scrollY + 4) cur = n;
    if (cur !== current) {
      current?.tick.classList.remove('is-current');
      current?.toc?.removeAttribute('aria-current');
      cur?.tick.classList.add('is-current');
      cur?.toc?.setAttribute('aria-current', 'location');
      current = cur;
    }
    track.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    track.setAttribute('aria-valuetext', cur ? `${Math.round(p * 100)}% · ${cur.label}` : `${Math.round(p * 100)}%`);
  }

  onScrollRaf(update);
  new ResizeObserver(measure).observe(document.body);
  document.fonts?.ready.then(measure);
  measure();

  /* ── 轨：点按跳转（平滑），拖动擦过（即时，近刻度吸附） ── */
  const live = () => nodes.filter((n) => !n.tick.classList.contains('is-veiled'));

  function targetAt(clientY: number) {
    const r = track.getBoundingClientRect();
    let y = clamp(clientY - r.top, 0, r.height);
    let best: GNode | null = null;
    let bestD = SNAP_PX;
    for (const n of live()) {
      const d = Math.abs((n.land / max) * r.height - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return best.land;
    return (y / Math.max(r.height, 1)) * max;
  }

  let open = false;
  let downY: number | null = null;
  let dragging = false;

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    downY = e.clientY;
    dragging = false;
  });
  track.addEventListener('pointermove', (e) => {
    if (downY == null) return;
    if (!dragging && Math.abs(e.clientY - downY) < 3) return;
    dragging = true;
    root.classList.add('is-dragging');
    scrollTo({ top: targetAt(e.clientY), behavior: 'instant' });
  });
  const release = (e: PointerEvent) => {
    if (downY == null) return;
    if (!dragging && e.type === 'pointerup') {
      // 点在游标上 ＝ 开合薄片；点在轨上别处 ＝ 跳过去
      const pr = probe.getBoundingClientRect();
      if (Math.abs(e.clientY - (pr.top + pr.height / 2)) <= 8) setOpen(!open);
      else scrollTo({ top: targetAt(e.clientY), behavior: smooth() });
    }
    downY = null;
    dragging = false;
    root.classList.remove('is-dragging');
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  track.addEventListener('keydown', (e) => {
    const ns = live();
    const i = current ? ns.indexOf(current) : -1;
    let top: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') top = ns[i + 1]?.land ?? max;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
      top = current && scrollY > current.land + 4 ? current.land : (ns[i - 1]?.land ?? 0);
    else if (e.key === 'PageDown') top = scrollY + max * 0.1;
    else if (e.key === 'PageUp') top = scrollY - max * 0.1;
    else if (e.key === 'Home') top = 0;
    else if (e.key === 'End') top = max;
    if (top == null) return;
    e.preventDefault();
    scrollTo({ top: clamp(top, 0, max), behavior: smooth() });
  });

  /* ── 展开薄片 ── */
  function setOpen(v: boolean) {
    open = v;
    root!.classList.toggle('is-open', v);
    opener.setAttribute('aria-expanded', String(v));
    opener.textContent = v ? '收起' : '展开';
    panel.inert = !v;
  }
  opener.addEventListener('click', () => setOpen(!open));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      opener.focus();
    }
  });
  addEventListener('pointerdown', (e) => {
    if (open && !root.contains(e.target as Node)) setOpen(false);
  });

  const go = (top: number) => scrollTo({ top, behavior: smooth() });

  if (kind === 'reading') initReading(panel, nodes, go, setOpen);
  else initIndex(root, panel, nodes, go);
}

/* ── 阅读页：目录 + 字号 / 行距 ── */
function initReading(
  panel: HTMLElement,
  nodes: GNode[],
  go: (top: number) => void,
  setOpen: (v: boolean) => void,
) {
  const toc = panel.querySelector<HTMLElement>('.g-toc');
  if (toc) {
    if (!nodes.length) toc.closest('.g-sec')?.remove();
    for (const n of nodes) {
      const a = document.createElement('a');
      a.className = n.major ? 'g-toc-item' : 'g-toc-item is-sub';
      a.href = n.el.id ? `#${n.el.id}` : '#';
      a.textContent = n.label;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        go(n.land);
        setOpen(false);
      });
      n.toc = a;
      toc.append(a);
    }
  }

  const html = document.documentElement;
  for (const seg of panel.querySelectorAll<HTMLElement>('.g-seg[data-key]')) {
    const key = seg.dataset.key!; // size | lead
    const attr = key === 'size' ? 'readSize' : 'readLead';
    const btns = [...seg.querySelectorAll<HTMLButtonElement>('button[data-v]')];
    const paint = () => {
      const v = html.dataset[attr] || 'm';
      for (const b of btns) b.setAttribute('aria-pressed', String(b.dataset.v === v));
    };
    for (const b of btns) {
      b.addEventListener('click', () => {
        const v = b.dataset.v!;
        if (v === 'm') delete html.dataset[attr];
        else html.dataset[attr] = v;
        try {
          if (v === 'm') localStorage.removeItem(`xm-read-${key}`);
          else localStorage.setItem(`xm-read-${key}`, v);
        } catch {
          /* 存不下就只管本页 */
        }
        paint();
      });
    }
    paint();
  }
}

/* ── 目录页：寻找 / 标签 / 年月 ── */
function initIndex(root: HTMLElement, panel: HTMLElement, nodes: GNode[], go: (top: number) => void) {
  const items = [...document.querySelectorAll<HTMLElement>('[data-g-item]')].map((el) => ({
    el,
    text: (el.textContent ?? '').toLowerCase(),
    tags: (el.dataset.tags ?? '').split('|').filter(Boolean),
    ym: el.dataset.ym ?? '',
    node: nodes.find((n) => n.el === el),
  }));
  const unit = root.dataset.unit ?? '';
  const input = panel.querySelector<HTMLInputElement>('.g-find input')!;
  const count = panel.querySelector<HTMLElement>('.g-count')!;
  const clear = panel.querySelector<HTMLButtonElement>('.g-clear')!;
  const tagBox = panel.querySelector<HTMLElement>('.g-tags')!;
  const timeBox = panel.querySelector<HTMLElement>('.g-time')!;

  const params = new URLSearchParams(location.search);
  let q = params.get('q') ?? '';
  let tag = params.get('tag') ?? '';
  input.value = q;

  /* 标签 */
  const tagCount = new Map<string, number>();
  for (const it of items) for (const t of it.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tagBtns: HTMLButtonElement[] = [];
  if (!tagCount.size) tagBox.closest('.g-sec')?.remove();
  for (const [t, n] of [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-chip';
    b.dataset.tag = t;
    b.innerHTML = `<span></span><i class="mono">${n}</i>`;
    b.firstElementChild!.textContent = t;
    b.addEventListener('click', () => {
      tag = tag === t ? '' : t;
      apply();
    });
    tagBtns.push(b);
    tagBox.append(b);
  }

  /* 年月：按 DOM 顺序（新 → 旧），点月份跳到当月第一条 */
  const years = new Map<string, Map<string, (typeof items)[number][]>>();
  for (const it of items) {
    if (!it.ym) continue;
    const [y, m] = it.ym.split('-');
    if (!years.has(y)) years.set(y, new Map());
    const ms = years.get(y)!;
    if (!ms.has(m)) ms.set(m, []);
    ms.get(m)!.push(it);
  }
  for (const [y, ms] of years) {
    const row = document.createElement('div');
    row.className = 'g-yr';
    const yb = document.createElement('button');
    yb.type = 'button';
    yb.className = 'g-yr-y mono';
    yb.textContent = y;
    const yNode = nodes.find((n) => n.major && n.label === y);
    yb.addEventListener('click', () => go(yNode?.land ?? [...ms.values()][0][0].node?.land ?? 0));
    row.append(yb);
    const mbox = document.createElement('span');
    mbox.className = 'g-yr-m';
    for (const [m, list] of ms) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-mo mono';
      b.title = `${y}.${m} · ${list.length} ${unit}`;
      b.textContent = m;
      b.addEventListener('click', () => {
        const first = list.find((it) => !it.el.classList.contains('g-veiled')) ?? list[0];
        go(first.node?.land ?? first.el.getBoundingClientRect().top + scrollY - innerHeight * LEAD);
      });
      mbox.append(b);
    }
    row.append(mbox);
    timeBox.append(row);
  }
  if (!years.size) timeBox.closest('.g-sec')?.remove();

  function apply() {
    const needle = q.trim().toLowerCase();
    let shown = 0;
    for (const it of items) {
      const ok = (!tag || it.tags.includes(tag)) && (!needle || it.text.includes(needle));
      it.el.classList.toggle('g-veiled', !ok);
      it.node?.tick.classList.toggle('is-veiled', !ok);
      if (ok) shown++;
    }
    for (const b of tagBtns) b.setAttribute('aria-pressed', String(b.dataset.tag === tag));
    for (const c of inlineChips) {
      if (c.dataset.tagName === tag) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    }
    const filtering = Boolean(needle || tag);
    count.textContent = filtering ? `${shown} / ${items.length} ${unit}` : `${items.length} ${unit}`;
    clear.hidden = !filtering;
    root.classList.toggle('is-filtering', filtering);

    const url = new URL(location.href);
    if (q.trim()) url.searchParams.set('q', q.trim());
    else url.searchParams.delete('q');
    if (tag) url.searchParams.set('tag', tag);
    else url.searchParams.delete('tag');
    history.replaceState(history.state, '', url);
  }

  input.addEventListener('input', () => {
    q = input.value;
    apply();
  });
  clear.addEventListener('click', () => {
    q = '';
    tag = '';
    input.value = '';
    apply();
  });

  /* 条目里的标签框（TagChip）：就地筛选，再点一次撤销；修饰键点按照常走链接 */
  const inlineChips = items.flatMap((it) => [...it.el.querySelectorAll<HTMLAnchorElement>('.tag-chip[data-tag-name]')]);
  for (const c of inlineChips) {
    c.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const t = c.dataset.tagName!;
      tag = tag === t ? '' : t;
      apply();
    });
  }
  apply();
}
