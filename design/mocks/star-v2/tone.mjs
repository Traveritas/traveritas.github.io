/* 色调账（离线，不碰浏览器）
   node design/mocks/star-v2/tone.mjs            → 打印分布
   node design/mocks/star-v2/tone.mjs --json      → 只打一行 JSON

   这是 `src.js` 那张片元着色器的**逐行 JS 复写**：同样的 env()、同样的半空间并集、
   同样的「跨过界面后仍在体内就不折射」、同样的三色色散折射、同样的 exp(−kabs·L) 吸收、
   同样的光核积分与薄膜虹彩、同样的菲涅尔。所以这里量出来的数与画出来的数是一回事 ——
   没有浏览器的前提下，这是唯一能知道离 BRIEF 的目标还有多远的方法。

   量的东西（BRIEF §1 那张表的口径）：
     · 星占画布面积（400×400，与底色 rgb(240,243,246) 差 > 6 的像素算星内）
     · 星内亮度 P5 / P50 / P95、亮度恰为 255 的占比
     · 星内 B−R 的均值与最大值
     · 每支根部宽度（400px 画布上，正位）
     · 后方那条横线：星内被切成几段、每段水平偏移多少像素
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildBlocks, blocksInView, poseAt, RENDER, SHAPE } from './src.js';

const JS = process.argv.includes('--json');
const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ═══ 着色器里的常量（与 src.js 一一对应） ═══════════════════════
   全部从 RENDER 读，`--set key=value` 可以临时盖掉某个（扫旋钮用），
   所以这里量出来的分布与着色器画出来的分布是同一批参数。 */

export const P = {
  dream: 0,
  camZ: RENDER.camZ,
  tan: RENDER.tan,
  edgeW: RENDER.edgeW,
  card: RENDER.card,
  ior: RENDER.ior,
  feat: RENDER.feat,
  irid: RENDER.irid,
  core: RENDER.core,
  glowMix: RENDER.glowMix,
  disp: RENDER.disp,
  cool: RENDER.cool,
  ringTint: RENDER.ringTint,
  coolDark: RENDER.coolDark,
  coolLow: RENDER.coolLow,
  back: RENDER.back,
  rough: RENDER.rough,
};
/* --set k=v（也接受 --set=k=v 一个 token 的写法）。
   值可以是数，也可以是逗号分隔的三元组（ringTint=0.85,0.93,1.04）。 */
const argv = process.argv.slice(2);
const valOf = (s) =>
  s.includes(',') ? s.split(',').map(Number) : +s;
for (let i = 0; i < argv.length; i++) {
  let kv = null;
  const one = /^--set=([A-Za-z]+)=(-?[\d.,]+)$/.exec(argv[i]);
  if (one) kv = [one[1], one[2]];
  else if (argv[i] === '--set' && i + 1 < argv.length) {
    const two = /^([A-Za-z]+)=(-?[\d.,]+)$/.exec(argv[i + 1]);
    if (two) {
      kv = [two[1], two[2]];
      i++;
    }
  }
  if (kv) {
    if (!(kv[0] in P)) {
      console.error(`未知旋钮：${kv[0]}`);
      process.exit(2);
    }
    P[kv[0]] = valOf(kv[1]);
  }
}
const DREAM = P.dream;
const CAM_Z = P.camZ;
export const TAN = P.tan;
const EDGE_W = P.edgeW;
const CARD = P.card;
const IOR = P.ior;
const FEAT = P.feat;
const ROUGH = P.rough - 0.12 * DREAM;
const IRID = P.irid;
const CORE = P.core + 0.95 * DREAM;
const DISP = P.disp * (1 + 0) ; // 梦面另算，这里只跑醒面
const COOL = P.cool;
const RING_TINT = P.ringTint;
const COOL_DARK = P.coolDark;
const COOL_LOW = P.coolLow;
/* 其余着色器常量（shade 里会用到 disp / glowMix / back） */
export const TUNE = {
  EDGE_W: P.edgeW,
  CARD: P.card,
  IOR: P.ior,
  FEAT: P.feat,
  ROUGH: P.rough - 0.12 * P.dream,
  IRID: P.irid,
  CORE: P.core + 0.95 * P.dream,
  CORE_C: [0, 0.04 + 0.1 * P.dream, 0],
  DREAM: P.dream,
  disp: P.disp,
  glowMix: P.glowMix,
  back: P.back,
};
const CORE_C = [0, 0.04 + 0.1 * DREAM, 0];

/* 底：底色 + 一条横线 + 一行字（与 makeBackdrop 同一套位置：ndc ±0.16） */
const BG = [240 / 255, 243 / 255, 246 / 255];

/* ═══ 向量小工具 ═══════════════════════════════════════════════ */
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
};
const reflect = (I, N) => {
  const d = 2 * dot3(I, N);
  return [I[0] - d * N[0], I[1] - d * N[1], I[2] - d * N[2]];
};
/** GLSL 的 refract：全反射时返回 0 向量 */
function refract(I, N, eta) {
  const d = dot3(N, I);
  const k = 1 - eta * eta * (1 - d * d);
  if (k < 0) return [0, 0, 0];
  return [eta * I[0] - (eta * d + Math.sqrt(k)) * N[0], eta * I[1] - (eta * d + Math.sqrt(k)) * N[1], eta * I[2] - (eta * d + Math.sqrt(k)) * N[2]];
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ═══ env()：nexus-slice.ts 的复写 + 本轮两处改动（与 src.js 的 FS 逐行对应） ═══ */
export function env(d, r) {
  const w = 1 + 3 * r;
  const y = d[1];
  const cg = CARD;
  let top = [0.9, 0.895, 0.97];
  const hor = [1.0, 0.975, 0.965];
  const low = mix3([0.78, 0.745, 0.8], [0.735, 0.745, 0.845], COOL_LOW);
  top = mix3(top, [0.94, 0.9, 0.95], DREAM);
  let c =
    y > 0 ? mix3(hor, top, smoothstep(0, 0.65 * w, y)) : mix3(hor, low, smoothstep(0, 0.5 * w, -y));
  const band = 0.12 * Math.exp(-Math.pow(y / (0.06 * w), 2));
  c = [c[0] + band, c[1] + band * (0.1 / 0.12), c[2] + band * (0.09 / 0.12)];
  const ck = mix(1, 0.92, smoothstep(0.15, 0.95, d[2]));
  c = [c[0] * ck, c[1] * ck, c[2] * ck];
  const k = 1 - r * 0.6;
  const cardA = 1 - 0.3 * cg * k * smoothstep(1 - 0.2 * w, 0.97, dot3(d, norm([-0.95, 0.05, -0.3])));
  const cardB = 1 - 0.15 * cg * k * smoothstep(1 - 0.25 * w, 0.97, dot3(d, norm([0.85, -0.25, 0.45])));
  c = [c[0] * cardA * cardB, c[1] * cardA * cardB, c[2] * cardA * cardB];
  const key = smoothstep(1 - 0.1 * w, 0.975, dot3(d, norm([-0.5, 0.7, 0.5]))) * 0.75 * k;
  c = [c[0] + key, c[1] + key * 0.99, c[2] + key * 0.97];
  const fill = smoothstep(1 - 0.07 * w, 0.99, dot3(d, norm([0.75, 0.25, -0.6]))) * 0.3 * k;
  c = [c[0] + fill, c[1] + fill * 0.94, c[2] + fill * 0.96];
  /* 冷环：盖住出射最密集的那一圈（y≈0、z≈−0.95 的后方地平带） */
  const ring = smoothstep(0.85, 0, Math.abs(y - 0.02)) * (0.35 + 0.65 * smoothstep(0.3, -0.9, d[2]));
  const t = ring * COOL;
  c = [mix(c[0], c[0] * RING_TINT[0], t), mix(c[1], c[1] * RING_TINT[1], t), mix(c[2], c[2] * RING_TINT[2], t)];
  /* 暗尾推冷：只乘在亮度已经低的方向上 */
  const dl = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const dark = 1 - smoothstep(0.62, 0.92, dl);
  const dd = dark * COOL_DARK;
  c = [mix(c[0], c[0] * 0.88, dd), mix(c[1], c[1] * 0.93, dd), mix(c[2], c[2] * 1.12, dd)];
  return c;
}

/* ═══ 几何：并集 ═══════════════════════════════════════════════
   `VIEW` 可换（setView）—— 第四轮的形状对照要在同一个进程里跑三种截面，
   换掉的只是「喂进去的面表」，着色流程一个字不改。 */
let VIEW = blocksInView(buildBlocks(), poseAt(0));
/** 换一份面表（已在视空间）。传 ML 面表进来前先过 blocksInView。 */
export function setView(v) {
  VIEW = v;
}

function inPiece(p, k) {
  const faces = VIEW[k];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (f[0] * p[0] + f[1] * p[1] + f[2] * p[2] > f[3] + 1e-5) return false;
  }
  return true;
}
function inAny(p) {
  for (let k = 0; k < VIEW.length; k++) if (inPiece(p, k)) return true;
  return false;
}
/** 入口：返回 {t, n, k}，没打中给 null */
function entryT(ro, rd) {
  let best = 1e9;
  let nIn = [0, 0, 1];
  let kIn = -1;
  for (let k = 0; k < VIEW.length; k++) {
    const faces = VIEW[k];
    let t0 = -1e9;
    let t1 = 1e9;
    let n0 = [0, 0, 1];
    for (const f of faces) {
      const dn = f[0] * rd[0] + f[1] * rd[1] + f[2] * rd[2];
      const num = f[3] - (f[0] * ro[0] + f[1] * ro[1] + f[2] * ro[2]);
      if (dn > 1e-7) {
        const t = num / dn;
        if (t < t1) t1 = t;
      } else if (dn < -1e-7) {
        const t = num / dn;
        if (t > t0) {
          t0 = t;
          n0 = [f[0], f[1], f[2]];
        }
      }
    }
    if (t0 > t1 || t1 <= 1e-6) continue;
    if (t0 < best) {
      best = t0;
      nIn = n0;
      kIn = k;
    }
  }
  return kIn < 0 || best > 1e8 ? null : { t: best, n: nIn, k: kIn };
}
function edgeDist(p, n, k) {
  let best = 1e9;
  let nb = n;
  for (const f of VIEW[k]) {
    const c = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
    if (c > 0.9995) continue;
    const e = (f[3] - (f[0] * p[0] + f[1] * p[1] + f[2] * p[2])) / Math.sqrt(Math.max(1e-4, 1 - c * c));
    if (e < best) {
      best = e;
      nb = [f[0], f[1], f[2]];
    }
  }
  return { e: best, nb };
}
function roundN(p, n, k) {
  const { e, nb } = edgeDist(p, n, k);
  /* 这里读 P.edgeW 而不是模块常量 —— 形状对照的 C 列要临时改棱宽，
     改的是同一个旋钮、同一处读法，不另开一条代码路径。 */
  const tb = 1 - smoothstep(0, P.edgeW, e);
  const s = norm([n[0] + nb[0], n[1] + nb[1], n[2] + nb[2]]);
  return { N: norm(mix3(n, s, tb * tb)), tb };
}
function glowSeg(A, B) {
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const aa = dot3(ab, ab);
  const t = clamp(dot3([CORE_C[0] - A[0], CORE_C[1] - A[1], CORE_C[2] - A[2]], ab) / Math.max(aa, 1e-6), 0, 1);
  const q = [
    A[0] + ab[0] * t - CORE_C[0],
    A[1] + ab[1] * t - CORE_C[1],
    A[2] + ab[2] * t - CORE_C[2],
  ];
  return Math.exp(-dot3(q, q) / 0.12) * Math.hypot(ab[0], ab[1], ab[2]);
}
function nextExit(p, T) {
  let tm = 1e9;
  let Ne = [0, 0, 1];
  let pid = -1;
  for (let k = 0; k < VIEW.length; k++) {
    if (!inPiece(p, k)) continue;
    for (const f of VIEW[k]) {
      const dn = f[0] * T[0] + f[1] * T[1] + f[2] * T[2];
      if (dn > 1e-6) {
        const t = (f[3] - (f[0] * p[0] + f[1] * p[1] + f[2] * p[2])) / dn;
        if (t < tm) {
          tm = t;
          Ne = [f[0], f[1], f[2]];
          pid = k;
        }
      }
    }
  }
  return pid < 0 ? null : { t: Math.max(tm, 0), n: Ne, k: pid };
}

/* 方向 → 屏幕 ndc（底在**有限**距离上）：射线从出射点 Q 沿 T 走到底面 z = −back，
   落点按透视投到画面上。这是「折射错位」的真视差量 —— 与 src.js 的 ndcHit 一致。 */
export const ndcHit = (Q, T, back) => {
  const t = (-back - Q[2]) / Math.min(T[2], -1e-3);
  const p = [Q[0] + T[0] * t, Q[1] + T[1] * t, Q[2] + T[2] * t];
  return [p[0] / (back * TAN), p[1] / (back * TAN)];
};
/* 无穷远（只按方向）—— 只用来做参照，不参与星的着色 */
export const ndcOf = (T) => [T[0] / -T[2] / TAN, T[1] / -T[2] / TAN];
/* 没打中星体的像素：底就在那里，直接按视线取 */

/* ═══ shade()：与片元着色器同一套流程 ═════════════════════════════ */
export function shade(ro, rd) {
  const hit = entryT(ro, rd);
  if (!hit) return null;
  const I = rd;
  const V = [-rd[0], -rd[1], -rd[2]];
  const P = [ro[0] + rd[0] * Math.max(hit.t, 1e-5), ro[1] + rd[1] * Math.max(hit.t, 1e-5), ro[2] + rd[2] * Math.max(hit.t, 1e-5)];

  const { N: Nb, tb: tbEdge } = roundN(P, hit.n, hit.k);
  const ndv = clamp(dot3(Nb, V), 0, 1);
  const F = 0.04 + 0.96 * Math.pow(1 - ndv, 5);
  let refl = env(reflect(I, Nb), 0);

  let T = refract(I, Nb, 1 / IOR);
  if (dot3(T, T) < 1e-8) T = reflect(I, Nb);

  let L = 0;
  let g = 0;
  let inner = 0;
  let trans = [0, 0, 0];
  let done = false;
  let exitDir = T;
  let exitPos = P;
  let disp = TUNE.disp;
  let Pp = P;

  for (let b = 0; b < 4; b++) {
    const ex = nextExit(Pp, T);
    if (!ex) break;
    const Q = [Pp[0] + T[0] * ex.t, Pp[1] + T[1] * ex.t, Pp[2] + T[2] * ex.t];
    L += ex.t;
    g += glowSeg(Pp, Q);
    if (b === 0) inner = Math.exp(-Math.pow(edgeDist(Q, ex.n, ex.k).e / 0.01, 2));
    const Qs = [Q[0] + T[0] * 1e-4, Q[1] + T[1] * 1e-4, Q[2] + T[2] * 1e-4];
    if (inAny(Qs)) {
      Pp = Qs;
      continue;
    }
    const Ne = [-ex.n[0], -ex.n[1], -ex.n[2]];
    const Tg = refract(T, Ne, IOR);
    if (dot3(Tg, Tg) > 0) {
      let Tr = refract(T, Ne, IOR - disp);
      let Tb = refract(T, Ne, IOR + disp);
      if (dot3(Tr, Tr) === 0) Tr = Tg;
      if (dot3(Tb, Tb) === 0) Tb = Tg;
      const Fe = 0.04 + 0.96 * Math.pow(1 - clamp(dot3([-Ne[0], -Ne[1], -Ne[2]], Tg), 0, 1), 5);
      const er = env(Tr, ROUGH);
      const eg = env(Tg, ROUGH);
      const eb = env(Tb, ROUGH);
      trans = [er[0] * (1 - Fe), eg[1] * (1 - Fe), eb[2] * (1 - Fe)];
      exitDir = Tg;
      exitPos = Q;
      done = true;
      break;
    }
    T = reflect(T, [-Ne[0], -Ne[1], -Ne[2]]);
    Pp = Qs;
    exitDir = T;
  }
  if (!done) {
    const e = env(T, ROUGH);
    trans = [e[0] * 0.85, e[1] * 0.85, e[2] * 0.85];
  }

  const kabs = mix3([0.06, 0.064, 0.012], [0.03, 0.058, 0.03], DREAM);
  const att = [Math.exp(-kabs[0] * L) * 1.03, Math.exp(-kabs[1] * L) * 1.03, Math.exp(-kabs[2] * L) * 1.03];
  const inn = 1 - inner * 0.16;
  trans = [trans[0] * att[0] * inn, trans[1] * att[1] * inn, trans[2] * att[2] * inn];

  const gc = 1 - Math.exp(-g * CORE);
  const glow = mix3([1.0, 0.975, 0.955], [1.0, 0.955, 0.965], DREAM);
  const gm = gc * TUNE.glowMix;
  trans = [
    mix(trans[0], glow[0] * 1.05, gm),
    mix(trans[1], glow[1] * 1.05, gm),
    mix(trans[2], glow[2] * 1.05, gm),
  ];

  const film = [0, 1, 2].map((i) => 0.5 + 0.5 * Math.cos(6.2832 * (i / 3 + 1.8 * (1 - ndv))));
  refl = [refl[0] * mix(1, film[0], IRID), refl[1] * mix(1, film[1], IRID), refl[2] * mix(1, film[2], IRID)];
  let col = [mix(trans[0], refl[0], F), mix(trans[1], refl[1], F), mix(trans[2], refl[2], F)];

  const Lk = norm([-0.5, 0.7, 0.5]);
  const h = norm([Lk[0] + V[0], Lk[1] + V[1], Lk[2] + V[2]]);
  const spec = Math.pow(Math.max(dot3(Nb, h), 0), 260) * (0.9 + 0.6 * tbEdge);
  col = [col[0] + spec, col[1] + spec, col[2] + spec];

  return { col, exitDir, exitPos: exitPos, L, g, inner, F, spec, trans, refl };
}

/* ═══ 光栅：400×400，正交近似（与着色器同一套 ndc → 射线） ═══════════ */
export function raster(px = 400, ss = 2) {
  const out = new Float32Array(px * px * 3);
  const cover = new Float32Array(px * px);
  const cam = [0, 0, CAM_Z];
  const P = RENDER ? SHAPE : SHAPE;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let acc = [0, 0, 0];
      let cov = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const ox = (i + 0.5) / ss - 0.5;
          const oy = (j + 0.5) / ss - 0.5;
          const nx = ((x + 0.5 + ox) / px) * 2 - 1;
          const ny = 1 - ((y + 0.5 + oy) / px) * 2;
          const rd = norm([nx * TAN, ny * TAN, -1]);
          const s = shade(cam, rd);
          if (s) {
            acc = [acc[0] + s.col[0], acc[1] + s.col[1], acc[2] + s.col[2]];
            cov++;
          }
        }
      }
      const k = y * px + x;
      cover[k] = cov / (ss * ss);
      out[k * 3] = cov ? acc[0] / cov : BG[0];
      out[k * 3 + 1] = cov ? acc[1] / cov : BG[1];
      out[k * 3 + 2] = cov ? acc[2] / cov : BG[2];
    }
  }
  // 星外像素写成底色（着色器里就是背景纹理的原样）
  for (let k = 0; k < px * px; k++) {
    if (cover[k] <= 0) {
      out[k * 3] = BG[0];
      out[k * 3 + 1] = BG[1];
      out[k * 3 + 2] = BG[2];
    }
  }
  return { col: out, cover, px };
}

/* ═══ 统计 ═════════════════════════════════════════════════════
   先按 8 位量化并**钳到 0…255** 再统计 —— 帧缓冲是 UNORM8，写进去就截断了。
   不钳会把 P95 报到 258.9，那是一个不存在的亮度：env() 里的柔光箱与主光可以叠加到
   1.49，着色器算出的值确实超过 1，但一进画布就贴在 255 上。离线账必须模拟这一步，
   否则「贴顶白的占比」永远偏低、P95 永远虚高。 */
const q8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255))) / 255;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function stats({ col, cover, px }) {
  const bgl = lum(BG[0], BG[1], BG[2]);
  const ins = [];
  let bsum = 0;
  let bmax = -1e9;
  for (let k = 0; k < px * px; k++) {
    if (cover[k] < 0.5) continue;
    const r = q8(col[k * 3]);
    const g = q8(col[k * 3 + 1]);
    const b = q8(col[k * 3 + 2]);
    // 与底色比：8 位量化后差 > 6 才算星内（BRIEF 的量法）
    const d = Math.max(Math.abs(r - BG[0]), Math.abs(g - BG[1]), Math.abs(b - BG[2])) * 255;
    if (d <= 6) continue;
    ins.push(lum(r, g, b));
    const br = (b - r) * 255;
    bsum += br;
    if (br > bmax) bmax = br;
  }
  ins.sort((a, b) => a - b);
  const q = (t) => (ins.length ? ins[Math.min(ins.length - 1, Math.floor(t * ins.length))] : 0);
  /* 「恰为 255」= 三个通道全被钳到顶（真正的死白），不是亮度算出来接近 1 */
  let pure = 0;
  for (let k = 0; k < px * px; k++) {
    if (cover[k] < 0.5) continue;
    if (q8(col[k * 3]) >= 1 && q8(col[k * 3 + 1]) >= 1 && q8(col[k * 3 + 2]) >= 1) pure++;
  }
  return {
    areaShare: +((ins.length / (px * px)) * 100).toFixed(2),
    p5: +(q(0.05) * 255).toFixed(1),
    p50: +(q(0.5) * 255).toFixed(1),
    p95: +(q(0.95) * 255).toFixed(1),
    pureWhiteShare: +((pure / Math.max(1, ins.length)) * 100).toFixed(1),
    bMinusRMean: +(bsum / Math.max(1, ins.length)).toFixed(1),
    bMinusRMax: +bmax.toFixed(1),
    n: ins.length,
    bgLum: +(bgl * 255).toFixed(1),
  };
}

/* ═══ 每支根部宽度：在正位下沿 x 轴量 (400px 画布) ═══════════════ */
function armRootWidth(px = 400) {
  // 正位下六支里有一支投影几乎沿竖直方向；沿它量一次弦长
  // 直接量：画面上「从中心竖直向上」那条射线上连续被覆盖的长度
  let n = 0;
  for (let i = 1; i < 2000; i++) {
    const s = i / 2000; // ndc y
    if (s > 1) break;
    const rd = norm([0, s * TAN, -1]);
    if (entryT([0, 0, CAM_Z], rd)) n++;
    else if (n > 0) break;
  }
  return +((n / 2000) * (px / 2)).toFixed(1);
}

/* ═══ 后方横线：星内被切成几段、每段错开多少像素（BRIEF §3 的验收项） ═══
   错位量按**有限距离的底**算：出射点 Q + 出射方向 T 走到底面 z = −back，
   落点透视投回画面。

   只统计「采样点真的落在画面里」的那些像素：掠射出射（T.z 接近 0）投影出去会落到
   几千像素之外，着色器那边 texture() 用 ClampToEdge 会把它夹到边缘 —— 拿到的是底色，
   也就是**那里根本没有线**。把这些算进「错位量」会把数字吹到几百像素，那是假的。
   所以这里报的是：段数（按轮廓切出来的连续区间）、以及每段里**采到画面内的那些像素**
   的中位错位量。 */
function backLine(px = 400, ndcY = 0.28) {
  const cam = [0, 0, CAM_Z];
  const back = TUNE.back;
  const segs = [];
  let cur = null;
  for (let x = 0; x < px; x++) {
    const nx = ((x + 0.5) / px) * 2 - 1;
    const rd = norm([nx * TAN, ndcY * TAN, -1]);
    const s = shade(cam, rd);
    if (!s) {
      if (cur) {
        segs.push(cur);
        cur = null;
      }
      continue;
    }
    const e = ndcHit(s.exitPos, s.exitDir, back);
    const ex = ((e[0] + 1) / 2) * px - 0.5;
    if (!cur) cur = { x0: x, x1: x, shifts: [], inFrame: 0, offFrame: 0 };
    cur.x1 = x;
    if (ex >= 0 && ex < px) {
      cur.shifts.push(ex - x);
      cur.inFrame++;
    } else cur.offFrame++;
  }
  if (cur) segs.push(cur);
  const rows = segs.map((s) => {
    const a = s.shifts.slice().sort((p, q) => p - q);
    const med = a.length ? a[Math.floor(a.length / 2)] : NaN;
    const abs = a.map(Math.abs).sort((p, q) => p - q);
    return {
      xSpan: [s.x0, s.x1],
      sampledInFrame: s.inFrame,
      sampledOffFrame: s.offFrame,
      shiftMedian: +med.toFixed(1),
      shiftMedianAbs: +(abs.length ? abs[Math.floor(abs.length / 2)] : NaN).toFixed(1),
      shiftMaxAbs: +(abs.length ? abs[abs.length - 1] : NaN).toFixed(1),
    };
  });
  return { pieces: segs.length, back, rows };
}

/* ═══ 跑 ═══════════════════════════════════════════════════════ */
/* 被 import 时不跑（只取 shade/raster/stats 用）；直接 node tone.mjs 时才跑 */
const MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (MAIN) {
  const t0 = Date.now();
  const img = raster(400, 2);
  const S = stats(img);
  const W = armRootWidth(400);
  const B = backLine(400, 0.28);
  const out = {
    shape: { rootHalf: +SHAPE.rootHalf.toFixed(4), faces: VIEW.reduce((a, b) => a + b.length, 0) },
    cam: { camZ: CAM_Z, tan: TAN },
    tone: S,
    armRootWidthPx: W,
    backLine: B,
    ms: Date.now() - t0,
  };

  if (JS) console.log(JSON.stringify(out));
  else {
    const goal = {
      areaShare: '≥ 15',
      p5: '155–175',
      p50: '200–218',
      p95: '246–252',
      pureWhiteShare: '< 8',
      bMinusRMean: '+6 ~ +14',
      bMinusRMax: '≥ 30',
      armRootWidthPx: '≥ 14',
      backLine: 'pieces 2–3，shift ≥ 6px',
    };
    const pass = (k) => {
      const v = S[k] ?? out[k];
      if (k === 'areaShare') return v >= 15;
      if (k === 'p5') return v >= 155 && v <= 175;
      if (k === 'p50') return v >= 200 && v <= 218;
      if (k === 'p95') return v >= 246 && v <= 252;
      if (k === 'pureWhiteShare') return v < 8;
      if (k === 'bMinusRMean') return v >= 6 && v <= 14;
      if (k === 'bMinusRMax') return v >= 30;
      if (k === 'armRootWidthPx') return v >= 14;
      return B.pieces >= 2 && B.pieces <= 3 && Math.max(0, ...B.rows.map((r) => r.shiftMedianAbs || 0)) >= 6;
    };
    console.log('形体  rootHalf', out.shape.rootHalf, '· faces', out.shape.faces);
    console.log('相机  camZ', CAM_Z, '· tan', TAN, '→ 尖半径 ≈', (0.8164966 / (CAM_Z * TAN)).toFixed(3), '画幅');
    for (const k of Object.keys(goal)) {
      const v =
        k === 'backLine'
          ? `${B.pieces} 段 / 中位错位 ${B.rows.map((r) => (isNaN(r.shiftMedianAbs) ? 'n/a' : r.shiftMedianAbs)).join(',')} px（底距 ${B.back}）`
          : S[k] ?? out[k];
      console.log(`  ${pass(k) ? '✓' : '✗'} ${k.padEnd(16)} ${String(v).padStart(22)}   目标 ${goal[k]}`);
    }
    console.log('  （耗时', out.ms, 'ms）');
  }
}

/* 给别的脚本用的低层件（env / shade / raster / stats / TUNE 上面已 export） */
export { entryT, inAny, nextExit, lum, BG, P as PARAMS, VIEW };
/** edgeW 供形状对照页临时改写（第四轮 · C 列第二子项）；其余旋钮仍冻结。 */
export function setEdgeW(v) {
  P.edgeW = v;
}