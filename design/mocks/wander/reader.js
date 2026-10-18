/* ─────────────────────────────────────────────────────────────
   阅读：那扇窗自己长大。
   面板就是同一种窗（同样的玻璃、1px 边、标题栏），从卡片此刻的矩形长到阅读尺寸；
   长的前半段钉着卡片自己的画面，过半后让给真的标题栏与正文。
   卡片上那道标题栏到这里才「通电」：‹ › 翻到同一版块的上一条 / 下一条，— 收起。
   收起时落回卡片此刻的位置（检索视图里是它的格子，漫游里是它在空间里的那一份）。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const IMG = (p) => `../layout-plane/${p}`;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dot = (d) => d.slice(0, 10).replace(/-/g, '.');
  const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_CLOSE = 'cubic-bezier(0.5, 0, 0.2, 1)';
  const ext = (h) => (/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LABEL = { essay: ['随笔', 'ESSAY'], project: ['项目', 'PROJECT'], moment: ['瞬间', 'MOMENT'] };

  function body(it) {
    const a = it.ref;
    if (it.kind === 'article')
      return `<h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1><p class="rd-lede">${esc(a.desc)}</p>
        <p class="rd-meta"><span>${a.chars} 字</span><span class="ink">${a.tags.map(esc).join(' · ')}</span></p><div class="md">${a.html}</div>`;
    if (it.kind === 'project')
      return `<h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1><p class="rd-lede">${esc(a.desc)}</p>
        <p class="rd-meta"><span class="ink">${esc(a.status)}</span></p>
        ${a.links.length ? `<ul class="rd-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul>` : ''}
        <div class="md">${a.html}</div>${a.note ? `<p class="rd-note">${esc(a.note.awake)}</p>` : ''}`;
    if (it.kind === 'img') {
      const im = a.images[it.k - 1];
      return `<figure class="rd-fig"><img class="rd-img" src="${IMG(im.l)}" alt="${esc(im.alt)}" style="aspect-ratio:${im.w}/${im.h}"></figure>
        <h1 class="rd-title small" tabindex="-1">${esc(a.title)}</h1>${a.images.length > 1 && im.alt ? `<p class="rd-meta"><span>${esc(im.alt)}</span></p>` : ''}
        ${paras(a.text).map((p) => `<p class="rd-text">${esc(p)}</p>`).join('')}`;
    }
    const [l1 = '', ...rest] = paras(a.text);
    return `<h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1><p class="rd-big">${esc(l1)}</p>${rest.map((p) => `<p class="rd-text ink">${esc(p)}</p>`).join('')}`;
  }

  window.WanderReader = function createReader({ onOpen, onNav, onClosing, onClosed }) {
    let cur = null;
    const anim = (el, kf, o) => el.animate(kf, { fill: 'both', ...o, duration: RM ? 0 : o.duration, delay: RM ? 0 : o.delay || 0 });
    const geo = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

    /* 阅读尺寸：宽度固定，高度贴着内容（短的瞬间不必撑满一屏），最多到屏幕底 */
    function panelRect() {
      const w = Math.min(800, innerWidth - 24);
      const top = innerWidth < 640 ? 60 : 76;
      const max = innerHeight - top - (innerWidth < 640 ? 12 : 22);
      let h = max;
      if (cur) {
        const tbH = cur.tb.offsetHeight || 42;
        h = Math.min(max, tbH + cur.col.offsetHeight + 1);
      }
      return { left: (innerWidth - w) / 2, top, width: w, height: Math.max(220, h) };
    }

    function head(it) {
      const [cn, en] = LABEL[it.scene];
      const list = cur ? cur.list : [];
      const n = list.indexOf(it);
      const right = it.kind === 'img' && it.ref.images.length > 1 ? `${dot(it.ref.date)} · ${it.k}/${it.ref.images.length}` : dot(it.ref.date);
      return `<i class="dot" aria-hidden="true"></i><b>${cn}</b><span class="en">${en}</span><span class="sp"></span>
        ${list.length > 1 ? `<span class="rd-nav"><button type="button" class="rd-prev" aria-label="上一条"${n <= 0 ? ' disabled' : ''}>‹</button><span class="rd-pos">${n + 1} / ${list.length}</span><button type="button" class="rd-next" aria-label="下一条"${n >= list.length - 1 ? ' disabled' : ''}>›</button></span>` : ''}
        <time>${right}</time><button type="button" class="rd-min" aria-label="收起">—</button>`;
    }

    /* opts: { list: 同版块的条目（‹ › 用）, getRect(it) → 卡片此刻的矩形或 null } */
    function open(it, fromRect, opts = {}) {
      if (cur) return;
      const el = document.createElement('div');
      el.className = 'rd';
      el.dataset.scene = it.scene;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', it.ref.title);
      el.innerHTML = `<div class="rd-win"><div class="rd-face"></div><header class="rd-tb"></header><div class="rd-scroll"><div class="rd-col"></div></div></div>`;
      document.body.appendChild(el);
      const win = el.querySelector('.rd-win');
      const face = el.querySelector('.rd-face');
      const tb = el.querySelector('.rd-tb');
      const col = el.querySelector('.rd-col');
      cur = { el, win, face, tb, col, it, opts, list: opts.list || [it] };
      tb.innerHTML = head(it);
      col.innerHTML = body(it);
      face.style.backgroundImage = `url(${it.lod[0]})`;
      face.style.aspectRatio = `${it.w} / ${it.h}`;
      document.documentElement.classList.add('reading');
      onOpen && onOpen(it);

      Object.assign(win.style, geo(panelRect()));
      const pr = panelRect(); // 先按满高排一次，量出内容高度，再定窗高
      Object.assign(win.style, geo(pr));
      anim(win, [{ ...geo(fromRect), opacity: 0.96 }, { ...geo(pr), opacity: 1 }], { duration: 760, easing: EASE_OPEN });
      // 卡片的画面只陪着长一小段（长大的曲线是前快后慢，过了三四成就已经接近阅读尺寸），随即让给真的标题栏
      anim(face, [{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.36 }, { opacity: 0 }], { duration: 760, easing: 'linear' });
      anim(tb, [{ opacity: 0 }, { opacity: 0, offset: 0.26 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: 760, easing: 'linear' });
      anim(col, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 300, easing: EASE_OPEN });
      setTimeout(() => cur && cur.el === el && el.querySelector('.rd-title')?.focus({ preventScroll: true }), RM ? 0 : 700);

      el.addEventListener('click', (e) => {
        if (e.target.closest('.rd-min')) return close();
        if (e.target.closest('.rd-prev')) return nav(-1);
        if (e.target.closest('.rd-next')) return nav(1);
        if (!e.target.closest('.rd-win')) close();
      });
    }

    /* 翻到同版块的相邻一条：窗不动，内容换掉（向翻页方向滑一小段） */
    function nav(d) {
      if (!cur || cur.closing || cur.navving) return;
      const n = cur.list.indexOf(cur.it) + d;
      const next = cur.list[n];
      if (!next) return;
      cur.navving = true;
      const prev = cur.it;
      const { col, tb, el } = cur;
      const scroll = el.querySelector('.rd-scroll');
      anim(col, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 24}px)` }], { duration: 200, easing: 'ease-in' }).finished.then(() => {
        if (!cur) return;
        cur.it = next;
        el.setAttribute('aria-label', next.ref.title);
        el.dataset.scene = next.scene;
        tb.innerHTML = head(next);
        col.innerHTML = body(next);
        cur.face.style.backgroundImage = `url(${next.lod[0]})`;
        cur.face.style.aspectRatio = `${next.w} / ${next.h}`;
        scroll.scrollTop = 0;
        // 窗高跟着新内容走
        const h0 = cur.win.offsetHeight;
        const pr = panelRect();
        cur.win.style.height = `${pr.height}px`;
        if (Math.abs(pr.height - h0) > 1) anim(cur.win, [{ height: `${h0}px` }, { height: `${pr.height}px` }], { duration: 420, easing: EASE_OPEN });
        col.getAnimations().forEach((a) => a.cancel());
        anim(col, [{ opacity: 0, transform: `translateX(${d * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE_OPEN }).finished.then(() => { if (cur) cur.navving = false; });
        onNav && onNav(prev, next);
      });
    }

    function close() {
      if (!cur || cur.closing) return;
      cur.closing = true;
      const { el, win, face, tb, col, it, opts } = cur;
      const target = (opts.getRect && opts.getRect(it)) || null;
      const pr = panelRect();
      onClosing && onClosing(it);
      [win, face, tb, col].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
      anim(col, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
      anim(tb, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 60 });
      let done;
      if (target) {
        anim(face, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 60 });
        done = anim(win, [{ ...geo(pr), opacity: 1 }, { ...geo(target), opacity: 1 }], { duration: 580, delay: 70, easing: EASE_CLOSE }).finished;
      } else {
        // 那一条此刻不在视野里：窗原地合上、淡掉
        done = anim(win, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 360, delay: 60, easing: EASE_CLOSE }).finished;
      }
      done.then(() => {
        el.remove();
        document.documentElement.classList.remove('reading');
        cur = null;
        onClosed && onClosed(it);
      });
    }

    addEventListener('keydown', (e) => {
      if (!cur) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); nav(-1); }
      else if (e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); nav(1); }
    });

    return { open, close, get isOpen() { return !!cur; }, get it() { return cur && cur.it; } };
  };
})();
