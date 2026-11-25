/* ─────────────────────────────────────────────────────────────
   星 · 三维模型（design/mocks/star-model/src.js）

   这一份不再画投影，而是造一个**真的立体**：六支沿 ±x ±y ±z 的实体，
   每支是一个「变截面的管」＋ 一根内切球圆头，六个闭合实体在星心互插，
   交给深度缓冲去解交叠。三个旋钮都作用在三维几何上：

     粗细  w        截面的大小（面积归一到与标准菱形相同，所以它只管粗细）
     弧线  prof     沿轴的母线形状：直 / 凹 / 深凹 / 凸 / S
     平滑  fillet   截面四条棱上的圆角半径（面积归一，所以它不偷偷改粗细）
           tipR     支尖的内切球半径（切于支身、不产生折线；会让支尖后撤）
           shade    平法线（每格一片、折面读得清）/ 平滑法线（圆处连着亮）

   几个数值上的纪律（都是前几轮踩过的坑）：
   · 截面按**面积**归一 —— 加圆角会让菱形缩成圆，面积少 21%，若不归一，
     「平滑」这一个旋钮会偷偷把「粗细」也改掉。
   · 圆头用**内切球**而不是把最后一段的宽度乘个系数 —— 后者在支身与圆头之间有
     一条折线，那是伪圆头。内切球的代价是支尖沿轴后退 δ≈2.97·tipR，
     所以归一化之后支身会被等比放大；`fixW` 把这个放大再抵掉，
     保证「平滑」那一列每一档的根部半宽是同一个数。
   · 全部坐标最后都归一化到**支尖正好落在 r=1**，所以六支的包围盒恒为 [-1,1]³，
     不同档位在同一个相机框里就是同一个大小，能直接比。
   ───────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nrm3 = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};

/* ── 六支的定基 ───────────────────────────────────────────────
   side / ed 的赋值是一个绕体对角线 (1,1,1) 的循环（x→(y,z)、y→(z,x)、z→(x,y)），
   配合「截面关于两坐标交换不变」，整颗星在立方群 O_h 下逐点不变 ——
   所以体对角视角下的剪影必是正六芒星，而不是「差不多」。 */
export const FRAMES = [
  { key: 'x+', a: [1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { key: 'x−', a: [-1, 0, 0], side: [0, 1, 0], ed: [0, 0, 1] },
  { key: 'y+', a: [0, 1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { key: 'y−', a: [0, -1, 0], side: [0, 0, 1], ed: [1, 0, 0] },
  { key: 'z+', a: [0, 0, 1], side: [1, 0, 0], ed: [0, 1, 0] },
  { key: 'z−', a: [0, 0, -1], side: [1, 0, 0], ed: [0, 1, 0] },
];
/** 轴 → (side 轴, ed 轴) 的下标，测量时用 */
const SIDE_OF = [
  [1, 2],
  [2, 0],
  [0, 1],
];

/* ── 弧线：沿轴的母线 ───────────────────────────────────────
   u = 沿轴到尖端的归一化距离，f 是半宽系数：f(0)=1、f(1)=0。
   直 = 标准锥；凹 = 中段收进去；凸 = 中段鼓出来；S = 先鼓后退。 */
const dh = 1e-5;
const num = (f) => (u) => (f(clamp(u + dh, 0, 1)) - f(clamp(u - dh, 0, 1))) / (2 * dh);

export const PROFILES = {
  straight: { label: '直', f: (u) => 1 - u, note: '母线是一条直线，每一支就是标准锥' },
  waist: { label: '凹', f: (u) => (1 - u) * (1 - 0.3 * 4 * u * (1 - u)), note: '中段收进三成，腰在离根四成处' },
  waistDeep: { label: '深凹', f: (u) => (1 - u) * (1 - 0.55 * 4 * u * (1 - u)), note: '中段收进五成半，最细处不到露出的一半' },
  belly: { label: '凸', f: (u) => (1 - u) * (1 + 0.6 * 4 * u * (1 - u)), note: '中段鼓出六成，到尖端才收' },
  sform: { label: 'S', f: (u) => (1 - u) * (1 + 0.32 * Math.sin(2 * Math.PI * u)), note: '先鼓后退，母线上有一处转折' },
};
for (const k in PROFILES) PROFILES[k].df = num(PROFILES[k].f);
export const PROFILE_KEYS = Object.keys(PROFILES);

/* ── 参数 ─────────────────────────────────────────────────── */
export const BASE = Object.freeze({
  w: 0.26,
  prof: 'waist',
  fillet: 0.34,
  tipR: 0.12,
  shade: 'smooth',
  nBody: 15,
  nCap: 6,
  fixW: true,
});
export const fillCfg = (p) => ({ ...BASE, ...(p || {}) });

/* ── 截面：圆角菱形，按面积归一 ──────────────────────────────
   顶点在 ±side、±ed 方向（不是 ±45°）—— 棱脊因此指向两支之间的凹口，
   体对角视角下每支都能看见一条棱线把它劈成一亮一暗两面。
   圆角半径 = 沿两边各切回 d，90° 内角处 d 正好等于圆角半径；
   d 最大取到半条边长（√2/2），此时四条弧以原点为心、首尾相接，退化成圆。 */
function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function sectionLoop(fillet) {
  const f = clamp(fillet || 0, 0, 1);
  const per = f < 1e-6 ? 1 : clamp(Math.round(f * 26), 3, 14);
  const d = f * Math.SQRT2 * 0.5;
  const cen = 1 - d * Math.SQRT2;
  const pts = [];
  for (let k = 0; k < 4; k++) {
    const phi = (k * Math.PI) / 2;
    if (per === 1) {
      pts.push([Math.cos(phi), Math.sin(phi)]);
      continue;
    }
    for (let i = 0; i < per; i++) {
      const th = phi - Math.PI / 4 + (i / (per - 1)) * (Math.PI / 2);
      pts.push([cen * Math.cos(phi) + d * Math.cos(th), cen * Math.sin(phi) + d * Math.sin(th)]);
    }
  }
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) out.pop();
  }
  const sc = Math.sqrt(2 / polyArea(out)); // 菱形（对角 2×2）面积恰为 2
  const P = out.map((p) => [p[0] * sc, p[1] * sc]);
  return {
    pts: P,
    n: P.length,
    area: 2,
    filletA: d * sc, // 圆角半径（以「根部半宽 = 1」为单位）
    maxR: Math.max(...P.map((p) => Math.hypot(p[0], p[1]))),
  };
}

/* ── 支尖的内切球 ───────────────────────────────────────────
   球心在轴上、切于支身。切点满足  ρ = W(u_j)·√(1+W'²)，球心 c = u_j + W_j·W'，
   球沿轴的最前点在 c+ρ —— 它比理想尖端退后 E = c+ρ < 1。
   ρ 是**相对**量：ρ = tipR · w。若取绝对值，同一个小球在细支上会把整支吃掉
   （w 0.12 那一档实测支尖倒退 0.95，星读成一个球团），这是这一轮修掉的一个坑。 */
export function tipInfo(cfgIn) {
  const cfg = fillCfg(cfgIn);
  const F = PROFILES[cfg.prof] || PROFILES.straight;
  const w = cfg.w;
  const rho = Math.max(0, (cfg.tipR || 0) * w);
  if (rho <= 1e-12) return { uj: 1, Wj: 0, k: w * F.df(1), c: 1, rho: 0, E: 1, eaten: 0 };
  const g = (u) => {
    const W = w * F.f(u);
    const k = w * F.df(u);
    return W * Math.sqrt(1 + k * k) - rho;
  };
  /* 端点若已经够细（W√(1+k²) ≤ ρ），切点就落在最根上，球等于把整支吞了；
     这种情况夹住，不往下解 */
  if (g(1e-4) <= 0) {
    const Wj = w * F.f(1e-4);
    return { uj: 1e-4, Wj, k: w * F.df(1e-4), c: 1e-4 + Wj * w * F.df(1e-4), rho, E: 1, eaten: 1, clamped: true };
  }
  let lo = 1e-4;
  let hi = 1 - 1e-6;
  let uj = hi;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
    uj = (lo + hi) / 2;
  }
  const Wj = w * F.f(uj);
  const k = w * F.df(uj);
  const c = uj + Wj * k;
  return { uj, Wj, k, c, rho, E: c + rho, eaten: 1 - (c + rho), clamped: false };
}

/** 支尖之后（归一化坐标 s ∈ [0,1]）的半宽。cfg.w 是**输入**的 w，未归一。 */
export function widthRaw(cfg, s, info) {
  const F = PROFILES[cfg.prof] || PROFILES.straight;
  const i = info || tipInfo(cfg);
  if (s <= i.uj) return cfg.w * F.f(s);
  const d = s - i.c;
  return Math.sqrt(Math.max(0, i.rho * i.rho - d * d));
}

/** 解 fixW：让归一化之后的根部半宽正好等于 cfg.w */
export function solveW(cfgIn) {
  const cfg = fillCfg(cfgIn);
  if (!cfg.fixW || !(cfg.tipR > 1e-9)) return { w: cfg.w, sc: 1 / tipInfo(cfg).E };
  let w = cfg.w;
  let sc = 1;
  for (let i = 0; i < 12; i++) {
    const E = tipInfo({ ...cfg, w }).E;
    sc = 1 / E;
    const next = cfg.w * E;
    if (Math.abs(next - w) < 1e-12) break;
    w = next;
  }
  return { w, sc };
}

/* ── 网格 ───────────────────────────────────────────────────
   非索引三角形。平法线时「一个四边形一片」—— 两个三角形共用一条法线，
   否则每片里会出现一道抗锯齿细纹（star-gl 在 SVG 上撞过的那一条）。
   平滑法线用面积加权累加到格点上（格点是共享的，只有尖点与根心是单独一圈）。 */
export function buildStar(cfgIn) {
  const cfg = fillCfg(cfgIn);
  const { w, sc } = solveW(cfg);
  const ci = { ...cfg, w };
  const info = tipInfo(ci);
  const secObj = sectionLoop(cfg.fillet);
  const sec = secObj.pts;
  const nS = sec.length;
  const nB = Math.max(6, cfg.nBody | 0);
  const nC = Math.max(2, cfg.nCap | 0);

  /* 站：支身（根部略密）+ 圆头（切点密、越往尖越密） */
  const rows = [];
  for (let i = 0; i <= nB; i++) {
    const u = info.uj * Math.pow(i / nB, 0.92);
    rows.push({ u, W: widthRaw(ci, u, info) });
  }
  if (info.rho > 1e-9) {
    const thJ = Math.acos(clamp((info.uj - info.c) / info.rho, -1, 1));
    for (let i = 1; i < nC; i++) {
      const th = thJ * (1 - i / nC);
      rows.push({ u: info.c + info.rho * Math.cos(th), W: info.rho * Math.sin(th) });
    }
  }
  const nR = rows.length;

  const pos = [];
  const flatN = [];
  const verts = []; // 平滑法线用：每个格点一份
  const tri = []; // [i0,i1,i2,nx,ny,nz]

  for (const fr of FRAMES) {
    const base = verts.length;
    const put = (u, cu, cv) => [
      (fr.a[0] * u + fr.side[0] * cu + fr.ed[0] * cv) * sc,
      (fr.a[1] * u + fr.side[1] * cu + fr.ed[1] * cv) * sc,
      (fr.a[2] * u + fr.side[2] * cu + fr.ed[2] * cv) * sc,
    ];
    for (let i = 0; i < nR; i++) for (let j = 0; j < nS; j++) verts.push(put(rows[i].u, sec[j][0] * rows[i].W, sec[j][1] * rows[i].W));
    const iRole = verts.length;
    verts.push(put(info.c + info.rho, 0, 0)); // 尖点
    verts.push([0, 0, 0]); // 根心
    const G = (i, j) => base + ((i % nR) * nS + (j % nS));
    const pole = iRole;
    const root = iRole + 1;

    const redge = (a, b, c, want) => {
      const p0 = verts[a];
      const p1 = verts[b];
      const p2 = verts[c];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const L = Math.hypot(n[0], n[1], n[2]);
      if (L < 1e-14) return null;
      n = [n[0] / L, n[1] / L, n[2] / L];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) return { t: [a, c, b], n: [-n[0], -n[1], -n[2]] };
      return { t: [a, b, c], n };
    };
    const outward = (j) => {
      const mid = [(sec[j][0] + sec[(j + 1) % nS][0]) / 2, (sec[j][1] + sec[(j + 1) % nS][1]) / 2];
      return [fr.side[0] * mid[0] + fr.ed[0] * mid[1], fr.side[1] * mid[0] + fr.ed[1] * mid[1], fr.side[2] * mid[0] + fr.ed[2] * mid[1]];
    };

    for (let i = 0; i < nR - 1; i++) {
      for (let j = 0; j < nS; j++) {
        const j2 = (j + 1) % nS;
        const q = [G(i, j), G(i, j2), G(i + 1, j2), G(i + 1, j)];
        /* 一片一个法线：四边形四个角取 Newell */
        let nx = 0;
        let ny = 0;
        let nz = 0;
        for (let k = 0; k < 4; k++) {
          const p = verts[q[k]];
          const r = verts[q[(k + 1) % 4]];
          nx += (p[1] - r[1]) * (p[2] + r[2]);
          ny += (p[2] - r[2]) * (p[0] + r[0]);
          nz += (p[0] - r[0]) * (p[1] + r[1]);
        }
        const L = Math.hypot(nx, ny, nz);
        if (L < 1e-14) continue;
        const want = outward(j);
        let n = [nx / L, ny / L, nz / L];
        let flip = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0;
        if (flip) n = [-n[0], -n[1], -n[2]];
        const tri2 = flip
          ? [
              [q[0], q[2], q[1]],
              [q[0], q[3], q[2]],
            ]
          : [
              [q[0], q[1], q[2]],
              [q[0], q[2], q[3]],
            ];
        for (const t of tri2) tri.push({ i: t, n });
      }
    }
    const tp = [fr.a[0], fr.a[1], fr.a[2]];
    for (let j = 0; j < nS; j++) {
      const r = redge(G(nR - 1, j), G(nR - 1, j + 1), pole, tp);
      if (r) tri.push({ i: r.t, n: r.n });
    }
    const tn = [-tp[0], -tp[1], -tp[2]];
    for (let j = 0; j < nS; j++) {
      const r = redge(root, G(0, j + 1), G(0, j), tn);
      if (r) tri.push({ i: r.t, n: r.n });
    }
  }

  /* 平滑法线：面积加权累加 */
  const acc = verts.map(() => [0, 0, 0]);
  for (const f of tri) {
    const p0 = verts[f.i[0]];
    const p1 = verts[f.i[1]];
    const p2 = verts[f.i[2]];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const k of f.i) {
      acc[k][0] += cr[0] * 0.5;
      acc[k][1] += cr[1] * 0.5;
      acc[k][2] += cr[2] * 0.5;
    }
  }
  const smooth = acc.map((v) => nrm3(v));

  const useSmooth = cfg.shade !== 'flat';
  const P = new Float32Array(tri.length * 9);
  const N = new Float32Array(tri.length * 9);
  tri.forEach((f, k) => {
    for (let c = 0; c < 3; c++) {
      const v = verts[f.i[c]];
      P[k * 9 + c * 3] = v[0];
      P[k * 9 + c * 3 + 1] = v[1];
      P[k * 9 + c * 3 + 2] = v[2];
      const n = useSmooth ? smooth[f.i[c]] : f.n;
      N[k * 9 + c * 3] = n[0];
      N[k * 9 + c * 3 + 1] = n[1];
      N[k * 9 + c * 3 + 2] = n[2];
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const wEff = w * sc;
  const stats = {
    cfg: ci,
    wIn: w,
    sc,
    wEff,
    tris: tri.length,
    verts: P.length / 3,
    rings: nR,
    section: nS,
    extent: info.c + info.rho > 0 ? (info.c + info.rho) * sc : 1,
    cut: 1 - (info.c + info.rho),
    bbox: geo.boundingBox.clone(),
    shade: useSmooth ? 'smooth' : 'flat',
    secMaxR: secObj.maxR * wEff,
  };
  return { geo, positions: P, normals: N, stats, info, sec: secObj, rows };
}

/* ── 读数（全部从三维几何算，不经过任何投影） ─────────────────
   · 截面半径查表：内切测试用，凸截面下等价于「点在多边形内」
   · notch3D：从星心沿两支之间的分角线 ⟨1,1,0⟩ 射出，第一次穿出表面的距离。
     这是「六个尖之间的内凹有多深」在三维里的写法（不是投影里的一个半径）。
   · 体积/重叠率：等距格点采样，六支谁在里面就算谁；重叠率 = (Σ单支 − 并集)/并集，
     它说的是「星心那团料被几支同时用着」。 */
function sectionRadial(sec, bins = 96) {
  const R = new Float32Array(bins + 1);
  const pts = sec.pts || sec;
  for (let b = 0; b <= bins; b++) {
    const th = (b / bins) * (Math.PI / 2);
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % pts.length];
      const ex = c[0] - a[0];
      const ey = c[1] - a[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-14) continue;
      const t = (a[0] * ey - a[1] * ex) / den;
      const s = (a[0] * dy - a[1] * dx) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
    }
    R[b] = best;
  }
  return R;
}

function makeInside(cfg, sec, sc) {
  const RQ = sectionRadial(sec);
  const info = tipInfo(cfg);
  const w = cfg.w;
  const F = PROFILES[cfg.prof] || PROFILES.straight;
  const Wn = (s) => {
    if (s > 1 + 1e-9) return 0;
    const u = s / sc;
    if (u <= info.uj) return w * F.f(u);
    const d = u - info.c;
    return Math.sqrt(Math.max(0, info.rho * info.rho - d * d));
  };
  const rAt = (th) => {
    const t = clamp(th, 0, Math.PI / 2) / (Math.PI / 2);
    const x = t * 96;
    const i = Math.min(95, Math.floor(x));
    return RQ[i] + (RQ[i + 1] - RQ[i]) * (x - i);
  };
  return (p) => {
    for (let ax = 0; ax < 3; ax++) {
      const s = Math.abs(p[ax]);
      if (s > 1) continue;
      const [si, ei] = SIDE_OF[ax];
      const c = Math.abs(p[si]);
      const d = Math.abs(p[ei]);
      const W = Wn(s) * sc;
      if (W <= 0) continue;
      const rad = Math.hypot(c, d);
      if (rad <= W * rAt(Math.atan2(d, c))) return true;
    }
    return false;
  };
}

export function solidStats(cfgIn, { n = 110 } = {}) {
  const cfg = fillCfg(cfgIn);
  const { w, sc } = solveW(cfg);
  const ci = { ...cfg, w };
  const sec = sectionLoop(cfg.fillet);
  const inside = makeInside(ci, sec, sc);
  const info = tipInfo(ci);
  if (!(n > 1)) return { volUnion: NaN, volMulti: NaN, overlapShare: NaN, inside };
  let uni = 0;
  let multi = 0;
  const k = 1 / n;
  for (let ix = 0; ix < n; ix++) {
    const x = -1 + (ix + 0.5) * 2 * k;
    for (let iy = 0; iy < n; iy++) {
      const y = -1 + (iy + 0.5) * 2 * k;
      for (let iz = 0; iz < n; iz++) {
        const z = -1 + (iz + 0.5) * 2 * k;
        const p = [x, y, z];
        let cnt = 0;
        for (let ax = 0; ax < 3; ax++) {
          const s = Math.abs(p[ax]);
          if (s > 1) continue;
          const [si, ei] = SIDE_OF[ax];
          const c = Math.abs(p[si]);
          const d = Math.abs(p[ei]);
          const u = s / sc;
          const W =
            u <= info.uj
              ? ci.w * (PROFILES[ci.prof] || PROFILES.straight).f(u) * sc
              : Math.sqrt(Math.max(0, info.rho * info.rho - (u - info.c) * (u - info.c))) * sc;
          if (W <= 0) continue;
          if (Math.hypot(c, d) <= W * radialAt(sec, c, d)) cnt++;
        }
        if (cnt > 0) uni++;
        if (cnt > 1) multi++;
      }
    }
  }
  const box = 8;
  const volUnion = (uni / (n * n * n)) * box;
  const volMulti = (multi / (n * n * n)) * box;
  return { volUnion, volMulti, overlapShare: volUnion > 0 ? volMulti / volUnion : 0, inside };
}

/** 截面在 (c,d) 方向的边界半径（凸截面，直接找边界交点，慢但不必查表） */
const RAD_CACHE = new WeakMap();
function radialAt(sec, c, d) {
  let tbl = RAD_CACHE.get(sec.pts);
  if (!tbl) {
    tbl = sectionRadial(sec, 1024);
    RAD_CACHE.set(sec.pts, tbl);
  }
  const th = Math.atan2(d, c);
  const x = clamp(th, 0, Math.PI / 2) / (Math.PI / 2);
  const i = Math.min(1023, Math.floor(x * 1024));
  return tbl[i];
}

export function notch3D(cfgIn) {
  const cfg = fillCfg(cfgIn);
  const { w, sc } = solveW(cfg);
  const ci = { ...cfg, w };
  const sec = sectionLoop(cfg.fillet);
  const inside = makeInside(ci, sec, sc);
  const dir = [Math.SQRT1_2, Math.SQRT1_2, 0];
  let prev = 0;
  const N = 4000;
  for (let i = 1; i <= N; i++) {
    const L = (i / N) * 1.4;
    const p = [dir[0] * L, dir[1] * L, 0];
    if (!inside(p)) {
      let lo = prev;
      let hi = L;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (inside([dir[0] * m, dir[1] * m, 0])) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    }
    prev = L;
  }
  return NaN;
}

/** 体对角视角的方向（az=45°, el=35.264°） */
export const ISO = Object.freeze({ az: 45, el: Math.asin(1 / Math.sqrt(3)) / DEG });
export function basisOf(azDeg, elDeg) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const ez = nrm3([Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]); // 由心指向相机
  const up = [0, 0, 1];
  const ex = nrm3([up[1] * ez[2] - up[2] * ez[1], up[2] * ez[0] - up[0] * ez[2], up[0] * ez[1] - up[1] * ez[0]]);
  const ey = [ez[1] * ex[2] - ez[2] * ex[1], ez[2] * ex[0] - ez[0] * ex[2], ez[0] * ex[1] - ez[1] * ex[0]];
  return { ex, ey, ez };
}

/** 把三角形铺到一张平面掩码上（只看剪影，不看遮挡） */
export function silhouetteMask(mesh, pose = ISO, size = 320) {
  const { ex, ey } = basisOf(pose.az, pose.el);
  const mask = new Uint8Array(size * size);
  const half = 1.15;
  const k = size / 2 / half;
  const c0 = size / 2;
  const P = mesh.positions;
  const nT = P.length / 9;
  for (let t = 0; t < nT; t++) {
    const xs = [0, 0, 0];
    const ys = [0, 0, 0];
    for (let v = 0; v < 3; v++) {
      const x = P[t * 9 + v * 3];
      const y = P[t * 9 + v * 3 + 1];
      const z = P[t * 9 + v * 3 + 2];
      xs[v] = c0 + (x * ex[0] + y * ex[1] + z * ex[2]) * k;
      ys[v] = c0 - (x * ey[0] + y * ey[1] + z * ey[2]) * k;
    }
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(...ys)));
    const d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
    if (Math.abs(d) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((xs[1] - px) * (ys[2] - py) - (xs[2] - px) * (ys[1] - py)) / d;
        const w1 = ((xs[2] - px) * (ys[0] - py) - (xs[0] - px) * (ys[2] - py)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) mask[y * size + x] = 1;
      }
    }
  }
  return { mask, size, k, c0 };
}

/** 剪影里的「内角半径」：从中心向 720 个方向射，取穿出掩码的最短距离 */
export function maskNotch({ mask, size, k }) {
  const c0 = size / 2;
  let mn = Infinity;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let r = 0;
    for (let s = 1; s < size; s++) {
      const x = Math.round(c0 + dx * s);
      const y = Math.round(c0 + dy * s);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      if (mask[y * size + x]) r = s;
    }
    if (r > 0 && r < mn) mn = r;
  }
  return mn / k; // 换算回世界单位
}

/** 立方群逐点不变：绕 x / y / z 各 90°、绕 (1,1,1) 120°，每个顶点都要在原集合里找到同一点 */
export function symmetryCheck(mesh) {
  const P = mesh.positions;
  const key = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
  const set = new Set();
  for (let i = 0; i < P.length; i += 3) set.add(key([P[i], P[i + 1], P[i + 2]]));
  const rots = [
    { name: '绕 x 90°', m: (p) => [p[0], -p[2], p[1]] },
    { name: '绕 y 90°', m: (p) => [p[2], p[1], -p[0]] },
    { name: '绕 z 90°', m: (p) => [-p[1], p[0], p[2]] },
    { name: '绕 (1,1,1) 120°', m: (p) => [p[2], p[0], p[1]] },
  ];
  const out = [];
  for (const r of rots) {
    let bad = 0;
    let worst = 0;
    for (let i = 0; i < P.length; i += 3) {
      const q = r.m([P[i], P[i + 1], P[i + 2]]);
      if (!set.has(key(q))) {
        bad++;
        /* 找出最近点的距离，好知道差多少 */
        let best = Infinity;
        for (let j = 0; j < P.length; j += 3) {
          const d = Math.hypot(P[j] - q[0], P[j + 1] - q[1], P[j + 2] - q[2]);
          if (d < best) best = d;
        }
        worst = Math.max(worst, best);
      }
    }
    out.push({ name: r.name, bad, worst: +worst.toFixed(8) });
  }
  return out;
}

/* ── 一个配置的全部读数 ──────────────────────────────────── */
export function readouts(cfgIn, { mc = 96 } = {}) {
  const cfg = fillCfg(cfgIn);
  const { geo, positions, normals, stats, info, sec } = buildStar(cfg);
  const F = PROFILES[cfg.prof] || PROFILES.straight;
  const sc = stats.sc;
  const ci = stats.cfg;
  const wEff = stats.wEff;

  /* 母线在半宽上的收放：以「同 w 的标准锥」为 1 */
  const W05 = (cfg.w * F.f(0.5)) * sc;
  const waistRatio = W05 / (wEff * 0.5);
  /* 腰的位置：W(u)/(1-u) 的最小值处（标准锥恒为 1） */
  let waistAt = 0;
  let waistVal = Infinity;
  for (let i = 1; i < 200; i++) {
    const u = i / 200;
    if (u > info.uj) break;
    const r = F.f(u) / (1 - u);
    if (r < waistVal) {
      waistVal = r;
      waistAt = u;
    }
  }
  /* 尖端半角：母线在 u=0.5 与 u=0.9 处的斜率 */
  const ang = (u) => (Math.atan(Math.abs(cfg.w * F.df(u)) * sc) / DEG);
  const sec05 = sectionLoop(cfg.fillet);
  const faceHalf = (W05 * sec05.maxR) / Math.SQRT2; // 面宽的一半（粗略：截面半径 /√2）
  const filletR = cfg.fillet * Math.SQRT2 * 0.5 * W05;
  const nb = notch3D(cfg);

  /* 平法线/平滑法线下「面」的调子跨度：用世界光向 —— 相机在体对角、光在相机空间 (-0.55,0.7,1.0) */
  const basis = basisOf(ISO.az, ISO.el);
  const toWorld = (v) => [
    basis.ex[0] * v[0] + basis.ey[0] * v[1] + basis.ez[0] * v[2],
    basis.ex[1] * v[0] + basis.ey[1] * v[1] + basis.ez[1] * v[2],
    basis.ex[2] * v[0] + basis.ey[2] * v[1] + basis.ez[2] * v[2],
  ];
  const Lw = nrm3(toWorld(nrm3([-0.55, 0.7, 1.0])));
  let lo = 1;
  let hi = 0;
  let front = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const n = [normals[i], normals[i + 1], normals[i + 2]];
    if (n[0] * basis.ez[0] + n[1] * basis.ez[1] + n[2] * basis.ez[2] < 0.02) continue;
    front++;
    const t = Math.max(0, n[0] * Lw[0] + n[1] * Lw[1] + n[2] * Lw[2]);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }

  /* 投影内角半径（只用来跟现役那张图对账，不参与定参数） */
  const meshLike = { positions };
  const sil = silhouetteMask(meshLike, ISO, 288);
  const projNotch = maskNotch(sil);
  let tipProj = 0;
  for (let i = 0; i < positions.length; i += 3) tipProj = Math.max(tipProj, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));

  const sol = solidStats(cfg, { n: mc });

  return {
    cfg: ci,
    tris: stats.tris,
    verts: stats.verts,
    rings: stats.rings,
    section: stats.section,
    wEff: +wEff.toFixed(4),
    /* 「尖端填充」= 归一化之前，支沿轴实际走到哪里（E = c+ρ < 1 就是被圆头吃掉的量）。
       归一化之后它恒为 1，所以这里给的是 E 本身，另给 stretch = 1/E 说明等比放大了多少。 */
    cut: +(1 - 1 / stats.sc).toFixed(4),
    stretch: +sc.toFixed(4),
    waistRatio: +waistRatio.toFixed(3),
    waistAt: +waistAt.toFixed(2),
    angMid: +ang(0.5).toFixed(2),
    ang90: +ang(0.9).toFixed(2),
    angTip: info.rho > 1e-9 ? 0 : +ang(1).toFixed(2),
    filletR: +filletR.toFixed(4),
    filletShare: +(faceHalf > 0 ? filletR / faceHalf : 0).toFixed(2),
    tipBallR: +(info.rho * sc).toFixed(4),
    secMaxR: +stats.secMaxR.toFixed(4),
    notch3D: +nb.toFixed(4),
    notchRel: +(nb / 1).toFixed(4),
    vol: +sol.volUnion.toFixed(4),
    overlapShare: +sol.overlapShare.toFixed(3),
    toneLo: +lo.toFixed(3),
    toneHi: +hi.toFixed(3),
    frontTris: front,
    projNotch: +projNotch.toFixed(4),
    projNotchRel: +(projNotch / (tipProj || 1)).toFixed(4),
    bb: 2 * (stats.bbox ? Math.max(stats.bbox.max.x, stats.bbox.max.y, stats.bbox.max.z) : 1),
    geo,
    stats,
  };
}

/* ── 材质与光 ──────────────────────────────────────────────── */
export const GROUNDS = {
  light: { bg: '#f0f3f6', base: 0x8d87a6, label: '浅底 #f0f3f6' },
  dark: { bg: '#2a2b38', base: 0x9b95b8, label: '深底 #2a2b38' },
};
export function makeMaterial(ground = 'light') {
  return new THREE.MeshStandardMaterial({
    color: GROUNDS[ground] ? GROUNDS[ground].base : 0x8d87a6,
    roughness: 0.9,
    metalness: 0,
    flatShading: false,
    side: THREE.FrontSide, // 闭合实体：背面不必画（star-gl 验过）
  });
}
/** 光挂在相机上：绕着看的时候明暗不跳，任何角度都读得出形体 */
export function rigLights(cam) {
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-0.62, 0.78, 1.05);
  const fill = new THREE.DirectionalLight(0xdfe3f2, 0.55);
  fill.position.set(0.85, -0.45, 0.5);
  cam.add(key, fill);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8b8ba2, 0.5);
  cam.parent ? cam.parent.add(hemi) : null;
  return { key, fill, hemi };
}

/** 相机距离：让世界半径 FIT 的球在**两个方向上都**放得下（fov 是竖向的）。
    hero 是宽画框、小格是方画框，竖的一侧永远更紧，所以按 min(1, aspect) 算。
    FIT 取 1.02 而不是 1.2：体对角视角下六个尖只投到 0.8165·r，留 0.2 的余量
    在画面上就是一整圈空白 —— 这一页要判的是形状，不是留白。转到别的角度
    支尖最多到 1.0，1.02 也不会切。 */
const FIT = 1.02;
function fitDist(fov, aspect) {
  const tv = Math.tan((fov * DEG) / 2);
  return FIT / (tv * Math.min(1, aspect || 1));
}

/* ── 一张画布 N 格 ─────────────────────────────────────────
   一个 WebGL 上下文（Chrome 只给 16 个，这一页有三十几格），
   每格一个场景、一台透视相机、一副自己的轨道；只在「有事发生」时出帧。 */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearAlpha(0);
    this.renderer.autoClear = false;
    this.mats = { light: makeMaterial('light'), dark: makeMaterial('dark') };
    this.cells = [];
    this.frames = 0;
    this.dirty = true;
    this.idle = false;
    this.raf = 0;
    this._loop = this._loop.bind(this);
    this.resize();
    addEventListener('resize', () => this.kick());
    addEventListener('scroll', () => this.kick(), { passive: true });
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    this.dpr = dpr;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    this.bw = Math.round(w * dpr);
    this.bh = Math.round(h * dpr);
    this.W = w;
    this.H = h;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }
  /**
   * 加一格。el 是页面上那个占位的 div（透明底，负责接指针事件）。
   * obj 给了就直接用（导出那一格是 glb 读回来的网格）。
   */
  add(el, { cfg = BASE, ground = 'light', fov = 30, pose = ISO, dist = null, obj = null, mesh = null, bare = false } = {}) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 60);
    scene.add(cam);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8b8ba2, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-0.62, 0.78, 1.05);
    const fill = new THREE.DirectionalLight(0xdfe3f2, 0.55);
    fill.position.set(0.85, -0.45, 0.5);
    cam.add(key, fill);
    let m = mesh;
    /* bare：只铺一块底色、不放星。深底那一整块就是靠它铺出来的 ——
       页面上的 div 不能有底色（它在画布上面，涂上色就把星盖掉）。 */
    if (!bare) {
      if (!m) m = new THREE.Mesh(obj ? obj.geometry : buildStar(cfg).geo, obj ? obj.material : this.mats[ground]);
      m.frustumCulled = false;
      scene.add(m);
    }
    const cell = {
      el,
      scene,
      cam,
      mesh: m || null,
      mat: m ? m.material : null,
      bare,
      ground,
      groundColor: new THREE.Color(GROUNDS[ground] ? GROUNDS[ground].bg : '#f0f3f6'),
      /* 轨道：az/el/dist 是当前值，t* 是目标值（阻尼逼近） */
      /* 不传 dist 就按画框自动取（见 fitDist）；传了就用传的（等于用户自己拉过镜头）。 */
      orb: null,
      home: { az: pose.az, el: pose.el, dist: 0 },
      fov,
      userDist: dist != null,
      onPose: null,
    };
    const d0 = dist == null ? fitDist(fov, 1) : dist;
    cell.orb = { az: pose.az, el: pose.el, dist: d0, taz: pose.az, tel: pose.el, tdist: d0 };
    cell.home.dist = d0;
    this.cells.push(cell);
    this.bind(cell);
    this.kick();
    return cell;
  }
  bind(cell) {
    const el = cell.el;
    let drag = null;
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, az: cell.orb.taz, el: cell.orb.tel };
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-drag');
      },
    );
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      cell.orb.taz = drag.az - (e.clientX - drag.x) * 0.42;
      cell.orb.tel = clamp(drag.el + (e.clientY - drag.y) * 0.42, -86, 86);
      this.kick();
    });
    const end = (e) => {
      if (!drag) return;
      drag = null;
      el.classList.remove('is-drag');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* 指针已经松开也就算了 */
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        /* 用户拉了滚轮就接管距离：关掉自动取距，否则下一帧 fitDist 又把 tdist 写回去
           （第一版就是这样，滚轮完全没反应 —— 自检里 distAfterZoom 与 before 一模一样才抓到）。 */
        cell.userDist = true;
        cell.orb.tdist = clamp(cell.orb.tdist * (1 + clamp(e.deltaY, -240, 240) * 0.0012), 1.9, 12);
        this.kick();
      },
      { passive: false },
    );
    el.addEventListener('dblclick', () => {
      /* 双击回正位时把自动取距还回去 */
      cell.userDist = false;
      this.home(cell);
    });
  }
  home(cell) {
    cell.orb.taz = cell.home.az + Math.round((cell.orb.taz - cell.home.az) / 360) * 360;
    cell.orb.tel = cell.home.el;
    cell.orb.tdist = cell.home.dist;
    this.kick();
  }
  spin(cell, deg = 360) {
    cell.orb.taz += deg;
    this.kick();
  }
  /** 立刻摆到某个姿态（截图用） */
  setPose(cell, az, el, dist) {
    cell.orb.az = cell.orb.taz = az;
    if (el != null) cell.orb.el = cell.orb.tel = el;
    if (dist != null) cell.orb.dist = cell.orb.tdist = dist;
    this.kick();
  }
  cellByName(name) {
    return this.cells.find((c) => c.el.dataset.cell === name);
  }
  kick() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
  }
  advance() {
    let busy = false;
    for (const c of this.cells) {
      const o = c.orb;
      const k = 0.16;
      const d = (a, b) => b - a;
      if (Math.abs(o.taz - o.az) > 0.02) {
        o.az += d(o.az, o.taz) * k;
        busy = true;
      } else o.az = o.taz;
      if (Math.abs(o.tel - o.el) > 0.02) {
        o.el += d(o.el, o.tel) * k;
        busy = true;
      } else o.el = o.tel;
      if (Math.abs(o.tdist - o.dist) > 0.002) {
        o.dist += d(o.dist, o.tdist) * k;
        busy = true;
      } else o.dist = o.tdist;
      /* 自动取距的格：画框是竖的（等比小格），dist 要跟着实际长宽比走，
         否则星在窄格里会从上下切出去。用户拉过滚轮的格不再改。 */
      if (!c.userDist) {
        const b = c.el.getBoundingClientRect();
        const asp = b.height > 0 ? b.width / b.height : 1;
        const fd = fitDist(c.fov, asp);
        if (Math.abs(fd - o.dist) > 1e-4) {
          o.dist = o.tdist = c.home.dist = fd;
          busy = true;
        }
      }
      /* 相机：由 az/el/dist 摆位，up 取世界 +z，始终看向原点 */
      const B = basisOf(o.az, o.el);
      c.cam.position.set(B.ez[0] * o.dist, B.ez[1] * o.dist, B.ez[2] * o.dist);
      c.cam.up.set(0, 0, 1);
      c.cam.lookAt(0, 0, 0);
      if (c.onPose) c.onPose(o);
    }
    return busy;
  }
  _loop() {
    this.raf = 0;
    this.resize();
    const busy = this.advance();
    this.dirty = false;
    this.render();
    this.frames++;
    this.idle = !busy;
    if (busy) this.kick();
    else this.dirty = false;
  }
  render() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.bw, this.bh);
    /* 整幅先清成透明：滚出去的那些格不会被重画，不清的话它们上一次画的底色
       （尤其深底那一块）会留在原地，滚到别处就看见一片深色。 */
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.setScissorTest(true);
    const k = this.dpr;
    for (const c of this.cells) {
      const b = c.el.getBoundingClientRect();
      if (b.bottom < -40 || b.top > this.H + 40 || b.right < -40 || b.left > this.W + 40) continue;
      const w = Math.round(b.width * k);
      const h = Math.round(b.height * k);
      if (w < 4 || h < 4) continue;
      const x = Math.round(b.left * k);
      const y = Math.round(this.bh - (b.top + b.height) * k);
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      /* 底色由 GL 自己铺：画布是固定铺满视口的一层，页面上的占位 div 必须透明
         （否则它们会盖在画布上面，整片星空）。这里每格先按自己的底色清一次。 */
      r.setClearColor(c.groundColor, 1);
      r.clear(true, true, true);
      c.cam.aspect = b.width / b.height;
      c.cam.updateProjectionMatrix();
      r.render(c.scene, c.cam);
    }
    r.setScissorTest(false);
  }
}

/* ── 导出 ─────────────────────────────────────────────────── */
/** glb 字节：顶点合并过（平滑法线时同点同法线能合掉一大半） */
export function glbOf(cfgIn, { ground = 'light', merge = true } = {}) {
  const { geo, stats } = buildStar(cfgIn);
  let g = geo;
  if (merge) {
    try {
      g = mergeVertices(geo.clone(), 1e-6);
    } catch {
      g = geo;
    }
  }
  const mat = makeMaterial(ground);
  mat.name = 'star-matte';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'star';
  const scene = new THREE.Scene();
  scene.add(mesh);
  return new Promise((res, rej) => {
    new GLTFExporter().parse(
      scene,
      (buf) => res({ buf, stats, tris: g.index ? g.index.count / 3 : g.attributes.position.count / 3, geo: g }),
      (err) => rej(err),
      { binary: true, onlyVisible: false },
    );
  });
}

/* ── 三组扫的档位 ────────────────────────────────────────── */
/* 采用的那一档：粗细 0.26、母线取凹、圆角 0.34、尖端球 0.12（× 半宽） */
export const WIN = Object.freeze({ w: 0.26, prof: 'waist', fillet: 0.34, tipR: 0.12, shade: 'smooth' });

export const SWEEPS = {
  thick: [0.16, 0.21, 0.26, 0.32, 0.4].map((w) => ({ w, label: `粗细 ${w.toFixed(2)}`, cfg: { ...WIN, w } })),
  smooth: [
    { key: 'hard', label: '硬', cfg: { ...WIN, fillet: 0, tipR: 0, shade: 'flat' }, note: '截面是菱形、没有圆角，尖端是一个点，平法线' },
    { key: 'edge', label: '微圆', cfg: { ...WIN, fillet: 0.22, tipR: 0.06, shade: 'flat' }, note: '棱上留一道细圆角，仍是平法线' },
    { key: 'round', label: '圆棱', cfg: { ...WIN, fillet: 0.45, tipR: 0.12, shade: 'smooth' }, note: '圆角吃掉面宽的一截，换平滑法线' },
    { key: 'soft', label: '柔', cfg: { ...WIN, fillet: 0.85, tipR: 0.26, shade: 'smooth' }, note: '截面几乎成圆，棱与尖端都退成一条柔和的高光带' },
  ],
  arc: [
    { key: 'straight', label: '直', cfg: { ...WIN, prof: 'straight' } },
    { key: 'waist', label: '凹', cfg: { ...WIN, prof: 'waist' } },
    { key: 'waistDeep', label: '深凹', cfg: { ...WIN, prof: 'waistDeep' } },
    { key: 'belly', label: '凸', cfg: { ...WIN, prof: 'belly' } },
    { key: 'sform', label: 'S', cfg: { ...WIN, prof: 'sform' } },
  ],
};