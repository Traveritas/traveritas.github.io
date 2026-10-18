/* ─────────────────────────────────────────────────────────────
   罗盘环 · 四种语境的底子与真内容
   内容只读地取 ../layout-plane/data.js（window.PLANE_DATA）。
   夜色：主页＝晨光 · 目录三栏＝浅梦/异相/深眠 · 阅读＝浅梦 · 门＝天光 · 失线＝深眠。
   一夜 23:07 → 06:31（444 分）驱动「刻」与环上的琥珀弧。
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const DATA = window.PLANE_DATA || { articles: [], projects: [], moments: [] };
  const IMG = '../layout-plane/';

  const PAL_OF = { home: 'dawn', grid: 'shallow', read: 'shallow', gate: 'sky', '404': 'deep' };
  const COL_PAL = { essay: 'shallow', moment: 'strange', project: 'deep' };
  const NIGHT = { start: 23 * 60 + 7, len: 444 };
  const SEG = [
    [0, 'W'], [12, 'N1'], [27, 'N2'], [52, 'N3'], [84, 'N2'], [124, 'N3'], [163, 'WASO'],
    [167, 'N3'], [181, 'REM'], [229, 'N2'], [258, 'REM'], [287, 'N1'], [316, 'REM'],
    [352, 'N2'], [373, 'REM'], [394, 'N1'], [412, 'W'],
  ];
  const STAGE = {
    W: ['清醒', 'β 波'], WASO: ['微觉醒', 'WASO'], N1: ['浅梦', 'θ 波'],
    N2: ['浅梦', '纺锤波'], N3: ['深眠', 'δ 波'], REM: ['异相', '眼动'],
  };

  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ── 借光表：每一套夜色的墨、玻璃与纱。环与花瓣玻璃都从这里取 ── */
  const PAL = {
    shallow: {
      fg: '#232830', soft: '#56606d', ink: '#765640', bg: '#e1e7ef', dark: 0,
      g: ['rgba(255,255,255,.5)', 'rgba(255,255,255,.24)', 'rgba(255,255,255,.08)'],
      pa: 'rgba(255,255,255,.74)', pb: 'rgba(255,255,255,.36)',
      lift: 'drop-shadow(0 2px 4px rgba(28,34,44,.16))',
      fill: 'rgba(247,249,252,.82)',
    },
    deep: {
      fg: '#e6ebf1', soft: '#a6b4c6', ink: '#c9a77e', bg: '#0d1524', dark: 1,
      g: ['rgba(255,255,255,.13)', 'rgba(255,255,255,.055)', 'rgba(255,255,255,.015)'],
      pa: 'rgba(255,255,255,.13)', pb: 'rgba(255,255,255,.05)',
      lift: 'drop-shadow(0 2px 6px rgba(0,0,0,.42))',
      fill: 'rgba(34,44,64,.88)',
    },
    strange: {
      fg: '#f0e9f4', soft: '#bcadca', ink: '#e0aa86', bg: '#1d1729', dark: 1,
      g: ['rgba(255,255,255,.14)', 'rgba(255,255,255,.06)', 'rgba(255,255,255,.015)'],
      pa: 'rgba(255,255,255,.13)', pb: 'rgba(255,255,255,.05)',
      lift: 'drop-shadow(0 2px 6px rgba(0,0,0,.42))',
      fill: 'rgba(52,44,68,.88)',
    },
    dawn: {
      fg: '#ece8f2', soft: '#b7b3c8', ink: '#d6b28c', bg: '#0e0f1d', dark: 1,
      g: ['rgba(255,255,255,.14)', 'rgba(255,255,255,.06)', 'rgba(255,255,255,.015)'],
      pa: 'rgba(255,255,255,.13)', pb: 'rgba(255,255,255,.05)',
      lift: 'drop-shadow(0 2px 6px rgba(0,0,0,.42))',
      fill: 'rgba(30,32,48,.88)',
    },
    sky: {
      fg: '#232830', soft: '#4d5364', ink: '#765640', bg: '#d9d2dc', dark: 0,
      g: ['rgba(255,255,255,.54)', 'rgba(255,255,255,.26)', 'rgba(255,255,255,.09)'],
      pa: 'rgba(255,255,255,.76)', pb: 'rgba(255,255,255,.38)',
      lift: 'drop-shadow(0 2px 4px rgba(28,34,44,.16))',
      fill: 'rgba(250,251,253,.84)',
    },
  };

  /* ── 内容 ── */
  const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const ENTRIES = (() => {
    const out = [];
    DATA.articles.forEach((a) =>
      out.push({
        id: 'a:' + a.slug, kind: 'article', scene: 'essay', slug: a.slug, title: a.title,
        desc: a.desc || '', date: a.date, tags: a.tags || [], chars: a.chars, html: a.html || '',
        body: strip(a.html), links: a.related || [],
      }),
    );
    DATA.moments.forEach((m) =>
      out.push({
        id: 'm:' + m.slug, kind: 'moment', scene: 'moment', slug: m.slug, title: m.title,
        desc: m.text || (m.images && m.images.length ? m.images.map((i) => i.alt).join(' · ') : ''),
        date: m.date, tags: m.tags || [], html: m.html || '', body: strip(m.html),
        images: m.images || [], links: [],
      }),
    );
    DATA.projects.forEach((p) =>
      out.push({
        id: 'p:' + p.slug, kind: 'project', scene: 'project', slug: p.slug, title: p.title,
        desc: p.desc || '', date: p.date, tags: p.tags || [], status: p.status, html: p.html || '',
        body: strip(p.html), links: p.links || [], note: p.note || '',
      }),
    );
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  })();

  const byId = (id) => ENTRIES.find((e) => e.id === id) || ENTRIES[0];

  /* ── 状态 ── */
  const state = {
    ctx: params.get('ctx') || 'home',
    face: params.get('face') === 'dream' ? 'dream' : 'wake',
    pal: params.get('pal') || '',
    view: params.get('view') === 'scatter' ? 'scatter' : 'roster',
    scene: params.get('scene') || 'essay',
    query: params.get('q') || '',
    tags: (params.get('tags') || '').split(',').filter(Boolean),
    years: (params.get('years') || '').split(',').filter(Boolean),
    open: params.get('open') || (ENTRIES.find((e) => e.kind === 'article') || ENTRIES[0]).id,
    size: 'm',
    lead: 'm',
    sound: false,
    p: 0,
  };
  if (!PAL_OF[state.ctx]) state.ctx = 'home';

  try {
    const s = localStorage.getItem('xm-read-size');
    const l = localStorage.getItem('xm-read-lead');
    if (s) state.size = s;
    if (l) state.lead = l;
  } catch (e) {}

  let onChange = () => {};
  const fire = () => {
    paint();
    refreshBands();
    onChange();
  };

  /* ── 筛选 ── */
  function hits() {
    const q = state.query.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (state.tags.length && !state.tags.some((t) => e.tags.includes(t))) return false;
      if (state.years.length && !state.years.includes(String(e.date).slice(0, 4))) return false;
      if (!q) return true;
      const hay = [e.title, e.desc, e.body, e.tags.join(' '), (e.images || []).map((i) => i.alt).join(' ')]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const allTags = () => [...new Set(ENTRIES.flatMap((e) => e.tags))];
  const allYears = () => [...new Set(ENTRIES.map((e) => String(e.date).slice(0, 4)))].sort().reverse();

  /* ── 时刻 ── */
  function clock() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, scrollY / max));
    state.p = p;
    const min = NIGHT.start + p * NIGHT.len;
    const hh = Math.floor(min / 60) % 24;
    const mm = Math.floor(min % 60);
    let st = 'W';
    for (const [from, s] of SEG) if (p * NIGHT.len >= from) st = s;
    const at = (f) => {
      const m = NIGHT.start + f * NIGHT.len;
      return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    };
    return {
      hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      stage: STAGE[st][0], wave: STAGE[st][1], p,
      marks: [
        { t: '入睡', p: 0, hhmm: at(0) },
        { t: '浅梦', p: 27 / NIGHT.len, hhmm: at(27 / NIGHT.len) },
        { t: '深眠', p: 52 / NIGHT.len, hhmm: at(52 / NIGHT.len) },
        { t: '异相', p: 181 / NIGHT.len, hhmm: at(181 / NIGHT.len) },
        { t: '天亮', p: 1, hhmm: at(1) },
      ],
    };
  }

  /* ── 声 ── */
  let ac = null;
  let gain = null;
  function soundOn(on) {
    try {
      if (on && !ac) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ac = new Ctx();
        gain = ac.createGain();
        gain.gain.value = 0;
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 420;
        [55, 82.5, 164.8].forEach((f, i) => {
          const o = ac.createOscillator();
          o.type = i === 2 ? 'triangle' : 'sine';
          o.frequency.value = f;
          const g = ac.createGain();
          g.gain.value = i === 2 ? 0.06 : 0.5;
          o.connect(g).connect(lp);
          o.start();
        });
        const lfo = ac.createOscillator();
        lfo.frequency.value = 0.05;
        const lg = ac.createGain();
        lg.gain.value = 120;
        lfo.connect(lg).connect(lp.frequency);
        lfo.start();
        lp.connect(gain).connect(ac.destination);
      }
      if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
      if (gain) gain.gain.setTargetAtTime(on ? 0.028 : 0, ac.currentTime, 0.6);
    } catch (e) {
      /* 无声也不能让页面出错 */
    }
  }

  /* ── 画 ── */
  const badge = (id) => window.RING.badge(id);

  function head(note) {
    return `<header class="top"><a class="brand" href="#" data-home>Traveritas</a><span class="top-note mono">${esc(note)}</span></header><div class="seam"></div>`;
  }

  function pane(e) {
    return `<article class="pane">
      <span class="meta mono">${esc(e.date.slice(0, 10))}</span>
      <h3>${esc(e.title)}</h3>
      <p>${esc(e.desc.slice(0, 68))}${e.desc.length > 68 ? '…' : ''}</p>
      <span class="badge" style="margin-top:.7rem">${badge(e.scene)}</span>
    </article>`;
  }

  function row(e) {
    const veil = hits().some((h) => h.id === e.id) ? '' : ' is-veiled';
    const imgs = e.images && e.images.length ? ` · ${e.images.length} 张` : '';
    return `<button type="button" class="row${veil}" data-go="${esc(e.id)}">
      <span class="meta mono">${esc(e.date.slice(0, 10))}${e.chars ? ` · ${e.chars} 字` : ''}${imgs}</span>
      <h3>${esc(e.title)}</h3>
      ${e.desc ? `<p>${esc(e.desc)}</p>` : ''}
      ${e.tags.length ? `<span class="chips">${e.tags.map((t) => `<i class="chip">${esc(t)}</i>`).join('')}</span>` : ''}
    </button>`;
  }

  function col(sceneId) {
    const items = ENTRIES.filter((e) => e.scene === sceneId);
    const s = window.RING.SCENES.find((x) => x.id === sceneId);
    const cn = state.face === 'dream' ? s.dcn : s.cn;
    return `<section class="col band" data-pal="${COL_PAL[sceneId]}" data-scene="${sceneId}">
      <div class="col-head"><div><b>${esc(cn)}</b><span class="badge">${badge(sceneId)}</span></div>
        <span class="col-count mono">${items.length}${sceneId === 'essay' ? ' 篇' : sceneId === 'moment' ? ' 则' : ' 项'}</span></div>
      <div class="rows">${items.map(row).join('')}</div>
    </section>`;
  }

  function prose(e) {
    if (e.images && e.images.length) {
      return `<div class="figs">${e.images
        .map(
          (i) =>
            `<figure><img src="${IMG}${esc(i.l || i.m)}" alt="${esc(i.alt)}" width="${i.w}" height="${i.h}" loading="lazy"></figure>`,
        )
        .join('')}</div>${e.html || ''}`;
    }
    if (e.html) return e.html;
    return `<p>${esc(e.desc || e.note || '')}</p>`;
  }

  function readView(e) {
    const extra =
      e.kind === 'project'
        ? `<p class="meta mono" style="margin:.6rem 0 0">${esc(e.status || '')}${
            e.links.length ? ' · ' + e.links.map((l) => esc(l.label)).join(' · ') : ''
          }</p>`
        : '';
    return `<div class="reading"><div class="read-head">
        ${badge(e.scene)}
        <h1>${esc(e.title)}</h1>
        <p class="meta mono">${esc(e.date.slice(0, 10))}${e.chars ? ` · ${e.chars} 字` : ''}${
          e.tags.length ? ' · ' + e.tags.map(esc).join(' / ') : ''
        }</p>${extra}
      </div><article class="prose">${prose(e)}</article></div>`;
  }

  function paint() {
    const root = document.documentElement;
    root.dataset.ctx = state.ctx;
    root.dataset.face = state.face;
    root.dataset.view = state.view;
    root.dataset.pal = state.pal || PAL_OF[state.ctx];
    root.style.setProperty('--mix', state.face === 'wake' ? '1' : '0');
    root.style.setProperty('--read-size', state.size === 's' ? '0.94rem' : state.size === 'l' ? '1.12rem' : '1rem');
    root.style.setProperty('--read-lead', state.lead === 'l' ? '2.45' : '2.05');
    root.dataset.readSize = state.size;
    root.dataset.readLead = state.lead;
    root.dataset.sound = state.sound ? 'on' : 'off';

    const scene = document.getElementById('scene');
    const e = byId(state.open);
    let html = '';

    if (state.ctx === 'home') {
      const pick = [ENTRIES[0], ENTRIES[2], ENTRIES[3], ENTRIES[1]].filter(Boolean);
      html =
        head('HOME · 主页') +
        `<div class="stage">
          <p class="hero-line">在即将醒来的那一瞬，世界究竟是在<em>成形</em>，还是正在<em>融化</em>？</p>
          <p class="hero-sub">这里不是梦，也不是现实。它是人在即将醒来时，看见的最后一层世界——十二件工具收成一枚环，长在指针上。</p>
          <div class="panes" data-view="${state.view}">${pick.map(pane).join('')}</div>
        </div>`;
    } else if (state.ctx === 'grid') {
      html = head('INDEX · 目录') + `<div class="cols">${col('essay')}${col('moment')}${col('project')}</div>`;
    } else if (state.ctx === 'read') {
      html = head('READING · 阅读') + readView(e);
    } else if (state.ctx === 'gate') {
      html =
        head('NEXUS · 门') +
        `<div class="gate-stage"><span class="gate-line" aria-hidden="true"></span>
          <div class="gate-door" aria-hidden="true"></div>
          <p class="gate-word">世界在边缘处留白。尚未命名的风景，不会在此停留。</p>
          <span class="badge">存在于此<i>PRESENCE</i></span>
        </div>`;
    } else {
      html =
        head('ERR · 404 · OUT OF BOUNDS') +
        `<div class="lost"><span class="lost-beacon" aria-hidden="true"></span>
          <p class="lost-code mono">ERR · 404 · OUT OF BOUNDS</p>
          <p class="lost-line">线索到这里中断了：这一页如同被擦除的痕迹，曾在此处，但现在不在这里。</p>
          <a class="lost-back" href="#" data-home>${state.face === 'dream' ? '退回最初的岸' : '返回主轴'}</a>
        </div>`;
    }

    scene.innerHTML = html;

    /* 阅读页的刻度：h2 主、h3 细，各给一个锚 */
    if (state.ctx === 'read') {
      let a = 0;
      let b = 0;
      scene.querySelectorAll('.prose h2, .prose h3').forEach((h) => {
        const level = h.tagName === 'H2' ? 2 : 3;
        h.id = level === 2 ? `sec-${++a}` : `sub-${++b}`;
      });
      applyRead();
    }

    scene.querySelectorAll('[data-go]').forEach((el) =>
      el.addEventListener('click', () => openEntry(el.dataset.go)),
    );
    scene.querySelectorAll('[data-home]').forEach((el) =>
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        setCtx('home');
      }),
    );
  }

  function applyRead() {
    const prose = document.querySelector('.prose');
    if (!prose) return;
    prose.style.fontSize = state.size === 's' ? '0.94rem' : state.size === 'l' ? '1.12rem' : '1rem';
    prose.style.lineHeight = state.lead === 'l' ? '2.45' : '2.05';
  }

  /* ── 动作 ── */
  function setCtx(c) {
    if (!PAL_OF[c]) return;
    state.ctx = c;
    fire();
  }
  function setFace(f) {
    state.face = f === 'dream' ? 'dream' : 'wake';
    fire();
  }
  const toggleFace = () => setFace(state.face === 'wake' ? 'dream' : 'wake');
  function setView(v) {
    state.view = v === 'scatter' ? 'scatter' : 'roster';
    fire();
  }
  const toggleView = () => setView(state.view === 'roster' ? 'scatter' : 'roster');
  function setScene(s) {
    if (!window.RING.SCENES.some((x) => x.id === s)) return;
    state.scene = s;
    if (state.ctx === 'grid') {
      const el = document.querySelector(`.col[data-scene="${s}"]`);
      if (el) el.scrollIntoView({ block: 'start', behavior: RM.matches ? 'auto' : 'smooth' });
    } else if (state.ctx === 'read') {
      const first = ENTRIES.find((e) => e.scene === s);
      if (first) state.open = first.id;
    }
    fire();
  }
  const cycleScene = () => {
    const i = window.RING.SCENES.findIndex((x) => x.id === state.scene);
    setScene(window.RING.SCENES[(i + 1) % 3].id);
  };
  function setQuery(q) {
    state.query = q;
    fire();
  }
  function toggleTag(t) {
    const i = state.tags.indexOf(t);
    if (i < 0) state.tags.push(t);
    else state.tags.splice(i, 1);
    fire();
  }
  function toggleYear(y) {
    const i = state.years.indexOf(y);
    if (i < 0) state.years.push(y);
    else state.years.splice(i, 1);
    fire();
  }
  function openEntry(id) {
    if (!byId(id)) return;
    state.open = id;
    state.ctx = 'read';
    fire();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function setSize(v) {
    state.size = v;
    try {
      localStorage.setItem('xm-read-size', v);
    } catch (e) {}
    fire();
  }
  function setLead(v) {
    state.lead = v;
    try {
      localStorage.setItem('xm-read-lead', v);
    } catch (e) {}
    fire();
  }
  function setSound(on) {
    state.sound = !!on;
    soundOn(state.sound);
    fire();
  }
  const toggleSound = () => setSound(!state.sound);
  function scrollToP(p) {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    window.scrollTo({ top: p * max, behavior: RM.matches ? 'auto' : 'smooth' });
  }
  function headings() {
    return [...document.querySelectorAll('.prose h2, .prose h3')].map((h) => ({
      level: h.tagName === 'H2' ? 2 : 3,
      text: h.textContent.trim(),
      id: h.id,
    }));
  }
  function jumpHeading(id) {
    const go = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: 'start', behavior: RM.matches ? 'auto' : 'smooth' });
    };
    if (state.ctx !== 'read') {
      state.ctx = 'read';
      fire();
      requestAnimationFrame(go);
    } else go();
  }

  /* ── 底子在哪儿：指针底下是哪一片夜色 ──
     三栏并排时每一栏各是一套夜色，所以先把各片底子的矩形缓存下来，
     指针一动就能当场判定。不做节流：节流会让环借到「移动起点」那一栏的光。 */
  let bands = [];
  function refreshBands() {
    bands = [...document.querySelectorAll('.band[data-pal]')].map((el) => ({
      pal: el.dataset.pal,
      r: el.getBoundingClientRect(),
    }));
  }

  function paletteAt(x, y) {
    for (const b of bands) {
      if (x >= b.r.left && x <= b.r.right && y >= b.r.top && y <= b.r.bottom) return b.pal;
    }
    return document.documentElement.dataset.pal || 'shallow';
  }

  /* ── 对比度自查（深底浅底各核一次） ── */
  function parseColor(str) {
    const s = String(str).trim();
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      const n = (v, k) => (String(v).endsWith('%') ? (parseFloat(v) / 100) * k : parseFloat(v));
      return [n(p[0], 255), n(p[1], 255), n(p[2], 255), p[3] != null ? n(p[3], 1) : 1];
    }
    m = /^color\(srgb\s+([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean);
      return [parseFloat(p[0]) * 255, parseFloat(p[1]) * 255, parseFloat(p[2]) * 255, p[3] != null ? parseFloat(p[3]) : 1];
    }
    m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      const h = m[1];
      const f = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
      const v = (i) => parseInt(f.slice(i * 2, i * 2 + 2), 16);
      return [v(0), v(1), v(2), f.length >= 8 ? v(3) / 255 : 1];
    }
    if (s === 'transparent') return [0, 0, 0, 0];
    return null;
  }
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  function effBg(el) {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] >= 0.999) break;
      }
    }
    let base = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  }
  const lum = (c) => {
    const f = c.slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  function report(palOverride, scopeSel) {
    const pal = palOverride || state.pal || PAL_OF[state.ctx];
    const P = PAL[pal] || PAL.shallow;
    const prevPal = window.__ring.palName();
    window.__ring.applyPal(pal);

    /* 面板先摆一张（量完再收） */
    const panel = document.getElementById('panel');
    const wasHidden = panel.hasAttribute('hidden');
    const prevPanel = panel.innerHTML;
    const prevVis = panel.style.visibility;
    const prevOp = panel.style.opacity;
    if (!panel.querySelector('.p-h')) {
      const t = window.RING.panels.filter();
      panel.innerHTML = t.html;
      t.bind(panel);
      panel.removeAttribute('hidden');
      panel.style.visibility = 'visible';
      panel.style.opacity = '0';
    }

    /* 环与花瓣玻璃悬在页面上，它们的「底」不是 DOM 祖先链，而是指针底下那一片夜色 */
    const ringBg = parseColor(P.bg);
    const panelBgRaw = parseColor(getComputedStyle(panel).backgroundColor);
    const panelBg = panelBgRaw && panelBgRaw[3] < 0.999 ? over(panelBgRaw, ringBg) : ringBg;
    const inOverlay = (el) => !!el.closest('#ring, #panel, #peek');

    const rows = [];
    const push = (k, cls, el) => {
      if (!el) return;
      const cs = getComputedStyle(el);
      const raw = parseColor(cls === 'hair' || cls === 'tick' ? cs.stroke : cs.color);
      if (!raw) return;
      const bg = inOverlay(el) ? (el.closest('#panel') ? panelBg : ringBg) : effBg(el);
      const fg = raw[3] < 0.999 ? over(raw, bg) : raw;
      const r = ratio(fg, bg);
      const need = cls === 'body' ? 4.5 : cls === 'label' ? 3 : cls === 'tick' ? 1.3 : 1.15;
      rows.push({ k, cls, ratio: Math.round(r * 100) / 100, need, pass: r >= need });
    };

    const scope = scopeSel ? document.querySelector(scopeSel) : document;
    const q = (sel) => (scope ? scope.querySelector(sel) : null) || null;

    push('正文 · 页面', 'body', q('.prose p, .hero-line, .gate-word, .lost-line, .pane p'));
    push('正文 · 花瓣玻璃上', 'body', panel.querySelector('.p-body') || panel.querySelector('.p-name'));
    push('小标签 · 花瓣玻璃上', 'label', panel.querySelector('.p-h') || panel.querySelector('.p-name'));
    push('小标签 · 名录行', 'label', q('.row .meta') || q('.pane .meta'));
    push('小标签 · 页头', 'label', q('.top-note'));
    push('发丝 · 环', 'hair', document.querySelector('.c-hair'));
    push('刻度 · 环', 'tick', document.querySelector('.c-tick'));
    push('瓣沿 · 环', 'hair', document.querySelector('.p-fill'));

    if (wasHidden) {
      panel.setAttribute('hidden', '');
      panel.innerHTML = prevPanel;
    } else if (!prevPanel) {
      panel.innerHTML = '';
    }
    panel.style.visibility = prevVis;
    panel.style.opacity = prevOp;
    window.__ring.applyPal(prevPal);

    return { ctx: state.ctx, pal, scope: scopeSel || 'page', rows, fails: rows.filter((r) => !r.pass).length };
  }

  /* ── 装配 ── */
  window.__scene = {
    state,
    PAL,
    entries: () => ENTRIES,
    byId,
    hits,
    allTags,
    allYears,
    clock,
    headings,
    paletteAt,
    paletteOf: (c) => state.pal || PAL_OF[c || state.ctx],
    report,
    setCtx, setFace, toggleFace, setView, toggleView, setScene, cycleScene,
    setQuery, toggleTag, toggleYear, openEntry, setSize, setLead, setSound, toggleSound,
    scrollTo: scrollToP, jumpHeading,
    render: fire,
    on: (fn) => (onChange = fn),
  };

  paint();
  refreshBands();

  let bandTick = 0;
  const bandSoon = () => {
    if (bandTick) return;
    bandTick = requestAnimationFrame(() => {
      bandTick = 0;
      refreshBands();
    });
  };
  addEventListener('scroll', () => {
    state.p = clock().p;
    bandSoon();
  }, { passive: true });
  addEventListener('resize', () => fire());
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'v' || e.key === 'V') toggleView();
    if (e.key === '1') setScene('essay');
    if (e.key === '2') setScene('moment');
    if (e.key === '3') setScene('project');
  });
})();
