/* ─────────────────────────────────────────────────────────────
   合成（design/mocks/star-final）—— 一颗三轴正交六芒星的最终原型
   ─────────────────────────────────────────────────────────────
   结构不动：±x ±y ±z 六支，正等轴视角（yaw 45° / pitch 35.264°）正交投影，
   剪影是正六芒星。这一份只做一件事：把前三次专项研究各自胜出的那一档
   **接在同一颗星上**，再给它一套「触发式翻动 → 落定 → 完全静止」的运动。

   合成进来的四项（各自的出处见 notes.md 的对照表）：

     ① 粗细     halfWidth = 0.26·r = 4.16          star-t-width
     ② 弧线     每支的两条侧边凹进 0.04（弦长比例）   star-t-arc
     ③ 脊       截面沿脊线折起，脊高 = fold·半宽     star-t-smooth
     ④ 明暗     4 档，跨度 0.10–0.92，光向 [0.78 0.42 0.45] 归一化
     ⑤ 中心     沿光的垂向劈成两半（split）
     ⑥ 姿态     yaw 45° / pitch 35.264°

   几何做法（沿用 star-t-smooth 的真横截面，并把 star-t-arc 的曲线接进去）
   ────────────────────────────────────────────────────────────────
   每支有一组正交基 {a, side, ed}：a 是支在视空间的单位方向，side 在屏幕平面里、
   与 a 垂直，ed 与 a 垂直且尽量朝观者 = (ẑ − ẑ·a·a)/|…|。
   截面摆在这张 (side, ed) 平面上 —— 是真横截面，不是一条侧着的窄条。

   沿轴取若干「站」（s = t·r），每站的半宽 W(s) 由 ② 给出：

     W(s) = w·(1 − t) − 2·curve·C·t·(1 − t)        t = s/r，C = √(L² + w²)

   这是把 star-t-arc 那条二次曲边解析地解出来的：它的控制点取在弦中点沿法向推出
   off·C，而该曲线的「沿轴位置」恰好与参数 t 成正比（x(t) = t·L），所以半宽是 t 的
   二次式。t-arc 只量了 w = 1.9 那一档的读数；这里把同一个 off 用在 w = 4.16 上，
   于是「收腰百分之几」变了 —— 这是本轮要报的一处接口（见 notes §2）。
   站与站之间是直纹面（每站的多边形顶点一一相连），站数取 7 段，残差 0.02 单位。

   每站再按 ④ 把截面折起来：脊高 h(s) = fold·W(s)。`fold` 按 notes 的定义
   「脊高 ÷ 半宽」取，所以 fold = 1.0 是「脊高等于半宽」这一点，与半宽无关 ——
   star-t-smooth 的代码里写的是 h = fold·W/w_全局（在 w = 1.9 时 fold 1.0 实际是
   0.53 倍半宽）。两种读法都在这里实现了（foldMode 'ratio' / 'legacy'），
   因为这一处歧义会直接决定合成后脊是「看得见」还是「看不见」（见 notes §2）。

   不变量
   ──────
   · 截面深度只把顶点推向风筝内部，推不出轮廓 —— 剪影就是 ① + ② 那张曲边风筝。
   · 生产 `drawStar()` 那一张也能由这个构造器画出来（`legacy: true`），
     逐项照抄：6 条平风筝 + 一张 fill-opacity 0.38–0.88 的深度明暗 + 半径 1.7 的圆心。
     对照要诚实，所以两条代码路径都留在这儿。
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;

/* ── 小工具 ───────────────────────────────────────────────── */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** SVG 里保留两位就够：0.01 单位在 400px 上是 0.1px */
const f = (n) => (Math.abs(n) < 0.005 ? '0' : n.toFixed(2));

/* ── 姿态：任意朝向 ───────────────────────────────────────── */
/**
 * 3×3 行主序的 world→view。与 src/scripts/toolstar.ts 的 drawStar() 同一套：
 * 先绕竖直轴 yaw，再把水平面按 pitch 压下去（M = Rx(pitch)·Ry(yaw)）。
 * 把它写成矩阵，是为了让「翻动」能走任意朝向，而不只是 yaw×pitch 那张网格。
 */
export const ISO_PITCH = Math.asin(1 / Math.sqrt(3)) / DEG; // 35.2643897°
export const ISO = Object.freeze({ yaw: 45, pitch: ISO_PITCH });

export function mYawPitch(yawDeg, pitchDeg) {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  return [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
}

export const M_REST = mYawPitch(ISO.yaw, ISO.pitch);

export function mApply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function mMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}

/** 绕一个单位轴转 deg（Rodrigues，行主序） */
export function mAxis(axis, deg) {
  const [x, y, z] = nrm(axis);
  const t = deg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  return [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
}

const BODY_AXES = [
  ['x', [1, 0, 0]],
  ['y', [0, 1, 0]],
  ['z', [0, 0, 1]],
];

/**
 * 六支的框架。a 是视空间单位方向（不加 r），side/ed 见文件头。
 * Lxy < 0.03 的那一支正对镜头，投影成一个点，生产里也是丢掉的（L < 0.6px），
 * 这里同样标 skip —— 翻动经过那种朝向时，那一帧是「少两支」的，属于难看的账。
 */
export function frames(M) {
  const out = [];
  for (const [name, ax] of BODY_AXES) {
    for (const s of [1, -1]) {
      const a = mApply(M, [ax[0] * s, ax[1] * s, ax[2] * s]);
      const Lxy = Math.hypot(a[0], a[1]);
      out.push({
        key: `${name}${s > 0 ? '+' : '−'}`,
        a,
        z: a[2],
        Lxy,
        side: Lxy > 1e-6 ? [-a[1] / Lxy, a[0] / Lxy, 0] : [1, 0, 0],
        ed:
          Lxy > 1e-6
            ? [(-a[2] * a[0]) / Lxy, (-a[2] * a[1]) / Lxy, (1 - a[2] * a[2]) / Lxy]
            : [0, 0, 1],
        /** 屏幕方位角（度，0 = 右、90 = 上） */
        ang: (Math.atan2(a[1], a[0]) / DEG + 360) % 360,
        skip: Lxy < 0.03,
      });
    }
  }
  return out;
}

/* ── 参数 ─────────────────────────────────────────────────── */
/** 现役 drawStar() 的全部常数，一字未改 */
export const PROD = Object.freeze({
  legacy: true,
  r: 16,
  halfWidth: 1.9,
  tail: 1.4,
  /** drawStar 收尾那张 `<circle r="1.7">`，站内填 --amber */
  hub: { mode: 'circle', radius: 1.7 },
  box: 40,
  m: M_REST,
});

/**
 * 合成的那一颗。决策表里没有点名的两个量（截面边数、棱上圆角、尖端做法）
 * 取 star-t-smooth 的 `frost` 预设 —— 那是「~24 path」这一条唯一的出处。
 */
export const SYNC = Object.freeze({
  legacy: false,
  r: 16,
  /** ① 0.26·r */
  halfWidth: 0.26 * 16,
  /**
   * 支尾越过原点往回伸的长度。现役是 1.4；这里取 **0**。
   * star-t-width §4 已经量过：支尾从 0 拉到 6，剪影与内角**一个数都不变**，
   * 只改中心约 6% 的明暗，而且 1.4 恰好是差异最小的那一档。
   * 合成之后它多了一条坏处：支尾让每支多出一片越过原点的长楔，
   * 六片这样的楔在中心互插，画序排不开，于是在凹口附近长出尖细的深色刺。
   * 取 0 既不改剪影，又去掉那六片楔 —— 见 notes §2。
   */
  tail: 0,
  /** 根部保留的半宽比例（1 = 不收，0.25 = 收到四分之一）。见 girthOf() */
  girth: 1,
  box: 40,
  m: M_REST,
  /** ② 侧边凹进（弦长比例）；0 = 直边 = 现役那张风筝 */
  curve: 0.04,
  /** ③ 脊高 ÷ 半宽，取 star-t-smooth 代码里那一档（见 foldH() 的说明） */
  fold: 1.0,
  foldMode: 'code',
  /**
 * ④ 截面：**六边**（三个参数点，正面三片）。
 *
 * 决策表里没点名截面边数，只说「~24 path」；t-smooth 的 `frost` 是六边 + 棱上 0.14 圆角。
 * 我保留六边、去掉棱上圆角（圆角在 w = 4.16 上会把内角吃掉，而且片数翻倍）。
 * 四边不够：四边时「脊」只是一道折线，折的明暗差只有 0.03，与量化台阶同量级 ——
 * 脊就白做了。六边把折做成「一亮两次亮」三段，支内落差回到 0.19，
 * 才算真的有一条脊。见 notes §2 的三方对照。
 */
sides: 6,
  /** 棱上圆角（0 = 硬棱）。软边在 w = 4.16 上会把内角吃掉，取 0 */
  fillet: 0,
  tip: { kind: 'cusp' },
  tones: { steps: 4, min: 0.1, max: 0.92, depth: 0.22 },
  /** ⑤ 中心：沿光的垂向劈成两半（决策表点名的那一档） */
  hub: { mode: 'split', radius: 2.5, lift: 0.16, split: 0.55 },
  light: nrm([0.78, 0.42, 0.45]),
  /** 沿轴的站（t = s/r，不含尖端的 1）。根部密一些 —— 脊在那一段收坡 */
  tS: [0, 0.07, 0.14, 0.21, 0.3, 0.42, 0.56, 0.7, 0.82, 0.91, 0.965],
  merge: true,
});

/** 两个底色。`hub` 只给现役那一张用：它的圆心在站内填 --amber，与六片无关 */
export const GROUNDS = {
  light: { bg: '#f0f3f6', ink: '#232830', hub: '#9a86c4', label: '浅底' },
  dark: { bg: '#2a2b38', ink: '#cfd2e2', hub: '#9a86c4', label: '深底' },
};

const mergeOpts = (base, patch) => {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object')
      out[k] = { ...base[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  return out;
};
export const syncOpts = (patch) => mergeOpts(SYNC, patch);
export const prodOpts = (patch) => mergeOpts(PROD, patch);

/* ── ① + ② 沿轴的剖面 ───────────────────────────────────── */
/** 正等轴视角下一支的投影长度（r·√(2/3) = 0.8165·r） */
export const L_ISO = (r) => r * Math.sqrt(2 / 3);
export const chordLen = (cfg) => Math.hypot(L_ISO(cfg.r), cfg.halfWidth);

/**
 * 一支的侧刃，解析形式。
 *
 * star-t-arc 把侧刃写成一条二次 Bezier：控制点 = 弦中点沿**弦的外法向**推出 off·弦长，
 * off < 0 是凹。弦是 A(0, w) → B(L, 0)，弦长 C = √(L² + w²)，外法向 = (w, L)/C。
 * 把它按参数 t 写开（A 的坐标是「离轴距离」，B 的坐标是「沿轴位置」）：
 *
 *   s(t) = t·L + 2·off·w·t(1−t)          沿轴位置
 *   W(t) = w(1−t) + 2·off·L·t(1−t)       该处半宽
 *
 * 两处要点：
 *   · 侧向的位移是 off·L，**不是** off·C —— 外法向的侧向分量是 L/C，正好把 C 约掉。
 *     写成 C 会把收腰量放大（w 越小放大越多）。
 *   · 上面那两行是**屏幕**坐标。这里 s 是三维里沿支轴的距离，屏幕上要乘 Lxy = √(2/3)。
 *     所以 s = 屏幕上沿轴的位置 ÷ Lxy。
 *
 * off = 0 时 s = t·r、W = w(1−t)，就是现役那张直边风筝。
 */
const LXY = Math.sqrt(2 / 3);

export function stationAt(t, cfg) {
  const w = cfg.halfWidth;
  const L = L_ISO(cfg.r);
  const off = -(cfg.curve || 0); // cfg.curve > 0 = 凹
  const sScreen = t * L + 2 * off * w * t * (1 - t);
  return {
    t,
    /** 三维轴向位置（0 … r） */
    s: sScreen / LXY,
    /** 该处半宽。side 在屏幕平面里，所以这个数与屏幕上量到的宽度是同一个数 */
    W: Math.max(0, w * (1 - t) + 2 * off * L * t * (1 - t)),
  };
}

/**
 * 反过来：给定三维位置 s，解出曲线参数 t。
 * 曲边时 s(t) 不是线性 —— 但量剖面要用「离根 f·L 的那一站」，所以这个方向也要有。
 */
export function tAtS(s, cfg) {
  const L = L_ISO(cfg.r);
  const w = cfg.halfWidth;
  const off = -(cfg.curve || 0);
  const a = 2 * off * w;
  const s3 = s * LXY;
  if (Math.abs(a) < 1e-9) return s3 / L;
  const B = L - a;
  const C = -s3;
  const disc = B * B - 4 * a * C;
  if (disc < 0) return s3 / L;
  const r1 = (-B + Math.sqrt(disc)) / (2 * a);
  const r2 = (-B - Math.sqrt(disc)) / (2 * a);
  const ok = [r1, r2].filter((v) => v >= -1e-9 && v <= 1 + 1e-9);
  return ok.length ? ok[0] : s3 / L;
}

/**
 * 根部收坡用的「离根多远」：**沿轴的绝对距离 ÷ 尖端半径**，不经过曲线参数。
 *
 * 不能直接用 t：曲边会往回走（off·w 那一项），t = 0.07 那几站的 s 落到星星中心
 * 另一边（负 s），于是 t/r 出现负值，收坡判据整体错位 —— 第一版就是这么把
 * 「脊在根部收坡」变成「脊在支身也被收掉」的。
 */
export function alongOf(s, cfg) {
  return Math.max(0, s) / cfg.r;
}

/** 只要半宽（量剖面用；注意这里的 t 是曲线参数，不是沿轴的严格比例） */
export function halfW(t, cfg) {
  return stationAt(t, cfg).W;
}

/** 沿轴的站表：支尾 → 支身 → 尖。尖端严格在 s = r, W = 0 */
export function stations(cfg) {
  const rows = [];
  if (cfg.tail > 0) rows.push({ s: -cfg.tail, W: 0, t: 0 });
  for (const t of cfg.tS) rows.push(stationAt(t, cfg));
  const L = L_ISO(cfg.r);
  rows.push({ s: cfg.r, W: 0, t: 1, L });
  return rows;
}

/* ── ④ 截面（正面那半圈） ───────────────────────────────── */
/**
 * 正 2n 边形的上半圈，按 (nu, de) 给点：nu = c/W，de = 深度/h。
 * n=2 → 3 点（两片），n=3 → 4 点（三片），n=4 → 5 点（四片）。
 * fillet > 0 把 ±(1, 0) 两个角换成一段内切圆弧 —— 轮廓一点不动，那个角上多一道自己的调子。
 */
export function profile(cfg) {
  const n = Math.max(2, Math.round(cfg.sides / 2));
  const base = [];
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * Math.PI;
    base.push({ nu: Math.cos(th), de: Math.sin(th) });
  }
  const rf = clamp(cfg.fillet || 0, 0, 0.28);
  if (!(rf > 0)) return base;
  const seg = 2;
  const left = [];
  for (let i = 0; i <= seg; i++) {
    const phi = (i / seg) * (Math.PI / 2);
    left.push({ nu: -1 + rf * (1 - Math.cos(phi)), de: rf * Math.sin(phi) });
  }
  const right = [];
  for (let i = seg; i >= 0; i--) {
    const phi = (i / seg) * (Math.PI / 2);
    right.push({ nu: 1 - rf * (1 - Math.cos(phi)), de: rf * Math.sin(phi) });
  }
  const inner = base.filter((p) => 1 - Math.abs(p.nu) > rf + 1e-9).reverse();
  return left.concat(inner, right);
}

/* ── 向量小工具 ───────────────────────────────────────────── */
/**
 * Newell 法向。**它只给出「这条环对应的平面」，不保证朝外** —— 朝向取决于顶点绕向，
 * 而这里的顶点顺序来自 (站, 截面点) 两层循环，绕向随截面点的方向翻转。
 * 所以要给它一个「应该朝哪」的参考向量 expect，反向就翻过来。
 * star-t-smooth 里那版就是这么写的（它的 expect 是截面的外法向）。
 * 第一版这里漏了 expect，结果所有面都被判成背面剔掉，六支里没有一支剩下 ——
 * 症状是「只有三支画出来，另三支整支不见」，见 notes §6。
 */
function newell(pts, expect) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const n = nrm([nx, ny, nz]);
  if (expect && dot(n, expect) < 0) return [-n[0], -n[1], -n[2]];
  return n;
}
const sameP = (p, q) =>
  Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6;
const dedupe = (pts) => pts.filter((p, i) => i === 0 || !sameP(p, pts[i - 1]));

/** 视空间点串 → path d（SVG 的 y 向下） */
export function toD(pts3) {
  let d = '';
  for (let i = 0; i < pts3.length; i++) d += `${i ? 'L' : 'M'}${f(pts3[i][0])} ${f(-pts3[i][1])}`;
  return d + 'Z';
}

/**
 * 同一个 path 里接几片子路径时，**绕向必须一致**。
 *
 * 合并（merge）把同一支上同一档调子的片拼成一条 path，靠 nonzero 填充求并。
 * 但三维里左右两半的绕向是相反的（截面点的参数方向在此翻转），
 * 投影之后一半是顺时针、一半是逆时针 —— nonzero 会把它们**互相抵消**，
 * 于是 path 上出现被挖空的一块。症状是「六支里长出几片花瓣状的缺口」，
 * 200px 上很难认，400px 上一眼就看见（见 notes §6）。
 * 所以这里先把每片在屏幕坐标里统一成同向，再拼。
 */
export function toDUnion(list) {
  let d = '';
  for (const pts3 of list) {
    let area = 0;
    for (let i = 0; i < pts3.length; i++) {
      const p = pts3[i];
      const q = pts3[(i + 1) % pts3.length];
      area += p[0] * -q[1] - q[0] * -p[1];
    }
    const seq = area >= 0 ? pts3 : pts3.slice().reverse();
    let s = '';
    for (let i = 0; i < seq.length; i++) s += `${i ? 'L' : 'M'}${f(seq[i][0])} ${f(-seq[i][1])}`;
    d += s + 'Z';
  }
  return d;
}

/* ── 明暗 ─────────────────────────────────────────────────── */
export function rawTone(n, z, depth, light) {
  const sh = clamp(dot(n, light), 0, 1);
  const dp = (z + 1) / 2;
  return clamp((1 - depth) * sh + depth * dp, 0, 1);
}

/** 先把整颗星的 t 拉到 [0,1]，再量化成 steps 档 —— 否则六个调子会挤在亮的一头 */
export function quantize(t, lo, hi, steps) {
  const k = Math.max(2, Math.round(steps));
  const u = hi > lo + 1e-9 ? (t - lo) / (hi - lo) : 0.5;
  return Math.min(k - 1, Math.floor(clamp(u, 0, 1) * k)) / (k - 1);
}

const hex2rgb = (h) => {
  const s = String(h).replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const rgb2hex = (r) =>
  '#' + r.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const mix = (c0, c1, t) => {
  const A = hex2rgb(c0);
  const B = hex2rgb(c1);
  return rgb2hex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};

/* ── 构造 ─────────────────────────────────────────────────── */
/** ③ 脊高。这是 notes 与代码之间唯一一处硬矛盾，两种读法都实现，默认取**代码那一档**
 *  （理由：notes 的甜区表 0.75–1.5 是代码跑出来的，表比描述可信；见 notes §2）：
 *    'code'  h = fold · W / 1.9。star-t-smooth 的写法。1.9 是那一轮的半宽，
 *            所以这是「等比转移」：脊的半张角恒为 atan(fold/1.9) = 27.8°，
 *            与半宽无关。fold 1.0 就是那一轮真正量到「最小支内落差 0.39」的那一档。
 *    'ratio' h = fold · W。notes 的字面读法（脊高 ÷ 半宽 = fold）。半张角 45°，
 *            比量过的那一档陡 1.9 倍。留着当对照，看脊到底该多深。
 *
 * **根部收坡（root taper）**：截面还要沿轴收一个比例 g(s)，从根部到 s = taper·r 由 0 升到 1。
 *
 * 这是三项参数合成之后暴露出来的问题，也是这一轮唯一一处「三项各自的甜区放在一起就坏了」：
 *   · w = 4.16 时每支的截面是一块宽 8.32 的料，六支都穿过原点；
 *     半径 4 的圆内**每一个像素都被至少三层料盖住**（.probe23 量过：三层以上占 100%）。
 *   · 平风筝（fold 0）时这六片都在 z ≈ 0 的平面上，画序怎么排都对。
 *   · 一旦截面有厚度，每支的近端 z 从 0 爬到 9.2，六支的 z 区间**互相包住**，
 *     靠「按片排序」这种画家算法必然出错 —— 画面上就是深色细条从浅色面里穿出来。
 *   · 真解决要么上深度缓冲（那就得换 canvas / WebGL），要么让根部真的变薄。
 * 取后者：把截面在根部收到 0，中心那一圈重新变成一张薄片（与平风筝同构），
 * 错层就没有了。代价是脊在根部一段内不起 —— 而 t-smooth 的读数本来也只在支身认得出折。
 */
export const ROOT_TAPER = { from: 0, to: 0.45 };

function taperOf(along) {
  const { from, to } = ROOT_TAPER;
  if (along <= from) return 0;
  if (along >= to) return 1;
  const u = (along - from) / (to - from);
  return u * u * (3 - 2 * u); // smoothstep
}

/**
 * 截面在「站 row」处的两个缩放：沿 side 的宽度比、沿 ed 的脊高比。
 *
 * 宽度也要收 —— 只收脊高是不够的：宽 8.32 的料即使压平，六片在中心仍然互相穿。
 * 收到根部的 0 之后，中心那块是一个真正的锥尖，而不是六块板叠在一起。
 * 轮廓不变：投影轮廓由 side 方向的宽度决定，而这里的收坡只在 s < 0.45·r 内，
 * 那一段本来就在中心、被别的支盖着（内角半径 4.64 比它更外）。
 */
function girthOf(along, cfg) {
  const g = taperOf(along);
  /* 宽度收到 (1 − girth)·满宽 为止。完全不收到 0 会让支根变成一个点，内角跟着塌 */
  const keep = cfg && typeof cfg.girth === 'number' ? cfg.girth : 0.55;
  return keep + (1 - keep) * g;
}

function foldH(cfg, W, t = 1) {
  const base = cfg.foldMode === 'ratio' ? cfg.fold * W : (cfg.fold * W) / 1.9;
  return base * (cfg.taper === false ? 1 : taperOf(t));
}

/**
 * 主构造器。返回 { paths, hub, stats }。
 */

/* 一站的「有效半宽」：截面沿轴收到根部时用的那个宽度 */
function rowW(cfg, row) {
  return row.W * girthOf(alongOf(row.s, cfg), cfg);
}

function pointAt(fr, row, pp, cfg) {
  const along = alongOf(row.s, cfg);
  const h = foldH(cfg, row.W, along);
  const c = pp.nu * row.W * (cfg.taper === false ? 1 : girthOf(along, cfg));
  const d = pp.de * h;
  return [
    fr.a[0] * row.s + fr.side[0] * c + fr.ed[0] * d,
    fr.a[1] * row.s + fr.side[1] * c + fr.ed[1] * d,
    fr.a[2] * row.s + fr.ed[2] * d,
  ];
}

/** 中心那块：沿光的垂向劈成两半，一明一暗 */
function hubCells(cfg) {
  const mode = cfg.hub.mode;
  if (mode === 'none' || !(cfg.hub.radius > 0)) return [];
  const R = cfg.hub.radius;
  const hex = [];
  for (let k = 0; k < 6; k++) {
    const th = (k * Math.PI) / 3;
    hex.push([R * Math.cos(th), R * Math.sin(th), 1]);
  }
  const toneOfN = (n) => clamp(dot(n, cfg.light), 0, 1) - clamp(cfg.hub.lift, 0, 1);
  if (mode === 'table') return [{ pts: hex, shade: toneOfN([0, 0, 1]), role: 'hub' }];
  if (mode === 'pale') return [{ pts: hex, shade: 0.06, role: 'hub' }];
  const u = nrm([cfg.light[0], cfg.light[1], 0]);
  const half = clamp(cfg.hub.split, 0.05, 3);
  const clipHalf = (poly, sign) => {
    const inside = (p) => (p[0] * u[0] + p[1] * u[1]) * sign >= -1e-9;
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ip = inside(p);
      const iq = inside(q);
      if (ip) res.push(p);
      if (ip !== iq) {
        const den = (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1];
        const t = den ? -(p[0] * u[0] + p[1] * u[1]) / den : 0;
        res.push([lerp(p[0], q[0], t), lerp(p[1], q[1], t), 1]);
      }
    }
    return res;
  };
  return [
    { pts: clipHalf(hex, 1), shade: toneOfN(nrm([u[0] * half, u[1] * half, 1])), role: 'hub' },
    { pts: clipHalf(hex, -1), shade: toneOfN(nrm([-u[0] * half, -u[1] * half, 1])), role: 'hub' },
  ].filter((c) => c.pts.length >= 3);
}

/* ── 现役那一张（对照用） ─────────────────────────────────── */
/** drawStar() 收尾那张圆心的 path（站内是 `<circle r="1.7">`，填 --amber） */
export function hubCirclePath(R) {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const th = (i / 40) * Math.PI * 2;
    pts.push([R * Math.cos(th), R * Math.sin(th), 0]);
  }
  return toD(pts);
}

/**
 * 逐字照抄 drawStar()：六张平风筝，fill-opacity = 0.38 + 0.5·(z+1)/2，再压一张 r 1.7 的圆心。
 * 明暗来自「深度」而不是「面的朝向」—— 这正是合成要用面法线替掉的那件事。
 */
export function legacyPaths(cfg) {
  const paths = [];
  const frs = frames(cfg.m).sort((a, b) => a.z - b.z);
  for (const p of frs) {
    if (p.Lxy < 0.0375) continue; // drawStar 里的 L < 0.6（r = 16 的画框）
    /* 全部按 SVG 坐标（y 向下）算，与 drawStar() 同一个写法：
         ux, uy  支方向的单位向量（SVG 空间）
         n       支的法向 (−uy, ux)
         A = +w·n   C = −w·n   B = r·u   D = −1.4·u                       */
    const ux = p.a[0] / p.Lxy;
    const uy = -p.a[1] / p.Lxy;
    const w = cfg.halfWidth;
    const A = [-uy * w, ux * w];
    const B = [ux * cfg.r * p.Lxy, uy * cfg.r * p.Lxy];
    const C = [uy * w, -ux * w];
    const D = [-ux * cfg.tail, -uy * cfg.tail];
    paths.push({
      d: `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}L${f(C[0])} ${f(C[1])}L${f(D[0])} ${f(D[1])}Z`,
      op: +(0.38 + (0.5 * (p.z + 1)) / 2).toFixed(3),
      z: p.z,
      role: 'legacy',
    });
  }
  return paths;
}

/**
 * 主构造器。返回 { paths, hub, stats }。
 * paths 的 tone 对合成是「墨在底色上的比例」（等价于 alpha），对现役是 fill-opacity。
 */
export function build(cfgIn) {
  const cfg = cfgIn && cfgIn.legacy ? prodOpts(cfgIn) : syncOpts(cfgIn);
  if (cfg.legacy) {
    const paths = legacyPaths(cfg);
    /* drawStar() 的收尾是一张 `<circle r="1.7">`，站内填 --amber。
       它的明暗与那六片一点关系都没有 —— 这正是合成要用「劈开的中心」替掉的那件事。 */
    const hubC = cfg.hub.mode === 'none' ? [] : [{ d: hubCirclePath(cfg.hub.radius), tone: 1, z: 99, role: 'hub' }];
    return {
      paths: paths.concat(hubC),
      hub: hubC,
      cfg,
      legacy: true,
      stats: {
        paths: paths.length + hubC.length,
        cells: paths.length + hubC.length,
        tones: [...new Set(paths.map((p) => p.op))].sort((a, b) => a - b),
        chromatic: hubC.length,
        hubMode: cfg.hub.mode,
        notch: notchRadius(cfg),
        notchAt200: +((notchRadius(cfg) / 40) * 200).toFixed(3),
        spineRawMin: 0,
        spineMin: 0,
        Wmid: +(cfg.halfWidth * 0.5).toFixed(3),
        bytes: JSON.stringify(paths.map((p) => p.d)).length,
      },
    };
  }

  const cfgX = cfg;
  const frs = frames(cfgX.m).sort((p, q) => p.z - q.z || p.ang - q.ang);
  const prof = profile(cfgX);
  const rows = stations(cfgX);
  const spikes = [];
  for (const fr of frs) {
    if (fr.skip) continue;
    const cells = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const r0 = rows[i];
      const r1 = rows[i + 1];
      for (let j = 0; j < prof.length - 1; j++) {
        const p0 = prof[j];
        const p1 = prof[j + 1];
        const pts = dedupe([
          pointAt(fr, r0, p0, cfgX),
          pointAt(fr, r0, p1, cfgX),
          pointAt(fr, r1, p1, cfgX),
          pointAt(fr, r1, p0, cfgX),
        ]);
        if (pts.length < 3) continue;
        /* expect：截面上这两点之间的外法向。用它定朝向，不靠顶点绕向 */
        const nuMid = (p0.nu + p1.nu) / 2;
        const deMid = (p0.de + p1.de) / 2;
        const expect = [
          fr.side[0] * nuMid + fr.ed[0] * deMid,
          fr.side[1] * nuMid + fr.ed[1] * deMid,
          fr.side[2] * nuMid + fr.ed[2] * deMid,
        ];
        const n = newell(pts, expect);
        if (n[2] <= 0.0) continue; // 背面（正等轴视角下六支的正面片都剔不着）
        let zc = 0;
        for (const p of pts) zc += p[2];
        cells.push({ pts, n, role: i === rows.length - 2 ? 'tip' : 'body', z: zc / pts.length, tMid: alongOf((r0.s + r1.s) / 2, cfgX), band: i });
      }
    }
    for (const c of cells) c.t = rawTone(c.n, fr.z, cfgX.tones.depth, cfgX.light);
    spikes.push({ fr, cells });
  }

  /* 归一 + 量化 */
  const ts = spikes.flatMap((s) => s.cells.map((c) => c.t));
  const lo = ts.length ? Math.min(...ts) : 0;
  const hi = ts.length ? Math.max(...ts) : 1;
  const T = cfgX.tones;
  for (const s of spikes)
    for (const c of s.cells)
      c.tone = +(T.min + (T.max - T.min) * quantize(c.t, lo, hi, T.steps)).toFixed(3);

  /* 片 → path。
     合并只在**同一支、同一档、沿轴相邻的那一圈**里做 —— 不是「同一支同一档全并」。
     全并的问题：那一整条只能有一个 z，于是它既盖住本该在它上面的片、
     又被本该在它下面的片盖住，画面上就是深色细条从浅色面里穿出来。
     只在同站相邻的范围内合并，一条 path 在深度上基本是一层，
     path 数仍然从 500+ 降到二十几（见 notes §5）。 */
  const paths = [];
  for (const s of spikes) {
    if (!s.cells.length) continue;
    if (!cfgX.merge) {
      for (const c of s.cells)
        paths.push({
          d: toD(c.pts),
          tone: c.tone,
          z: s.fr.z + c.z * 1e-3,
          role: c.role,
          n: c.n,
          t: c.t,
        });
      continue;
    }
    const byTone = new Map();
    for (const c of s.cells) {
      /* 合并键：同一支、同一档。可选按站分组（cfgX.mergeByBand）——
         分站合并更忠实于深度（一条 path 基本是一层），但 path 数会多五倍，
         而且相邻两站之间会留下抗锯齿的细缝。见 notes §5 的取舍。 */
      const k = cfgX.mergeByBand ? `${c.band}|${c.tone}` : String(c.tone);
      if (!byTone.has(k)) byTone.set(k, []);
      byTone.get(k).push(c);
    }
    for (const [k, list] of byTone.entries()) {
      paths.push({
        d: toDUnion(list.map((c) => c.pts)),
        tone: list[0].tone,
        z: list.reduce((a, c) => a + c.z, 0) / list.length,
        role: list[0].role,
        band: cfgX.mergeByBand ? +k.split('|')[0] : -1,
      });
    }
  }

  const hubC = hubCells(cfgX);
  const hub = hubC.map((h) => ({
    d: toD(h.pts),
    tone: +(T.min + (T.max - T.min) * clamp(h.shade, 0, 1)).toFixed(3),
    z: 99,
    role: 'hub',
  }));

  /**
   * 画序。
   *
   * 画家算法在这里只有一个可行的口径：**按片的平均 z 全局排序**，而不是「按支排序」。
   * 按支排序在平风筝（fold 0）上恰好成立 —— 六片都在 z ≈ 0 的平面上，
   * 只要把远处那几支先画，叠起来就对了。但截面一旦有厚度、或者半宽一粗，
   * 一支的近端可以压在另一支的远端上面，整支排序就必然出错，
   * 症状是「深色楔子从浅色面里穿出来」。
   *
   * 代价：合片（merge）只在**同一支、同一档**之间做，排序按组内最远的片。
   * 因此这里不是严格的「逐片排序」—— 一组（同支同档）内部的片仍按原序画。
   * 这在实测里够用（本颗星上没有出现组内互相遮挡），但它是一条近似，记在 notes §7。
   */
  const all = paths.concat(hub).sort((a, b) => a.z - b.z);
  const cells = spikes.reduce((a, s) => a + s.cells.length, 0) + hubC.length;
  /* 支内落差只在**脊已经完全起来**的那一段量（t ≥ ROOT_TAPER.to）。
   根部那段是故意收坡的（见 foldH），把它算进来会低估脊——那不是说谎，那是量错了对象。 */
  const spineCells = (s) => s.cells.filter((c) => (c.tMid ?? 1) >= (cfgX.taper === false ? -1 : ROOT_TAPER.to));
  const spineRaw = spikes.map((s) => {
    const v = spineCells(s).map((c) => c.t);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  });
  const spine = spikes.map((s) => {
    const v = spineCells(s).map((c) => c.tone);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  });

  return {
    paths: all,
    hub,
    cfg: cfgX,
    legacy: false,
    profile: prof,
    spikes,
    stats: {
      paths: all.length,
      cells,
      perSpike: spikes.map((s) => s.cells.length),
      tones: [...new Set(paths.map((p) => p.tone))].sort((a, b) => a - b),
      chromatic: 0,
      hubMode: cfgX.hub.mode,
      notch: notchRadius(cfgX),
      spineRawMin: +Math.min(...spineRaw).toFixed(3),
      spineMin: +Math.min(...spine).toFixed(3),
      spineRaw: spineRaw.map((v) => +v.toFixed(3)),
      spine: spine.map((v) => +v.toFixed(3)),
      Wmid: +halfW(0.5, cfgX).toFixed(3),
      WmidPct: +((halfW(0.5, cfgX) / (cfgX.halfWidth * 0.5) - 1) * 100).toFixed(1),
    },
  };
}

/* ── 凹口半径（几何） ─────────────────────────────────────── */
/**
 * 相邻两支之间那个内角的半径 —— 「还认不认得出六芒星」的尺子。
 * 直边时用闭式解（star-t-width 的算法，与它量出的 5.362 一致）：
 *   t = w·cos30 / (L·sin30 + w·cos30)，r = w·sin30 + t·(L·cos30 − w·sin30)
 * 曲边时这个闭式解不成立，改用剪影真数：极径剖面 R(θ) 的最小值。
 *
 * 它只与形状有关、与姿态无关，所以同一组参数只算一次（memo）—— 
 * 翻动的每一帧都要 build()，不 memo 的话每帧多 0.9ms 的射线扫描。
 */
const NOTCH_MEMO = new Map();
const notchKey = (cfg) => `${cfg.r}|${cfg.halfWidth}|${cfg.curve}|${cfg.tail}|${(cfg.tS || []).join(',')}`;

export function notchRadius(cfg) {
  const k = notchKey(cfg);
  const hit = NOTCH_MEMO.get(k);
  if (hit !== undefined) return hit;
  let val;
  if (!(cfg.curve > 0)) {
    const th = Math.PI / 6;
    const w = cfg.halfWidth;
    const L = L_ISO(cfg.r);
    const t = (w * Math.cos(th)) / (L * Math.sin(th) + w * Math.cos(th));
    val = +(w * Math.sin(th) + t * (L * Math.cos(th) - w * Math.sin(th))).toFixed(4);
  } else {
    /* 曲边没有闭式解，直接量剪影：极径剖面 R(θ) 的最小值（outlinePoly 已按 1/r 归一） */
    const polys = outlinePoly(cfg, cfg.m || M_REST, 90);
    const thetaN = 540;
    let mn = Infinity;
    for (let i = 0; i < thetaN; i++) {
      const a = (i / thetaN) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let r = 0;
      for (const poly of polys) r = Math.max(r, rayExit(poly, dx, dy));
      if (r < mn) mn = r;
    }
    val = +(mn * cfg.r).toFixed(4);
  }
  NOTCH_MEMO.set(k, val);
  return val;
}

function rayExit(poly, dx, dy) {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a[0] * ey - a[1] * ex) / den;
    const s = (a[0] * dy - a[1] * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

/* ── 剪影（评分与量测用的真轮廓） ─────────────────────────── */
/**
 * 六支的投影轮廓，每支一条折线：支尾 → 左刃（根 → 尖）→ 右刃（尖 → 根）。
 * 这是剪影的唯一来源；评分、凹口、IoU 全都吃它。
 * U = 1/r 归一化，于是「半视高 1.15」这件事与 r 无关。
 */
export function outlinePoly(cfg, M, nSide = 14) {
  const out = [];
  for (const fr of frames(M)) {
    if (fr.skip) continue;
    const pt = (s, c) => {
      const x = fr.a[0] * s + fr.side[0] * c;
      const y = fr.a[1] * s + fr.side[1] * c;
      return [x / cfg.r, -y / cfg.r]; // SVG 式 y 向下
    };
    const pts = [];
    for (let i = 0; i <= nSide; i++) {
      const st = stationAt(i / nSide, cfg);
      pts.push(pt(st.s, -st.W));
    }
    for (let i = nSide; i >= 0; i--) {
      const st = stationAt(i / nSide, cfg);
      pts.push(pt(st.s, +st.W));
    }
    pts.push(pt(-cfg.tail, 0));
    out.push(pts);
  }
  return out;
}

/* ── 剪影光栅化 ───────────────────────────────────────────── */
const HALF_VIEW = 1.15;

/** 六条折线的并集 → 0/1 掩码。逐多边形偶奇填充，取并。 */
export function rasterizePolys(polys, size = 96, half = HALF_VIEW) {
  const mask = new Uint8Array(size * size);
  const sc = size / 2 / half;
  const c = size / 2;
  for (const poly of polys) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.floor(c + minY * sc));
    const y1 = Math.min(size - 1, Math.ceil(c + maxY * sc));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const wy = (y + 0.5 - c) / sc;
      xs.length = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (a[1] === b[1]) continue;
        if ((wy >= a[1]) !== (wy >= b[1])) {
          const x = a[0] + ((wy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          xs.push(x);
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(c + xs[k] * sc - 0.5));
        const xb = Math.min(size - 1, Math.floor(c + xs[k + 1] * sc - 0.5));
        for (let x = xa; x <= xb; x++) mask[y * size + x] = 1;
      }
    }
  }
  return mask;
}

const BINS = 720;
function radialProfile(mask, size) {
  const c = size / 2;
  const R = new Float32Array(BINS);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx);
      if (a < 0) a += Math.PI * 2;
      const b = Math.min(BINS - 1, (a / (Math.PI * 2)) * BINS) | 0;
      if (r > R[b]) R[b] = r;
    }
  }
  return R;
}
function harmonic(R, k) {
  let re = 0;
  let im = 0;
  let sum = 0;
  for (let i = 0; i < BINS; i++) {
    const th = ((i + 0.5) / BINS) * Math.PI * 2;
    re += R[i] * Math.cos(k * th);
    im += R[i] * Math.sin(k * th);
    sum += R[i];
  }
  return sum > 0 ? (2 * Math.hypot(re, im)) / sum : 0;
}
export function maskIoU(a, b) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/* ── 评分 ─────────────────────────────────────────────────── */
/**
 * 与 star-v-motion 同一套四项加权（balance 0.44 / aspect 0.26 / a6 0.20 / sixShare 0.10），
 * 唯一的改动是 a6 的归一化基准：那份用的 0.34 是为它那颗实心星定的；
 * 这颗在正位上的 a6 是 0.353，用 0.34 会一路饱和（见 notes §3）。
 * 这里换成正位实测值，于是「正位 = 100」仍然成立，而坏姿态真的掉得下去。
 */
export const SCORE_W = { balance: 0.44, aspect: 0.26, a6: 0.2, sixShare: 0.1 };
/** 正位上这颗星的 a6（实测 0.4342）。用「正位 = 1」归一，于是满分仍是 100 */
export const A6_REF = 0.434;
export const GOOD = 70;
export const PASS = 55;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function scoreOf(m, w = SCORE_W) {
  const bal = clamp01(m.balance);
  const asp = clamp01((m.aspect - 0.5) / 0.38);
  const six = clamp01(m.a6 / A6_REF);
  const share = clamp01((m.sixShare - 0.42) / 0.4);
  return Math.round(100 * (w.balance * bal + w.aspect * asp + w.a6 * six + w.sixShare * share));
}

/** 一个朝向的完整读数：六支半径的平衡度、剪影的形状、看得出几个角 */
export function measurePose(cfg, M, size = 96) {
  const polys = outlinePoly(cfg, M, 12);
  const mask = rasterizePolys(polys, size);
  const c = size / 2;
  let area = 0;
  let mx = 0;
  let my = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let rmax = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      area++;
      mx += dx;
      my += dy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
      const r = Math.hypot(dx, dy);
      if (r > rmax) rmax = r;
    }
  }
  if (!area) return { area: 0, balance: 0, aspect: 0, a6: 0, sixShare: 0, score: 0, radii: [] };
  mx /= area;
  my /= area;
  sxx = sxx / area - mx * mx;
  syy = syy / area - my * my;
  sxy = sxy / area - mx * my;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-9, tr / 2 - disc);
  const aspect = Math.sqrt(l2 / l1);
  const R = radialProfile(mask, size);
  const a3 = harmonic(R, 3);
  const a4 = harmonic(R, 4);
  const a5 = harmonic(R, 5);
  const a6 = harmonic(R, 6);
  const sixShare = a6 / Math.max(1e-6, a3 + a4 + a5 + a6);
  /* 六支的投影半径，**正对镜头的那一支的 0 也要算进来**：
     一支正对镜头 = 它和它对面那支在屏幕上都是一个点，六支只剩四支。
     若把这两支剔掉，balance 反而是 1（剩下的四支等长），分数虚高 —— 
     这正是 star-v-motion 给 0/0 打 26 分的原因，也是这一版第一遍把 0/0 打成 70 分的原因。 */
  const radii = frames(M).map((p) => p.Lxy);
  const rMin = Math.min(...radii);
  const rMax = Math.max(...radii);
  const balance = rMax > 0 ? rMin / rMax : 0;
  const m = {
    area,
    balance: +balance.toFixed(4),
    aspect: +aspect.toFixed(4),
    a3: +a3.toFixed(4),
    a4: +a4.toFixed(4),
    a6: +a6.toFixed(4),
    sixShare: +sixShare.toFixed(4),
    radii: radii.map((v) => +v.toFixed(3)),
  };
  return { ...m, score: scoreOf(m) };
}

/* ── 明暗光栅（判断「翻动到底看不看得出来」） ─────────────── */
/**
 * 把一帧的片按 z 序画进一张小格子里，得到「每个像素是什么调子」。
 *
 * 为什么不复用 build()：build() 出的是 path 字符串（已经过两次量化与合片），
 * 这里要的是「每个像素落在哪一档」。所以两边共用同一套 stations/profile/pointAt，
 * 只是这里留着四边形而不写字符串。**两处的剔除条件必须一致**（都用 expect 定朝向），
 * 否则会出现「看见的和算出的差得很远」这种最难查的错。
 */
export function rasterTone(cfgIn, M, size = 96) {
  const cfg = cfgIn && cfgIn.legacy ? prodOpts(cfgIn) : syncOpts(cfgIn);
  const N = size * size;
  /* zb 的初值必须比任何可能的 z 都小：支在视空间的 z 落在 ±r 这一量级（±8 上下） */
  const zb = new Float32Array(N).fill(-1e9);
  const tone = new Float32Array(N);
  const cov = new Uint8Array(N);
  const s = size / 2 / HALF_VIEW;
  const c = size / 2;
  const paint = (pts, t, z) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const y0 = Math.max(0, Math.floor(c + minY * s));
    const y1 = Math.min(size - 1, Math.ceil(c + maxY * s));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const wy = (y + 0.5 - c) / s;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (a[1] === b[1]) continue;
        if (wy >= a[1] !== wy >= b[1])
          xs.push(a[0] + ((wy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(c + xs[k] * s - 0.5));
        const xb = Math.min(size - 1, Math.floor(c + xs[k + 1] * s - 0.5));
        for (let x = xa; x <= xb; x++) {
          const id = y * size + x;
          if (z >= zb[id] - 1e-9) {
            zb[id] = z;
            tone[id] = t;
            cov[id] = 1;
          }
        }
      }
    }
  };

  if (cfg.legacy) {
    const res = build(cfg);
    for (const p of res.paths) {
      const nums = (p.d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] / cfg.r, nums[i + 1] / cfg.r]);
      paint(pts, p.role === 'hub' ? 0.55 : p.op, p.role === 'hub' ? 99 : p.z);
    }
    return { tone, cov, size };
  }

  const rows = stations(cfg);
  const prof = profile(cfg);
  const frs = frames(M).sort((a, b) => a.z - b.z);
  for (const fr of frs) {
    if (fr.skip) continue;
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < prof.length - 1; j++) {
        const p0 = prof[j];
        const p1 = prof[j + 1];
        const q = [
          pointAt(fr, rows[i], p0, cfg),
          pointAt(fr, rows[i], p1, cfg),
          pointAt(fr, rows[i + 1], p1, cfg),
          pointAt(fr, rows[i + 1], p0, cfg),
        ];
        const nuMid = (p0.nu + p1.nu) / 2;
        const deMid = (p0.de + p1.de) / 2;
        const expect = [
          fr.side[0] * nuMid + fr.ed[0] * deMid,
          fr.side[1] * nuMid + fr.ed[1] * deMid,
          fr.side[2] * nuMid + fr.ed[2] * deMid,
        ];
        const n = newell(q, expect);
        if (n[2] <= 0) continue;
        let zc = 0;
        for (const p of q) zc += p[2];
        zc /= 4;
        paint(
          q.map((p) => [p[0] / cfg.r, -p[1] / cfg.r]),
          quantize(rawTone(n, fr.z, cfg.tones.depth, cfg.light), 0, 1, cfg.tones.steps),
          zc,
        );
      }
    }
  }
  for (const h of hubCells(cfg)) {
    paint(
      h.pts.map((p) => [p[0] / cfg.r, p[1] / cfg.r]),
      clamp(h.shade, 0, 1),
      99,
    );
  }
  return { tone, cov, size };
}

/** 两帧的「看得见的差别」：剪影 IoU + 明暗的平均绝对差（只在两帧都盖到的地方算） */
export function frameDiff(a, b) {
  let inter = 0;
  let uni = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.cov.length; i++) {
    const x = a.cov[i];
    const y = b.cov[i];
    if (x && y) {
      inter++;
      sum += Math.abs(a.tone[i] - b.tone[i]);
      n++;
    }
    if (x || y) uni++;
  }
  return {
    iou: uni ? +(inter / uni).toFixed(4) : 0,
    toneAbs: n ? +(sum / n).toFixed(4) : 0,
  };
}

/* ── 运动：一次触发的三轴翻动 ─────────────────────────────── */
/**
 * 路径 = 三轴各转 90° 的整数倍，起点与终点都是正位（体对角线）。
 * 转 90° 的整数倍是立方对称群里的元素，所以终点与正位的剪影**完全重合** ——
 * 这一点在 .scan.mjs 里用 IoU 复核过（八个体对角姿态两两 1.0000）。
 *
 * 每轴有自己的起止区间（错开），所以中途是「三轴同时动」，不是绕单轴自转。
 * 缓动用欠阻尼弹簧：起手快、末尾略过冲再落定；p = 1 时严格为 1，不靠取整。
 */
/**
 * 一次触发的三轴翻动。参数由 .scan.mjs 在 288 个组合里挑出来（notes §4）：
 *
 *   三轴各转 90°（第二轴倒转），起止**错开**：第一轴晚起 12%、第二轴早停 12%。
 *   三轴仍同时都在动 —— 但错开之后，中途撞不上「一支正对镜头」的那几格。
 *   同起同止的写法在中段会掉到 35 分（那几帧是「少两支」的形状）。
 *
 * 剩下两个数是弹簧：k 是衰减、w 是回摆频率。p = 1 时严格为 0 与 1 —— 
 * 不靠取整，落定那一刻就是正位本身，不是「正位附近」。
 */
export const TUMBLE = {
  /** 三轴各转几个 90°：−1 表示倒转（终点仍在正位上，对称性保证） */
  sign: [-1, -1, 1],
  /** 每轴在 u 上的 [起, 止] */
  span: [
    [0.12, 1],
    [0, 0.88],
    [0.05, 0.95],
  ],
  spring: { k: 7, w: 5 },
  /** 时长（ms）。任务给的范围是 1.2–2.0，取 1.55 —— 见 notes §4 的取舍 */
  duration: 1550,
};

export function springEase(p) {
  const { k, w } = TUMBLE.spring;
  const num = 1 - Math.exp(-k * p) * Math.cos(w * p);
  const den = 1 - Math.exp(-k) * Math.cos(w);
  return num / den;
}

/** u → 三轴的转角（度）。axisAngles[i] 对应体 x / y / z */
export function axisAngles(u, T = TUMBLE) {
  return [0, 1, 2].map((i) => {
    const [a, b] = T.span[i];
    const p = clamp((u - a) / (b - a || 1), 0, 1);
    return 90 * T.sign[i] * springEaseT(p, T);
  });
}
function springEaseT(p, T) {
  const { k, w } = T.spring;
  return (1 - Math.exp(-k * p) * Math.cos(w * p)) / (1 - Math.exp(-k) * Math.cos(w));
}

/**
 * u ∈ [0,1] → 从正位出发的矩阵。
 *
 * **乘在右边**：`M_rest · R`。R 作用在体坐标里，也就是「这颗星绕自己的轴翻过去」。
 * 乘在左边（`R · M_rest`）是「绕着镜头转」，那是另一件事 —— star-v-motion 的 notes §7.4
 * 记过这个坑：左乘会让分数曲线凭空失去 90° 周期性。这一轮第一版又踩了一次，
 * 症状是「绕体轴 x 转 90°」的剪影 IoU 只有 0.5888 而不是 1.0000（见 notes §3）。
 *
 * 三轴各转 90° 的整数倍，因此终点 = 正位乘一个立方群元素，剪影与正位完全重合。
 */
export function poseAt(u, M = M_REST, T = TUMBLE) {
  const [tx, ty, tz] = axisAngles(u, T);
  return mMul(M, mMul(mAxis([0, 0, 1], tz), mMul(mAxis([0, 1, 0], ty), mAxis([1, 0, 0], tx))));
}

/**
 * 沿运动采样的姿态分数。offline（.scan.mjs）与页面上用的是同一个函数，
 * 所以页面上那条曲线不是「查表近似」，是逐点真算的 —— star-v-motion §7.11
 * 记过「查表当读数」那次事故，这里不再犯。
 */
export function scoreSamples({ n = 120, size = 96, cfg = SYNC, T = TUMBLE } = {}) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = measurePose(cfg, poseAt(t, M_REST, T), size);
    rows.push({ t: +t.toFixed(4), score: m.score, balance: m.balance, a6: m.a6 });
  }
  return rows;
}

/** 难看账：低于 PASS 的时长占比、低于 GOOD 的占比、最低分 */
export function uglyShare(rows) {
  if (!rows.length) return { ugly: 0, pass: 0, min: 0, minT: 0 };
  let ugly = 0;
  let pass = 0;
  let mn = 101;
  let mnT = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].score < PASS) ugly++;
    if (rows[i].score >= PASS && rows[i].score < GOOD) pass++;
    if (rows[i].score < mn) {
      mn = rows[i].score;
      mnT = rows[i].t;
    }
  }
  return {
    ugly: +((ugly / rows.length) * 100).toFixed(1),
    pass: +((pass / rows.length) * 100).toFixed(1),
    good: +(((rows.length - ugly - pass) / rows.length) * 100).toFixed(1),
    min: mn,
    minT: +mnT.toFixed(3),
  };
}

/* ── SVG ──────────────────────────────────────────────────── */
export function markup(res, { ground = 'light' } = {}) {
  const g = GROUNDS[ground] || GROUNDS.light;
  if (res.legacy) {
    return res.paths
      .map((p) =>
        p.role === 'hub'
          ? `<path d="${p.d}" fill="${g.hub}"/>`
          : `<path d="${p.d}" fill="${g.ink}" fill-opacity="${p.op.toFixed(3)}"/>`,
      )
      .join('');
  }
  return res.paths
    .map((p) => `<path d="${p.d}" fill="${mix(g.bg, g.ink, p.tone)}"/>`)
    .join('');
}

/**
 * 取景。两档都用 40 单位的画框（与 Toolstar.astro 的 `-20 -20 40 40` 一致），
 * 这样「48px 的星」在现役与合成上是同一个尺寸 —— 对照要同一个尺度才算数。
 */
export function viewBox(res, { view = 'full', box = null } = {}) {
  const cfg = res.cfg;
  const B = box || cfg.box || 40;
  if (view === 'core') {
    const k = 11.2; // 中心一块（单位），400px 上看得清折与中心
    return `${-k / 2} ${-k / 2} ${k} ${k}`;
  }
  if (view === 'tip') {
    const k = 9;
    return `${-k / 2} ${-(cfg.r * Math.sqrt(2 / 3)) - k / 2 + 3.2} ${k} ${k}`;
  }
  return `${-B / 2} ${-B / 2} ${B} ${B}`;
}

export function svg(cfg, { size = 200, ground = 'light', view = 'full', box = null, label = '' } = {}) {
  const res = build(cfg);
  const g = GROUNDS[ground] || GROUNDS.light;
  const vb = viewBox(res, { view, box });
  const bg = ground === 'dark' ? `background:${g.bg};` : '';
  return (
    `<svg width="${size}" height="${size}" viewBox="${vb}" style="${bg}display:block" ` +
    `role="img" aria-label="${label || '六芒星'}">${markup(res, { ground })}</svg>`
  );
}

export function bytesOf(cfg) {
  return markup(build(cfg)).length;
}

/* ── 挂载（只有浏览器里才有 document） ───────────────────── */
export function mount(el, cfg, opts = {}) {
  if (!el || typeof el === 'undefined') return null;
  el.innerHTML = svg(cfg, opts);
  return build(cfg).stats;
}

/**
 * 满页挂载：扫所有带 data-star 的元素。
 * 值是一串逗号分隔的设置：
 *   prod                  现役那张（7 path）
 *   sync                  合成（本页的主角）
 *   fold=0.5              直接改旋钮（其余取合成）
 *   foldMode=legacy       折高的另一种读法
 *   curve=0               关掉凹边（只为对照）
 *   hub=table:2.5         中心
 * 其余：data-size / data-ground / data-view / data-box。
 */
export function mountGallery(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return [];
  const read = (spec) => {
    let base = syncOpts({});
    const o = {};
    for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [k, v] = part.split('=');
      if (k === 'prod') base = null;
      else if (k === 'sync') base = null;
      else if (k === 'foldMode') o.foldMode = v;
      else if (k === 'hub' && v) {
        const [mode, radius, split] = v.split(':');
        o.hub = { mode, radius: +radius, split: +split ?? 0.55 };
      } else if (v != null && v !== '' && !Number.isNaN(+v)) o[k] = +v;
    }
    const isProd = /(^|,)prod(,|$)/.test(spec);
    return isProd ? prodOpts(o) : syncOpts(o);
  };
  const out = [];
  for (const el of doc.querySelectorAll('[data-star]')) {
    const cfg = read(el.dataset.star || 'sync');
    const st = mount(el, cfg, {
      size: +el.dataset.size || 200,
      ground: el.dataset.ground || 'light',
      view: el.dataset.view || 'full',
      box: el.dataset.box ? +el.dataset.box : null,
      label: el.dataset.label || '',
    });
    if (st) out.push({ el, stats: st });
  }
  return out;
}

/* ── 翻动控制器 ───────────────────────────────────────────── */
/**
 * 「起 → 落 → 定」。
 *   · 起：rAF 每帧重算矩阵、重画；同时记一帧的姿态分数与建面耗时。
 *   · 落：u 严格到 1，正位重画一次（此时与静态渲染的字符串逐字相同）。
 *   · 定：cancelAnimationFrame，之后**没有任何帧**。不是「很少帧」，是零。
 *
 * prefers-reduced-motion：跳过整段翻动，直接画正位 —— 一个计时段都不开。
 */
export class Flip {
  constructor(el, cfg = SYNC, { size = 320, ground = 'light', sampleSize = 96 } = {}) {
    this.el = el;
    this.cfg = cfg;
    this.size = size;
    this.ground = ground;
    this.sampleSize = sampleSize;
    this.raf = 0;
    this.frames = 0;
    this.busy = false;
    this.log = [];
    this.cost = [];
    this.startedAt = 0;
    this.rm =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.render(M_REST);
  }
  get reduced() {
    return this.rm;
  }
  render(M) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const res = build({ ...this.cfg, m: M });
    const vb = viewBox(res, {});
    const bg = this.ground === 'dark' ? `background:${GROUNDS.dark.bg};` : '';
    this.el.innerHTML =
      `<svg width="${this.size}" height="${this.size}" viewBox="${vb}" style="${bg}" role="img" aria-label="六芒星">` +
      markup(res, { ground: this.ground }) +
      '</svg>';
    this.frames++;
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    return { ms: t1 - t0, paths: res.stats.paths };
  }
  flip() {
    if (this.busy) return false;
    this.log = [];
    this.cost = [];
    this.startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.rm || typeof requestAnimationFrame !== 'function') {
      this.render(M_REST);
      this.busy = false;
      return true;
    }
    this.busy = true;
    const step = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : this.startedAt;
      const t = clamp((now - this.startedAt) / TUMBLE.duration, 0, 1);
      const M = poseAt(t);
      const c = this.render(M);
      this.cost.push(c.ms);
      const m = measurePose(this.cfg, M, this.sampleSize);
      this.log.push({ t: +t.toFixed(4), score: m.score });
      if (t < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.raf = 0;
        this.render(M_REST);
        this.busy = false;
      }
    };
    this.raf = requestAnimationFrame(step);
    return true;
  }
  reset() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.busy = false;
    this.render(M_REST);
  }
  state() {
    const c = this.cost.slice().sort((a, b) => a - b);
    return {
      busy: this.busy,
      raf: this.raf,
      frames: this.frames,
      reduced: this.rm,
      samples: this.log.length,
      scoreMin: this.log.length ? Math.min(...this.log.map((l) => l.score)) : null,
      msMedian: c.length ? +c[c.length >> 1].toFixed(2) : null,
      msMax: c.length ? +c[c.length - 1].toFixed(2) : null,
      duration: TUMBLE.duration,
    };
  }
}