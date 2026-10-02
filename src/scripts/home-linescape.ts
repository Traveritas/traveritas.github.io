/* ─────────────────────────────────────────────────────────────
   主页 · 一根线的一夜（/new/）—— 开屏是「线景」（原型 design/mocks/scene-linescape*-notes.md）
   由 home-storyboard.ts 演化而来，去掉开屏大字那一套。开屏 ＝ 线景：
   全站那条线当地平线，地平线下方一整片「同一根线的回声」由另一个 Worker 画
   （home-linescape-worker.ts，OffscreenCanvas，不占主线程）；天上的穹肋是静态层（home-linescape-ribs.ts）。
   这里只负责：
     · 场序 pos → 色板（同主稿）
     · 线的姿态插值 → setEegSpine，并把同一条骨架与「收拢度」转给地形 Worker
       （fold：开屏滚过 0 → .3 幕时地形一排排贴回地平线，交接到第 1 幕时只剩单根线）
     · 闪念窗口、晨醒底线（同主稿）
   静置时没有任何 rAF；地形的流动全在 Worker 里。
   ───────────────────────────────────────────────────────────── */

import { makeSpine } from './eeg-wave';
import { setEegSpine } from './eeg-spine';
import { reducedMotion } from './lib';
import { onMixChange, wakeMix } from './reality';
import type { Pal } from './home-linescape-worker';
import { drawRibs } from './home-linescape-ribs';
import { findAnchor, makeGeo, orbOf, restPoint, rowsFor, type Anchor, type Geo } from './home-linescape-terrain';

type Pt = [number, number];

const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (t: number) => t * t * (3 - 2 * t);
/* 画布像素密度上限 1.5（tech-stack-decision.md 的 DPR 纪律）：细线在 1.5 下已够细，像素量比 2 少约 44% */
const DPR = () => Math.min(devicePixelRatio || 1, 1.5);

/* ── 色板：pos → 底 / 墨 / 次墨 / 雾光 / 暗度 / 晨光 ── */
type Stop = [number, number[], number[], number[], number[], number, number];
const PALETTE: Stop[] = [
  [0.0, [237, 240, 244], [35, 40, 48], [86, 96, 109], [255, 255, 255, 0.75], 0, 0],
  [1.0, [230, 235, 242], [35, 40, 48], [86, 96, 109], [255, 255, 255, 0.7], 0, 0],
  [1.9, [219, 226, 236], [35, 40, 48], [86, 96, 109], [255, 255, 255, 0.55], 0, 0],
  [2.1, [22, 30, 46], [230, 233, 239], [154, 166, 184], [120, 150, 200, 0.16], 1, 0],
  [2.95, [17, 23, 36], [230, 233, 239], [154, 166, 184], [120, 150, 200, 0.12], 1, 0],
  [3.08, [34, 29, 49], [236, 230, 241], [169, 159, 186], [170, 140, 210, 0.16], 1, 0],
  [3.92, [42, 36, 56], [236, 230, 241], [169, 159, 186], [170, 140, 210, 0.14], 1, 0],
  [4.3, [239, 231, 218], [43, 38, 32], [111, 100, 87], [255, 236, 205, 0.8], 0, 1],
  [5.0, [245, 239, 230], [43, 38, 32], [111, 100, 87], [255, 240, 215, 0.7], 0, 0.7],
];
/* ── 配色（灰粉梦温，见 design/mocks/scene-linescape-palette-notes.md 方案②）──
   暖灰底、粉在雾里，异质色只有一丝极浅的紫给光。这里管两件事：① 地形 Worker 与穹肋的线色；
   ② 第 0 幕色板起点，从它插值到第 1 幕现有色板 ⇒ 滚动时不跳色。天空渐变、圆光、问句与标注色在 new.astro 的静态 CSS 里。 */
const PAL: Pal = {
  nearW: [88, 80, 76],
  nearD: [118, 84, 96],
  farW: [196, 188, 182],
  farD: [214, 190, 192],
  lightW: [164, 146, 196],
  lightD: [176, 148, 206],
  accentD: [184, 166, 204],
};
PALETTE[0] = [0, [236, 233, 230], [40, 35, 33], [104, 94, 88], [255, 250, 246, 0.8], 0, 0];

const mixArr = (A: number[], B: number[], t: number) => A.map((v, i) => lerp(v, B[i], t));
const rgb = (c: number[]) =>
  c.length === 4
    ? `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`
    : `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/* ── 线的五个姿态（同主稿） ── */
const POSES_D: (Pt[] | null)[] = [
  null,
  [[0.33, -0.1], [0.3, 0.18], [0.315, 0.42], [0.29, 0.68], [0.305, 0.9], [0.3, 1.1]],
  [[0.31, -0.1], [0.29, 0.22], [0.305, 0.5], [0.285, 0.76], [0.3, 1.1]],
  [[0.5, -0.1], [0.485, 0.24], [0.515, 0.5], [0.49, 0.76], [0.5, 1.1]],
  [[0.2, -0.1], [0.2, 0.22], [0.215, 0.42], [0.28, 0.52], [0.55, 0.545], [0.85, 0.55], [1.12, 0.552]],
];
const POSES_M: (Pt[] | null)[] = [
  null,
  [[0.075, -0.1], [0.065, 0.3], [0.08, 0.6], [0.07, 1.1]],
  [[0.075, -0.1], [0.065, 0.3], [0.08, 0.6], [0.07, 1.1]],
  [[0.075, -0.1], [0.068, 0.3], [0.08, 0.6], [0.07, 1.1]],
  [[0.075, -0.1], [0.07, 0.2], [0.085, 0.36], [0.2, 0.42], [0.6, 0.43], [1.12, 0.432]],
];
const POSE_KEYS: [number, number][] = [
  [0, 0], [0.35, 0], [1.0, 1], [1.88, 1], [2.08, 2], [2.9, 2], [3.08, 3], [3.9, 3], [4.32, 4], [5, 4],
];
const N = 220;

function catmull(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function resample(poly: Pt[], n: number): Pt[] {
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = L[L.length - 1];
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < L.length - 1 && L[j] < s) j++;
    const t = (s - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
    out.push([lerp(poly[j - 1][0], poly[j][0], t), lerp(poly[j - 1][1], poly[j][1], t)]);
  }
  return out;
}

export function initLinescape() {
  const root = document.documentElement;
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (!scenes.length) return;
  const RM = reducedMotion();
  const mq = matchMedia('(max-width: 760px)');
  const slips = [...document.querySelectorAll<HTMLElement>('[data-c]')].map((el) => ({ el, c: Number(el.dataset.c) }));
  slips.forEach(({ el, c }) => el.style.setProperty('--c', String(c)));

  /* ── 地形 Worker ── */
  const cvs = document.getElementById('ls-canvas') as HTMLCanvasElement | null;
  let terrain: Worker | null = null;
  if (cvs && typeof Worker === 'function' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype) {
    terrain = new Worker(new URL('./home-linescape-worker.ts', import.meta.url), { type: 'module' });
    const cs = getComputedStyle(root);
    const base = (k: string) => cs.getPropertyValue(k).trim();
    // 强调色由 reality.ts 写在根节点内联样式上（醒度插值）：读内联值不触发样式计算
    const inline = (k: string) => root.style.getPropertyValue(k) || base(k);
    const colors = () => ({
      umber: inline('--umber'),
      amber: inline('--amber'),
      wake: inline('--wake'),
      dream: inline('--dream'),
    });
    const size = () => ({
      W: innerWidth,
      H: innerHeight,
      dpr: DPR(),
      mobile: mq.matches,
    });
    const off = cvs.transferControlToOffscreen();
    terrain.postMessage(
      {
        type: 'init',
        canvas: off,
        ...size(),
        d: 1 - wakeMix(),
        colors: colors(),
        still: RM,
        origin: performance.timeOrigin,
        variant: 'a',
        pal: PAL,
      },
      [off],
    );
    addEventListener('resize', () => terrain?.postMessage({ type: 'size', ...size() }));
    onMixChange(() => terrain?.postMessage({ type: 'mix', d: 1 - wakeMix(), colors: colors() }));
    document.addEventListener('visibilitychange', () =>
      terrain?.postMessage({ type: 'hidden', hidden: document.hidden }),
    );
    // 截图脚本读 Worker 每帧耗时：window.__lsPerf() → { avg, max, n }
    (window as unknown as { __lsPerf: () => Promise<unknown> }).__lsPerf = () =>
      new Promise((res) => {
        const w = terrain as Worker;
        const on = (e: MessageEvent) => {
          if (e.data?.type !== 'perf') return;
          w.removeEventListener('message', on);
          res(e.data);
        };
        w.addEventListener('message', on);
        w.postMessage({ type: 'perf' });
      });
  }
  let tKey = '';

  /* ── 锚点：等高线标注与测量点钉在静止地形上（只在尺寸变化时算一次，Worker 在附近把波压平） ── */
  const ribW = document.getElementById('ls-rib-w') as HTMLCanvasElement | null;
  const ribD = document.getElementById('ls-rib-d') as HTMLCanvasElement | null;
  let ribKey = '';
  const pinsOn = true;
  const isA = true;
  const markH = document.querySelector<HTMLElement>('[data-mark="h"]');
  const markN = document.querySelector<HTMLElement>('[data-mark="n"]');
  const pinEls = [...document.querySelectorAll<HTMLElement>('.pin')];
  let anchors: Anchor[] = [];
  let anchorVer = 0;
  // 锚点处线的方向（度）：静止形状上前后各取一点
  const angleAt = (g: Geo, k: number, s: number) => {
    const [x0, y0] = restPoint(g, k, s - 10);
    const [x1, y1] = restPoint(g, k, s + 10);
    return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  };
  const put = (el: HTMLElement | null, g: Geo, a: Anchor, rot?: number) => {
    if (!el) return;
    el.style.setProperty('--x', `${a.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${a.y.toFixed(1)}px`);
    el.style.setProperty('--rot', `${(rot ?? angleAt(g, a.k, a.s)).toFixed(2)}deg`);
  };
  function placeMarks() {
    const p0 = poses[0];
    if (!p0) return;
    const xy0 = new Float32Array(p0.length * 2);
    p0.forEach(([x, y], i) => {
      xy0[2 * i] = x;
      xy0[2 * i + 1] = y;
    });
    const m = mq.matches;
    const g = makeGeo(vw, vh, m, xy0);
    const K = rowsFor(m);
    // 23:07：地平线本身（Eeg 那张画布上，断口由 DOM 上的底色小晕遮出来）
    const sH = ((m ? 0.3 : 0.36) * vw - xy0[0]) / (g.tx || 1);
    const [hx, hy] = restPoint(g, -1, sH);
    put(markH, g, { k: -1, s: sH, x: hx, y: hy, gap: 0 });
    // 06:31：最近的那几排里离目标最近的一条（远是入夜、近是天亮）
    const aN = findAnchor(g, (m ? 0.5 : 0.42) * vw, (m ? 0.9 : 0.885) * vh, 24, Math.floor(K * 0.55), K - 1);
    put(markN, g, aN);
    anchors = [aN];
    if (pinsOn)
      for (const el of pinEls) {
        const at = (el.dataset.at ?? '').split(',').map(Number);
        const [tx, ty] = m ? [at[2], at[3]] : [at[0], at[1]];
        const a = findAnchor(g, tx * vw, ty * vh, 0, Math.floor(K * 0.3), K - 1);
        put(el, g, a, (Math.atan2(g.ty, g.tx) * 180) / Math.PI); // 测量点一律沿地平线方向：各排局部角度不一，标签跟着歪会显得乱
        anchors.push(a);
      }
    // a：线圈后那团光与线圈同一份几何
    if (isA) {
      const o = orbOf(g);
      root.style.setProperty('--sx', `${o.cx.toFixed(1)}px`);
      root.style.setProperty('--sy', `${o.cy.toFixed(1)}px`);
      root.style.setProperty('--sr', `${o.R.toFixed(1)}px`);
      // 穹肋：静态两张（醒 / 梦），只在尺寸变化时重画；醒梦交叉淡化与滚动淡出全交给 CSS
      const rk = `${vw}x${vh}@${DPR()}|${m}`;
      if (rk !== ribKey && ribW && ribD) {
        ribKey = rk;
        drawRibs(ribW, g, o, DPR(), 0, PAL.nearW, PAL.lightW);
        drawRibs(ribD, g, o, DPR(), 1, PAL.nearD, PAL.lightD);
      }
    }
    anchorVer++;
    root.classList.add('ls-placed');
  }

  /* ── 测量点的开合：点按开 / 再按或点空白收；Esc 收起并把焦点还给点。
     键盘焦点（:focus-visible）由 CSS 直接浮窗，这里只管 .open 与 Esc ── */
  if (pinsOn) {
    const dotOf = (p: HTMLElement) => p.querySelector<HTMLButtonElement>('.pin-dot');
    const close = (except?: HTMLElement) => {
      for (const p of pinEls) {
        if (p === except) continue;
        p.classList.remove('open');
        dotOf(p)?.setAttribute('aria-expanded', 'false');
      }
    };
    for (const p of pinEls) {
      const b = dotOf(p);
      b?.addEventListener('click', () => {
        const on = !p.classList.contains('open');
        close(p);
        p.classList.remove('shut');
        p.classList.toggle('open', on);
        b.setAttribute('aria-expanded', String(on));
      });
      p.addEventListener('focusout', (e) => {
        if (!p.contains(e.relatedTarget as Node | null)) p.classList.remove('shut');
      });
    }
    document.addEventListener('click', (e) => {
      if (!(e.target as Element | null)?.closest?.('.pin')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const p = pinEls.find((x) => x.classList.contains('open') || x.contains(document.activeElement));
      close();
      if (!p) return;
      p.classList.add('shut'); // 焦点还在点上时也收起，直到焦点离开
      dotOf(p)?.focus();
    });
  }

  let winFull = 0.075;
  const applyWindows = () => {
    document.querySelectorAll<HTMLElement>('[data-w0]').forEach((st) => {
      const [w0, w1] = mq.matches
        ? [st.dataset.w0m ?? '.028', st.dataset.w1m ?? '.085']
        : [st.dataset.w0 ?? '.075', st.dataset.w1 ?? '.23'];
      winFull = Number(w0);
      st.style.setProperty('--w0', w0);
      st.style.setProperty('--w1', w1);
    });
  };

  /* 问句逐字：每个 .q 里的字各包一层，入场时一字一字落定（纯 CSS 动画，序号写进 --i） */
  let ci = 0;
  for (const q of document.querySelectorAll<HTMLElement>('.s-hero .q')) {
    const walk = (node: Node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const f = document.createDocumentFragment();
          for (const ch of n.textContent ?? '') {
            const c = document.createElement('span');
            c.className = 'c';
            c.style.setProperty('--i', String(ci++));
            c.textContent = ch;
            f.append(c);
          }
          n.parentNode?.replaceChild(f, n);
        } else if (n.nodeType === 1 && (n as Element).tagName !== 'BR') walk(n);
      }
    };
    walk(q);
  }

  let vw = innerWidth;
  let vh = innerHeight;
  let poses: Pt[][] = [];
  let geo: { el: HTMLElement; top: number; h: number }[] = [];
  let pos = 0;
  const ps = [0, 0, 0, 0, 0];
  let lift = 0;
  let dark = 0;
  let dawnDot = 0;

  function buildPoses() {
    const P = mq.matches ? POSES_M : POSES_D;
    const half = Math.sqrt(vw * vw + vh * vh) / 2 + 60;
    const a = (14 * Math.PI) / 180;
    const line: Pt[] = [
      [vw / 2 - Math.cos(a) * half, vh / 2 - Math.sin(a) * half],
      [vw / 2 + Math.cos(a) * half, vh / 2 + Math.sin(a) * half],
    ];
    poses = P.map((pp, k) =>
      k === 0 || !pp ? resample(line, N) : resample(catmull(pp.map(([x, y]) => [x * vw, y * vh] as Pt), 24), N),
    );
  }

  function poseAt(p: number): Pt[] {
    let i = 0;
    while (i < POSE_KEYS.length - 2 && p > POSE_KEYS[i + 1][0]) i++;
    const [p0, a] = POSE_KEYS[i];
    const [p1, b] = POSE_KEYS[i + 1];
    const t = sstep(cl((p - p0) / (p1 - p0)));
    if (a === b || t === 0) return poses[a];
    const A = poses[a];
    const B = poses[b];
    return A.map((q, k) => [lerp(q[0], B[k][0], t), lerp(q[1], B[k][1], t)] as Pt);
  }

  function palette(p: number) {
    let i = 0;
    while (i < PALETTE.length - 2 && p > PALETTE[i + 1][0]) i++;
    const a = PALETTE[i];
    const b = PALETTE[i + 1];
    const t = cl((p - a[0]) / (b[0] - a[0]));
    dark = lerp(a[5], b[5], t);
    const fg = mixArr(a[2], b[2], t);
    root.style.setProperty('--bg', rgb(mixArr(a[1], b[1], t)));
    root.style.setProperty('--fg', rgb(fg));
    root.style.setProperty('--fg-soft', rgb(mixArr(a[3], b[3], t)));
    root.style.setProperty('--line', `rgba(${fg[0] | 0},${fg[1] | 0},${fg[2] | 0},0.13)`);
    root.style.setProperty('--glow', rgb(mixArr(a[4], b[4], t)));
    root.style.setProperty('--dark', dark.toFixed(3));
    root.style.setProperty('--dawn', lerp(a[6], b[6], t).toFixed(3));
  }

  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    geo = scenes.map((el) => ({ el, top: el.offsetTop, h: el.offsetHeight }));
    applyWindows();
    buildPoses();
    placeMarks();
    kick();
  }

  function updateScroll() {
    const y = scrollY;
    pos = 0;
    geo.forEach((g, k) => {
      const p = cl((y - g.top) / Math.max(1, g.h - vh));
      ps[k] = p;
      g.el.style.setProperty('--p', p.toFixed(4));
      if (y >= g.top - 1) pos = k + p;
    });
    const g4 = geo[4];
    lift = g4 ? Math.max(0, y - (g4.top + g4.h - vh)) : 0;
    palette(Math.min(5, pos));
    // 天空层（静态渐变）：开屏全显，往第 1 幕交接时淡出到 --bg（只在滚动时写）
    root.style.setProperty('--sky', (1 - sstep(cl((pos - 0.25) / 0.6))).toFixed(3));
    for (const s of slips) {
      const ad = Math.abs(ps[3] - s.c);
      s.el.classList.toggle('on', s.el.classList.contains('on') ? ad < winFull + 0.04 : ad < winFull);
    }
    dawnDot = cl((pos - 4.2) / 0.3);
  }

  /* 入场：揭幕（html.booted）后线从中心往两端画出 —— 只有这 1.3s 满帧出帧 */
  let t0 = -1;
  const onBooted = () => {
    if (t0 < 0) t0 = performance.now();
    kick();
  };
  // 已揭幕（减动效时揭幕是同步的）：等本函数跑完、kick 定义之后再进（原稿这里会撞上 kick 的暂时性死区）
  if (root.classList.contains('booted')) queueMicrotask(onBooted);
  else {
    const mo = new MutationObserver(() => {
      if (root.classList.contains('booted')) {
        mo.disconnect();
        onBooted();
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  let scrollDirty = true;
  let lastSent = '';
  let lastRib = '';
  let raf = 0;
  const kick = () => {
    scrollDirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  let xy = new Float32Array(0);
  let sp: ReturnType<typeof makeSpine> | null = null;

  function frame(now: number) {
    raf = 0;
    const reveal = RM ? 1 : t0 < 0 ? 0 : cl((now - t0 - 150) / 1150);
    if (scrollDirty) {
      scrollDirty = false;
      updateScroll();
      const pts = poseAt(pos);
      xy = new Float32Array(pts.length * 2);
      for (let i = 0; i < pts.length; i++) {
        xy[2 * i] = pts[i][0];
        xy[2 * i + 1] = pts[i][1] - lift;
      }
      sp = makeSpine(xy);
    }
    if (!sp) return;
    const dotF = mq.matches ? 0.78 : 0.7;
    const key = `${pos.toFixed(4)}|${lift.toFixed(1)}|${reveal.toFixed(3)}|${dark.toFixed(3)}|${vw}x${vh}`;
    if (key !== lastSent) {
      lastSent = key;
      setEegSpine({ xy, dark, reveal, dot: dawnDot > 0 ? [dotF, dawnDot] : null });
    }
    /* 地形：只在开屏一带发；收拢到底（fold 1）发最后一次后 Worker 自己停下 */
    const fold = cl(pos / 0.3);
    // 穹肋随收拢淡出（只在值变了时写：入场那几秒 frame 满帧跑，同值重写也会让样式失效）
    const rib = ((1 - sstep(fold)) ** 2).toFixed(3);
    if (rib !== lastRib) root.style.setProperty('--rib', (lastRib = rib));
    const tk = `${fold.toFixed(4)}|${vw}x${vh}|${t0}|${anchorVer}`;
    if (terrain && tk !== tKey && (fold < 1 || !tKey.startsWith('1.0000'))) {
      tKey = tk;
      terrain.postMessage({ type: 'state', xy: xy.slice(), fold, boot: t0 < 0 ? NaN : t0, anchors });
    }
    root.classList.toggle('ls-folded', fold > 0.5);
    if (pos > 3.9) {
      const L = sp.L;
      const s = sp.len * 0.72;
      let j = 1;
      while (j < L.length - 1 && L[j] < s) j++;
      root.style.setProperty('--base', `${(sp.xy[2 * j + 1] + lift).toFixed(1)}px`);
    }
    if (reveal < 1 && t0 >= 0) raf = requestAnimationFrame(frame);
  }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', measure);
  mq.addEventListener('change', measure);
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  measure();
}
