/* ─────────────────────────────────────────────────────────────
   切面 threshold · 逻辑
   一根平切面线横过屏幕，线上排开十二片切片（一片一件工具）。
   动词：升起 / 沉回线里 —— 线以下的世界一动不动。
   三条召唤路径（边缘露头 / 指针扫过 / 快捷键 T）唤出的是同一个面。
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.prototype.slice.call(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const D = window.PLANE_DATA || { articles: [], projects: [], moments: [] };
  const IMG = (p) => '../layout-plane/' + p;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 十二件工具（中文小标签 · 英文，沿用站内形制） ── */
  const TOOLS = [
    { id: 'find', cn: '寻找', en: 'FIND' },
    { id: 'view', cn: '看法', en: 'VIEW' },
    { id: 'scene', cn: '场景', en: 'SCENE' },
    { id: 'home', cn: '归处', en: 'HOME' },
    { id: 'nexus', cn: '门', en: 'NEXUS' },
    { id: 'exits', cn: '出口', en: 'EXITS' },
    { id: 'face', cn: '面', en: 'FACE' },
    { id: 'sound', cn: '声', en: 'SOUND' },
    { id: 'contents', cn: '目录', en: 'CONTENTS' },
    { id: 'reading', cn: '读', en: 'READING' },
    { id: 'filter', cn: '筛', en: 'FILTER' },
    { id: 'time', cn: '刻', en: 'TIME' },
  ];
  const N = TOOLS.length;

  /* ── 语境 → 夜色与线的位置（四种语境 + 失线页） ── */
  const CTX = {
    home: { y: '50%', my: '46%', night: 'dawn' },
    grid: { y: '34%', my: '40%', night: null },
    read: { y: '32%', my: '37%', night: 'light' },
    gate: { y: '50%', my: '48%', night: 'light' },
    404: { y: '42%', my: '44%', night: 'deep' },
  };
  const SCENE_NIGHT = { essay: 'light', moment: 'other', project: 'deep' };
  const SCENE_NAME = { essay: ['随笔', '断章'], moment: ['瞬间', '闪念'], project: ['项目', '造物'] };
  const SCENE_UNIT = { essay: '篇', moment: '则', project: '项' };

  const S = {
    ctx: 'home', face: 'wake', scene: 'essay', view: 'grid',
    tool: null, idx: -1, engaged: false, kb: false,
    query: '', tags: {}, ym: null, sound: false,
    readSize: 'm', readLead: 'm', hour: 0, read: null,
  };
  let LINE_Y = 0;
  let closeTimer = 0;

  /* ══ 数据 ══ */
  function items(scene) {
    if (scene === 'moment') return D.moments.map((m) => ({ kind: 'moment', ref: m }));
    if (scene === 'project') return D.projects.map((p) => ({ kind: 'project', ref: p }));
    return D.articles.map((a) => ({ kind: 'article', ref: a }));
  }
  const KIND_CN = { article: '随笔', moment: '瞬间', project: '项目' };
  const KIND_DN = { article: '断章', moment: '闪念', project: '造物' };
  function strip(h) { return h ? String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
  function corpus(it) {
    const r = it.ref, p = [r.title, r.desc, r.text, r.status, (r.tags || []).join(' '), strip(r.html)];
    if (r.images) r.images.forEach((im) => p.push(im.alt || ''));
    (r.links || []).forEach((l) => p.push(l.label || ''));
    return p.filter(Boolean).join(' ').toLowerCase();
  }
  function allItems() {
    return [].concat(items('essay'), items('moment'), items('project'));
  }
  function ymOf(d) { return String(d || '').slice(0, 7); }
  function yrOf(d) { return String(d || '').slice(0, 4); }

  /* ══ 夜色 / 线的位置 ══ */
  function applyTokens() {
    const html = document.documentElement;
    const c = CTX[S.ctx] || CTX.home;
    const mob = innerWidth <= 700;
    html.dataset.ctx = S.ctx;
    html.dataset.face = S.face;
    html.dataset.scene = S.scene;
    html.dataset.night = c.night || SCENE_NIGHT[S.scene] || 'light';
    html.style.setProperty('--th-y', mob ? c.my : c.y);
    html.style.setProperty('--hour', String(S.hour));
  }
  function layoutLine() {
    const l = $('#line');
    if (l) LINE_Y = l.getBoundingClientRect().top;
  }

  /* ══ 世界（线以下，工具升起时它一动不动） ══ */
  function renderWorld() {
    const w = $('#world');
    if (S.ctx === 'home') w.innerHTML = worldHome();
    else if (S.ctx === 'gate') w.innerHTML = worldGate();
    else if (S.ctx === '404') w.innerHTML = world404();
    else if (S.ctx === 'read') w.innerHTML = worldRead();
    else w.innerHTML = worldGrid();
    w.scrollTop = 0;
    if (S.ctx === 'read' || S.ctx === 'grid') wireWorld();
    layoutLine();
    updateHair();
  }
  function worldHome() {
    return (
      '<div class="w-home">' +
      '<p class="kick mono">TRAVERITAS</p>' +
      '<h1>在即将醒来的那一瞬，<br>世界究竟是在成形，还是正在融化？</h1>' +
      '<p class="lead">世界应当始终保留一种感觉：它随时可能消失，又随时可能重新被记起。线以上是天光，线以下是水，十二件工具就挂在线上——挑一片，它便升起来。</p>' +
      '<div class="w-marks"><span>随笔</span><span>瞬间</span><span>项目</span><span>门</span></div>' +
      '</div>'
    );
  }
  function worldGate() {
    return (
      '<div class="gate-stage">' +
      '<a class="gate-crystal" href="/gate/" id="gc">' +
      '<svg viewBox="-50 -50 100 100" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="0.7" stroke-linejoin="round">' +
      '<path d="M0 -40 L22 -12 L22 16 L0 40 L-22 16 L-22 -12 Z" opacity=".9"/>' +
      '<path d="M0 -40 L0 40 M-22 -12 L22 16 M22 -12 L-22 16" opacity=".45"/>' +
      '<path d="M0 -40 L22 16 L0 40 L-22 16 Z" opacity=".7"/>' +
      '</g></svg>' +
      '<span class="gc-tag mono">NEXUS</span>' +
      '</a>' +
      '<p class="gate-note mono">晶体立在线上，切片沿线排开</p>' +
      '</div>'
    );
  }
  function world404() {
    return (
      '<div class="w-404">' +
      '<p class="code mono">404</p>' +
      '<h1>线在这里断了。</h1>' +
      '<p>你要找的那一段，此刻不在这一侧。往回走，或者从线上挑一件工具重新看一遍——天光还在，水也还在。</p>' +
      '</div>'
    );
  }
  function worldGrid() {
    const list = filterItems(items(S.scene));
    const [cn, dn] = SCENE_NAME[S.scene];
    const total = items(S.scene).length;
    const head =
      '<div class="w-head"><h2><span class="w">' + cn + '</span><span class="d">' + dn + '</span></h2>' +
      '<span class="cnt mono">' + list.length + ' / ' + total + ' ' + SCENE_UNIT[S.scene] + '</span></div>';
    const cards = list.map((it) => cardHTML(it)).join('');
    const empty = '<p class="f-note">这一片还没有落下的条目。</p>';
    return '<div class="wrap w-wrap">' + head + '<div class="cards">' + (cards || empty) + '</div></div>';
  }
  function cardHTML(it) {
    const r = it.ref;
    const d = r.desc || r.text || strip(r.html).slice(0, 90);
    const meta = (r.date || '').slice(0, 10) + (r.tags && r.tags.length ? ' · ' + r.tags[0] : r.status ? ' · ' + r.status : '');
    const img = r.images && r.images.length ? '<img src="' + IMG(r.images[0].m) + '" alt="' + esc(r.images[0].alt || '') + '" loading="lazy">' : '';
    return (
      '<button class="card" data-kind="' + it.kind + '" data-slug="' + esc(r.slug) + '">' +
      img +
      '<span class="t">' + esc(r.title) + '</span>' +
      (d ? '<span class="d">' + esc(d) + '</span>' : '') +
      '<span class="m mono"><i></i>' + esc(meta) + '</span>' +
      '</button>'
    );
  }
  function currentRead() { return S.read || { kind: 'article', ref: D.articles[0] || {} }; }
  function worldRead() {
    const it = currentRead();
    const r = it.ref;
    const kind = '<span class="w">' + KIND_CN[it.kind] + '</span><span class="d">' + KIND_DN[it.kind] + '</span>';
    const meta = (r.date || '').slice(0, 10) + ' · ' + kind + (r.chars ? ' · <span class="mono">' + r.chars + '</span> 字' : '');
    let body = r.html || '';
    if (it.kind === 'moment') {
      const figs = (r.images || []).map((im) => '<figure><img src="' + IMG(im.l) + '" alt="' + esc(im.alt || '') + '"><figcaption>' + esc(im.alt || '') + '</figcaption></figure>').join('');
      body = '<p>' + esc(r.text || '') + '</p>' + figs + body;
    }
    const size = { s: '0.94rem', m: '1.02rem', l: '1.14rem' }[S.readSize];
    const lead = { m: '1.95', l: '2.35' }[S.readLead];
    return (
      '<article class="read" style="--read-size:' + size + ';--read-lead:' + lead + '">' +
      '<h1>' + esc(r.title) + '</h1>' +
      '<p class="rmeta mono">' + meta + '</p>' +
      body +
      '</article>'
    );
  }
  function wireWorld() {
    $$('#world .card').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.kind, slug = b.dataset.slug;
      const src = kind === 'article' ? D.articles : kind === 'project' ? D.projects : D.moments;
      const ref = src.find((x) => x.slug === slug);
      if (ref) openRead({ kind: kind, ref: ref });
    }));
  }
  function openRead(it) {
    S.read = it;
    setCtx('read');
  }

  /* 筛（标签 / 年月） */
  function filterItems(list) {
    const tags = Object.keys(S.tags).filter((k) => S.tags[k]);
    return list.filter((it) => {
      const r = it.ref;
      if (tags.length && !tags.every((t) => (r.tags || []).indexOf(t) >= 0)) return false;
      if (S.ym && ymOf(r.date) !== S.ym) return false;
      return true;
    });
  }

  /* ══ 线：刻痕（切片） ══ */
  function buildNotches() {
    const box = $('#notches');
    box.innerHTML = TOOLS.map((t, i) => (
      '<button class="nk" type="button" data-i="' + i + '" style="--nx:' + (((i + 0.5) / N) * 100).toFixed(4) + '%" ' +
      'aria-label="' + t.cn + ' · ' + t.en + '">' +
      '<span class="nk-lab"><span class="cn">' + t.cn + '</span><span class="en">' + t.en + '</span></span>' +
      '<span class="nk-gem"></span><span class="nk-tick"></span>' +
      '</button>'
    )).join('');
    $$('.nk').forEach((el) => {
      const i = +el.dataset.i;
      el.addEventListener('click', (e) => { e.stopPropagation(); openTool(TOOLS[i].id); });
      el.addEventListener('pointerenter', () => { if (!S.tool) setNear(i, true); });
    });
  }
  function notchX(i) {
    const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pad-x')) || 5;
    return (innerWidth * (pad + (100 - 2 * pad) * ((i + 0.5) / N))) / 100;
  }
  function setNear(i, lab) {
    $$('.nk').forEach((el, k) => el.classList.toggle('is-near', k === i && lab !== false));
  }
  function updateCursor(force) {
    const cur = $('#cursor');
    const live = S.kb || S.engaged;
    cur.classList.toggle('is-live', live);
    if (!live) { setNear(-1); return; }
    if (S.idx >= 0) {
      document.documentElement.style.setProperty('--cx', notchX(S.idx) + 'px');
      $$('.nk').forEach((el, k) => { el.classList.toggle('is-near', k === S.idx); el.classList.toggle('is-on', !!S.tool && k === S.idx); });
    }
  }

  /* ══ 升起的面 ══ */
  function anchorFace(i) {
    const vw = innerWidth;
    const faceW = vw <= 700 ? vw - 16 : Math.min(30 * 16, vw - 40);
    const x = notchX(i);
    let c;
    if (faceW >= vw - 20) c = vw / 2;
    else c = clamp(x, faceW / 2 + 8, vw - faceW / 2 - 8);
    document.documentElement.style.setProperty('--fx', c + 'px');
  }
  function openTool(id, opts) {
    opts = opts || {};
    const i = TOOLS.findIndex((t) => t.id === id);
    if (i < 0) return;
    clearTimeout(closeTimer);
    S.tool = id; S.idx = i;
    const f = $('#face');
    $('#face-body').innerHTML = FACE[id]();
    f.hidden = false;
    f.setAttribute('aria-label', TOOLS[i].cn + ' · ' + TOOLS[i].en);
    anchorFace(i);
    void f.offsetWidth;
    document.documentElement.style.setProperty('--rise', String(opts.rise == null ? 1 : opts.rise));
    wireFace(id);
    updateCursor();
    showHint(false);
  }
  function closeTool() {
    S.tool = null;
    document.documentElement.style.setProperty('--rise', '0');
    updateCursor();
    const f = $('#face');
    const done = () => { if (!S.tool) { f.hidden = true; $('#face-body').innerHTML = ''; } };
    clearTimeout(closeTimer);
    if (RM || document.documentElement.classList.contains('frozen')) done();
    else closeTimer = setTimeout(done, 660);
  }

  /* ══ 十二个面 ══ */
  const FACE = {
    find: function () {
      return (
        '<div class="f-sec">' +
        '<label class="f-find"><span class="f-h">寻找<span class="en">FIND</span></span>' +
        '<input id="f-q" type="search" placeholder="标题、描述、标签或正文里的字" autocomplete="off" spellcheck="false" value="' + esc(S.query) + '">' +
        '</label>' +
        '<p class="f-count"><span id="f-n">全站 ' + allItems().length + ' 条</span><button id="f-clear" type="button"' + (S.query ? '' : ' hidden') + '>清除</button></p>' +
        '</div>' +
        '<div class="f-sec"><div class="f-res" id="f-res"></div></div>'
      );
    },
    view: function () {
      return (
        '<div class="f-sec"><span class="f-h">看法<span class="en">VIEW</span></span>' +
        '<div class="f-row">' +
        '<button class="f-btn" type="button" data-view="grid" aria-pressed="' + (S.view === 'grid') + '">检索</button>' +
        '<button class="f-btn" type="button" data-view="explore" aria-pressed="' + (S.view === 'explore') + '">漫游</button>' +
        '</div></div>' +
        '<p class="f-note"><span class="w">同一批条目，两种看法：检索给要找东西的人，漫游给想逛的人。</span><span class="d">同一批条目，两种目光：一种在找，一种在漂。</span></p>'
      );
    },
    scene: function () {
      const mk = (k) => {
        const [cn, dn] = SCENE_NAME[k];
        return '<button class="f-btn" type="button" data-scene="' + k + '" aria-pressed="' + (S.scene === k) + '"><span class="w">' + cn + '</span><span class="d">' + dn + '</span></button>';
      };
      return '<div class="f-sec"><span class="f-h">场景<span class="en">SCENE</span></span><div class="f-row">' + mk('essay') + mk('moment') + mk('project') + '</div></div>' +
        '<p class="f-note"><span class="w">换一处版块，天光也跟着换。</span><span class="d">换一处地方，雾的颜色也跟着换。</span></p>';
    },
    home: function () {
      return (
        '<div class="f-sec"><span class="f-h">归处<span class="en">HOME</span></span>' +
        '<a class="f-link" href="/"><span><span class="w">回到主页</span><span class="d">回到线的这一头</span></span><span class="en">/</span></a>' +
        '</div>'
      );
    },
    nexus: function () {
      return (
        '<div class="f-sec"><span class="f-h">门<span class="en">NEXUS</span></span>' +
        '<a class="f-link" id="f-nexus" href="/gate/"><span><span class="w">穿过切面</span><span class="d">走进天光的那一侧</span></span><span class="en">/gate/</span></a>' +
        '</div>' +
        '<p class="f-note">原型里点它会就地换到入口那一屏。</p>'
      );
    },
    exits: function () {
      return (
        '<div class="f-sec"><span class="f-h">出口<span class="en">EXITS</span></span>' +
        '<a class="f-link" href="https://github.com/Traveritas" rel="noopener"><span>GitHub</span><span class="en">↗</span></a>' +
        '<a class="f-link" href="/rss.xml"><span>RSS</span><span class="en">/rss.xml</span></a>' +
        '</div>'
      );
    },
    face: function () {
      return (
        '<div class="f-sec"><span class="f-h">面<span class="en">FACE</span></span>' +
        '<div class="f-row">' +
        '<button class="f-btn" type="button" data-face="wake" aria-pressed="' + (S.face === 'wake') + '">醒</button>' +
        '<button class="f-btn" type="button" data-face="dream" aria-pressed="' + (S.face === 'dream') + '">梦</button>' +
        '</div></div>' +
        '<p class="f-note"><span class="w">醒面是这一侧的字与界；换过去，天光会暖一点。</span><span class="d">另一侧的雾更软，字也更轻——但世界仍是同一片。</span></p>'
      );
    },
    sound: function () {
      return (
        '<div class="f-sec"><span class="f-h">声<span class="en">SOUND</span></span>' +
        '<button class="f-snd" id="f-snd" type="button" aria-pressed="' + S.sound + '">' +
        '<span class="fl"><i></i><i></i><i></i></span>' +
        '<span class="st">' + (S.sound ? 'ON' : 'OFF') + '</span>' +
        '<span class="cn" style="font-family:var(--font-body);font-size:.72rem">' +
        '<span class="w">环境声</span><span class="d">回响</span></span>' +
        '</button></div>' +
        '<p class="f-note">阅读页里它会退到一旁，不抢字。</p>'
      );
    },
    contents: function () {
      let body = '';
      if (S.ctx === 'read') {
        const r = currentRead().ref;
        const hs = String(r.html || '').match(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/g) || [];
        body = hs.map((h, k) => {
          const lv = h.charAt(2);
          const txt = strip(h.replace(/<span class="ord">[\s\S]*?<\/span>/, ''));
          return '<button type="button" class="' + (lv === '3' ? 'is-sub' : '') + '" data-toc="' + k + '">' + esc(txt) + '</button>';
        }).join('');
        if (!body) body = '<p class="f-note">这一篇没有分节。</p>';
      } else {
        body = items(S.scene).map((it) => (
          '<button type="button" data-kind="' + it.kind + '" data-slug="' + esc(it.ref.slug) + '">' + esc(it.ref.title) + '</button>'
        )).join('');
      }
      return '<div class="f-sec"><span class="f-h">目录<span class="en">CONTENTS</span></span><div class="f-toc" id="f-toc">' + body + '</div></div>';
    },
    reading: function () {
      const seg = (k, vals) => '<span class="f-seg" data-k="' + k + '">' + vals.map((v) =>
        '<button type="button" data-v="' + v[0] + '" aria-pressed="' + (S[k] === v[0]) + '">' + v[1] + '</button>').join('') + '</span>';
      return (
        '<div class="f-sec"><span class="f-h">读<span class="en">READING</span></span>' +
        '<div class="f-set"><span class="lab">字号</span>' + seg('readSize', [['s', '小'], ['m', '中'], ['l', '大']]) + '</div>' +
        '<div class="f-set"><span class="lab">行距</span>' + seg('readLead', [['m', '常'], ['l', '疏']]) + '</div>' +
        '</div>' +
        '<p class="f-note">只有阅读页会跟着变。</p>'
      );
    },
    filter: function () {
      const list = items(S.scene);
      const tagCount = {};
      list.forEach((it) => (it.ref.tags || []).forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));
      const chips = Object.keys(tagCount).map((t) =>
        '<button class="f-chip" type="button" data-tag="' + esc(t) + '" aria-pressed="' + !!S.tags[t] + '">' + esc(t) + '<i>' + tagCount[t] + '</i></button>').join('');
      const yrs = {};
      list.forEach((it) => { const y = yrOf(it.ref.date); (yrs[y] = yrs[y] || []).push(ymOf(it.ref.date).slice(5)); });
      const yhtml = Object.keys(yrs).sort().reverse().map((y) =>
        '<div class="f-yr"><span class="y">' + y + '</span><span class="ms">' + yrs[y].sort().map((m) =>
          '<button class="f-mo" type="button" data-ym="' + y + '-' + m + '" aria-pressed="' + (S.ym === y + '-' + m) + '">' + m + '</button>').join('') + '</span></div>').join('');
      return (
        '<div class="f-sec"><span class="f-h">筛<span class="en">FILTER</span></span>' +
        '<div class="f-chips">' + (chips || '<span class="f-note">这一片还没有标签。</span>') + '</div>' +
        '</div>' +
        '<div class="f-sec"><span class="f-h">年月<span class="en">TIME</span></span><div class="f-yrs">' + yhtml + '</div></div>'
      );
    },
    time: function () {
      return (
        '<div class="f-sec"><span class="f-h">刻<span class="en">TIME</span></span>' +
        '<div class="f-time-top"><span class="f-time-now mono" id="f-now">23:07</span><span class="f-time-pct mono" id="f-pct">0%</span></div>' +
        '<div class="f-time-track"><input id="f-range" type="range" min="0" max="1000" value="' + Math.round(S.hour * 1000) + '" aria-label="时刻"></div>' +
        '<div class="f-time-ends mono"><span>23:07</span><span>06:31</span></div>' +
        '</div>' +
        '<p class="f-note">整夜从 23:07 走到 06:31；右边那个数是这一页读到了哪里。</p>'
      );
    },
  };

  function hmLabel(t) {
    let mins = Math.round((23 * 60 + 7 + t * 444)) % 1440;
    const h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function updateHair() {
    const w = $('#world');
    const max = Math.max(1, w.scrollHeight - w.clientHeight);
    const p = clamp(w.scrollTop / max, 0, 1);
    const fill = $('#hairline i');
    if (fill) fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    const pct = $('#f-pct');
    if (pct) pct.textContent = Math.round(p * 100) + '%';
  }

  function wireFace(id) {
    const body = $('#face-body');
    if (id === 'find') {
      const q = $('#f-q'), res = $('#f-res'), cnt = $('#f-n'), clr = $('#f-clear');
      const run = () => {
        const term = S.query.trim().toLowerCase();
        const hits = term ? allItems().filter((it) => corpus(it).indexOf(term) >= 0) : [];
        cnt.textContent = term ? '命中 ' + hits.length + ' / ' + allItems().length : '全站 ' + allItems().length + ' 条';
        clr.hidden = !term;
        if (!term) {
          res.innerHTML = '<span class="none">打一个字，标题、描述、标签、正文与图注都会找一遍。</span>';
        } else if (!hits.length) {
          res.innerHTML = '<span class="none">没有命中。换一个字，或把它交给筛。</span>';
        } else {
          res.innerHTML = hits.slice(0, 9).map((it) => (
            '<button type="button" data-kind="' + it.kind + '" data-slug="' + esc(it.ref.slug) + '">' +
            '<span class="rk">' + KIND_CN[it.kind] + '</span><span class="rt">' + esc(it.ref.title) + '</span>' +
            '<span class="rd">' + esc((it.ref.date || '').slice(0, 10)) + '</span></button>'
          )).join('');
        }
      };
      q.addEventListener('input', () => { S.query = q.value; run(); });
      clr.addEventListener('click', () => { S.query = ''; q.value = ''; run(); q.focus(); });
      res.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-slug]');
        if (!b) return;
        const src = b.dataset.kind === 'article' ? D.articles : b.dataset.kind === 'project' ? D.projects : D.moments;
        const ref = src.find((x) => x.slug === b.dataset.slug);
        if (ref) openRead({ kind: b.dataset.kind, ref: ref });
      });
      run();
      if (!RM) setTimeout(() => { try { q.focus({ preventScroll: true }); } catch (e) {} }, 260);
    } else if (id === 'view') {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-view]');
        if (!b) return;
        S.view = b.dataset.view;
        renderWorld();
        openTool('view');
      });
    } else if (id === 'scene') {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-scene]');
        if (!b) return;
        setScene(b.dataset.scene);
        openTool('scene');
      });
    } else if (id === 'nexus') {
      const a = $('#f-nexus');
      if (a) a.addEventListener('click', (e) => { e.preventDefault(); setCtx('gate'); closeTool(); });
    } else if (id === 'face') {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-face]');
        if (!b) return;
        setFace(b.dataset.face);
        openTool('face');
      });
    } else if (id === 'sound') {
      const b = $('#f-snd');
      if (b) b.addEventListener('click', () => { S.sound = !S.sound; openTool('sound'); });
    } else if (id === 'contents') {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.slug) {
          const src = b.dataset.kind === 'article' ? D.articles : b.dataset.kind === 'project' ? D.projects : D.moments;
          const ref = src.find((x) => x.slug === b.dataset.slug);
          if (ref) openRead({ kind: b.dataset.kind, ref: ref });
        } else if (b.dataset.toc != null && S.ctx === 'read') {
          const hs = $$('#world h2, #world h3');
          const t = hs[+b.dataset.toc];
          if (t) t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
        }
      });
    } else if (id === 'reading') {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('.f-seg button');
        if (!b) return;
        const k = b.closest('.f-seg').dataset.k;
        S[k] = b.dataset.v;
        if (S.ctx === 'read') renderWorld();
        openTool('reading');
      });
    } else if (id === 'filter') {
      body.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tag]');
        if (t) { S.tags[t.dataset.tag] = !S.tags[t.dataset.tag]; if (S.ctx === 'grid') renderWorld(); openTool('filter'); return; }
        const m = e.target.closest('[data-ym]');
        if (m) { S.ym = S.ym === m.dataset.ym ? null : m.dataset.ym; if (S.ctx === 'grid') renderWorld(); openTool('filter'); }
      });
    } else if (id === 'time') {
      const r = $('#f-range'), now = $('#f-now');
      const sync = () => {
        S.hour = (+r.value) / 1000;
        document.documentElement.style.setProperty('--hour', String(S.hour));
        now.textContent = hmLabel(S.hour);
      };
      r.addEventListener('input', sync);
      now.textContent = hmLabel(S.hour);
    }
  }

  /* ══ 状态切换 ══ */
  function setCtx(c) {
    if (!CTX[c]) return;
    S.ctx = c;
    applyTokens();
    closeTool();
    renderWorld();
    updateCursor();
  }
  function setFace(f) {
    S.face = f;
    document.documentElement.dataset.face = f;
  }
  function setScene(s) {
    S.scene = s;
    S.ym = null;
    S.tags = {};
    applyTokens();
    if (S.ctx === 'grid' || S.ctx === 'read') renderWorld();
  }

  /* ══ 三条召唤路径 ══ */
  function showHint(on) { $('#hint').classList.toggle('show', !!on); }

  function initPaths() {
    /* 2 · 指针跟随 / 扫过：指针沿线走，刻痕逐个升起 */
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const near = Math.abs(e.clientY - LINE_Y) < 62;
      if (near) {
        S.engaged = true;
        S.kb = false;
        let best = 0, bd = Infinity;
        for (let i = 0; i < N; i++) { const d = Math.abs(notchX(i) - e.clientX); if (d < bd) { bd = d; best = i; } }
        S.idx = best;
        document.documentElement.style.setProperty('--cx', e.clientX + 'px');
        updateCursor();
        showHint(true);
      } else if (S.engaged && !S.kb) {
        S.engaged = false;
        updateCursor();
        showHint(false);
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.target.closest('#face') || e.target.closest('.nk')) return;
      if (e.clientY >= LINE_Y - 62 && e.clientY <= LINE_Y + 6) {
        if (!S.engaged) return;
        openTool(TOOLS[S.idx].id);           // 线上：挑中谁就升起谁（已开着也换面）
      } else if (S.tool && e.clientY > LINE_Y + 6) {
        closeTool();                          // 线以下：点世界就沉回去
      }
    });

    /* 3 · 快捷键：T 让游标沿线走，←/→ 挑，回车落定 */
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Escape') t.blur();
        return;
      }
      const k = e.key;
      if (k === 't' || k === 'T') {
        e.preventDefault();
        if (S.tool) { closeTool(); return; }
        S.kb = true; S.engaged = true;
        if (S.idx < 0) S.idx = 0;
        updateCursor();
        showHint(true);
        return;
      }
      if (!S.kb) return;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        S.idx = (S.idx + (k === 'ArrowRight' ? 1 : -1) + N) % N;
        updateCursor();
        if (S.tool) openTool(TOOLS[S.idx].id);
      } else if (k === 'Enter') {
        e.preventDefault();
        openTool(TOOLS[S.idx].id);
      } else if (k === 'Escape') {
        e.preventDefault();
        if (S.tool) closeTool();
        else { S.kb = false; S.engaged = false; updateCursor(); showHint(false); }
      }
    });

    /* 1 · 边缘露头：刻痕常驻，直接点（buildNotches 里已绑） */
    $('#facewrap').addEventListener('pointerdown', (e) => {
      if (e.target === $('#facewrap')) { closeTool(); }
    });
  }

  /* ══ 水：碎光与水纹（接 about-decor 的做法，别 import） ══ */
  function initWater() {
    const cv = $('#water');
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let seed = 7;
    const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const GLINTS = Array.from({ length: 150 }, () => ({ v: Math.pow(R(), 1.6), u: (R() + R() + R() - 1.5) / 1.5, ph: R() * 6.28, sp: 0.4 + R() * 1.4, l: 0.5 + R() }));
    const RIPPLES = Array.from({ length: 6 }, (_, i) => ({ v: Math.pow((i + 1 + R() * 0.6) / 7, 1.7), x0: 0.06 + R() * 0.34, x1: 0.6 + R() * 0.34, ph: R() * 6 }));
    let t = 12, last = 0, acc = 0, stop = null;

    function tone() {
      const n = document.documentElement.dataset.night;
      return n === 'light' ? 'dark' : 'light';
    }
    function draw() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const dark = tone() === 'dark';
      const rc = dark ? '60,70,90' : '255,255,255';
      const gc = dark ? '60,70,90' : '255,252,250';
      const ra = dark ? 0.1 : 0.26, ga = dark ? 0.1 : 0.9;
      for (const r of RIPPLES) {
        const y = 6 + r.v * (H - 6) + Math.sin(t * 0.5 + r.ph) * 0.6;
        const g = ctx.createLinearGradient(W * r.x0, 0, W * r.x1, 0);
        g.addColorStop(0, 'rgba(' + rc + ',0)');
        g.addColorStop(0.5, 'rgba(' + rc + ',' + (ra - r.v * 0.1).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + rc + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(W * r.x0, y, W * (r.x1 - r.x0), 1 + r.v);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const g of GLINTS) {
        const tw = 0.5 + 0.5 * Math.sin(t * g.sp + g.ph);
        const a = tw * tw * (0.95 - 0.5 * g.v) * (1 - Math.abs(g.u) * 0.55) * ga;
        if (a < 0.012) continue;
        const y = 4 + g.v * (H - 18);
        const x = W / 2 + g.u * W * 0.22 * (0.12 + 0.9 * g.v);
        const L = (3 + 14 * g.v) * g.l;
        ctx.fillStyle = 'rgba(' + gc + ',' + a.toFixed(3) + ')';
        ctx.fillRect(x - L / 2, y, L, 1 + g.v);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function frame(ts) {
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 30;
      last = ts; t += dt; acc += dt;
      if (acc < 1 / 24) return;
      acc = 0; draw();
    }
    const sync = () => {
      const run = !document.hidden && !RM;
      if (run && !stop) { last = 0; stop = requestAnimationFrame(function loop(ts) { frame(ts); if (stop) stop = requestAnimationFrame(loop); }); }
      else if (!run && stop) { cancelAnimationFrame(stop); stop = null; draw(); }
    };
    document.addEventListener('visibilitychange', sync);
    requestAnimationFrame(() => { draw(); sync(); });
    addEventListener('resize', draw);
    window.__th._water = draw;
  }

  /* ══ 启动 ══ */
  function boot() {
    const p = new URLSearchParams(location.search);
    if (p.get('ctx') && CTX[p.get('ctx')]) S.ctx = p.get('ctx');
    if (p.get('face') === 'dream') S.face = 'dream';
    if (p.get('scene') && SCENE_NAME[p.get('scene')]) S.scene = p.get('scene');
    if (p.get('view')) S.view = p.get('view');
    if (p.get('q')) S.query = p.get('q');

    buildNotches();
    applyTokens();
    renderWorld();
    initPaths();
    initWater();
    updateHair();
    $('#world').addEventListener('scroll', updateHair, { passive: true });

    setTimeout(() => { layoutLine(); updateCursor(); }, 60);

    /* ?verb=0..1：停在切片升起的中途某一帧 */
    const v = p.get('verb');
    if (v != null && v !== '') {
      document.documentElement.classList.add('frozen');
      openTool(p.get('tool') || 'find', { rise: clamp(parseFloat(v) || 0, 0, 1) });
    } else if (p.get('tool')) {
      openTool(p.get('tool'));
    }

    addEventListener('resize', () => {
      applyTokens();
      layoutLine();
      if (S.tool) anchorFace(S.idx);
      updateCursor();
    });

    setTimeout(() => { if (!S.tool && !S.engaged) showHint(true); }, 700);
    setTimeout(() => { if (!S.tool && !S.engaged) showHint(false); }, 7200);
  }

  /* 供截图脚本驱动：停帧、直接开面、给出刻痕坐标 */
  window.__th = {
    open: (id, opts) => openTool(id, opts),
    close: closeTool,
    ctx: setCtx,
    face: setFace,
    scene: setScene,
    rise: (v) => document.documentElement.style.setProperty('--rise', String(v)),
    freeze: () => document.documentElement.classList.add('frozen'),
    cursor: (i) => { S.kb = true; S.engaged = true; S.idx = i; updateCursor(); showHint(true); },
    engage: (x) => {
      S.engaged = true; S.kb = false;
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = Math.abs(notchX(i) - x); if (d < bd) { bd = d; best = i; } }
      S.idx = best;
      document.documentElement.style.setProperty('--cx', x + 'px');
      updateCursor(); showHint(true);
      return best;
    },
    nk: (i) => ({ x: notchX(i), y: LINE_Y, id: TOOLS[i].id }),
    count: N,
    state: () => ({ ctx: S.ctx, face: S.face, scene: S.scene, tool: S.tool, idx: S.idx, view: S.view, hour: S.hour, lineY: LINE_Y }),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
