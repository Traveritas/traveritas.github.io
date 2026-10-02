/* ─────────────────────────────────────────────────────────────
   原型 develop · 主页故事板脚本（由 home-storyboard.ts 复制改出）
   与原版的差别只在开屏：
     · 去掉「膜」—— 不再逐帧按主波裁切醒 / 梦两字，开屏没有 30fps 的 rAF 节拍；
     · 字形遮罩（--gl-mask）画一次就静止，字里的光带全是 CSS transform 动画，
       主线程静置时零样式写入；
     · 开屏滚走后切 html.hero-off，让光带停下。
   其余（色板 / 线的姿态 / 闪念窗口 / 晨醒底线）照旧。
   ───────────────────────────────────────────────────────────── */

import { makeSpine, type Spine } from '../eeg-wave';
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

/* ── 线的五个姿态（视口 0..1）：开屏 = 过中心的 14° 直线（运行时按像素生成），
   断章 / 造物靠左、闪念居中的轻微弯曲竖线，晨醒从左上垂下拐成横底线 ── */
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
/* pos → 姿态序号：相邻姿态在两幕交界处插值 */
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

export function initStoryboard() {
  const root = document.documentElement;
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (!scenes.length) return;
  const RM = reducedMotion();
  const mq = matchMedia('(max-width: 760px)');
  const glyphBoxes = [...document.querySelectorAll<HTMLElement>('.gw')];
  const slips = [...document.querySelectorAll<HTMLElement>('[data-c]')].map((el) => ({ el, c: Number(el.dataset.c) }));
  slips.forEach(({ el, c }) => el.style.setProperty('--c', String(c)));

  /* 便签的窗口半宽（--w0 全显 / --w1 散尽）：桌面的写在 data-w0 / data-w1，
     窄屏一组在 data-w0m / data-w1m（见 index.astro 的 W0 / W1 / W0M / W1M），
     这里按屏宽挑一组写进幕上。全显半宽同时是涟漪与指针的点亮界（updateScroll 用）。 */
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

  /* 问句逐字（入场时一字一字从线下垂落） */
  const heroLine = document.getElementById('hero-line');
  if (heroLine) {
    let i = 0;
    const walk = (node: Node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const f = document.createDocumentFragment();
          for (const ch of n.textContent ?? '') {
            const c = document.createElement('span');
            c.className = 'c';
            c.style.setProperty('--i', String(i++));
            c.textContent = ch;
            f.append(c);
          }
          n.parentNode?.replaceChild(f, n);
        } else if (n.nodeType === 1 && (n as Element).tagName !== 'BR') walk(n);
      }
    };
    walk(heroLine);
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
  let heroOff = false;

  /* 字形遮罩：把 .lt 的字画进画布一次，当 .lm 的静止遮罩。
     竖向位置按行高 1 的行内框复算：基线 ＝ 半行距 ＋ 字体上沿 */
  const glyphMasks = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const box of glyphBoxes) {
      const src = box.querySelector<HTMLElement>('.lt');
      const el = box.querySelector<HTMLElement>('.lm');
      if (!src || !el) continue;
      const w = src.clientWidth;
      const h = src.clientHeight;
      if (!w || !h) continue;
      const cs = getComputedStyle(src);
      // 尺寸与字体没变就沿用已有遮罩
      const key = `${w}x${h}@${dpr}|${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}|${document.fonts?.status}`;
      if (el.dataset.maskKey === key) continue;
      el.dataset.maskKey = key;
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const ch = src.textContent ?? '';
      const tm = ctx.measureText(ch);
      const asc = tm.fontBoundingBoxAscent;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
      ctx.fillText(ch, w / 2, (lh - asc - tm.fontBoundingBoxDescent) / 2 + asc);
      cv.toBlob((blob) => {
        if (!blob || el.dataset.maskKey !== key) return;
        const url = URL.createObjectURL(blob);
        // 先解码再挂上：遮罩图未就绪时合成层会把整层遮空
        const img = new Image();
        img.src = url;
        img
          .decode()
          .then(() => {
            if (el.dataset.maskKey !== key) return URL.revokeObjectURL(url);
            const old = el.dataset.mask;
            el.dataset.mask = url;
            el.style.setProperty('--gl-mask', `url("${url}")`);
            el.classList.add('mk');
            if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
          })
          .catch(() => {
            URL.revokeObjectURL(url);
            delete el.dataset.maskKey;
          });
      });
    }
  };

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
    glyphMasks();
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
    /* 便签：只有「全部显影」的那一段才点亮（涟漪与指针）。松开时留一点回滞 ——
       在边界上来回滚一点，涟漪不会被打成连发 */
    for (const s of slips) {
      const ad = Math.abs(ps[3] - s.c);
      s.el.classList.toggle('on', s.el.classList.contains('on') ? ad < winFull + 0.04 : ad < winFull);
    }
    dawnDot = cl((pos - 4.2) / 0.3);
    const off = pos > 1.05;
    if (off !== heroOff) root.classList.toggle('hero-off', (heroOff = off));
  }

  /* 入场：揭幕（html.booted）后线从中心往两端画出 */
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

  /* 骨架只随滚动 / 尺寸变 */
  let xy = new Float32Array(0);
  let sp: Spine | null = null;

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
    // 同一姿态、同一入场进度、同一明暗就不再发（Worker 端自己在流动）
    const key = `${pos.toFixed(4)}|${lift.toFixed(1)}|${reveal.toFixed(3)}|${dark.toFixed(3)}|${vw}x${vh}`;
    if (key !== lastSent) {
      lastSent = key;
      setEegSpine({ xy, dark, reveal, dot: dawnDot > 0 ? [dotF, dawnDot] : null });
    }
    if (pos > 3.9) {
      // 晨醒标题 / 出口按底线对齐（底线随舞台滚走时文字已随舞台走，这里补回 lift）
      const L = sp.L;
      const s = sp.len * 0.72;
      let j = 1;
      while (j < L.length - 1 && L[j] < s) j++;
      root.style.setProperty('--base', `${(sp.xy[2 * j + 1] + lift).toFixed(1)}px`);
    }
    // 只有入场画线时连续要帧；之后等下一次滚动
    if (reveal < 1 && t0 >= 0) raf = requestAnimationFrame(frame);
  }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', measure);
  mq.addEventListener('change', measure);
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  measure();
}
