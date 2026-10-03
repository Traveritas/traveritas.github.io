/* ─────────────────────────────────────────────────────────────
   主页首屏 · 千层纸视差（p11-a-paperstack 落地版）
   · 首屏是一叠悬浮的纸：墙(幽灵描边) → 底纸 → 醒字纸 →
     梦字叶 → [固定的 14° 发丝线 chrome —— 全局 Seam/Eeg，
     不在此表、不动] → 宣言手记 → 前景丝线。纵深即排版。
   · 发丝线语义（设计决定）：贯穿全页的 14° 大斜线是固定背景
     chrome，无视差、无倾斜、无入幕、无散开——线画在梦叶
     纸面上（负 z 纸壳沉到线之下），又被手记与全部文字压住；
     任何指针/滚动状态下线位像素恒定。
   · 每平面 transform 自带 perspective(1600px)（不套公共
     wrapper——纸壳要靠自身负 z-index 沉到全局发丝线之下，
     祖先不能产生层叠上下文）。
   · 指针：nx,ny∈[−1,1]，rAF+lerp（帧率补偿），近层快远层慢、
     远墙反向；离开 3.5s 缓归静止构图。触屏：±0.3 陀螺仪微摆。
   · 入幕：html.booted（开屏调频揭幕）后由远及近 ~1.9s 逐层
     落定；reduced-motion 直接落定。无 JS：CSS 静止即完整构图。
   ───────────────────────────────────────────────────────────── */

import { reducedMotion } from './lib';

interface PlaneConf {
  /** 指针到边时横移 px（负 = 与近层反向） */
  rate: number;
  /** 纵向视差系数 */
  vr: number;
  /** rotateX/Y 上限（deg） */
  tilt: number;
  /** translateZ（深度排序，纯视觉） */
  z: number;
  /** 静摆角 */
  rot: number;
  /** 入幕：延迟 / 时长 / 起始纵向偏移 / 起始旋入角 */
  ent: { d: number; t: number; y: number; rotFrom?: number; fade?: boolean };
}

/* 纸叠 6 平面（缝线 chrome 不在其中） */
const PLANES: PlaneConf[] = [
  { rate: -5, vr: 0.6, tilt: 0, z: -16, rot: 0, ent: { d: 0, t: 750, y: 10, fade: true } },
  { rate: 8, vr: 0.7, tilt: 0.25, z: -10, rot: 0.32, ent: { d: 140, t: 950, y: -16 } },
  { rate: 15, vr: 0.7, tilt: 0.45, z: -4, rot: -0.24, ent: { d: 280, t: 950, y: -24 } },
  { rate: 22, vr: 0.75, tilt: 0.6, z: 3, rot: -1.5, ent: { d: 420, t: 1050, y: -34, rotFrom: -4.5 } },
  { rate: 28, vr: 0.75, tilt: 0.75, z: 9, rot: 0.5, ent: { d: 560, t: 1000, y: -30, rotFrom: 2.4 } },
  { rate: 42, vr: 0.7, tilt: 1.05, z: 22, rot: 0, ent: { d: 1050, t: 850, y: -14 } },
];

/** 滚动散开：近层多抬（0 远 → −18 近） */
const SPREAD = [0, -2, -6, -9, -12, -18];
const ENDT = 1900;
const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

function bez(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 14; i++) {
    const o = 1 - t;
    const xt = 3 * o * o * t * x1 + 3 * o * t * t * x2 + t * t * t - x;
    if (Math.abs(xt) < 1e-5) break;
    const dx = 3 * o * o * x1 + 6 * o * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= xt / dx;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }
  const o = 1 - t;
  return 3 * o * o * t * y1 + 3 * o * t * t * y2 + t * t * t;
}

export function initPaperstack() {
  const hero = document.getElementById('ns-hero');
  if (!hero) return;

  /* 入幕淡入落在谁身上：纸壳平面（data-shell，满屏且带磨砂 / 模糊）自身不淡，只带动作入场，
     淡入交给它里面标了 data-fade 的文字层（没有就不淡）。整块磨砂平面一旦半透明，
     合成器每帧都得为它单开一张满屏离屏画布——几张叠在揭幕那一秒，低配核显直接掉帧 */
  const groups = PLANES.map((_, i) =>
    [...hero.querySelectorAll<HTMLElement>(`[data-p="${i}"]`)],
  );
  const faders = groups.map((els) =>
    els.flatMap((el) => ('shell' in el.dataset ? [...el.querySelectorAll<HTMLElement>('[data-fade]')] : [el])),
  );
  if (groups.every((g) => !g.length)) return;

  const RM = reducedMotion();
  /* 触屏无指针：陀螺仪式微摆（hover 设备走指针视差） */
  const SWAY = matchMedia('(hover: none)').matches && !RM;

  let cur = { nx: 0, ny: 0 };
  const tgt = { nx: 0, ny: 0 };
  let entMs = RM ? ENDT : 0;
  let entranceDone = RM;
  let booted = document.documentElement.classList.contains('booted');
  let spreadOn = false;
  let spreadK = 0;
  let havePtr = false;
  let lastMove = -1e9;
  let raf = 0;
  let lastFrame = 0;
  let frame = 0;

  /* 入幕时钟等开屏揭幕（html.booted）再起步 */
  if (!booted && !RM) {
    const mo = new MutationObserver(() => {
      if (document.documentElement.classList.contains('booted')) {
        booted = true;
        mo.disconnect();
        wake();
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  function applyAll() {
    for (let i = 0; i < PLANES.length; i++) {
      const p = PLANES[i];
      const els = groups[i];
      if (!els.length) continue;
      const ph = Math.min(1, Math.max(0, (entMs - p.ent.d) / p.ent.t));
      const ez = bez(EASE[0], EASE[1], EASE[2], EASE[3], ph);
      const y0 = p.ent.y;
      const r0 = p.ent.rotFrom != null ? p.ent.rotFrom : p.rot;
      const rr = r0 + (p.rot - r0) * ez;
      const tx = -cur.nx * p.rate;
      const ty = -cur.ny * p.rate * p.vr + y0 * (1 - ez) + spreadK * SPREAD[i];
      const rx = -cur.ny * p.tilt;
      const ry = cur.nx * p.tilt;
      const tr =
        `perspective(1600px) translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,${p.z}px) ` +
        `rotate(${rr.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
      const op = p.ent.fade ? ez.toFixed(3) : Math.min(1, ez * 2.6).toFixed(3);
      for (const el of els) el.style.transform = tr;
      for (const el of faders[i]) el.style.opacity = op;
    }
  }

  function wake() {
    if (!raf) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    raf = 0;
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;
    let active = false;
    if (booted && !entranceDone) {
      entMs += dt;
      if (entMs >= ENDT) {
        entMs = ENDT;
        entranceDone = true;
      }
      active = true;
    }
    let tx = 0;
    let ty = 0;
    if (SWAY) {
      tx = 0.3 * Math.sin(now * 0.00042);
      ty = 0.24 * Math.sin(now * 0.00031 + 1.7);
      active = true;
    } else if (havePtr && now - lastMove < 3500) {
      tx = tgt.nx;
      ty = tgt.ny;
      active = true;
    }
    const k = 1 - Math.pow(0.912, dt / 16.7);
    cur.nx += (tx - cur.nx) * k;
    cur.ny += (ty - cur.ny) * k;
    if (Math.abs(tx - cur.nx) + Math.abs(ty - cur.ny) > 1e-4) active = true;
    const sk = spreadOn ? 1 : 0;
    spreadK += (sk - spreadK) * (1 - Math.pow(0.9, dt / 16.7));
    if (Math.abs(sk - spreadK) > 1e-4) active = true;
    applyAll();
    if (active) raf = requestAnimationFrame(tick);
  }

  const normXY = (x: number, y: number) => ({
    nx: Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)),
    ny: Math.max(-1, Math.min(1, (y / innerHeight) * 2 - 1)),
  });

  addEventListener(
    'pointermove',
    (e) => {
      if (RM) return;
      havePtr = true;
      lastMove = performance.now();
      /* 滚出首屏后指针不再牵引（构图交还给页面） */
      if (scrollY < hero.offsetHeight * 0.85) {
        const n = normXY(e.clientX, e.clientY);
        tgt.nx = n.nx;
        tgt.ny = n.ny;
      } else {
        tgt.nx = 0;
        tgt.ny = 0;
      }
      wake();
    },
    { passive: true },
  );

  addEventListener(
    'scroll',
    () => {
      spreadOn = scrollY > 26;
      if (!RM) wake();
    },
    { passive: true },
  );

  applyAll();
  if (!RM) wake();

  /* 调试抓手（仅 dev，与 __fx 同标准） */
  if (import.meta.env.DEV) {
    const state = () =>
      JSON.stringify({
        rm: RM,
        booted,
        spread: spreadOn,
        spreadK: +spreadK.toFixed(3),
        sway: SWAY,
        havePtr,
        target: [+tgt.nx.toFixed(3), +tgt.ny.toFixed(3)],
        cur: [+cur.nx.toFixed(3), +cur.ny.toFixed(3)],
        entMs: Math.round(entMs),
        entranceDone,
      });
    const setPose = (x: number, y: number) => {
      const n = normXY(x, y);
      tgt.nx = n.nx;
      tgt.ny = n.ny;
      cur.nx = n.nx;
      cur.ny = n.ny;
      havePtr = true;
      lastMove = performance.now();
      booted = true;
      entranceDone = true;
      entMs = ENDT;
      applyAll();
      return state();
    };
    (window as unknown as Record<string, unknown>).__ps = {
      state,
      setPose,
      spread: (v: boolean) => {
        spreadOn = !!v;
        if (!RM) wake();
        return state();
      },
      enter: (ms: number) => {
        booted = true;
        entranceDone = false;
        entMs = Math.max(0, Math.min(ENDT, ms ?? 900));
        cur = { nx: 0, ny: 0 };
        tgt.nx = 0;
        tgt.ny = 0;
        applyAll();
        return state();
      },
    };
  }
}
