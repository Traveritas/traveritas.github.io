/* ─────────────────────────────────────────────────────────────
   星 · 预渲染烘焙（design/mocks/star-bake/bake.mjs）
   ─────────────────────────────────────────────────────────────
   离线把「触发式翻动」的每一个定格姿态**用真深度缓冲**画成像素，然后量、然后编码。

   为什么要离线烘焙
   ────────────────
   star-final 的合成在中心撞到一件不可调和的事：halfWidth 0.26 → 每支宽 8.32 单位，
   六支都穿过原点，半径 4 以内**每个像素被三层以上的料盖住**。平风筝（现役）在同一张
   平面上，画序怎么排都对；一旦截面有了厚度，六支在中心是**真穿插**，
   任何按片排序的画家算法都排不出正确遮挡（star-final/notes.md §2.3 量过：三层以上 100%）。
   那一轮的兜底是把根部厚度收到 0 —— 中心那段因此没有脊，等于把折让掉了。

   这里换一条路：**离线用 WebGL 的深度缓冲画一次，只交像素。**
   深度缓冲不为「排序」发愁，它逐像素比 z。所以根部的收坡可以取消，
   中心那一圈重新长出脊来 —— 这正是这一轮要验的事。

   三段
   ────
   ① `bake.mjs geo`    纯数学：几何面表（三角化）、姿态表、四个口径的采样。
                       不碰浏览器，Node 直跑；产出的面表交给 GPU。
   ② `bake.mjs render` 起 headless Chrome，用 three.js 把每一帧画成一张
                       **单通道 alpha 掩码 PNG**（alpha = 调子）。见 §「为什么交 alpha」。
   ③ `bake.mjs pack`   量体积（PNG / WebP 无损 / WebP 有损带 alpha / AVIF / 精灵图）、
                       量对照（现役 vs 烘焙）、写 readings.json。

   为什么交 alpha 而不是交颜色
   ──────────────────────────
   本站的强调色是活的：reality.ts 按醒度把 `--amber / --umber / --wake / --dream`
   插值后写到 documentElement 上。烘死的彩图跟不上它。所以这里烘的是**一张 alpha 掩码**：
   四个调子档 → 四个 alpha 值，着色交给 CSS 的一层纯色。底色是均匀的 #f0f3f6，
   一个色相按 alpha 叠上去，恰好还原那四档 —— 而色相仍然是活的。
   这条断言不靠嘴说：`pack` 会并排渲一张「掩码×CSS 色」与一张「直接渲彩」的参考图，
   逐像素比它们差多少（见 .shots/color-check.png 与 readings.color）。

   用法
   ────
   node design/mocks/star-bake/bake.mjs geo            # 几何与姿态的读数 → .shots/geo.json
   node design/mocks/star-bake/bake.mjs render         # headless Chrome 烘全部帧 → frames/
   node design/mocks/star-bake/bake.mjs pack           # 体积与对照 → .shots/readings.json
   node design/mocks/star-bake/bake.mjs all            # 三段连着跑
   ───────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '.shots');
const FRAMES = path.join(HERE, 'frames');
const ROOT = path.resolve(HERE, '../../..');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FRAMES, { recursive: true });

/* ── 与 star-final 共用的数学（姿态、剖分、评分），只 import 不复制 ─────────
   直接引用上一轮的模块，是为了让「同一颗星」这件事在代码层面成立：
   姿态路径、明暗量化、评分器都是同一份，不是照抄一份再走样。 */
const SF = await import(pathToFileURL(path.join(ROOT, 'design/mocks/star-final/src.js')).href);

const DEG = Math.PI / 180;

/* ── 烘焙参数：一颗星的所有旋钮都在这里 ───────────────────────────────── */
export const BAKE = {
  /** 与 star-final 的合成同一套（halfWidth 0.26·r、凹 0.04、脊 1.0、四档 0.10–0.92） */
  cfg: {
    ...SF.SYNC,
    /* 关键的一处：**根部不收坡**。star-final 收坡是因为 SVG 排不开；
       这里交了深度缓冲，收坡的动机不存在了，脊可以从根部一直起。 */
    taper: false,
    girth: 1,
  },
  /** 渲染尺寸。
      240 / 400 是体积表要的两档（「进正文」与「主视觉」）；
      40 / 96 / 200 是「与现役对照」要的四档里的三档；
      80 是 40px 在 DPR 2 上的真实像素数 —— 栅格资产在视网膜屏上的账必须另记一笔。 */
  sizes: [40, 80, 96, 200, 240, 400],
  /** 世界取景：与 Toolstar.astro 同一个 40 单位画框，星径 16 → 占画框 80% */
  box: 40,
  /** 定格档数。12 / 16 / 24 三档都要量，默认发 16 */
  frames: 16,
  /** 一帧持有多少毫秒（star-v-motion §4：110ms 是「定格」与「闪烁」的分界） */
  holdMs: 110,
  /** 采样口径：均匀 / 贪心跳过坏姿态 */
  picks: ['even', 'greedy'],
  /** 难看门槛（沿用 star-v-motion 与 star-final） */
  pass: 55,
  good: 70,
};

/* ── ① 几何：把一颗星切成三角形，带逐面调子 ─────────────────────────────
   与 star-final 的 build() 同一套站表 / 截面 / 折高 / 收坡逻辑，
   区别只有两个：
     · 输出三角形而不是 SVG path（GPU 要三角形）
     · **两面全留**（FrontSide 剔背、深度缓冲负责遮挡）——
       上一轮为了 SVG 剔掉了背面，这里不能剔：一颗有厚度的闭合体，背面会在
       正面没盖到的地方露出来（尤其是支与支交错的那几处）。
   法线仍按 Newell 从真顶点算，调子仍走 rawTone + quantize，量化仍是四档 0.10–0.92。 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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

/** 与 star-final 同一套：站 row 上的一点 (nu, de) → 视空间坐标 */
function pointAt(fr, row, pp, cfg) {
  const along = SF.alongOf(row.s, cfg);
  const h = foldH(cfg, row.W, along);
  const g = cfg.taper === false ? 1 : girthOf(along, cfg);
  const c = pp.nu * row.W * g;
  const d = pp.de * h;
  return [
    fr.a[0] * row.s + fr.side[0] * c + fr.ed[0] * d,
    fr.a[1] * row.s + fr.side[1] * c + fr.ed[1] * d,
    fr.a[2] * row.s + fr.ed[2] * d,
  ];
}
function foldH(cfg, W, along) {
  const base = cfg.foldMode === 'ratio' ? cfg.fold * W : (cfg.fold * W) / 1.9;
  return base * (cfg.taper === false ? 1 : taperOf(along));
}
function taperOf(along) {
  const from = 0;
  const to = 0.45;
  if (along <= from) return 0;
  if (along >= to) return 1;
  const u = (along - from) / (to - from);
  return u * u * (3 - 2 * u);
}
function girthOf(along, cfg) {
  const g = taperOf(along);
  const keep = typeof cfg.girth === 'number' ? cfg.girth : 1;
  return keep + (1 - keep) * g;
}

/**
 * 一颗星 → 三角形。每个三角形带 tone（0..1，已量化）。
 *
 * 截面只取上半圈（正 2n 边形的一半），绕轴旋转一圈就是整支的壳 ——
 * 与 star-final 的 `profile()` 完全一致，只是那边画的是正对镜头的那些面，
 * 这里要把另外半圈也补上，否则支的背面是空的。
 */
export function buildStar(cfg, M) {
  const prof = SF.profile(cfg); // 上半圈：(nu, de)，nu ∈ [-1, 1]，de ≥ 0
  /* 补下半圈：nu 不动、de 取负。截面因此是闭的（脊 + 两条刃 + 一条背脊） */
  const ring = [];
  for (const p of prof) ring.push({ nu: p.nu, de: p.de });
  for (let i = prof.length - 2; i >= 1; i--) ring.push({ nu: prof[i].nu, de: -prof[i].de });
  const rows = SF.stations(cfg).filter((r) => r.W > 1e-6);
  /* 尖端单独处理：最后两站并成锥尖 */
  const last = SF.stations(cfg).at(-1);

  const frs = SF.frames(M);
  const tris = [];
  const faceTones = [];

  for (const fr of frs) {
    if (fr.skip) continue;
    /* 支身：站 × 截面的四边形 → 两个三角形 */
    for (let i = 0; i + 1 < rows.length; i++) {
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j];
        const b = ring[(j + 1) % ring.length];
        const p00 = pointAt(fr, rows[i], a, cfg);
        const p01 = pointAt(fr, rows[i], b, cfg);
        const p10 = pointAt(fr, rows[i + 1], a, cfg);
        const p11 = pointAt(fr, rows[i + 1], b, cfg);
        /* 外法向参考：截面这点朝外的方向（与 star-final 的 expect 同一个意思） */
        const nuM = (a.nu + b.nu) / 2;
        const deM = (a.de + b.de) / 2;
        const expect = [
          fr.side[0] * nuM + fr.ed[0] * deM,
          fr.side[1] * nuM + fr.ed[1] * deM,
          fr.side[2] * nuM + fr.ed[2] * deM,
        ];
        for (const q of [
          [p00, p01, p11],
          [p00, p11, p10],
        ]) {
          const n = newell(q, expect);
          let zc = (q[0][2] + q[1][2] + q[2][2]) / 3;
          const t = SF.rawTone(n, fr.z, cfg.tones.depth, cfg.light);
          tris.push(...q[0], ...q[1], ...q[2]);
          faceTones.push({ t, z: zc, n });
        }
      }
    }
    /* 支尖：最后一个截面环 → 顶点 */
    const tipP = [fr.a[0] * last.s, fr.a[1] * last.s, fr.a[2] * last.s];
    const tipRow = rows.at(-1);
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      const pa = pointAt(fr, tipRow, a, cfg);
      const pb = pointAt(fr, tipRow, b, cfg);
      const nuM = (a.nu + b.nu) / 2;
      const deM = (a.de + b.de) / 2;
      const expect = [
        fr.side[0] * nuM + fr.ed[0] * deM,
        fr.side[1] * nuM + fr.ed[1] * deM,
        fr.side[2] * nuM + fr.ed[2] * deM,
      ];
      const q = [pa, pb, tipP];
      const n = newell(q, expect);
      const t = SF.rawTone(n, fr.z, cfg.tones.depth, cfg.light);
      tris.push(...pa, ...pb, ...tipP);
      faceTones.push({ t, z: (pa[2] + pb[2] + tipP[2]) / 3, n });
    }
    /* 支根封口：t = 0 那个截面环是一张开口 —— 六支都从原点长出来，
       这个口被别的支盖着，看不见，但「闭合实体」这条不变量要真成立，
       不然深度缓冲会从开口看进内壁，在那儿露出一圈假调子。 */
    const r0 = rows[0];
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      const pa = pointAt(fr, r0, a, cfg);
      const pb = pointAt(fr, r0, b, cfg);
      const og = [fr.a[0] * r0.s, fr.a[1] * r0.s, fr.a[2] * r0.s];
      const q = [pb, pa, og]; // 绕向朝轴内
      const n = newell(q, [fr.a[0] * -1, fr.a[1] * -1, fr.a[2] * -1]);
      const t = SF.rawTone(n, fr.z, cfg.tones.depth, cfg.light);
      tris.push(...q[0], ...q[1], ...q[2]);
      faceTones.push({ t, z: (pa[2] + pb[2] + og[2]) / 3, n });
    }
  }

  /* 量化：先把整颗星的 t 拉到 [0,1]，再切成 steps 档，再乘跨度 —— 与 star-final 同一个口径 */
  const ts = faceTones.map((f) => f.t);
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  const T = cfg.tones;
  const alphaOf = faceTones.map(
    (f) => T.min + (T.max - T.min) * SF.quantize(f.t, lo, hi, T.steps),
  );

  return {
    positions: new Float32Array(tris),
    tone: Float32Array.from(alphaOf), // 逐三角形一个值
    triCount: faceTones.length,
    tones: [...new Set(alphaOf.map((v) => +v.toFixed(4)))].sort((a, b) => a - b),
    zMin: Math.min(...faceTones.map((f) => f.z)),
    zMax: Math.max(...faceTones.map((f) => f.z)),
    skipped: frs.filter((f) => f.skip).map((f) => f.key),
  };
}

/* ── 姿态表：四个口径，同一 1550ms 路径上取样 ──────────────────────────
   ① `even-n`   n 等分（含两个端点）。这就是「把连续路径切成 n 格」最朴素的做法。
   ② `greedy-n` 从 0 到 1 贪心取 n 格：每一步在「别跳太远」与「别停坏姿态」之间折中。
   ③ `smooth`   上一轮那条 301 点采样，只当基准，不发货。
   ④ `windmill` 绕视轴 30° 一格（star-v-motion 的对照），它是「转」不是「翻」。
   每一格都跑 measurePose 真实评分，难看账按 holdMs 加权（不是按采样点数加权）。 */

export function poseScores(cfg, M = SF.M_REST, n = 301) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const m = SF.measurePose(cfg, SF.poseAt(u, M, SF.TUMBLE), 96);
    rows.push({ u, score: m.score, balance: m.balance, a6: m.a6, radii: m.radii });
  }
  return rows;
}

/** n 等分（端点都取），返回 u 列表 */
export function evenPicks(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(i / (n - 1));
  return out;
}

/**
 * 贪心：在 0..1 上取 n 格，尽量避开低分姿态，同时不让相邻两格跳得太远。
 *
 * 做法不是「挑最高的 n 个」—— 那会全挤在两端（端点是 100 分），中间整段空掉。
 * 这里按「弧长」走：把连续路径采样成 K 点的折线（相邻两格的姿态差当作距离），
 * 然后在这条折线上等弧长取 n 个结点，再让每个结点在自己的 ± 一格里滑到最高分。
 * 于是节奏还是均匀的，只是每一格都往好的角度挪了一点。
 */
export function greedyPicks(cfg, M, scores, n) {
  /* 结点初值：等弧长（这里用等 u 近似 —— 这条路径的角速度不均匀，
     但 `springEase` 已经把它压得很平，等 u 与等弧长差不到 1 格） */
  const base = evenPicks(n);
  const maxSlide = 0.5 / (n - 1); // 最多滑半格
  const out = base.map((u0) => {
    const lo = Math.max(0, u0 - maxSlide);
    const hi = Math.min(1, u0 + maxSlide);
    let best = u0;
    let bestScore = -1;
    for (const row of scores) {
      if (row.u < lo || row.u > hi) continue;
      /* 同分时偏向离 u0 近的那一侧 */
      const pen = Math.abs(row.u - u0) * 0.5;
      const s = row.score - pen;
      if (s > bestScore) {
        bestScore = s;
        best = row.u;
      }
    }
    return best;
  });
  /* 端点钉死在 0 与 1：翻动的起止必须与正位严格重合，否则落定不在满分姿态上 */
  out[0] = 0;
  out[n - 1] = 1;
  return out;
}

/* ── CLI：段选择 ─────────────────────────────────────────────────────── */
const SEG = process.argv[2] || 'all';
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

if (SEG === 'geo' || SEG === 'all') {
  log('geo — 几何与姿态');
  const { cfg } = BAKE;
  const rest = buildStar(cfg, SF.M_REST);
  const scores = poseScores(cfg, SF.M_REST, 300);
  const even12 = evenPicks(12);
  const even16 = evenPicks(16);
  const even24 = evenPicks(24);
  const g16 = greedyPicks(cfg, SF.M_REST, scores, 16);
  const g12 = greedyPicks(cfg, SF.M_REST, scores, 12);
  const g24 = greedyPicks(cfg, SF.M_REST, scores, 24);

  const scoreAt = (u) => {
    /* 最近采样点（301 点，步长 0.0033）—— 与 measurePose 真算的差 < 1 分，够用于选格 */
    let best = scores[0];
    let bd = 9;
    for (const row of scores) {
      const d = Math.abs(row.u - u);
      if (d < bd) {
        bd = d;
        best = row;
      }
    }
    return best;
  };
  const bad = (us) =>
    us.map((u) => {
      const s = scoreAt(u);
      return { u: +u.toFixed(4), score: s.score, balance: +s.balance.toFixed(3) };
    });

  const smooth = { ...SF.uglyShare(scores.map((r) => ({ t: r.u, score: r.score }))), n: scores.length };
  const out = {
    at: new Date().toISOString(),
    cfg: {
      r: cfg.r,
      halfWidth: cfg.halfWidth,
      curve: cfg.curve,
      fold: cfg.fold,
      taper: cfg.taper,
      sides: cfg.sides,
      tones: cfg.tones,
      light: cfg.light,
      hub: cfg.hub,
    },
    rest: { triCount: rest.triCount, tones: rest.tones, zRange: [+rest.zMin.toFixed(3), +rest.zMax.toFixed(3)] },
    smooth,
    sets: {
      even12: bad(even12),
      even16: bad(even16),
      even24: bad(even24),
      greedy12: bad(g12),
      greedy16: bad(g16),
      greedy24: bad(g24),
    },
    summary: {},
  };
  for (const [k, rows] of Object.entries(out.sets)) {
    const ugly = rows.filter((r) => r.score < BAKE.pass).length;
    const pass = rows.filter((r) => r.score >= BAKE.pass && r.score < BAKE.good).length;
    out.summary[k] = {
      n: rows.length,
      ugly,
      pass,
      good: rows.length - ugly - pass,
      min: Math.min(...rows.map((r) => r.score)),
      minAt: rows.reduce((a, r) => (r.score < a.score ? r : a), rows[0]).u,
      /** 难看账按时间加权：每格持有 holdMs（末格多停一拍 1×，这一页不额外算） */
      uglyMs: ugly * BAKE.holdMs,
      totalMs: rows.length * BAKE.holdMs,
    };
  }
  fs.writeFileSync(path.join(SHOTS, 'geo.json'), JSON.stringify(out, null, 2));
  log('geo → .shots/geo.json');
  console.log(JSON.stringify({ rest: out.rest, smooth, summary: out.summary }, null, 2));
}

if (SEG === 'render' || SEG === 'all') {
  const { render } = await import(pathToFileURL(path.join(HERE, '.render.mjs')).href);
  await render({ BAKE, FRAMES, SHOTS, SF, buildStar, evenPicks, greedyPicks, poseScores, log });
}

if (SEG === 'pack' || SEG === 'all') {
  const { pack } = await import(pathToFileURL(path.join(HERE, '.pack.mjs')).href);
  await pack({ BAKE, FRAMES, SHOTS, ROOT, SF, log });
}