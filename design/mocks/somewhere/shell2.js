/* ─────────────────────────────────────────────────────────────
 somewhere · r 组底子：一片流光，一套色，往下沉

 和 shell.js（A–E 那一轮）的区别，就一句话：**不把三种颜色摊成三条带**。
 那一轮把「三栏」一路带进了目的地，于是每个场景底下都横着三道色——那是把片子的语法
 误当成了场地。这里只有一套色：同一片流光，从头到尾没变过。

 转场也不再是「缝收拢、转 90°」。下沉就只是下沉：镜头从房间上方落进去，
 流光整片跟着往上淌（你下去，它上来），房间从远处一点点涨大、最后把你包住。
 没有分栏，没有劈开，没有第二套色。

 底色与抖动仍取自正式站那支着色器（light.js 是本仓库 src/scripts/wander/light.js 的副本）。
 ───────────────────────────────────────────────────────────── */
import { createLight, DREAM, WAKE, GRAIN } from './light.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const outQuart = (p) => 1 - (1 - p) ** 4;
export const inOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return a / 4294967296;
  };
}

/* 一套色写进三个槽位（三个槽填同一份，于是分区这件事在这里不存在）。 */
function applyTheme(theme, grain, face) {
  const slots = ['essay', 'moment', 'project'];
  const desat = (c, k) => {
    const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return c.map((v) => clamp(v + (g - v) * k, 0, 1));
  };
  slots.forEach((s) => {
    DREAM[s] = theme.map((c) => c.slice());
    WAKE[s] = theme.map((c) => desat(c, 0.55 + face * 0.2).map((v) => clamp(v * 1.04, 0, 1)));
    GRAIN[s] = (grain || [0.85, 0.3, 28]).slice();
  });
}

const OFF = 1e6; // 缝推到视口外：整屏只有一个区

export function initFlow(opts) {
  const { canvas, theme, grain = null, face = 0, px = 5, autoArrive = false, dur = 2600 } = opts;

  applyTheme(theme, grain, face);
  const light = createLight(canvas, px, { wind: false });
  const root = document.documentElement;
  root.dataset.somewhere = 'on';

  let vw = innerWidth;
  let vh = innerHeight;

  const pointer = { x: vw / 2, y: vh / 2, nx: 0, ny: 0, inside: false, down: false };
  /* 背景平移的弹簧（与正式站同一支：ω 2.2、ζ 0.9，起步慢、停得晚） */
  const pan = { x: 0, y: 0 };
  /* 下沉：镜头往下落，流光就往上淌。1 = 完全进去了 */
  let sink = 0;

  let arriveT = -1;
  const begin = () => {
    if (arriveT >= 0) return;
    arriveT = performance.now();
    root.dataset.arrived = 'go';
  };
  if (autoArrive === true) setTimeout(begin, 0);
  else if (typeof autoArrive === 'number') setTimeout(begin, autoArrive);

  let pendingPull = 0;
  addEventListener(
    'wheel',
    (e) => {
      if (e.target.closest('[data-scroll]')) return;
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      if (arriveT < 0) {
        if (dy > 0) {
          pendingPull += dy;
          if (pendingPull > 56) begin();
        }
      }
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (arriveT >= 0) return;
    if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      begin();
    }
  });
  /* 触屏：在画面中间往上划 */
  let touchY = null;
  addEventListener(
    'pointerdown',
    (e) => {
      pointer.down = true;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (arriveT < 0 && e.pointerType === 'touch') touchY = e.clientY;
    },
    { passive: true },
  );
  addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.nx = (e.clientX / vw) * 2 - 1;
      pointer.ny = (e.clientY / vh) * 2 - 1;
      pointer.inside = true;
      if (touchY !== null && arriveT < 0 && touchY - e.clientY > 50) begin();
    },
    { passive: true },
  );
  addEventListener('pointerup', () => {
    pointer.down = false;
    touchY = null;
  });
  addEventListener('pointerleave', () => {
    pointer.inside = false;
    pointer.down = false;
  });
  addEventListener('resize', () => {
    vw = innerWidth;
    vh = innerHeight;
    light?.resize();
  });

  const hooks = [];
  let last = performance.now();
  const clockStart = last;
  let frame = 0;
  let arrive = 0;
  let bgY = 0;
  let bgV = 0;

  function tick(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    const t = (ts - clockStart) / 1000;
    frame++;

    arrive = arriveT < 0 ? 0 : clamp((ts - arriveT) / dur, 0, 1);
    if (arrive >= 1) root.dataset.arrived = 'done';
    /* 下沉曲线：前四成几乎不动（还在外面），中段落得最快，末段收住 */
    sink = inOutSine(clamp((arrive - 0.08) / 0.78, 0, 1));

    /* 流光的平移：落得越快，光往上淌得越快（你要下去，它要上来）。
       弹簧追一个一直往下走的靶子，于是「淌」是连续速度，不是位移。 */
    const target = sink * 2.4;
    const k = 30;
    const c = 2 * 0.92 * Math.sqrt(k);
    bgV += (k * (target - bgY) - c * bgV) * dt;
    bgY += bgV * dt;
    pan.x = pointer.inside ? (pointer.nx * 0.03) : 0;
    pan.y = -bgY * 0.5;

    const s = { t, dt, frame, vw, vh, arrive, sink, pointer, root, light };
    for (const h of hooks) h(s);

    if (light) {
      light.draw({
        t,
        pan,
        zoom: 0.35 + sink * 0.25,
        mouse: { x: pointer.x, y: pointer.y },
        dim: 0,
        seam: { p: [[-OFF, -OFF], [-OFF, -OFF]], n: [0, 1] },
        split: 1,
        bias: [0, 0, 0],
        lift: [0, 0, 0],
        ring: null,
        face,
        grain: null,
      });
    }
    requestAnimationFrame(tick);
  }

  return {
    pointer,
    begin,
    onFrame: (fn) => {
      hooks.push(fn);
    },
    start: () => requestAnimationFrame(tick),
    get vw() {
      return vw;
    },
    get vh() {
      return vh;
    },
    get arrived() {
      return arriveT >= 0;
    },
  };
}

export function options() {
  const q = new URLSearchParams(location.search);
  const a = q.get('arrive');
  return {
    autoArrive: q.has('arrive') ? (a ? Number(a) : true) : false,
    face: q.get('face') === 'wake' ? 1 : 0,
    px: q.has('px') ? +q.get('px') : 5,
  };
}
