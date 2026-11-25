/* ─────────────────────────────────────────────────────────────
   AveritA 的昼梦叙集 · 一片地面上的几处地方（原型 design/mocks/remake/app.js 搬成真站）
   /                     主页：一根 14° 的线，三颗晶体挂在上面
   /articles/ …          一处的名录：晶体成了这一处的徽；三处各有各的排法与地面元素（风 / 雨 / 星尘）
   /articles/<slug>/     读：一整片玻璃，正文在里面
   页面由 Astro 预渲染，换页走 ClientRouter：画布、左下的星、右下的 Ave 跨页常驻（transition:persist），
   所以页与页之间不换背景——地面平移一段、变粗再一级级解析回来，晶体从旧位置飞到新位置。
   开屏：地面从一格极粗的夜色里一级级解析出来，字最后站起来。
   ───────────────────────────────────────────────────────────── */
import { createGround, bipyramid, shard, cubeClean, tesseractSlice, euler } from './ground.js';
import { initSound } from './sound';
import { initToolstar, toolstarPage } from './toolstar';
import { initAve, aveEnterRoute } from './ave';
import { setFace, setMix, setFlipper, reapply } from './reality';

type Sec = 'articles' | 'moments' | 'projects';
type Place = 'home' | 'list' | 'read' | 'lost' | 'find' | 'tag' | 'gate';
interface Route {
  place: Place;
  k?: Sec;
  slug?: string;
  pan: [number, number];
  gain: number;
}

const SECS: Record<Sec, { tint: number[]; pan: [number, number] }> = {
  articles: { tint: [0.8, 0.9, 1.0], pan: [0.9, -0.25] },
  moments: { tint: [1.0, 0.82, 0.92], pan: [1.9, 0.15] },
  projects: { tint: [1.0, 0.92, 0.76], pan: [2.9, -0.1] },
};
const ORDER: Sec[] = ['articles', 'moments', 'projects'];
const MESH: Record<Sec, string> = { articles: 'essays', moments: 'moments', projects: 'projects' };
const store = (k: string, v?: string) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    /* 隐私窗口里拿不到就当没记过 */
  }
  return null;
};

/* ── 昼 / 夜：只是地面的色板（正文里的 [[昼|夜]] 双面词跟着它） ── */
const html = document.documentElement;
let night = html.dataset.face !== 'wake'; // 头里那段内联脚本已经按 localStorage 定过
function applyFace() {
  html.dataset.face = night ? 'dream' : 'wake';
  for (const el of document.querySelectorAll<HTMLElement>('[data-morph]')) el.textContent = night ? el.dataset.dream! : el.dataset.true!;
}

/* ── 路由：页面自己在 body 上写着在哪 ── */
function parse(): Route {
  const b = document.body.dataset;
  const place = (b.place || 'lost') as Place;
  const k = b.sec as Sec | undefined;
  if (place === 'home') return { place, pan: [0, 0], gain: 1 };
  // 寻找 / 标签：不属于哪一处，地面停在三处之外的一片（没有元素）
  if (place === 'find' || place === 'tag') return { place, pan: [1.6, 1.1], gain: 0.75 };
  // NEXUS 的门：三处的另一边
  if (place === 'gate') return { place, pan: [-1.3, 1.5], gain: 0.95 };
  if (!k || !SECS[k]) return { place: 'lost', pan: [0.4, 1.2], gain: 0.8 };
  if (place === 'list') return { place, k, pan: SECS[k].pan, gain: 0.8 };
  return { place: 'read', k, slug: b.slug, pan: [SECS[k].pan[0] + 0.25, SECS[k].pan[1] + 0.55], gain: 0.85 };
}

/* 闪念 / 造物的名录：列数跟着窗宽，列与列按 14° 错开（第 j 列下沉 j × 列宽 × tan14°）。
   页面里条目平铺在 .cols 里（无 JS 时就是一列），这里按列数分进各列 */
const colsFor = () => (innerWidth < 760 ? 1 : innerWidth < 1180 ? 2 : 3);
function layoutCols() {
  const box = document.querySelector<HTMLElement>('.cols');
  if (!box) return;
  const n = colsFor();
  if (box.dataset.n === String(n)) return;
  const cells = [...box.querySelectorAll<HTMLElement>('.cell')].sort((a, b) => +a.style.getPropertyValue('--i') - +b.style.getPropertyValue('--i'));
  box.textContent = '';
  const cols = Array.from({ length: n }, (_, j) => {
    const c = document.createElement('div');
    c.className = 'col';
    c.style.setProperty('--j', String(j));
    box.append(c);
    return c;
  });
  cells.forEach((el, i) => cols[i % n].append(el));
  box.dataset.n = String(n);
  box.style.setProperty('--n', String(n));
}
addEventListener('resize', layoutCols);

/* ── 寻找（/find/）：工具栏的输入框发 xm:find，这里就地筛，回 xm:found 给它报数 ──
   多个词之间是「且」；形如 2026-10 的词按年月筛 */
function find(query: string) {
  const box = document.getElementById('find');
  if (!box) return;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = [...box.querySelectorAll<HTMLElement>('.hit')];
  let hits = 0;
  for (const li of rows) {
    const hay = li.dataset.hay || '';
    const ok = words.every((w) => (/^\d{4}-\d{2}$/.test(w) ? li.dataset.month === w : hay.includes(w)));
    li.hidden = !ok;
    if (ok) hits++;
  }
  const pad2 = (n: number) => String(n).padStart(2, '0');
  box.querySelector('.find-n')!.textContent = pad2(hits);
  box.querySelector('.find-q')!.textContent = query.trim() ? ` · ${query.trim()}` : '';
  (box.querySelector('.find-none') as HTMLElement).hidden = hits > 0;
  const u = new URL(location.href);
  query.trim() ? u.searchParams.set('q', query.trim()) : u.searchParams.delete('q');
  history.replaceState(history.state, '', u);
  dispatchEvent(new CustomEvent('xm:found', { detail: { query, hits, total: rows.length } }));
}
function findHere() {
  if (!document.getElementById('find')) return;
  const q = new URLSearchParams(location.search).get('q') || '';
  const field = document.querySelector<HTMLInputElement>('#ts .ts-field');
  if (field) field.value = q;
  find(q);
}
addEventListener('xm:find', (e) => find((e as CustomEvent<{ query: string }>).detail.query));

/* ── Ave 按「在哪一页」挑话 ── */
// 读某一篇 = 原站漫游里点开一扇窗（xm:read）；瞬间在原站没有自己的页，台词表里记的是 /moments/#<slug>
const hrefOf = (r: Route) => (r.place !== 'read' ? null : r.k === 'moments' ? `/moments/#${r.slug}` : `/${r.k}/${r.slug}/`);
let readingHref: string | null = null;
function aveFor(r: Route, first: boolean) {
  const href = hrefOf(r);
  if (href || readingHref) dispatchEvent(new CustomEvent('xm:read', { detail: { href } }));
  readingHref = href;
  if (!first) aveEnterRoute(!!href);
}

/* ── 换页 ── */
let view = document.getElementById('view')!;
let route = parse();
const st = {
  viewA: 0,
  pan: [0, 0],
  panT: [0, 0] as [number, number],
  gain: 1,
  gainT: 1,
  coarse: 1,
  pulse: -1,
  boot: -1,
  veil: 0,
  hot: [0, 0, 0],
  place: [0, 0, 0],
  day: night ? 0 : 1,
};
let first = true;
let mounted: Element | null = null;
function mount() {
  // astro:page-load 首次进站也会发一次：已经装过的这页不再装
  if (mounted === document.getElementById('view')) return;
  route = parse();
  view = document.getElementById('view')!;
  mounted = view;
  applyFace();
  layoutCols();
  toolstarPage();
  findHere();
  view.classList.remove('out');
  void view.offsetWidth;
  view.classList.add('in');
  st.panT = route.pan;
  st.gainT = route.gain;
  aveFor(route, first);
  first = false;
}
// 点下去：字先退、地面开始变粗；新页拿到并且退场演完（300ms）才换
document.addEventListener('astro:before-preparation', (e) => {
  st.pulse = performance.now();
  view.classList.remove('in');
  view.classList.add('out');
  const load = e.loader;
  e.loader = async () => {
    await Promise.all([load(), new Promise((r) => setTimeout(r, 300))]);
  };
});
// 换页时 Astro 会把 <html> 的属性整个换成新页的：面、开屏标记、工具栏开着、字号 / 行距、强调色令牌都要带过去
document.addEventListener('astro:before-swap', (e) => {
  const nd = e.newDocument.documentElement;
  for (const a of [...nd.attributes]) if (a.name.startsWith('data-')) nd.removeAttribute(a.name);
  for (const a of [...html.attributes]) if (a.name.startsWith('data-')) nd.setAttribute(a.name, a.value);
  nd.className = html.className;
  const style = html.getAttribute('style');
  if (style) nd.setAttribute('style', style);
});
document.addEventListener('astro:after-swap', reapply);
document.addEventListener('astro:page-load', mount);

// 工具栏里的「换面」：地面先粗再解析，落定时再告诉那几件（图标里那道线这时转完）
setFlipper(() => {
  night = !night;
  store('rm-day', night ? '0' : '1');
  st.pulse = performance.now();
  applyFace();
  setTimeout(() => setFace(night ? 'dream' : 'wake'), 900);
});

/* ── 画布 ── */
const ground = createGround(document.getElementById('g') as HTMLCanvasElement);
ground.mesh('essays', bipyramid(6, 1, 0.72, 0.4));
ground.mesh('moments', shard(7));
ground.mesh('projects', cubeClean());
ground.mesh('nexus', tesseractSlice(0.5));

/* 晶体：三处各一颗，外加 NEXUS 门上那一颗（四维晶体的切面，切的位置一直在慢慢走，形也跟着变） */
type Crys = Sec | 'nexus';
const CRYS: Crys[] = [...ORDER, 'nexus'];
const TINT: Record<Crys, number[]> = { ...Object.fromEntries(ORDER.map((k) => [k, SECS[k].tint])), nexus: [0.93, 0.9, 1.0] } as Record<Crys, number[]>;
const MESHOF: Record<Crys, string> = { ...MESH, nexus: 'nexus' };
type X = { x: number; y: number; s: number; a: number; glow: number; spin: number; seen: boolean };
const XS = {} as Record<Crys, X>;
for (const k of CRYS) XS[k] = { x: innerWidth / 2, y: innerHeight / 2, s: 0, a: 0, glow: 0, spin: 0, seen: false };
let slicePh = 0.4;

/* ── 进 NEXUS：开屏倒过来——格一拍拍变粗、晶体胀开，整屏化白，再跳过去（NEXUS 那边也从白里出来） ── */
const DOOR = [1, 2, 3, 5, 8, 12, 18, 26, 40]; // 每拍 120ms
const DOOR_MS = DOOR.length * 120 + 260;
let door = -1;
let doorHref = '';
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest?.<HTMLAnchorElement>('a[data-gate]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (door > 0) return;
  doorHref = a.href;
  door = matchMedia('(prefers-reduced-motion: reduce)').matches ? performance.now() - DOOR_MS + 380 : performance.now();
});
// 从 NEXUS 后退回来（bfcache）：不留一屏白
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  door = -1;
  const w = document.querySelector<HTMLElement>('.gate-white');
  if (w) w.style.opacity = '0';
});
const mouse = [innerWidth / 2, innerHeight / 2];
addEventListener('pointermove', (e) => {
  mouse[0] = e.clientX;
  mouse[1] = e.clientY;
});

const BOOT = [40, 40, 20, 12, 8, 5, 3, 2, 1]; // 开屏：每拍 150ms 一级
const PULSE = [1, 2, 4, 7, 7, 5, 3, 2, 1]; // 换页：每拍 100ms 一级
const t0 = performance.now();
st.boot = t0;
let last = t0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const T = (now - t0) / 1000;
  // 夜：12 帧一拍；闪念那一处不定格，留着连续感
  const stepped = night && route.k !== 'moments';
  const tq = stepped ? Math.floor(T * 12) / 12 : T;
  const k = (r: number) => 1 - Math.exp(-dt * r);

  st.day += ((night ? 0 : 1) - st.day) * k(3);
  setMix(st.day);
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
      html.classList.add('booted');
    } else st.coarse = BOOT[i];
  } else if (door > 0) {
    const e = now - door;
    st.coarse = DOOR[Math.min(DOOR.length - 1, Math.floor(e / 120))];
    const w = document.querySelector<HTMLElement>('.gate-white');
    if (w) w.style.opacity = String(Math.min(1, Math.max(0, (e - DOOR_MS * 0.45) / (DOOR_MS * 0.5))));
    if (e > DOOR_MS && doorHref) {
      location.href = doorHref;
      doorHref = '';
    }
  } else if (st.pulse > 0) {
    const i = Math.floor((now - st.pulse) / 100);
    if (i >= PULSE.length) st.pulse = -1;
    else st.coarse = PULSE[i];
  }
  const shown = view.classList.contains('in') && st.boot < 0 ? 1 : 0;
  st.viewA += (shown - st.viewA) * k(shown ? 5 : 14);
  view.style.visibility = st.boot > 0 ? 'hidden' : '';

  // 三处的地面元素：名录 / 阅读里是那一处的；主页上悬停哪扇门，那一处的就先漫出来一点
  const hoverDoor = route.place === 'home' ? view.querySelector<HTMLElement>('.door:hover')?.dataset.sec : null;
  ORDER.forEach((s, i) => {
    const want = route.k === s ? 1 : hoverDoor === s ? 0.7 : 0;
    st.place[i] += (want - st.place[i]) * k(2.5);
  });

  // 玻璃
  const glass = [];
  for (const el of view.querySelectorAll<HTMLElement & { _h?: number }>('[data-glass]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -40 || r.top > innerHeight + 40 || r.width < 1) continue;
    const sheet = el.dataset.glass === 'sheet';
    const hov = el.matches(':hover') ? 1 : 0;
    el._h = (el._h || 0) + (hov - (el._h || 0)) * k(10);
    const ea = parseFloat(getComputedStyle(el).opacity) || 0;
    const pa = parseFloat(getComputedStyle(el.parentElement!).opacity);
    glass.push({ x: r.left, y: r.top, w: r.width, h: r.height, r: sheet ? 3 : 2, a: ea * (isNaN(pa) ? 1 : pa) * st.viewA, fill: sheet ? 0.86 : 0.72 - el._h * 0.22 });
  }
  // 晶体：追各自在页面里的锚点
  let hotT = [mouse[0], mouse[1], 0];
  const crystals = [];
  const doorK = door > 0 ? Math.min(1, (now - door) / DOOR_MS) : 0;
  for (const name of CRYS) {
    const c = XS[name];
    let el: Element | null = null;
    if (st.viewA > 0.02) el = view.querySelector(`[data-x="${name}"]`);
    let tx = c.x,
      ty = c.y,
      ts = 0,
      ta = 0,
      hov = 0;
    if (el) {
      const r = el.getBoundingClientRect();
      tx = r.left + r.width / 2;
      ty = r.top + r.height / 2;
      ts = r.height * 0.5;
      ta = 1;
      const host = el.closest('a, button');
      hov = host && host.matches(':hover') ? 1 : 0;
      if (!c.seen) {
        c.x = tx;
        c.y = ty;
        c.seen = true;
      }
    }
    if (hov) hotT = [tx, ty, 1];
    const sp = 1 - Math.exp(-dt * 7);
    c.x += (tx - c.x) * sp;
    c.y += (ty - c.y) * sp;
    c.s += (ts * (1 + hov * 0.12) - c.s) * sp;
    c.a += (ta - c.a) * (1 - Math.exp(-dt * 6));
    c.glow += (hov - c.glow) * k(8);
    // 三处的晶体悬停时转快一点；NEXUS 那一颗反过来，悬停时慢慢停住（切面也停在那儿）
    const gate = name === 'nexus';
    c.spin += dt * (gate ? 0.18 * (1 - c.glow * 0.9) : 0.25 + c.glow * 1.1);
    const sq = stepped ? Math.floor((c.spin * 12) / 1.4) * (1.4 / 12) : c.spin;
    let size = c.s;
    if (gate && c.a > 0.004) {
      slicePh += dt * 0.11 * (1 - c.glow * 0.92);
      // 只在截角四面体 ↔ 正八面体之间走（再往外就只剩一枚光秃的四面体）
      ground.mesh('nexus', tesseractSlice(0.82 * Math.sin(slicePh)));
      size *= 1 + doorK * doorK * 4;
    }

    const ph = CRYS.indexOf(name) * 2.1;
    // NEXUS 那一颗倾得更多、也晃得更多：总让人看见好几个面，不会正对成一片平的三角
    const rot = gate
      ? euler(0.62 + Math.sin(tq * 0.23) * 0.22, sq + ph, 0.32 + Math.sin(tq * 0.17) * 0.18)
      : euler(0.35 + Math.sin(tq * 0.3 + ph) * 0.12, sq + ph, Math.sin(tq * 0.21 + ph) * 0.1);
    crystals.push({ mesh: MESHOF[name], x: c.x, y: c.y, size, a: c.a * (st.viewA * 0.6 + 0.4), rot, tint: TINT[name], glow: c.glow });
  }
  for (let i = 0; i < 3; i++) st.hot[i] += (hotT[i] - st.hot[i]) * k(i === 2 ? 5 : 12);

  ground.draw({ time: tq, pan: st.pan, hot: st.hot, mouse, day: st.day, coarse: st.coarse, veil: st.veil, place: st.place, gain: st.gain, glass, crystals });
  requestAnimationFrame(frame);
}

// 第一页若是读某一篇：进页只说它自带的那句（xm:read），不挑版块的进页句子
if (route.place === 'read') document.getElementById('ave')!.dataset.entry = '';
setFace(night ? 'dream' : 'wake');
setMix(night ? 0 : 1);
initSound();
initToolstar();
initAve();
mount();
requestAnimationFrame(frame);
