/* ─────────────────────────────────────────────────────────────
   薄玻璃窗 · 工具层原型（端口 4643）
   一件东西：比内容的窗薄一档的一层窗。动词：打开 / 收起。

   · 十二件工具是九扇小窗，漂在内容的窗同一片空间里（窗的清单见 WINS）。
   · 三条召唤路径通向同一个面：边缘露头 / 拖拽与纸签 / 快捷键 W。
   · 玻璃两档写在 CSS 的 --g-alpha / --g-blur / --g-edge-a / --g-shadow 上，
     这里只负责把窗摆出来、打开、收起、搬走。
   · 地址参数：?ctx=home|grid|read|gate|404 · ?face=wake|dream · ?verb=0..1
     · ?open=<id> · ?dock=0|1 · ?multi=1 · ?tint= · ?cmp=1 · ?many=1 · ?item=<slug>
   ───────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const D = window.PLANE_DATA;
  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const P = new URLSearchParams(location.search);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ══ 夜色：三种夜 + 主页 + 失线（值照抄 hours.css / wander.css） ══ */
  const PAL = {
    essay:   { bg: '#c6ced9', fg: '#232830', soft: '#56606d', faint: '#8a94a2', ink: '#765640', glass: '250 251 253', edge: '52 62 82',   sheen: '255 255 255', dot: '#3a414c' },
    moment:  { bg: '#1d1729', fg: '#f0e9f4', soft: '#bcadca', faint: '#877a98', ink: '#e0aa86', glass: '40 30 56',   edge: '236 196 180', sheen: '250 215 200', dot: '#e8dcec' },
    project: { bg: '#0d1524', fg: '#e6ebf1', soft: '#a6b4c6', faint: '#71849c', ink: '#c9a77e', glass: '16 26 42',   edge: '168 206 226', sheen: '190 225 240', dot: '#cfdbe6' },
    home:    { bg: '#0e0f1d', fg: '#ece8f2', soft: '#b7b3c8', faint: '#827f98', ink: '#d6b28c', glass: '22 22 40',   edge: '214 206 236', sheen: '220 214 240', dot: '#d9d3e8' },
  };
  /* 工具层压在什么底上（做对比度核对时用来合成薄玻璃后的有效底色） */
  const BACKDROP = { home: '#0e0f1d', grid: '#c6ced9', read: '#cfd7e1', gate: '#e9e5f1', '404': '#0e0e18' };
  const GLASS_BY_CTX = { home: 'home', grid: 'essay', read: 'essay', gate: 'essay', '404': 'home' };

  const SCENE = {
    essay:   { t: '随笔', d: '断章', en: 'ESSAYS' },
    moment:  { t: '瞬间', d: '闪念', en: 'MOMENTS' },
    project: { t: '项目', d: '造物', en: 'PROJECTS' },
  };
  const MORPH = { 随笔: '断章', 瞬间: '闪念', 项目: '造物', 关于: '此身', 环境声: '回响', 检索: '寻声', 目录: '篇目', 场景: '景', 漫游: '漂流', 视图: '看法', 归处: '归处', 门: '门', 出口: '出口', 面: '面', 读: '读', 筛: '筛', 刻: '时刻', 去处: '去处', 醒: '梦', 小: '小', 中: '中', 大: '大', 常: '常', 疏: '疏' };

  /* ══ 内容（只读地取 layout-plane 的真内容） ══ */
  const strip = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const ITEMS = {
    essay: D.articles.map((a) => ({ scene: 'essay', kind: 'article', slug: a.slug, title: a.title, desc: a.desc, date: a.date, tags: a.tags || [], chars: a.chars, html: a.html || '' })),
    project: D.projects.map((p) => ({ scene: 'project', kind: 'project', slug: p.slug, title: p.title, desc: p.desc, date: p.date, tags: p.tags || [], links: p.links || [], note: p.note || null, html: p.html || '' })),
    moment: D.moments.map((m) => ({ scene: 'moment', kind: 'moment', slug: m.slug, title: m.title, desc: '', date: m.date, tags: m.tags || [], text: m.text || '', images: m.images || [] })),
  };
  if (P.get('many') === '1') {
    const CN = ['', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const back = (d, n) => { const t = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 16).replace('T', 'T'); };
    for (const s of Object.keys(ITEMS)) {
      const base = ITEMS[s].slice();
      for (let r = 1; r <= 5; r++) for (const it of base) ITEMS[s].push(Object.assign({}, it, { title: `${it.title} · ${CN[r]}`, date: back(it.date, r * 19 + 3), slug: `${it.slug}-r${r}` }));
      ITEMS[s].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }
  }
  const ALL = [...ITEMS.essay, ...ITEMS.moment, ...ITEMS.project];
  const hay = (it) => [it.title, it.desc, (it.tags || []).join(' '), it.text || '', strip(it.html), (it.images || []).map((i) => i.alt || '').join(' ')].join(' ').toLowerCase();
  ALL.forEach((it) => { it._h = hay(it); });

  const palVars = (s) => { const p = PAL[s] || PAL.essay; return Object.keys(p).map((k) => `--w-${k === 'glass' || k === 'edge' || k === 'sheen' ? k : k}:${p[k]}`).join(';'); };
  const dstr = (d) => String(d).slice(0, 10).replace(/-/g, '.');
  const img = (p) => `../layout-plane/${p}`;

  /* ══ 状态 ══ */
  const LS = { free: 'xm-tw-free', open: 'xm-tw-open', size: 'xm-read-size', lead: 'xm-read-lead', sound: 'xm-tw-sound', face: 'xm-tw-face' };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const S = {
    ctx: ['home', 'grid', 'read', 'gate', '404'].includes(P.get('ctx')) ? P.get('ctx') : 'home',
    face: P.get('face') === 'dream' ? 'dream' : P.get('face') === 'wake' ? 'wake' : (lsGet(LS.face, 'wake') === 'dream' ? 'dream' : 'wake'),
    dock: P.has('dock') ? (P.get('dock') === '1' ? 1 : 0) : 1,
    edge: false,
    summon: false,
    open: new Set(),
    multi: P.get('multi') === '1',
    free: lsGet(LS.free, {}),
    slip: {},
    sound: !!lsGet(LS.sound, false),
    query: '',
    tags: new Set(),
    year: null,
    month: null,
    scene: 'essay',
    item: P.get('item') || null,
    readSize: lsGet(LS.size, 'm'),
    readLead: lsGet(LS.lead, 'm'),
    scroll: 0,
  };
  /* ?open=find,face 可以一次开几扇（对照帧用） */
  if (P.get('open')) String(P.get('open')).split(',').filter(Boolean).forEach((id) => S.open.add(id));
  else if (!P.has('verb')) lsGet(LS.open, []).forEach((id) => S.open.add(id));
  for (const id of Object.keys(S.free)) if (S.free[id] && S.free[id].slip) S.slip[id] = true;

  const setLS = () => { lsSet(LS.free, S.free); lsSet(LS.open, [...S.open]); lsSet(LS.face, S.face); lsSet(LS.sound, S.sound); };
  const live = (t) => { const n = $('#t-live'); if (n) n.textContent = t; };

  /* ══ 九扇小窗 · 十二件工具 ══ */
  const WINS = [
    { id: 'find',  t: '检索', d: '寻声', en: 'FIND',     w: 236 },
    { id: 'scene', t: '场景', d: '景',   en: 'SCENE',    w: 178 },
    { id: 'where', t: '去处', d: '去处', en: 'WHERE',    w: 158 },
    { id: 'face',  t: '面',   d: '面',   en: 'FACE',     w: 186 },
    { id: 'sound', t: '环境声', d: '回响', en: 'SOUND',  w: 158 },
    { id: 'toc',   t: '目录', d: '篇目', en: 'CONTENTS', w: 236 },
    { id: 'read',  t: '读',   d: '读',   en: 'READING',  w: 186 },
    { id: 'sift',  t: '筛',   d: '筛',   en: 'SIFT',     w: 236 },
    { id: 'hour',  t: '刻',   d: '时刻', en: 'HOUR',     w: 236 },
  ];
  const PRIMARY = { home: 'find', grid: 'find', read: 'toc', gate: 'where', '404': 'find' };
  const winEl = (id) => $(`.t-win[data-id="${id}"]`);
  const winOf = (id) => WINS.find((w) => w.id === id);

  /* 工具窗里的每一件东西 */
  const BODY = {
    /* 01 检索 · FIND —— 一扇能打字的窗（窗沿上已经有名字，窗里不重复写一遍） */
    find: () => `
      <div class="t-sec">
        <input class="t-find" id="t-q" type="search" aria-label="检索 · FIND" autocomplete="off" spellcheck="false" placeholder="标题、描述、标签或正文里的字">
        <p class="t-count"><span class="t-hit">—</span><button type="button" class="t-clear" hidden>清除</button></p>
      </div>`,
    /* 02 视图 · VIEW ＋ 03 场景 · SCENE */
    scene: () => `
      <div class="t-sec">
        <p class="t-h">场景 · SCENE</p>
        <div class="t-seg" data-key="scene">
          <button type="button" data-v="essay">随笔</button>
          <button type="button" data-v="moment">瞬间</button>
          <button type="button" data-v="project">项目</button>
        </div>
      </div>
      <div class="t-sec">
        <p class="t-h">视图 · VIEW</p>
        <div class="t-seg" data-key="view">
          <button type="button" data-v="explore">漫游</button>
          <button type="button" data-v="grid">检索</button>
        </div>
      </div>`,
    /* 04 归处 · 05 门 · 06 出口 */
    where: () => `
      <div class="t-sec">
        <p class="t-h">归处 · HOME</p>
        <div class="t-row"><button type="button" class="t-link" data-go="home">回主页</button><span class="t-go">/</span></div>
      </div>
      <div class="t-sec">
        <p class="t-h">门 · NEXUS</p>
        <div class="t-row"><button type="button" class="t-link" data-go="gate">去门口</button><span class="t-go">/gate/</span></div>
      </div>
      <div class="t-sec">
        <p class="t-h">出口 · EXITS</p>
        <div class="t-row"><a href="https://github.com/Traveritas" rel="noreferrer">GitHub</a><span class="t-go">↗</span></div>
        <div class="t-row"><a href="/rss.xml">RSS</a><span class="t-go">↗</span></div>
      </div>`,
    /* 07 面 · FACE —— 一扇有闩的窗 */
    face: () => `
      <div class="t-sec">
        <div class="t-latch" data-latch role="slider" tabindex="0" aria-label="面 · 换面 · FACE" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">
          <i class="t-bar"></i>
          <span class="t-knob"></span>
          <span class="t-lbl w">醒 · WAKE</span>
          <span class="t-lbl d">梦 · DREAM</span>
        </div>
      </div>`,
    /* 08 声 · SOUND —— 一扇有弦的窗 */
    sound: () => `
      <div class="t-sec">
        <div class="t-strings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="t-seg" data-key="sound" aria-label="声 · 环境声">
          <button type="button" data-v="on">让声浮起</button>
          <button type="button" data-v="off">静</button>
        </div>
      </div>`,
    /* 09 目录 · CONTENTS —— 一扇列条目的窗 */
    toc: () => `
      <div class="t-sec">
        <div class="t-list" data-toc aria-label="目录 · CONTENTS"></div>
      </div>`,
    /* 10 读 · READING —— 字号 / 行距 */
    read: () => `
      <div class="t-sec">
        <div class="t-row"><span>字号</span>
          <span class="t-seg" data-key="size" style="flex:none">
            <button type="button" data-v="s">小</button><button type="button" data-v="m">中</button><button type="button" data-v="l">大</button>
          </span>
        </div>
        <div class="t-row" style="margin-top:7px"><span>行距</span>
          <span class="t-seg" data-key="lead" style="flex:none">
            <button type="button" data-v="m">常</button><button type="button" data-v="l">疏</button>
          </span>
        </div>
      </div>`,
    /* 11 筛 · SIFT —— 标签 / 年月 */
    sift: () => `
      <div class="t-sec">
        <p class="t-h">标签 · TAGS</p>
        <div class="t-chips" data-chips></div>
      </div>
      <div class="t-sec">
        <p class="t-h">时间 · TIME</p>
        <div class="t-time" data-time></div>
      </div>`,
    /* 12 刻 · HOUR —— 时刻 / 进度 */
    hour: () => `
      <div class="t-sec">
        <div class="t-hour" aria-label="刻 · HOUR">
          <span class="t-scale"><i></i><span class="t-cur"></span></span>
          <span class="t-read">
            <span>
              <span class="t-num" data-clock>23:07</span>
              <span class="t-sub" data-pct> · 0%</span>
            </span>
            <svg class="t-wave" viewBox="0 0 190 22" preserveAspectRatio="none" aria-hidden="true">
              <path class="bg" d="M0 11 Q6 7 12 11 T24 11 T36 11 T48 11 T60 11 T72 11 T84 11 T96 11 T108 11 T120 11 T132 11 T144 11 T156 11 T168 11 T180 11 T190 11"></path>
              <path class="live" d="M0 11 Q6 7 12 11 T24 11 T36 11 T48 11 T60 11 T72 11 T84 11 T96 11 T108 11 T120 11 T132 11 T144 11 T156 11 T168 11 T180 11 T190 11"></path>
            </svg>
          </span>
        </div>
      </div>`,
  };

  /* ══ 造工具层 ══ */
  const shelf = $('#t-shelf');
  function buildShelf() {
    shelf.innerHTML = WINS.map((w) => `
      <article class="t-win" data-id="${w.id}" style="--tw:${w.w}px" aria-label="${esc(w.t)}">
        <i class="t-tint" aria-hidden="true"></i>
        <div class="t-sill">
          <button class="t-grip" type="button" aria-expanded="false" title="${esc(w.t)} · ${esc(w.en)}">
            <i class="t-ring" aria-hidden="true"></i>
            <b data-morph data-true="${esc(w.t)}" data-dream="${esc(w.d)}">${esc(w.t)}</b>
            <i class="en">${esc(w.en)}</i>
            <span class="sp"></span>
            <i class="t-notch" aria-hidden="true"></i>
          </button>
          <button class="t-min" type="button" title="收成纸签" aria-label="收成纸签"><i></i></button>
        </div>
        <div class="t-body"><div class="t-in">${BODY[w.id]()}</div></div>
      </article>`).join('');
    /* 外置的 t-tint 要压在背景之上、内容之下 */
    $$('.t-win > .t-tint').forEach((n) => { n.style.zIndex = '-1'; });
  }

  const natural = (win) => { const inn = $('.t-in', win); return inn ? Math.ceil(inn.getBoundingClientRect().height) : 0; };

  function paintWin(id) {
    const win = winEl(id); if (!win) return;
    const open = S.open.has(id);
    win.classList.toggle('is-open', open);
    win.classList.toggle('is-slip', !!S.slip[id]);
    $('.t-grip', win).setAttribute('aria-expanded', open ? 'true' : 'false');
    const body = $('.t-body', win);
    if (win.classList.contains('t-nomotion')) return;
    body.style.height = open && !S.slip[id] ? `${natural(win)}px` : '0px';
  }
  function paintAll() { WINS.forEach((w) => paintWin(w.id)); layoutSheet(); scheduleSheet(); }

  function openWin(id, opts = {}) {
    if (!winOf(id)) return;
    if (!opts.add && !S.multi && !opts.keepOthers) S.open.forEach((o) => { if (o !== id) S.open.delete(o); });
    S.open.add(id);
    S.slip[id] = false;
    paintAll();
    if (!opts.silent) { live(`${winOf(id).t} 已打开`); setLS(); }
  }
  function closeWin(id) { S.open.delete(id); paintWin(id); layoutSheet(); setLS(); }
  function toggleWin(id) { if (S.open.has(id)) closeWin(id); else openWin(id); }

  /* ══ 收起 / 打开：边缘露头、快捷键、拖拽三条路都落到这里 ══ */
  function setDock(v) {
    S.dock = v ? 1 : 0;
    html.dataset.dock = String(S.dock);
    if (!S.dock) live('工具层打开');
    else { S.open.clear(); paintAll(); }
    layoutSheet();
  }
  const summon = (on) => { S.summon = on === undefined ? !S.summon : !!on; syncDock(true); };
  function syncDock(openPrimary) {
    const want = (S.edge || S.summon) ? 0 : 1;
    const was = S.dock;
    S.dock = want; html.dataset.dock = String(want);
    if (want === 0 && was === 1 && openPrimary) openWin(PRIMARY[S.ctx] || 'find');
    if (want === 1 && was === 0) { S.open.clear(); paintAll(); }
  }

  /* ══ 内容的窗（厚的那一档） ══ */
  const space = $('#t-space');
  function cwin(cls, vars) { const n = document.createElement('div'); n.className = `c-win ${cls}`; if (vars) n.setAttribute('style', vars); n.insertAdjacentHTML('afterbegin', '<i class="c-tint" aria-hidden="true"></i>'); return n; }

  function cardEl(it, w) {
    const n = cwin('c-card', `${palVars(it.scene)};width:${w}px`);
    const img0 = it.images && it.images[0] ? `<img class="c-img" src="${img(it.images[0].m)}" alt="${esc(it.images[0].alt || '')}" loading="lazy">` : '';
    const chips = (it.tags || []).slice(0, 3).map((t) => `<span class="c-chip">${esc(t)}</span>`).join('')
      || (it.links || []).slice(0, 2).map((l) => `<span class="c-chip">${esc(l.label)} ↗</span>`).join('');
    const desc = it.desc || String(it.text || '').split(/\n\s*\n/)[0] || '';
    n.innerHTML += `
      <div class="c-tb"><i class="c-ring"></i><b data-morph data-true="${SCENE[it.scene].t}" data-dream="${SCENE[it.scene].d}">${SCENE[it.scene].t}</b><i class="en">${SCENE[it.scene].en}</i><span class="sp"></span><span class="c-meta">${dstr(it.date)}</span></div>
      ${img0}
      <div class="c-in">
        <p class="c-date">${dstr(it.date)}</p>
        <h3>${esc(it.title)}</h3>
        <p class="c-desc">${esc(desc).slice(0, 120)}</p>
        ${chips ? `<div class="c-chips">${chips}</div>` : ''}
      </div>`;
    n.tabIndex = 0;
    n.setAttribute('role', 'button');
    n.addEventListener('click', () => setCtx('read', { item: it.slug }));
    n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCtx('read', { item: it.slug }); } });
    n._it = it;
    return n;
  }

  const readState = { it: null, idx: 0 };
  function pickItem(slug) {
    const list = [...ITEMS.essay, ...ITEMS.project, ...ITEMS.moment];
    const i = slug ? list.findIndex((x) => x.slug === slug) : -1;
    return { list, idx: i >= 0 ? i : 0 };
  }

  function buildSpace() {
    space.innerHTML = '';
    space.dataset.ctx = S.ctx;
    const many = P.get('many') === '1' ? 3 : 1;

    if (S.ctx === 'home') {
      const brand = document.createElement('div');
      brand.className = 'c-brand';
      brand.innerHTML = `<p class="c-kick"><span data-morph data-true="个人网站" data-dream="昼梦叙集">个人网站</span></p><h1>Traveritas</h1>`;
      space.appendChild(brand);
      const gate = document.createElement('a');
      gate.className = 'c-gate-link'; gate.href = '#';
      gate.innerHTML = `<svg viewBox="0 0 16 22" aria-hidden="true"><path d="M8 1 15 9 8 21 1 9Z"></path><path d="M1 9h14M8 1 5 9l3 12 3-12-3-8"></path></svg><span>NEXUS</span>`;
      gate.addEventListener('click', (e) => { e.preventDefault(); setCtx('gate'); });
      space.appendChild(gate);
      const clock = document.createElement('p'); clock.className = 'c-clock'; clock.innerHTML = `<time data-clock2>23:07</time>`;
      space.appendChild(clock);
      const exits = document.createElement('nav'); exits.className = 'c-exits'; exits.setAttribute('aria-label', '别处');
      exits.innerHTML = `<a href="https://github.com/Traveritas" rel="noreferrer">GitHub</a><a href="/rss.xml">RSS</a>`;
      space.appendChild(exits);
      /* 三扇内容的窗，各自那种夜色（窄屏只留一扇，免得挤出屏幕） */
      const narrow = innerWidth < 900;
      const spots = narrow
        ? [{ s: 'essay', x: 20, y: 0.47, w: Math.min(300, innerWidth - 40), r: -1.1 }]
        : [
            { s: 'essay', x: 0.44, y: 0.13, w: 300, r: -1.3 },
            { s: 'moment', x: 0.7, y: 0.3, w: 288, r: 0.9 },
            { s: 'project', x: 0.5, y: 0.6, w: 300, r: -0.6 },
          ];
      spots.forEach((sp) => {
        const it = ITEMS[sp.s][0];
        const c = cardEl(it, sp.w);
        const x = narrow ? sp.x : clamp(sp.x * innerWidth, 12, Math.max(12, innerWidth - sp.w - 16));
        c.style.left = `${Math.round(x)}px`;
        c.style.top = narrow ? `${sp.y * 100}%` : `${Math.round(sp.y * innerHeight)}px`;
        c.style.transform = `rotate(${sp.r}deg)`;
        space.appendChild(c);
      });
      return;
    }

    if (S.ctx === 'grid') {
      const cols = document.createElement('div'); cols.className = 't-cols';
      const order = ['essay', 'moment', 'project'];
      order.forEach((s, i) => {
        const col = document.createElement('section');
        col.className = 't-col'; col.dataset.scene = s;
        col.innerHTML = `<h2 class="t-ch"><span class="no">0${i + 1}</span><b data-morph data-true="${SCENE[s].t}" data-dream="${SCENE[s].d}">${SCENE[s].t}</b><i>${SCENE[s].en}</i><span class="ct" data-count="${s}"></span></h2>`;
        ITEMS[s].slice(0, many === 3 ? ITEMS[s].length : 99).forEach((it) => col.appendChild(cardEl(it, Math.min(360, 420 - i * 24))));
        cols.appendChild(col);
      });
      space.appendChild(cols);
      return;
    }

    if (S.ctx === 'read') {
      const { list, idx } = pickItem(S.item || readState.it?.slug);
      readState.it = list[idx]; readState.idx = idx;
      const it = readState.it;
      const narrow = innerWidth < 900;
      const left = narrow ? 12 : clamp(innerWidth * 0.24, 276, 340);
      const top = narrow ? 58 : 44;
      const w = narrow ? innerWidth - 24 : innerWidth - left - 76;
      const h = narrow ? `calc(100% - ${top}px - 22px)` : `calc(100% - ${top}px - 44px)`;
      const win = cwin('c-read', `${palVars(it.scene === 'project' ? 'essay' : it.scene)};left:${Math.round(left)}px;top:${top}px;width:${Math.round(w)}px;height:${h}`);
      win.dataset.scene = it.scene;
      const body = it.html || `<p>${esc(it.text || it.desc || '')}</p>`;
      win.innerHTML += `
        <div class="c-tb"><i class="c-ring"></i><b data-morph data-true="${SCENE[it.scene].t}" data-dream="${SCENE[it.scene].d}">${SCENE[it.scene].t}</b><i class="en">${SCENE[it.scene].en}</i><span class="sp"></span>
          <span class="c-read-nav">
            <button type="button" data-nav="-1" aria-label="上一条">‹</button>
            <span data-pos>${idx + 1} / ${list.length}</span>
            <button type="button" data-nav="1" aria-label="下一条">›</button>
          </span>
          <button class="c-read-min" type="button" aria-label="收起" data-min></button>
        </div>
        <div class="c-read-body" tabindex="0">
          <h1 class="c-rt">${esc(it.title)}</h1>
          <p class="c-rmeta"><span>${dstr(it.date)}</span>${it.chars ? `<span>${it.chars} 字</span>` : ''}${(it.tags || []).map((t) => `<span class="ink">${esc(t)}</span>`).join('')}</p>
          <div class="md">${body}</div>
        </div>`;
      space.appendChild(win);
      $('[data-min]', win).addEventListener('click', () => setCtx('home'));
      $$('[data-nav]', win).forEach((b) => b.addEventListener('click', () => {
        const n = (readState.idx + Number(b.dataset.nav) + list.length) % list.length;
        readState.it = list[n]; setCtx('read', { item: list[n].slug });
      }));
      return;
    }

    if (S.ctx === 'gate') {
      const n = document.createElement('div');
      n.className = 't-gate';
      n.innerHTML = `<svg viewBox="0 0 16 22" aria-hidden="true"><path d="M8 1 15 9 8 21 1 9Z"></path><path d="M1 9h14M8 1 5 9l3 12 3-12-3-8"></path></svg>
        <p>门 · NEXUS</p>
        <p class="q" data-morph data-true="在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？" data-dream="越过第五层浅滩之后，世界会落成透明的雪。">在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？</p>`;
      space.appendChild(n);
      return;
    }

    /* 404 */
    const n = document.createElement('div');
    n.className = 't-404';
    n.innerHTML = `<p class="n">404 · 失线</p><h2 data-morph data-true="这一页没有落定" data-dream="它刚才还在这里">这一页没有落定</h2>
      <p>线在这一小段断了。往左把那层薄玻璃推开，或者回到还连着的地方。</p>`;
    space.appendChild(n);
  }

  /* ══ 语境 / 面 ══ */
  function setCtx(ctx, opts = {}) {
    if (!['home', 'grid', 'read', 'gate', '404'].includes(ctx)) return;
    if (opts.item !== undefined) S.item = opts.item;
    S.ctx = ctx;
    html.dataset.ctx = ctx;
    html.dataset.view = ctx === 'grid' ? 'grid' : 'explore';
    html.dataset.glass = P.get('tint') || GLASS_BY_CTX[ctx] || 'essay';
    buildSpace();
    paintShelfContent();
    paintAll();
    reflowShelf();
    updateHint();
    updateHour();
    live(`${ctx} 语境`);
  }
  function setFace(f, silent) {
    S.face = f === 'dream' ? 'dream' : 'wake';
    html.dataset.face = S.face;
    $$('[data-morph]').forEach((n) => { n.textContent = S.face === 'dream' ? (n.dataset.dream || n.dataset.true) : (n.dataset.true || ''); });
    const l = $('[data-latch]'); if (l) { l.setAttribute('aria-valuenow', S.face === 'dream' ? '1' : '0'); l.style.setProperty('--latch', S.face === 'dream' ? '1' : '0'); }
    if (!silent) { setLS(); live(S.face === 'dream' ? '梦面' : '醒面'); }
  }

  /* ══ 工具窗里的活 ══ */
  function paintShelfContent() {
    /* 检索 */
    const q = $('#t-q');
    if (q) { q.value = S.query; }
    /* 场景 / 视图 / 读 / 声 的分段态 */
    $$('.t-seg').forEach((seg) => {
      const k = seg.dataset.key;
      $$('button', seg).forEach((b) => {
        const on = k === 'scene' ? b.dataset.v === S.scene
          : k === 'view' ? b.dataset.v === (S.ctx === 'grid' ? 'grid' : 'explore')
          : k === 'sound' ? (b.dataset.v === 'on') === S.sound
          : k === 'size' ? b.dataset.v === S.readSize
          : k === 'lead' ? b.dataset.v === S.readLead
          : false;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    /* 目录 */
    const toc = $('[data-toc]');
    if (toc) {
      toc.innerHTML = '';
      if (S.ctx === 'read') {
        const hs = $$('.c-read .md h2, .c-read .md h3');
        if (!hs.length) toc.innerHTML = `<p class="t-empty">这一条没有小节</p>`;
        hs.forEach((h) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = h.tagName === 'H3' ? 'is-sub' : '';
          b.textContent = h.textContent.replace(/\s+/g, ' ').trim();
          b.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          toc.appendChild(b);
        });
      } else {
        const list = [...ITEMS.essay, ...ITEMS.project, ...ITEMS.moment].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
        list.forEach((it) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = `${esc(it.title)}<span class="t-go" style="float:right;opacity:.7">${dstr(it.date).slice(5)}</span>`;
          b.addEventListener('click', () => setCtx('read', { item: it.slug }));
          toc.appendChild(b);
        });
      }
    }
    /* 筛 */
    const chips = $('[data-chips]');
    if (chips) {
      chips.innerHTML = '';
      const tags = [...new Set(ALL.flatMap((it) => it.tags || []))].slice(0, 14);
      tags.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = t; b.setAttribute('aria-pressed', S.tags.has(t) ? 'true' : 'false');
        b.addEventListener('click', () => { if (S.tags.has(t)) S.tags.delete(t); else S.tags.add(t); paintShelfContent(); applyFilter(); });
        chips.appendChild(b);
      });
      const tm = $('[data-time]');
      if (tm) {
        tm.innerHTML = '';
        const years = [...new Set(ALL.map((it) => String(it.date).slice(0, 4)))].sort().reverse();
        years.forEach((y) => {
          const row = document.createElement('span'); row.className = 't-time';
          row.innerHTML = `<button type="button" class="yr" aria-pressed="${S.year === y}">${y}</button><span class="mos"></span>`;
          const mos = $('.mos', row);
          [...new Set(ALL.filter((it) => String(it.date).slice(0, 4) === y).map((it) => String(it.date).slice(5, 7)))].sort().forEach((m) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = m;
            b.setAttribute('aria-pressed', String(S.month === `${y}-${m}`) ? 'true' : 'false');
            b.addEventListener('click', () => { S.month = S.month === `${y}-${m}` ? null : `${y}-${m}`; paintShelfContent(); applyFilter(); });
            mos.appendChild(b);
          });
          $('.yr', row).addEventListener('click', () => { S.year = S.year === y ? null : y; S.month = null; paintShelfContent(); applyFilter(); });
          tm.appendChild(row);
        });
      }
    }
    /* 刻 */
    updateHour();
  }

  function applyFilter() {
    const q = S.query.trim().toLowerCase();
    let hit = 0, total = 0;
    $$('.c-card').forEach((c) => {
      const it = c._it; if (!it) return;
      total++;
      const okQ = !q || it._h.includes(q);
      const okT = !S.tags.size || [...S.tags].every((t) => (it.tags || []).includes(t));
      const okY = !S.year || String(it.date).slice(0, 4) === S.year;
      const okM = !S.month || String(it.date).slice(0, 7) === S.month;
      const ok = okQ && okT && okY && okM;
      if (ok) hit++;
      c.classList.toggle('is-veiled', !ok);
    });
    const out = $('.t-hit');
    if (out) out.textContent = q || S.tags.size || S.year || S.month ? `${hit} / ${total}` : `${total} 条`;
    const cl = $('.t-clear');
    if (cl) cl.hidden = !(q || S.tags.size || S.year || S.month);
    $$('.t-col').forEach((col) => {
      const n = $$('.c-card:not(.is-veiled)', col).length;
      const ct = $(`[data-count="${col.dataset.scene}"]`);
      if (ct) ct.textContent = String(n);
    });
    const v = $('#t-q'); if (v && v.value !== S.query) v.value = S.query;
    const win = winEl('find'); if (win && win.classList.contains('is-open')) { $('.t-body', win).style.height = `${natural(win)}px`; }
    const sw = winEl('sift'); if (sw && sw.classList.contains('is-open')) { $('.t-body', sw).style.height = `${natural(sw)}px`; }
  }

  /* ══ 刻 · HOUR：23:07 → 06:31 ══ */
  const scrollHost = () => S.ctx === 'read' ? $('.c-read-body') : S.ctx === 'grid' ? $(`.t-col[data-scene="${S.scene}"]`) : null;
  function updateHour() {
    const host = scrollHost();
    let p = 0;
    if (host) { const max = host.scrollHeight - host.clientHeight; p = max > 8 ? clamp(host.scrollTop / max, 0, 1) : 0; }
    S.scroll = p;
    const mins = (23 * 60 + 7 + p * 444) % (24 * 60);
    const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
    const t = `${pad(hh)}:${pad(mm)}`;
    $$('[data-clock]').forEach((n) => { n.textContent = t; });
    $$('[data-clock2]').forEach((n) => { n.textContent = t; });
    $$('[data-pct]').forEach((n) => { n.textContent = ` · ${Math.round(p * 100)}%`; });
    $$('.t-cur').forEach((n) => { n.style.top = `${p * 100}%`; });
  }

  /* ══ 拖拽 / 纸签 ══ */
  const floats = $('#t-floats');
  /* 摞里留着的窗与拖出来的窗重新归位：拖出来的住进 .t-floats（那一层没被 transform，
     fixed 的坐标才真的对着视口，而不是对着这摞窗的盒子） */
  function reflowShelf() {
    WINS.forEach((w) => {
      const el = winEl(w.id); if (!el) return;
      const f = S.free[w.id];
      el.classList.toggle('is-free', !!f);
      const parent = f ? floats : shelf;
      if (el.parentElement !== parent) parent.appendChild(el);
      if (f) { el.style.left = `${f.x}px`; el.style.top = `${f.y}px`; }
      else { el.style.left = ''; el.style.top = ''; }
    });
    layoutSheet();
  }
  /* 窄屏：抽屉有多高，内容就让开多少（顶上去，不压字）。
     抽屉里开窗时它是在长高的（height 有过渡），当场量到的只是一半——
     所以这一下长完（transitionend / 兜底 640ms）再量一次，让开的高度才够。 */
  let sheetTimer = 0;
  function scheduleSheet() { clearTimeout(sheetTimer); sheetTimer = setTimeout(layoutSheet, 640); }
  function layoutSheet() {
    const narrow = innerWidth < 900;
    const bar = narrow ? Math.ceil(shelf.getBoundingClientRect().height) : 0;
    html.style.setProperty('--sheet', `${bar}px`);
    html.style.setProperty('--bar', `${bar}px`);
  }
  shelf.addEventListener('transitionend', (e) => { if (e.propertyName === 'height') scheduleSheet(); });
  function startDrag(win, id, e) {
    const r = win.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let moved = false;
    win.classList.add('is-drag');
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      if (!moved) { moved = true; win.classList.add('is-free'); if (win.parentElement !== floats) floats.appendChild(win); }
      const x = clamp(ev.clientX - dx, 2, innerWidth - r.width - 2);
      const y = clamp(ev.clientY - dy, 2, innerHeight - 26);
      win.style.left = `${x}px`; win.style.top = `${y}px`;
      S.free[id] = { x, y, slip: !!S.slip[id] };
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      win.classList.remove('is-drag');
      if (moved) { setLS(); layoutSheet(); live(`${winOf(id).t} 挪到了这里`); }
      else reflowShelf();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function toggleSlip(id) {
    S.slip[id] = !S.slip[id];
    if (S.slip[id]) S.open.delete(id);
    if (S.free[id]) S.free[id].slip = S.slip[id];
    paintWin(id); setLS(); layoutSheet();
    live(S.slip[id] ? `${winOf(id).t} 收成了纸签` : `${winOf(id).t} 展开`);
  }

  /* ══ 事件 ══ */
  shelf.addEventListener('click', (e) => {
    const win = e.target.closest('.t-win'); if (!win) return;
    const id = win.dataset.id;
    if (e.target.closest('.t-min')) { toggleSlip(id); return; }
    if (e.target.closest('.t-grip')) { e.shiftKey ? openWin(id, { add: true }) : toggleWin(id); return; }
    /* 窗里的活 */
    const seg = e.target.closest('.t-seg button');
    if (seg) {
      const k = seg.closest('.t-seg').dataset.key, v = seg.dataset.v;
      if (k === 'scene') { S.scene = v; focusScene(v); }
      else if (k === 'view') { setCtx(v === 'grid' ? 'grid' : 'home'); }
      else if (k === 'sound') { S.sound = v === 'on'; html.dataset.sound = S.sound ? 'on' : 'off'; setLS(); live(S.sound ? '声浮起' : '声静下'); }
      else if (k === 'size') { S.readSize = v; applyRead(); }
      else if (k === 'lead') { S.readLead = v; applyRead(); }
      paintShelfContent(); return;
    }
    const go = e.target.closest('[data-go]');
    if (go) { setCtx(go.dataset.go); return; }
    if (e.target.closest('.t-clear')) { S.query = ''; S.tags.clear(); S.year = null; S.month = null; paintShelfContent(); applyFilter(); return; }
    if (e.target.closest('.t-grip') === null && win.classList.contains('is-slip')) openWin(id);
  });
  shelf.addEventListener('input', (e) => {
    if (e.target.id === 't-q') { S.query = e.target.value; paintShelfContent(); applyFilter(); }
  });
  shelf.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.t-grip'); if (!grip) return;
    const win = grip.closest('.t-win');
    if (S.slip[win.dataset.id]) return;
    startDrag(win, win.dataset.id, e);
  });
  shelf.addEventListener('keydown', (e) => {
    const grip = e.target.closest('.t-grip'); if (!grip) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); openWin(grip.closest('.t-win').dataset.id); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); closeWin(grip.closest('.t-win').dataset.id); }
  });

  /* 闩：拖或点 */
  document.addEventListener('pointerdown', (e) => {
    const latch = e.target.closest('[data-latch]'); if (!latch) return;
    const bar = latch.querySelector('.t-bar');
    const move = (ev) => {
      const r = latch.getBoundingClientRect();
      const v = clamp((ev.clientX - r.left - 9) / Math.max(1, r.width - 18), 0, 1);
      latch.style.setProperty('--latch', String(v));
      latch.classList.add('is-drag');
      if ((v > 0.5) !== (S.face === 'dream')) setFace(v > 0.5 ? 'dream' : 'wake');
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); latch.classList.remove('is-drag'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    bar && bar.getBoundingClientRect();
  });
  document.addEventListener('click', (e) => {
    const latch = e.target.closest('[data-latch]');
    if (latch && !latch.classList.contains('is-drag')) { setFace(S.face === 'wake' ? 'dream' : 'wake'); }
    if (latch) latch.classList.remove('is-drag');
  });

  /* 指针靠近左边缘：工具层自己完全打开；离开就收回去 */
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const near = e.clientX < 170;
    if (near !== S.edge) { S.edge = near; syncDock(true); }
  });

  /* 快捷键：W 把它们一起唤起 / 收起 */
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) { if (e.key === 'Escape') { e.target.blur(); S.query = ''; paintShelfContent(); applyFilter(); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === '`' || e.key === '\\') { e.preventDefault(); summon(); }
    else if (k === 'escape') { S.summon = false; S.edge = false; S.open.clear(); S.dock = 1; html.dataset.dock = '1'; paintAll(); setLS(); }
    else if (k === 'f') { S.summon = true; syncDock(false); openWin('find'); }
    else if (k === 't') { S.summon = true; syncDock(false); openWin('toc'); }
    else if (k === 'm') { setFace(S.face === 'wake' ? 'dream' : 'wake'); }
    else if (k === 'v') { setCtx(S.ctx === 'grid' ? 'home' : 'grid'); }
    else if (k === '1' || k === '2' || k === '3') { S.scene = ['essay', 'moment', 'project'][+k - 1]; focusScene(S.scene); paintShelfContent(); }
  });

  function focusScene(s) {
    html.dataset.glass = P.get('tint') || (S.ctx === 'grid' ? s : GLASS_BY_CTX[S.ctx]) || 'essay';
    $$('.t-col').forEach((c) => c.classList.toggle('is-focus', c.dataset.scene === s));
    /* 不在检索里（主页 / 阅读页）：把属于这个场景的那扇内容的窗拎到前面 */
    $$('.c-card').forEach((c) => c.classList.toggle('is-front', S.ctx !== 'grid' && !!c._it && c._it.scene === s));
    updateHour();
  }
  function applyRead() {
    const sz = { s: '15px', m: '17px', l: '19.5px' }[S.readSize] || '17px';
    const ld = { m: '1.95', l: '2.35' }[S.readLead] || '1.95';
    html.style.setProperty('--read-size', sz);
    html.style.setProperty('--read-lead', ld);
    lsSet(LS.size, S.readSize); lsSet(LS.lead, S.readLead);
  }

  /* 滚动 → 刻窗 */
  document.addEventListener('scroll', (e) => {
    const host = scrollHost();
    if (host && (e.target === host || host.contains(e.target))) updateHour();
  }, true);

  function updateHint() {
    const h = $('#t-hint');
    if (!h) return;
    h.innerHTML = `<b>${S.ctx}</b> · 薄玻璃窗 · <b>W</b> 唤起/收起 · 指针近左边缘即开 · 拖窗沿搬动 · 「—」收成纸签 · Shift 点窗沿并排开`;
  }

  /* ══ 装 ══ */
  buildShelf();
  applyRead();
  html.dataset.sound = S.sound ? 'on' : 'off';
  setFace(S.face, true);
  setCtx(S.ctx);
  paintShelfContent();
  reflowShelf();
  html.dataset.dock = String(S.dock);
  paintAll();
  /* 打开态与位置在布局稳定后量一次（字宽会影响窗高） */
  const settle = () => { paintAll(); reflowShelf(); applyFilter(); updateHour(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(settle, 30));
  setTimeout(settle, 120);

  /* ══ ?verb=：把打开停在某一帧（截图用） ══ */
  function applyVerb(v) {
    const id = PRIMARY[S.ctx] || 'find';
    S.summon = true; S.dock = 0; html.dataset.dock = '0';
    S.open.clear(); S.open.add(id);
    const win = winEl(id);
    win.classList.add('t-nomotion');
    win.classList.add('is-open');
    $('.t-grip', win).setAttribute('aria-expanded', 'true');
    const n = natural(win);
    $('.t-body', win).style.height = `${Math.round(n * clamp(v, 0, 1))}px`;
    S.open.forEach((o) => { if (o !== id) paintWin(o); });
    layoutSheet();
  }
  if (P.has('verb')) {
    const v = clamp(parseFloat(P.get('verb')) || 0, 0, 1);
    setTimeout(() => applyVerb(v), 60);
    setTimeout(() => applyVerb(v), 400);
  }
  if (P.get('dock') === '0') { S.summon = true; S.dock = 0; html.dataset.dock = '0'; }
  if (P.get('cmp') === '1') {
    /* 对照帧：一扇内容的窗整片压在工具层下面，两档玻璃同框、同一块底 */
    const it = ITEMS.essay[0];
    const c = cardEl(it, 470);
    c.dataset.cmp = '1';
    c.style.left = '44px'; c.style.top = '112px';
    c.style.transform = 'none';
    c.style.zIndex = '20';
    c.style.height = `${innerHeight - 156}px`;
    space.appendChild(c);
    html.dataset.cmp = '1';
  }

  /* 换窗口大小就重摆一次（窄屏那几种摆法靠它） */
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { buildSpace(); paintShelfContent(); paintAll(); reflowShelf(); updateHour(); }, 180); });

  /* ══ 给截图脚本的手 ══ */
  window.__t = {
    state: S,
    winIds: () => WINS.map((w) => w.id),
    tools: () => ['检索 · FIND', '视图 · VIEW', '场景 · SCENE', '归处 · 回主页', '门 · NEXUS', '出口 · EXITS', '面 · 换面', '声 · 环境声', '目录 · CONTENTS', '读 · 字号/行距', '筛 · 标签/年月', '刻 · 时刻/进度'],
    face: () => ({ dock: Number(html.dataset.dock), open: [...S.open].sort(), free: Object.keys(S.free).filter((k) => S.free[k]).sort(), ids: WINS.map((w) => w.id).sort(), ctx: S.ctx, face: S.face }),
    open: (id) => openWin(id, { add: true }),
    close: (id) => closeWin(id),
    summon: (on) => { summon(on); },
    dock: (v) => { S.summon = !!v; setDock(v ? 0 : 1); if (v) openWin(PRIMARY[S.ctx] || 'find'); },
    edge: (v) => { S.edge = !!v; syncDock(true); },
    verb: (v) => applyVerb(v),
    ctx: (c, o) => setCtx(c, o || {}),
    faceTo: (f) => setFace(f),
    query: (q) => { S.query = q; paintShelfContent(); applyFilter(); },
    read: (k, v) => { if (k === 'size') S.readSize = v; else S.readLead = v; applyRead(); paintShelfContent(); },
    scrollTo: (p) => { const h = scrollHost(); if (h) { h.scrollTop = p * (h.scrollHeight - h.clientHeight); updateHour(); } },
    drag: (id, x, y) => { const w = winEl(id); S.free[id] = { x, y, slip: !!S.slip[id] }; w.classList.add('is-free'); w.style.left = `${x}px`; w.style.top = `${y}px`; setLS(); },
    slip: (id) => toggleSlip(id),
    /* 两档玻璃的数字（截图脚本据此断言「薄一档」） */
    grades: () => {
      const read = (n) => {
        const cs = getComputedStyle(n);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
        const m = /blur\(([\d.]+)px\)/.exec(bf);
        const sh = (cs.boxShadow.match(/-?[\d.]+px/g) || []).map(parseFloat).map(Math.abs);
        return {
          alpha: parseFloat(cs.getPropertyValue('--g-alpha')) || 0,
          blur: m ? parseFloat(m[1]) : 0,
          edgeA: parseFloat(cs.getPropertyValue('--g-edge-a')) || 0,
          radius: parseFloat(cs.borderTopLeftRadius) || 0,
          shadowY: sh.length ? Math.max(...sh) : 0,
          filter: bf,
        };
      };
      const c = $('.c-win:not(.c-card)') || $('.c-win');
      const t = $('.t-win:not(.is-open)') || $('.t-win');
      return { content: c ? read(c) : null, tool: t ? read(t) : null };
    },
    /* 薄玻璃后面的有效底色 ≈ 底与玻璃按 alpha 混出来的那一层；正文与墨按它算对比度 */
    contrast: () => {
      const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
      const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      const out = [];
      for (const ctx of ['home', 'grid', 'read', 'gate', '404']) {
        const g = P.get('tint') || GLASS_BY_CTX[ctx];
        const p = PAL[g] || PAL.essay;
        const back = hex(BACKDROP[ctx] || p.bg);
        const glass = p.glass.split(' ').map(Number);
        for (const grade of ['tool', 'content']) {
          const a = grade === 'tool' ? 0.3 : 0.62;
          const eff = mix(back, glass, a);
          out.push({
            ctx, glass: g, grade, eff: '#' + eff.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''),
            fg: +ratio(eff, hex(p.fg)).toFixed(2),
            soft: +ratio(eff, hex(p.soft)).toFixed(2),
            faint: +ratio(eff, hex(p.faint)).toFixed(2),
          });
        }
      }
      return out;
    },
  };
  html.dataset.ready = '1';
})();
