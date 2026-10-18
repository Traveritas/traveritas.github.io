/* ─────────────────────────────────────────────────────────────
   内核：可拖的无界平面。
   镜头、惯性、视口回收、悬停与焦点、方块在原处展开成阅读层、历史、目录、醒梦。
   它不知道「距离意味着什么」——每一份副本长什么样、能不能点、打开时周围怎样反应，
   全部问规则（rule）；与规则无关的附加效果是机制（mech），挂在事件上。

   规则的形状（都可省略，除了 place / look / paint）：
     place(t, i, j)          → 这份副本的状态对象；返回 null 就不画它
     look(rec)               → 此刻该画成什么样（任意可比较的值）；变了内核才重画
     paint(rec, look, prev, quiet)
     box(rec, look, b)       → 改平面坐标里的框 b = {x, y, w, h}（抖动、缩小……）
     canOpen(rec) / canHover(rec)
     opening(rec) / closing(rec) / closed()   展开、开始收回、收回落定
     detail(rec, dt, k, lookFrom)             给刚建好的阅读层加料
     init(ctx)
   机制：PlaneKit.mechs[name] = (ctx) => { ctx.on('frame' | 'start' | 'open' | 'close' | 'closed' | 'reality', fn) }
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const K = window.PlaneKit;
  const { rgb } = K.color;
  const { esc, dot, paras } = K.text;
  const { W, H, PAL, NAMES, TILES, START, drop, sec } = K.world;

  K.start = function start({ rule, mechs = [], seam = 'line', detail = 'window' }) {
    const $ = (s, r = document) => r.querySelector(s);
    const root = document.documentElement;
    const stage = $('#stage');
    const recede = $('#recede');
    const world = $('#world');
    const haze = $('#haze');
    const dim = $('#dim');
    const homeBtn = $('#home-btn');
    const tocBtn = $('#toc-btn');
    const toc = $('#toc');
    const realBtn = $('#real-btn');
    const live = $('#live');
    const brand = $('#brand');
    const ctl = $('.ctl');

    const mqRM = matchMedia('(prefers-reduced-motion: reduce)');
    let RM = mqRM.matches;
    mqRM.addEventListener('change', (e) => (RM = e.matches));
    const dur = (ms) => (RM ? 0 : ms);

    const field = K.createField({ stage, el: $('#field'), mode: seam });

    /* ══ 事件 ══ */
    const handlers = {};
    const on = (ev, fn) => (handlers[ev] = handlers[ev] || []).push(fn);
    const emit = (ev, ...a) => (handlers[ev] || []).forEach((fn) => fn(...a));

    /* ══ 视口与虚拟化 ══ */
    let vw = innerWidth;
    let vh = innerHeight;
    let z = 1;
    const cam = { x: START.x, y: START.y };
    const vel = { x: 0, y: 0 };
    const pend = { x: 0, y: 0 };
    let pendTau = 70;
    const nodes = new Map();
    const pool = new Map();
    let frameNo = 0;
    let hoverRec = null;
    let reading = null;
    let presenter = null; // 详情的展示方式，ctx 建好后再造
    const detailName = K.details[detail] ? detail : 'window';
    const options = { hover: true }; // 机制可以关掉逐块悬停（比如「提灯」自己接管想起）

    const zoomFor = (w) => (w < 640 ? 0.6 : w < 1000 ? 0.78 : w < 1700 ? 0.88 : 1);

    /* 平面坐标的框 → 规则调整 → 斜切到屏上坐标（按中心整块下沉，方块本身不斜） */
    function geometry(rec) {
      const t = rec.t;
      let b = { x: t.x + rec.i * W, y: t.y + rec.j * H, w: t.w, h: t.h };
      if (rule.box) b = rule.box(rec, rec.look, b);
      b.y += drop(b.x + b.w / 2);
      return b;
    }

    /* 让一块按规则此刻的样子重画（look 没变就只更新位置） */
    function refresh(rec, { quiet = false } = {}) {
      const look = rule.look(rec);
      if (rec.look !== look) {
        rule.paint(rec, look, rec.look, quiet || RM);
        rec.look = look;
      }
      const g = geometry(rec);
      rec.g = g;
      const el = rec.el;
      el.style.transform = `translate3d(${g.x}px,${g.y}px,0)`;
      el.style.width = `${g.w}px`;
      el.style.height = `${g.h}px`;
    }
    /* 全部重画（换梦面、配图载入之后）：prev 记成 null，不触发去虚 */
    function repaintAll(filter) {
      for (const rec of nodes.values()) {
        if (filter && !filter(rec)) continue;
        rec.look = null;
        refresh(rec, { quiet: true });
      }
    }

    function makeRec(t, i, j, s) {
      const orig = i === 0 && j === 0;
      let el;
      const key = `${t.idx}:${i}:${j}`;
      if (orig) {
        el = document.createElement(t.kind === 'label' ? 'div' : 'a');
        if (t.kind !== 'label') el.href = `#${t.route}`;
        else el.setAttribute('role', 'presentation');
      } else {
        const p = pool.get(t.idx);
        el = (p && p.pop()) || document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.hidden = false;
      }
      el.dataset.k = key;
      el.dataset.r = t.r;
      const rec = { key, t, i, j, el, orig, s, look: undefined };
      nodes.set(key, rec);
      if (!el.parentNode) world.appendChild(el);
      refresh(rec);
      return rec;
    }
    function release(rec) {
      nodes.delete(rec.key);
      if (rec === hoverRec) hoverRec = null;
      rec.el.hidden = true;
      rec.el.classList.remove('focus-in');
      if (!pool.has(rec.t.idx)) pool.set(rec.t.idx, []);
      pool.get(rec.t.idx).push(rec.el);
    }

    const MARGIN = 260;
    function sync() {
      frameNo++;
      const hw = vw / 2 / z + MARGIN;
      const hh = vh / 2 / z + MARGIN;
      const x0 = cam.x - hw;
      const x1 = cam.x + hw;
      const y0 = cam.y - hh;
      const y1 = cam.y + hh;
      // 屏上的矩形在平面坐标里是一个平行四边形；取它的外包
      const i0 = Math.floor(x0 / W) - 1;
      const i1 = Math.floor(x1 / W);
      const j0 = Math.floor((y0 - drop(x1)) / H) - 1;
      const j1 = Math.floor((y1 - drop(x0)) / H);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (i === 0 && j === 0) continue;
          for (const t of TILES) {
            const wx = t.x + i * W;
            const wy = t.y + j * H + drop(wx + t.w / 2);
            if (wx > x1 || wx + t.w < x0 || wy > y1 || wy + t.h < y0) continue;
            const key = `${t.idx}:${i}:${j}`;
            let rec = nodes.get(key);
            if (!rec) {
              const s = rule.place(t, i, j);
              if (!s) continue;
              rec = makeRec(t, i, j, s);
            }
            rec.seen = frameNo;
          }
        }
      for (const rec of nodes.values()) if (!rec.orig && rec.seen !== frameNo) release(rec);
    }

    function origin() {
      return { x: vw / 2 - cam.x * z, y: vh / 2 - cam.y * z };
    }
    function render() {
      const o = origin();
      world.style.transform = `translate3d(${o.x}px,${o.y}px,0) scale(${z})`;
      field.place(o);
      sync();
      const far = Math.hypot((cam.x - START.x) / W, (cam.y - START.y) / H) > 0.85;
      if (homeBtn.hidden === far) homeBtn.hidden = !far;
      toneChrome();
      emit('frame');
    }
    function toneChrome() {
      const at = (sx, sy) => field.colorAt(cam.x + (sx - vw / 2) / z, cam.y + (sy - vh / 2) / z);
      const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      for (const [el, sx] of [[brand, 70], [ctl, vw - 130]]) {
        const tone = lum(at(sx, 40)) < 125 ? 'dark' : 'light';
        if (el.dataset.tone !== tone) el.dataset.tone = tone;
      }
    }
    function resize() {
      vw = innerWidth;
      vh = innerHeight;
      z = zoomFor(vw);
      field.resize(z, vw, vh);
      render();
    }

    /* ══ 运动：拖拽、惯性、滚轮、方向键 ══ */
    let raf = 0;
    let last = 0;
    let dirty = false;
    const TAU = 330; // 惯性的衰减时间常数（ms）
    function kick() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }
    function tick(now) {
      raf = 0;
      const dt = Math.min(48, now - last);
      last = now;
      let moving = false;
      if (!drag && (vel.x || vel.y)) {
        cam.x += vel.x * dt;
        cam.y += vel.y * dt;
        const k = Math.exp(-dt / TAU);
        vel.x *= k;
        vel.y *= k;
        if (Math.hypot(vel.x, vel.y) * z < 0.012) vel.x = vel.y = 0;
        else moving = true;
      }
      if (pend.x || pend.y) {
        const k = RM ? 1 : 1 - Math.exp(-dt / pendTau);
        cam.x += pend.x * k;
        cam.y += pend.y * k;
        pend.x -= pend.x * k;
        pend.y -= pend.y * k;
        if (Math.hypot(pend.x, pend.y) * z < 0.3) {
          cam.x += pend.x;
          cam.y += pend.y;
          pend.x = pend.y = 0;
          pendTau = 70;
        } else moving = true;
      }
      render();
      if (moving || dirty) {
        dirty = false;
        raf = requestAnimationFrame(tick);
      }
    }
    const stopMotion = () => { vel.x = vel.y = 0; pend.x = pend.y = 0; };
    function flyTo(x, y, tau = 150) {
      stopMotion();
      pendTau = tau;
      pend.x = x - cam.x;
      pend.y = y - cam.y;
      kick();
    }

    let drag = null;
    let suppressClick = false;
    stage.addEventListener('pointerdown', (e) => {
      if ((reading && presenter.modal) || e.button > 0) return;
      vel.x = vel.y = 0;
      pend.x = pend.y = 0;
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, s: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
      suppressClick = false;
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) {
        drag.moved = true;
        root.classList.add('dragging');
        try { stage.setPointerCapture(e.pointerId); } catch {}
        setHover(null);
      }
      if (drag.moved) {
        cam.x -= (e.clientX - drag.lx) / z;
        cam.y -= (e.clientY - drag.ly) / z;
        drag.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        while (drag.s.length > 2 && e.timeStamp - drag.s[0].t > 90) drag.s.shift();
        dirty = true;
        kick();
      }
      drag.lx = e.clientX;
      drag.ly = e.clientY;
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        suppressClick = true;
        const a = drag.s[0];
        const b = drag.s[drag.s.length - 1];
        const dt = Math.max(16, b.t - a.t);
        if (!RM && e.timeStamp - b.t < 60) {
          vel.x = -(b.x - a.x) / dt / z;
          vel.y = -(b.y - a.y) / dt / z;
          kick();
        }
        root.classList.remove('dragging');
      }
      drag = null;
    }
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);

    stage.addEventListener(
      'wheel',
      (e) => {
        if (reading && presenter.modal) return;
        e.preventDefault();
        if (e.ctrlKey) return;
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.deltaMode === 1) { dx *= 32; dy *= 32; }
        else if (e.deltaMode === 2) { dx *= vw; dy *= vh; }
        if (e.shiftKey && !dx) { dx = dy; dy = 0; }
        vel.x = vel.y = 0;
        pendTau = 70;
        pend.x += dx / z;
        pend.y += dy / z;
        kick();
      },
      { passive: false },
    );

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (reading) { e.preventDefault(); requestClose(); }
        else if (toc.classList.contains('open')) { setToc(false); tocBtn.focus(); }
        return;
      }
      if (reading || e.altKey || e.ctrlKey || e.metaKey) return;
      if (toc.contains(document.activeElement)) return;
      const step = (e.shiftKey ? 620 : 300) / z;
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (map[e.key]) {
        e.preventDefault();
        vel.x = vel.y = 0;
        pendTau = 110;
        pend.x += map[e.key][0];
        pend.y += map[e.key][1];
        kick();
      } else if (e.key === 'Home') {
        e.preventDefault();
        flyTo(START.x, START.y);
      }
    });

    /* ══ 悬停与焦点 ══ */
    function setHover(rec) {
      if (rec === hoverRec) return;
      const prev = hoverRec;
      hoverRec = rec;
      if (prev && nodes.get(prev.key) === prev) refresh(prev);
      if (rec) refresh(rec);
    }
    world.addEventListener('pointerover', (e) => {
      if (drag?.moved || (reading && presenter.modal) || !options.hover || e.pointerType === 'touch') return;
      const el = e.target.closest('.t');
      const rec = el && nodes.get(el.dataset.k);
      setHover(rec && rec.t.kind !== 'label' && (!rule.canHover || rule.canHover(rec)) ? rec : null);
    });
    world.addEventListener('pointerleave', () => setHover(null));

    let quietFocus = false;
    /* 键盘：原件获得焦点时，把它带进视野 */
    world.addEventListener('focusin', (e) => {
      const el = e.target.closest('.t.orig');
      const rec = el && nodes.get(el.dataset.k);
      if (!rec || reading || quietFocus) return;
      const r = screenRect(rec);
      const m = 70;
      if (r.left < m || r.top < m + 40 || r.right > vw - m || r.bottom > vh - m) flyTo(rec.g.x + rec.g.w / 2, rec.g.y + rec.g.h / 2, 120);
    });

    function screenRect(rec) {
      const o = origin();
      const g = rec.g;
      const left = o.x + g.x * z;
      const top = o.y + g.y * z;
      return { left, top, width: g.w * z, height: g.h * z, right: left + g.w * z, bottom: top + g.h * z };
    }

    /* 按到 src 的屏幕距离依次对每一块做 fn（屏外的立即、静默地做）。计时器归当前这一段过渡，换段时一并清掉 */
    let phaseTimers = [];
    const clearPhase = () => { phaseTimers.forEach(clearTimeout); phaseTimers = []; };
    function ripple(src, fn, base, perPx, cap) {
      const c = screenRect(src);
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      for (const rec of nodes.values()) {
        if (rec === src) continue;
        const r = screenRect(rec);
        if (r.right < -80 || r.left > vw + 80 || r.bottom < -80 || r.top > vh + 80) {
          fn(rec, true);
          continue;
        }
        const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
        if (RM) fn(rec, true);
        else phaseTimers.push(setTimeout(() => nodes.get(rec.key) === rec && fn(rec, false), base + Math.min(cap, d * perPx)));
      }
    }

    /* ══ 打开：方块在原处展开成阅读层 ══ */
    const origRec = (route) => [...nodes.values()].find((r) => r.orig && r.t.route === route);

    world.addEventListener('click', (e) => {
      const el = e.target.closest('.t');
      if (el && el.tagName === 'A') e.preventDefault();
      if (suppressClick || (reading && presenter.modal)) return;
      const rec = el && nodes.get(el.dataset.k);
      if (!rec || rec.t.kind === 'label' || (rule.canOpen && !rule.canOpen(rec))) return;
      // 非模态的详情：平面上点另一块，先收回当前这块再打开它
      if (reading) { if (reading.rec !== rec && !reading.closing) close({ then: () => { open(rec, { push: false }); if (reading) history.replaceState({ pl: reading.route }, '', `#${reading.route}`); } }); return; }
      open(rec);
    });

    const EASE_OPEN = 'cubic-bezier(0.32, 0.72, 0, 1)';
    const EASE_CLOSE = 'cubic-bezier(0.45, 0, 0.2, 1)';

    function link(href) {
      let m = href.match(/^\/articles\/([^/]+)\/?$/);
      if (m) return `#/a/${m[1]}`;
      m = href.match(/^\/projects\/([^/]+)\/?$/);
      if (m) return `#/p/${m[1]}`;
      return href;
    }
    const ext = (h) => (/^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '');

    function buildDetail(rec, k) {
      const t = rec.t;
      const a = t.ref;
      const dt = document.createElement('div');
      dt.className = 'dt';
      dt.dataset.r = t.r;
      dt.setAttribute('role', 'dialog');
      dt.setAttribute('aria-modal', 'true');
      let body = '';
      let kind = 'reading';
      if (t.kind === 'article') {
        body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time><span>${a.chars} 字</span><span>${a.tags.map(esc).join(' · ')}</span></p>
          <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-lede" data-f="desc">${esc(a.desc)}</p><hr class="dt-rule">
          <div class="md">${a.html}</div>
          ${a.related.length ? `<nav class="dt-rel"><h2>关联篇章</h2><ul>${a.related.map((r) => `<li><a href="${link(r.href)}">${esc(r.label)}</a></li>`).join('')}</ul></nav>` : ''}</article>`;
      } else if (t.kind === 'project') {
        body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time><span>${esc(a.status)}</span></p>
          <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-lede" data-f="desc">${esc(a.desc)}</p>
          ${a.links.length ? `<ul class="dt-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul>` : ''}<hr class="dt-rule">
          <div class="md">${a.html}</div>
          ${a.note ? `<p class="dt-note"><span data-w>${esc(a.note.awake)}</span><span data-d>${esc(a.note.dream)}</span></p>` : ''}</article>`;
      } else if (t.kind === 'img') {
        kind = 'moment';
        const im = a.images[k - 1];
        const box = fitImage(im);
        const sibs = a.images.length > 1 ? `<div class="dt-sibs" role="group" aria-label="同一则里的其他图">${a.images.map((s, n) => `<button type="button" data-k="${n + 1}" aria-current="${n + 1 === k}" aria-label="${esc(s.alt || `第 ${n + 1} 张`)}"><img src="${s.m}" alt=""></button>`).join('')}</div>` : '';
        body = `<figure class="dt-fig"><div class="dt-img" data-f="img" style="width:${box.w}px;height:${box.h}px"><img src="${im.l}" alt="${esc(im.alt)}"></div>
          <figcaption class="dt-cap" style="width:${box.w}px"><h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${dot(a.date)}</time></p>
          ${a.images.length > 1 ? `<p class="alt">${esc(im.alt)}</p>` : ''}${a.text ? `<div class="txt">${paras(a.text).map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}</figcaption>${sibs}</figure>`;
      } else if (t.kind === 'note') {
        kind = 'short';
        const [l1 = '', l2 = ''] = paras(a.text);
        body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><time>${a.date.replace('T', ' · ').replace(/-/g, ' · ')}</time></p>
          <h1 class="dt-title" tabindex="-1">${esc(a.title)}</h1><p class="big" data-f="line">${esc(l1)}</p><p class="sheen-line">${esc(l2)}</p>
          <p class="dt-meta" style="margin-top:40px">${a.tags.map(esc).join(' · ')}</p></article>`;
      } else if (t.kind === 'about') {
        kind = 'short';
        body = `<article class="dt-col"><p class="dt-meta" data-f="meta"><span class="sec">${sec(t.r)}</span><span>${NAMES.dawn[2]}</span></p>
          <h1 class="dt-title" data-f="title" tabindex="-1">${esc(a.title)}</h1><p class="big" data-f="q">${esc(a.question)}</p><hr class="dt-rule">
          <p class="dt-lede"><span data-w>${esc(a.line)}</span><span data-d>${esc(a.dreamLine)}</span></p>
          <ul class="dt-links">${a.links.map((l) => `<li><a href="${esc(l.href)}"${ext(l.href)}>${esc(l.label)} ↗</a></li>`).join('')}</ul></article>`;
      }
      dt.classList.add(`dt-${kind}`);
      dt.setAttribute('aria-label', t.kind === 'about' ? '关于' : a.title);
      dt.innerHTML = `<div class="dt-win"><div class="dt-bg"></div><div class="dt-scroll">${body}</div></div><button type="button" class="dt-close">返回</button>`;
      return { dt, kind };
    }

    function fitImage(im) {
      if (presenter.fitImage) return presenter.fitImage(im);
      const small = vw < 640;
      const maxW = Math.min(vw - (small ? 32 : 96), 1120);
      const maxH = vh - (small ? 76 : 92) - (small ? 150 : 170);
      let w = maxW;
      let h = (w * im.h) / im.w;
      if (h > maxH) { h = maxH; w = (h * im.w) / im.h; }
      return { w: Math.round(w), h: Math.round(h) };
    }

    function animate(el, kf, o) {
      if (!el) return null;
      return el.animate(kf, { fill: 'both', ...o, duration: dur(o.duration ?? 0), delay: dur(o.delay ?? 0) });
    }

    function flipPairs(rec, dt) {
      const pairs = [];
      for (const to of dt.querySelectorAll('[data-f]')) {
        const from = rec.el.querySelector(`[data-f="${to.dataset.f}"]`);
        if (!from) continue;
        const a = from.getBoundingClientRect();
        if (!a.width) continue;
        pairs.push({ name: to.dataset.f, to, a, fs: parseFloat(getComputedStyle(from).fontSize) });
      }
      return pairs;
    }
    function flipFrom(p) {
      const b = p.to.getBoundingClientRect();
      if (p.name === 'img') return `translate(${p.a.left - b.left}px,${p.a.top - b.top}px) scale(${p.a.width / b.width},${p.a.height / b.height})`;
      const s = p.fs / parseFloat(getComputedStyle(p.to).fontSize);
      return `translate(${p.a.left - b.left}px,${p.a.top - b.top}px) scale(${s})`;
    }

    function open(rec, { push = true, k } = {}) {
      if (reading || !rec) return;
      stopMotion();
      setHover(null);
      setToc(false);
      const t = rec.t;
      k = k || t.k;
      const tileRect = screenRect(rec);
      const { dt, kind } = buildDetail(rec, k);
      dt.dataset.detail = detailName;
      document.body.appendChild(dt);
      const win = dt.querySelector('.dt-win');
      const closeBtn = dt.querySelector('.dt-close');
      const route = t.kind === 'img' ? `/m/${t.ref.slug}/${k}` : t.route;
      if (push) history.pushState({ pl: route }, '', `#${route}`);
      root.classList.add('reading');
      if (presenter.modal) {
        stage.setAttribute('aria-hidden', 'true');
        stage.inert = true;
        toc.inert = true;
      }
      const lookFrom = rec.look;
      reading = { rec, dt, win, kind, k, route, tileRect, lookFrom, partial: rule.isPartial ? rule.isPartial(rec, lookFrom) : false };

      // 周围怎样反应由规则决定；阅读层本身怎样进场由详情决定
      clearPhase();
      rule.opening && rule.opening(rec);
      rule.detail && rule.detail(rec, dt, k, lookFrom);
      presenter.enter(reading);

      // 交互
      closeBtn.addEventListener('click', requestClose);
      dt.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#/"]');
        if (a) { e.preventDefault(); return jump(a.getAttribute('href').slice(1)); }
        const sib = e.target.closest('.dt-sibs button');
        if (sib) return swapImage(+sib.dataset.k);
        if (e.target.closest('.dt-col, .dt-img, .dt-cap, .dt-sibs, .dt-close')) return;
        if (presenter.modal) requestClose(); // 模态：点阅读栏以外就收回
      });
      // 栏外（被裁掉的两侧）滚轮照样滚正文
      const scroller = dt.querySelector('.dt-scroll');
      dt.addEventListener('wheel', (e) => { if (e.target === dt) scroller.scrollTop += e.deltaY; }, { passive: true });
      setTimeout(() => (dt.querySelector('.dt-title') || closeBtn).focus({ preventScroll: true }), dur(presenter.openMs ?? 720));
      live.textContent = '';
      emit('open', rec);
    }

    function swapImage(k) {
      const R = reading;
      if (!R || R.k === k) return;
      const a = R.rec.t.ref;
      const im = a.images[k - 1];
      const box = R.dt.querySelector('.dt-img');
      const fit = fitImage(im);
      const img = box.querySelector('img');
      animate(img, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }).finished.then(() => {
        img.src = im.l;
        img.alt = im.alt;
        box.style.width = `${fit.w}px`;
        box.style.height = `${fit.h}px`;
        const alt = R.dt.querySelector('.alt');
        if (alt) alt.textContent = im.alt;
        animate(img, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
      });
      R.dt.querySelectorAll('.dt-sibs button').forEach((b) => b.setAttribute('aria-current', String(+b.dataset.k === k)));
      // 关上时回到同一处周期里对应的那一块
      const tile = TILES.find((t) => t.kind === 'img' && t.ref === a && t.k === k);
      const sibling = tile && nodes.get(`${tile.idx}:${R.rec.i}:${R.rec.j}`);
      if (sibling) {
        const hidden = R.rec.el.style.visibility;
        R.rec.el.style.visibility = '';
        R.rec = sibling;
        sibling.el.style.visibility = hidden;
        rule.focusOn && rule.focusOn(sibling);
        refresh(sibling, { quiet: true });
      }
      R.k = k;
      R.route = `/m/${a.slug}/${k}`;
      history.replaceState({ pl: R.route }, '', `#${R.route}`);
    }

    function requestClose() {
      if (!reading || reading.closing) return;
      if (history.state && history.state.pl) history.back();
      else close();
    }

    function close({ then } = {}) {
      const R = reading;
      if (!R || R.closing) return Promise.resolve();
      R.closing = true;
      clearPhase();
      const { rec, dt } = R;
      const done = presenter.exit(R);
      rule.closing && rule.closing(rec);
      emit('close', rec);

      return Promise.resolve(done).then(() => {
        clearPhase();
        rule.closed && rule.closed();
        rec.el.style.visibility = '';
        dt.remove();
        recede.getAnimations().forEach((a) => a.cancel());
        dim.getAnimations().forEach((a) => a.cancel());
        reading = null;
        root.classList.remove('reading');
        stage.removeAttribute('aria-hidden');
        stage.inert = false;
        toc.inert = false;
        if (rec.orig && !then) { quietFocus = true; rec.el.focus({ preventScroll: true }); quietFocus = false; }
        emit('closed', rec);
        if (then) then();
      });
    }

    /* 阅读层里的站内互链：先合上，再从那篇的原件打开 */
    function jump(hashRoute) {
      const route = hashRoute.replace(/^#/, '');
      const target = origRec(route);
      if (!target) return;
      close({
        then: () => {
          history.replaceState({ pl: route }, '', `#${route}`);
          const g = target.g;
          flyTo(g.x + g.w / 2, g.y + g.h / 2, 120);
          setTimeout(() => open(target, { push: false }), dur(560));
        },
      });
    }

    addEventListener('popstate', (e) => {
      const st = e.state;
      if (reading && !(st && st.pl)) close();
      else if (!reading && st && st.pl) openRoute(st.pl, false);
    });

    function openRoute(route, push) {
      const m = route.match(/^\/m\/([^/]+)\/(\d+)$/);
      const rec = origRec(m ? `/m/${m[1]}/${m[2]}` : route);
      if (!rec) return;
      const r = screenRect(rec);
      if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) {
        cam.x = rec.g.x + rec.g.w / 2;
        cam.y = rec.g.y + rec.g.h / 2;
        render();
      }
      open(rec, { push });
    }

    /* ══ 外框：目录、回到中央、醒梦 ══ */
    function setToc(on) {
      toc.classList.toggle('open', on);
      tocBtn.setAttribute('aria-expanded', String(on));
    }
    tocBtn.addEventListener('click', () => {
      const on = !toc.classList.contains('open');
      setToc(on);
      if (on) setTimeout(() => toc.querySelector('a')?.focus({ preventScroll: true }), 60);
    });
    toc.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      e.preventDefault();
      const route = a.getAttribute('href').slice(1);
      const rec = origRec(route);
      setToc(false);
      if (!rec) return;
      const g = rec.g;
      flyTo(g.x + g.w / 2, g.y + g.h / 2, 130);
      setTimeout(() => open(rec), dur(Math.min(900, 300 + Math.hypot(pend.x, pend.y) * 0.08)));
    });
    addEventListener('pointerdown', (e) => {
      if (toc.classList.contains('open') && !toc.contains(e.target) && e.target !== tocBtn) setToc(false);
    });
    homeBtn.addEventListener('click', () => flyTo(START.x, START.y, 170));
    brand.addEventListener('click', (e) => { e.preventDefault(); flyTo(START.x, START.y, 170); });
    realBtn.addEventListener('click', () => {
      const dream = root.dataset.reality !== 'dream';
      root.dataset.reality = dream ? 'dream' : 'wake';
      realBtn.setAttribute('aria-pressed', String(dream));
      field.paint(root.dataset.reality);
      repaintAll();
      toneChrome();
      emit('reality', root.dataset.reality);
    });

    /* ══ 起始 ══ */
    const ctx = {
      world: K.world,
      nodes,
      cam,
      get z() { return z; },
      get vw() { return vw; },
      get vh() { return vh; },
      get hover() { return hoverRec; },
      get reading() { return reading; },
      get RM() { return RM; },
      els: { stage, world, haze, dim, recede },
      on,
      refresh,
      repaintAll,
      ripple,
      screenRect,
      animate,
      dur,
      flyTo,
      render,
      options,
      open,
      close: requestClose,
      flipPairs,
      flipFrom,
      EASE_OPEN,
      EASE_CLOSE,
      colorOf: (r) => rgb(PAL[r].bg),
    };
    presenter = K.details[detailName](ctx);

    field.paint('wake');
    rule.init && rule.init(ctx);
    for (const name of mechs) K.mechs[name] && K.mechs[name](ctx);
    resize();
    // 原件常驻 DOM（按版块的阅读顺序），Tab 只经过它们
    for (const t of TILES) makeRec(t, 0, 0, rule.place(t, 0, 0) || {});
    render();
    addEventListener('resize', resize);
    emit('start');

    // 直接带着路由进来：先垫一条平面的历史，再打开（「返回」回到平面）
    const initial = location.hash.slice(1);
    if (initial.startsWith('/')) {
      history.replaceState(null, '', location.pathname + location.search);
      history.pushState({ pl: initial }, '', `#${initial}`);
      requestAnimationFrame(() => openRoute(initial, false));
    }

    root.dataset.rule = rule.name || '';
    root.dataset.detail = detailName;
    window.__plane = { cam, flyTo, open: (route) => openRoute(route, true), close: requestClose, nodes, render, rule, start: START, offset: (i, j) => ({ x: i * W, y: j * H + K.world.SK * i * W }), get reading() { return reading; } };
    return ctx;
  };
})();
