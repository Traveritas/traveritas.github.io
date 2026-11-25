/**
 * 醒梦 · 四芒星 · 扁平原型（flat four-point star primitive）
 * ─────────────────────────────────────────────────────────────
 * 站内四份手绘星形的共同抽象。轮廓是「每 1/4 一段、每段两条二次曲线」：
 *
 *        尖端 T0 ──Q── 肩点 S ──Q── 尖端 T1          （8 条半弧绕一圈闭合）
 *
 *   肩点 S = (shoulder·arm, ±shoulder·arm) —— 落在 45° 射线上，就是那个「腰」；
 *   尖端那半条弧的控制点 = 弦中点 与 尖峰控制点 的插值，插值量 = pinch：
 *     pinch = 0  控制点落在弦中点  →  这条边是直线，星面是多边形（Ave 的 clip-path 即此）
 *     pinch = 1  控制点落在尖峰位置 →  内凹曲边，芒不穿过形心（Cursor / BootVeil 即此）
 *
 *   尖峰控制点 = 沿尖端轴线推出 2·shoulder·arm，再沿切向偏 turn·arm。
 *   turn 是第四份原件（Cursor 与 BootVeil 各自的曲率差）那一点点差别的最省参数：
 *   turn = 0 时尖端切线严格垂直于轴，turn ≈ 0.03 时两端曲率最接近手绘的原稿。
 *
 * 一个函数覆盖全站三种既有写法（实测偏差见 notes.md）：
 *   Cursor   starPath({ arm: 10, waist: 6.5, pinch: 1, shoulder: 0.214 })
 *   BootVeil starPath({ arm: 10, waist: 10,  pinch: 1, shoulder: 0.246 })
 *   Ave      starPath({ arm: 50, waist: 50,  pinch: 0, shoulder: 0.22  })
 */

/* ── 命名预设（前四个是形状本身，最后一个藏着中心结）── */
export const PRESETS = {
  /** spire：站内主星（光标）。竖 10 / 横 6.5，内凹到底。复刻 Cursor.astro 偏差 0.55% arm */
  spire: { arm: 10, waist: 6.5, pinch: 1, shoulder: 0.214, turn: 0.024 },
  /** equal：等臂内凹（开屏星环里的星芒）。复刻 BootVeil.astro 偏差 0.39% arm */
  equal: { arm: 10, waist: 10, pinch: 1, shoulder: 0.246, turn: 0.03 },
  /** facet：直边多面星（Ave 的 clip-path）。与 Ave.astro 逐点相同，偏差 0 */
  facet: { arm: 10, waist: 10, pinch: 0, shoulder: 0.22, turn: 0 },
  /** tick：中立折中。三份原件一把抓（各 2.4–6.9% arm），12–32px 的标点用它 */
  tick: { arm: 10, waist: 10, pinch: 1, shoulder: 0.232, turn: 0 },
  /** lock：腰点落在尖端连线上 ⇒ 退化成 ◆。数值照 Cursor 的闩锁菱形（竖 7 · 横 4.6） */
  lock: { arm: 7, waist: 4.6, pinch: 0, shoulder: 4.6 / 11.6, turn: 0 },
};

const n = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

const rot2 = (deg) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return ([x, y]) => [x * c - y * s, x * s + y * c];
};

/**
 * 顶点表：四个尖端与四个腰（顺时针，顶 → 右 → 底 → 左），已按 pinch 算好控制点。
 */
function arcs({ arm, waist, pinch, shoulder, turn }) {
  const A = +arm;
  const W = +waist;
  const s = Math.max(0, Math.min(0.5, +shoulder)) * A;
  const t = +turn * A;
  const p = Math.min(1, Math.max(0, +pinch));
  const sg = (v) => (v === 0 ? 0 : v > 0 ? 1 : -1);

  const tips = [
    [0, -A],
    [W, 0],
    [0, A],
    [-W, 0],
  ];
  const waists = [
    [s, -s],
    [s, s],
    [-s, s],
    [-s, -s],
  ];

  /* 尖端 T 的控制点：先取尖峰位置（沿 T 自己的轴 2s、沿切向 t），
     再按 pinch 从弦中点 (T+S)/2 往它推；pinch=0 时正好回到弦中点（= 直线边） */
  const ctrl = (T, S) => {
    const axial = T[0] === 0 ? [0, sg(T[1]) * 2 * s] : [sg(T[0]) * 2 * s, 0];
    const tan = T[0] === 0 ? [sg(S[0]) * t, 0] : [0, sg(S[1]) * t];
    const apex = [axial[0] + tan[0], axial[1] + tan[1]];
    const mid = [(T[0] + S[0]) / 2, (T[1] + S[1]) / 2];
    return [mid[0] + (apex[0] - mid[0]) * p, mid[1] + (apex[1] - mid[1]) * p];
  };

  const out = [];
  for (let i = 0; i < 4; i++) {
    const T0 = tips[i];
    const T1 = tips[(i + 1) % 4];
    const S = waists[i];
    out.push({ a: T0, c: ctrl(T0, S), b: S }); // 尖端 → 腰
    out.push({ a: S, c: ctrl(T1, S), b: T1 }); // 腰 → 尖端
  }
  return { arcs: out, straight: p === 0 };
}

/**
 * 摊成 path d。straight（pinch = 0）时曲线退化成折线，直接写 L，
 * 腰点若正好落在两尖端连线上（◆ 的极限）就把重复的段省掉。
 */
function toD({ arcs: list, straight }, xf) {
  const P = (pt) => (xf ? xf(pt) : pt).map(n).join(',');
  const eq = (a, b) => n(a[0]) === n(b[0]) && n(a[1]) === n(b[1]);
  if (!straight) {
    /* 每段从上一段的终点起笔，不另发 L（相邻两段共用一个顶点） */
    let d = 'M' + P(list[0].a);
    list.forEach((h, i) => {
      d += 'Q' + P(h.c) + ' ' + P(h.b);
      const next = list[(i + 1) % list.length];
      if (!eq(h.b, next.a)) d += 'L' + P(next.a);
    });
    return d + 'Z';
  }
  /* 折线：顶点去重（◆ 极限下腰点落在连线上，会出现重复点） */
  const verts = [];
  for (const h of list) {
    const last = verts[verts.length - 1];
    if (!last || !eq(last, h.a)) verts.push([n(h.a[0]), n(h.a[1])]);
  }
  while (verts.length > 1 && eq(verts[0], verts[verts.length - 1])) verts.pop();
  return 'M' + verts.map((v, i) => (i ? 'L' : '') + v.join(',')).join('') + 'Z';
}

/**
 * 四芒星 path。
 *
 * @param {object} [o]
 * @param {number} [o.arm=10]          竖向半长（尖端到形心）
 * @param {number} [o.waist=6.5]       横向半长
 * @param {number} [o.pinch=1]         0 = 直边（多边形星），1 = 站内的内凹曲边
 * @param {number} [o.shoulder=0.232]  45° 腰深 / arm。三个原件实测：Cursor 0.214 · BootVeil 0.246 · Ave 0.22
 * @param {number} [o.turn=0.03]       尖峰控制点沿切向的偏移 / arm（0 = 尖端切线严格垂直于轴）
 * @param {number|boolean} [o.minor=0] >0 / true 时追加一枚转 45°、缩到 minorScale 的副芒
 * @param {number} [o.minorScale=0.5]  副芒缩放（Cursor 用的就是 0.5）
 * @param {number} [o.rotate=0]        整枚转多少度（指向变体用）
 * @returns {string} SVG path d，以 (0,0) 为形心
 */
export function starPath(o = {}) {
  const {
    arm = 10,
    waist = 6.5,
    pinch = 1,
    shoulder = 0.232,
    turn = 0.03,
    minor = 0,
    minorScale = 0.5,
    rotate = 0,
  } = o;

  const base = arcs({ arm, waist, pinch, shoulder, turn });
  const R = rotate ? rot2(rotate) : null;
  const main = toD(base, R);

  if (!minor) return main;

  const k = +minorScale || 0.5;
  const Rm = rot2(45 + rotate);
  const sec = toD(base, ([x, y]) => {
    const [rx, ry] = Rm([x, y]);
    return [rx * k, ry * k];
  });
  return main + sec;
}

/** 分开拿两枚芒（要各自上色 / 各自不透明度时用；starPath 的 minor 是并进同一个 d 的） */
export function starParts(o = {}) {
  const { minorScale = 0.5, rotate = 0, ...rest } = o;
  return {
    main: starPath({ ...rest, rotate }),
    minor: starPath({
      ...rest,
      rotate: rotate + 45,
      arm: (rest.arm ?? 10) * minorScale,
      waist: (rest.waist ?? 6.5) * minorScale,
    }),
  };
}

/**
 * 中心「结」：站内用来表示「锁住 / 合拢」的那枚小菱形。
 * Cursor 里写死的是 M0,-7L4.6,0L0,7L-4.6,0Z —— 横 / 竖 = 4.6 / 7。
 */
export function knotPath(r = 7, waistRatio = 4.6 / 7) {
  const w = +r * waistRatio;
  return `M0,${n(-r)}L${n(w)},0L0,${n(+r)}L${n(-w)},0Z`;
}

/**
 * 纯菱形（实心 ◆）。它是 starPath 的极限：pinch = 0 且腰点正好落在两尖端的连线上，
 * 即 shoulder = waist / (arm + waist)。这一支单独留着，是因为「锁住」时的那枚结
 * 就该一步到位写成菱形，不必绕一圈算肩点。
 */
export function diamondPath({ arm = 10, waist = 6.5, rotate = 0 } = {}) {
  const R = rotate ? rot2(rotate) : (pt) => pt;
  const pts = [
    [0, -arm],
    [waist, 0],
    [0, arm],
    [-waist, 0],
  ].map((q) => R(q).map(n).join(','));
  return `M${pts[0]}L${pts.slice(1).join('L')}Z`;
}

/* 顺手挂一份到 window：非模块页面（以及控制台里）可以直接用 */
if (typeof window !== 'undefined') {
  window.StarFlat = { starPath, starParts, knotPath, diamondPath, PRESETS };
}