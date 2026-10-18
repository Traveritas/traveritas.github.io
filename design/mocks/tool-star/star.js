/* 星 · 竖排 / 同心轨道
   左下角一颗三轴正交六芒星，只是开关：点开 → 工具栏；点工具 → 详情。
   A：工具竖排在星上方，详情是右侧一张玻璃薄片。
   B：工具落在绕星的内圈轨道上，详情在更外的轨道上展开（放射排布、可循环转动）；
      圆弧说不好的（输入框、长目录）退回一张平直薄片，贴在轨道上方的屏幕一侧。
   地址参数：?v=A|B  ?ctx=index|read  ?open=1  ?tool=go|find|page|set  ?face=dream */

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
};
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 内容 ── */
const D = window.PLANE_DATA;
const ITEMS = [
  ...D.articles.map((x) => ({ ...x, kind: '随笔' })),
  ...D.moments.map((x) => ({ ...x, kind: '瞬间', desc: x.text })),
  ...D.projects.map((x) => ({ ...x, kind: '项目', tags: x.tags || [] })),
].sort((a, b) => (a.date < b.date ? 1 : -1));
const TAGS = [...new Set(ITEMS.flatMap((x) => x.tags || []))];
const MONTHS = [...new Set(ITEMS.map((x) => x.date.slice(0, 7)))];
const READ = D.articles[0];

/* ── 状态 ── */
const qs = new URLSearchParams(location.search);
const S = {
  v: qs.get('v') === 'B' ? 'B' : 'A',
  ctx: qs.get('ctx') === 'read' ? 'read' : 'index',
  open: false,
  tool: null,
  face: 'wake',
  sound: false,
  motion: '完整',
  cursor: '自绘',
  keep: '开',
  nightMode: '跟随',
  night: 200, // 23:07 之后的分钟数（0..444）
  fs: '中',
  lh: '常',
  kind: null,
  tag: null,
  month: null,
  q: '',
};

const TOOLS = [
  { id: 'go', name: '去处', en: 'GO', kind: 'sheet' },
  { id: 'find', name: '寻找', en: 'FIND', kind: 'sheet' },
  { id: 'page', name: '本页', en: 'PAGE', kind: 'sheet', only: 'read' },
  { id: 'face', name: '面', en: 'FACE', kind: 'toggle' },
  { id: 'sound', name: '声', en: 'SOUND', kind: 'toggle' },
  { id: 'set', name: '设置', en: 'PREFS', kind: 'sheet' },
];
const tools = () => TOOLS.filter((t) => !t.only || t.only === S.ctx);

/* 图标：同一种 1.25px 线，取形于星的轴线与仪轨刻度 */
const ICON = {
  go: '<path class="fill" d="M12 4.5 18.5 8.25 12 12 5.5 8.25Z"/><path d="M12 4.5 18.5 8.25V15.75L12 19.5 5.5 15.75V8.25Z M5.5 8.25 12 12 18.5 8.25 M12 12V19.5"/>',
  find: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.6 14.6 19.5 19.5"/>',
  page: '<path d="M7 4V20 M7 7.5H16 M7 11.5H12.5 M7 15.5H17.5"/>',
  face: '<path d="M12 5A7 7 0 0 0 12 19"/><path d="M12 5H15V8H18V16H15V19H12"/>',
  sound: '<line x1="7" y1="6" x2="7" y2="18"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/>',
  set: '<path d="M4 7H20 M4 12H20 M4 17H20"/><circle class="knob" cx="9" cy="7" r="1.9"/><circle class="knob" cx="15.5" cy="12" r="1.9"/><circle class="knob" cx="11" cy="17" r="1.9"/>',
};
const icon = (id) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', `ico ico-${id}`);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICON[id];
  return s;
};

/* ── 夜色：23:07 → 06:31 插值 --bg（原型里只取几站浅色） ── */
const NIGHT = [
  [0, [223, 228, 236]],
  [120, [214, 217, 230]],
  [250, [207, 210, 226]],
  [370, [221, 225, 234]],
  [444, [240, 243, 246]],
];
const fmtNight = (m) => {
  const t = mod(23 * 60 + 7 + Math.round(m), 1440);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
function nowNight() {
  const d = new Date();
  const m = mod(d.getHours() * 60 + d.getMinutes() - (23 * 60 + 7), 1440);
  return m <= 444 ? m : 444;
}
function applyNight() {
  const m = S.nightMode === '跟随' ? nowNight() : S.night;
  let i = 0;
  while (i < NIGHT.length - 2 && NIGHT[i + 1][0] < m) i++;
  const [a, ca] = NIGHT[i];
  const [b, cb] = NIGHT[i + 1];
  const t = clamp((m - a) / (b - a), 0, 1);
  const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
  document.documentElement.style.setProperty('--bg', `rgb(${c})`);
}

/* ── 假页面 ── */
const page = $('#page');
function matches(x) {
  if (S.kind && x.kind !== S.kind) return false;
  if (S.tag && !(x.tags || []).includes(S.tag)) return false;
  if (S.month && !x.date.startsWith(S.month)) return false;
  if (S.q) {
    const hay = `${x.title} ${x.desc || ''} ${(x.tags || []).join(' ')} ${(x.html || '').replace(/<[^>]+>/g, '')}`;
    if (!hay.toLowerCase().includes(S.q.toLowerCase())) return false;
  }
  return true;
}
function renderPage() {
  page.replaceChildren();
  if (S.ctx === 'read') {
    page.style.setProperty('--fs', { 小: 0.92, 中: 1, 大: 1.1 }[S.fs]);
    page.style.setProperty('--lh', { 常: 1.9, 疏: 2.2 }[S.lh]);
    page.append(
      h('div', { class: 'pg-eyebrow' }, `随笔 · ${READ.date}`),
      h('h1', { class: 'pg-title' }, READ.title),
      h('article', { class: 'prose', html: READ.html }),
    );
    page.querySelectorAll('.prose h2').forEach((el, i) => (el.id = `s${i}`));
    return;
  }
  const list = ITEMS.filter(matches);
  const bits = [S.kind, S.tag && `#${S.tag}`, S.month, S.q && `「${S.q}」`].filter(Boolean);
  page.append(
    h('div', { class: 'pg-eyebrow' }, 'WANDER · 漫游'),
    h('h1', { class: 'pg-title' }, S.kind || '全部'),
    h('div', { class: 'pg-filter' }, bits.length ? [h('b', {}, bits.join('  ')), `  ·  ${list.length} 条`] : ''),
    ...(list.length
      ? list.map((x) =>
          h(
            'div',
            { class: 'row', onclick: () => setCtx('read') },
            h('div', { class: 'row-d' }, x.date.slice(0, 10)),
            h('div', { class: 'row-t' }, x.title),
            h('div', { class: 'row-m' }, h('span', {}, x.kind), (x.tags || []).map((t) => h('span', {}, t))),
          ),
        )
      : [h('div', { class: 'empty' }, '这里暂时空着。')]),
  );
}

/* ── 共用动作 ── */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 1600);
}
function setCtx(ctx) {
  S.ctx = ctx;
  if (S.tool === 'page' && ctx !== 'read') S.tool = null;
  syncProto();
  renderPage();
  scrollTo(0, 0);
  rebuild();
}
function goTo(dest) {
  if (dest === 'nexus') return toast('→ /gate/');
  if (dest === 'gh') return toast('→ GitHub');
  if (dest === 'rss') return toast('→ /rss.xml');
  S.kind = dest === 'home' ? null : dest;
  S.tag = S.month = null;
  S.q = '';
  setCtx('index');
}
const here = () => (S.ctx === 'read' ? '随笔' : S.kind || 'home');

function flipFace(x, y) {
  const next = S.face === 'wake' ? 'dream' : 'wake';
  const done = () => {
    S.face = next;
    document.documentElement.dataset.face = next;
    rebuild(true);
  };
  if (RM) return done();
  const f = $('#flip');
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  f.style.background = next === 'dream' ? 'rgba(147,137,174,.28)' : 'rgba(240,243,246,.5)';
  f.style.backdropFilter = 'blur(6px)';
  f.style.visibility = 'visible';
  f.animate(
    [{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }],
    { duration: 650, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' },
  ).onfinish = () => {
    done();
    f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = () => {
      f.style.visibility = 'hidden';
      f.getAnimations().forEach((a) => a.cancel());
    };
  };
}
function toggleSound() {
  S.sound = !S.sound;
  document.documentElement.classList.toggle('sound-on', S.sound);
  toast(S.sound ? '环境声 · 开' : '环境声 · 关');
}

/* ── 星：三轴正交，±x ±y ±z 六支 ── */
const starG = $('#starG');
const ST = { auto: 0, spin: 0, spinTo: 0, t: performance.now() };
function drawStar(now) {
  const dt = Math.min(0.05, (now - ST.t) / 1000);
  ST.t = now;
  const speed = { 完整: 14, 轻: 5, 静止: 0 }[S.motion];
  if (S.face === 'dream' && !RM) ST.auto += dt * speed;
  else ST.auto += (Math.round(ST.auto / 90) * 90 - ST.auto) * Math.min(1, dt * 3);
  ST.spin += (ST.spinTo - ST.spin) * Math.min(1, dt * 7);
  const wob = S.face === 'dream' && !RM ? Math.sin(now / 2300) * 6 * (speed / 14) : 0;
  const yaw = (45 + ST.auto + ST.spin) * DEG;
  const pit = (35.264 + wob) * DEG;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  const spikes = [];
  for (const [ax, ay, az] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    for (const s of [1, -1]) {
      const x0 = ax * s, y0 = ay * s, z0 = az * s;
      const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp;
      spikes.push({ x: x1 * 16, y: -y2 * 16, z: z2 });
    }
  }
  spikes.sort((a, b) => a.z - b.z);
  let out = '';
  for (const p of spikes) {
    const L = Math.hypot(p.x, p.y);
    if (L < 0.6) continue;
    const ux = p.x / L, uy = p.y / L, w = 1.9;
    const op = (0.38 + 0.5 * (p.z + 1) / 2).toFixed(3);
    out += `<path d="M${-uy * w} ${ux * w}L${p.x.toFixed(2)} ${p.y.toFixed(2)}L${uy * w} ${-ux * w}L${-ux * 1.4} ${-uy * 1.4}Z" fill="currentColor" fill-opacity="${op}"/>`;
  }
  out += '<circle class="hub" r="1.7"/>';
  starG.innerHTML = out;
}

/* ═══════════════ A：竖排 ═══════════════ */
const dock = $('#dock');
const colA = $('#colA');
const sheetA = $('#sheetA');

function toolButton(t, i) {
  const b = h(
    'button',
    {
      class: 'tool',
      type: 'button',
      'data-t': t.id,
      'aria-label': t.name,
      'aria-pressed': t.kind === 'sheet' ? String(S.tool === t.id) : null,
      style: `--i:${i}`,
    },
    icon(t.id),
    h('span', { class: 'lab' }, t.name, h('small', {}, t.en)),
  );
  b.addEventListener('click', (e) => onTool(t, b, e));
  return b;
}
function onTool(t, el) {
  if (t.id === 'face') {
    const r = el.getBoundingClientRect();
    return flipFace(r.left + r.width / 2, r.top + r.height / 2);
  }
  if (t.id === 'sound') return toggleSound();
  S.tool = S.tool === t.id ? null : t.id;
  rebuild();
  if (S.tool === 'find') setTimeout(() => $('.field', S.v === 'A' ? sheetA : sheetB)?.focus(), 60);
}

/* 薄片内容（A 全部用它；B 只有「本页」与输入框用平直的） */
function sheetGo() {
  const cur = here();
  const dests = [['home', '主页', 'HOME'], ['随笔', '随笔', 'ESSAYS'], ['瞬间', '瞬间', 'MOMENTS'], ['项目', '项目', 'WORKS'], ['nexus', 'NEXUS', 'GATE']];
  return [
    h('div', { class: 'sh-h' }, '去处', h('small', {}, 'GO')),
    h('ul', { class: 'go-list' }, dests.map(([k, n, en]) =>
      h('li', {}, h('button', { 'aria-current': String(cur === k), onclick: () => goTo(k) }, n, h('small', {}, en))))),
    h('div', { class: 'sh-sec' }, h('div', { class: 'go-exits' },
      h('button', { onclick: () => goTo('gh') }, 'GitHub ↗'), h('button', { onclick: () => goTo('rss') }, 'RSS ↗'))),
  ];
}
function findField(onEnter) {
  return h('input', {
    class: 'field', type: 'search', placeholder: '标题、正文、标签……', value: S.q,
    oninput: (e) => { S.q = e.target.value; if (S.ctx === 'index') renderPage(); updateCount(); },
    onkeydown: (e) => { if (e.key === 'Enter' && S.ctx === 'read') { setCtx('index'); onEnter?.(); } },
  });
}
const updateCount = () => document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = `${ITEMS.filter(matches).length} / ${ITEMS.length}`));
function chip(label, on, fn) {
  return h('button', { class: 'chip', 'aria-pressed': String(on), onclick: fn }, label);
}
function sheetFind() {
  return [
    h('div', { class: 'sh-h' }, '寻找', h('small', {}, 'FIND  /')),
    findField(),
    h('div', { class: 'count', 'data-count': true }),
    h('div', { class: 'sh-sec' }, h('div', { class: 'sh-k' }, '标签'),
      h('div', { class: 'chips' }, TAGS.map((t) => chip(t, S.tag === t, () => { S.tag = S.tag === t ? null : t; refreshFilter(); })))),
    h('div', { class: 'sh-sec' }, h('div', { class: 'sh-k' }, '年月'),
      h('div', { class: 'chips' }, MONTHS.map((m) => chip(m.replace('-', ' · '), S.month === m, () => { S.month = S.month === m ? null : m; refreshFilter(); })))),
  ];
}
function refreshFilter() {
  if (S.ctx !== 'index') setCtx('index');
  else { renderPage(); rebuild(true); }
}
function sheetPage() {
  const hs = [...page.querySelectorAll('.prose h2')];
  return [
    h('div', { class: 'sh-h' }, '本页', h('small', {}, 'CONTENTS')),
    h('ol', { class: 'toc' }, hs.map((el) =>
      h('li', {}, h('button', { onclick: () => el.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }) }, el.textContent.replace(/^\d+/, ''))))),
    h('div', { class: 'sh-sec' },
      h('div', { class: 'opt' }, '字号', h('div', { class: 'chips' }, ['小', '中', '大'].map((v) => chip(v, S.fs === v, () => { S.fs = v; renderPage(); rebuild(true); })))),
      h('div', { class: 'opt' }, '行距', h('div', { class: 'chips' }, ['常', '疏'].map((v) => chip(v, S.lh === v, () => { S.lh = v; renderPage(); rebuild(true); }))))),
  ];
}
const SETS = [
  ['motion', '动效', ['完整', '轻', '静止']],
  ['cursor', '光标', ['自绘', '系统']],
  ['keep', '记住面', ['开', '关']],
  ['nightMode', '夜色', ['跟随', '固定']],
];
function setOpt(k, v) {
  S[k] = v;
  if (k === 'nightMode') applyNight();
  if (k === 'cursor') toast(v === '自绘' ? '光标 · 自绘（原型里不画）' : '光标 · 系统');
}
function sheetSet() {
  const range = h('input', {
    class: 'night', type: 'range', min: 0, max: 444, value: S.nightMode === '跟随' ? nowNight() : S.night,
    oninput: (e) => { S.night = +e.target.value; S.nightMode = '固定'; applyNight(); rebuild(true); },
  });
  return [
    h('div', { class: 'sh-h' }, '设置', h('small', {}, 'PREFS')),
    SETS.map(([k, n, vals]) => h('div', { class: 'opt' }, n, h('div', { class: 'chips' }, vals.map((v) => chip(v, S[k] === v, () => { setOpt(k, v); rebuild(true); }))))),
    h('div', { class: 'sh-sec' },
      h('div', { class: 'sh-k' }, `夜色停在 ${fmtNight(S.nightMode === '跟随' ? nowNight() : S.night)}`),
      range, h('div', { class: 'night-row' }, h('span', {}, '23:07'), h('span', {}, '06:31'))),
  ];
}
const SHEETS = { go: sheetGo, find: sheetFind, page: sheetPage, set: sheetSet };

function buildA(soft) {
  const show = S.v === 'A';
  dock.classList.toggle('open-A', show && S.open);
  colA.hidden = !show;
  dock.classList.toggle('sheet-open', show && S.open && !!S.tool);
  if (!soft || colA.childElementCount !== tools().length) colA.replaceChildren(...tools().map(toolButton));
  else colA.querySelectorAll('.tool').forEach((b) => b.hasAttribute('aria-pressed') && b.setAttribute('aria-pressed', String(S.tool === b.dataset.t)));
  const on = show && S.open && S.tool;
  if (on) {
    const keepFocus = document.activeElement?.classList.contains('field') && sheetA.contains(document.activeElement);
    // 正在输入时不重建，免得丢焦点
    if (!keepFocus || sheetA.dataset.t !== S.tool) {
      sheetA.replaceChildren(...SHEETS[S.tool]().flat());
      sheetA.dataset.t = S.tool;
    }
  }
  sheetA.classList.toggle('on', !!on);
  updateCount();
}

/* ═══════════════ B：同心轨道 ═══════════════ */
const orbLayer = $('#orbLayer');
const tracks = $('#tracks');
const sheetB = $('#sheetB');
const SVGNS = 'http://www.w3.org/2000/svg';
const C = { x: 46, y: 0 };
const K = () => clamp(Math.min(innerWidth, innerHeight * 1.2) / 760, 0.72, 1);

/* 一条轨道：items 沿圆弧排开，θ 从 0°（星正右）到 90°（星正上），列表从上往下顺时针读。
   loop：首尾相接，转出去的从另一头转回来（项少时按需复制，周期要大于可见弧）。 */
class Ring {
  constructor({ R, items, step, loop = false, start, render, key }) {
    this.R = R * K();
    this.key = key;
    this.loop = loop;
    const m = Math.asin(clamp((C.x - 6) / this.R, 0, 1)) / DEG;
    this.lo = -m;
    this.hi = 90 + m;
    const span = this.hi - this.lo + 24;
    const N = items.length;
    this.step = loop ? Math.max(step, span / Math.max(N, 1) / Math.max(1, Math.ceil(span / (N * step)))) : step;
    this.copies = loop ? Math.max(1, Math.ceil(span / (N * this.step))) : 1;
    this.P = this.step * N * this.copies;
    this.start = start ?? Math.min(84, this.hi - 6);
    this.offset = RM ? 0 : -50;
    this.target = 0;
    this.alpha = RM ? 1 : 0;
    this.alphaTo = 1;
    this.els = [];
    for (let c = 0; c < this.copies; c++)
      items.forEach((it, i) => {
        const el = render(it, i);
        el.classList.add('orb');
        if (c) el.setAttribute('aria-hidden', 'true'), el.setAttribute('tabindex', '-1');
        orbLayer.append(el);
        this.els.push({ el, k: c * N + i, rot: el.classList.contains('ray') });
        bindDrag(el, this);
      });
  }
  angle(k) {
    if (!this.loop) return this.start - k * this.step + this.offset;
    const hiE = this.hi + 12;
    return hiE - mod(k * this.step - this.offset + (hiE - this.start), this.P);
  }
  frame() {
    this.offset += (this.target - this.offset) * 0.16;
    this.alpha += (this.alphaTo - this.alpha) * 0.18;
    for (const { el, k, rot } of this.els) {
      const a = this.angle(k);
      const x = C.x + this.R * Math.cos(a * DEG);
      const y = C.y - this.R * Math.sin(a * DEG);
      const edge = clamp((a - (this.lo - 10)) / 12, 0, 1) * clamp((this.hi + 10 - a) / 12, 0, 1);
      const o = this.alpha * edge;
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
      el.style.transform = rot
        ? `translate(${x}px,${y}px) rotate(${-a}deg) translate(0,-50%)`
        : `translate(${x}px,${y}px) translate(-50%,-50%)`;
    }
  }
  nudge(d) {
    this.target += d;
    if (!this.loop) this.target = clamp(this.target, -20, 20);
    clearTimeout(this.snapT);
    this.snapT = setTimeout(() => this.snap(), 160);
  }
  snap() {
    this.target = this.loop ? Math.round(this.target / this.step) * this.step : 0;
  }
  leave() {
    this.alphaTo = 0;
    this.target -= RM ? 0 : 30;
    setTimeout(() => this.els.forEach(({ el }) => el.remove()), RM ? 0 : 380);
  }
}

/* 拖着转：指针绕星心转过的角度直接加到 offset 上；动了就不算点击 */
let drag = null;
function ptrAngle(e) {
  return Math.atan2(C.y - e.clientY, e.clientX - C.x) / DEG;
}
function bindDrag(el, ring) {
  el.addEventListener('pointerdown', (e) => {
    drag = { ring, a: ptrAngle(e), x: e.clientX, y: e.clientY, moved: false, el };
  });
  el.addEventListener('click', (e) => { if (el._dragged) { e.stopImmediatePropagation(); e.preventDefault(); el._dragged = false; } }, true);
  el.addEventListener('wheel', (e) => { e.preventDefault(); ring.nudge(-e.deltaY * 0.06); }, { passive: false });
}
addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
  if (!drag.moved) { drag.moved = true; drag.el.setPointerCapture?.(e.pointerId); }
  const a = ptrAngle(e);
  let d = a - drag.a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  drag.a = a;
  if (drag.ring.loop) drag.ring.target += d, (drag.ring.offset += d);
  else drag.ring.target = clamp(drag.ring.target + d, -20, 20);
  if (drag.knob) drag.knob(a);
});
addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.moved) { drag.el._dragged = true; if (!drag.knob) drag.ring.snap(); }
  drag = null;
});

let rings = {};
let nightArc = null;
function bandsAndTracks() {
  tracks.replaceChildren();
  const add = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    tracks.append(el);
    return el;
  };
  add('circle', { class: 'trk dash', cx: C.x, cy: C.y, r: 30 });
  for (const r of Object.values(rings)) {
    add('circle', { class: 'trk', cx: C.x, cy: C.y, r: r.R });
    const band = add('circle', { class: 'band', cx: C.x, cy: C.y, r: r.R });
    bindDrag(band, r);
  }
  if (nightArc) drawNightArc(add);
  const outer = Math.max(0, ...Object.values(rings).map((r) => r.R), nightArc ? nightArc.R : 0);
  $('#orbit').style.setProperty('--sr', `${outer}px`);
  $('#orbit').classList.toggle('on', outer > 0);
}

/* 夜色弧：23:07 在上（θ≈86°），顺时针走到 06:31（θ≈4°），像钟面的一角 */
const NA = { a0: 86, a1: 4 };
const nightToA = (m) => NA.a0 + (NA.a1 - NA.a0) * (m / 444);
const aToNight = (a) => clamp(((a - NA.a0) / (NA.a1 - NA.a0)) * 444, 0, 444);
const pt = (R, a) => [C.x + R * Math.cos(a * DEG), C.y - R * Math.sin(a * DEG)];
function drawNightArc(add) {
  const R = nightArc.R;
  const m = S.nightMode === '跟随' ? nowNight() : S.night;
  const arc = (from, to) => { const [x0, y0] = pt(R, from), [x1, y1] = pt(R, to); return `M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}`; };
  add('path', { class: 'arc', d: arc(NA.a0, NA.a1) });
  add('path', { class: 'arc-fill', d: arc(NA.a0, nightToA(m)) });
  // 整点刻度：00:00 在 23:07 之后 53 分钟，之后每小时一道
  for (let at = 53; at <= 444; at += 60) {
    const a = nightToA(at);
    const [x0, y0] = pt(R - 5, a), [x1, y1] = pt(R + 5, a);
    add('line', { class: 'tick', x1: x0, y1: y0, x2: x1, y2: y1 });
  }
}
function placeNightBits() {
  if (!nightArc) return;
  const m = S.nightMode === '跟随' ? nowNight() : S.night;
  const a = nightToA(m);
  const [x, y] = pt(nightArc.R, a);
  nightArc.knob.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
  const [tx, ty] = pt(nightArc.R + 14, a);
  nightArc.label.style.transform = `translate(${tx}px,${ty}px) rotate(${-a}deg) translate(0,-50%)`;
  nightArc.label.textContent = fmtNight(m);
  nightArc.label.style.opacity = nightArc.knob.style.opacity = '1';
  nightArc.ends.forEach((el, i) => (el.style.opacity = Math.abs(a - (i ? NA.a1 : NA.a0)) < 14 ? '0' : '1'));
}
function buildNightArc(R) {
  const knob = h('div', { class: 'orb knob', role: 'slider', tabindex: 0, 'aria-label': '夜色时刻', 'aria-valuemin': 0, 'aria-valuemax': 444 });
  const label = h('div', { class: 'orb ray time' });
  const ends = [['23:07', NA.a0 + 5], ['06:31', NA.a1 - 5]].map(([t, a]) => {
    const el = h('div', { class: 'orb ray hour' }, t);
    const [x, y] = pt(R * K() + 14, a);
    el.style.transform = `translate(${x}px,${y}px) rotate(${-a}deg) translate(0,-50%)`;
    return el;
  });
  orbLayer.append(knob, label, ...ends);
  nightArc = { R: R * K(), knob, label, ends };
  const setFrom = (a) => { S.night = Math.round(aToNight(a)); S.nightMode = '固定'; applyNight(); placeNightBits(); bandsAndTracks(); syncSetRays(); };
  knob.addEventListener('pointerdown', (e) => { drag = { ring: { loop: false, target: 0 }, a: ptrAngle(e), x: e.clientX, y: e.clientY, moved: true, el: knob, knob: setFrom }; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 10, ArrowDown: 10, ArrowLeft: -10, ArrowUp: -10 }[e.key];
    if (!d) return;
    e.preventDefault();
    S.night = clamp((S.nightMode === '跟随' ? nowNight() : S.night) + d, 0, 444);
    S.nightMode = '固定';
    applyNight(); placeNightBits(); bandsAndTracks(); syncSetRays();
  });
  placeNightBits();
}

function ray(text, attrs = {}, small) {
  return h('button', { class: 'ray', type: 'button', ...attrs }, text, small ? h('small', {}, small) : null);
}
let setRays = [];
function syncSetRays() {
  setRays.forEach(({ el, k, n }) => { el.replaceChildren(`${n} · `, h('b', {}, S[k])); });
}

/* B 的外圈：每个工具一种展开 */
const OUTER = {
  go() {
    const cur = here();
    const dests = [['home', '主页'], ['随笔', '随笔'], ['瞬间', '瞬间'], ['项目', '项目'], ['nexus', 'NEXUS'], ['gh', 'GitHub ↗'], ['rss', 'RSS ↗']];
    rings.go = new Ring({ key: 'go', R: 180, step: 17, loop: true, items: dests,
      render: ([k, n]) => ray(n, { 'aria-current': String(cur === k), onclick: () => goTo(k) }) });
  },
  find() {
    sheetB.className = 'sheet sheet-b bar';
    sheetB.style.bottom = `${C.yb + 262 * K() + 22}px`;
    sheetB.replaceChildren(findField(), h('div', { class: 'count', 'data-count': true }));
    sheetB.classList.add('on');
    rings.tags = new Ring({ key: 'tags', R: 170, step: 15, loop: true, items: TAGS,
      render: (t) => ray(t, { 'aria-pressed': String(S.tag === t), onclick: () => { S.tag = S.tag === t ? null : t; refreshFilter(); } }) });
    rings.months = new Ring({ key: 'months', R: 246, step: 12, items: MONTHS, start: 60,
      render: (m) => { const el = ray(m.replace('-', ' · '), { 'aria-pressed': String(S.month === m), onclick: () => { S.month = S.month === m ? null : m; refreshFilter(); } }); el.classList.add('sm'); return el; } });
    updateCount();
  },
  page() {
    sheetB.className = 'sheet sheet-b';
    sheetB.style.bottom = `${C.yb + 112 * K() + 18}px`;
    sheetB.replaceChildren(...sheetPage().flat());
    sheetB.classList.add('on');
  },
  set() {
    setRays = [];
    rings.set = new Ring({ key: 'set', R: 168, step: 19, start: 78, items: SETS,
      render: ([k, n, vals]) => {
        const el = ray('', { class: 'ray set', onclick: () => { const i = vals.indexOf(S[k]); setOpt(k, vals[(i + 1) % vals.length]); syncSetRays(); placeNightBits(); bandsAndTracks(); } });
        setRays.push({ el, k, n });
        return el;
      } });
    syncSetRays();
    buildNightArc(300);
  },
};

let toolRing = null;
function buildB(soft) {
  const show = S.v === 'B' && S.open;
  C.yb = 46;
  C.y = innerHeight - 46;
  if (soft && show && toolRing) {
    // 只刷状态：按下态 / 当前项
    toolRing.els.forEach(({ el }) => el.hasAttribute('aria-pressed') && el.setAttribute('aria-pressed', String(S.tool === el.dataset.t)));
    if (S.tool === 'find' || S.tool === 'go') {
      const keep = document.activeElement?.classList.contains('field');
      if (S.tool === 'find') {
        rings.tags?.els.forEach(({ el }, i) => el.setAttribute('aria-pressed', String(S.tag === TAGS[i % TAGS.length])));
        rings.months?.els.forEach(({ el }, i) => el.setAttribute('aria-pressed', String(S.month === MONTHS[i % MONTHS.length])));
        if (!keep) updateCount();
      } else {
        const cur = here();
        const keys = ['home', '随笔', '瞬间', '项目', 'nexus', 'gh', 'rss'];
        rings.go?.els.forEach(({ el }, i) => el.setAttribute('aria-current', String(cur === keys[i % keys.length])));
      }
      return;
    }
    if (S.tool === 'page') { sheetB.replaceChildren(...sheetPage().flat()); return; }
    if (S.tool === 'set') { syncSetRays(); return; }
    return;
  }
  // 收掉外圈
  Object.values(rings).forEach((r) => r.leave());
  rings = {};
  if (nightArc) { [nightArc.knob, nightArc.label, ...nightArc.ends].forEach((el) => el.remove()); nightArc = null; }
  sheetB.classList.remove('on');
  if (!show) {
    toolRing?.leave();
    toolRing = null;
    tracks.replaceChildren();
    $('#orbit').classList.remove('on');
    return;
  }
  if (!toolRing || toolRing.ids !== tools().map((t) => t.id).join()) {
    toolRing?.leave();
    const list = tools();
    const step = 88 / (list.length - 1);
    toolRing = new Ring({ key: 'tools', R: 104, step, start: 92, items: list, render: (t, i) => toolButton(t, i) });
    toolRing.ids = list.map((t) => t.id).join();
  }
  toolRing.els.forEach(({ el }) => el.hasAttribute('aria-pressed') && el.setAttribute('aria-pressed', String(S.tool === el.dataset.t)));
  if (S.tool && OUTER[S.tool]) OUTER[S.tool]();
  bandsAndTracks();
}

/* ── 总调度 ── */
function rebuild(soft = false) {
  $('#star').setAttribute('aria-expanded', String(S.open));
  buildA(soft);
  buildB(soft);
}
function setOpen(v) {
  if (v === S.open) return;
  S.open = v;
  if (!v) S.tool = null;
  ST.spinTo += 90;
  rebuild();
}
$('#star').addEventListener('click', () => setOpen(!S.open));

function syncProto() {
  document.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(S[seg.dataset.key] === b.dataset.val))));
}
document.querySelectorAll('.seg button').forEach((b) =>
  b.addEventListener('click', () => {
    const k = b.parentElement.dataset.key;
    if (k === 'ctx') return setCtx(b.dataset.val);
    S.v = b.dataset.val;
    syncProto();
    const u = new URL(location.href);
    u.searchParams.set('v', S.v);
    history.replaceState(null, '', u);
    toolRing?.leave();
    toolRing = null;
    rebuild();
  }),
);

addEventListener('keydown', (e) => {
  const typing = e.target.matches?.('input, textarea');
  if (e.key === 'Escape') {
    if (S.tool) { S.tool = null; rebuild(); }
    else setOpen(false);
    $('#star').focus();
  } else if (e.key === '/' && !typing) {
    e.preventDefault();
    if (!S.open) setOpen(true);
    if (S.tool !== 'find') { S.tool = 'find'; rebuild(); }
    setTimeout(() => $('.field', S.v === 'A' ? sheetA : sheetB)?.focus(), 60);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!S.open || !S.tool) return;
  if (e.target.closest('.dock, .orb, .sheet, .band, .proto, .row')) return;
  S.tool = null;
  rebuild();
});
addEventListener('resize', () => { if (S.v === 'B' && S.open) { toolRing?.leave(); toolRing = null; rebuild(); } });

function loop(now) {
  drawStar(now);
  toolRing?.frame();
  Object.values(rings).forEach((r) => r.frame());
  requestAnimationFrame(loop);
}

/* 启动 */
if (qs.get('face') === 'dream') { S.face = 'dream'; document.documentElement.dataset.face = 'dream'; }
applyNight();
syncProto();
renderPage();
if (qs.get('open')) S.open = true;
if (qs.get('tool')) { S.open = true; S.tool = qs.get('tool'); }
rebuild();
requestAnimationFrame(loop);
setInterval(() => S.nightMode === '跟随' && applyNight(), 60000);
window.__star = { S, rebuild, setOpen };
