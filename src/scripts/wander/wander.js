/* ─────────────────────────────────────────────────────────────
 漫游 / 检索：同一批窗，两种看法。

 漫游（explore）——给想逛的人。沿用 drift 的空间：一个场景是一片在三个方向上无缝循环的空间，
   窗分 5 层叠在 Z 上，离焦平面越远越像素化；拖动平移、滚轮推拉，近处跟得紧、远处拖得久。
 检索（grid）——给要找东西的人。屏幕被两条 14° 的斜缝切成三栏：随笔 · 瞬间 · 项目，
   每栏里的窗按日期排成一列，顺着斜缝的方向一级级错开；全部清楚、可以检索、可以用键盘走。

 两种看法之间不是换页，是同一批东西在动：
   漫游 → 检索：缝从屏幕边上滑进来，三种光并排；每一条从它此刻在空间里最清楚的那一份起飞，
     一路对焦，落进自己的格子；其余的副本沉回景深；另两个场景的窗从各自的栏里浮上来。
   检索 → 漫游：你点的那一栏的缝向两边推开、铺满全屏；那一栏的窗各自飞回空间里的一份，
     一路失焦到它该有的档位；另两栏被缝扫掉。
 漫游里换场景也是同一个动作：缝扫过屏幕，这边是旧的夜色、那边是新的。

 窗本身是最简的窗（faces.js）；悬停是朝指针的倾斜 + 跟着指针走的一点反光。
 点开是那扇窗自己长大（reader.js）。

 主页（home）——这片空间还没分开的样子。三种夜色只是一池池浮在主页的靛夜里；三个场景的窗混在一起，
   镜头一直很慢地往前推，窗一扇扇从景深里浮上来、经过焦平面（那一刻是清楚的、可以点开）、再从身边糊过去。
   一根 14° 的线过屏幕中心，三个栏头挂在线下。往下走（滚轮 / 上划 / ↓ / 点栏头）：
   那根线转过 90°、劈成两条缝滑到栏界上，池子被缝收拢成三栏，窗落进格子——就是检索。
   点左上的名字回来：窗沉回景深，两条缝合拢、转回去，又是一根线。

 挂在主页与随笔 / 瞬间 / 项目三个目录页上（WanderIndex.astro）：四个地址是同一页，只是进来时落在哪里。
 入梦检验的塌缩圈在这里由自己画（setRingRenderer）：圈里的光粗成像素、窗退到更糊的档位。
 ───────────────────────────────────────────────────────────── */
import { createLight } from './light.js';
import { createWeather } from './weather.js';
import { Faces } from './faces.js';
import { createReader, prefetch } from './reader.js';
import { createInk } from './ink.js';
import { createInverse } from './inverse';
import { onRealityChange, setRingRenderer } from '../reality';
import { setEegSpine } from '../eeg-spine';
import { BRAND_WORDS } from '../brand';

const PATH = { essay: '/articles/', moment: '/moments/', project: '/projects/' };
const HOME = '/';

export async function initWander(host) {
  const root = document.documentElement;
  const stage = host.querySelector('#w-stage');
  const veil = host.querySelector('#w-veil');
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DATA = JSON.parse(host.querySelector('#w-data').textContent);

  const SC = ['essay', 'moment', 'project']; // 屏上从左到右
  const KX = { essay: 0, moment: 1, project: 2 };
  const NAME = { essay: ['随笔', 'ESSAYS', '篇'], moment: ['瞬间', 'MOMENTS', '则'], project: ['项目', 'PROJECTS', '件'] };
  const TAN = Math.tan((14 * Math.PI) / 180);
  const PX = 5;

  /* ══ 小工具 ══ */
  const hash = (...n) => {
    let h = 2166136261;
    for (const v of n) {
      const s = String(v);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 0x9e37, 2654435761);
    }
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
  const outQuart = (p) => 1 - (1 - p) ** 4;
  /* 时钟：平时跟真实时间走；截图脚本可以把它停住、一帧帧往前推（__w.freeze / __w.advance） */
  const clock = { t: performance.now(), last: performance.now(), speed: 1 };
  const now = () => clock.t;

  let light = null;
  try { light = createLight(host.querySelector('#w-light'), PX, { wind: true }); } catch { /* 没有 WebGL2：退回 CSS 渐变 */ }
  const weather = createWeather(host.querySelector('#w-wx-back'), host.querySelector('#w-wx-front'));
  const ALL = await Faces.build(DATA);
  const ITEMS = SC.flatMap((s) => ALL[s]);

  /* 每个场景一个容器：换场景、切视图时按斜缝裁（平时不裁——clip-path 会让窗的 backdrop-filter 只看得到容器里面） */
  const spaces = {};
  for (const s of SC) {
    const d = document.createElement('div');
    d.className = 'w-space';
    d.dataset.wscene = s;
    stage.appendChild(d);
    spaces[s] = d;
  }

  /* ══ 视口 ══ */
  let vw = innerWidth;
  let vh = innerHeight;
  let G = clamp(vw / 1200, 0.5, 1);

  /* ══ 漫游的空间（同 drift） ══ */
  const D = 2.5;
  const L = 5;
  const GAP = D / L;
  const NEAR0 = 0.42;
  const NEAR1 = 0.72;
  const FAR0 = 2.05;
  const MARGIN = 160;
  const LOD_B = [0.17, 0.42, 0.8];

  const layouts = new Map();
  function layout(scene, l, c) {
    const key = `${scene}:${l}:${c}`;
    if (layouts.has(key)) return layouts.get(key);
    const its = ALL[scene];
    const n = its.length;
    const f = Math.sqrt(Math.max(2, n) / 2);
    const Pw = Math.round((1500 + 260 * (l % 3)) * f);
    const Ph = Math.round((1080 + 190 * ((l + 1) % 3)) * f);
    const cols = Math.ceil(Math.sqrt(n * (Pw / Ph)));
    const rows = Math.ceil(n / cols);
    const cells = [...Array(cols * rows).keys()].sort((a, b) => hash(key, a) - hash(key, b));
    const cw = Pw / cols;
    const ch = Ph / rows;
    const ox = hash(key, 'ox') * Pw;
    const oy = hash(key, 'oy') * Ph;
    const pos = its.map((it, i) => {
      const cell = cells[i];
      const jx = Math.max(0, (cw - it.w) / 2 - 40) * (hash(key, i, 'x') * 2 - 1);
      const jy = Math.max(0, (ch - it.h) / 2 - 40) * (hash(key, i, 'y') * 2 - 1);
      return { x: (cell % cols) * cw + cw / 2 + jx + ox, y: Math.floor(cell / cols) * ch + ch / 2 + jy + oy };
    });
    const out = { Pw, Ph, pos };
    layouts.set(key, out);
    return out;
  }
  function lodOf(delta) {
    const b = Math.abs(Math.log(delta));
    return b < LOD_B[0] ? 0 : b < LOD_B[1] ? 1 : b < LOD_B[2] ? 2 : 3;
  }
  function alphaOf(delta) {
    const near = clamp((delta - NEAR0) / (NEAR1 - NEAR0), 0, 1);
    const far = clamp((D - delta) / (D - FAR0), 0, 1);
    return near * near * far * (1 - Math.min(0.32, Math.abs(Math.log(delta)) * 0.28));
  }
  /* 镜头停在 z 时，落在焦平面那一层的第一块（再偏一点，让屏幕中央是它） */
  function homeCam(scene, z) {
    let best = null;
    for (let l = 0; l < L; l++) {
      let delta = mod(l * GAP - z, D);
      if (delta < 1e-4) delta = D;
      if (!best || Math.abs(delta - 1) < Math.abs(best.delta - 1)) best = { l, delta };
    }
    const c = Math.round((z + best.delta - best.l * GAP) / D);
    const p = layout(scene, best.l, c).pos[0];
    return { x: p.x + 150, y: p.y + 70, z };
  }

  /* ══ 状态 ══ */
  const pickScene = (s) => (SC.includes(s) ? s : 'essay');
  let scene = pickScene(host.dataset.scene);
  /* 主页地址进来是主页；目录地址第一次进来是检索（要找东西的人不必先学会怎么逛），之后记住上次用的那种 */
  let mode = 'grid';
  if (host.dataset.scene === 'home') mode = 'home';
  else {
    let v = null;
    try { v = localStorage.getItem('wander.view'); } catch {}
    if (v === 'explore') mode = 'explore';
  }
  const cam = homeCam(scene, -1);
  let zT = cam.z;
  const camMem = {};
  const vel = { x: 0, y: 0 };
  const pend = { x: 0, y: 0 };
  let camFly = null;
  let busy = 0; // 过渡进行到这个时刻之前不收输入
  let clipOn = 0; // 到这个时刻之前容器按缝裁
  let freeScene = null; // 过渡中不裁的那个场景（它的窗正在飞越别的栏）
  let wipeFrom = null; // 漫游里换场景：旧场景在扫完之前还画着
  let hot = null;
  let reading = null; // { v }
  let readFx = 0;
  let readGoal = 0;
  let dim = 0;
  const mouse = { x: vw / 2, y: vh / 2, inside: false };
  let enterT = { essay: now(), moment: now(), project: now() };
  let query = '';

  /* ══ 斜缝 ══
     宽屏：两条竖向的缝（偏离竖直 14°，上端偏右），值是缝在屏幕垂直中点处的 x。
     窄屏（竖着拿的手机）：两条横向的缝（偏离水平 14°，向右下倾——layout-plane 那条交界），值是缝在屏幕水平中点处的 y。
     规格：'L' 推出前方（左 / 上）、'R' 推出后方（右 / 下）、数字 k = 检索视图里第 k 条栏界。 */
  const SPEC_EX = { essay: ['R', 'R'], moment: ['L', 'R'], project: ['L', 'L'] };
  const SPEC_GRID = [1, 2];
  /* 主页：两条缝叠在屏幕中心，并且转了 90°（宽屏）——于是它们是同一根过中心、向右下倾 14° 的线。
     窄屏的缝本来就是横的、向右下倾，不用转，只是叠在中心。 */
  const SPEC_HOME = ['H', 'H'];
  const homeRot = () => (geo.horz ? 0 : Math.PI / 2);
  const CALM = 420; // 主页 → 检索：脑电线先收平的那一段（ms）
  let seamFrom = null;
  let seamTo = mode === 'grid' ? SPEC_GRID : mode === 'home' ? SPEC_HOME : SPEC_EX[scene];
  let seamT0 = 0;
  let seamDur = 0;
  /* 缝的转角（0 = 平常的方向）与「分开了多少」（split：0 = 主页的池，1 = 按缝分成的栏）跟缝走同一条时间线 */
  let rotFrom = 0;
  let rotTo = 0;
  let splitFrom = 1;
  let splitTo = mode === 'home' ? 0 : 1;
  function specPx(sp) {
    const half = geo.horz ? (vw / 2) * TAN : (vh / 2) * TAN;
    if (sp === 'L') return -half - 40;
    if (sp === 'R') return (geo.horz ? vh : vw) + half + 40;
    if (sp === 'H') return geo.horz ? vh / 2 : vw / 2;
    return seamGrid(sp);
  }
  const seamE = (t) => (!seamFrom || !seamDur ? 1 : inOut(clamp((t - seamT0) / seamDur, 0, 1)));
  function seamsAt(t) {
    const to = seamTo.map(specPx);
    if (!seamFrom || !seamDur) return to;
    const e = seamE(t);
    return [lerp(seamFrom[0], to[0], e), lerp(seamFrom[1], to[1], e)];
  }
  /* 转角走得比位置晚一点、收得早一点：先劈开、再转正——反过来也一样 */
  const rotAt = (t) => lerp(rotFrom, rotTo, inOut(clamp((seamE(t) - 0.08) / 0.8, 0, 1)));
  const splitAt = (t) => lerp(splitFrom, splitTo, seamE(t));
  function setSeams(spec, dur, rot = 0, split = 1, delay = 0) {
    const t = now();
    seamFrom = seamsAt(t);
    rotFrom = rotAt(t);
    splitFrom = splitAt(t);
    seamTo = spec;
    rotTo = rot;
    splitTo = split;
    seamT0 = t + delay;
    seamDur = RM ? 0 : dur;
  }
  let seams = [0, 0];
  let rot = 0;
  let split = splitTo;
  /* 给着色器的缝：每条一个支点 + 共用的单位法向（指向后一区）；支点在视口 px */
  function seamGeom() {
    let nx = geo.horz ? -TAN : 1;
    let ny = geo.horz ? 1 : TAN;
    const nl = Math.hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const n = [nx * c - ny * s, nx * s + ny * c];
    const p = seams.map((v) => (geo.horz ? [vw / 2, v] : [v, vh / 2]));
    return { p, n };
  }
  const flatSeams = () => Math.abs(rot) < 0.004;
  const lineX = (s, y) => s + (vh / 2 - y) * TAN; // 竖缝在 y 处的 x
  const lineY = (s, x) => s + (x - vw / 2) * TAN; // 横缝在 x 处的 y
  /* 第 k 区在「沿缝的坐标」t 处（竖缝：y；横缝：x）的前后边界 */
  function bounds(k, t) {
    const L = geo.horz ? lineY : lineX;
    return [k === 0 ? -1e5 : L(seams[k - 1], t), k === 2 ? 1e5 : L(seams[k], t)];
  }
  const across = (x, y) => (geo.horz ? [y, x] : [x, y]); // → [横穿缝的坐标, 沿缝的坐标]
  function regionAt(x, y) {
    const [a, t] = across(x, y);
    const [, e0] = bounds(0, t);
    const [, e1] = bounds(1, t);
    return a < e0 ? 0 : a < e1 ? 1 : 2;
  }
  const SPAN = () => (geo.horz ? vw : vh); // 沿缝方向的屏幕长度
  const DEPTH = () => (geo.horz ? vh : vw); // 横穿缝方向的屏幕长度
  function polygon(k) {
    const [a0, b0] = bounds(k, 0);
    const [a1, b1] = bounds(k, SPAN());
    const c = (v) => clamp(v, -60, DEPTH() + 60);
    if (geo.horz) return [[0, c(a0)], [vw, c(a1)], [vw, c(b1)], [0, c(b0)]];
    return [[c(a0), 0], [c(b0), 0], [c(b1), vh], [c(a1), vh]];
  }
  const covers = (k) => { const [a0, b0] = bounds(k, 0); const [a1, b1] = bounds(k, SPAN()); const d = DEPTH(); return a0 <= 0 && a1 <= 0 && b0 >= d && b1 >= d; };
  const empty = (k) => { const [a0, b0] = bounds(k, 0); const [a1, b1] = bounds(k, SPAN()); const d = DEPTH(); return (b0 <= 0 && b1 <= 0) || (a0 >= d && a1 >= d) || (b0 - a0 < 0.5 && b1 - a1 < 0.5); };

  /* ══ 检索视图的几何 ══
     宽屏：三栏一屏放下。中栏是一条等宽的斜带，窗居中；左栏的窗贴着第一条缝（右沿），右栏的贴着第二条缝（左沿）——
     于是三列窗都顺着 14° 一级级错开，又都不碰屏幕边。两条缝的位置与窗的缩放一起解出来：
       左栏最低处：缝 1 往左斜出 (vh/2)·tan，还要放下一扇窗；右栏最高处：缝 2 往右斜出 (vh/2 − 栏头)·tan。
     窄屏（或解出来的缩放太小）：竖着的一长页，随笔 · 瞬间 · 项目三段，段与段之间是一条向右下倾的 14° 缝；
       整页一起上下滚。竖缝在手机上斜出去两百多 px，一栏装不下一列窗，所以换成横缝。 */
  const regionW = SC.map((s) => Math.max(...ALL[s].map((it) => it.w)));
  const MID_H = 300; // 中栏（瞬间）按这个高度留斜出的余量
  const geo = { SG: 0.8, HEAD: 150, horz: false, GAPY: 22, S1: vw / 3, RW1: vw / 3, m: 26, seamY: [0, 0], headY: [0, 0, 0] };
  function measure() {
    const [w0, w1, w2] = regionW;
    const sg = (vw - 6 * 26 - (vh - 138) * TAN) / (w0 + w1 + w2 + MID_H * TAN);
    geo.horz = sg < 0.6;
    if (!geo.horz) {
      const m = (geo.m = 26);
      geo.HEAD = 138;
      geo.GAPY = 24;
      geo.SG = Math.min(0.86, sg);
      geo.RW1 = w1 * geo.SG + MID_H * geo.SG * TAN + 2 * m;
      const lo = 2 * m + w0 * geo.SG + (vh / 2) * TAN;
      const hi = vw - 2 * m - w2 * geo.SG - (vh / 2 - geo.HEAD) * TAN - geo.RW1;
      geo.S1 = (lo + hi) / 2;
      geo.S1base = geo.S1;
      geo.RW1base = geo.RW1;
    } else {
      geo.m = 16;
      geo.HEAD = 72;
      geo.GAPY = 16;
      geo.SG = clamp((vw - 32) / Math.max(w0, w1, w2), 0.5, 0.86);
    }
  }
  measure();
  /* 宽屏每栏各自滚；窄屏整页一起滚（只用第 0 个） */
  const scroll = SC.map(() => ({ pos: 0, target: 0, vel: 0, max: 0 }));
  const scrollOf = (k) => (geo.horz ? scroll[0] : scroll[k]);
  const seamGrid = (k) => (geo.horz ? geo.seamY[k - 1] - scroll[0].pos : k === 1 ? geo.S1 : geo.S1 + geo.RW1);
  /* 第 k 栏里一扇宽 ww、高 hh（屏上 px）、中心在 cy 的窗，中心该在哪个 x */
  function colX(k, cy, ww, hh) {
    if (geo.horz) return vw / 2;
    const m = geo.m;
    if (k === 0) return lineX(seamGrid(1), cy + hh / 2) - m - ww / 2;
    if (k === 2) return lineX(seamGrid(2), cy - hh / 2) + m + ww / 2;
    return (lineX(seamGrid(1), cy) + lineX(seamGrid(2), cy)) / 2;
  }
  /* 窗从栏里「浮上来」/「沉下去」的方向：沿着缝 */
  const slide = (dd) => (geo.horz ? { x: dd * 0.25, y: dd } : { x: -TAN * dd, y: dd });

  /* ══ 窗的元素 ══ */
  const pool = [];
  const elVis = new WeakMap();
  function makeEl(s) {
    const el = pool.pop() || document.createElement('div');
    el.className = 'w-card';
    el.dataset.nofx = ''; // 长按窗不入梦（入梦检验只在空处）
    el.style.cssText = 'opacity:0';
    el._it = null;
    el.removeAttribute('data-lod');
    if (el.parentNode !== spaces[s]) spaces[s].appendChild(el);
    return el;
  }
  function dropEl(el) {
    el.classList.remove('hot');
    el.style.cssText = 'opacity:0;visibility:hidden';
    el._it = null;
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('data-lod');
    elVis.delete(el);
    pool.push(el);
  }
  function asExplore(v) {
    v.el.setAttribute('aria-hidden', 'true');
    v.el.tabIndex = -1;
    v.el.removeAttribute('role');
    v.el.removeAttribute('aria-label');
    elVis.set(v.el, v);
  }
  function asGrid(v) {
    v.el.removeAttribute('aria-hidden');
    v.el.tabIndex = 0;
    v.el.setAttribute('role', 'button');
    v.el.setAttribute('aria-label', `${NAME[v.it.scene][0]}：${v.it.title}`);
    elVis.set(v.el, v);
  }
  /* 一个「看得见的东西」的公共字段 */
  const visBase = (it) => ({ it, el: null, x: 0, y: 0, s: 1, a: 0, lod: 3, vx: 0, vy: 0, vs: 0, rx: 0, ry: 0, vrx: 0, vry: 0, z: 0, fl: null, _t: '', _a: '', _z: '' });

  function apply(v) {
    const el = v.el;
    if (!el) return;
    const w = v.it.w;
    const h = v.it.h;
    if (el._it !== v.it) {
      el._it = v.it;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      v._lod = -1;
      v._t = v._a = v._z = "";
    }
    const lod = ringOn ? Math.max(v.lod, ringLod(v.x, v.y)) : v.lod;
    if (lod !== v._lod) {
      v._lod = lod;
      el.style.backgroundImage = `url(${v.it.lod[lod]})`;
      el.dataset.lod = lod;
    }
    const tilt = Math.abs(v.rx) + Math.abs(v.ry) > 0.02 ? ` perspective(1000px) rotateX(${v.rx.toFixed(2)}deg) rotateY(${v.ry.toFixed(2)}deg)` : '';
    const tr = `translate3d(${(v.x - w / 2).toFixed(1)}px,${(v.y - h / 2).toFixed(1)}px,0) scale(${Math.max(0.01, v.s).toFixed(4)})${tilt}`;
    if (tr !== v._t) { el.style.transform = tr; v._t = tr; }
    const a = v.a.toFixed(3);
    if (a !== v._a) {
      el.style.opacity = a;
      el.style.visibility = v.a > 0.004 ? '' : 'hidden';
      el.style.pointerEvents = v.a > 0.3 && !v.fl ? '' : 'none';
      v._a = a;
    }
    const z = String(Math.round(v.z));
    if (z !== v._z) { el.style.zIndex = z; v._z = z; }
  }
  const rectOf = (v) => ({ left: v.x - (v.it.w * v.s) / 2, top: v.y - (v.it.h * v.s) / 2, width: v.it.w * v.s, height: v.it.h * v.s });

  /* ══ 入梦检验的塌缩圈：由这里画（reality.ts 只给几何） ══
     光在着色器里按块粗上去；窗按它中心所在那一块的级别退档（级别 2 / 3 / 4 → 失焦第 1 / 2 / 3 档），
     圈走过去，窗就一扇扇糊成像素，解析回来时再一档档变清楚。 */
  const ring = { on: false, x: 0, y: 0, r: 0, step: 72, levels: 4, shift: 0 };
  let ringOn = false;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function ringLod(x, y) {
    const bx = Math.floor(x / 40);
    const by = Math.floor(y / 40);
    const d = Math.hypot(bx * 40 + 20 - ring.x, by * 40 + 20 - ring.y);
    const L = clamp(Math.floor(Math.min((ring.r - d) / ring.step, 4) + BAYER[(by & 3) * 4 + (bx & 3)] - ring.shift), 0, 4);
    return L >= 4 ? 3 : L >= 3 ? 2 : L >= 2 ? 1 : 0;
  }
  setRingRenderer((r) => {
    Object.assign(ring, r);
    ringOn = r.on && r.r > 0;
    if (ringOn) face = faceTo; // 闩锁那一刻整屏都盖着：调色板直接换过去
  });
  /* 醒 / 梦：0 = 梦，1 = 醒。光的调色板按它混；流光的快慢也跟着（醒静梦动） */
  let face = 0;
  let faceTo = 0;
  onRealityChange((r) => {
    faceTo = r === 'wake' ? 1 : 0;
    if (ringOn) face = faceTo;
  });

  /* 弹簧：位置与缩放 */
  function spring(v, tx, ty, ts, k, zeta, dt) {
    if (RM) { v.x = tx; v.y = ty; v.s = ts; v.vx = v.vy = v.vs = 0; return; }
    const c = 2 * zeta * Math.sqrt(k);
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      v.vx += (-k * (v.x - tx) - c * v.vx) * h;
      v.vy += (-k * (v.y - ty) - c * v.vy) * h;
      v.vs += (-k * (v.s - ts) - c * v.vs) * h;
      v.x += v.vx * h;
      v.y += v.vy * h;
      v.s += v.vs * h;
    }
  }
  /* 倾斜：一组中等偏软、略欠阻尼的弹簧——松手时会轻轻晃回去 */
  function tiltTo(v, rx, ry, dt) {
    if (RM) { v.rx = 0; v.ry = 0; return; }
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      v.vrx += (-150 * (v.rx - rx) - 15 * v.vrx) * h;
      v.vry += (-150 * (v.ry - ry) - 15 * v.vry) * h;
      v.rx += v.vrx * h;
      v.ry += v.vry * h;
    }
  }

  /* ══ 飞行：过渡里由它接管一扇窗 ══
     to() 每帧现算（目标自己也在动：格子会滚、空间里的那一份在浮），所以落点永远是活的。
     一路上档位按进度一档档换（对焦 / 失焦），并按飞行速度朝运动方向倾一点——像被一阵气流带过去。 */
  const flights = new Set();
  function fly(v, to, o = {}) {
    v.fl = { t0: now() + (RM ? 0 : o.delay || 0), dur: RM ? 1 : o.dur || 800, from: null, to, done: o.done, ease: o.ease || inOut, px: v.x, py: v.y };
    flights.add(v);
  }
  function stepFlight(v, t, dt) {
    const f = v.fl;
    if (t < f.t0) return;
    if (!f.from) f.from = { x: v.x, y: v.y, s: v.s, a: v.a, lod: v.lod };
    const p = clamp((t - f.t0) / f.dur, 0, 1);
    const e = f.ease(p);
    const T = f.to();
    v.x = lerp(f.from.x, T.x, e);
    v.y = lerp(f.from.y, T.y, e);
    v.s = lerp(f.from.s, T.s, e);
    v.a = lerp(f.from.a, T.a, clamp(p * 1.25, 0, 1));
    v.lod = Math.round(lerp(f.from.lod, T.lod, clamp((p - 0.08) / 0.8, 0, 1)));
    const sx = (v.x - f.px) / Math.max(dt, 1e-3);
    const sy = (v.y - f.py) / Math.max(dt, 1e-3);
    f.px = v.x;
    f.py = v.y;
    tiltTo(v, clamp(-sy * 0.0045, -9, 9), clamp(sx * 0.0045, -9, 9), dt);
    if (p >= 1) {
      v.fl = null;
      flights.delete(v);
      v.vx = v.vy = v.vs = 0;
      v.a = T.a;
      v.lod = T.lod;
      v._a = '';
      f.done && f.done(v);
    }
  }

  /* ══ 漫游：副本 ══ */
  const recs = new Map();
  let frame = 0;
  function target(rec, t) {
    const lay = layout(rec.scene, rec.l, rec.c);
    const delta = rec.l * GAP + rec.c * D - cam.z;
    let s = G / delta;
    const p = lay.pos[rec.n];
    const wx = p.x + rec.i * lay.Pw;
    const wy = p.y + rec.j * lay.Ph;
    const u = clamp((delta - 0.5) / 1.8, 0, 1);
    const bob = RM ? 0 : (3 + 7 * u) * G;
    let x = vw / 2 + (wx - cam.x) * s + Math.cos(t * 0.00031 * rec.w1 + rec.ph) * bob * 0.6;
    let y = vh / 2 + (wy - cam.y) * s + Math.sin(t * 0.00042 * rec.w1 + rec.ph) * bob;
    // 悬停那扇旁边的窗让开一点
    if (hot && hot !== rec && hot.l != null && !reading) {
      const dx = x - hot.x;
      const dy = y - hot.y;
      const d = Math.hypot(dx, dy) || 1;
      const R = 420 * G;
      if (d < R) { const k = (1 - d / R) ** 2 * 26 * G; x += (dx / d) * k; y += (dy / d) * k; }
    }
    // 阅读时周围的窗被推开
    if (readFx > 0.001 && reading && reading.v !== rec && reading.v) {
      const dx = x - reading.cx;
      const dy = y - reading.cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = readFx * 120 * G * Math.max(0.3, 1 - d / (vw * 0.9));
      x += (dx / d) * k;
      y += (dy / d) * k;
    }
    if (rec === hot) s *= 1.035;
    return { x, y, s, delta, wx, wy };
  }
  function exAlpha(rec, tg, t) {
    const born = clamp((t - rec.born) / 700, 0, 1);
    const st = clamp(((t - enterT[rec.scene]) / 900) * 1.6 - (tg.delta / D) * 0.6, 0, 1);
    let a = alphaOf(tg.delta) * born * st;
    if (reading && reading.v !== rec) a *= 1 - 0.3 * readFx;
    return a;
  }
  function exLod(rec, tg) {
    let lod = lodOf(tg.delta);
    if (reading && reading.v !== rec) lod = Math.min(3, lod + Math.round(readFx));
    return lod;
  }
  function syncScene(scene, t, bornAt) {
    const its = ALL[scene];
    for (let l = 0; l < L; l++) {
      let delta = mod(l * GAP - cam.z, D);
      if (delta < 1e-4) delta = D;
      if (delta < NEAR0) continue;
      const c = Math.round((cam.z + delta - l * GAP) / D);
      const lay = layout(scene, l, c);
      const s = G / delta;
      const hw = (vw / 2 + MARGIN) / s;
      const hh = (vh / 2 + MARGIN) / s;
      its.forEach((it, n) => {
        const p = lay.pos[n];
        const i0 = Math.ceil((cam.x - hw - it.w / 2 - p.x) / lay.Pw);
        const i1 = Math.floor((cam.x + hw + it.w / 2 - p.x) / lay.Pw);
        const j0 = Math.ceil((cam.y - hh - it.h / 2 - p.y) / lay.Ph);
        const j1 = Math.floor((cam.y + hh + it.h / 2 - p.y) / lay.Ph);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const key = `${scene}:${l}:${c}:${n}:${i}:${j}`;
            let rec = recs.get(key);
            if (!rec) {
              rec = Object.assign(visBase(it), { key, scene, l, c, i, j, n, ph: hash(key, 'ph') * 6.283, w1: 0.7 + hash(key, 'w') * 0.6, jit: 0.85 + hash(key, 'k') * 0.3, born: bornAt != null ? bornAt : t });
              rec.el = makeEl(scene);
              asExplore(rec);
              const tg = target(rec, t);
              rec.x = tg.x;
              rec.y = tg.y;
              rec.s = tg.s;
              rec.lod = lodOf(tg.delta);
              recs.set(key, rec);
            }
            rec.seen = frame;
          }
      });
    }
  }
  function releaseRec(rec) {
    recs.delete(rec.key);
    if (rec === hot) setHot(null);
    if (rec.el) dropEl(rec.el);
    rec.el = null;
  }
  function syncExplore(t) {
    frame++;
    if (mode === 'explore') {
      syncScene(scene, t);
      if (wipeFrom) syncScene(wipeFrom, t);
    } else return;
    for (const rec of [...recs.values()]) if (rec.seen !== frame && !rec.fl && !(reading && reading.v === rec)) releaseRec(rec);
  }
  function stepExplore(t, dt) {
    for (const rec of recs.values()) {
      if (rec.fl) continue;
      const tg = target(rec, t);
      const u = clamp((tg.delta - 0.5) / 1.8, 0, 1);
      spring(rec, tg.x, tg.y, tg.s, lerp(320, 46, u) * rec.jit, lerp(0.92, 0.36, u), dt);
      let rx = 0;
      let ry = 0;
      if (rec === hot) {
        const nx = clamp((mouse.x - rec.x) / ((rec.it.w * rec.s) / 2), -1, 1);
        const ny = clamp((mouse.y - rec.y) / ((rec.it.h * rec.s) / 2), -1, 1);
        rx = -ny * 7;
        ry = nx * 7;
      }
      tiltTo(rec, rx, ry, dt);
      rec.lod = exLod(rec, tg);
      rec.a = exAlpha(rec, tg, t);
      rec.z = Math.round((D - tg.delta) * 1000) + (rec === hot ? 400 : 0);
      // 真正清楚：在焦平面附近（不只是「没被降采样」——稍远稍近的那几份字已经发虚了）
      const clear = Math.abs(Math.log(tg.delta)) < 0.1 && rec.a > 0.5;
      if (clear !== rec.clear) { rec.clear = clear; rec.el.classList.toggle('clear', clear); }
    }
  }

  /* ══ 检索：每一条一个格子 ══ */
  const GE = new Map(); // id → vis
  for (const it of ITEMS) GE.set(it.id, Object.assign(visBase(it), { k: KX[it.scene], slot: { x: 0, y: 0, s: 1 }, match: true, order: 0, on: false }));
  function matches(it) {
    if (!query) return true;
    return query.split(/\s+/).filter(Boolean).every((w) => it.text.includes(w));
  }
  /* 检索没命中的：退焦两档、缩小、淡下去，排到命中的后面——不消失，只是不再是「要找的那个」 */
  const MISS_S = 0.78;
  const MISS_A = 0.3;
  function gridLayout() {
    if (geo.horz) {
      // 一长页：段头 → 一列窗 → 一条横缝 → 下一段
      const half = (vw / 2) * TAN;
      const top0 = geo.HEAD - scroll[0].pos;
      let y = top0;
      SC.forEach((s, k) => {
        const list = ALL[s].map((it) => GE.get(it.id));
        const hits = list.filter((v) => v.match);
        const miss = list.filter((v) => !v.match);
        geo.headY[k] = y;
        y += 46;
        [...hits, ...miss].forEach((v, i) => {
          const sc = geo.SG * (v.match ? 1 : MISS_S);
          const h = v.it.h * sc;
          v.slot.x = vw / 2;
          v.slot.y = y + h / 2;
          v.slot.s = sc;
          v.order = i;
          y += h + geo.GAPY;
        });
        scroll[k].hits = hits.length;
        if (k < 2) {
          geo.seamY[k] = y + 4 + half + scroll[0].pos;
          y += 2 * half + 30;
        }
      });
      scroll[0].max = Math.max(0, y - top0 - (vh - geo.HEAD) + 30);
      return;
    }
    liveColumns();
    SC.forEach((s, k) => {
      const list = ALL[s].map((it) => GE.get(it.id));
      const hits = list.filter((v) => v.match);
      const miss = list.filter((v) => !v.match);
      let y = geo.HEAD - scroll[k].pos;
      [...hits, ...miss].forEach((v, i) => {
        const sc = colSG[k] * (v.match ? 1 : MISS_S);
        const h = v.it.h * sc;
        const cy = y + h / 2;
        v.slot.x = colX(k, cy, v.it.w * sc, h);
        v.slot.y = cy;
        v.slot.s = sc;
        v.order = i;
        y += h + geo.GAPY * (v.match ? 1 : 0.6);
      });
      scroll[k].max = Math.max(0, y + scroll[k].pos - geo.HEAD - (vh - geo.HEAD - 40));
      scroll[k].hits = hits.length;
    });
  }
  /* ══ 栏会呼吸：鼠标停在哪一栏，那一栏就宽一点、窗大一点，另两栏让出地方、窗缩小一点 ══
     每栏一个 0→1 的「被看着」量（略欠阻尼的弹簧，换栏时缝会轻轻晃一下再停住）。
     窗的缩放先按它改；再把三栏算下来剩的余量按它分给三栏——于是两条缝自己会挪。 */
  const hov = [0, 0, 0];
  const hovV = [0, 0, 0];
  const colSG = [geo.SG, geo.SG, geo.SG];
  let hoverCol = -1;
  /* 在一栏里停留过 0.7 秒以上才算「最近看的那一栏」——去点右上角开关时一路划过的栏不算 */
  let lastCol = -1;
  let dwellCol = -1;
  let dwellT = 0;
  function stepColumns(dt) {
    hoverCol = mode === 'grid' && !geo.horz && mouse.inside && !reading && now() > busy && mouse.y > 64 ? regionAt(mouse.x, mouse.y) : -1;
    const here = mode === 'grid' && mouse.inside && mouse.y > 64 ? regionAt(mouse.x, mouse.y) : -1;
    if (here !== dwellCol) { dwellCol = here; dwellT = now(); }
    else if (here >= 0 && now() - dwellT > 700) lastCol = here;
    for (let k = 0; k < 3; k++) {
      if (RM) { hov[k] = k === hoverCol ? 1 : 0; continue; }
      let left = dt;
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        left -= h;
        hovV[k] += (-70 * (hov[k] - (k === hoverCol ? 1 : 0)) - 2 * 0.62 * Math.sqrt(70) * hovV[k]) * h;
        hov[k] += hovV[k] * h;
      }
    }
  }
  function liveColumns() {
    if (geo.horz) { colSG[0] = colSG[1] = colSG[2] = geo.SG; return; }
    const m = geo.m;
    const [w0, w1, w2] = regionW;
    for (let k = 0; k < 3; k++) {
      const others = hov[0] + hov[1] + hov[2] - hov[k];
      colSG[k] = geo.SG * (1 + 0.05 * hov[k] - 0.11 * others);
    }
    const RW1 = w1 * colSG[1] + MID_H * colSG[1] * TAN + 2 * m;
    const lo = 2 * m + w0 * colSG[0] + (vh / 2) * TAN;
    const hi = vw - 2 * m - w2 * colSG[2] - (vh / 2 - geo.HEAD) * TAN - RW1;
    const slack = Math.max(0, hi - lo);
    const wt = hov.map((h) => 1 + 3.2 * Math.max(0, h));
    const sum = wt[0] + wt[1] + wt[2];
    geo.S1 = lo + (slack * wt[0]) / sum;
    geo.RW1 = RW1 + (slack * wt[1]) / sum;
  }
  /* 窗滑进栏头 / 外框底下时淡掉（不用 mask：mask 会让窗的磨砂只看得到容器里面）。
     按它此刻还露在线下面的比例来淡：顶边刚过线时几乎不变，整扇快滑进去时才淡完——不会一过线就没了。
     用窗此刻的位置（不是格子的目标位置），滚动的弹簧还在追的时候也不会提前消失。 */
  function topFade(v, y) {
    const h = v.it.h * v.slot.s;
    const line = geo.HEAD - (geo.horz ? 28 : 46);
    const f = clamp((y + h / 2 - line) / h, 0, 1); // 露在线下面的比例
    const u = clamp((f - 0.1) / 0.75, 0, 1);
    return u * u * (3 - 2 * u);
  }
  const slotTo = (v) => () => ({ x: v.slot.x, y: v.slot.y, s: v.slot.s, a: (v.match ? 1 : MISS_A) * topFade(v, v.slot.y), lod: v.match ? 0 : 2 });
  function stepGrid(_t, dt) {
    for (const v of GE.values()) {
      if (!v.on || v.fl) continue;
      const lift = v === hot ? 1.025 : 1;
      spring(v, v.slot.x, v.slot.y, v.slot.s * lift, 190, 0.86, dt);
      let rx = 0;
      let ry = 0;
      if (v === hot) {
        const nx = clamp((mouse.x - v.x) / ((v.it.w * v.s) / 2), -1, 1);
        const ny = clamp((mouse.y - v.y) / ((v.it.h * v.s) / 2), -1, 1);
        rx = -ny * 4.5;
        ry = nx * 4.5;
      }
      tiltTo(v, rx, ry, dt);
      v.lod = v.match ? 0 : 2;
      const off = v.y + (v.it.h * v.s) / 2 < -40 || v.y - (v.it.h * v.s) / 2 > vh + 40;
      const away = hoverCol >= 0 && hoverCol !== v.k ? 0.12 : 0;
      v.a = off ? 0 : (v.match ? 1 : MISS_A) * topFade(v, v.y) * (1 - away);
      v.z = 100 + (v.match ? 50 : 0) - v.order + (v === hot ? 500 : 0);
    }
  }
  function stepScroll(dt) {
    stepColumns(dt);
    for (const sc of scroll) {
      sc.target = clamp(sc.target, 0, sc.max);
      if (!sc.drag) {
        if (sc.vel) {
          sc.target = clamp(sc.target + sc.vel * dt, 0, sc.max);
          sc.vel *= Math.exp(-dt / 0.32);
          if (Math.abs(sc.vel) < 4) sc.vel = 0;
        }
      }
      sc.pos += (sc.target - sc.pos) * (RM ? 1 : 1 - Math.exp(-dt / 0.09));
    }
  }

  /* ══ 栏头 ══ */
  /* 栏头在 WanderIndex.astro 里写好（带 data-morph，醒 / 梦两面跟全站一起换），这里只摆位置 */
  const headEls = SC.map((s) => {
    const d = host.querySelector(`[data-w-head="${s}"]`);
    d._in = d.firstElementChild;
    return d;
  });
  function placeHeads() {
    SC.forEach((s, k) => {
      let x;
      let y;
      let fade = 1;
      if (geo.horz) {
        x = 16;
        y = geo.headY[k];
        fade = clamp((y - (geo.HEAD - 46)) / 30, 0, 1);
      } else {
        y = geo.HEAD - 66;
        const ww = regionW[k] * colSG[k];
        x = colX(k, y + 12, ww, 24) - ww / 2;
      }
      // 主页：挂在那根线下面；分开的过程中从线上滑到各自的栏顶
      if (split < 0.999) {
        const [hx, hy] = homeHead(k);
        const e = split;
        x = lerp(hx, x, e);
        y = lerp(hy, y, e);
        fade = lerp(1, fade, e);
      }
      const el = headEls[k];
      const tr = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      if (el._t !== tr) { el.style.transform = tr; el._t = tr; }
      const f = fade.toFixed(2);
      if (el._f !== f) { el._in.style.opacity = f; el._in.style.visibility = fade > 0.02 ? '' : 'hidden'; el._f = f; }
      const n = ALL[s].length;
      const ct = query ? `${scroll[k].hits} / ${n}` : String(n).padStart(2, '0');
      if (el._c !== ct) { el.querySelector('.ct').textContent = ct; el._c = ct; }
    });
  }
  /* ══ 主页 ══ */
  const homeLineY = (x) => vh / 2 + (x - vw / 2) * TAN; // 主页那根线：过中心、向右下倾 14°
  const HOME_HX = [0.33, 0.52, 0.71];
  function homeHead(k) {
    if (geo.horz) {
      // 窄屏：三行叠在线下的左边；线往右下倾，按栏头右端那里的线高往下放，免得字压在线上
      const x = 22;
      return [x, homeLineY(Math.min(vw, x + 300)) + 30 + k * 46];
    }
    // 栏头约 200px 宽，线在这段里还要往下走：按右端那里的线高挂，字整行都在线下
    const x = vw * HOME_HX[k];
    return [x, homeLineY(x + 210) + 16];
  }
  const homeEl = host.querySelector('#w-home');
  const eegGroup = document.getElementById('site-eeg-group');
  let eegAmp = mode === 'home' ? 1 : 0;
  let eegKey = '';
  let revealT0 = now() + 300;
  const homeLines = [...host.querySelectorAll('.w-home-ln')];
  const homeBrand = host.querySelector('.w-home-brand');
  const homeBrandBox = host.querySelector('.w-home-brand-box');
  const chromeBrand = host.querySelector('.w-brand');
  let brandFly = null; // { dx, dy, s }：大字标飞到左上角小字标的那一段位移与缩放（按需量一次）
  function measureBrand() {
    if (!homeBrandBox) return;
    homeBrandBox.style.transform = '';
    const a = homeBrandBox.getBoundingClientRect();
    const b = chromeBrand.getBoundingClientRect();
    const s = b.height / Math.max(1, a.height);
    brandFly = { dx: b.left - a.left, dy: b.bottom - a.bottom, s };
  }
  function placeHome() {
    if (!homeEl) return;
    const h = 1 - split; // 1 = 主页
    // 两条缝的线：主页时叠成一根，分开的过程中跟着缝转、滑开，然后淡掉（检索里不画分界线）
    const g = seamGeom();
    const ang = Math.atan2(g.n[0], -g.n[1]); // 线的方向 ⟂ 法向
    // 主页静着时那根线是全站的脑电线（Eeg.astro，沿我们给的骨架走）；往下走时它先收平，
    // 平了以后换成这里两根直的（就是两条缝），再转、再劈开。回来时反过来：合拢、转回去，再起伏
    const eo = eegGroup ? clamp(eegAmp * 3, 0, 1) : 0;
    if (eegGroup) {
      const o = (eo * h).toFixed(3);
      if (eegGroup._o !== o) { eegGroup.style.opacity = o; eegGroup._o = o; }
      const half = Math.hypot(vw, vh) / 2 + 60;
      const dx = Math.cos(Math.atan(TAN)) * half;
      const dy = Math.sin(Math.atan(TAN)) * half;
      const reveal = clamp((now() - revealT0) / 2200, 0, 1);
      const key = `${eegAmp.toFixed(3)}|${reveal.toFixed(3)}|${vw}|${vh}`;
      if (key !== eegKey && (eo > 0 || eegKey === '')) {
        eegKey = key;
        setEegSpine({ xy: new Float32Array([vw / 2 - dx, vh / 2 - dy, vw / 2 + dx, vh / 2 + dy]), amp: eegAmp, dark: 1, reveal: reveal * (2 - reveal), dot: null });
      }
    }
    const op = clamp(h * 1.6 - 0.15, 0, 1) * (1 - eo);
    homeLines.forEach((ln, i) => {
      const [x, y] = g.p[i];
      const tr = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${ang.toFixed(4)}rad)`;
      if (ln._t !== tr) { ln.style.transform = tr; ln._t = tr; }
      const o = op.toFixed(3);
      if (ln._o !== o) { ln.style.opacity = o; ln._o = o; }
    });
    const vis = h > 0.002;
    if (homeEl._vis !== vis) { homeEl.style.visibility = vis ? '' : 'hidden'; homeEl._vis = vis; }
    // 栏头在主页上是入口（可以 Tab 到、回车进去），检索里只是栏名
    const on = h > 0.5;
    if (homeEl._on !== on) {
      homeEl._on = on;
      headEls.forEach((el) => {
        el.tabIndex = on ? 0 : -1;
        if (on) el.setAttribute('role', 'link');
        else el.removeAttribute('role');
      });
    }
    const ho = clamp(h * 1.8 - 0.8, 0, 1).toFixed(3); // 主页的其余字：先退
    if (homeEl._o !== ho) { homeEl.style.setProperty('--home', ho); homeEl._o = ho; }
    // 字标：主页的大字飞成左上角的小字（位移与缩放写在盒子上，那扇反相窗跟着走）
    if (homeBrandBox && h > 0.002 && h < 0.998) {
      if (!brandFly) measureBrand();
      const e = 1 - h;
      const tr = `translate(${(brandFly.dx * e).toFixed(1)}px,${(brandFly.dy * e).toFixed(1)}px) scale(${lerp(1, brandFly.s, e).toFixed(4)})`;
      if (homeBrandBox._t !== tr) { homeBrandBox.style.transform = tr; homeBrandBox._t = tr; }
    } else if (homeBrandBox?._t) {
      homeBrandBox.style.transform = '';
      homeBrandBox._t = '';
      brandFly = null;
    }
    root.classList.toggle('w-brand-small', h < 0.02);
  }

  function placeClips(t) {
    const on = t < clipOn && flatSeams(); // 缝还在转（主页 ↔ 检索）时不裁：多边形是按平常的角度算的
    SC.forEach((s, k) => {
      const sp = spaces[s];
      let cp = 'none';
      let hide = false;
      if (on && s !== freeScene) {
        if (empty(k)) hide = true;
        else if (!covers(k)) cp = `polygon(${polygon(k).map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      }
      if (sp._cp !== cp) { sp.style.clipPath = cp; sp._cp = cp; }
      if (sp._h !== hide) { sp.style.visibility = hide ? 'hidden' : ''; sp._h = hide; }
    });
  }
  /* 外框的墨色：按它底下是哪一栏来取（检索时三栏明暗不同） */
  const inkEls = [...host.querySelectorAll('[data-ink]')];
  function placeInk() {
    for (const el of inkEls) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const s = split < 0.5 ? 'home' : SC[regionAt(r.left + r.width / 2, r.top + r.height / 2)];
      if (el.dataset.ink !== s) el.dataset.ink = s;
    }
  }

  /* ══ 背景跟镜头：独立的重弹簧（drift 定下的 heavy） ══ */
  const bg = { ox: cam.x * 0.08, oy: cam.y * 0.08, vx: 0, vy: 0 };
  const lift = [0, 0, 0];
  function background(dt) {
    const k = 2.2 * 2.2;
    const c = 2 * 0.9 * 2.2;
    const avg = mode === 'grid' ? (scroll[0].pos + scroll[1].pos + scroll[2].pos) / 3 : 0;
    const tx = cam.x * 0.08;
    const ty = cam.y * 0.08 + avg * 0.12;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      bg.vx += (-k * (bg.ox - tx) - c * bg.vx) * h;
      bg.vy += (-k * (bg.oy - ty) - c * bg.vy) * h;
      bg.ox += bg.vx * h;
      bg.oy += bg.vy * h;
    }
    const hr = mode === 'grid' && mouse.inside && !reading && now() > busy ? regionAt(mouse.x, mouse.y) : -1;
    for (let i = 0; i < 3; i++) lift[i] += ((i === hr ? 1 : 0) - lift[i]) * (1 - Math.exp(-dt / 0.25));
    return { x: ((bg.ox * G) / vh) * 0.72, y: ((bg.oy * G) / vh) * 0.72 };
  }

  /* ══ 天气跟镜头：和背景一样的重弹簧，只走镜头 / 滚动的一小部分 ══
     粒子原先按自己的深度 1:1 跟着平移与滚动，滚一下整片雨就刷过去，比背景快得多；
     现在每栏一个独立的软弹簧（ω ≈ 2.2，ζ ≈ 0.9）追「镜头 + 这一栏的滚动」× 0.2：起步慢、停得晚，
     和背后的光同一种重量。深度之间的视差还在（近的仍比远的动得多），只是整体慢下来。 */
  const WX_K = 0.2;
  const wxc = SC.map(() => ({ x: cam.x * WX_K, y: cam.y * WX_K, vx: 0, vy: 0 }));
  function weatherCam(k, dt) {
    const c = wxc[k];
    const tx = cam.x * WX_K;
    const ty = (cam.y + (mode === 'grid' ? scrollOf(k).pos / G : 0)) * WX_K;
    if (RM) { c.x = tx; c.y = ty; return c; }
    const kk = 2.2 * 2.2;
    const cc = 2 * 0.9 * 2.2;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      left -= h;
      c.vx += (-kk * (c.x - tx) - cc * c.vx) * h;
      c.vy += (-kk * (c.y - ty) - cc * c.vy) * h;
      c.x += c.vx * h;
      c.y += c.vy * h;
    }
    return c;
  }

  /* ══ 主循环 ══ */
  const reader = createReader({
    onClosing: () => { readGoal = 0; },
    onNav: (_prev, next) => {
      if (reading && reading.v && reading.v.el) reading.v.el.style.visibility = '';
      const v = findVis(next);
      if (v) v.el.style.visibility = 'hidden';
      if (reading) Object.assign(reading, { v, cx: v ? v.x : vw / 2, cy: v ? v.y : vh / 2 });
    },
    onClosed: () => {
      if (reading && reading.v && reading.v.el) { reading.v.el.style.visibility = ''; reading.v._a = ''; }
      reading = null;
      root.classList.remove('w-reading');
      syncURL();
    },
  });

  let lightT = 0;
  const bias = [0, 0, 0];
  let homeHot = -1;
  function tick(ts) {
    const dt = Math.min(0.05, ((ts - clock.last) * clock.speed) / 1000);
    clock.t += (ts - clock.last) * clock.speed;
    clock.last = ts;
    if (clock.speed) step(clock.t, dt);
    requestAnimationFrame(tick);
  }
  function step(t, dt) {
    // 镜头
    if (camFly) {
      const p = clamp((t - camFly.t0) / camFly.dur, 0, 1);
      const e = inOut(p);
      cam.x = lerp(camFly.from.x, camFly.to.x, e);
      cam.y = lerp(camFly.from.y, camFly.to.y, e);
      cam.z = lerp(camFly.from.z, camFly.to.z, e);
      zT = cam.z;
      if (p >= 1) camFly = null;
    } else if (mode === 'explore' || mode === 'home') {
      // 主页：镜头很慢地往前推（背景的流光跟着往深处走）
      if (mode === 'home' && !RM && !reading && !drag) {
        zT += dt * 0.03;
        cam.x += dt * 6;
      }
      if (!drag && (vel.x || vel.y)) {
        cam.x += vel.x * dt * 1000;
        cam.y += vel.y * dt * 1000;
        const k = Math.exp((-dt * 1000) / 340);
        vel.x *= k;
        vel.y *= k;
        if (Math.hypot(vel.x, vel.y) < 0.004) vel.x = vel.y = 0;
      }
      if (pend.x || pend.y) {
        const k = 1 - Math.exp((-dt * 1000) / 110);
        cam.x += pend.x * k;
        cam.y += pend.y * k;
        pend.x -= pend.x * k;
        pend.y -= pend.y * k;
        if (Math.abs(pend.x) + Math.abs(pend.y) < 0.2) pend.x = pend.y = 0;
      }
      cam.z += (zT - cam.z) * (RM ? 1 : 1 - Math.exp((-dt * 1000) / 170));
    }
    readFx += (readGoal - readFx) * (RM ? 1 : 1 - Math.exp(-dt / 0.2));
    dim += ((reading ? 1 : 0) - dim) * (1 - Math.exp(-dt / 0.22));
    if (wipeFrom && t > busy) {
      for (const rec of [...recs.values()]) if (rec.scene === wipeFrom) releaseRec(rec);
      wipeFrom = null;
    }

    seams = seamsAt(t);
    rot = rotAt(t);
    split = splitAt(t);
    face += (faceTo - face) * (RM ? 1 : 1 - Math.exp(-dt / 0.3));
    lightT += dt * lerp(1, 0.55, face);
    for (let k = 0; k < 3; k++) bias[k] += ((k === homeHot ? 1 : 0) - bias[k]) * (1 - Math.exp(-dt / 0.35));
    // 脑电线的起伏：主页完全合拢时起来（0.7s），离开主页时在 CALM 里收平
    if (mode === 'home' && split < 0.001) eegAmp = Math.min(1, eegAmp + (RM ? 1 : dt / 0.7));
    else eegAmp = Math.max(0, eegAmp - (RM ? 1 : dt / (CALM / 1000)));
    stepScroll(dt);
    gridLayout();
    syncExplore(t);
    stepExplore(t, dt);
    stepGrid(t, dt);
    for (const v of [...flights]) stepFlight(v, t, dt);
    for (const rec of recs.values()) apply(rec);
    for (const v of GE.values()) if (v.el) apply(v);
    for (const v of ghosts) apply(v);

    placeClips(t);

    placeHeads();
    placeHome();
    if (frame % 6 === 0) placeInk();

    const pan = background(dt);
    if (light) light.draw({ t: lightT, pan, zoom: cam.z, mouse, dim, seam: seamGeom(), split, bias, lift, ring: ringOn ? ring : null, face });
    if (win) win.step();
    if (ink) ink.step(frame);
    const regions = {};
    const show = {};
    const cams = {};
    // 天气只下在分好的栏里：主页（还没分开）与缝还在转的那一段不下，分开以后随 split 淡进来
    const flat = flatSeams();
    SC.forEach((s, k) => {
      regions[s] = !flat || empty(k) ? null : polygon(k);
      show[s] = (1 - 0.4 * dim) * split * split;
      cams[s] = weatherCam(k, dt);
    });
    weather.draw({ t, G, vw, vh, zoom: cam.z, cams, regions, show, RM });
    veil.style.opacity = (dim * 0.4).toFixed(3);
  }

  /* 离场的副本（沉回景深 / 被缝扫掉）：只走完飞行，然后回收 */
  const ghosts = new Set();
  function ghost(v, to, o) {
    ghosts.add(v);
    fly(v, to, Object.assign({}, o, { done: () => { ghosts.delete(v); if (v.el) dropEl(v.el); v.el = null; } }));
  }

  /* ══ 漫游 → 检索 ══ */
  function toGrid() {
    if (mode === 'grid' || now() < busy || reading) return;
    const t = now();
    setHot(null);
    camMem[scene] = { x: cam.x, y: cam.y, z: cam.z };
    vel.x = vel.y = pend.x = pend.y = 0;
    zT = cam.z;
    camFly = null;
    mode = 'grid';
    root.dataset.wview = 'grid';
    enterClass();
    remember();
    if (geo.horz) {
      // 一长页：滚到当前场景那一段
      scroll[0].vel = 0;
      gridLayout();
      const k = KX[scene];
      scroll[0].pos = scroll[0].target = clamp(geo.headY[k] + scroll[0].pos - geo.HEAD + (k ? 10 : 0), 0, scroll[0].max);
    }
    setSeams(SPEC_GRID, 980);
    busy = t + 1250;
    clipOn = t + 1250;
    freeScene = scene;
    gridLayout();

    // 当前场景：每一条从它此刻最清楚的那一份起飞
    const mine = [...recs.values()].filter((r) => r.scene === scene);
    for (const it of ALL[scene]) {
      const v = GE.get(it.id);
      let best = null;
      let bs = Infinity;
      for (const r of mine) {
        if (r.it !== it || r.a < 0.05 || r.x < -100 || r.x > vw + 100 || r.y < -100 || r.y > vh + 100) continue;
        const tg = target(r, t);
        const sc = Math.abs(Math.log(tg.delta)) + Math.hypot(r.x - vw / 2, r.y - vh / 2) / vw;
        if (sc < bs) { bs = sc; best = r; }
      }
      if (best) {
        recs.delete(best.key);
        Object.assign(v, { el: best.el, x: best.x, y: best.y, s: best.s, a: best.a, lod: best.lod, rx: best.rx, ry: best.ry, vrx: 0, vry: 0, _lod: best.lod, _t: '', _a: '', _z: '' });
        best.el = null;
      } else {
        // 视野里没有它：从深处的一个小点浮出来
        v.el = makeEl(scene);
        Object.assign(v, { x: vw / 2 + (hash(it.id, 'x') - 0.5) * vw * 0.5, y: vh / 2 + (hash(it.id, 'y') - 0.5) * vh * 0.4, s: G / 2.2, a: 0, lod: 3, _lod: -1, _t: '', _a: '', _z: '' });
      }
      v.on = true;
      v.z = 3000 - v.order;
      asGrid(v);
      const d = Math.hypot(v.x - v.slot.x, v.y - v.slot.y) / vw;
      fly(v, slotTo(v), { dur: 780 + d * 260, delay: 40 + v.order * 45 + d * 80, ease: inOut });
    }
    // 其余副本：沉回景深
    for (const r of [...recs.values()]) {
      recs.delete(r.key);
      const ox = r.x;
      const oy = r.y;
      const os = r.s;
      ghost(r, () => ({ x: vw / 2 + (ox - vw / 2) * 0.72, y: vh / 2 + (oy - vh / 2) * 0.72, s: os * 0.6, a: 0, lod: 3 }), { dur: 520 + hash(r.key, 'g') * 220, ease: outQuart });
    }
    // 另两栏：从各自的栏里顺着斜缝浮上来
    for (const s of SC) {
      if (s === scene) continue;
      for (const it of ALL[s]) {
        const v = GE.get(it.id);
        v.el = makeEl(s);
        asGrid(v);
        const o = slide(150 + v.order * 20);
        Object.assign(v, { x: v.slot.x + o.x, y: v.slot.y + o.y, s: v.slot.s * 0.94, a: 0, lod: 3, rx: 0, ry: 0, _lod: -1, _t: '', _a: '', _z: '', on: true, z: 200 - v.order });
        fly(v, slotTo(v), { dur: 900, delay: 300 + Math.min(10, v.order) * 55 + KX[s] * 40, ease: outQuart });
      }
    }
  }

  /* ══ 检索 → 漫游（进入 S 那一栏） ══ */
  function toExplore(S) {
    if (mode === 'explore' || now() < busy || reading) return;
    const t = now();
    setHot(null);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    mode = 'explore';
    root.dataset.wview = 'explore';
    remember();
    scene = S;
    root.dataset.wscene = S;
    syncTabs();
    syncURL();
    Object.assign(cam, camMem[S] || homeCam(S, cam.z));
    zT = cam.z;
    bg.vx = bg.vy = 0;
    setSeams(SPEC_EX[S], 920);
    busy = t + 1150;
    clipOn = t + 1150;
    freeScene = S;
    enterT[S] = t - 2000; // 不再做进场的分层浮现——窗是飞回去的

    frame++;
    syncScene(S, t, t + 420); // 新出现的副本晚一点再浮出来
    const mine = [...recs.values()];
    for (const it of ALL[S]) {
      const v = GE.get(it.id);
      let best = null;
      let bs = Infinity;
      for (const r of mine) {
        if (r.it !== it || r.taken) continue;
        const tg = target(r, t);
        if (alphaOf(tg.delta) < 0.4 || tg.x < 40 || tg.x > vw - 40 || tg.y < 40 || tg.y > vh - 40) continue;
        const sc = Math.abs(Math.log(tg.delta)) * 1.4 + Math.hypot(tg.x - v.x, tg.y - v.y) / vw;
        if (sc < bs) { bs = sc; best = r; }
      }
      v.on = false;
      if (best) {
        best.taken = true;
        dropEl(best.el);
        Object.assign(best, { el: v.el, x: v.x, y: v.y, s: v.s, a: v.a, lod: v.lod, rx: v.rx, ry: v.ry, born: -1e9, _lod: v.lod, _t: '', _a: '', _z: '' });
        v.el = null;
        asExplore(best);
        best.z = 4000;
        const r = best;
        fly(r, () => { const tg = target(r, now()); return { x: tg.x, y: tg.y, s: tg.s, a: alphaOf(tg.delta), lod: lodOf(tg.delta) }; }, { dur: 820, delay: v.order * 40, ease: inOut });
      } else {
        // 这一份在空间里此刻看不见：沉进景深
        const g = Object.assign(visBase(it), { el: v.el, x: v.x, y: v.y, s: v.s, a: v.a, lod: v.lod, _lod: v.lod, z: 3000 });
        v.el = null;
        const ox = g.x;
        const oy = g.y;
        const os = g.s;
        ghost(g, () => ({ x: vw / 2 + (ox - vw / 2) * 0.6, y: vh / 2 + (oy - vh / 2) * 0.6, s: os * 0.45, a: 0, lod: 3 }), { dur: 640, delay: v.order * 30, ease: inOut });
      }
    }
    // 另两栏：顺着斜缝沉下去，被缝扫掉
    for (const s of SC) {
      if (s === S) continue;
      for (const it of ALL[s]) {
        const v = GE.get(it.id);
        v.on = false;
        if (!v.el) continue;
        const g = Object.assign(visBase(it), { el: v.el, x: v.x, y: v.y, s: v.s, a: v.a, lod: v.lod, _lod: v.lod, z: 100 });
        v.el = null;
        const ox = g.x;
        const oy = g.y;
        const o = slide(120);
        const os = g.s;
        ghost(g, () => ({ x: ox + o.x, y: oy + o.y, s: os * 0.92, a: 0, lod: 3 }), { dur: 560, delay: Math.min(8, v.order) * 30, ease: inOut });
      }
    }
  }

  /* ══ 主页 → 检索 ══
     那根线转过 90°、劈成两条缝滑到栏界上（宽屏；窄屏的缝本来就是横的，只是从中心分开），池子被缝收拢成三栏。
     三个场景的每一条，从它此刻在空间里最清楚、最靠中间的那一份起飞，一路对焦落进格子；
     视野里没有它的，从深处浮上来；其余的副本沉回景深。S：地址落到哪一栏（窄屏时也滚到那一段）。 */
  function homeToGrid(S, push = true) {
    if (mode !== 'home' || now() < busy || reading) return;
    const t = now();
    setHot(null);
    homeHot = -1;
    vel.x = vel.y = pend.x = pend.y = 0;
    zT = cam.z;
    camFly = null;
    mode = 'grid';
    scene = S;
    root.dataset.wview = 'grid';
    root.dataset.wscene = S;
    syncTabs();
    enterClass();
    try { localStorage.setItem('wander.view', 'grid'); } catch {}
    if (push) try { history.pushState({ wnav: 1 }, '', PATH[S]); } catch {}
    for (const sc of scroll) { sc.pos = sc.target = 0; sc.vel = 0; }
    gridLayout();
    if (geo.horz && KX[S]) {
      scroll[0].pos = scroll[0].target = clamp(geo.headY[KX[S]] + scroll[0].pos - geo.HEAD + 10, 0, scroll[0].max);
      gridLayout();
    }
    measureBrand();
    // 先让脑电线收平（CALM），平了以后才转、才劈开
    const calm = RM ? 0 : CALM;
    setSeams(SPEC_GRID, RM ? 0 : 1250, 0, 1, calm);
    busy = t + calm + 1450;
    clipOn = 0;
    freeScene = null;

    // 主页上没有窗：每一条从景深里（屏幕中心方向、很小、全糊）浮上来，一路对焦落进格子
    for (const s of SC)
      for (const it of ALL[s]) {
        const v = GE.get(it.id);
        v.el = makeEl(s);
        Object.assign(v, { x: vw / 2 + (v.slot.x - vw / 2) * 0.5, y: vh / 2 + (v.slot.y - vh / 2) * 0.5, s: v.slot.s * 0.4, a: 0, lod: 3, rx: 0, ry: 0, _lod: -1, _t: '', _a: '', _z: '' });
        v.on = true;
        v.z = 3000 - v.order;
        asGrid(v);
        fly(v, slotTo(v), { dur: 1000, delay: calm + 280 + Math.min(10, v.order) * 55 + KX[s] * 60, ease: outQuart });
      }
  }

  /* ══ 检索 / 漫游 → 主页 ══
     窗沉回景深；两条缝合拢、转回去，又是一根线；池子从栏里散开；栏头滑回线下，左上的小字长回大字。 */
  function toHome(push = true) {
    if (mode === 'home' || now() < busy) return;
    if (reading) return;
    const t = now();
    setHot(null);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (mode === 'explore') camMem[scene] = { x: cam.x, y: cam.y, z: cam.z };
    const sink = (v, z) => {
      const g = Object.assign(visBase(v.it), { el: v.el, x: v.x, y: v.y, s: v.s, a: v.a, lod: v.lod, _lod: v._lod, z });
      v.el = null;
      const ox = g.x;
      const oy = g.y;
      const os = g.s;
      ghost(g, () => ({ x: vw / 2 + (ox - vw / 2) * 0.55, y: vh / 2 + (oy - vh / 2) * 0.55, s: os * 0.4, a: 0, lod: 3 }), { dur: 700 + hash(v.it.id, 'h') * 260, delay: hash(v.it.id, 'd') * 160, ease: inOut });
    };
    for (const v of GE.values()) {
      v.on = false;
      if (v.el && !v.fl) sink(v, 100);
    }
    for (const r of [...recs.values()]) {
      recs.delete(r.key);
      if (r.el) sink(r, 50);
    }
    mode = 'home';
    root.dataset.wview = 'home';
    root.dataset.wscene = 'home';
    if (push) try { history.pushState({ wnav: 1 }, '', HOME); } catch {}
    measureBrand();
    setSeams(SPEC_HOME, RM ? 0 : 1250, homeRot(), 0);
    busy = t + 1300;
    clipOn = 0;
    freeScene = null;
    const born = t + 650; // 主页的窗等旧的沉下去一些再浮上来
    for (const s of SC) enterT[s] = born;
  }

  /* ══ 漫游里换场景：缝扫过屏幕 ══ */
  function setScene(S) {
    if (mode === 'home') return homeToGrid(S);
    if (S === scene || now() < busy || reading) return;
    if (mode === 'grid') return focusRegion(KX[S]);
    const t = now();
    setHot(null);
    camMem[scene] = { x: cam.x, y: cam.y, z: cam.z };
    wipeFrom = scene;
    scene = S;
    root.dataset.wscene = S;
    syncTabs();
    enterT[S] = t + 120;
    if (!RM) zT += 0.35;
    setSeams(SPEC_EX[S], 1000);
    syncURL();
    busy = t + 1040;
    clipOn = t + 1040;
    freeScene = null;
  }
  function focusRegion(k) {
    const v = [...GE.values()].find((g) => g.k === k && g.order === 0);
    if (v && v.el) v.el.focus({ preventScroll: true });
  }

  /* ══ 悬停 ══ */
  function setHot(v) {
    if (v === hot) return;
    if (hot && hot.el) hot.el.classList.remove('hot');
    hot = v;
    if (v && v.el) v.el.classList.add('hot');
    if (v) prefetch(v.it);
  }
  function sheen() {
    if (!hot || !hot.el) return;
    const r = rectOf(hot);
    hot.el.style.setProperty('--mx', `${(((mouse.x - r.left) / r.width) * 100).toFixed(1)}%`);
    hot.el.style.setProperty('--my', `${(((mouse.y - r.top) / r.height) * 100).toFixed(1)}%`);
  }
  stage.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || (drag && drag.moved) || reading || now() < busy) return;
    const el = e.target.closest && e.target.closest('.w-card');
    const v = el && elVis.get(el);
    if (!v || v.fl) return setHot(null);
    // 漫游里只对够清楚的那几档开放（粗块上做倾斜没有意义）
    if ((mode === 'explore' || mode === 'home') && !v.clear) return setHot(null);
    setHot(v);
    sheen();
  });
  stage.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget;
    if (!to || !to.closest || !to.closest('.w-card')) setHot(null);
  });

  /* ══ 点开 ══ */
  function findVis(it) {
    if (mode === 'grid') { const v = GE.get(it.id); return v && v.el ? v : null; }
    let best = null;
    let bs = Infinity;
    for (const r of recs.values()) {
      if (r.it !== it || r.a < 0.3 || r.x < 0 || r.x > vw || r.y < 0 || r.y > vh) continue;
      const sc = r.lod * 2 + Math.hypot(r.x - vw / 2, r.y - vh / 2) / vw;
      if (sc < bs) { bs = sc; best = r; }
    }
    return best;
  }
  function openVis(v) {
    if (reading || now() < busy) return;
    setHot(null);
    vel.x = vel.y = pend.x = pend.y = 0;
    reading = { v, cx: v.x, cy: v.y };
    readGoal = 1;
    root.classList.add('w-reading');
    const r = rectOf(v);
    v.el.style.visibility = 'hidden';
    reader.open(v.it, r, {
      list: ALL[v.it.scene],
      indexURL: location.pathname,
      getRect: (it) => {
        let w = reading && reading.v && reading.v.it === it && reading.v.el ? reading.v : findVis(it);
        if (!w) return null;
        if (reading.v !== w) {
          if (reading.v && reading.v.el) reading.v.el.style.visibility = '';
          reading.v = w;
          w.el.style.visibility = 'hidden';
        }
        // 窗正在被推开 / 回位：落点取它回位后的样子
        if ((mode === 'explore' || mode === 'home') && w.l != null) {
          const keep = readFx;
          readFx = 0;
          const tg = target(w, now());
          readFx = keep;
          return { left: tg.x - (w.it.w * tg.s) / 2, top: tg.y - (w.it.h * tg.s) / 2, width: w.it.w * tg.s, height: w.it.h * tg.s };
        }
        if (mode === 'grid') return { left: w.slot.x - (w.it.w * w.slot.s) / 2, top: w.slot.y - (w.it.h * w.slot.s) / 2, width: w.it.w * w.slot.s, height: w.it.h * w.slot.s };
        return rectOf(w);
      },
    });
  }
  /* 漫游里点一扇模糊的窗：镜头飞过去，让它落在焦平面正中（于是它变清楚）；清楚的才点开 */
  function flyTo(rec) {
    const tg = target(rec, now());
    const to = { x: tg.wx, y: tg.wy, z: rec.l * GAP + rec.c * D - 1 };
    const dist = Math.hypot(((to.x - cam.x) * G) / vw, to.z - cam.z);
    vel.x = vel.y = pend.x = pend.y = 0;
    camFly = { t0: now(), dur: RM ? 1 : clamp(520 + dist * 260, 560, 900), from: { ...cam }, to };
  }
  stage.addEventListener('click', (e) => {
    if (suppress || reading || now() < busy) return;
    const el = e.target.closest && e.target.closest('.w-card');
    const v = el && elVis.get(el);
    if (!v || v.fl) return;
    if (mode === 'explore' || mode === 'home') {
      if (v.clear && !camFly) openVis(v);
      else flyTo(v);
    } else openVis(v);
  });

  /* ══ 输入 ══ */
  let drag = null;
  let suppress = false;
  const pointers = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    if (reading || now() < busy) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'explore' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = null;
      return;
    }
    vel.x = vel.y = 0;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, axis: null, k: regionAt(e.clientX, e.clientY), s: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
    if (mode === 'grid') scrollOf(drag.k).vel = 0;
    suppress = false;
  });
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.inside = true;
    sheen();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      zT += Math.log(d / pinch.d) * 1.1;
      cam.x -= (mx - pinch.mx) / G;
      cam.y -= (my - pinch.my) / G;
      pinch = { d, mx, my };
      suppress = true;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.moved = true;
      drag.axis = Math.abs(e.clientX - drag.sx) > Math.abs(e.clientY - drag.sy) ? 'x' : 'y';
      root.classList.add('w-dragging');
      setHot(null);
      try { stage.setPointerCapture(e.pointerId); } catch {}
      if (mode === 'grid' && drag.axis === 'y') scrollOf(drag.k).drag = true;
    }
    if (drag.moved) {
      const dx = e.clientX - drag.lx;
      const dy = e.clientY - drag.ly;
      if (mode === 'explore' || mode === 'home') {
        cam.x -= dx / G;
        cam.y -= dy / G;
      } else if (drag.axis === 'y') {
        const sc = scrollOf(drag.k);
        sc.target = clamp(sc.target - dy, -40, sc.max + 40);
        sc.pos = sc.target;
      }
      drag.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      while (drag.s.length > 2 && e.timeStamp - drag.s[0].t > 90) drag.s.shift();
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  function up(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppress = true;
      setTimeout(() => (suppress = false), 0);
      const a = drag.s[0];
      const b = drag.s[drag.s.length - 1];
      const dt = Math.max(16, b.t - a.t);
      const fresh = e.timeStamp - b.t < 60;
      if (mode === 'home' && drag.axis === 'y' && drag.sy - e.clientY > 70) {
        // 主页上划：往下走，进检索
        homeToGrid(homePick(drag.sx));
      } else if (mode === 'explore' || mode === 'home') {
        if (!RM && fresh) { vel.x = -(b.x - a.x) / dt / G; vel.y = -(b.y - a.y) / dt / G; }
      } else if (drag.axis === 'y') {
        const sc = scrollOf(drag.k);
        sc.drag = false;
        if (!RM && fresh) sc.vel = (-(b.y - a.y) / dt) * 1000;
      }
      root.classList.remove('w-dragging');
    }
    drag = null;
  }
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  document.addEventListener('pointerleave', () => { mouse.inside = false; });

  stage.addEventListener('wheel', (e) => {
    if (reading || now() < busy) return;
    e.preventDefault();
    let dy = e.deltaY;
    let dx = e.deltaX;
    if (e.deltaMode === 1) { dy *= 32; dx *= 32; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (mode === 'home') {
      // 主页：往下滚就是往下走——进检索（攒够一点再走，触控板的细碎滚动不至于一碰就走）
      if (dy > 0) { homeWheel += dy; if (homeWheel > 60) { homeWheel = 0; homeToGrid(homePick(e.clientX)); } }
      return;
    }
    if (mode === 'grid') {
      const sc = scrollOf(regionAt(e.clientX, e.clientY));
      sc.vel = 0;
      sc.target = clamp(sc.target + dy, 0, sc.max);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.2) { pend.x += dx / G; return; }
    zT += dy * (e.ctrlKey ? 0.012 : 0.0016);
  }, { passive: false });

  /* 键盘：V 切视图；1 2 3 场景 / 栏；/ 检索；漫游里方向键平移、+ - 推拉；检索里方向键在窗之间走 */
  addEventListener('keydown', (e) => {
    if (reader.isOpen || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) return;
    if (mode === 'home') {
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae.closest && ae.closest('a,button,[data-w-head]')) return;
      if ({ 1: 1, 2: 1, 3: 1 }[e.key]) homeToGrid(SC[+e.key - 1]);
      else if (['ArrowDown', 'PageDown', 'Enter', 'v', 'V'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); homeToGrid(scene); }
      return;
    }
    if (e.key === 'v' || e.key === 'V') { mode === 'grid' ? toExplore(exploreTarget()) : toGrid(); return; }
    if ({ 1: 1, 2: 1, 3: 1 }[e.key]) { setScene(SC[+e.key - 1]); return; }
    if (mode === 'explore') {
      if (now() < busy) return;
      const st = (e.shiftKey ? 560 : 280) / G;
      const map = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
      if (map[e.key]) { e.preventDefault(); pend.x += map[e.key][0]; pend.y += map[e.key][1]; }
      else if (e.key === '+' || e.key === '=') zT += 0.5;
      else if (e.key === '-') zT -= 0.5;
      return;
    }
    // 检索：在窗之间走
    const cur = document.activeElement && elVis.get(document.activeElement);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (!cur || cur.k == null) { firstHit()?.el.focus({ preventScroll: true }); return; }
      const col = (k) => [...GE.values()].filter((v) => v.k === k && v.el).sort((a, b) => a.order - b.order);
      let next = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const c = col(cur.k);
        next = c[c.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1)];
      } else {
        const k = cur.k + (e.key === 'ArrowRight' ? 1 : -1);
        if (k >= 0 && k <= 2) next = col(k).sort((a, b) => Math.abs(a.slot.y - cur.slot.y) - Math.abs(b.slot.y - cur.slot.y))[0];
      }
      if (next) next.el.focus({ preventScroll: true });
    } else if ((e.key === 'Enter' || (e.key === ' ' && !e.shiftKey)) && cur && cur.k != null) {
      e.preventDefault();
      openVis(cur);
    }
  });
  /* 键盘焦点落到一扇窗上：那一栏（窄屏是整页）滚到它看得见 */
  stage.addEventListener('focusin', (e) => {
    const v = elVis.get(e.target);
    if (!v || v.k == null || mode !== 'grid') return;
    const sc = scrollOf(v.k);
    const top = v.slot.y - (v.it.h * v.slot.s) / 2;
    const bot = v.slot.y + (v.it.h * v.slot.s) / 2;
    if (top < geo.HEAD) sc.target = clamp(sc.target - (geo.HEAD - top) - 10, 0, sc.max);
    else if (bot > vh - 30) sc.target = clamp(sc.target + (bot - (vh - 30)) + 10, 0, sc.max);
  });
  const firstHit = () => [...GE.values()].filter((v) => v.el && v.match).sort((a, b) => a.k - b.k || a.order - b.order)[0];
  const exploreTarget = () => (mouse.inside ? SC[regionAt(mouse.x, mouse.y)] : scene);

  /* ══ 检索：输入在左下角工具栏的「寻找」（Toolstar.astro）里，经 xm:find 事件传过来 ══ */
  function setQuery(s) {
    query = s.trim().toLowerCase();
    for (const v of GE.values()) v.match = matches(v.it);
    root.classList.toggle('w-filtering', !!query);
    for (const sc of scroll) sc.target = 0;
    const hits = [...GE.values()].filter((v) => v.match).length;
    dispatchEvent(new CustomEvent('xm:found', { detail: { query, hits, total: GE.size } }));
  }
  /* 有字要找时先转到检索那一种看法（主页 / 漫游里筛了也看不出来），再筛 */
  function find(q) {
    if (q && !reader.isOpen) {
      if (mode === 'home') homeToGrid(scene);
      else if (mode === 'explore') toGrid();
    }
    setQuery(q);
  }
  addEventListener('xm:find', (e) => find(e.detail?.query ?? ''));

  /* ══ 外框 ══ */
  const tabs = [...host.querySelectorAll('.w-scenes button')];
  function syncTabs() { tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === scene))); }
  tabs.forEach((b) => b.addEventListener('click', () => setScene(b.dataset.scene)));
  host.querySelectorAll('.w-views button').forEach((b) => b.addEventListener('click', () => (b.dataset.view === 'grid' ? toGrid() : toExplore(lastCol >= 0 ? SC[lastCol] : scene))));
  /* 主页：从哪里往下走，就落到哪一栏（池子本来就偏在它将来那一栏的方向） */
  let homeWheel = 0;
  const homePick = (x) => (geo.horz ? 'essay' : SC[clamp(Math.floor((x / vw) * 3), 0, 2)]);
  /* 栏头：主页上是三个入口（悬停时那种夜色的池子涨起来、那个场景的窗亮起来）；点了就往下走、落进那一栏 */
  headEls.forEach((el, k) => {
    el.addEventListener('click', () => { if (mode === 'home') homeToGrid(SC[k]); });
    el.addEventListener('keydown', (e) => {
      if (mode === 'home' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); homeToGrid(SC[k]); }
    });
    el.addEventListener('pointerenter', () => { if (mode === 'home') homeHot = k; });
    el.addEventListener('pointerleave', () => { if (homeHot === k) homeHot = -1; });
    el.addEventListener('focus', () => { if (mode === 'home') homeHot = k; });
    el.addEventListener('blur', () => { if (homeHot === k) homeHot = -1; });
  });
  /* 左上的名字：回主页（同一页里走回去，不换页） */
  chromeBrand.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    if (reader.isOpen) return;
    toHome();
  });
  /* 后退 / 前进：主页 ↔ 目录地址之间按地址走（阅读层自己的历史由 reader.js 收） */
  addEventListener('popstate', () => {
    if (reader.isOpen) return;
    const p = location.pathname;
    if (p === HOME) {
      if (mode !== 'home') { busy = 0; toHome(false); }
    } else if (mode === 'home') {
      const S = SC.find((s) => PATH[s] === p);
      if (S) { busy = 0; homeToGrid(S, false); }
    }
  });
  /* 主页角落的时刻：分钟一跳 */
  const clockEl = host.querySelector('#w-clock');
  function tickClock() {
    if (!clockEl) return;
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    clockEl.textContent = `${p2(d.getHours())}:${p2(d.getMinutes())} · ${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
    clockEl.dateTime = d.toISOString();
    setTimeout(tickClock, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
  }
  tickClock();
  /* 栏头只在「刚切进检索」时晚一拍浮出（等窗落位）；读完回来时立刻回来 */
  let enterTimer = 0;
  function enterClass() {
    root.classList.add('w-genter');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => root.classList.remove('w-genter'), 1500);
  }
  /* 地址跟着看法走：漫游时是那个场景自己的目录地址；检索不改（三个地址都是这一页） */
  function syncURL() {
    if (reader.isOpen) return;
    const want = mode === 'home' ? HOME : mode === 'explore' ? PATH[scene] : location.pathname === HOME ? PATH[scene] : location.pathname;
    if (location.pathname !== want || location.hash) try { history.replaceState(null, '', want); } catch {}
  }
  function remember() {
    syncURL();
    try { localStorage.setItem('wander.view', mode); } catch {}
  }

  addEventListener('resize', () => {
    vw = innerWidth;
    vh = innerHeight;
    G = clamp(vw / 1200, 0.5, 1);
    measure();
    if (light) light.resize();
    weather.resize();
    seamFrom = null;
    if (mode === 'home') rotTo = rotFrom = homeRot();
    brandFly = null;
  });

  /* ══ 字随底换墨（ink.js）：浮在流光上的字按底下的明暗换墨。没有 WebGL（流光退回 CSS 渐变）时不接，字用原来的颜色 ══ */
  const ink = light ? createInk(host.querySelector('#w-light')) : null;
  if (ink) {
    const q = (sel) => host.querySelector(sel);
    const AMBER = { light: [226, 186, 146], dark: [118, 84, 58] };
    ink.add(q('.w-home-kicker span'), { a: 0.72 });
    ink.add(q('.w-home-gate span'), { a: 0.85 });
    ink.add(q('.w-home-clock time'), { a: 0.62 });
    host.querySelectorAll('.w-home-exits a').forEach((a) => ink.add(a, { a: 0.62 }));
    ink.add(q('.w-home-hint span'), { a: 0.62 });
    ink.add(chromeBrand);
    for (const el of headEls) {
      ink.add(el.querySelector('b'));
      ink.add(el.querySelector('.no'), { a: 0.6 });
      ink.add(el.querySelector('i'), { a: 0.6 });
      ink.add(el.querySelector('.ct'), AMBER);
    }
  }

  /* ══ 反相窗（inverse.js）：主页大字不换墨，它是那片流光的一扇窗——
     底下那一小块流光反相、保住色相，按字形遮罩。同样要有 WebGL 才接；
     接不上时大字用 CSS 的墨色，不至于整块不见 ══ */
  const winCv = host.querySelector('#w-win');
  const win = light && winCv && homeBrand ? createInverse({ light: host.querySelector('#w-light'), target: homeBrand, canvas: winCv, words: BRAND_WORDS }) : null;
  if (win) win.warm();

  /* ══ 起步 ══ */
  root.dataset.wscene = mode === 'home' ? 'home' : scene;
  root.dataset.wview = mode;
  syncTabs();
  if (mode === 'home') {
    rotFrom = rotTo = homeRot();
    splitFrom = splitTo = 0;
    const born = now() + 250;
    for (const s of SC) enterT[s] = born;
  }
  face = faceTo;
  seams = seamsAt(now());
  rot = rotAt(now());
  split = splitAt(now());
  gridLayout();
  if (mode === 'grid' && geo.horz && KX[scene]) {
    // 窄屏是一长页：从哪个目录地址进来，就停在哪一段
    scroll[0].pos = scroll[0].target = clamp(geo.headY[KX[scene]] + scroll[0].pos - geo.HEAD + 10, 0, scroll[0].max);
    gridLayout();
  }
  if (mode === 'grid') {
    enterClass();
    clipOn = now() + 1400;
    busy = now() + 900;
    for (const s of SC)
      for (const it of ALL[s]) {
        const v = GE.get(it.id);
        v.el = makeEl(s);
        asGrid(v);
        const o = slide(120 + v.order * 16);
        Object.assign(v, { x: v.slot.x + o.x, y: v.slot.y + o.y, s: v.slot.s * 0.94, a: 0, lod: 3, on: true, _lod: -1 });
        fly(v, slotTo(v), { dur: 1000, delay: 120 + Math.min(10, v.order) * 70 + KX[s] * 60, ease: outQuart });
      }
  }
  root.classList.add('w-ready');
  requestAnimationFrame(tick);

  /* 从别的页带着要找的字（?q=）进来：直接筛上 */
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0) find(q0);

  /* 地址带着一则瞬间（/moments/#<id>）进来：直接把它打开 */
  const hashId = decodeURIComponent(location.hash.slice(1));
  if (hashId) {
    const it = ALL.moment.find((x) => x.ref.id === hashId);
    if (it) reader.open(it, null, { list: ALL.moment, fromURL: true, indexURL: PATH.moment, getRect: () => null });
  }

  window.__wander = {
    cam, recs, GE, scroll, geo, flights, ghosts,
    get mode() { return mode; }, get scene() { return scene; }, get busy() { return busy; }, get seams() { return seams; },
    get zT() { return zT; }, set zT(v) { zT = v; },
    toGrid, toExplore, setScene, setQuery, openVis, findVis, reader, rectOf, toHome, homeToGrid,
    get split() { return split; }, get rot() { return rot; }, get face() { return face; },
    clock,
    freeze() { clock.speed = 0; },
    resume() { clock.last = performance.now(); clock.speed = 1; },
    advance(ms) { for (let k = 0; k < ms; k += 16) { const d = Math.min(16, ms - k); clock.t += d; step(clock.t, d / 1000); } },
  };
}
