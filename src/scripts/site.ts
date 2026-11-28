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
import { initSound, isSaveData, playFx, preloadCoreAudio, prefetchLoopsIdle, type FxId } from './sound';
import { AVE_VOICE } from '../data/ave-voice';
import { initToolstar, toolstarPage } from './toolstar';
import { initAve, aveEnterRoute, aveRouteEnd } from './ave';
import { initCursor } from './cursor';
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
  if (place === 'list') return { place, k, pan: SECS[k].pan, gain: 0.66 }; // 名录的字直接写在地面上，地面再压低一点
  return { place: 'read', k, slug: b.slug, pan: [SECS[k].pan[0] + 0.25, SECS[k].pan[1] + 0.55], gain: 0.85 };
}

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
  aveRouteEnd(!!href);
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
  for (const img of view.querySelectorAll<HTMLImageElement>('[data-tone] img')) toneOf(img);
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
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
// 点下去：字先退、地面开始变粗；新页拿到并且退场演完（300ms）才换
document.addEventListener('astro:before-preparation', (e) => {
  const nav = e as Event & { sourceElement?: Element; direction?: string };
  const isBack = nav.direction === 'back' || !!nav.sourceElement?.closest?.('.read .back, .ts-dock-back');
  playFx(isBack ? 'back' : 'confirm');
  if (mqReduce.matches) return;
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
  playFx(night ? 'flip-dream' : 'flip-wake');
  applyFace();
  if (mqReduce.matches) {
    setFace(night ? 'dream' : 'wake');
    return;
  }
  st.pulse = performance.now();
  setTimeout(() => setFace(night ? 'dream' : 'wake'), 900);
});

/* ── 画布 ── */
let ground: ReturnType<typeof createGround> | null = null;
try {
  ground = createGround(document.getElementById('g') as HTMLCanvasElement);
  ground.mesh('essays', bipyramid(6, 1, 0.72, 0.4));
  ground.mesh('moments', shard(7));
  ground.mesh('projects', cubeClean());
  ground.mesh('nexus', tesseractSlice(0.5));
} catch {
  /* WebGL2 不可用时退回纯静态底色，不阻断页面进入 */
}

/* 晶体：三处各一颗，外加 NEXUS 门上那一颗（四维晶体的切面，切的位置一直在慢慢走，形也跟着变） */
type Crys = Sec | 'nexus';
const CRYS: Crys[] = [...ORDER, 'nexus'];
const TINT: Record<Crys, number[]> = { ...Object.fromEntries(ORDER.map((k) => [k, SECS[k].tint])), nexus: [0.93, 0.9, 1.0] } as Record<Crys, number[]>;
const MESHOF: Record<Crys, string> = { ...MESH, nexus: 'nexus' };
type X = { x: number; y: number; s: number; a: number; glow: number; spin: number; seen: boolean };
const XS = {} as Record<Crys, X>;
for (const k of CRYS) XS[k] = { x: innerWidth / 2, y: innerHeight / 2, s: 0, a: 0, glow: 0, spin: 0, seen: false };
let slicePh = 0.4;

/* 闪念：每张图取一个主色（缩成 16×16 按饱和度加权平均），悬停时它周围的地面染上这个色 */
const wash = [0, 0, 0, 0];
const washAt = [0, 0, 300];
function toneOf(img: HTMLImageElement) {
  const go = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      let r = 0, gg = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const k = 0.15 + (mx - mn) / 255;
        r += d[i] * k; gg += d[i + 1] * k; b += d[i + 2] * k; w += k;
      }
      const host = img.closest<HTMLElement>('[data-tone]');
      // 平均出来的色总是发灰：离灰再推开一倍，染出来才看得出是哪种颜色
      const c3 = [r, gg, b].map((x) => x / w / 255);
      const m = (c3[0] + c3[1] + c3[2]) / 3;
      if (host && !host.dataset.tone) host.dataset.tone = c3.map((x) => Math.min(1, Math.max(0, m + (x - m) * 2.2)).toFixed(3)).join(',');
    } catch {
      /* 取不到就不染 */
    }
  };
  if (img.complete && img.naturalWidth) go();
  else img.addEventListener('load', go, { once: true });
}

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
  playFx('gate-nexus');
  door = matchMedia('(prefers-reduced-motion: reduce)').matches ? performance.now() - DOOR_MS + 380 : performance.now();
});

/* ── 交互悬停与外链音效 ── */
const SEC_FX: Record<Sec, FxId> = {
  articles: 'sec-articles',
  moments: 'sec-moments',
  projects: 'sec-projects',
};
const panOf = (el: Element) => {
  const r = el.getBoundingClientRect();
  return Math.max(-0.35, Math.min(0.35, ((r.left + r.width * 0.5) / Math.max(innerWidth, 1) - 0.5) * 0.6));
};
let lastHoverEl: Element | null = null;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const hit = (e.target as Element).closest?.(
    'a.door[data-sec], a.sib, .pj > a, .ar > a, .mo, a.gate-door, .read .back',
  );
  if (!hit || hit === lastHoverEl) return;
  if (e.relatedTarget instanceof Node && hit.contains(e.relatedTarget)) return;
  lastHoverEl = hit;
  if (hit.matches('a.door[data-sec], a.sib')) {
    const k = ((hit as HTMLElement).dataset.sec || hit.querySelector<HTMLElement>('[data-x]')?.dataset.x) as Sec | undefined;
    if (k && SEC_FX[k]) playFx(SEC_FX[k], { jitter: 0.012, pan: panOf(hit) });
  } else if (hit.matches('a.gate-door')) {
    playFx('hover', { jitter: 0.01, gain: 0.85, pan: 0 });
  } else if (hit.matches('.read .back')) {
    playFx('hover', { jitter: 0.014, gain: 0.72, pan: -0.25 });
  } else {
    playFx('hover', { jitter: 0.016, gain: 0.62, pan: panOf(hit) });
  }
});
document.addEventListener('pointerout', (e) => {
  if (!lastHoverEl) return;
  if (e.relatedTarget instanceof Node && lastHoverEl.contains(e.relatedTarget)) return;
  lastHoverEl = null;
});
document.addEventListener('click', (e) => {
  if (e.defaultPrevented) return;
  const a = (e.target as Element).closest?.<HTMLAnchorElement>(
    'a[target="_blank"], a[href="/rss.xml"], [data-ring="go"] a[href^="http"]',
  );
  if (a && !a.hasAttribute('data-gate')) playFx('outlink', { gain: 0.9 });
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

const BOOT_STEPS = [48, 34, 24, 16, 11, 7, 4, 2, 1]; // 加载格阶：由真实加载进度推进，全部就绪才收至 1
const BOOT_HOLD_IDX = 4; // 资源未就绪前最细停在 11 格，绝不提前放行
const BOOT_STEP_MS = 130;
const BOOT_FINISH_MS = 115;
const BOOT_MAX_WAIT_MS = 18000; // 弱网或个别资源异常时的兜底上限（加载中可随时跳过）
const BOOT_SKIP_DELAY_MS = 850; // 加载超过此时长仍未就绪再淡入跳过按钮，避免秒开时闪一下
const PULSE = [1, 2, 4, 7, 7, 5, 3, 2, 1]; // 换页：每拍 100ms 一级
const t0 = performance.now();
st.boot = t0;
let bootIdx = 0;
let bootStepAt = t0;
let bootProg = 0;
let bootDisp = 0;
let bootLastPct = -1;
let bootSkippable = false;
let bootReady = false;
let bootDoneAt = -1;
let glDrawn = false;
let resolveGl!: () => void;
const glFirstFrame = new Promise<void>((res) => {
  resolveGl = res;
});
if (!ground) resolveGl();

const bootHud = document.getElementById('boot-hud');
const bootPct = document.getElementById('boot-pct');
const bootFill = document.getElementById('boot-fill');
const bootSkip = document.getElementById('boot-skip') as HTMLButtonElement | null;

function renderBootHud(p: number) {
  const clamped = Math.max(0, Math.min(1, p));
  if (bootFill) bootFill.style.transform = `scaleX(${clamped.toFixed(4)})`;
  const pct = Math.round(clamped * 100);
  if (bootPct && pct !== bootLastPct) {
    bootLastPct = pct;
    bootPct.textContent = `${pct}%`;
  }
}

function setBootSkippable(show: boolean) {
  if (bootSkippable === show || !bootSkip) return;
  bootSkippable = show;
  bootHud?.classList.toggle('is-skippable', show);
  bootSkip.tabIndex = show ? 0 : -1;
  bootSkip.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function finishBoot(now: number, skipped = false) {
  if (st.boot < 0) return;
  st.boot = -1;
  st.coarse = 1;
  st.veil = 1;
  bootDoneAt = now;
  if (!skipped) {
    bootDisp = 1;
    renderBootHud(1);
  }
  setBootSkippable(false);
  if (bootHud) {
    bootHud.classList.add('is-done');
    html.classList.add('boot-fade');
    setTimeout(() => html.classList.remove('boot-fade'), mqReduce.matches ? 0 : 420);
  }
  html.classList.remove('booting');
  html.classList.add('booted');
  prefetchLoopsIdle(night ? 'dream' : 'wake');
}

bootSkip?.addEventListener('click', () => {
  if (st.boot < 0) return;
  bootReady = true;
  finishBoot(performance.now(), true);
});

/* ── 真实资源门控：WebGL 首帧 + 自切字体 + 首屏图片 + 核心音频包（当前面 open + FX + Ave） ── */
function waitForReady(onProgress: (p: number) => void): Promise<void> {
  const raw = (document.getElementById('view')?.textContent || 'AveritA 的昼梦叙集 断章 闪念 造物').replace(/\s+/g, '');
  const sampleText = [...new Set(raw)].slice(0, 240).join('');
  const hasBold = !!document.querySelector('#view .sheet h1, #view h2, #view h3, #view strong');
  const imgs = [...document.querySelectorAll<HTMLImageElement>('#view img')].filter((img, idx) => {
    const r = img.getBoundingClientRect();
    return (idx < 4 && img.loading !== 'lazy') || (r.top < innerHeight * 1.25 && r.bottom > -100);
  });
  const withAudio = !isSaveData();

  const tasks: { weight: number; progress: number; p: Promise<unknown> }[] = [];
  const report = () => {
    const total = tasks.reduce((s, t) => s + t.weight, 0) || 1;
    const got = tasks.reduce((s, t) => s + t.weight * t.progress, 0);
    onProgress(got / total);
  };
  const add = (weight: number, p: Promise<unknown>) => {
    const item = { weight, progress: 0, p };
    tasks.push(item);
    item.p = p.catch(() => {}).finally(() => {
      item.progress = 1;
      report();
    });
    return (v: number) => {
      const next = Math.max(item.progress, Math.min(1, v));
      if (next !== item.progress) {
        item.progress = next;
        report();
      }
    };
  };

  add(withAudio ? 0.12 : 0.2, glFirstFrame);

  const fontSheet = document.querySelector<HTMLLinkElement>('link[href*="noto-serif-sc/font.css"]');
  const sheetReady =
    !fontSheet || fontSheet.sheet
      ? Promise.resolve()
      : new Promise<void>((res) => {
          fontSheet.addEventListener('load', () => res(), { once: true });
          fontSheet.addEventListener('error', () => res(), { once: true });
        });
  add(withAudio ? 0.06 : 0.15, sheetReady);

  const monoReady = document.fonts ? document.fonts.load('400 12px "IBM Plex Mono"', 'AveritA 0123456789/·%') : Promise.resolve();
  add(withAudio ? 0.08 : 0.15, monoReady);

  const serifReady = sheetReady.then(async () => {
    if (!document.fonts) return;
    const loads: Promise<unknown>[] = [document.fonts.load('500 16px "Noto Serif SC"', sampleText)];
    if (hasBold) loads.push(document.fonts.load('600 16px "Noto Serif SC"', sampleText));
    await Promise.allSettled(loads);
    await document.fonts.ready;
  });
  add(withAudio ? (imgs.length ? 0.2 : 0.26) : imgs.length ? 0.35 : 0.5, serifReady);

  if (imgs.length) {
    const w = (withAudio ? 0.08 : 0.15) / imgs.length;
    for (const img of imgs) {
      const p = img.complete
        ? img.decode?.().catch(() => {}) ?? Promise.resolve()
        : new Promise<void>((res) => {
            const fin = () => (img.decode?.().catch(() => {}) ?? Promise.resolve()).finally(() => res());
            img.addEventListener('load', fin, { once: true });
            img.addEventListener('error', () => res(), { once: true });
          });
      add(w, p);
    }
  }

  if (withAudio) {
    const voiceSrcs = Object.values(AVE_VOICE).map((c) => c.src);
    let setAudioProg: ((v: number) => void) | null = null;
    let initialAudioProg = 0;
    const audioPromise = preloadCoreAudio(night ? 'dream' : 'wake', voiceSrcs, (v) => {
      initialAudioProg = v;
      setAudioProg?.(v);
    });
    setAudioProg = add(imgs.length ? 0.46 : 0.48, audioPromise);
    if (initialAudioProg > 0) setAudioProg(initialAudioProg);
  }

  const timeout = new Promise<void>((res) => setTimeout(res, BOOT_MAX_WAIT_MS));
  return Promise.race([Promise.all(tasks.map((t) => t.p)).then(() => {}), timeout]);
}

waitForReady((p) => {
  bootProg = p;
}).then(() => {
  bootProg = 1;
  bootReady = true;
  if (!ground) finishBoot(performance.now());
});

let last = t0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const reduced = mqReduce.matches;
  const T = (now - t0) / 1000;
  // 夜：12 帧一拍；闪念那一处的地面不定格，留着雨的连续感（晶体照样定格）；减弱动态下冻结时间轴
  const stepped = night && route.k !== 'moments';
  const tq = reduced ? 0 : stepped ? Math.floor(T * 12) / 12 : T;
  const xStepped = night;
  const xq = reduced ? 0 : xStepped ? Math.floor(T * 12) / 12 : T;
  const k = (r: number) => (reduced ? 1 : 1 - Math.exp(-dt * r));

  st.day += ((night ? 0 : 1) - st.day) * k(3);
  setMix(st.day);
  const scrollPanX = reduced ? 0 : scrollY * 0.00025;
  const scrollPanY = reduced ? 0 : scrollY * 0.0006;
  st.pan[0] += (st.panT[0] + scrollPanX - st.pan[0]) * k(2.2);
  st.pan[1] += (st.panT[1] + scrollPanY - st.pan[1]) * k(2.2);
  st.gain += (st.gainT - st.gain) * k(2);

  // 加载 / 换页：格随真实加载进度一拍拍收细，全部就绪后落到 1 再放行页面
  st.coarse = 1;
  if (st.boot > 0) {
    const dispTarget = bootReady ? 1 : bootProg;
    bootDisp = reduced ? dispTarget : bootDisp + (dispTarget - bootDisp) * (1 - Math.exp(-dt * (bootReady ? 14 : 9)));
    if (dispTarget - bootDisp < 0.002) bootDisp = dispTarget;
    renderBootHud(bootDisp);
    if (!bootReady && !bootSkippable && now - st.boot >= BOOT_SKIP_DELAY_MS) {
      setBootSkippable(true);
    }
    const veilTarget = bootReady ? 1 : 0.78;
    st.veil += (veilTarget - st.veil) * (1 - Math.exp(-dt * (bootReady ? 7 : 3.2)));
    if (reduced) {
      if (bootReady) finishBoot(now);
      else st.coarse = BOOT_STEPS[BOOT_HOLD_IDX];
    } else {
      const cap = bootReady ? BOOT_STEPS.length - 1 : Math.min(BOOT_HOLD_IDX, Math.floor(bootProg * (BOOT_HOLD_IDX + 1)));
      const stepMs = bootReady ? BOOT_FINISH_MS : BOOT_STEP_MS;
      if (bootIdx < cap && now - bootStepAt >= stepMs) {
        bootIdx++;
        bootStepAt = now;
      }
      st.coarse = BOOT_STEPS[bootIdx];
      if (bootReady && bootIdx >= BOOT_STEPS.length - 1 && now - bootStepAt >= 80) {
        finishBoot(now);
      }
    }
  } else if (door > 0) {
    const e = now - door;
    st.coarse = reduced ? 1 : DOOR[Math.min(DOOR.length - 1, Math.floor(e / 120))];
    const w = document.querySelector<HTMLElement>('.gate-white');
    if (w) w.style.opacity = String(Math.min(1, Math.max(0, (e - DOOR_MS * 0.45) / (DOOR_MS * 0.5))));
    if (e > DOOR_MS && doorHref) {
      location.href = doorHref;
      doorHref = '';
    }
  } else if (st.pulse > 0) {
    if (reduced) st.pulse = -1;
    else {
      const i = Math.floor((now - st.pulse) / 100);
      if (i >= PULSE.length) st.pulse = -1;
      else st.coarse = PULSE[i];
    }
  }
  const shown = view.classList.contains('in') && st.boot < 0 ? 1 : 0;
  st.viewA += (shown - st.viewA) * k(shown ? 5 : 14);

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
  const reducedMotion = reduced;
  for (const name of CRYS) {
    const c = XS[name];
    let el: Element | null = null;
    // 锚点：平时在页里的 [data-x]；悬停的链接里若有 [data-xh]（造物的名录），晶体飞过去停在那儿
    if (st.viewA > 0.02) el = view.querySelector(`a:hover [data-xh="${name}"]`) || view.querySelector(`[data-x="${name}"]`);
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
    // 主页首次加载完成后的进场错峰：三颗晶体顺着 14° 斜线依次凝结、微亮后落定
    let enterK = 1;
    let enterGlow = 0;
    if (!reducedMotion && route.place === 'home' && bootDoneAt > 0 && name !== 'nexus') {
      const idx = ORDER.indexOf(name);
      const elapsed = now - bootDoneAt - (200 + idx * 140);
      if (elapsed < 0) {
        enterK = 0;
        ta = 0;
      } else if (elapsed < 780) {
        const t = elapsed / 780;
        enterK = 1 - (1 - t) * (1 - t) * (1 - t);
        enterGlow = Math.sin(t * Math.PI) * 0.42 * (1 - t * 0.3);
      }
    }
    // 停在条目旁边时不点亮脚下的地面（小，底下一亮就被它放大成一团白）
    if (hov && !el?.hasAttribute('data-xh')) hotT = [tx, ty, 1];
    const sp = reduced ? 1 : 1 - Math.exp(-dt * 7);
    c.x += (tx - c.x) * sp;
    c.y += (ty - c.y) * sp;
    c.s += (ts * (1 + hov * 0.12) - c.s) * sp;
    c.a += (ta * enterK - c.a) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
    c.glow += (hov - c.glow) * k(8);
    // 三处的晶体悬停时转快一点；NEXUS 那一颗反过来，悬停时慢慢停住（切面也停在那儿）
    const gate = name === 'nexus';
    if (!reduced) c.spin += dt * (gate ? 0.18 * (1 - c.glow * 0.9) : 0.25 + c.glow * 1.1);
    const sq = reduced ? 0 : xStepped ? Math.floor((c.spin * 12) / 1.4) * (1.4 / 12) : c.spin;
    let size = c.s * (0.62 + 0.38 * enterK);
    if (gate && c.a > 0.004) {
      if (!reduced) {
        slicePh += dt * 0.11 * (1 - c.glow * 0.92);
        // 只在截角四面体 ↔ 正八面体之间走（再往外就只剩一枚光秃的四面体）
        ground?.mesh('nexus', tesseractSlice(0.82 * Math.sin(slicePh)));
      }
      size *= 1 + (reduced ? 0 : doorK * doorK * 4);
    }

    const ph = CRYS.indexOf(name) * 2.1;
    // NEXUS 那一颗倾得更多、也晃得更多：总让人看见好几个面，不会正对成一片平的三角
    const rot = gate
      ? euler(0.62 + Math.sin(xq * 0.23) * 0.22, sq + ph, 0.32 + Math.sin(xq * 0.17) * 0.18)
      : euler(0.35 + Math.sin(xq * 0.3 + ph) * 0.12, sq + ph, Math.sin(xq * 0.21 + ph) * 0.1);
    crystals.push({
      mesh: MESHOF[name],
      x: c.x,
      y: c.y,
      size,
      a: c.a * (st.viewA * 0.6 + 0.4),
      rot,
      tint: TINT[name],
      glow: Math.min(1, c.glow + enterGlow),
    });
  }
  // 闪念：悬停的那一条的颜色
  const toned = route.k === 'moments' ? view.querySelector<HTMLElement>('[data-tone]:hover') : null;
  if (toned?.dataset.tone) {
    const r = toned.getBoundingClientRect();
    const t = toned.dataset.tone.split(',').map(Number);
    for (let i = 0; i < 3; i++) wash[i] += (t[i] - wash[i]) * k(wash[3] < 0.05 ? 40 : 4);
    washAt[0] += (r.left + r.width / 2 - washAt[0]) * k(wash[3] < 0.05 ? 40 : 4);
    washAt[1] += (r.top + r.height / 2 - washAt[1]) * k(wash[3] < 0.05 ? 40 : 4);
    washAt[2] = Math.max(r.width, r.height) * 1.1;
  }
  wash[3] += ((toned?.dataset.tone ? 1 : 0) - wash[3]) * k(toned ? 2.2 : 1.6);
  view.style.setProperty('--sy', String(scrollY));
  for (let i = 0; i < 3; i++) st.hot[i] += (hotT[i] - st.hot[i]) * k(i === 2 ? 5 : 12);

  if (ground) {
    ground.draw({ time: tq, pan: st.pan, hot: st.hot, mouse, day: st.day, coarse: st.coarse, veil: st.veil, place: st.place, gain: st.gain, glass, crystals, wash, washAt });
    if (!glDrawn) {
      glDrawn = true;
      requestAnimationFrame(() => resolveGl());
    }
  }
  requestAnimationFrame(frame);
}

// 第一页若是读某一篇：进页只说它自带的那句（xm:read），不挑版块的进页句子
if (route.place === 'read') document.getElementById('ave')!.dataset.entry = '';
setFace(night ? 'dream' : 'wake');
setMix(night ? 0 : 1);
initSound();
initToolstar();
initAve();
initCursor();
mount();
requestAnimationFrame(frame);
