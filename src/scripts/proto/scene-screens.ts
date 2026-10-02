/* ─────────────────────────────────────────────────────────────
   原型 · screens 场景首屏（src/pages/mock/scene-screens.astro）
   复制自 hero-quiet.ts（它又复制自 home-storyboard.ts，去掉了开屏大字那一套）。
   这里多做两件一次性的事：
     · 化开的副本：把问句与开屏姿态的线画进画布、按三档模糊各出一张图（--gh1..3），
       屏风里贴着它反向对齐 —— 隔着屏的那几段于是是虚的。只在尺寸 / 字体变化时重画。
     · 屏面颗粒：一张 160² 的静态噪点（--grain）。
   其余同 quiet：场序 pos → 色板；线的姿态插值 → setEegSpine；闪念窗口、晨醒底线。
   静置时没有任何 rAF；离开首屏时给 html 加 .hero-off，屏缝的光停下。
   ───────────────────────────────────────────────────────────── */

import { makeSpine } from '../eeg-wave';
import { setEegSpine } from '../eeg-spine';
import { reducedMotion } from '../lib';

type Pt = [number, number];

const cl = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (t: number) => t * t * (3 - 2 * t);

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

export function initScreensHero() {
  const root = document.documentElement;
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (!scenes.length) return;
  const RM = reducedMotion();
  const mq = matchMedia('(max-width: 760px)');
  const slips = [...document.querySelectorAll<HTMLElement>('[data-c]')].map((el) => ({ el, c: Number(el.dataset.c) }));
  slips.forEach(({ el, c }) => el.style.setProperty('--c', String(c)));

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

  /* 屏面颗粒：一次性的静态噪点 */
  {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 160;
    const ctx = cv.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 255 : 90;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 16;
      }
      ctx.putImageData(img, 0, 0);
      root.style.setProperty('--grain', `url("${cv.toDataURL()}")`);
    }
  }

  /* 化开的副本：问句（逐字按版面位置）＋ 开屏姿态的线，三档模糊各一张。
     字位按 offsetLeft / offsetTop 取（不受入场动画的 transform 影响），竖向按行内框复算基线 */
  const stage = document.querySelector<HTMLElement>('.s-hero .stage');
  const q = document.querySelector<HTMLElement>('.s-hero .q');
  const BLURS = [2.2, 4.5, 8];
  let ghostKey = '';
  const ghostUrls: string[] = [];
  const ghosts = () => {
    if (!stage || !q) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const key = `${W}x${H}|${document.fonts?.status}`;
    if (!W || !H || key === ghostKey) return;
    ghostKey = key;
    const sr = stage.getBoundingClientRect();
    const qr = q.getBoundingClientRect();
    const chars = [...q.querySelectorAll<HTMLElement>('.c')].map((c) => {
      const cs = getComputedStyle(c);
      return {
        ch: c.textContent ?? '',
        x: qr.left - sr.left + c.offsetLeft,
        y: qr.top - sr.top + c.offsetTop,
        w: c.offsetWidth,
        h: c.offsetHeight,
        font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
        color: cs.color,
      };
    });
    const a = (14 * Math.PI) / 180;
    const half = Math.hypot(W, H) / 2 + 60;
    BLURS.forEach((b, k) => {
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.filter = `blur(${b}px)`;
      // 线：隔着屏只剩一道淡芯 —— 越虚越淡（醒梦两面的线色都能落在这道中性暖灰里）
      ctx.beginPath();
      ctx.moveTo(W / 2 - Math.cos(a) * half, H / 2 - Math.sin(a) * half);
      ctx.lineTo(W / 2 + Math.cos(a) * half, H / 2 + Math.sin(a) * half);
      ctx.strokeStyle = `rgba(96, 92, 98, ${(0.34 - k * 0.07).toFixed(2)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      for (const c of chars) {
        ctx.font = c.font;
        ctx.fillStyle = c.color;
        const tm = ctx.measureText(c.ch);
        const asc = tm.fontBoundingBoxAscent;
        const desc = tm.fontBoundingBoxDescent;
        ctx.fillText(c.ch, c.x + c.w / 2, c.y + (c.h - asc - desc) / 2 + asc);
      }
      cv.toBlob((blob) => {
        if (!blob || ghostKey !== key) return;
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        img
          .decode()
          .then(() => {
            if (ghostKey !== key) return URL.revokeObjectURL(url);
            const old = ghostUrls[k];
            ghostUrls[k] = url;
            root.style.setProperty(`--gh${k + 1}`, `url("${url}")`);
            if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
          })
          .catch(() => URL.revokeObjectURL(url));
      });
    });
  };

  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    geo = scenes.map((el) => ({ el, top: el.offsetTop, h: el.offsetHeight }));
    applyWindows();
    buildPoses();
    ghosts();
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
    for (const s of slips) {
      const ad = Math.abs(ps[3] - s.c);
      s.el.classList.toggle('on', s.el.classList.contains('on') ? ad < winFull + 0.04 : ad < winFull);
    }
    dawnDot = cl((pos - 4.2) / 0.3);
    const off = pos > 1.02;
    if (off !== root.classList.contains('hero-off')) root.classList.toggle('hero-off', off);
  }

  /* 入场：揭幕（html.booted）后线从中心往两端画出 —— 只有这 1.3s 满帧出帧 */
  let t0 = -1;
  const onBooted = () => {
    if (t0 < 0) t0 = performance.now();
    kick();
  };
  if (root.classList.contains('booted')) onBooted();
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
