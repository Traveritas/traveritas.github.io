/* ─────────────────────────────────────────────────────────────
   重做 r2 · AveritA 的昼梦叙集 · 一片地面上的几处地方
   #/                 主页：一根 14° 的线，三颗晶体挂在上面
   #/essays …         一处的名录：晶体成了这一处的徽；三处各有各的排法与地面元素（风 / 雨 / 星尘）
   #/essays/<slug>    读：一整片玻璃，正文在里面
   页与页之间不换背景：地面平移一段、变粗再一级级解析回来，晶体从旧位置飞到新位置。
   开屏：地面从一格极粗的夜色里一级级解析出来，字最后站起来。
   左下的星与同心轨道、右下的 Ave（连同框后那颗晶体星）、声音：原站的实现照搬（chrome/ → chrome.js）。
   ───────────────────────────────────────────────────────────── */
import { createGround, bipyramid, shard, cubeClean, euler } from './ground.js';
import * as chrome from './chrome.js';
import { md, inline } from './md.js';

const data = await (await fetch('./data.json')).json();
document.getElementById('chrome').innerHTML = await (await fetch('./chrome.html')).text();
const SECS = {
  essays: { t: '断章', en: 'ESSAYS', tint: [0.8, 0.9, 1.0], pan: [0.9, -0.25], ave: 'articles-enter' },
  moments: { t: '闪念', en: 'MOMENTS', tint: [1.0, 0.82, 0.92], pan: [1.9, 0.15], ave: 'moments-enter' },
  projects: { t: '造物', en: 'PROJECTS', tint: [1.0, 0.92, 0.76], pan: [2.9, -0.1], ave: 'projects-enter' },
};
const ORDER = ['essays', 'moments', 'projects'];
const pad = (n) => String(n).padStart(2, '0');
const dot = (d) => d.replace(/-/g, '.');
const plain = (s) => s.normalize('NFKC'); // 名录里统一字形；花体只留在它自己的页里
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
const sstore = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } };

/* ── 昼 / 夜：只是地面的色板（正文里的 [[昼|夜]] 双面词跟着它） ── */
const Q = new URLSearchParams(location.search);
let night = Q.get('face') ? Q.get('face') !== 'wake' : store('rm-day') !== '1';
function applyFace() {
  document.documentElement.dataset.face = night ? 'dream' : 'wake';
  for (const el of document.querySelectorAll('.mo')) el.textContent = night ? el.dataset.d : el.dataset.w;
}

/* ── 三处地方 ── */
function home() {
  const doors = ORDER.map((k, i) => `<a class="door" href="#/${k}" data-sec="${k}" style="--i:${i}">
      <i class="x" data-x="${k}"></i>
      <span class="door-t"><span class="num">${['I', 'II', 'III'][i]}</span>${SECS[k].t}</span>
      <span class="door-m mono">${SECS[k].en} · ${pad(data[k].length)}</span>
    </a>`).join('');
  return `<section class="home">
    <div class="name-wrap">
      <h1 class="name">AveritA</h1>
      <p class="kick">的昼梦叙集</p>
    </div>
    <div class="slash" aria-hidden="true"></div>
    <nav class="doors">${doors}</nav>
    <p class="motto">在即将醒来的那一瞬，世界究竟是在成形，还是正在融化？</p>
  </section>`;
}

/* 名录：三处三种排法
   断章 —— 章节：一列，编号与日期挂在列外的竖线上
   闪念 —— 散页：三列，以图为主，列与列按 14° 错开
   造物 —— 陈列：三列等宽小片，同样按 14° 错开，状态在右上 */
const colsFor = (k) => (k === 'essays' ? 1 : innerWidth < 760 ? 1 : innerWidth < 1180 ? 2 : 3);
function card(k, e, i) {
  const href = `#/${k}/${e.slug}`;
  if (k === 'essays') {
    return `<li class="ch" style="--i:${i}">
      <span class="ch-no mono"><b>${pad(data.essays.length - i)}</b>${dot(e.date)}</span>
      <a class="pane pane--ch" data-glass href="${href}">
        <span class="t">${plain(e.title)}</span>
        ${e.description ? `<span class="d">${plain(e.description)}</span>` : ''}
        <span class="meta mono">${e.chars.toLocaleString()} 字 · 约 ${Math.max(1, Math.round(e.chars / 400))} 分钟${e.tags.length ? ' · ' + e.tags.join(' / ') : ''}</span>
      </a></li>`;
  }
  if (k === 'moments') {
    const n = e.images.length;
    const imgs = e.images.slice(0, 4).map((im) => `<img src="${im.src}" alt="${im.alt}" loading="lazy">`).join('');
    const first = e.body.split('\n').find((l) => l.trim()) || '';
    return `<div class="cell" style="--i:${i}"><a class="pane pane--m${n ? '' : ' pane--slip'}" data-glass href="${href}">
      ${n ? `<span class="imgs n${Math.min(n, 4)}">${imgs}</span>` : ''}
      <span class="t">${plain(e.title) || inline(first)}</span>
      ${!n && e.title && first ? `<span class="d">${inline(first.slice(0, 60))}</span>` : ''}
      <span class="meta mono"><span>${dot(e.date)}</span>${n ? `<span>${n} 张</span>` : ''}</span>
    </a></div>`;
  }
  return `<div class="cell" style="--i:${i}"><a class="pane pane--p" data-glass href="${href}">
    <span class="meta mono"><span>${dot(e.date)}</span><span class="st">${plain(e.status)}</span></span>
    <span class="t">${plain(e.title)}</span>
    ${e.description ? `<span class="d">${plain(e.description)}</span>` : ''}
  </a></div>`;
}
function list(k) {
  const s = SECS[k];
  const sibs = ORDER.filter((x) => x !== k).map((x) => `<a href="#/${x}" class="sib"><i class="x" data-x="${x}"></i>${SECS[x].t}</a>`).join('');
  let body;
  if (k === 'essays') body = `<ol class="chapters">${data.essays.map((e, i) => card(k, e, i)).join('')}</ol>`;
  else {
    const n = colsFor(k);
    const cols = Array.from({ length: n }, () => []);
    data[k].forEach((e, i) => cols[i % n].push(card(k, e, i)));
    body = `<div class="cols" style="--n:${n}">${cols.map((c, j) => `<div class="col" style="--j:${j}">${c.join('')}</div>`).join('')}</div>`;
  }
  return `<section class="list list--${k}" data-cols="${colsFor(k)}">
    <header class="lh">
      <i class="x x--emb" data-x="${k}"></i>
      <div><h1>${s.t}</h1><p class="mono">${s.en} · ${pad(data[k].length)}</p></div>
      <nav class="sibs">${sibs}</nav>
    </header>
    ${body}
  </section>`;
}

function read(k, slug) {
  const arr = data[k];
  const i = arr.findIndex((e) => e.slug === slug);
  const e = arr[i];
  if (!e) return lost();
  const next = arr[i + 1], prev = arr[i - 1];
  const imgs = e.images.length ? `<div class="gal n${Math.min(e.images.length, 4)}">${e.images.map((im) => `<img src="${im.src}" alt="${im.alt}">`).join('')}</div>` : '';
  const links = e.links.length ? `<ul class="links">${e.links.map((l) => `<li><a href="${l.href}" target="_blank" rel="noreferrer">${l.label}<span class="mono">${l.href.replace(/^https?:\/\//, '')}</span><b>↗</b></a></li>`).join('')}</ul>` : '';
  const meta = [dot(e.date), e.status, k === 'essays' ? `${e.chars.toLocaleString()} 字 · 约 ${Math.max(1, Math.round(e.chars / 400))} 分钟` : '', e.tags.join(' / ')].filter(Boolean).join(' · ');
  return `<section class="read read--${k}">
    <a class="back" href="#/${k}" aria-label="回到${SECS[k].t}"><i class="x x--back" data-x="${k}"></i><span>${SECS[k].t}</span></a>
    <article class="sheet" data-glass="sheet">
      <header>
        ${e.title ? `<h1>${e.title}</h1>` : ''}
        ${e.description ? `<p class="lede">${e.description}</p>` : ''}
        <p class="meta mono">${meta}</p>
      </header>
      ${imgs}
      <div class="prose">${md(e.body)}</div>
      ${links}
      <footer>
        ${prev ? `<a href="#/${k}/${prev.slug}" class="pn"><small class="mono">PREV</small>${plain(prev.title || dot(prev.date))}</a>` : '<span></span>'}
        ${next ? `<a href="#/${k}/${next.slug}" class="pn pn--n"><small class="mono">NEXT</small>${plain(next.title || dot(next.date))}</a>` : '<span></span>'}
      </footer>
    </article>
  </section>`;
}
function lost() {
  return `<section class="lost"><div class="pane" data-glass><p class="mono">404</p><p>空着的地方，也是地面的一部分。</p><a href="#/">回到线上</a></div></section>`;
}

/* ── 路由 ── */
const view = document.getElementById('view');
const crumb = document.getElementById('crumb');
function parse() {
  const [, a, b] = (location.hash || '#/').slice(1).split('/');
  if (!a) return { place: 'home', pan: [0, 0], gain: 1 };
  if (!SECS[a]) return { place: 'lost', pan: [0.4, 1.2], gain: 0.8 };
  if (!b) return { place: 'list', k: a, pan: SECS[a].pan, gain: 0.8 };
  return { place: 'read', k: a, slug: b, pan: [SECS[a].pan[0] + 0.25, SECS[a].pan[1] + 0.55], gain: 0.85 };
}
const st = { viewA: 0, pan: [0, 0], panT: [0, 0], gain: 1, gainT: 1, coarse: 1, pulse: -1, boot: -1, veil: 0, hot: [0, 0, 0], place: [0, 0, 0], day: night ? 0 : 1 };
let route = parse();
let swapping = null;
function mount(r, quiet, first) {
  route = r;
  document.body.dataset.place = r.place;
  view.innerHTML = r.place === 'home' ? home() : r.place === 'list' ? list(r.k) : r.place === 'read' ? read(r.k, r.slug) : lost();
  crumb.innerHTML = r.place === 'home' ? '' : `<a href="#/" class="brand">AveritA</a>${r.k ? `<span class="sep">/</span><a href="#/${r.k}">${SECS[r.k].t}</a>` : ''}`;
  applyFace();
  if (!quiet) scrollTo(0, 0);
  view.classList.remove('out');
  void view.offsetWidth;
  view.classList.add('in');
  st.panT = r.pan;
  st.gainT = r.gain;
  if (!quiet) aveFor(r, first);
}
function go() {
  const r = parse();
  st.pulse = performance.now();
  view.classList.remove('in');
  view.classList.add('out');
  clearTimeout(swapping);
  swapping = setTimeout(() => mount(r), 300);
}
addEventListener('hashchange', go);
let lastCols = colsFor('moments');
addEventListener('resize', () => {
  const n = colsFor('moments');
  if (n !== lastCols && route.place === 'list') { lastCols = n; mount(route, true); }
  lastCols = n;
});

/* ── 原站的工具栏 / Ave（照搬，见 chrome/） ── */
// Ave 按「在哪一页」挑话：把原型的路由翻成原站的地址
const PATH = { essays: '/articles/', moments: '/moments/', projects: '/projects/' };
const hrefOf = (r) => (r.place !== 'read' ? null : r.k === 'moments' ? `/moments/#${r.slug}` : `${PATH[r.k]}${r.slug}/`);
window.__rmPath = () => (route.place === 'home' ? '/' : route.place === 'lost' ? '/404' : hrefOf(route) || PATH[route.k]);
let readingHref = null;
function aveFor(r, first) {
  const href = hrefOf(r);
  // 读某一篇 = 原站漫游里点开一扇窗（xm:read）；离开时同样发一次空的
  if (href || readingHref) dispatchEvent(new CustomEvent('xm:read', { detail: { href } }));
  readingHref = href;
  if (!first) chrome.aveEnterRoute(!!href);
}
// 工具栏里的「换面」：地面先粗再解析，落定时再告诉原站那几件（图标里那道线这时转完）
chrome.setFlipper(() => {
  night = !night;
  store('rm-day', night ? '0' : '1');
  st.pulse = performance.now();
  applyFace();
  setTimeout(() => chrome.setFace(night ? 'dream' : 'wake'), 900);
});

/* ── 画布 ── */
const ground = createGround(document.getElementById('g'));
ground.mesh('essays', bipyramid(6, 1, 0.72, 0.4));
ground.mesh('moments', shard(7));
ground.mesh('projects', cubeClean());

const NAMES = ORDER;
const X = {};
for (const k of NAMES) X[k] = { x: innerWidth / 2, y: innerHeight / 2, s: 0, a: 0, glow: 0, spin: 0, seen: false };
const mouse = [innerWidth / 2, innerHeight / 2];
addEventListener('pointermove', (e) => { mouse[0] = e.clientX; mouse[1] = e.clientY; });

const BOOT = [40, 40, 20, 12, 8, 5, 3, 2, 1]; // 开屏：每拍 150ms 一级
const PULSE = [1, 2, 4, 7, 7, 5, 3, 2, 1];    // 换页：每拍 100ms 一级
const t0 = performance.now();
st.boot = t0;
let last = t0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const T = (now - t0) / 1000;
  // 夜：12 帧一拍；闪念那一处不定格，留着连续感
  const stepped = night && route.k !== 'moments';
  const tq = stepped ? Math.floor(T * 12) / 12 : T;
  const k = (r) => 1 - Math.exp(-dt * r);

  st.day += ((night ? 0 : 1) - st.day) * k(3);
  chrome.setMix(st.day);
  st.pan[0] += (st.panT[0] + scrollY * 0.00025 - st.pan[0]) * k(2.2);
  st.pan[1] += (st.panT[1] + scrollY * 0.0006 - st.pan[1]) * k(2.2);
  st.gain += (st.gainT - st.gain) * k(2);

  // 开屏 / 换页：格先粗、再一拍一拍解析回来
  st.coarse = 1;
  if (st.boot > 0) {
    const i = Math.floor((now - st.boot) / 150);
    st.veil = Math.min(1, (now - st.boot) / 900);
    if (i >= BOOT.length) {
      st.boot = -1;
      document.documentElement.classList.add('booted');
    } else st.coarse = BOOT[i];
  } else if (st.pulse > 0) {
    const i = Math.floor((now - st.pulse) / 100);
    if (i >= PULSE.length) st.pulse = -1;
    else st.coarse = PULSE[i];
  }
  const shown = view.classList.contains('in') && st.boot < 0 ? 1 : 0;
  st.viewA += (shown - st.viewA) * k(shown ? 5 : 14);
  view.style.visibility = st.boot > 0 ? 'hidden' : '';

  // 三处的地面元素：名录 / 阅读里是那一处的；主页上悬停哪扇门，那一处的就先漫出来一点
  const hoverDoor = route.place === 'home' ? view.querySelector('.door:hover')?.dataset.sec : null;
  ORDER.forEach((s, i) => {
    const want = route.k === s ? 1 : hoverDoor === s ? 0.7 : 0;
    st.place[i] += (want - st.place[i]) * k(2.5);
  });

  // 玻璃
  const glass = [];
  for (const el of view.querySelectorAll('[data-glass]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -40 || r.top > innerHeight + 40 || r.width < 1) continue;
    const sheet = el.dataset.glass === 'sheet';
    const hov = el.matches(':hover') ? 1 : 0;
    el._h = (el._h || 0) + (hov - (el._h || 0)) * k(10);
    const ea = parseFloat(getComputedStyle(el).opacity) || 0;
    const pa = parseFloat(getComputedStyle(el.parentElement).opacity);
    glass.push({ x: r.left, y: r.top, w: r.width, h: r.height, r: sheet ? 3 : 2, a: ea * (isNaN(pa) ? 1 : pa) * st.viewA, fill: sheet ? 0.86 : 0.72 - el._h * 0.22 });
  }
  // 晶体：追各自在页面里的锚点
  let hotT = [mouse[0], mouse[1], 0];
  const crystals = [];
  for (const name of NAMES) {
    const c = X[name];
    let el = null;
    if (st.viewA > 0.02) el = view.querySelector(`[data-x="${name}"]`);
    let tx = c.x, ty = c.y, ts = 0, ta = 0, hov = 0;
    if (el) {
      const r = el.getBoundingClientRect();
      tx = r.left + r.width / 2;
      ty = r.top + r.height / 2;
      ts = r.height * 0.5;
      ta = 1;
      const host = el.closest('a, button');
      hov = host && host.matches(':hover') ? 1 : 0;
      if (!c.seen) { c.x = tx; c.y = ty; c.seen = true; }
    }
    if (hov) hotT = [tx, ty, 1];
    const sp = 1 - Math.exp(-dt * 7);
    c.x += (tx - c.x) * sp;
    c.y += (ty - c.y) * sp;
    c.s += (ts * (1 + hov * 0.12) - c.s) * sp;
    c.a += (ta - c.a) * (1 - Math.exp(-dt * 6));
    c.glow += (hov - c.glow) * k(8);
    c.spin += dt * (0.25 + c.glow * 1.1);
    const sq = stepped ? Math.floor((c.spin * 12) / 1.4) * (1.4 / 12) : c.spin;

    const ph = ORDER.indexOf(name) * 2.1;
    const rot = euler(0.35 + Math.sin(tq * 0.3 + ph) * 0.12, sq + ph, Math.sin(tq * 0.21 + ph) * 0.1);
    crystals.push({ mesh: name, x: c.x, y: c.y, size: c.s, a: c.a * (st.viewA * 0.6 + 0.4), rot, tint: SECS[name].tint, glow: c.glow });
  }
  for (let i = 0; i < 3; i++) st.hot[i] += (hotT[i] - st.hot[i]) * k(i === 2 ? 5 : 12);

  ground.draw({ time: tq, pan: st.pan, hot: st.hot, mouse, day: st.day, coarse: st.coarse, veil: st.veil, place: st.place, gain: st.gain, glass, crystals });
  requestAnimationFrame(frame);
}

if (route.place === 'read') document.getElementById('ave').dataset.entry = ''; // 读某一篇：进页只说它自带的那句
chrome.setFace(night ? 'dream' : 'wake');
chrome.setMix(night ? 0 : 1);
chrome.initChrome();
mount(route, false, true);
requestAnimationFrame(frame);
