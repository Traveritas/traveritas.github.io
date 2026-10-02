/* ─────────────────────────────────────────────────────────────
   原型 · hero-lily（/mock/hero-lily/）—— home-storyboard.ts 的副本，只换开屏。
   开屏：醒 / 梦两字是两扇窗（字形遮罩），窗里是同一片抽象百合：
     醒字里是冷色细线稿，梦字里是融开的暖粉光斑。
   与原版的差别（性能）：
     · 去掉膜的逐帧 clip-path 切口与波纹贴图；开屏不再有 30fps 的 rAF 节拍；
     · 字形遮罩与花田位图只在初始化 / 尺寸或字体变化时画一次；
     · 漂移全是 CSS transform 动画（合成层），静置时主线程零写入。
   其余（色板、线的姿态、闪念窗口、晨醒底线）与原版逐字一致。
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
/* ── 花田：同一组百合几何出两张图 —— 线稿（醒）与光斑（梦） ── */
type Lily = { x: number; y: number; s: number; rot: number; tilt: number; petals: [number, number, number, number][] };

function lilyField(seed: number): { lilies: Lily[]; stems: string[] } {
  let sd = seed;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  // 坐标在 0..1000 的方框里；大小错落、不成网格，留出空处
  const spots: [number, number, number][] = [
    [250, 250, 1.2], [560, 200, 0.75], [800, 300, 1.0], [420, 470, 1.4], [700, 560, 0.9], [210, 620, 1.0],
    [520, 760, 1.25], [820, 800, 0.7], [300, 880, 0.6], [110, 360, 0.55], [640, 380, 0.5],
  ];
  const lilies: Lily[] = spots.map(([x, y, s]) => {
    const k = 5 + Math.floor(rnd() * 2);
    const rot0 = rnd() * 60;
    const petals: [number, number, number, number][] = [];
    for (let i = 0; i < k; i++) {
      petals.push([rot0 + (i * 360) / k + (rnd() - 0.5) * 24, 60 + rnd() * 34, 20 + rnd() * 12, (rnd() - 0.5) * 26]);
    }
    return { x: x + (rnd() - 0.5) * 40, y: y + (rnd() - 0.5) * 40, s: s * 1.75, rot: rnd() * 360, tilt: 0.55 + rnd() * 0.45, petals };
  });
  // 几根细茎从下缘伸上来，接到部分花的花心
  const stems = lilies
    .filter((_, i) => i % 2 === 0)
    .map((l) => {
      const bx = l.x + (rnd() - 0.5) * 160;
      return `M${bx.toFixed(0)} 1060 C ${(bx + (rnd() - 0.5) * 120).toFixed(0)} ${(l.y + 300).toFixed(0)}, ${(l.x + (rnd() - 0.5) * 80).toFixed(0)} ${(l.y + 140).toFixed(0)}, ${l.x.toFixed(0)} ${l.y.toFixed(0)}`;
    });
  return { lilies, stems };
}

const petalPath = ([a, L, w, bend]: [number, number, number, number]) =>
  `<path transform="rotate(${a.toFixed(1)})" d="M0 0 C ${w * 0.9} ${-L * 0.18}, ${w * 0.85 + bend * 0.4} ${-L * 0.62}, ${bend * 1.25} ${-L} C ${-w * 0.45 + bend * 0.6} ${-L * 0.7}, ${-w} ${-L * 0.36}, 0 0Z"/>`;

const lilyG = (l: Lily, inner: (l: Lily) => string) =>
  `<g transform="translate(${l.x.toFixed(0)} ${l.y.toFixed(0)}) rotate(${l.rot.toFixed(0)}) scale(${l.s.toFixed(2)} ${(l.s * l.tilt).toFixed(2)})">${inner(l)}</g>`;

/** 醒：冷色细线稿（花瓣轮廓 + 中脉 + 几根花蕊），线宽不随缩放 */
function svgLines(f: ReturnType<typeof lilyField>, px: number) {
  const sw = Math.max(0.9, px / 520);
  const body = (l: Lily) =>
    l.petals.map(petalPath).join('') +
    l.petals.map(([a, L, , b]) => `<path transform="rotate(${a.toFixed(1)})" d="M0 -6 Q ${b * 0.5} ${-L * 0.5} ${b} ${-L * 0.82}" opacity=".5"/>`).join('') +
    [0.2, 1.4, 2.5, 3.9, 5.1].map((t) => `<path d="M0 0 L ${(Math.cos(t) * 30).toFixed(1)} ${(Math.sin(t) * 30).toFixed(1)}" opacity=".7"/><circle cx="${(Math.cos(t) * 32).toFixed(1)}" cy="${(Math.sin(t) * 32).toFixed(1)}" r="1.6" fill="#55657d" stroke="none"/>`).join('');
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${px}' height='${px}' viewBox='0 0 1000 1000'><defs><radialGradient id='w' cx='.4' cy='.35' r='.75'><stop offset='0' stop-color='#dfe6f0'/><stop offset='1' stop-color='#b7c3d4'/></radialGradient></defs><rect width='1000' height='1000' fill='url(#w)' opacity='.45'/><g fill='none' stroke='#4d5c73' stroke-width='${sw}' vector-effect='non-scaling-stroke' stroke-linecap='round' stroke-linejoin='round'>${f.stems.map((d) => `<path d='${d}' opacity='.55'/>`).join('')}${f.lilies.map((l) => lilyG(l, body)).join('').replace(/<path /g, "<path vector-effect='non-scaling-stroke' ")}</g></svg>`;
}

/** 梦：同一片花融成暖粉光斑（高斯模糊烘在位图里，只栅格化一次） */
function svgBloom(f: ReturnType<typeof lilyField>, px: number) {
  const body = (l: Lily) => l.petals.map(petalPath).join('') + `<circle r="14" fill="#e3b06a" opacity=".9"/>`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${px}' height='${px}' viewBox='0 0 1000 1000'><defs><radialGradient id='g' cx='.5' cy='.62' r='.6'><stop offset='0' stop-color='#f2d6c8'/><stop offset='.55' stop-color='#dca6a0'/><stop offset='1' stop-color='#b98aa6'/></radialGradient><filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='9'/></filter></defs><rect width='1000' height='1000' fill='url(#g)' opacity='.38'/><g filter='url(#b)'><g fill='none' stroke='#d7a99a' stroke-width='14' opacity='.45'>${f.stems.map((d) => `<path d='${d}'/>`).join('')}</g><g fill='#c98a8f' fill-opacity='.42'>${f.lilies.map((l) => lilyG(l, body)).join('')}</g></g></svg>`;
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;


export function initStoryboard() {
  const root = document.documentElement;
  const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
  if (!scenes.length) return;
  const RM = reducedMotion();
  const mq = matchMedia('(max-width: 760px)');
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

  /* 窗：字形遮罩（--gm）+ 花田位图（--fl）。只在尺寸 / 字体变了时重画 */
  const windows = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const box of document.querySelectorAll<HTMLElement>('.gw')) {
      const sil = box.querySelector<HTMLElement>('.sil');
      const fl = box.querySelector<HTMLElement>('.fl');
      if (!sil || !fl) continue;
      const w = sil.clientWidth;
      const h = sil.clientHeight;
      if (!w || !h) continue;
      const cs = getComputedStyle(sil);
      const key = `${w}x${h}@${dpr}|${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}|${document.fonts?.status}`;
      if (box.dataset.maskKey === key) continue;
      box.dataset.maskKey = key;
      // 花田：比窗大一圈，漂移时边缘不露
      const px = Math.round(fl.clientWidth || w * 1.4);
      const field = lilyField(4231);
      fl.style.setProperty('--fl', svgUrl(box.classList.contains('gw-wake') ? svgLines(field, px) : svgBloom(field, px)));
      // 字形遮罩：竖向位置按行高 1 的行内框复算（基线 ＝ 半行距 ＋ 字体上沿）
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const ch = sil.textContent ?? '';
      const tm = ctx.measureText(ch);
      const asc = tm.fontBoundingBoxAscent;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
      ctx.fillText(ch, w / 2, (lh - asc - tm.fontBoundingBoxDescent) / 2 + asc);
      cv.toBlob((blob) => {
        if (!blob || box.dataset.maskKey !== key) return;
        const url = URL.createObjectURL(blob);
        // 先解码再挂上：遮罩图未就绪时合成层会把整层遮空
        const img = new Image();
        img.src = url;
        img
          .decode()
          .then(() => {
            if (box.dataset.maskKey !== key) return URL.revokeObjectURL(url);
            const old = box.dataset.mask;
            box.dataset.mask = url;
            box.style.setProperty('--gm', `url("${url}")`);
            box.classList.add('mk');
            if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
          })
          .catch(() => {
            URL.revokeObjectURL(url);
            delete box.dataset.maskKey;
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
    windows();
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
    // 只有入场画出时连续要帧；之后完全静止，等下一次滚动（开屏的字不再跟波走）
    if (reveal < 1 && t0 >= 0) raf = requestAnimationFrame(frame);
  }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', measure);
  mq.addEventListener('change', measure);
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  measure();
}
