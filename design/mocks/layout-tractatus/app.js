/* ─────────────────────────────────────────────────────────────
   命题体 · 原型脚本（渐进增强：没有它，整份文本全部展开、照常可读）
   · 展开 / 收起：一次只开一条；开在上方的会被即时收起并补偿滚动，目标行不跳
   · 地址：#1.1 / #1.13 / #2，前进后退同步展开状态
   · 键盘：命题之间 ↑ ↓（或 j / k）移动，Enter / 空格 开合
   · 仪器层：页头、导览轨按所在位置的时辰取色；边距线随阅读伸长
   · 醒 / 梦：换字（短暂失焦后落定）、换段、浮起与流光、底色微暖
   ───────────────────────────────────────────────────────────── */
(() => {
  const root = document.documentElement;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const NAV = JSON.parse(document.getElementById('nav-data').textContent);
  const PAL = JSON.parse(document.getElementById('pal-data').textContent);
  const props = [...document.querySelectorAll('.prop')];
  const bar = document.querySelector('.bar');
  const rail = document.querySelector('.rail');
  const railList = rail.querySelector('.rail-list');
  const railLoc = rail.querySelector('.rail-loc');
  const here = document.querySelector('.here');
  const regions = [...document.querySelectorAll('.motto-sec, .tide, .sec')];
  const T_SETTLE = 1700;

  /* ── 初始：全部收起（CSS 在 .js 下已经先收好，这里只补 aria） ── */
  for (const p of props) {
    p.querySelector('.pt').setAttribute('aria-expanded', 'false');
    let k = 0;
    p.querySelectorAll('.pi > :not(.md):not(.plates), .pi > .md > *, .pi > .plates > *').forEach((el) => {
      el.style.setProperty('--k', Math.min(k++, 14));
    });
  }

  const propOf = (n) => {
    const el = document.getElementById(n);
    return el ? el.closest('.prop') : null;
  };
  const barH = () => bar.getBoundingClientRect().height;

  /* ── 滚动补间（RM 下直接跳） ── */
  let tween = 0;
  function scrollToY(y, dur = 820) {
    cancelAnimationFrame(tween);
    y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
    if (RM.matches || dur === 0) { scrollTo(0, y); return; }
    const y0 = scrollY;
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      scrollTo(0, y0 + (y - y0) * ease(t));
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }
  const stopTween = () => cancelAnimationFrame(tween);
  addEventListener('wheel', stopTween, { passive: true });
  addEventListener('touchstart', stopTween, { passive: true });

  function scrollToEl(el, frac = 0.16, dur) {
    const top = el.getBoundingClientRect().top + scrollY;
    scrollToY(top - Math.max(barH() + 16, innerHeight * frac), dur);
  }

  /* ── 开合 ── */
  const timers = new WeakMap();
  const T_OPEN = 640;
  const T_FOLD = 420;
  const clearTimers = (p) => (timers.get(p) || []).forEach(clearTimeout);
  function open(p, { scroll = true, develop = true } = {}) {
    if (p.classList.contains('open')) return;
    const row = p.querySelector('.pt');
    const pb = p.querySelector('.pb');
    const pi = p.querySelector('.pi');
    const before = row.getBoundingClientRect().top;
    // 其它展开的命题：在目标上方的即时收起（并补偿滚动，目标行不动），下方的随动画收起
    for (const q of props) {
      if (q === p || !q.classList.contains('open')) continue;
      const above = q.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING;
      close(q, { instant: !!above });
    }
    const after = row.getBoundingClientRect().top;
    if (Math.abs(after - before) > 0.5) scrollTo(0, scrollY + (after - before));

    clearTimers(p);
    row.setAttribute('aria-expanded', 'true');
    if (!develop || RM.matches) {
      p.classList.add('snap', 'open', 'grown', 'settled');
      pb.style.height = '';
      void p.offsetHeight;
      requestAnimationFrame(() => p.classList.remove('snap'));
    } else {
      p.classList.add('open');
      pb.style.height = `${pi.offsetHeight}px`; // 从 0 过渡到实测高度
      timers.set(p, [
        setTimeout(() => { p.classList.add('grown'); pb.style.height = ''; }, T_OPEN + 80),
        setTimeout(() => p.classList.add('settled'), T_SETTLE),
      ]);
    }
    buildRail();
    if (scroll) {
      const top = row.getBoundingClientRect().top;
      if (top < barH() + 8 || top > innerHeight * 0.42) setTimeout(() => scrollToEl(row), RM.matches ? 0 : 40);
    }
  }
  function close(p, { instant = false } = {}) {
    if (!p.classList.contains('open')) return;
    clearTimers(p);
    const pb = p.querySelector('.pb');
    p.querySelector('.pt').setAttribute('aria-expanded', 'false');
    p.querySelector('.pi').style.removeProperty('--prog');
    if (instant || RM.matches) {
      p.classList.add('snap');
      p.classList.remove('open', 'grown', 'settled');
      pb.style.height = '';
      void p.offsetHeight;
      requestAnimationFrame(() => p.classList.remove('snap'));
    } else {
      pb.style.height = `${pb.offsetHeight}px`; // auto → 定值，才能过渡回 0
      p.classList.remove('grown', 'settled');
      void pb.offsetHeight;
      p.classList.remove('open');
      pb.style.height = '0px';
      timers.set(p, [setTimeout(() => { pb.style.height = ''; }, T_FOLD + 60)]);
    }
    buildRail();
  }

  /* ── 地址 ── */
  function go(n, { push = true, from = 'click' } = {}) {
    const el = document.getElementById(n);
    if (!el) return;
    const p = propOf(n);
    const deep = p && el !== p; // 小节（1.13）或条目内部
    if (p) {
      const wasOpen = p.classList.contains('open');
      open(p, { scroll: !deep, develop: !deep && from !== 'load' });
      if (deep) requestAnimationFrame(() => scrollToEl(el, 0.2, wasOpen ? 820 : 0));
      else if (from === 'load') scrollToEl(p.querySelector('.pt'), 0.16, 0);
    } else {
      for (const q of props) close(q, { instant: from !== 'click' });
      scrollToEl(el, 0.16, from === 'load' ? 0 : 820);
    }
    if (push && location.hash !== `#${n}`) history.pushState({ n }, '', `#${n}`);
  }
  function syncFromHash(from) {
    const n = decodeURIComponent(location.hash.slice(1));
    if (!n || n === 'top') {
      for (const q of props) close(q);
      if (from !== 'load') scrollToY(0);
      return;
    }
    go(n, { push: false, from });
  }
  addEventListener('popstate', () => syncFromHash('pop'));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const n = decodeURIComponent(a.getAttribute('href').slice(1));
    e.preventDefault();
    if (a.classList.contains('pt')) {
      const p = a.closest('.prop');
      if (p.classList.contains('open')) {
        close(p);
        const sec = p.closest('.sec').id;
        history.pushState({ n: sec }, '', `#${sec}`);
      } else {
        open(p);
        history.pushState({ n }, '', `#${n}`);
      }
      return;
    }
    if (a.dataset.fold) {
      const p = propOf(a.dataset.fold);
      const row = p.querySelector('.pt');
      // 先把行带回视野，再收起：读完收起时不会落进下一个版块的中段
      const top = row.getBoundingClientRect().top;
      if (top < barH()) scrollToY(scrollY + top - innerHeight * 0.3, 0);
      close(p);
      history.pushState({ n: p.closest('.sec').id }, '', `#${p.closest('.sec').id}`);
      row.focus({ preventScroll: true });
      return;
    }
    if (n === 'top') { scrollToY(0); history.pushState({}, '', location.pathname); return; }
    go(n);
    const target = document.getElementById(n);
    const focusable = target?.matches('.prop') ? target.querySelector('.pt') : target?.querySelector('a');
    focusable?.focus({ preventScroll: true });
  });

  /* ── 键盘 ── */
  const stops = () => [...document.querySelectorAll('.sa, .pt, .prop.open .sub-a')];
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t.matches('input, textarea, [contenteditable]')) return;
    const onStop = t.matches('.sa, .pt, .sub-a');
    if ((e.key === ' ' || e.key === 'Spacebar') && t.matches('.pt')) {
      e.preventDefault();
      t.click();
      return;
    }
    const dir = { ArrowDown: 1, ArrowUp: -1, j: 1, k: -1 }[e.key];
    if (!dir) return;
    if (!onStop && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return; // 阅读时方向键照常滚动
    e.preventDefault();
    const list = stops();
    let i = list.indexOf(t);
    if (i < 0) {
      // 从阅读线附近的那一条开始
      const line = innerHeight * 0.38;
      i = list.findIndex((el) => el.getBoundingClientRect().top > line) - (dir > 0 ? 1 : 0);
      if (i < -1) i = list.length - 1;
    }
    const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
    if (!next) return;
    next.focus({ preventScroll: true });
    const r = next.getBoundingClientRect();
    if (r.top < barH() + 24 || r.bottom > innerHeight - 80) scrollToEl(next, 0.34, 480);
  });

  /* ── 导览轨（只有宽屏显示；收起时只列版块与条目，展开的那条带出它的小节） ── */
  let railItems = [];
  function buildRail() {
    const openN = props.find((p) => p.classList.contains('open'))?.id;
    const rows = [];
    for (const it of NAV) {
      rows.push({ n: it.n, t: it.t, depth: it.depth });
      if (it.n === openN) for (const s of it.subs) rows.push({ n: s.n, t: s.t, depth: s.depth });
    }
    railList.innerHTML = rows
      .map(
        (r) =>
          `<li class="d${r.depth}${r.n === openN ? ' is-open' : ''}" data-n="${r.n}"><a href="#${r.n}" data-label="${r.n}　${esc(r.t)}" aria-label="${r.n} ${esc(r.t)}"></a></li>`,
      )
      .join('');
    railItems = [...railList.children];
    lastCur = null;
    frame();
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* ── 取色：按文档位置（页头取顶部那一行，导览轨取阅读线） ── */
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  function paletteAt(docY) {
    for (const el of regions) {
      const top = el.offsetTop;
      const h = el.offsetHeight;
      if (docY < top + h || el === regions[regions.length - 1]) {
        if (el.classList.contains('tide')) {
          const t = Math.min(1, Math.max(0, (docY - top) / h));
          const A = PAL[el.dataset.from];
          const B = PAL[el.dataset.to];
          const o = {};
          for (const k of ['bg', 'fg', 'soft', 'faint', 'glow']) o[k] = mix(A[k], B[k], t);
          // 字色在潮线中段一次翻面（底色是渐变，字不能跟着渐变成灰）
          const s = t < 0.5 ? A : B;
          o.fg = s.fg; o.soft = s.soft; o.faint = s.faint;
          o.dark = s.dark;
          return o;
        }
        return PAL[el.dataset.hour];
      }
    }
    return PAL.dusk;
  }
  const rgb = (c) => `rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0})`;
  function paint(el, P) {
    el.style.setProperty('--c-bg', rgb(P.bg));
    el.style.setProperty('--c-fg', rgb(P.fg));
    el.style.setProperty('--c-soft', rgb(P.soft));
    el.style.setProperty('--c-amb', P.dark > 0.5 ? '#e2ae6e' : '#ad7634');
  }

  /* ── 每帧：取色、所在位置、阅读进度 ── */
  let lastCur = null;
  let raf = 0;
  function frame() {
    raf = 0;
    const vh = innerHeight;
    paint(bar, paletteAt(scrollY + 30));
    const Pmid = paletteAt(scrollY + vh * 0.5);
    paint(rail, Pmid);
    paint(here, paletteAt(scrollY + 30));
    const amb = document.querySelector('.ambient');
    amb.style.setProperty('--c-glow', `${Pmid.glow[0] | 0} ${Pmid.glow[1] | 0} ${Pmid.glow[2] | 0}`);
    amb.style.setProperty('--c-glow-a', (Pmid.glow[3] * 0.55).toFixed(3));

    // 所在位置：阅读线以上最后一个带编号的标题
    const line = vh * 0.38;
    let cur = null;
    for (const el of document.querySelectorAll('.sp, .ph, .prop.open .sub')) {
      if (el.getBoundingClientRect().top <= line) cur = el;
      else break;
    }
    const n = cur ? (cur.classList.contains('sp') ? cur.closest('.sec').id : cur.classList.contains('ph') ? cur.closest('.prop').id : cur.id) : null;
    if (n !== lastCur) {
      lastCur = n;
      for (const li of railItems) li.classList.toggle('cur', li.dataset.n === n);
      const li = railItems.find((x) => x.dataset.n === n);
      railLoc.querySelector('.num').textContent = n || '';
      railLoc.style.opacity = n ? '' : '0';
      if (li) railLoc.style.setProperty('--y', `${li.offsetTop + 4}px`);
      const label = n ? (cur.classList.contains('sp') ? cur.querySelector('.sp-t').textContent : cur.querySelector('.ttl, .sub-t').textContent) : '';
      here.querySelector('.num').textContent = n || '—';
      here.querySelector('.here-t').textContent = label;
      bar.classList.toggle('located', !!n);
      document.querySelectorAll('.sec').forEach((s) => s.classList.toggle('is-here', s.id === n));
    }

    // 阅读进度：边距线里琥珀那一截
    for (const p of props) {
      if (!p.classList.contains('open') || p.dataset.kind !== 'article') continue;
      const pi = p.querySelector('.pi');
      const r = pi.getBoundingClientRect();
      const prog = Math.min(1, Math.max(0, (vh * 0.5 - r.top) / (r.height - 22)));
      pi.style.setProperty('--prog', prog.toFixed(4));
    }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  new ResizeObserver(kick).observe(document.querySelector('.doc'));

  /* ── 醒 / 梦 ── */
  const toggle = document.querySelector('.toggle');
  function setDream(on, { quiet = false } = {}) {
    root.classList.toggle('dream', on);
    root.dataset.reality = on ? 'dream' : 'wake';
    toggle.setAttribute('aria-pressed', String(on));
    for (const el of document.querySelectorAll('.mw')) {
      const text = on ? el.dataset.d : el.dataset.w;
      if (el.textContent === text) continue;
      if (quiet || RM.matches) { el.textContent = text; continue; }
      // 不同的词在不同的时刻换面
      setTimeout(() => {
        el.classList.add('shift');
        setTimeout(() => { el.textContent = text; el.classList.remove('shift'); lastCur = null; kick(); }, 230);
      }, Math.random() * 520);
    }
    lastCur = null;
    kick();
  }
  toggle.addEventListener('click', () => setDream(!root.classList.contains('dream')));

  /* ── 启动 ── */
  buildRail();
  const q = new URLSearchParams(location.search);
  if (q.has('dream')) {
    root.style.transition = 'none';
    setDream(true, { quiet: true });
    void root.offsetHeight;
    root.style.transition = '';
  }
  if (location.hash) {
    history.scrollRestoration = 'manual';
    requestAnimationFrame(() => syncFromHash('load'));
  }
  kick();

  // 截图与调试用
  window.__tx = { open: (n) => open(propOf(n)), close: (n) => close(propOf(n)), go, setDream };
})();
