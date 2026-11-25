/* ─────────────────────────────────────────────────────────────
   姿态核心（纯数学，无 three、无 DOM）
   ─────────────────────────────────────────────────────────────
   这一个文件是「哪一格姿态好看」这件事的唯一真值。它做四件事：

   1. 造一颗实心六芒星的三角面表（六支沿 ±x ±y ±z，八角截面倒角）。
   2. 把姿态 (yaw, pitch) 解释成「看的方向」：world→view 旋转 = Rx(pitch)·Ry(yaw)，
      与 design/mocks/star-solid/star-solid.js 的 pose() 同一套读数
      （所以那份研究里 9.24–16.00 的半径数字可以在这里直接复算）。
   3. 正交投影 + 自己光栅化出一张剪影掩码（不依赖 WebGL，Node 与浏览器共用）。
   4. 从掩码与六支端点算出评分用的量：六支投影半径、主轴比、六重谐波、四重/三重谐波。

   为什么自己光栅化而不 readPixels：扫一遍 yaw×pitch 是两百多格，
   Node 里跑完再往页面送 JSON 比在浏览器里开渲染目标读回快得多，
   而且「分数」这件事必须是可复算的 —— 它得写进 notes.md。
   three 画出来的剪影与这里的掩码一致度由页面里的自检报数（见 src.js 的 maskCheck）。
   ───────────────────────────────────────────────────────────── */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/* ── 几何 ─────────────────────────────────────────────────── */

/* 支的形状：一条沿轴的「鼓腹 → 收尖」剖面。z 是支长的比例，w 是腰半径的比例。
   量第一版原型 0.175 的腰比时六支仍是六根细针；0.36 以上凹口浅到读成一个球。
   0.30 附近是「读得出星、又有一点肉」的位置 —— 具体形状见 .shapes.html 那一排对照。 */
export const SHAPE = Object.freeze({
  tip: 1,
  waist: 0.30,
  chamfer: 0.34,
  /* [沿轴位置, 半径比例]。z=0.16 处最粗，往尖端一路收 —— 收法用平滑曲线，
     线性收会得到六根锥形签子，读不出「一块料」。 */
  stations: [
    { z: 0.0, w: 0.52 },
    { z: 0.16, w: 1.0 },
    { z: 0.42, w: 0.72 },
    { z: 0.68, w: 0.38 },
    { z: 0.86, w: 0.16 },
  ],
});

const AXES = [
  { d: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], name: 'x' },
  { d: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], name: 'y' },
  { d: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], name: 'z' },
];

/**
 * 正八边形（外接圆半径 r），四个「面」正对 ±u ±v，另四个面是切角。
 * 八个顶点外接圆半径相同 —— 这一条是必需的：若按「正方形砍角」取点，
 * 角点半径会比轴点大 22%，剪影上就长出八道小凸疣，读感立刻变成「雕坏的」。
 * c 只决定切角占多宽（0 = 正方形，0.414 = 正八边形），不改变外接圆。
 */
function octagon(radius, c) {
  /* 正方形半宽 a = r·cos22.5；顶点按 a 与 a(1−c) 交替给出，再整体缩到外接圆 r */
  const a = radius * Math.cos(Math.PI / 8);
  const k = a * (1 - Math.max(0, Math.min(0.414, c)) / 0.414);
  const pts = [
    [a, k], [k, a], [-k, a], [-a, k],
    [-a, -k], [-k, -a], [k, -a], [a, -k],
  ];
  const m = Math.max(...pts.map(([u, v]) => Math.hypot(u, v)));
  const s = radius / m;
  return pts.map(([u, v]) => [u * s, v * s]);
}

/**
 * 六芒星的三角面表。
 * 每支是一条八角柱从根部一路收到尖端，尖点单独一个顶点 ——
 * 六支的根部在原点附近互相穿插，深度缓冲会把里面的面挡掉，不必做布尔并集。
 * 返回非索引三角形（positions 每 9 个数一个三角形），绕向统一朝外。
 */
export function buildStar(over = {}) {
  const S = { ...SHAPE, ...over };
  const pos = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const tri = (p0, p1, p2, ref) => {
    const n = cross(sub(p1, p0), sub(p2, p0));
    const cen = [
      (p0[0] + p1[0] + p2[0]) / 3 - ref[0],
      (p0[1] + p1[1] + p2[1]) / 3 - ref[1],
      (p0[2] + p1[2] + p2[2]) / 3 - ref[2],
    ];
    if (dot(n, cen) < 0) {
      pos.push(p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p1[0], p1[1], p1[2]);
    } else {
      pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    }
  };

  for (const A of AXES) {
    for (const sg of [1, -1]) {
      const at = (u, v, z) => [
        A.d[0] * sg * z + A.u[0] * u + A.v[0] * v,
        A.d[1] * sg * z + A.u[1] * u + A.v[1] * v,
        A.d[2] * sg * z + A.u[2] * u + A.v[2] * v,
      ];
      const ref = [A.d[0] * sg * S.tip * 0.55, A.d[1] * sg * S.tip * 0.55, A.d[2] * sg * S.tip * 0.55];
      const rings = S.stations.map((s) =>
        octagon(S.waist * s.w, S.chamfer).map(([u, v]) => at(u, v, s.z * S.tip)),
      );
      const tipPoint = at(0, 0, S.tip);
      for (let s = 0; s < rings.length - 1; s++) {
        const A0 = rings[s];
        const B0 = rings[s + 1];
        for (let i = 0; i < 8; i++) {
          const j = (i + 1) % 8;
          tri(A0[i], B0[i], B0[j], ref);
          tri(A0[i], B0[j], A0[j], ref);
        }
      }
      const last = rings[rings.length - 1];
      for (let i = 0; i < 8; i++) tri(tipPoint, last[i], last[(i + 1) % 8], ref);
      /* 根部封口：六支的根互相埋着，这圈面基本看不见，但能保证不漏 */
      const first = rings[0];
      const centre = at(0, 0, 0);
      for (let i = 0; i < 8; i++) tri(centre, first[(i + 1) % 8], first[i], ref);
    }
  }
  return { positions: new Float32Array(pos), tris: pos.length / 9 };
}

/* ── 姿态 ─────────────────────────────────────────────────── */

/**
 * (yaw, pitch) → world→view 的 3×3（行主序，返回 9 个数）。
 * 与 star-solid 的 pose() 同式：先绕竖直轴 yaw，再把水平面按 pitch 压下去。
 * three 里对应的物体朝向是这张矩阵的转置（见 src.js 的 eulerFor）。
 */
export function viewMatrix(yawDeg, pitchDeg) {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cp = Math.cos(p);
  const sp = Math.sin(p);
  /* Ry */
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  /* Rx */
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const m = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = Rx[r * 3] * Ry[c] + Rx[r * 3 + 1] * Ry[3 + c] + Rx[r * 3 + 2] * Ry[6 + c];
    }
  }
  return m;
}

const apply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/* ── 任意朝向：绕一个世界轴转 t 度 ──
   姿态不只有 yaw/pitch 两个参数：绕视轴滚（roll）在屏幕上只是把星转一圈，
   而绕对角轴转出来的姿态根本不在 yaw/pitch 图上的同一条线里。
   所以真正要扫的是整颗视球 + 滚角，见 enumerateSphere()。 */
export function rotAxis(axis, deg) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const [x, y, z] = [axis[0] / l, axis[1] / l, axis[2] / l];
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

/** 3×3 相乘（行主序） */
export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

export function transpose3(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** 世界坐标里的视线方向（单位向量）—— 也就是「我们从这个方向看这颗星」 */
export function viewDir(yawDeg, pitchDeg) {
  const m = viewMatrix(yawDeg, pitchDeg);
  /* 视空间 −z 是镜头朝的方向；世界坐标里它就是 Mᵀ·(0,0,−1) = −第三行 */
  return [-m[6], -m[7], -m[8]];
}

/** 视线方向 → (yaw, pitch)，用于报告 */
export function dirToYawPitch([x, y, z]) {
  const pitch = Math.asin(Math.max(-1, Math.min(1, y))) / DEG;
  let yaw = Math.atan2(x, z) / DEG;
  if (yaw < 0) yaw += 360;
  return { yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) };
}

/** 由视线方向造一个 world→view 矩阵（先用与 pose() 一致的约定，再由调用方接 roll） */
export function matrixForDir(dir) {
  const d = dir;
  const { yaw, pitch } = dirToYawPitch(d);
  return viewMatrix(yaw, pitch);
}

/**
 * 六支端点投影到屏幕上（正交；屏幕 y 向下）。
 * radius 是「这一支离星心多远」，也就是 star-solid 里那张 9.24–16.00 的读数。
 */
export function tips(yawDeg, pitchDeg, r = 1) {
  const m = viewMatrix(yawDeg, pitchDeg);
  const out = [];
  for (const A of AXES) {
    for (const sg of [1, -1]) {
      const v = [A.d[0] * sg * r, A.d[1] * sg * r, A.d[2] * sg * r];
      const w = apply(m, v);
      const x = w[0];
      const y = -w[1];
      out.push({ axis: A.name, sign: sg, x, y, z: w[2], radius: Math.hypot(x, y) });
    }
  }
  return out;
}

/** 同一件事，但直接吃一个 world→view 矩阵（绕对角轴的姿态走这条） */
export function tipsM(matrix, r = 1) {
  const out = [];
  for (const A of AXES) {
    for (const sg of [1, -1]) {
      const w = apply(matrix, [A.d[0] * sg * r, A.d[1] * sg * r, A.d[2] * sg * r]);
      out.push({ axis: A.name, sign: sg, x: w[0], y: -w[1], z: w[2], radius: Math.hypot(w[0], w[1]) });
    }
  }
  return out;
}

/* ── 剪影光栅化 ───────────────────────────────────────────── */

export const SCAN = 144; /* 掩码边长（px），够算角度分布，也够算 IoU */
export const HALF = 1.12; /* 半视高（世界单位）：六支端点最长 1.0，留一圈余量 */

/**
 * 把 yaw/pitch 姿态下的星体正交投影并光栅化成 0/1 掩码。
 * 返回 { mask, size } —— mask 是 size×size 的 Uint8Array，1 = 星。
 */
export function rasterize(mesh, yawDeg, pitchDeg, { size = SCAN, half = HALF } = {}) {
  const m = viewMatrix(yawDeg, pitchDeg);
  const P = mesh.positions;
  const s = size / 2 / half;
  const c = size / 2;
  const mask = new Uint8Array(size * size);
  /* 顶点投影一次，三角形再扫 */
  const n = P.length / 3;
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = apply(m, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    sx[i] = c + v[0] * s;
    sy[i] = c - v[1] * s;
  }
  const edge = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let t = 0; t < n / 3; t++) {
    const a = t * 3;
    const b = a + 1;
    const d = a + 2;
    const minX = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[d])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(sx[a], sx[b], sx[d])));
    const minY = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[d])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(sy[a], sy[b], sy[d])));
    if (maxX < minX || maxY < minY) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = edge(sx[a], sy[a], sx[b], sy[b], px, py);
        const w1 = edge(sx[b], sy[b], sx[d], sy[d], px, py);
        const w2 = edge(sx[d], sy[d], sx[a], sy[a], px, py);
        /* 两个绕向都收：面表的绕向已经统一，这里不要因为符号把细支丢掉 */
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
          mask[y * size + x] = 1;
        }
      }
    }
  }
  return { mask, size };
}

/* ── 从剪影读数 ───────────────────────────────────────────── */

const BINS = 720;

/** 剪影的极径剖面 R(θ)：每个角度上最远的那个像素离星心多远（像素） */
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
      if (a < 0) a += TAU;
      const b = Math.min(BINS - 1, (a / TAU) * BINS) | 0;
      if (r > R[b]) R[b] = r;
    }
  }
  return R;
}

/** R(θ) 里 k 重谐波的幅度（相对均值）。正六芒星在 k=6 上最大 */
function harmonic(R, k) {
  let re = 0;
  let im = 0;
  let sum = 0;
  for (let i = 0; i < BINS; i++) {
    const th = ((i + 0.5) / BINS) * TAU;
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
    const x = a[i];
    const y = b[i];
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni ? inter / uni : 0;
}

/**
 * 一格姿态的全部读数。评分只用其中三项，其余全部留档（notes.md 要能复核）。
 *
 * balance  六支投影半径的 min/max。1 = 六支等长（正六芒星），0 = 有一支正对镜头、看不见
 * aspect   剪影像素协方差的两个特征值之比开方。1 = 不像一条线，低 = 正在塌成一条
 * a6/a4/a3 极径剖面里的六重 / 四重 / 三重谐波幅度 —— 「读起来是几角的星」
 * sixShare a6 在 a3..a6 里的占比 —— 「六角」这个读法有多纯
 * fill     剪影面积 ÷ (π·最长半径²) —— 丰腴还是清瘦（本身不分好坏，留档用）
 */
export function measure(mesh, yawDeg, pitchDeg, opts = {}) {
  const size = opts.size ?? SCAN;
  const half = opts.half ?? HALF;
  const { mask } = rasterize(mesh, yawDeg, pitchDeg, { size, half });
  return measureMask(mesh, mask, size, yawDeg, pitchDeg, opts);
}

/**
 * 只给了一个现成的掩码时也能量。
 * matrix 是「这个世界朝向 → 视空间」的矩阵，六支半径要用它重算
 * （roll 不改变半径，但绕对角轴的转法会）。
 */
export function measureMask(mesh, mask, size, yawDeg, pitchDeg, opts = {}) {
  const matrix = opts.matrix ?? viewMatrix(yawDeg, pitchDeg);
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
  if (!area) {
    return { yaw: yawDeg, pitch: pitchDeg, area: 0, balance: 0, aspect: 0, a3: 0, a4: 0, a6: 0, sixShare: 0, fill: 0, mask };
  }
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

  const T = tipsM(matrix);
  const radii = T.map((t) => t.radius);
  const rMin = Math.min(...radii);
  const rMax = Math.max(...radii);
  const balance = rMax > 0 ? rMin / rMax : 0;

  return {
    yaw: +yawDeg.toFixed(3),
    pitch: +pitchDeg.toFixed(3),
    area,
    balance: +balance.toFixed(4),
    rMin: +rMin.toFixed(4),
    rMax: +rMax.toFixed(4),
    aspect: +aspect.toFixed(4),
    a3: +a3.toFixed(4),
    a4: +a4.toFixed(4),
    a6: +a6.toFixed(4),
    sixShare: +sixShare.toFixed(4),
    fill: +((area / (Math.PI * rmax * rmax)) || 0).toFixed(4),
    mask,
  };
}

/* ── 分数 ─────────────────────────────────────────────────── */

/* 三项加权，常数是一次扫完看分布之后定的（notes.md §1 有那张分布表）：
   balance 是主项 —— 六支不等长是「看着不对」最直接的来源；
   aspect 防塌陷；a6 防「读成四角/三角」。 */
export const SCORE_W = { balance: 0.44, aspect: 0.26, a6: 0.2, sixShare: 0.1 };

export function scoreOf(m, w = SCORE_W) {
  const bal = clamp01(m.balance);
  const asp = clamp01((m.aspect - 0.5) / 0.38);
  const six = clamp01(m.a6 / 0.34);
  const share = clamp01((m.sixShare - 0.42) / 0.4);
  return Math.round(100 * (w.balance * bal + w.aspect * asp + w.a6 * six + w.sixShare * share));
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* 评价档：70 以上算「可以停住」，55–70 「能过」，55 以下「不该被停住」 */
export const GOOD = 70;
export const PASS = 55;

/* ── 扫描 ─────────────────────────────────────────────────── */

/** 密扫的那个网格：yaw 与 pitch 各 15 档（0–90°，6° 一格） */
export const GRID_STEP = 6;
export const gridAxis = () => {
  const out = [];
  for (let a = 0; a < 90; a += GRID_STEP) out.push(a);
  return out;
};

export function scanGrid(mesh) {
  const yaws = gridAxis();
  const pitches = gridAxis();
  const rows = [];
  for (const pitch of pitches) {
    const row = [];
    for (const yaw of yaws) {
      const m = measure(mesh, yaw, pitch);
      row.push({ ...m, score: scoreOf(m), mask: undefined });
    }
    rows.push({ pitch, cells: row });
  }
  return { yaws, pitches, rows };
}

/* ── 整颗视球 ───────────────────────────────────────────────
   上面那张 yaw×pitch 表只覆盖了「绕竖直轴转 + 俯仰」一种看法。
   但这颗星是立方对称的（三个正交双锥），视球上真正不同的看法只有
   yaw 90° × pitch 90° 一个格 — 剩下的都是对称重复。要找出所有好姿态，
   就得在这个格子里均匀撒点（沿对角线把立方体翻过来最省事），
   每个点再叠 15° 一档的滚角。 */

/** 立方体对称群：24 个真旋转（用「三条轴落到三条轴」的置换 + 符号枚举） */
export function cubeGroup() {
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const mats = [];
  for (const p of perms) {
    for (let bits = 0; bits < 8; bits++) {
      const s = [(bits & 1) ? -1 : 1, (bits & 2) ? -1 : 1, (bits & 4) ? -1 : 1];
      /* 列 c 是 e_{p[c]} 乘符号；行列式 +1 才是真旋转 */
      const m = new Array(9).fill(0);
      for (let c = 0; c < 3; c++) m[p[c] * 3 + c] = s[c];
      const det =
        m[0] * (m[4] * m[8] - m[5] * m[7]) -
        m[1] * (m[3] * m[8] - m[5] * m[6]) +
        m[2] * (m[3] * m[7] - m[4] * m[6]);
      if (det > 0.9) mats.push(m);
    }
  }
  return mats;
}

/** 两个朝向是否「看起来一样」：掩码 IoU */
export function sameLook(a, b) {
  return maskIoU(a, b) > 0.985;
}

/**
 * 在一个对称基本区里采样朝向，去重后按分数排。
 * 采样用 Fibonacci 球面点（视线方向）+ 若干滚角 —— 这样既覆盖极点，
 * 也不会像经纬网格那样在极区挤成一堆。
 */
export function enumerateSphere(mesh, { n = 420, rolls = [0, 15, 30, 45, 60, 75], size = 96 } = {}) {
  const group = cubeGroup();
  const seen = []; /* 每个元素 { mask, yaw, pitch, roll, score, ... } */
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i;
    /* 只看上半球再叠对称群，等于看整个球 —— 但为了不漏，这里整个球都撒 */
    const dir = [Math.cos(th) * rad, y, Math.sin(th) * rad];
    for (const roll of rolls) {
      const base = matrixForDir(dir);
      const m = mul3(rotAxis([0, 0, 1], roll), base);
      const { mask } = rasterizeM(mesh, m, { size });
      const res = measureMask(mesh, mask, size, 0, 0, { matrix: m });
      if (res.area === 0) continue;
      const cand = { ...res, score: scoreOf(res), dir, roll, matrix: m, mask };
      /* 与已收下的比一比：只要跟任何一个「看起来一样」就丢掉 */
      let dup = false;
      for (const s of seen) {
        if (Math.abs(s.area - cand.area) > size * size * 0.06) continue;
        if (sameLook(s.mask, cand.mask)) { dup = true; break; }
      }
      if (!dup) seen.push(cand);
    }
  }
  seen.sort((a, b) => b.score - a.score);
  return seen;
}

/** 直接吃一个矩阵的光栅化（enumerateSphere 用） */
export function rasterizeM(mesh, m, { size = 96, half = HALF } = {}) {
  const P = mesh.positions;
  const s = size / 2 / half;
  const c = size / 2;
  const mask = new Uint8Array(size * size);
  const n = P.length / 3;
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = apply(m, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    sx[i] = c + v[0] * s;
    sy[i] = c - v[1] * s;
  }
  const edge = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let t = 0; t < n / 3; t++) {
    const a = t * 3;
    const b = a + 1;
    const d = a + 2;
    const minX = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[d])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(sx[a], sx[b], sx[d])));
    const minY = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[d])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(sy[a], sy[b], sy[d])));
    if (maxX < minX || maxY < minY) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = edge(sx[a], sy[a], sx[b], sy[b], px, py);
        const w1 = edge(sx[b], sy[b], sx[d], sy[d], px, py);
        const w2 = edge(sx[d], sy[d], sx[a], sy[a], px, py);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) mask[y * size + x] = 1;
      }
    }
  }
  return { mask, size };
}

/** 从「投影后的六支端点角度」算相邻间隔的均衡度 —— 六支互成 60° 才像六芒星 */
export function spacing(mesh, matrix) {
  const T = tipsM(matrix);
  const ang = T.map((t) => {
    let a = Math.atan2(t.y, t.x) / DEG;
    return a;
  }).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < 6; i++) {
    const d = i === 5 ? ang[0] + 360 - ang[5] : ang[i + 1] - ang[i];
    gaps.push(d);
  }
  const mean = 60;
  const dev = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / 6);
  return { gaps: gaps.map((g) => +g.toFixed(2)), dev: +dev.toFixed(3) };
}