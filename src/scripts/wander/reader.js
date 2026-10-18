/* ─────────────────────────────────────────────────────────────
   阅读：那扇窗自己长大。
   面板就是同一种窗（同样的玻璃、1px 边、标题栏），从卡片此刻的矩形长到阅读尺寸；
   长的前半段钉着卡片自己的画面，随即让给真的标题栏与正文。
   标题栏到这里才「通电」：‹ › 翻到同一版块的上一条 / 下一条，— 收起。

   正文从哪来：
     · 随笔 / 项目：取它自己的页面（/articles/<slug>/、/projects/<slug>/）里的 .md 与关联篇章——
       那一页是正文的真身（直接访问、无脚本、搜索引擎都看它），这里只是把它借进窗里读。
       悬停时就开始预取，点开时多半已经到了。
     · 瞬间：没有单独的页，正文在构建期就写进了数据（html）。
   地址：打开时把地址栏换成这一篇自己的地址（瞬间是 /moments/#<id>），可以分享、可以后退；
   后退 = 收起。翻页换地址但不多压历史。
   ───────────────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dot = (d) => d.slice(0, 10).replace(/-/g, '.');
const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_CLOSE = 'cubic-bezier(0.5, 0, 0.2, 1)';
const ext = (h) => (/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '');
import { Faces } from './faces.js';
const LABEL = { essay: ['随笔', 'ESSAY', '断章'], project: ['项目', 'PROJECT', '造物'], moment: ['瞬间', 'MOMENT', '闪念'] };

/* ── 正文取材：同一个地址只取一次 ── */
const cache = new Map();
export function prefetch(it) {
  if (it.kind !== 'article' && it.kind !== 'project') return null;
  const href = it.ref.href;
  if (!cache.has(href))
    cache.set(
      href,
      fetch(href, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const md = doc.querySelector('article.prose .md');
          const xfile = doc.querySelector('article.prose .xfile');
          return { md: md ? md.innerHTML : '', xfile: xfile ? xfile.outerHTML : '' };
        })
        .catch(() => {
          cache.delete(href);
          return null;
        }),
    );
  return cache.get(href);
}

/* 一则瞬间的全部配图，按「多图」设置排：grid 网格 / row 并排（≤3 张，更多退回网格）/ car 轮播（原生横向滚动吸附 = 可滑，另有 ‹ › 与圆点） */
function gallery(a) {
  const ims = a.images;
  const img = (im, i) => `<img class="w-rd-img" src="${esc(im.l)}" alt="${esc(im.alt)}" width="${im.w}" height="${im.h}"${i ? ' loading="lazy"' : ''}>`;
  if (ims.length < 2) return `<figure class="w-rd-fig">${img(ims[0], 0)}</figure>`;
  const mode = Faces.multi();
  if (mode === 'car') {
    const r = Math.min(Math.max(ims[0].w / ims[0].h, 0.8), 1.6).toFixed(3);
    return `<figure class="w-rd-fig w-rd-car" role="group" aria-roledescription="轮播" aria-label="配图" style="--r:${r}">
      <div class="w-rd-track" tabindex="0">${ims.map((im, i) => `<div class="w-rd-slide" role="group" aria-label="${i + 1} / ${ims.length}">${img(im, i)}</div>`).join('')}</div>
      <button type="button" class="w-rd-cprev" aria-label="上一张" disabled>‹</button><button type="button" class="w-rd-cnext" aria-label="下一张">›</button>
      <div class="w-rd-dots" aria-hidden="true">${ims.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
    </figure>
    <p class="w-rd-meta w-rd-cap"><span>${esc(ims[0].alt)}</span></p>`;
  }
  // 并排：一行、各自的比例同高；放得下就按比例分满一行，放不下就横着滑
  if (mode === 'row') return `<figure class="w-rd-fig w-rd-row" tabindex="0">${ims.map((im, i) => img(im, i).replace('<img ', `<img style="--r:${(im.w / im.h).toFixed(3)}" `)).join('')}</figure>`;
  const cols = ims.length >= 5 ? 3 : 2;
  return `<figure class="w-rd-fig w-rd-gal" style="--cols:${cols}">${ims.map((im, i) => img(im, i)).join('')}</figure>`;
}
/* 轮播的控制：滚动即换页（滑动、触控板、键盘都走它），按钮与圆点只是替它滚 */
function wireCarousel(col) {
  const car = col.querySelector('.w-rd-car');
  if (!car) return;
  const track = car.querySelector('.w-rd-track');
  const dots = [...car.querySelectorAll('.w-rd-dots i')];
  const prev = car.querySelector('.w-rd-cprev');
  const next = car.querySelector('.w-rd-cnext');
  const cap = col.querySelector('.w-rd-cap span');
  const alts = [...car.querySelectorAll('img')].map((x) => x.alt);
  const n = dots.length;
  const idx = () => Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / track.clientWidth)));
  const paint = () => {
    const i = idx();
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    prev.disabled = i === 0;
    next.disabled = i === n - 1;
    if (cap) cap.textContent = alts[i] || '';
  };
  const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  track.addEventListener('scroll', paint, { passive: true });
  prev.addEventListener('click', () => go(idx() - 1));
  next.addEventListener('click', () => go(idx() + 1));
  car.__step = (d) => {
    const i = idx() + d;
    if (i < 0 || i > n - 1) return false;
    go(i);
    return true;
  };
}

function head(it) {
  const a = it.ref;
  if (it.kind === 'article')
    return `<h1 class="w-rd-title" tabindex="-1">${esc(a.title)}</h1>${a.desc ? `<p class="w-rd-lede">${esc(a.desc)}</p>` : ''}
      <p class="w-rd-meta"><span>${a.chars.toLocaleString('en-US')} 字</span>${a.tags.length ? `<span class="ink">${a.tags.map(esc).join(' · ')}</span>` : ''}</p>`;
  if (it.kind === 'project')
    return `<h1 class="w-rd-title" tabindex="-1">${esc(a.title)}</h1>${a.desc ? `<p class="w-rd-lede">${esc(a.desc)}</p>` : ''}
      <p class="w-rd-meta"><span class="ink">${esc(a.status)}</span></p>
      ${a.links.length ? `<ul class="w-rd-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul>` : ''}`;
  return '';
}
/* 项目的注记（醒 / 梦双声轨），数据里带着，不从页面上抠（那一页的组件样式这里没有） */
const note = (it) => (it.kind === 'project' && it.ref.note ? `<p class="w-rd-note"><span data-morph data-true="${esc(it.ref.note.awake)}" data-dream="${esc(it.ref.note.dream)}">${esc(it.ref.note.awake)}</span></p>` : '');
function body(it) {
  const a = it.ref;
  if (it.kind === 'article' || it.kind === 'project')
    return `${head(it)}<div class="w-rd-body" aria-busy="true"><div class="w-rd-wait" aria-hidden="true"><i></i><i></i><i></i></div></div>
      <p class="w-rd-whole"><a href="${esc(a.href)}">在单独的一页里读 ↗</a></p>`;
  const text = a.html ? `<div class="md w-rd-mdm">${a.html}</div>` : paras(a.text).map((p) => `<p class="w-rd-text">${esc(p)}</p>`).join('');
  if (it.kind === 'img') {
    return `${gallery(a)}
      ${a.title ? `<h1 class="w-rd-title small" tabindex="-1">${esc(a.title)}</h1>` : '<h1 class="w-rd-title small w-vh" tabindex="-1">瞬间</h1>'}
      ${text}${a.tags.length ? `<p class="w-rd-meta tags"><span class="ink">${a.tags.map(esc).join(' · ')}</span></p>` : ''}`;
  }
  return `${a.title ? `<h1 class="w-rd-title" tabindex="-1">${esc(a.title)}</h1>` : '<h1 class="w-rd-title w-vh" tabindex="-1">瞬间</h1>'}${text}
    ${a.tags.length ? `<p class="w-rd-meta tags"><span class="ink">${a.tags.map(esc).join(' · ')}</span></p>` : ''}`;
}

export function createReader({ onOpen, onNav, onClosing, onClosed, onBody }) {
  let cur = null;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = (el, kf, o) => el.animate(kf, { fill: 'both', ...o, duration: RM ? 0 : o.duration, delay: RM ? 0 : o.delay || 0 });
  const geo = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const baseTitle = document.title;

  /* 阅读尺寸：宽度固定，高度贴着内容（短的瞬间不必撑满一屏），最多到屏幕底 */
  function panelRect() {
    const w = Math.min(800, innerWidth - 24);
    const top = innerWidth < 640 ? 60 : 76;
    const max = innerHeight - top - (innerWidth < 640 ? 12 : 22);
    let h = max;
    if (cur) h = Math.min(max, (cur.tb.offsetHeight || 42) + cur.col.offsetHeight + 1);
    return { left: (innerWidth - w) / 2, top, width: w, height: Math.max(220, h) };
  }
  function resizeTo(dur = 420) {
    if (!cur || cur.closing) return;
    const h0 = cur.win.offsetHeight;
    const pr = panelRect();
    if (Math.abs(pr.height - h0) < 1) return;
    cur.win.style.height = `${pr.height}px`;
    anim(cur.win, [{ height: `${h0}px` }, { height: `${pr.height}px` }], { duration: dur, easing: EASE_OPEN });
  }

  function titleBar(it) {
    const [cn, en, dream] = LABEL[it.scene];
    const list = cur ? cur.list : [];
    const n = list.indexOf(it);
    const right = it.kind === 'img' && it.ref.images.length > 1 ? `${dot(it.ref.date)} · ${it.ref.images.length} 张` : dot(it.ref.date);
    // 窗是后来插进页面的，全站的双态换面不认识它：按此刻是醒是梦先写对
  const face = document.body.dataset.reality === 'dream' ? dream : cn;
  return `<i class="dot" aria-hidden="true"></i><b data-morph data-true="${cn}" data-dream="${dream}">${face}</b><span class="en">${en}</span><span class="sp"></span>
      ${list.length > 1 ? `<span class="w-rd-nav"><button type="button" class="w-rd-prev" aria-label="上一条"${n <= 0 ? ' disabled' : ''}>‹</button><span class="w-rd-pos">${n + 1} / ${list.length}</span><button type="button" class="w-rd-next" aria-label="下一条"${n >= list.length - 1 ? ' disabled' : ''}>›</button></span>` : ''}
      <time>${right}</time><button type="button" class="w-rd-min" aria-label="收起">—</button>`;
  }

  /* 随笔 / 项目的正文到了：填进去，窗高跟着长 */
  function fill(it) {
    const p = prefetch(it);
    if (!p) return;
    p.then((got) => {
      if (!cur || cur.it !== it) return;
      const slot = cur.col.querySelector('.w-rd-body');
      if (!slot) return;
      slot.removeAttribute('aria-busy');
      // 套上它自己那一页的排版变体（.prose--essay / --project：字号、两端对齐、小节序号……），读起来和单独那一页一样
      slot.innerHTML = got ? `<div class="prose prose--${it.kind === 'article' ? 'essay' : 'project'}"><div class="md">${got.md}</div>${note(it)}${got.xfile}</div>` : '<p class="w-rd-text">正文没能取到——可以在单独的一页里读。</p>';
      onBody && onBody(slot);
      anim(slot, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE_OPEN });
      resizeTo();
    });
  }

  function setURL(it, push) {
    const href = it.ref.href;
    try {
      if (push) history.pushState({ wander: 1, href }, '', href);
      else history.replaceState({ wander: 1, href }, '', href);
    } catch {}
    document.title = `${it.ref.title || LABEL[it.scene][0]} — Traveritas`;
  }

  /* opts: { list: 同版块的条目（‹ › 用）, getRect(it) → 卡片此刻的矩形或 null, fromURL: 由地址直接打开（不压历史） } */
  function open(it, fromRect, opts = {}) {
    if (cur) return;
    const el = document.createElement('div');
    el.className = 'w-rd';
    el.dataset.wscene = it.scene;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', it.ref.title || LABEL[it.scene][0]);
    el.innerHTML = `<div class="w-rd-win"><div class="w-rd-face"></div><header class="w-rd-tb"></header><div class="w-rd-scroll"><div class="w-rd-col"></div></div></div>`;
    document.body.appendChild(el);
    const win = el.querySelector('.w-rd-win');
    const face = el.querySelector('.w-rd-face');
    const tb = el.querySelector('.w-rd-tb');
    const col = el.querySelector('.w-rd-col');
    cur = { el, win, face, tb, col, it, opts, list: opts.list || [it], pushed: !opts.fromURL };
    tb.innerHTML = titleBar(it);
    col.innerHTML = body(it);
    wireCarousel(col);
    face.style.backgroundImage = `url(${it.lod[0]})`;
    face.style.aspectRatio = `${it.w} / ${it.h}`;
    document.documentElement.classList.add('w-reading');
    setURL(it, !opts.fromURL);
    onOpen && onOpen(it, el);
    fill(it);

    Object.assign(win.style, geo(panelRect()));
    const pr = panelRect();
    Object.assign(win.style, geo(pr));
    if (fromRect) {
      anim(win, [{ ...geo(fromRect), opacity: 0.96 }, { ...geo(pr), opacity: 1 }], { duration: 760, easing: EASE_OPEN });
      // 卡片的画面只陪着长一小段（长大的曲线是前快后慢），随即让给真的标题栏
      anim(face, [{ opacity: 1 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.36 }, { opacity: 0 }], { duration: 760, easing: 'linear' });
      anim(tb, [{ opacity: 0 }, { opacity: 0, offset: 0.26 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: 760, easing: 'linear' });
    } else {
      face.style.opacity = '0';
      anim(win, [{ opacity: 0, transform: 'translateY(16px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 560, easing: EASE_OPEN });
    }
    anim(col, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: 300, easing: EASE_OPEN });
    setTimeout(() => cur && cur.el === el && el.querySelector('.w-rd-title')?.focus({ preventScroll: true }), RM ? 0 : 700);

    el.addEventListener('click', (e) => {
      if (e.target.closest('.w-rd-min')) return requestClose();
      if (e.target.closest('.w-rd-prev')) return nav(-1);
      if (e.target.closest('.w-rd-next')) return nav(1);
      if (!e.target.closest('.w-rd-win')) requestClose();
    });
  }

  /* 翻到同版块的相邻一条：窗不动，内容换掉（向翻页方向滑一小段） */
  function nav(d) {
    if (!cur || cur.closing || cur.navving) return;
    const next = cur.list[cur.list.indexOf(cur.it) + d];
    if (!next) return;
    cur.navving = true;
    const prev = cur.it;
    const { col, tb, el } = cur;
    const scroll = el.querySelector('.w-rd-scroll');
    prefetch(next);
    anim(col, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 24}px)` }], { duration: 200, easing: 'ease-in' }).finished.then(() => {
      if (!cur) return;
      cur.it = next;
      el.setAttribute('aria-label', next.ref.title || LABEL[next.scene][0]);
      el.dataset.wscene = next.scene;
      tb.innerHTML = titleBar(next);
      col.innerHTML = body(next);
      wireCarousel(col);
      cur.face.style.backgroundImage = `url(${next.lod[0]})`;
      cur.face.style.aspectRatio = `${next.w} / ${next.h}`;
      scroll.scrollTop = 0;
      setURL(next, false);
      onNav && onNav(prev, next, el);
      fill(next);
      resizeTo();
      col.getAnimations().forEach((a) => a.cancel());
      anim(col, [{ opacity: 0, transform: `translateX(${d * 24}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE_OPEN }).finished.then(() => {
        if (cur) cur.navving = false;
      });
    });
  }

  /* 收起：自己压过历史的，就用后退来收（地址回到目录页）；popstate 再真的收 */
  function requestClose() {
    if (!cur || cur.closing) return;
    if (cur.pushed && history.state && history.state.wander) history.back();
    else {
      close();
      try { history.replaceState(null, '', cur ? cur.opts.indexURL : location.pathname); } catch {}
    }
  }
  function close() {
    if (!cur || cur.closing) return;
    cur.closing = true;
    const { el, win, face, tb, col, it, opts } = cur;
    const target = (opts.getRect && opts.getRect(it)) || null;
    const pr = { left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight };
    document.title = baseTitle;
    onClosing && onClosing(it);
    [win, face, tb, col].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
    anim(col, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
    anim(tb, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 60 });
    let done;
    if (target) {
      face.style.opacity = '';
      anim(face, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 60 });
      done = anim(win, [{ ...geo(pr), opacity: 1 }, { ...geo(target), opacity: 1 }], { duration: 580, delay: 70, easing: EASE_CLOSE }).finished;
    } else {
      // 那一条此刻不在视野里：窗原地合上、淡掉
      done = anim(win, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.94)' }], { duration: 360, delay: 60, easing: EASE_CLOSE }).finished;
    }
    done.then(() => {
      el.remove();
      document.documentElement.classList.remove('w-reading');
      cur = null;
      onClosed && onClosed(it);
    });
  }

  addEventListener('popstate', () => {
    if (cur && !cur.closing) close();
  });
  addEventListener('keydown', (e) => {
    if (!cur) return;
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey) {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      // 轮播先在图间走，走到头了再翻到相邻一条
      const car = cur.col.querySelector('.w-rd-car');
      if (!(car && car.__step && car.__step(d))) nav(d);
    }
  });

  return { open, close: requestClose, get isOpen() { return !!cur; }, get it() { return cur && cur.it; } };
}
