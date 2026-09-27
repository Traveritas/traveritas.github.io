/* ─────────────────────────────────────────────────────────────
   光标 · 星环（定稿：design/mocks/cursor-J-star-rings.html）
   · 星 1:1 同帧写在指针上（热点零延迟）；三道环各挂一根二维欠阻尼弹簧，
     内快外慢，离星软上限 4 / 7 / 10px（tanh）——移动时依次被甩开，
     停下后一圈圈归位，星永远在内环里。环的自转与梦态轨道全在 CSS。
   · 逐帧只写 transform / opacity；rAF 由事件唤醒、收敛即停；
     静息交给 CSS 自转与微烁，will-change 归 auto。

   门控（任一不满足 → 系统指针，本层不显示）：
     ① 最近一次指针事件 pointerType === 'mouse'（运行时读，不看媒体查询）
     ② 未开启减弱动效   ③ 非强制颜色模式
     ④ localStorage['xm-cursor-native'] !== '1'（页脚「原生指针」开关写入）
   ───────────────────────────────────────────────────────────── */

const NATIVE_KEY = 'xm-cursor-native';

/* 每环：弹簧角频率 ω（内快外慢）、离星软上限 cap（px，硬上限 ×1.6）、滚动带动增益 */
const RING = [
  { w: 26, cap: 4, scroll: 5 },
  { w: 19, cap: 7, scroll: 8 },
  { w: 14, cap: 10, scroll: 11 },
];

type Kind = '' | 'link' | 'text' | 'input' | 'drag';
type State = 'rest' | Kind | 'click' | 'hold' | 'latch';
type Pair = [number, number]; // [当前, 目标]

interface Ring {
  w: number;
  cap: number;
  scroll: number;
  el: HTMLElement;
  p: { x: number; y: number };
  v: { x: number; y: number };
  sx: Pair;
  sy: Pair;
  op: Pair;
}

function readNative(): boolean {
  try {
    return localStorage.getItem(NATIVE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 指数趋近；够近就吸附到目标并返回 false（不再忙） */
function ease(pair: Pair, target: number, k: number, eps: number): boolean {
  pair[1] = target;
  pair[0] += (target - pair[0]) * k;
  if (Math.abs(target - pair[0]) > eps) return true;
  pair[0] = target;
  return false;
}

export function initCursor() {
  const slot = document.getElementById('cursor-slot');
  const star = document.getElementById('star');
  const knot = document.getElementById('s-knot');
  const twinkle = document.getElementById('star-twinkle');
  const ringEls = [...document.querySelectorAll<HTMLElement>('.cursor-slot [data-ring]')];
  if (!slot || !star || !knot || !twinkle || ringEls.length !== RING.length) return;

  const root = document.documentElement;
  const body = document.body;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqForced = matchMedia('(forced-colors: active)');

  /* ── 门控 ─────────────────────────────────────────────── */
  let lastType = '';
  let native = readNative();
  const gateOpen = () =>
    lastType === 'mouse' && !mqReduce.matches && !mqForced.matches && !native;
  const syncGate = () => root.classList.toggle('fx-cursor-on', gateOpen());
  mqReduce.addEventListener('change', syncGate);
  mqForced.addEventListener('change', syncGate);

  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-cursor-toggle]');
  const syncToggles = () =>
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(native)));
  syncToggles();
  toggles.forEach((b) =>
    b.addEventListener('click', () => {
      native = !native;
      try {
        localStorage.setItem(NATIVE_KEY, native ? '1' : '0');
      } catch {
        /* 隐私模式下只在本页生效 */
      }
      syncToggles();
      syncGate();
    }),
  );

  // 指针离开文档 / 页面隐藏 → 淡出
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) root.classList.add('fx-cursor-out');
  });
  document.addEventListener('mouseover', () => root.classList.remove('fx-cursor-out'));
  document.addEventListener('visibilitychange', () =>
    root.classList.toggle('fx-cursor-out', document.hidden),
  );

  /* ── 状态 ─────────────────────────────────────────────── */
  const now = () => performance.now();
  const isDream = () => body.dataset.reality === 'dream';
  const f3 = (v: number) => Math.round(v * 1000) / 1000;

  const ptr = { x: -200, y: -200 };
  let seen = false;
  const rings: Ring[] = RING.map((c, i) => ({
    ...c,
    el: ringEls[i],
    p: { x: -200, y: -200 },
    v: { x: 0, y: 0 },
    sx: [1, 1],
    sy: [1, 1],
    op: [1, 1],
  }));
  const S = { ss: [1, 1] as Pair, sop: [1, 1] as Pair, srot: [0, 0] as Pair, kop: [0, 0] as Pair };
  let kind: Kind = '';
  let linkC: { x: number; y: number } | null = null;
  let holding = false;
  let holdT0 = 0;
  let holdDur = 2200;
  let clickT0 = -1e9;
  let latchT0 = -1e9;
  let face = body.dataset.reality;
  let live = false;
  let rafId = 0;
  let lastT = 0;
  let lastSY = scrollY;

  const setLive = (b: boolean) => {
    if (live === b) return;
    live = b;
    slot.classList.toggle('is-live', b);
  };
  const wake = () => {
    if (!root.classList.contains('fx-cursor-on')) return;
    setLive(true);
    if (!rafId) {
      lastT = 0;
      rafId = requestAnimationFrame(loop);
    }
  };

  function state(t: number): State {
    if (t - latchT0 < 720) return 'latch';
    if (holding) return 'hold';
    if (t - clickT0 < 420) return 'click';
    if (kind) return kind;
    return 'rest';
  }

  function targets(st: State, t: number) {
    const T = {
      ss: 1,
      sop: 1,
      srot: 0,
      kop: 0,
      r: RING.map(() => ({ sx: 1, sy: 1, op: 1 })),
    };
    if (st === 'link') {
      // 三环依次张开一点
      T.ss = 1.18;
      T.r.forEach((r, i) => (r.sx = r.sy = 1.16 + i * 0.05));
    } else if (st === 'text' || st === 'input') {
      // 让字：内环收成一道竖线（插入位置），外两环收拢隐去，星敛小
      T.ss = 0.55;
      T.sop = 0.85;
      T.r[0].sx = 0.07;
      T.r[0].sy = st === 'input' ? 0.8 : 0.95;
      T.r[0].op = 0.9;
      for (let i = 1; i < T.r.length; i++) {
        T.r[i].sx = T.r[i].sy = 0.55;
        T.r[i].op = 0;
      }
    } else if (st === 'drag') {
      T.srot = 45;
      T.r.forEach((r) => {
        r.sx = 1.1;
        r.sy = 0.9;
      });
    } else if (st === 'hold') {
      const p = Math.min((t - holdT0) / holdDur, 1);
      const e = p * p * (3 - 2 * p);
      T.ss = 1 + 0.3 * e;
      T.srot = 180 * e; // 星转过半圈，回到原朝向时凝成结
      const K = [0.36, 0.5, 0.6]; // 外环收得更多：一圈圈拢向星
      T.r.forEach((r, i) => (r.sx = r.sy = 1 - K[i] * Math.pow(p, 1.2)));
    } else if (st === 'latch') {
      // 成结：星填成 ◆，三环一齐向外化开（环闪），随后从外面重新收回
      T.ss = 1.15;
      T.sop = 0;
      T.kop = 1;
      T.r.forEach((r, i) => {
        r.sx = r.sy = 1.5 + i * 0.22;
        r.op = 0;
      });
    }
    return T;
  }

  const place = (el: HTMLElement, x: number, y: number, extra = '') => {
    el.style.transform = `translate3d(${f3(x)}px,${f3(y)}px,0)${extra}`;
  };

  function writeStar() {
    let pulse = 1;
    const pc = (now() - clickT0) / 360;
    if (pc >= 0 && pc < 1) pulse = 1 - 0.34 * Math.exp(-pc * 4.5) * Math.cos(pc * 9.5);
    place(star!, ptr.x, ptr.y, ` rotate(${f3(S.srot[0])}deg) scale(${f3(S.ss[0] * pulse)})`);
  }

  function loop(t: number) {
    rafId = 0;
    const dt = lastT ? Math.min((t - lastT) / 1000, 1 / 30) : 1 / 60;
    lastT = t;
    const tn = now();
    const st = state(tn);
    const dream = isDream();
    const T = targets(st, tn);
    let busy = false;

    // 1 · 星
    let tau = st === 'latch' || st === 'click' ? 0.05 : st === 'hold' ? 0.06 : dream ? 0.13 : 0.09;
    let k = 1 - Math.exp(-dt / tau);
    busy = ease(S.ss, T.ss, k, 0.002) || busy;
    busy = ease(S.sop, T.sop, k, 0.002) || busy;
    busy = ease(S.srot, T.srot, k, 0.05) || busy;
    busy = ease(S.kop, T.kop, k, 0.002) || busy;
    writeStar();
    twinkle!.style.opacity = String(f3(S.sop[0]));
    knot!.style.opacity = String(f3(S.kop[0]));

    // 2 · 环心目标：星 +（链接上）向链接中心轻吸附 ≤ 6px
    let tx = ptr.x;
    let ty = ptr.y;
    if (kind === 'link' && linkC) {
      const ox = linkC.x - ptr.x;
      const oy = linkC.y - ptr.y;
      const od = Math.hypot(ox, oy);
      if (od > 0.01) {
        const sn = Math.min(od * 0.2, 6);
        tx += (ox / od) * sn;
        ty += (oy / od) * sn;
      }
    }

    // 3 · 三环：弹簧 + 状态缩放；成结外扩要快，收回慢一点，像光圈重新聚拢
    const z = dream ? 0.5 : 0.62;
    tau = st === 'latch' ? 0.07 : tn - latchT0 < 1400 ? 0.16 : st === 'hold' ? 0.06 : dream ? 0.13 : 0.09;
    k = 1 - Math.exp(-dt / tau);
    rings.forEach((R, i) => {
      const w = st === 'latch' || st === 'click' ? R.w * 1.3 : R.w;
      for (let j = 0; j < 2; j++) {
        const h = dt / 2;
        R.v.x += (w * w * (tx - R.p.x) - 2 * z * w * R.v.x) * h;
        R.v.y += (w * w * (ty - R.p.y) - 2 * z * w * R.v.y) * h;
        R.p.x += R.v.x * h;
        R.p.y += R.v.y * h;
      }
      let dx = R.p.x - ptr.x;
      let dy = R.p.y - ptr.y;
      let m = Math.hypot(dx, dy);
      const hard = R.cap * 1.6;
      if (m > hard) {
        // 硬上限：拉回圆周，去掉向外的径向速度
        const ux = dx / m;
        const uy = dy / m;
        R.p.x = ptr.x + ux * hard;
        R.p.y = ptr.y + uy * hard;
        const vr = R.v.x * ux + R.v.y * uy;
        if (vr > 0) {
          R.v.x -= vr * ux;
          R.v.y -= vr * uy;
        }
        dx = R.p.x - ptr.x;
        dy = R.p.y - ptr.y;
        m = hard;
      }
      const has = m > 1e-4;
      const mEff = has ? R.cap * Math.tanh(m / R.cap) : 0;
      const rx = ptr.x + (has ? (dx / m) * mEff : 0);
      const ry = ptr.y + (has ? (dy / m) * mEff : 0);

      busy = ease(R.sx, T.r[i].sx, k, 0.002) || busy;
      busy = ease(R.sy, T.r[i].sy, k, 0.002) || busy;
      busy = ease(R.op, T.r[i].op, k, 0.004) || busy;

      // 点按：由内向外错开 45ms 依次一缩一回
      let pulse = 1;
      const pc = (tn - clickT0 - i * 45) / 380;
      if (pc >= 0 && pc < 1) pulse = 1 - 0.16 * Math.exp(-pc * 5) * Math.cos(pc * 11);

      place(R.el, rx, ry, ` scale(${f3(R.sx[0] * pulse)},${f3(R.sy[0] * pulse)})`);
      R.el.style.opacity = String(f3(R.op[0]));

      // 收敛看的是环心离「目标」多远（链接上目标带吸附偏移），不是离指针
      if (Math.hypot(R.p.x - tx, R.p.y - ty) > 0.04 || Math.hypot(R.v.x, R.v.y) > 0.4) busy = true;
    });

    // 4 · 收敛即停
    if (busy || holding || st === 'latch' || st === 'click') {
      rafId = requestAnimationFrame(loop);
    } else {
      rings.forEach((R) => (R.v.x = R.v.y = 0));
      setLive(false);
    }
  }

  /* ── 事件 ─────────────────────────────────────────────── */
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === lastType) return;
    lastType = e.pointerType;
    syncGate();
  };
  document.addEventListener('pointerdown', onPointer, { passive: true, capture: true });

  document.addEventListener(
    'pointermove',
    (e) => {
      onPointer(e);
      if (e.pointerType !== 'mouse') return;
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (!seen) {
        seen = true;
        rings.forEach((R) => {
          R.p.x = ptr.x;
          R.p.y = ptr.y;
        });
      }
      writeStar(); // 热点同帧
      wake();
    },
    { passive: true },
  );

  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target as Element | null;
      if (!el || el.nodeType !== 1) return;
      linkC = null;
      if (el.closest('[draggable="true"], [data-drag]')) kind = 'drag';
      else if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
        kind = 'input';
      else {
        const a = el.closest('a, button, summary, label[for], [role="button"]');
        if (a) {
          kind = 'link';
          const r = a.getBoundingClientRect(); // 仅在进入时取一次，非逐帧
          linkC = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        } else if (el.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, pre, code, dd, dt, td, th'))
          kind = 'text';
        else kind = '';
      }
      wake();
    },
    { passive: true },
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      clickT0 = now();
      wake();
    },
    { passive: true },
  );

  // 滚动：环像被页面带了一下（外环带得多），各自弹回；链接中心作废
  addEventListener(
    'scroll',
    () => {
      const d = Math.max(-40, Math.min(40, scrollY - lastSY));
      lastSY = scrollY;
      if (!seen) return;
      linkC = null;
      rings.forEach((R) => (R.v.y -= d * R.scroll));
      wake();
    },
    { passive: true },
  );

  // 长按 / 闩锁：读 reality.ts 写在 body 上的 .reality-holding 与 data-reality
  new MutationObserver(() => {
    const h = body.classList.contains('reality-holding');
    const f = body.dataset.reality;
    if (f !== face) {
      face = f;
      if (holding || h) {
        latchT0 = now();
        S.srot[0] -= 180; // 转过的半圈与静止朝向同形，悄悄归零
      }
    }
    if (h !== holding) {
      holding = h;
      if (h) {
        holdT0 = now();
        holdDur = isDream() ? 2200 : 1300; // 同 reality.ts 的 T_GO / T_BACK
      }
    }
    wake();
  }).observe(body, { attributes: true, attributeFilter: ['class', 'data-reality'] });
}
