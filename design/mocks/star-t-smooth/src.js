/* ─────────────────────────────────────────────────────────────
   星 · 平滑程度（design/mocks/star-t-smooth）
   ─────────────────────────────────────────────────────────────
   三轴正交六芒星（±x ±y ±z），yaw 45° / pitch 35.264°，正交投影。结构不动。
   这一份只解析一件事：这颗星有多「平滑」。五个旋钮互相独立：

     ① 尖端  每支的尖：硬尖 / 削平 / 圆弧收口（半径 rho + 段数）
     ② 脊    每支沿脊线折成两片 —— 折高 = 截面里的脊高，fold = h / w
     ③ 棱    轮廓那条棱的角上带一小段自己的调子（内切圆弧，半径 fillet）
     ④ 截面  截面按 4 / 6 / 8 边形取点 —— 正面 2 / 3 / 4 片
     ⑤ 明暗  连续明暗量化成 steps 档，并给 min–max 的跨度

   几何做法
   ────────
   每支有一组正交基 {a, side, ed}：
     a    支的单位方向（视空间）
     side 屏幕上与支垂直的方向（就在屏幕平面里）
     ed   与 a 垂直、且尽量朝观者的方向 = (k − ẑ·a) / |…|
   截面摆在这张 (side, ed) 平面上 —— 是真横截面，不是一条侧着的窄条。
   截面沿轴等比缩到端点（W(s) = w·(1 − s/r)），每片是三角形或四边形，
   法线由 Newell 法从真顶点算，明暗只看法线（depth 只当一点「前实后淡」的补偿）。

   不变量（notes.md 里都验过）
   · 投影轮廓仍是现役那张四角风筝：截面深度只把顶点推向风筝内部，推不出轮廓。
   · fold 1.7 + 4 边截面 ≈ star-solid 的 ridge（每支两片，脊线一道折）。
   · 「背面」按面法线的 z 剔掉：正等轴视角下六支的正面片全部朝观者，剔不着。

   与旧 ridge 的两处不同
   ──────────────────────
   · 旧版抬肩用 cross(a, side)，那个方向在屏幕上有分量，所以「轮廓一个像素不改」
     其实不成立（肩沿支方向滑开 0.58·h）。这里用真横截面，轮廓不变是几何上
     成立的，不是巧合。
   · 旧版每支两片靠 0.7·shade + 0.3·depth 硬混；这里法线来自真顶点，depth 默认只混 0.22。
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;
/** asin(1/√3) = 35.2643897°，正等轴视角 */
export const ISO_PITCH = Math.asin(1 / Math.sqrt(3)) / DEG;
export const ISO = Object.freeze({ yaw: 45, pitch: ISO_PITCH });

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => a + (b - a) * t;
/** 与 drawStar() 一样保留两位 */
const f = (n) => (Math.abs(n) < 0.005 ? '0' : n.toFixed(2));

/**
 * 视空间光向。这是这份原型的第一个发现，也是唯一一处改了「基线」以外的东西（见 notes §2）。
 *
 * 光若只在屏幕平面里（z = 0），每支截面的左右两肩就只能靠面朝哪边来分亮暗，
 * 而六支的两肩在屏幕上恰好成对相反 —— 总有两支整支同色，折线的调子出不来。
 * 要点是：光在屏幕上的横向分量，必须与六支的截面横轴（side）都不平行。
 * 六支的 side 在屏幕上落在 0°/60°/120° 三个方向（正反各一），所以光的最优方位落在 30°、
 * 90°、150° …… 但要避开 90°：正上方那一束下，竖直那两支的左右两肩严格对称，
 * 那两支就退成一整片。30° 与 150° 因此是唯一的两个解（互为镜像）。
 *
 * 扫法：方位 0–355°、仰角 −40–70°，各 5° 一格（2160 格），判据是
 *   ① 六支里最差的那支也要有支内落差（spineRaw 取最小）
 *   ② 相邻两支在凹口两侧也要有落差（notch 取最小）
 *   ③ 相邻两支的明暗序尽量相反
 * 30° / 25° 在 ①② 上同时最高（0.44 / 0.49），且六支的明暗序只有两对重复。
 */
export const LIGHT = nrm([0.78, 0.42, 0.45]);

/* ── 姿势 ─────────────────────────────────────────────────── */
/**
 * 与 toolstar.ts 同一套旋转：先绕竖直轴 yaw，再绕屏幕水平轴压 pitch。
 * 返回六支的框架（视空间 x 右、y 上、z 朝观者）。
 */
export function pose(yawDeg = ISO.yaw, pitchDeg = ISO.pitch) {
  const yaw = yawDeg * DEG;
  const pit = pitchDeg * DEG;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pit);
  const sp = Math.sin(pit);
  const out = [];
  const AXES = [
    ['x', [1, 0, 0]],
    ['y', [0, 1, 0]],
    ['z', [0, 0, 1]],
  ];
  for (const [name, ax] of AXES) {
    for (const s of [1, -1]) {
      const x1 = ax[0] * s * cy + ax[2] * s * sy;
      const z1 = -ax[0] * s * sy + ax[2] * s * cy;
      const y2 = ax[1] * s * cp - z1 * sp;
      const z2 = ax[1] * s * sp + z1 * cp;
      const Lxy = Math.hypot(x1, y2);
      if (Lxy < 0.06) continue; // 正对镜头的那一支（yaw 45° 下不会出现）
      const ux = x1 / Lxy;
      const uy = y2 / Lxy;
      out.push({
        a: [x1, y2, z2],
        z: z2,
        Lxy,
        side: [-uy, ux, 0],
        ed: [(-z2 * x1) / Lxy, (-z2 * y2) / Lxy, (1 - z2 * z2) / Lxy],
        key: `${name}${s > 0 ? '+' : '−'}`,
        /** 屏幕上这一支的方位角（度，0° 右、90° 上） */
        ang: (Math.atan2(uy, ux) / DEG + 360) % 360,
      });
    }
  }
  return out;
}

/* ── 截面 ─────────────────────────────────────────────────── */
/**
 * 正 2n 边形的上半圈，按 (nu, de) 给点：
 *   nu = c / W ∈ [−1, 1]（屏幕横向），de = d / H（深度；1 = 脊顶，0 = 轮廓棱）
 * n=2 → 菱形（4 边截面）：正面两片，脊上一道折；
 * n=3 → 顶上一条平边（6 边截面）：脊上是一条亮带，正面三片；
 * n=4 → 脊上仍是折，两侧各多一道台阶（8 边截面），正面四片。
 * 点从 nu = −1 排到 +1。
 *
 * fillet > 0：把 ±(1, 0) 这两个角换成一段内切圆弧（半径 fillet，
 * 在 (nu, de) 这张参数平面上取，弧起于角点、止于原边上距角 fillet 处）。
 * 于是轮廓**一点不变**（±1 那个点还在），但那个角上多出两小片自己的调子 ——
 * 这就是「棱上有一条自己的色带」，而不是把轮廓啃掉一块。
 */
export function profile(n, fillet = 0) {
  const base = [];
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * Math.PI;
    base.push({ nu: Math.cos(th), de: Math.sin(th) });
  }
  if (!(fillet > 0)) return base;
  const rf = clamp(fillet, 0, 0.28);
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
  const inner = base.filter((p) => 1 - Math.abs(p.nu) > rf + 1e-9);
  return left.concat(inner, right);
}

export function deAt(prof, nu) {
  for (let i = 1; i < prof.length; i++) {
    const p = prof[i - 1];
    const q = prof[i];
    if (nu >= p.nu - 1e-9 && nu <= q.nu + 1e-9) {
      const t = (nu - p.nu) / (q.nu - p.nu || 1);
      return lerp(p.de, q.de, t);
    }
  }
  return 0;
}

/* ── 沿轴的排（row） ─────────────────────────────────────── */
/**
 * 一排 = 轴上一点 s 与那里的半宽 W。
 * 支尾是尖的（W = 0）；支身必有 s = 0 那一排（W = w，风筝最宽处 ——
 * 没有它，轮廓上那个凹口就没了）；尖端再按做法补：
 *
 *   cusp   一排 W = 0，落在 s = r。尖是硬尖。
 *   flat   削平：停在 s = r − len，端面另给一片（正面一片平顶）。
 *   round  收圆：半径 rho 的圆弧与两侧刃相切，圆心在轴上、落在
 *          s = r − rho / sin α。于是切点 W = rho·cos α，
 *          鼻端 s = r − rho/sin α + rho，退让 = rho·(1/sin α − 1)。
 *          α = atan(w/r) ≈ 6.77°，1/sin α ≈ 8.48，所以 rho 0.1 就退 0.75、
 *          rho 0.4 退 3.0 —— 细长的尖要圆，只能圆掉一大截。这不是系数，是解出来的。
 */
export function planRows(o) {
  const { r, halfWidth: w, notch, tip } = o;
  const Wof = (s) => (s >= 0 ? w * (1 - s / r) : notch > 0 ? w * (1 + s / notch) : 0);
  const alpha = Math.atan(w / r);
  const rows = [];
  if (notch > 0) rows.push({ s: -notch, W: 0 });
  rows.push({ s: 0, W: w });

  if (tip.kind === 'flat') {
    const len = clamp(tip.len, 0.02, r * 0.6);
    const sCut = r - len;
    rows.push({ s: sCut, W: Wof(sCut) });
    return { rows, cap: 'lid', alpha, retreat: len };
  }
  if (tip.kind === 'round') {
    const rhoMax = (r * 0.62) / (1 / Math.sin(alpha) - 1);
    const rho = clamp(tip.rho, 0.01, rhoMax);
    const segs = Math.max(2, Math.round(tip.segs));
    const sC = r - rho / Math.sin(alpha);
    const psi0 = Math.PI / 2 - alpha; // 切点所在的极角
    for (let j = 0; j <= segs; j++) {
      const psi = psi0 * (1 - j / segs);
      rows.push({ s: sC + rho * Math.cos(psi), W: rho * Math.sin(psi) });
    }
    return { rows, cap: 'arc', alpha, rho, sC, segs, retreat: r - (sC + rho) };
  }
  rows.push({ s: r, W: 0 });
  return { rows, cap: 'none', alpha, retreat: 0 };
}

/* ── 向量小工具 ───────────────────────────────────────────── */
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
  return dot(n, expect) < 0 ? [-n[0], -n[1], -n[2]] : n;
}
const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6;
const dedupe = (pts) => pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));

/** 一串视空间点 → path d（SVG 的 y 向下） */
export function toD(pts3) {
  let d = '';
  for (let i = 0; i < pts3.length; i++) d += `${i ? 'L' : 'M'}${f(pts3[i][0])} ${f(-pts3[i][1])}`;
  return d + 'Z';
}

/* ── 一支的正面片 ─────────────────────────────────────────── */
function buildSpike(fr, o, prof) {
  const { a, side, ed } = fr;
  const w = o.halfWidth;
  const plan = planRows(o);
  const rows = plan.rows;
  const P = (row, pp) => {
    const h = (o.fold * row.W) / w;
    const c = pp.nu * row.W;
    const d = pp.de * h;
    return [
      a[0] * row.s + side[0] * c + ed[0] * d,
      a[1] * row.s + side[1] * c + ed[1] * d,
      a[2] * row.s + ed[2] * d,
    ];
  };
  const cells = [];
  const push = (pts3, expect, role) => {
    const pts = dedupe(pts3);
    if (pts.length < 3) return;
    const n = newell(pts, expect);
    if (n[2] < 0.015) return; // 背面
    let zc = 0;
    for (const p of pts) zc += p[2];
    cells.push({ pts, n, role, z: zc / pts.length });
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i];
    const r1 = rows[i + 1];
    for (let j = 0; j < prof.length - 1; j++) {
      const p0 = prof[j];
      const p1 = prof[j + 1];
      const nuMid = (p0.nu + p1.nu) / 2;
      const deMid = (p0.de + p1.de) / 2;
      const expect = [
        side[0] * nuMid + ed[0] * deMid,
        side[1] * nuMid + ed[1] * deMid,
        side[2] * nuMid + ed[2] * deMid,
      ];
      push([P(r0, p0), P(r0, p1), P(r1, p1), P(r1, p0)], expect, i === rows.length - 2 ? 'tip' : 'body');
    }
  }
  if (plan.cap === 'lid') {
    const row = rows[rows.length - 1];
    push(
      prof.map((pp) => P(row, pp)),
      a,
      'lid',
    );
  }
  return { cells, plan };
}

/* ── 中心 ─────────────────────────────────────────────────── */
/**
 * 中心的做法。薄版被判「一堆没有意义的交叉碎条」，所以这里都有明确交代：
 *   none  什么都不放，让六条支尾自己去叠（对照组）
 *   table 一块朝观者的平顶小六边（有面、有方向感）
 *   split 同一块，沿光的垂直方向劈成两半，一明一暗
 *   pale  一块更淡的六边（退成一层底，不抢支尾）
 */
function hubCells(o) {
  const mode = o.hub.mode;
  if (mode === 'none' || !(o.hub.radius > 0)) return [];
  const R = o.hub.radius;
  const rot = (o.hub.rot || 0) * DEG;
  const hex = [];
  for (let k = 0; k < 6; k++) {
    const th = rot + (k * Math.PI) / 3;
    hex.push([R * Math.cos(th), R * Math.sin(th), 1]);
  }
  const toneOfN = (n) => clamp(dot(n, o.light), 0, 1) - clamp(o.hub.lift, 0, 1);
  if (mode === 'pale') return [{ pts: hex, shade: o.hub.tone ?? 0.06, role: 'hub' }];
  if (mode === 'table') return [{ pts: hex, shade: toneOfN([0, 0, 1]), role: 'hub' }];
  const u = nrm([o.light[0], o.light[1], 0]);
  const half = clamp(o.hub.split, 0.05, 3);
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

/* ── 明暗 ─────────────────────────────────────────────────── */
/** 面法线 → 原始的明暗值 t ∈ [0,1]（未量化、未拉伸）：七成看法线、三成看深度 */
export function rawTone(n, z, depth = 0.22, light = LIGHT) {
  const sh = clamp(dot(n, light), 0, 1);
  const dp = (z + 1) / 2;
  return clamp((1 - depth) * sh + depth * dp, 0, 1);
}

/**
 * 把 t 量化成 steps 档。
 * 先在整颗星上把 t 拉满到 [0,1]（否则面上大多挤在亮的一头，六个调子全堆在一块），
 * 再乘到 [min, max] 的跨度上 —— 于是 steps 与 min/max 是可以分开调的。
 */
export function quantize(t, lo, hi, steps) {
  const k = Math.max(2, Math.round(steps));
  const u = hi > lo + 1e-9 ? (t - lo) / (hi - lo) : 0.5;
  const q = Math.min(k - 1, Math.floor(clamp(u, 0, 1) * k)) / (k - 1);
  return q;
}

/* ── 颜色 ─────────────────────────────────────────────────── */
const hex2rgb = (h) => {
  const s = String(h).replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
};
const rgb2hex = (r) => '#' + r.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
/** 两个十六进制色之间取中间色 */
export const mix = (c0, c1, t) => {
  const A = hex2rgb(c0);
  const B = hex2rgb(c1);
  return rgb2hex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
};

export const GROUNDS = {
  light: { bg: '#f0f3f6', ink: '#232830', label: '浅底' },
  dark: { bg: '#2a2b38', ink: '#cfd2e2', label: '深底' },
};

/* ── 默认 ─────────────────────────────────────────────────── */
export const DEFAULTS = Object.freeze({
  yaw: 45,
  pitch: ISO_PITCH,
  r: 16,
  halfWidth: 1.9,
  notch: 1.7,
  fold: 1.2,
  sides: 4,
  rim: 0,
  /** 棱上圆角在 (nu, de) 参数平面里的半径：0 = 硬棱，0.28 = 大圆角 */
  fillet: 0,
  tip: { kind: 'cusp', len: 3, rho: 0.55, segs: 3 },
  tones: { steps: 4, min: 0.16, max: 0.9, depth: 0.22 },
  light: LIGHT,
  hub: { mode: 'table', radius: 2.3, rot: 0, lift: 0.16, split: 0.5, tone: 0.06 },
  /** 合片：同一支上同一档调子的片并成一条 path（几何不变，只是少几个节点） */
  merge: true,
  /** true 时画现役那一张平风筝（对照组） */
  legacy: false,
});

export function merge(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object')
      out[k] = { ...base[k], ...v };
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

/* ── 现役那一张（对照用） ─────────────────────────────────── */
/** drawStar() 的四角风筝：一张平片，明暗只来自深度。用来把「今天」摆在旁边 */
export function legacyPathSet(o) {
  const w = o.halfWidth;
  const t = o.notch;
  const paths = [];
  for (const fr of pose(o.yaw, o.pitch)) {
    const { a, side } = fr;
    const P = (c, s) => [a[0] * s + side[0] * c, a[1] * s + side[1] * c, a[2] * s];
    const quad = [P(-w, 0), P(0, o.r), P(w, 0), P(0, -t)]; // 支尾在原点外 −t 处（侧向为 0）
    const tone = +(o.tones.min + (o.tones.max - o.tones.min) * ((fr.z + 1) / 2)).toFixed(3);
    paths.push({ d: toD(quad), tone, z: fr.z, role: 'legacy' });
  }
  return paths;
}

/* ── 主函数 ───────────────────────────────────────────────── */
export function star(opts = {}) {
  const o = merge(DEFAULTS, opts);
  if (o.legacy) {
    const paths = legacyPathSet(o).sort((p, q) => p.z - q.z);
    const hubC = hubCells(o).map((h) => ({
      d: toD(h.pts),
      tone: +(o.tones.min + (o.tones.max - o.tones.min) * clamp(h.shade, 0, 1)).toFixed(3),
      z: o.notch + 1,
      role: 'hub',
    }));
    const all = paths.concat(hubC).sort((p, q) => p.z - q.z);
    return {
      paths: all,
      hub: hubC,
      opts: o,
      profile: [],
      spikes: [],
      stats: {
        paths: all.length,
        cells: all.length,
        perSpike: paths.map(() => 1),
        tones: [...new Set(all.map((p) => p.tone))].sort((a, b) => a - b),
        spine: [0, 0, 0, 0, 0, 0],
        spineRaw: [0, 0, 0, 0, 0, 0],
        notch: [0, 0, 0, 0, 0, 0],
        sameOrder: 6,
      },
    };
  }
  const n = Math.max(1, Math.round(o.sides / 2));
  const prof = profile(n, o.fillet);
  const frs = pose(o.yaw, o.pitch).sort((p, q) => p.z - q.z || p.ang - q.ang);
  const spikes = frs.map((fr) => {
    const { cells, plan } = buildSpike(fr, o, prof);
    for (const c of cells) c.t = rawTone(c.n, fr.z, o.tones.depth, o.light);
    return { fr, cells, plan };
  });

  /* 明暗的归一：把整颗星的 t 拉到 [0,1] 再乘跨度 —— 否则六个调子会挤在亮的一头 */
  const ts = spikes.flatMap((s) => s.cells.map((c) => c.t));
  const lo = ts.length ? Math.min(...ts) : 0;
  const hi = ts.length ? Math.max(...ts) : 1;
  for (const s of spikes) for (const c of s.cells) c.tone = +(o.tones.min + (o.tones.max - o.tones.min) * quantize(c.t, lo, hi, o.tones.steps)).toFixed(3);

  /* 片 → path：每支内部按调子并片（同一支的片在屏幕上互不重叠，并了不会串味） */
  const paths = [];
  for (const s of spikes) {
    if (!s.cells.length) continue;
    if (!o.merge) {
      for (const c of s.cells) paths.push({ d: toD(c.pts), tone: c.tone, z: s.fr.z + c.z * 1e-3, role: c.role, n: c.n, t: c.t });
      continue;
    }
    const byTone = new Map();
    for (const c of s.cells) {
      if (!byTone.has(c.tone)) byTone.set(c.tone, []);
      byTone.get(c.tone).push(c);
    }
    for (const [tone, list] of [...byTone.entries()].sort((p, q) => p[0] - q[0])) {
      paths.push({
        d: list.map((c) => toD(c.pts)).join(''),
        tone,
        z: s.fr.z + Math.min(...list.map((c) => c.z)) * 1e-3,
        role: list[0].role,
        n: list[0].n,
        t: list.reduce((a, c) => a + c.t, 0) / list.length,
      });
    }
  }

  /* 中心：压在所有支之上 */
  const hubC = hubCells(o);
  const hub = hubC.map((h) => ({
    d: toD(h.pts),
    tone: +(o.tones.min + (o.tones.max - o.tones.min) * clamp(h.shade, 0, 1)).toFixed(3),
    z: o.notch + 1,
    role: 'hub',
  }));

  const all = paths.concat(hub);
  const cells = spikes.reduce((a, s) => a + s.cells.length, 0) + hubC.length;
  /* 最上面那一点落在屏幕的哪里（SVG 的 y），tip 取景跟着它走 */
  let topY = 0;
  for (const s of spikes) for (const c of s.cells) for (const p of c.pts) topY = Math.min(topY, -p[1]);
  const tipY = topY + 3.0;
  return {
    paths: all,
    hub,
    opts: o,
    profile: prof,
    spikes,
    stats: {
      paths: all.length,
      cells,
      perSpike: spikes.map((s) => s.cells.length),
      tones: [...new Set(all.map((p) => p.tone))].sort((a, b) => a - b),
      tipY,
      profile: prof.length,
      retreat: +(planRows(o).retreat ?? 0).toFixed(3),
      notchRadius: notchRadius(o),
      ...splitStats(spikes, o, lo, hi),
    },
  };
}

/**
 * 凹口半径：相邻两支之间那个内角到星心的距离 —— 「还认不认得出是六芒星」的尺子。
 *
 * 不是 w·cosα/sin(60°−α)（那个公式在 star-solid 的 notes 里写过，量出来偏小）：
 * 相邻两支的刃其实并不在原点附近相交，而是在更外面才擦肩。
 * 真正该算的是：一支的侧角点 A = (w·sinθ, w·cosθ) 连到端点 L(cosθ, −sinθ)，
 * 这条刃与相邻那一支的对称轴（屏幕 y = 0，θ = 30°）的交点。
 *
 *   t = w·cosθ / (L·sinθ + w·cosθ)
 *   r = w·sinθ + t·(L·cosθ − w·sinθ)
 *
 * 六支互成 60°，所以凹口每一处半径都一样。端点半径 L 反过来是「星有多大」。
 */
export function notchRadius(o = DEFAULTS) {
  const th = Math.PI / 6;
  const w = o.halfWidth;
  // 正等轴视角下六支投影等长，都等于 r·√(2/3) = 0.8165·r（不是 r 本身）
  const L = o.r * Math.sqrt(2 / 3);
  const t = (w * Math.cos(th)) / (L * Math.sin(th) + w * Math.cos(th));
  return +(w * Math.sin(th) + t * (L * Math.cos(th) - w * Math.sin(th))).toFixed(4);
}

/**
 * 三条「立不立得住」的读数：
 *   spine  每支内部最亮与最暗两片的落差（脊线看不看得出折过）
 *   notch  相邻两支在凹口两侧那两片的落差（交界处立不立得起来）
 *   same   相邻两支的明暗序相同的对数（0 = 六对全相反，最像「一块折起来的料」）
 */
function splitStats(spikes, o, lo, hi) {
  const tOf = (c, fr) => +(o.tones.min + (o.tones.max - o.tones.min) * quantize(rawTone(c.n, fr.z, o.tones.depth, o.light), lo, hi, o.tones.steps)).toFixed(3);
  const edgeCell = (s, sg) => {
    let best = null;
    let bd = -9;
    for (const c of s.cells) {
      const k = c.n[0] * s.fr.side[0] * sg + c.n[1] * s.fr.side[1] * sg + c.n[2] * s.fr.side[2] * sg;
      if (k > bd) {
        bd = k;
        best = c;
      }
    }
    return best;
  };
  const spine = spikes.map((s) => {
    const ts = s.cells.map((c) => tOf(c, s.fr));
    return ts.length ? +(Math.max(...ts) - Math.min(...ts)).toFixed(3) : 0;
  });
  /* 同一件事在量化之前的说法：t 的原始跨度。脊越深它越大，是单调的，
     不像量化之后的数会跳台阶 —— 表格与扫旋钮的标注用这个。 */
  const spineRaw = spikes.map((s) => {
    const ts = s.cells.map((c) => c.t);
    return ts.length ? +(Math.max(...ts) - Math.min(...ts)).toFixed(3) : 0;
  });
  const ordered = spikes.slice().sort((p, q) => p.fr.ang - q.fr.ang);
  const notch = [];
  let sameOrder = 0;
  /** 一支的方向序：右肩比左肩亮记 +1，反之 −1。相邻两支应当正负相反 */
  const order = ordered.map((s) => {
    const l = edgeCell(s, -1);
    const r = edgeCell(s, 1);
    if (!l || !r) return 0;
    return Math.sign(tOf(r, s.fr) - tOf(l, s.fr));
  });
  for (let i = 0; i < ordered.length; i++) {
    const A = ordered[i];
    const B = ordered[(i + 1) % ordered.length];
    const dAng = ((B.fr.ang - A.fr.ang + 540) % 360) - 180;
    const sgA = dAng > 0 ? 1 : -1;
    const ca = edgeCell(A, sgA);
    const cb = edgeCell(B, -sgA);
    if (!ca || !cb) {
      notch.push(0);
      continue;
    }
    notch.push(+Math.abs(tOf(ca, A.fr) - tOf(cb, B.fr)).toFixed(3));
  }
  for (let i = 0; i < ordered.length; i++) if (order[i] === order[(i + 1) % ordered.length]) sameOrder++;
  return { spine, spineRaw, notch, sameOrder, order };
}

/* ── SVG ──────────────────────────────────────────────────── */
export function markup(res, { ground = 'light', solid = true } = {}) {
  const g = GROUNDS[ground] || GROUNDS.light;
  return res.paths
    .map((p) =>
      solid
        ? `<path d="${p.d}" fill="${mix(g.bg, g.ink, p.tone)}"/>`
        : `<path d="${p.d}" fill="${g.ink}" fill-opacity="${p.tone.toFixed(3)}"/>`,
    )
    .join('');
}

/**
 * 取景。full 是整颗（含支尾，直径约 29.6 用户单位）。
 * tip 对着最上面那一支的尖 —— 圆心跟着尖走，因为收圆会把尖往回退
 * （见 planRows 的说明），固定取景框会把它裁出画外。core 对着中心。
 */
export const VIEW = {
  full: { box: 30.2, cx: 0, cy: 0 },
  core: { box: 9.4, cx: 0, cy: 0 },
};

export function viewOf(res, name, box = 7.2) {
  if (name === 'tip') return { box, cx: 0, cy: res.stats.tipY };
  return VIEW[name] ?? VIEW.full;
}

export function svg(opts, { size = 200, ground = 'light', view = 'full', label = '', box = 7.2 } = {}) {
  const res = star(opts);
  const g = GROUNDS[ground] || GROUNDS.light;
  const v = typeof view === 'string' ? viewOf(res, view, box) : view;
  const { box: b, cx, cy } = v;
  // 浅底不画自己的底色（让它落在卡片上）；深底要画，否则浅色的星在浅底上看不见
  const bg = ground === 'dark' ? `background:${g.bg};` : '';
  return (
    `<svg width="${size}" height="${size}" viewBox="${f(cx - b / 2)} ${f(cy - b / 2)} ${f(b)} ${f(b)}" ` +
    `style="${bg}border-radius:6px" role="img" aria-label="${label || '六芒星'}">` +
    markup(res, { ground }) +
    `</svg>`
  );
}

export function bytesOf(opts) {
  return markup(star(opts)).length;
}

/* ── 完成度预设 ───────────────────────────────────────────── */
/**
 * 四档打磨程度。都守住同一组几何（支长 16 / 半宽 1.9 / 支尾 1.7 / 光向固定），
 * 只在这五个旋钮上走：截面边数、脊高、棱上圆角、尖端做法、明暗档数。
 * 名字按「打磨到什么程度」排，不是按好看程度。
 */
export const PRESETS = {
  crisp: {
    name: '锐利晶体',
    note: '八边截面 + 五档明暗 + 硬尖。每个角都留着，档数拉到最细 —— 最像一块被切开的水晶。',
    opts: {
      sides: 8,
      fold: 1.35,
      fillet: 0.06,
      tip: { kind: 'cusp' },
      tones: { steps: 5, min: 0.1, max: 0.94, depth: 0.22 },
      hub: { mode: 'split', radius: 2.5, split: 0.55 },
    },
  },
  frost: {
    name: '磨砂',
    note: '六边截面 + 四档 + 棱上一点圆角 + 尖削平一线。棱还在，但已经不扎手。',
    opts: {
      sides: 6,
      fold: 1.0,
      fillet: 0.14,
      tip: { kind: 'flat', len: 0.5 },
      tones: { steps: 4, min: 0.18, max: 0.88, depth: 0.24 },
      hub: { mode: 'table', radius: 2.3 },
    },
  },
  soft: {
    name: '柔钝',
    note: '四边截面 + 三档 + 大圆角 + 尖收圆。明暗只剩三层，边也磨圆了，像一块被摸久了的玉。',
    opts: {
      sides: 4,
      fold: 1.05,
      fillet: 0.24,
      tip: { kind: 'round', rho: 0.24, segs: 3 },
      tones: { steps: 3, min: 0.26, max: 0.82, depth: 0.3 },
      hub: { mode: 'pale', radius: 2.4 },
    },
  },
  max: {
    name: '极致',
    note: '八边 + 五档 + 大圆角 + 圆尖 + 边界最宽的一档明暗。最贵的一档，拿来看上限。',
    opts: {
      sides: 8,
      fold: 1.55,
      fillet: 0.2,
      tip: { kind: 'round', rho: 0.12, segs: 4 },
      tones: { steps: 5, min: 0.06, max: 0.97, depth: 0.2 },
      hub: { mode: 'split', radius: 2.7, split: 0.6 },
    },
  },
};

export const PRESET_KEYS = ['crisp', 'frost', 'soft', 'max'];
export const preset = (k) => (PRESETS[k] ? PRESETS[k].opts : {});

/* ── 挂载 ─────────────────────────────────────────────────── */
/** 把一个 opts 画进容器。返回读数，方便页面上顺手写出来 */
export function mount(el, opts, { size = 200, ground = 'light', view = 'full', box = 7.2, label = '' } = {}) {
  if (!el) return null;
  el.innerHTML = svg(opts, { size, ground, view, box, label });
  return star(opts).stats;
}

/**
 * 满页挂载：扫过所有带 data-star 的元素。
 * data-star 的值是一串逗号分隔的设置，写法：
 *   preset:crisp        取一档预设
 *   sides=8,fold=1.2    直接给旋钮
 *   tip=round:0.2:3     尖端（cusp / flat:len / round:rho:segs）
 *   tones=4:0.16:0.9:0.22   明暗（档数:最亮:最暗:深度权重）
 *   hub=split:2.5:0.55  中心（none / table / split / pale）
 *   legacy              现役那张平风筝
 * 其余：data-size 像素、data-view full|tip|core、data-ground light|dark、data-box 取景框宽。
 */
export function mountGallery(root = document) {
  const readOpts = (spec) => {
    const o = {};
    for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [k, v] = part.split('=');
      if (k === 'preset') Object.assign(o, preset(v));
      else if (k === 'legacy') o.legacy = true;
      else if (k === 'tip' && v) {
        const [kind, a, b] = v.split(':');
        o.tip = kind === 'flat' ? { kind, len: +a } : kind === 'round' ? { kind, rho: +a, segs: +b } : { kind: 'cusp' };
      } else if (k === 'tones' && v) {
        const [steps, min, max, depth] = v.split(':').map(Number);
        o.tones = { steps, min, max, depth };
      } else if (k === 'hub' && v) {
        const [mode, radius, split] = v.split(':');
        o.hub = { mode, radius: +radius, split: +split };
      } else if (v != null && v !== '' && !Number.isNaN(+v)) o[k] = +v;
    }
    return o;
  };
  const out = [];
  for (const el of root.querySelectorAll('[data-star]')) {
    const st = mount(el, readOpts(el.dataset.star), {
      size: +el.dataset.size || 200,
      ground: el.dataset.ground || 'light',
      view: el.dataset.view || 'full',
      box: +el.dataset.box || 7.2,
      label: el.dataset.label || '',
    });
    if (st) out.push({ el, stats: st });
  }
  return out;
}