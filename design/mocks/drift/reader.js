/* ─────────────────────────────────────────────────────────────
   阅读层：从碎片展开成一块像素阶梯边的磨砂面板。展开方式（?open=）：
     fly / grow  面板从碎片的矩形 FLIP 长到阅读尺寸（fly 时镜头已先飞到它；grow 时就在原位）
     pixel       面板直接在阅读尺寸上出现，碎片的画面铺在上面，从最粗一档一档档变清楚，再让位给正文
     page        碎片朝镜头滑近、立起来，成为一页纸
   收回时反过来，落回碎片此刻的矩形。
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const IMG = (p) => `../layout-plane/${p}`;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const dot = (d) => d.slice(0, 10).replace(/-/g, ' · ');
  const paras = (s) => (s || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_CLOSE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  const ext = (h) => (/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function body(it, k) {
    const a = it.ref;
    if (it.kind === 'article')
      return `<p class="rd-meta"><span class="sec">随笔</span><time>${dot(a.date)}</time><span>${a.chars} 字</span><span>${a.tags.map(esc).join(' · ')}</span></p>
        <h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1><p class="rd-lede">${esc(a.desc)}</p><hr class="rd-rule"><div class="md">${a.html}</div>`;
    if (it.kind === 'project')
      return `<p class="rd-meta"><span class="sec">项目</span><time>${dot(a.date)}</time><span>${esc(a.status)}</span></p>
        <h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1><p class="rd-lede">${esc(a.desc)}</p>
        ${a.links.length ? `<ul class="rd-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul>` : ''}
        <hr class="rd-rule"><div class="md">${a.html}</div>${a.note ? `<p class="rd-note">${esc(a.note.awake)}</p>` : ''}`;
    if (it.kind === 'img') {
      const im = a.images[k - 1];
      const sibs = a.images.length > 1 ? `<div class="rd-sibs">${a.images.map((s, n) => `<button type="button" data-k="${n + 1}" aria-current="${n + 1 === k}" aria-label="${esc(s.alt || `第 ${n + 1} 张`)}"><img src="${IMG(s.m)}" alt=""></button>`).join('')}</div>` : '';
      return `<figure class="rd-fig"><img class="rd-img" src="${IMG(im.l)}" alt="${esc(im.alt)}"></figure>${sibs}
        <p class="rd-meta"><span class="sec">瞬间</span><time>${dot(a.date)}</time>${a.images.length > 1 ? `<span class="alt">${esc(im.alt)}</span>` : ''}</p>
        <h1 class="rd-title small" tabindex="-1">${esc(a.title)}</h1>${paras(a.text).map((p) => `<p class="rd-text">${esc(p)}</p>`).join('')}`;
    }
    const [l1 = '', ...rest] = paras(a.text);
    return `<p class="rd-meta"><span class="sec">瞬间</span><time>${dot(a.date)}</time></p><h1 class="rd-title" tabindex="-1">${esc(a.title)}</h1>
      <p class="rd-big">${esc(l1)}</p>${rest.map((p) => `<p class="rd-text ink">${esc(p)}</p>`).join('')}`;
  }

  window.DriftReader = function createReader({ onClosed, onClosing, onDim }) {
    let cur = null;

    function panelRect() {
      const w = Math.min(760, innerWidth - 24);
      const top = innerWidth < 640 ? 64 : 72;
      return { left: (innerWidth - w) / 2, top, width: w, height: innerHeight - top - 20 };
    }
    const geo = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    /* grow / page：面板里钉一张碎片自己的清晰图（按卡片比例、随面板变宽），面板长大时看得见是这块碎片在长 */
    function cardLayer(shell, it, lods) {
      const c = document.createElement('div');
      c.className = 'rd-card';
      Object.assign(c.style, { backgroundImage: `url(${lods[0]})`, aspectRatio: `${it.cw} / ${it.ch}` });
      shell.appendChild(c);
      return c;
    }
    const flip = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    const anim = (el, kf, o) => el.animate(kf, { fill: 'both', ...o, duration: RM ? 0 : o.duration, delay: RM ? 0 : o.delay || 0 });

    /* pixel：碎片的画面按卡片比例铺在面板上方，lods 依次换档 */
    function pixelLayer(shell, it, lods) {
      const pr = shell.getBoundingClientRect();
      const w = pr.width - 48;
      const h = Math.min(pr.height - 48, (w * it.ch) / it.cw);
      const ww = (h * it.cw) / it.ch;
      const px = document.createElement('div');
      px.className = 'rd-px';
      Object.assign(px.style, { width: `${ww}px`, height: `${h}px`, left: `${(pr.width - ww) / 2}px`, top: '24px', backgroundImage: `url(${lods[3]})` });
      shell.appendChild(px);
      return px;
    }
    function stepLods(px, lods, seq, every) {
      return new Promise((res) => {
        let i = 0;
        const go = () => {
          px.style.backgroundImage = `url(${lods[seq[i]]})`;
          px.dataset.lod = seq[i];
          i++;
          if (i < seq.length) setTimeout(go, RM ? 0 : every);
          else setTimeout(res, RM ? 0 : every);
        };
        go();
      });
    }

    function open(it, k, fromRect, opts = {}) {
      if (cur) return;
      const mode = opts.mode || 'fly';
      const el = document.createElement('div');
      el.className = `rd rd-${mode}`;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', it.ref.title);
      el.dataset.kind = it.kind;
      el.innerHTML = `<div class="rd-shell"><div class="rd-glass"></div><div class="rd-scroll"><div class="rd-col">${body(it, k)}</div></div></div><button type="button" class="rd-close">返回</button>`;
      document.body.appendChild(el);
      const shell = el.querySelector('.rd-shell');
      const pr = panelRect();
      Object.assign(shell.style, { left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px` });
      const col = el.querySelector('.rd-col');
      const close = el.querySelector('.rd-close');
      cur = { el, shell, it, k, fromRect, mode, opts };
      document.documentElement.classList.add('reading');
      onDim(1);

      let reveal = 300;
      if (mode === 'pixel') {
        // 面板一跳出现；碎片的画面在上面由粗到细对焦，然后淡出、正文显影
        anim(shell, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'steps(3, end)' });
        const px = pixelLayer(shell, it, opts.lods);
        cur.px = px;
        col.style.opacity = '0';
        stepLods(px, opts.lods, [3, 2, 1, 0], 110).then(() => {
          if (!cur || cur.closing) return;
          anim(px, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'steps(4, end)' });
          col.style.opacity = '';
          anim(col, [{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 420, easing: 'steps(5, end)' });
        });
        reveal = 9999;
      } else if (mode === 'page' || mode === 'grow') {
        // 面板的几何直接从碎片的矩形长到阅读尺寸（不做非等比缩放，碎片的画面不变形）
        const card = cardLayer(shell, it, opts.lods);
        cur.card = card;
        const kf = mode === 'page'
          ? [
              { ...geo(fromRect), transform: 'perspective(1200px) rotateX(24deg)', opacity: 0.7 },
              { ...geo({ ...pr, top: pr.top + 10 }), transform: 'perspective(1200px) rotateX(3deg)', opacity: 1, offset: 0.78 },
              { ...geo(pr), transform: 'none', opacity: 1 },
            ]
          : [{ ...geo(fromRect), opacity: 0.92 }, { ...geo(pr), opacity: 1 }];
        anim(shell, kf, { duration: mode === 'page' ? 880 : 780, easing: EASE_OPEN });
        // 碎片的画面先跟着长，长到一半后一跳一跳地退掉，正文接上
        anim(card, [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 760, easing: 'steps(6, end)' });
        reveal = mode === 'page' ? 480 : 400;
      } else {
        anim(shell, [{ transform: flip(fromRect, pr), opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 640, easing: EASE_OPEN });
      }
      if (reveal < 9999) anim(col, [{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 520, delay: reveal, easing: 'steps(5, end)' });
      anim(close, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: mode === 'pixel' ? 720 : 520 });
      setTimeout(() => el.querySelector('.rd-title')?.focus({ preventScroll: true }), RM ? 0 : 680);

      close.addEventListener('click', requestClose);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('.rd-sibs button');
        if (b) return swap(+b.dataset.k);
        if (!e.target.closest('.rd-shell')) requestClose();
      });
    }

    function swap(k) {
      if (!cur || cur.k === k) return;
      const a = cur.it.ref;
      const im = a.images[k - 1];
      const img = cur.el.querySelector('.rd-img');
      img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => {
        img.src = IMG(im.l);
        img.alt = im.alt;
        const alt = cur.el.querySelector('.alt');
        if (alt) alt.textContent = im.alt;
        img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, fill: 'forwards' });
      });
      cur.el.querySelectorAll('.rd-sibs button').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.k === k)));
      cur.k = k;
    }

    function requestClose() {
      if (!cur || cur.closing) return;
      cur.closing = true;
      const { el, shell, mode, opts } = cur;
      const target = (opts.getRect && opts.getRect()) || cur.fromRect;
      const pr = panelRect();
      const col = el.querySelector('.rd-col');
      col.getAnimations().forEach((a) => a.cancel());
      anim(col, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'steps(3, end)' });
      anim(el.querySelector('.rd-close'), [{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
      onDim(0);
      onClosing && onClosing();
      let done;
      if (mode === 'pixel') {
        // 正文退掉，碎片的画面回来，由细到粗散焦，面板一跳消失
        const px = cur.px || pixelLayer(shell, cur.it, opts.lods);
        px.getAnimations().forEach((a) => a.cancel());
        px.style.opacity = '1';
        done = stepLods(px, opts.lods, [0, 1, 2, 3], 90).then(() => anim(shell, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'steps(3, end)' }).finished);
      } else if (mode === 'page' || mode === 'grow') {
        const card = cur.card || cardLayer(shell, cur.it, opts.lods);
        card.getAnimations().forEach((a) => a.cancel());
        anim(card, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 60, easing: 'steps(4, end)' });
        shell.getAnimations().forEach((a) => a.cancel());
        const kf = mode === 'page'
          ? [{ ...geo(pr), transform: 'none', opacity: 1 }, { ...geo(target), transform: 'perspective(1200px) rotateX(18deg)', opacity: 0.6 }]
          : [{ ...geo(pr), opacity: 1 }, { ...geo(target), opacity: 0.9 }];
        done = anim(shell, kf, { duration: 600, delay: 90, easing: EASE_CLOSE }).finished;
      } else {
        done = anim(shell, [{ transform: 'none', opacity: 1 }, { transform: flip(target, pr), opacity: 0.4 }], { duration: 520, delay: 90, easing: EASE_CLOSE }).finished;
      }
      done.then(() => {
        el.remove();
        document.documentElement.classList.remove('reading');
        const it = cur.it;
        cur = null;
        onClosed(it);
      });
    }

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cur) { e.preventDefault(); requestClose(); }
    });

    return { open, close: requestClose, get isOpen() { return !!cur; } };
  };
})();
