/* ─────────────────────────────────────────────────────────────
   星 · WebGL（design/mocks/star-gl）—— 深度缓冲能不能救中心
   ─────────────────────────────────────────────────────────────
   前情（design/mocks/star-final/notes.md §2.3）：合成那颗星在 SVG 上失败的那一处
   不是形状，是遮挡 —— halfWidth 0.26 让每支宽 8.32 单位，六支都穿过原点，
   半径 4 以内每个像素被至少三层料盖住。平风筝时六片共面，画序怎么排都对；
   一旦截面有厚度，六块的 z 区间互相包住，那是**真的三维互插**，
   任何画家算法都排不出来。当时的退路是把根部收坡到零厚度 —— 中心那段因此没有脊。

   这一份只回答一件事：**换一张真的深度缓冲，中心会不会自己变成一颗晶体。**

   所以这里的几何是**故意不收坡**的：截面在 s = 0 处是满宽，
   六支在原点附近真的互相穿过，谁也不给谁让路。全部交给 GL 的 depth test。

   与 star-final 的口径一致（这样两组读数才可比）：
     · r = 16，halfWidth = 0.26·r = 4.16，侧刃凹 0.04（弦长比例）
     · 脊高 h = fold·W/1.9（star-t-smooth 代码那一档，半张角恒 27.8°）
     · 明暗 4 档，跨度 0.10–0.92，光向 [0.78 0.42 0.45]（视空间）
     · 姿态 yaw 45° / pitch 35.264°，正交投影，画框 40 单位
     · 翻动 x −90° / y −90° / z +90°，错开 12%/0%/5%，弹簧 k 7 / w 5，1550 ms

   与 star-final 的三处**故意不同**：
     ① 没有根坡（girth 固定 1、无 taper）—— 这是这一轮要验的假设
     ② 截面是三维横截面（八边，脊上有一个真正的尖顶），不再是屏幕平面的片
     ③ 明暗来自**面法线**，不是深度；四档量化后的颜色在 precompute 时定死，
        翻动途中不会因为「这一帧的极值变了」而整体换调
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

/* 颜色管理全关：这一页要与 SVG / drawStar() 的那套 sRGB 口算逐字对得上，
   不需要线性工作流。关掉之后 uniform 里的值与十六进制原样同值。
   （写在这里、早于任何材质的创建。） */
THREE.ColorManagement.enabled = false;

/* ── 小工具 ───────────────────────────────────────────────── */
export const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const nrm = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ── 颜色：CSS 变量 → [r,g,b] 0..1 ─────────────────────────── */
/** reality.ts 写进 --amber 等变量的是 `rgb(154,134,196)` 这种字符串，不是十六进制 */
export function parseColor(str, fallback) {
  const s = String(str || '').trim();
  if (!s) return fallback;
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].map(
      (v) => v / 255,
    );
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((v) => !Number.isNaN(v))) return [p[0] / 255, p[1] / 255, p[2] / 255];
  }
  return fallback;
}
export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const rgbCss = (c) =>
  `rgb(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(
    clamp(c[2], 0, 1) * 255,
  )})`;

const cssVar = (name, fallback) => {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** 站点那四个强调色（缺了就退回 tokens.css 的现值） */
export function readPalette() {
  return {
    amber: parseColor(cssVar('--amber', '#9a86c4'), [0x9a / 255, 0x86 / 255, 0xc4 / 255]),
    umber: parseColor(cssVar('--umber', '#4f4a66'), [0x4f / 255, 0x4a / 255, 0x66 / 255]),
    wake: parseColor(cssVar('--wake', '#a7b1ba'), [0xa7 / 255, 0xb1 / 255, 0xba / 255]),
    dream: parseColor(cssVar('--dream', '#9389ae'), [0x93 / 255, 0x89 / 255, 0xae / 255]),
    mix: Number(cssVar('--reality-mix', '1')) || 0,
  };
}

/* ── 姿态 ─────────────────────────────────────────────────── */
export const ISO_PITCH = Math.asin(1 / Math.sqrt(3)) / DEG; // 35.2643897°
export const ISO = Object.freeze({ yaw: 45, pitch: ISO_PITCH });

/** M = Rx(pitch)·Ry(yaw)，与 toolstar.ts 的 drawStar() 同一套 world→view */
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

export const mApply = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function mMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
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
const m3to4 = (m) => new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);

/** 六支在视空间的框架（剪影与评分用；与 star-final 同一个函数） */
export function frames(M) {
  const out = [];
  for (const [name, ax] of [
    ['x', [1, 0, 0]],
    ['y', [0, 1, 0]],
    ['z', [0, 0, 1]],
  ]) {
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
        skip: Lxy < 0.03,
      });
    }
  }
  return out;
}

/* ── 参数 ─────────────────────────────────────────────────── */
/**
 * 截面边数这一段是这一轮**唯一一处改了基线**的决定，记在这里：
 *
 * star-final 用六边（三片正面），它的 notes §2.1 也量过「四边时支内落差 0.029，
 * 与量化台阶同量级，折就白做了」。但那是**沿支身**量的（整支从根到尖的明暗差）。
 * 中心那一小块是另一件事：r ≤ 2.5 单位里只有 3 片料在最前面（六支的 1/2 对称 +
 * 三向对称），这三片的法线落在同一个平面族里，四档量化之后经常只剩 2–3 档 ——
 * 而且分界线是几条长直线，读成「几块板」。
 *
 * 八边的截面把每一支的两侧各折出一道棱。三片料变成六到九片，
 * 中心就有了一条围绕星心的折线，而不是几条穿过去的长边。
 * 代价是每支 13 站 × 8 条棱 = 104 个四边形，六支共 624 片 / 1200 个三角形，
 * 而实测每帧 0.03 ms —— 连 40px 那颗也不构成负担（见 notes §3）。
 */
export const MAIN = Object.freeze({
  r: 16,
  halfWidth: 0.26 * 16, // 4.16
  curve: 0.04, // 侧刃凹进，弦长比例
  fold: 1.0, // 脊高 = fold·W/1.9
  foldMode: 'code',
  /** 8 = 八边截面。4 是「两片大板」，6 是 star-final 那一档，12 更圆 */
  sides: 8,
  /** 沿轴的站（t = s/r，不含尖端的 1）。曲边在根部弯得最快，所以根部密 */
  tS: [0, 0.05, 0.11, 0.18, 0.26, 0.35, 0.45, 0.56, 0.67, 0.78, 0.87, 0.94, 0.98],
  tones: { steps: 4, min: 0.1, max: 0.92, depth: 0 },
  light: nrm([0.78, 0.42, 0.45]),
  box: 40,
});
const merge = (base, patch) => {
  const o = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') o[k] = { ...base[k], ...v };
    else if (v !== undefined) o[k] = v;
  }
  return o;
};
export const cfgOf = (patch) => merge(MAIN, patch);

/* ── 沿轴的剖面（与 star-final 同一个解析式） ─────────────── */
const LXY = Math.sqrt(2 / 3);
export const L_ISO = (r) => r * LXY;

/**
 * 曲边的解析式。star-t-arc 的侧刃是一条二次 Bezier：控制点 = 弦中点沿外法向推 off·弦长。
 * 摊到参数 t 上就是
 *    s(t) = t·L + 2·off·w·t(1−t)          沿轴位置（屏幕单位）
 *    W(t) = w(1−t) + 2·off·L·t(1−t)       该处半宽
 * off < 0 是凹。侧向位移是 off·L 而不是 off·C —— 外法向的侧向分量 L/C 把 C 约掉了。
 */
export function stationAt(t, cfg) {
  const w = cfg.halfWidth;
  const L = L_ISO(cfg.r);
  const off = -(cfg.curve || 0);
  const sScreen = t * L + 2 * off * w * t * (1 - t);
  return {
    t,
    s: sScreen / LXY, // 三维轴向位置
    W: Math.max(0, w * (1 - t) + 2 * off * L * t * (1 - t)),
  };
}
/** 脊高。'code' = fold·W/1.9（t-smooth 代码那一档，半张角恒 27.8°）；'ratio' = fold·W */
const foldH = (cfg, W) => (cfg.foldMode === 'ratio' ? cfg.fold * W : (cfg.fold * W) / 1.9);

/** 沿轴的站表：s = 0 是满宽（**不收坡**），最后一行是尖端的锥点 */
export function stations(cfg) {
  const rows = cfg.tS.map((t) => stationAt(t, cfg));
  rows.push({ t: 1, s: cfg.r, W: 0 });
  return rows;
}

/* ── 几何：六支 × 站 × 截面 → 非索引三角形 ───────────────── */
/**
 * 每支的在体坐标里的一个定基 {a, side, ed}：
 *   a     支的方向（±x ±y ±z）
 *   side  截面的「宽」方向
 *   ed    截面的「脊」方向
 * x → (y, z)、y → (z, x)、z → (x, y)：这是一个绕体对角线 (1,1,1) 的循环，
 * 而八边形的点集在 nu↔de 交换下不变，所以整颗星对 (1,1,1) 有精确的三重对称 ——
 * 等轴视角下剪影因此是一个**正**六芒星，不是「差不多」的六芒星。
 */
const SPIKE_FRAMES = [
  { key: 'x+', a: [1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { key: 'x−', a: [-1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { key: 'y+', a: [0, 1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { key: 'y−', a: [0, -1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { key: 'z+', a: [0, 0, 1], side: [1, 0, 0], ed: [0, 1, 0] },
  { key: 'z−', a: [0, 0, -1], side: [1, 0, 0], ed: [0, 1, 0] },
];

/** 截面的点：正 n 边形内接于 (W, h) 的椭圆上，(1,0) 与 (0,1) 都是顶点 */
function sectionPts(cfg) {
  const n = Math.max(4, Math.round(cfg.sides / 2) * 2);
  const out = [];
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    out.push([Math.cos(th), Math.sin(th)]);
  }
  return out;
}

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

const GEO_CACHE = new Map();
/**
 * 造一颗星的三维网格。
 * 返回 { position, normal, count, tris, faces:[{n, z}], stats }
 *
 * 「平法线 per 片」：每一格（两站 × 两截面点）算一条法线，两个三角形共用。
 * 这样面上的调子是**整片一个值**，量化之后读得出「这是几个面」，
 * 而不是逐三角形抖动（star-final 在 SVG 上撞到的抗锯齿细纹就是逐三角形那份）。
 */
export function buildGeometry(cfgIn) {
  const cfg = cfgOf(cfgIn);
  const key = [cfg.r, cfg.halfWidth, cfg.curve, cfg.fold, cfg.foldMode, cfg.sides, cfg.tS.join(',')].join('|');
  const hit = GEO_CACHE.get(key);
  if (hit) return hit;

  const rows = stations(cfg);
  const sec = sectionPts(cfg);
  const pos = [];
  const nor = [];
  const faces = [];
  const P = (fr, row, sp) => {
    const W = row.W;
    const c = sp[0] * W;
    const d = sp[1] * foldH(cfg, W);
    return [
      fr.a[0] * row.s + fr.side[0] * c + fr.ed[0] * d,
      fr.a[1] * row.s + fr.side[1] * c + fr.ed[1] * d,
      fr.a[2] * row.s + fr.side[2] * c + fr.ed[2] * d,
    ];
  };
  const tri = (a, b, c, n) => {
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
    }
  };

  for (const fr of SPIKE_FRAMES) {
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < sec.length; j++) {
        const j2 = (j + 1) % sec.length;
        const q = [P(fr, rows[i], sec[j]), P(fr, rows[i], sec[j2]), P(fr, rows[i + 1], sec[j2]), P(fr, rows[i + 1], sec[j])];
        const nuMid = (sec[j][0] + sec[j2][0]) / 2;
        const deMid = (sec[j][1] + sec[j2][1]) / 2;
        const expect = nrm([
          fr.side[0] * nuMid + fr.ed[0] * deMid,
          fr.side[1] * nuMid + fr.ed[1] * deMid,
          fr.side[2] * nuMid + fr.ed[2] * deMid,
        ]);
        const mid = [0, 1, 2].map((k) => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4);
        /* 面积太小的格（尖端那两格里有重合点）不算一片 */
        const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
        const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
        const a1 = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
        const e3 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
        const a2 = Math.hypot(e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]);
        if (a1 + a2 < 1e-7) continue;
        const n = newell(q, expect);
        const same = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1], p[2] - r[2]) < 1e-7;
        const tri0 = pos.length / 9;
        tri(q[0], q[1], q[2], n);
        if (!same(q[2], q[3])) tri(q[0], q[2], q[3], n);
        const tri1 = pos.length / 9;
        faces.push({ n, mid, spike: fr.key, band: i, side: j, tri0, tri1 });
      }
    }
  }

  const g = {
    position: new Float32Array(pos),
    normal: new Float32Array(nor),
    count: pos.length / 3,
    tris: pos.length / 9,
    faces,
    cfg,
    stats: {
      spikes: SPIKE_FRAMES.length,
      stations: rows.length,
      section: sec.length,
      faces: faces.length,
      tris: pos.length / 9,
    },
  };
  GEO_CACHE.set(key, g);
  return g;
}

/**
 * 同一个网格的「画家序」变体：不靠深度缓冲，靠画序。
 * 每一支的三角形按包围盒中心 z 从远到近重排（支与支之间整体按支心 z 排），
 * 再配上 depthTest: false —— 也就是 SVG 那条路线的极限做法：
 * 逐三角形排序，画到的每片都盖住前面的。
 *
 * 唯一用途是当对照：它**必然**在中心出错，因为六支的 z 区间互相包住，
 * 「A 片的近端压在 B 片的远端上面」不是排序能解决的事，是几何本身在互插。
 * 把这一格放在深度缓冲那一格旁边，中心到底有没有被修好，一眼就能判。
 */
export function painterVertices(cfgIn) {
  const cfg = cfgOf(cfgIn);
  const g = buildGeometry(cfg);
  const faces = [];
  const tri = g.count / 3;
  for (let i = 0; i < tri; i++) {
    const o = i * 9;
    const n = [g.normal[o], g.normal[o + 1], g.normal[o + 2]];
    const c = [0, 1, 2].map((k) => (g.position[o + k] + g.position[o + 3 + k] + g.position[o + 6 + k]) / 3);
    /* 支号由面法线所在的那一支决定：法线的最大分量方向就是这一片的归属 */
    const ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    const spike = (n[ax] > 0 ? 1 : -1) * (ax + 1);
    faces.push({ i, c, spike, n });
  }
  /* 先按支（支心 z）、再按片（片心 z），都由远到近 */
  const spikeZ = new Map();
  for (const f of faces) {
    const vz = mApply(M_REST, [f.n[0], f.n[1], f.n[2]])[2]; // 视空间的 z
    if (!spikeZ.has(f.spike)) spikeZ.set(f.spike, []);
    spikeZ.get(f.spike).push(vz);
  }
  const order = [...spikeZ.keys()].sort((a, b) => mean(spikeZ.get(a)) - mean(spikeZ.get(b)));
  const rank = new Map(order.map((k, i) => [k, i]));
  faces.sort((a, b) => rank.get(a.spike) - rank.get(b.spike) || a.c[2] - b.c[2]);
  const pos = new Float32Array(g.position.length);
  const nor = new Float32Array(g.normal.length);
  faces.forEach((f, k) => {
    pos.set(g.position.subarray(f.i * 9, f.i * 9 + 9), k * 9);
    nor.set(g.normal.subarray(f.i * 9, f.i * 9 + 9), k * 9);
  });
  return { position: pos, normal: nor, count: g.count };
}
function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / (a.length || 1);
}

/* ── 凹口半径 / 剪影 / 评分（照抄 star-final，口径不变才可比） ── */
const NOTCH_MEMO = new Map();
export function notchRadius(cfgIn) {
  const cfg = cfgOf(cfgIn);
  const k = `${cfg.r}|${cfg.halfWidth}|${cfg.curve}`;
  if (NOTCH_MEMO.has(k)) return NOTCH_MEMO.get(k);
  let val;
  if (!(cfg.curve > 0)) {
    const th = Math.PI / 6;
    const w = cfg.halfWidth;
    const L = L_ISO(cfg.r);
    const t = (w * Math.cos(th)) / (L * Math.sin(th) + w * Math.cos(th));
    val = +(w * Math.sin(th) + t * (L * Math.cos(th) - w * Math.sin(th))).toFixed(4);
  } else {
    const polys = outlinePoly(cfg, cfg.m || M_REST, 90);
    let mn = Infinity;
    for (let i = 0; i < 540; i++) {
      const a = (i / 540) * Math.PI * 2;
      let r = 0;
      for (const poly of polys) r = Math.max(r, rayExit(poly, Math.cos(a), Math.sin(a)));
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
export function outlinePoly(cfgIn, M, nSide = 14) {
  const cfg = cfgOf(cfgIn);
  const out = [];
  for (const fr of frames(M)) {
    if (fr.skip) continue;
    const pt = (s, c) => [(fr.a[0] * s + fr.side[0] * c) / cfg.r, -(fr.a[1] * s + fr.side[1] * c) / cfg.r];
    const pts = [];
    for (let i = 0; i <= nSide; i++) {
      const st = stationAt(i / nSide, cfg);
      pts.push(pt(st.s, -st.W));
    }
    for (let i = nSide; i >= 0; i--) {
      const st = stationAt(i / nSide, cfg);
      pts.push(pt(st.s, +st.W));
    }
    out.push(pts);
  }
  return out;
}
const HALF_VIEW = 1.15;
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
        if (wy >= a[1] !== wy >= b[1]) xs.push(a[0] + ((wy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
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
export const SCORE_W = { balance: 0.44, aspect: 0.26, a6: 0.2, sixShare: 0.1 };
export const GOOD = 70;
export const PASS = 55;
/**
 * a6 与栅格尺寸强耦合（96px 上 0.664、192px 上 0.455、72px 上 0.781）——
 * 所以「归一化基准」必须与「采样尺寸」是同一个数，否则分数会凭空虚高。
 * 全页统一 96，calibrate() 也在 96 上取一次基准。
 */
export const SCORE_SIZE = 96;
/** 正位实测的 a6 在运行时填进来（自校准，与 star-final 的 0.434 同一个做法） */
export let A6_REF = 0.664;
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function scoreOf(m) {
  const bal = c01(m.balance);
  const asp = c01((m.aspect - 0.5) / 0.38);
  const six = c01(m.a6 / A6_REF);
  const share = c01((m.sixShare - 0.42) / 0.4);
  return Math.round(100 * (SCORE_W.balance * bal + SCORE_W.aspect * asp + SCORE_W.a6 * six + SCORE_W.sixShare * share));
}
export function measurePose(cfgIn, M, size = SCORE_SIZE) {
  const cfg = cfgOf(cfgIn);
  const mask = rasterizePolys(outlinePoly(cfg, M, 12), size);
  const c = size / 2;
  let area = 0;
  let mx = 0;
  let my = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < size; y++)
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
    }
  if (!area) return { area: 0, balance: 0, aspect: 0, a6: 0, sixShare: 0, score: 0 };
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
  const radii = frames(M).map((p) => p.Lxy);
  const balance = Math.max(...radii) > 0 ? Math.min(...radii) / Math.max(...radii) : 0;
  const m = {
    area,
    balance,
    aspect,
    a3,
    a4,
    a6,
    sixShare: a6 / Math.max(1e-6, a3 + a4 + a5 + a6),
  };
  return { ...m, score: scoreOf(m) };
}
export function calibrate(cfg = MAIN) {
  const m = measurePose(cfg, M_REST, SCORE_SIZE);
  A6_REF = m.a6 || 0.664;
  return { a6: +m.a6.toFixed(4), A6_REF: +A6_REF.toFixed(4), size: SCORE_SIZE };
}

/* ── 运动：三轴错开的一次翻动 ─────────────────────────────── */
export const TUMBLE = {
  sign: [-1, -1, 1],
  span: [
    [0.12, 1],
    [0, 0.88],
    [0.05, 0.95],
  ],
  spring: { k: 7, w: 5 },
  duration: 1550,
};
function springEaseT(p) {
  const { k, w } = TUMBLE.spring;
  return (1 - Math.exp(-k * p) * Math.cos(w * p)) / (1 - Math.exp(-k) * Math.cos(w));
}
/** u → 三轴转角（度）。每轴有自己的起止区间，所以是「三轴同时动」且错开 */
export function axisAngles(u) {
  return [0, 1, 2].map((i) => {
    const [a, b] = TUMBLE.span[i];
    const p = clamp((u - a) / (b - a || 1), 0, 1);
    return 90 * TUMBLE.sign[i] * springEaseT(p);
  });
}
/** u → 体坐标里的自转矩阵（右乘：星绕自己的轴翻，不是绕镜头转） */
export function rotationAt(u) {
  const [tx, ty, tz] = axisAngles(u);
  return mMul(mAxis([0, 0, 1], tz), mMul(mAxis([0, 1, 0], ty), mAxis([1, 0, 0], tx)));
}
export function poseAt(u) {
  return mMul(M_REST, rotationAt(u));
}
/** 落定那一格：三轴严格 90° 的整数倍 → 是立方群里的元素，剪影与正位完全重合 */
export const R_LANDED = rotationAt(1);

export function scoreSamples({ n = 120, size = SCORE_SIZE, cfg = MAIN } = {}) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rows.push({ t: +t.toFixed(4), score: measurePose(cfg, poseAt(t), size).score });
  }
  let ugly = 0;
  let pass = 0;
  let min = 101;
  let minT = 0;
  for (const r of rows) {
    if (r.score < PASS) ugly++;
    if (r.score >= PASS && r.score < GOOD) pass++;
    if (r.score < min) {
      min = r.score;
      minT = r.t;
    }
  }
  const N = rows.length;
  return {
    rows,
    ugly: +((ugly / N) * 100).toFixed(2),
    pass: +((pass / N) * 100).toFixed(2),
    good: +(((N - ugly - pass) / N) * 100).toFixed(2),
    min,
    minT,
    uglyMs: Math.round((ugly / N) * TUMBLE.duration),
  };
}

/* ── 着色器 ───────────────────────────────────────────────── */
/* 注意：position / normal 这两条 attribute 由 three 的前缀自动声明，
   自己再写一遍是重定义，着色器直接编译失败。 */
const VERT = /* glsl */ `
  varying vec3 vN;
  varying float vZ;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uLight;
  uniform vec3 uDeep;
  uniform vec3 uLite;
  uniform float uLo;
  uniform float uHi;
  uniform float uSteps;
  uniform float uToneMin;
  uniform float uToneMax;
  uniform float uDepth;
  uniform float uZNear;
  uniform float uZFar;
  varying vec3 vN;
  varying float vZ;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float sh = clamp(dot(n, uLight), 0.0, 1.0);
    float dp = clamp((vZ - uZFar) / max(1e-4, uZNear - uZFar), 0.0, 1.0);
    float t = mix(sh, dp, uDepth);
    float u = clamp((t - uLo) / max(1e-4, uHi - uLo), 0.0, 1.0);
    float k = max(1.0, uSteps - 1.0);
    float q = floor(min(k, u * k)) / k;
    gl_FragColor = vec4(mix(uDeep, uLite, uToneMin + (uToneMax - uToneMin) * q), 1.0);
  }
`;

/* ── 颜色方向盘：两个端点色 ─────────────────────────────────── */
/**
 * 晶体只有两种颜色：最暗的面 = --umber 一侧，最亮的面 = --amber 一侧。
 *
 * 但两端不能就用 --umber 与 --amber 本身 —— 这两个都落在中间调上（亮度 74 与 140），
 * 拉出来的四档一共只有 53 级亮度差，白底上读成一块均匀的紫。实测证据在 notes §2：
 * 这样做的星内亮度标准差是 14.7，而现役平风筝是 25.7。
 *
 * 所以亮的一头往**底色**那边提：白纸上的一块透明料，最亮的面本来就应该接近纸色。
 * 提多少是两个底的各自决定（白底 0.46、深底 0.18），但端点都仍然从 CSS 变量算出来，
 * 所以醒度一变整颗星跟着变 —— 这一点没有妥协。
 */
export const TONE_MIX = { light: 0.46, dark: 0.2 };
export function tonePalette(pal, ground) {
  const bg = ground === 'dark' ? [0x2a / 255, 0x2b / 255, 0x38 / 255] : [0xf0 / 255, 0xf3 / 255, 0xf6 / 255];
  if (ground !== 'dark') {
    return {
      deep: pal.umber.slice(),
      lite: mixRgb(pal.amber, bg, TONE_MIX.light),
    };
  }
  return {
    /* 深底上反过来：最暗的面往底色里沉，最亮的面往 --wake（醒 · 冷灰）提 */
    deep: mixRgb(pal.umber, bg, 0.38),
    lite: mixRgb(pal.amber, pal.wake, TONE_MIX.dark + 0.3),
  };
}

/* ── 渲染器 / 相机 / 材质 ─────────────────────────────────── */
const DIST = 80;
export function makeCamera(box) {
  const h = box / 2;
  const cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, 400);
  /* 基（right, up, forward）= M_REST 的三行 +
     相机放在 row3 方向、up = row2 —— 这样投到屏幕上的图与 drawStar() 那张逐点同向，
     对照才是在比形状，不是在比朝向。 */
  const [r0, r1, r2] = [M_REST.slice(0, 3), M_REST.slice(3, 6), M_REST.slice(6, 9)];
  cam.position.set(r2[0] * DIST, r2[1] * DIST, r2[2] * DIST);
  cam.up.set(r1[0], r1[1], r1[2]);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

function shaderMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    /* 不透明 + 两侧都画。solid 是闭合的，双面只是省掉「绕向是否算对」这件事；
       深度缓冲保证只有真正在最前面的那一片留下来。 */
    side: THREE.DoubleSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    uniforms: {
      uLight: { value: new THREE.Vector3(...MAIN.light) },
      uDeep: { value: new THREE.Color(0x4f4a66) },
      uLite: { value: new THREE.Color(0x9a86c4) },
      uLo: { value: 0.18 },
      uHi: { value: 0.86 },
      uSteps: { value: MAIN.tones.steps },
      uToneMin: { value: MAIN.tones.min },
      uToneMax: { value: MAIN.tones.max },
      uDepth: { value: MAIN.tones.depth },
      uZNear: { value: -DIST + 20 },
      uZFar: { value: -DIST - 20 },
    },
  });
}

/** 色阶两端取一次：在正位上量所有面的 dot(n, L)，它的极值就是 [uLo, uHi] */
let TONE_RANGE = null;
function toneRange(cfg = MAIN) {
  if (TONE_RANGE) return TONE_RANGE;
  const g = buildGeometry(cfg);
  let lo = 1;
  let hi = 0;
  for (const f of g.faces) {
    const n = mApply(M_REST, f.n);
    const sh = clamp(dot(n, cfg.light), 0, 1);
    if (sh < lo) lo = sh;
    if (sh > hi) hi = sh;
  }
  TONE_RANGE = { lo: lo - 0.02, hi: hi + 0.02 };
  return TONE_RANGE;
}

/* ── 一个画布 N 格（一张上下文，别开十六个） ─────────────────── */
export class Gallery {
  constructor(canvas, { dpr = 1 } = {}) {
    this.canvas = canvas;
    this.dpr = dpr;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearAlpha(0);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.cells = [];
    this.frames = 0;
    this.materials = {};
    this.geoms = new Map();
    this.pal = readPalette();
    this.range = toneRange();
    this.resize();
  }
  /** 两种材质：'depth' 用真的深度缓冲，'painter' 关掉深度、靠画序（对照组） */
  material(ground, mode = 'depth') {
    const key = `${ground}|${mode}`;
    if (!this.materials[key]) {
      const m = shaderMaterial();
      const tp = tonePalette(this.pal, ground);
      m.uniforms.uDeep.value.setRGB(tp.deep[0], tp.deep[1], tp.deep[2]);
      m.uniforms.uLite.value.setRGB(tp.lite[0], tp.lite[1], tp.lite[2]);
      m.uniforms.uLo.value = this.range.lo;
      m.uniforms.uHi.value = this.range.hi;
      if (mode === 'painter') {
        m.depthTest = false;
        m.depthWrite = false;
        m.needsUpdate = true;
      }
      this.materials[key] = m;
    }
    return this.materials[key];
  }
  geometry(cfg, mode = 'depth') {
    const c = cfgOf(cfg);
    const key = `${mode}|${c.r}|${c.halfWidth}|${c.curve}|${c.fold}|${c.foldMode}|${c.sides}`;
    let g = this.geoms.get(key);
    if (!g) {
      const geo = mode === 'painter' ? painterVertices(c) : buildGeometry(c);
      const buf = new THREE.BufferGeometry();
      buf.setAttribute('position', new THREE.BufferAttribute(geo.position, 3));
      buf.setAttribute('normal', new THREE.BufferAttribute(geo.normal, 3));
      g = { buf, src: geo };
      this.geoms.set(key, g);
    }
    return g;
  }
  /**
   * 加一格。rect 是画布内 CSS 像素（左上原点）。
   * 每格一个自己的场景 —— 共用一个 scene 会让每格把所有网格都画一遍。
   */
  add(rect, { cfg = MAIN, ground = 'light', pose = null, box = 40, mode = 'depth', label = '' } = {}) {
    const { buf } = this.geometry(cfg, mode);
    const mesh = new THREE.Mesh(buf, this.material(ground, mode));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(pose ? m3to4(pose) : new THREE.Matrix4());
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const cell = { rect, mesh, scene, ground, box, mode, label, cfg: cfgOf(cfg) };
    this.cells.push(cell);
    return cell;
  }
  resize() {
    /* 画布按 CSS 尺寸 × DPR 设缓冲，再 setViewport 到「缓冲像素」——
       three 默认会把 drawingBufferSize 已经不匹配的视口再乘一次 pixelRatio，
       结果是每格只画到左下角一小块。所以这里自己设 pixelRatio(1) 并全程用缓冲像素。 */
    const c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth || c.width));
    const h = Math.max(1, Math.round(c.clientHeight || c.height));
    this.W = w;
    this.H = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(w * this.dpr), Math.round(h * this.dpr), false);
    this.bw = Math.round(w * this.dpr);
    this.bh = Math.round(h * this.dpr);
  }
  render() {
    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, 0, this.bw, this.bh);
    r.setScissor(0, 0, this.bw, this.bh);
    r.clear(true, true, true);
    const k = this.dpr;
    for (const cell of this.cells) {
      const { rect } = cell;
      const cam = makeCamera(cell.box);
      const x = Math.round(rect.x * k);
      const y = Math.round(this.bh - (rect.y + rect.h) * k);
      const w = Math.round(rect.w * k);
      const h = Math.round(rect.h * k);
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      r.render(cell.scene, cam);
    }
    r.setScissorTest(false);
    this.frames++;
  }
  setPalette(pal) {
    this.pal = pal;
    for (const [key, m] of Object.entries(this.materials)) {
      const tp = tonePalette(pal, key.split('|')[0]);
      m.uniforms.uDeep.value.setRGB(tp.deep[0], tp.deep[1], tp.deep[2]);
      m.uniforms.uLite.value.setRGB(tp.lite[0], tp.lite[1], tp.lite[2]);
    }
  }
  /** 读回某一格的像素（在 render() 同一个任务里调用） */
  readCell(cell) {
    const gl = this.renderer.getContext();
    const { rect } = cell;
    const k = this.dpr;
    const x = Math.round(rect.x * k);
    const y = Math.round(this.bh - (rect.y + rect.h) * k);
    const w = Math.round(rect.w * k);
    const h = Math.round(rect.h * k);
    const buf = new Uint8Array(w * h * 4);
    /* readPixels 从下往上给行；翻回来，后面按图像坐标读 */
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const flip = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) flip.set(buf.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
    return { buf: flip, w, h };
  }
}

/* ── 一颗星（自己一个画布）：翻动 + 帧计数 ─────────────────── */
export class Star {
  constructor(canvas, { ground = 'light', cfg = MAIN, box = 40, label = '' } = {}) {
    this.canvas = canvas;
    this.cfg = cfgOf(cfg);
    this.box = box;
    this.label = label;
    this.gallery = new Gallery(canvas, { dpr: Number(canvas.dataset.dpr || 1) });
    this.cell = this.gallery.add({ x: 0, y: 0, w: this.gallery.W, h: this.gallery.H }, { cfg: this.cfg, ground, box });
    this.ground = ground;
    this.camera = makeCamera(box);
    this.raf = 0;
    this.frames = 0;
    this.busy = false;
    this.samples = [];
    this.cost = [];
    this.landed = R_LANDED;
    this.rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* 首帧 = 着色器编译 + program link + 第一次画。它不进「每帧成本」，
       但它是落地时真正会噎一下的地方，所以单独记。 */
    const t0 = performance.now();
    this.render(new THREE.Matrix4());
    this.firstFrameMs = +(performance.now() - t0).toFixed(2);
  }
  get reduced() {
    return this.rm;
  }
  render(matrix) {
    const t0 = performance.now();
    this.cell.mesh.matrix.copy(matrix);
    this.gallery.render();
    this.frames++;
    this.cost.push(performance.now() - t0);
  }
  flip() {
    if (this.busy) return false;
    this.samples = [];
    this.cost = [];
    if (this.rm || typeof requestAnimationFrame !== 'function') {
      this.render(new THREE.Matrix4()); // 正位，一格都不排
      this.busy = false;
      return true;
    }
    this.busy = true;
    const t0 = performance.now();
    const step = () => {
      const now = performance.now();
      const u = clamp((now - t0) / TUMBLE.duration, 0, 1);
      this.render(m3to4(rotationAt(u)));
      this.samples.push({ u: +u.toFixed(4), score: measurePose(this.cfg, poseAt(u), SCORE_SIZE).score });
      if (u < 1) {
        this.raf = requestAnimationFrame(step);
      } else {
        /* 落定：换成严格 90° 整数倍的那一格（不是「u≈1 的近似」），画一次，然后停 */
        this.raf = 0;
        this.render(m3to4(R_LANDED));
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
    this.render(new THREE.Matrix4());
  }
  state() {
    const c = this.cost.slice().sort((a, b) => a - b);
    return {
      busy: this.busy,
      raf: this.raf,
      frames: this.frames,
      reduced: this.rm,
      samples: this.samples.length,
      min: this.samples.length ? Math.min(...this.samples.map((s) => s.score)) : null,
      msMedian: c.length ? +c[c.length / 2 | 0].toFixed(2) : null,
      duration: TUMBLE.duration,
    };
  }
  /** 「此刻真的零帧」的取证：两次读数之间什么都不发生 */
  probeIdle(ms = 2000) {
    const before = this.frames;
    const t0 = performance.now();
    return new Promise((res) => {
      setTimeout(() => {
        res({
          before,
          after: this.frames,
          delta: this.frames - before,
          elapsed: Math.round(performance.now() - t0),
          raf: this.raf,
          busy: this.busy,
        });
      }, ms);
    });
  }
}

/* ── 代价：块计时（N 帧 ÷ N，取 5 块的中位数） ─────────────── */
export function measureCost(star, { frames = 40, blocks = 5 } = {}) {
  const gl = star.gallery.renderer.getContext();
  const mats = [];
  star.gallery.render(); // 预热：着色器编译不进计时
  for (let i = 0; i < 8; i++) star.gallery.render();
  gl.finish();
  const results = [];
  for (let b = 0; b < blocks; b++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) star.gallery.render();
    gl.finish();
    results.push((performance.now() - t0) / frames);
  }
  results.sort((a, b) => a - b);
  const info = star.gallery.renderer.info;
  void mats;
  return {
    blocks: results.map((v) => +v.toFixed(3)),
    msFrame: +results[results.length >> 1].toFixed(3),
    calls: info.render.calls,
    tris: info.render.triangles,
    programs: info.programs ? info.programs.length : null,
    frames,
  };
}

/* ── 中心的「乱不乱」：用真 z-buffer 算，不靠解释像素 ───────── */
/**
 * 诊断里那句「一堆没有意义的交叉碎条」，可数的部分是：
 *   · 中心那一圈里，露在最前面的是**几片**料（越少越像一块，越多越像碎条）
 *   · 最大那一片占多少（覆盖高 = 一块大面）
 *   · 有几片是「薄片」（占比 < 0.5% —— 细纹的直接来源）
 *   · 最前面那些面的调子跨度多大、量化到四档之后用了几档
 *
 * 口径与 GL 一致：正交投影（M_REST）、逐三角形 z-buffer、取最近那一片的面法线。
 * 所以这里的读数与画面上看到的**是同一件事**，不是另一套近似。
 */
export function centreFacets(cfgIn, { size = 400, box = 12.5, discR = 2.5, steps = 4 } = {}) {
  const cfg = cfgOf(cfgIn);
  const g = buildGeometry(cfg);
  const sc = size / box;
  const c = size / 2;
  const zb = new Float32Array(size * size).fill(-1e9);
  const raw = new Float32Array(size * size);
  const fid = new Int32Array(size * size).fill(-1);
  const V = (i) => {
    const o = i * 3;
    const p = mApply(M_REST, [g.position[o], g.position[o + 1], g.position[o + 2]]);
    return [c + p[0] * sc, c - p[1] * sc, p[2]];
  };
  const faceOfTri = new Int32Array(g.count / 3);
  for (let i = 0; i < g.faces.length; i++) {
    const f = g.faces[i];
    for (let k = f.tri0; k < f.tri1; k++) faceOfTri[k] = i;
  }
  for (let t = 0; t < g.count / 3; t++) {
    const A = V(t * 3);
    const B = V(t * 3 + 1);
    const C = V(t * 3 + 2);
    const nv = mApply(M_REST, [g.normal[t * 9], g.normal[t * 9 + 1], g.normal[t * 9 + 2]]);
    const sh = clamp(dot(nv, cfg.light), 0, 1);
    const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(det) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const l1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / det;
        const l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const z = l1 * A[2] + l2 * B[2] + l3 * C[2];
        const id = y * size + x;
        if (z > zb[id]) {
          zb[id] = z;
          raw[id] = sh;
          fid[id] = faceOfTri[t];
        }
      }
  }
  /* 全星的量化区间（与着色器同一个口径） */
  let lo = 1;
  let hi = 0;
  for (const f of g.faces) {
    const v = clamp(dot(mApply(M_REST, f.n), cfg.light), 0, 1);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  lo -= 0.02;
  hi += 0.02;
  const rpx = discR * sc;
  const vals = [];
  const perFace = new Map();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy > rpx * rpx) continue;
      const id = y * size + x;
      if (fid[id] < 0) continue;
      vals.push(raw[id]);
      perFace.set(fid[id], (perFace.get(fid[id]) || 0) + 1);
    }
  if (!vals.length) return { px: 0 };
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.round(p * (vals.length - 1)))];
  const bucket = new Array(steps).fill(0);
  for (const v of vals) {
    const u = clamp((v - lo) / Math.max(1e-4, hi - lo), 0, 1);
    bucket[Math.min(steps - 1, Math.floor(u * steps))]++;
  }
  const areas = [...perFace.values()].sort((a, b) => b - a);
  const smallShare = areas.filter((a) => a / vals.length < 0.005).length;
  return {
    px: vals.length,
    faces: perFace.size,
    slivers: smallShare,
    topShare: +(areas[0] / vals.length).toFixed(3),
    medianFaceShare: +(areas[areas.length >> 1] / vals.length).toFixed(4),
    rawMin: +vals[0].toFixed(3),
    rawMedian: +q(0.5).toFixed(3),
    rawMax: +vals[vals.length - 1].toFixed(3),
    spread: +(vals[vals.length - 1] - vals[0]).toFixed(3),
    bucket: bucket.map((v) => +(v / vals.length).toFixed(3)),
    tonesUsed: bucket.filter((v) => v / vals.length > 0.02).length,
    distinctRaw: new Set(vals.map((v) => v.toFixed(3))).size,
  };
}

/**
 * 画面上「有多少像素不属于四档之一」—— 细纹、错色块、抗锯齿缝都会落进来。
 * 深度缓冲那一档应该接近 0（只剩边缘一圈 AA）；关掉深度那一档会明显变高，
 * 因为被压错的那几片会露出本不该出现的调子（甚至是纯白/纯底色）。
 */
export function offPalette(gallery, cell, steps = 4, tol = 14) {
  const { buf, w, h } = gallery.readCell(cell);
  const tp = tonePalette(gallery.pal, cell.ground);
  const st = MAIN.tones;
  const tones = [];
  for (let i = 0; i < steps; i++) {
    const q = steps > 1 ? i / (steps - 1) : 0;
    const c = mixRgb(tp.deep, tp.lite, st.min + (st.max - st.min) * q);
    tones.push(c.map((v) => Math.round(clamp(v, 0, 1) * 255)));
  }
  let opaque = 0;
  let off = 0;
  let edges = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (buf[o + 3] < 250) continue; // 边缘抗锯齿不算
    opaque++;
    let best = 1e9;
    for (const t of tones) {
      const d = Math.hypot(buf[o] - t[0], buf[o + 1] - t[1], buf[o + 2] - t[2]);
      if (d < best) best = d;
    }
    if (best > tol) off++;
  }
  /* 调子边界：相邻像素的「最近档号」不同 */
  const idx = new Int8Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (buf[o + 3] < 250) continue;
    let best = 0;
    let bd = 1e9;
    for (let k = 0; k < tones.length; k++) {
      const d = Math.hypot(buf[o] - tones[k][0], buf[o + 1] - tones[k][1], buf[o + 2] - tones[k][2]);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    idx[i] = best;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x + 1 < w; x++) {
      const a = idx[y * w + x];
      const b = idx[y * w + x + 1];
      if (a >= 0 && b >= 0 && a !== b) edges++;
    }
  return {
    opaque,
    offShare: +(off / Math.max(1, opaque)).toFixed(4),
    toneEdgesPerK: +((edges / Math.max(1, opaque)) * 1000).toFixed(1),
  };
}

/* ── 生产那一张：逐字照抄 drawStar() ───────────────────────── */
/**
 * `--fg-soft` 的那一支：站里 `.ts-star { color: var(--fg-soft) }`，
 * 近白底上 #56606d、深底上 #cfd2e2 —— 与片上的 fill-opacity 相乘，就是站上看到的那张。
 */
export const PROD_INK = { light: '#56606d', dark: '#cfd2e2' };
export function prodSVG(size, ground, pal) {
  const ink = PROD_INK[ground] || PROD_INK.light;
  const mat = mYawPitch(ISO.yaw, ISO.pitch);
  const spikes = [];
  for (const [ax, ay, az] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]) {
    for (const s of [1, -1]) {
      const a = mApply(mat, [ax * s, ay * s, az * s]);
      spikes.push({ x: a[0] * 16, y: -a[1] * 16, z: a[2] });
    }
  }
  spikes.sort((a, b) => a.z - b.z);
  let out = '';
  for (const p of spikes) {
    const L = Math.hypot(p.x, p.y);
    if (L < 0.6) continue;
    const ux = p.x / L;
    const uy = p.y / L;
    const w = 1.9;
    const op = (0.38 + (0.5 * (p.z + 1)) / 2).toFixed(3);
    out += `<path d="M${(-uy * w).toFixed(2)} ${(ux * w).toFixed(2)}L${p.x.toFixed(2)} ${p.y.toFixed(
      2,
    )}L${(uy * w).toFixed(2)} ${(-ux * w).toFixed(2)}L${(-ux * 1.4).toFixed(2)} ${(-uy * 1.4).toFixed(2)}Z" fill="${ink}" fill-opacity="${op}"/>`;
  }
  out += `<circle r="1.7" fill="${rgbCss(pal ? pal.amber : [0x9a / 255, 0x86 / 255, 0xc4 / 255])}"/>`;
  /* xmlns 不能省：这张图会被塞进 data: URL 交给 Image 解码，没有它就是一个 broken image */
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-20 -20 40 40" style="display:block" aria-label="现役的星">${out}</svg>`;
}