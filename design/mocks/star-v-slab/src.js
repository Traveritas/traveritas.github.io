/* ─────────────────────────────────────────────────────────────
   醒梦 · 立体星 · 挤出方向（原型）
   目录：design/mocks/star-v-slab/ ｜ 端口 4664

   一句话：**给一颗已经被验证过的平面四芒星真实的厚度。**

   为什么走这条路：上一版（star-crystal/）是三轴正交的六支针 —— 那颗形体的
   对称群是八面体群，任何一般视角下它的投影都是一个带毛边的球，**没有一个面
   朝向观者**，眼睛无处落脚；问题在形体本身，不在材质。而平面星（star-flat/）
   有一个明确的面，把那个面原样沿法线拉出厚度，是最自然的「从平面到立体」的
   一步，也正好接住作者自己的说法（平面的星是四芒星，立体的星要另起一类）。

   截面**不是重新画的**：这里直接 import `../star-flat/star.js` 的 `starPath()`，
   把那条 path 解析成精确的点序列（含二次曲线的端点，尖端一点不丢）。页面上
   有一条自检把解析结果和浏览器自己栅格化那条 path 的结果对回来。

   六种给厚度的方法（全部在 CANDIDATES 里）：
     直挤出      板              slab
     倒角板      板 + 双面倒角     bevel
     双锥        前后各一个尖      bipyramid
     单面尖      正面出尖、背面平   pointed
     内凹        正面凹成碟        dished
     六角星柱    六芒星截面        hexagram

   材质三档，全部照 star-crystal/notes.md 的实测结论：
     · transmission 在透明画布上会塌成死白 → 不用 transmission；
     · transmission 非零即全价 → 想「透一点」用 opacity；
     · 近白晶体在浅底上等于白纸 → 环境贴图必须有压暗的地面 + 几个亮窗。

   运动是定格：姿态量化到 360/steps，每格持有 holdMs，一圈之后那一格再加长
   3.2 倍（照 brand.ts 的 7 步轮转 + 3 秒呼吸）。setTimeout 链，不用 rAF。
   尺寸一律按 CSS px 喂，DPR 封顶 2。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { starPath, PRESETS } from '../star-flat/star.js';

const DEG = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ── 底色 ─────────────────────────────────────────────────── */
export const PAGE = { light: '#f0f3f6', deep: '#2a2b38' };
export const PAGE_HEX = { light: 0xf0f3f6, deep: 0x2a2b38 };

/* 一圈之后的那个保持格加长倍数：同 brand.ts「7 步轮转 + 3 秒呼吸」（3×） */
const BREATH = 3.2;

/* ── 截面：从 star-flat 的 path 解析 ─────────────────────────
   星形轮廓是一串 M / Q / L（pinch = 0 时退化成全 L）。这里把 path 拆成段，
   每段按 t 均匀采样。**尖端与腰点原样保留**：Q 段的 t = 0 就是上一段的终点，
   而尖端/腰点正是段的端点，所以锐角一点都不会被采样磨圆。 */

const NUM = /-?\d+(?:\.\d+)?/g;

/** path d → 段表 [{a, c?, b}] */
function pathSegments(d) {
  const segs = [];
  let cur = [0, 0];
  const re = /([MLQ])([^MLQZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const v = (m[2].match(NUM) || []).map(Number);
    if (m[1] === 'M') {
      cur = [v[0], v[1]];
    } else if (m[1] === 'L') {
      const b = [v[0], v[1]];
      segs.push({ a: cur, b });
      cur = b;
    } else {
      const b = [v[2], v[3]];
      segs.push({ a: cur, c: [v[0], v[1]], b });
      cur = b;
    }
  }
  return segs;
}

/** 每段均匀采 per 个点（含段起点，不含段终点），闭合环 */
function sampleSegments(segs, per) {
  const pts = [];
  for (const s of segs) {
    for (let i = 0; i < per; i++) {
      const t = i / per;
      if (s.c) {
        const u = 1 - t;
        pts.push([
          u * u * s.a[0] + 2 * u * t * s.c[0] + t * t * s.b[0],
          u * u * s.a[1] + 2 * u * t * s.c[1] + t * t * s.b[1],
        ]);
      } else {
        pts.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
      }
    }
  }
  /* 收口：曲线的末段终点正好回到起点（Q 段的 t=1 就是 path 的 M 点），
     折线的末段终点却是一个**独立的顶点**（facet 预设的 Z 之前那一点）——
     不把它补上，闭合边会从 -10,0 直接飞回 0,-10，切掉一个角。 */
  const last = segs[segs.length - 1];
  if (last) {
    const b = last.b;
    const a = pts[0] || [0, 0];
    if (Math.abs(b[0] - a[0]) > 1e-9 || Math.abs(b[1] - a[1]) > 1e-9) pts.push([b[0], b[1]]);
  }
  return pts;
}

/** 六角星（两枚等边三角形叠成的 Star of David）截面 */
function hexagramPoints(scale = 1) {
  const r = scale / Math.sqrt(3);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const th = -Math.PI / 2 + (i * Math.PI) / 6;
    const rad = i % 2 === 0 ? scale : r;
    out.push([Math.cos(th) * rad, Math.sin(th) * rad]);
  }
  return out;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const outlineCache = new Map();

/**
 * 平面星轮廓（3D 用的 xy 平面点序列，逆时针，外接半径 = 1）。
 *
 * @param {string} cross  star-flat 的预设名（spire / equal / facet / tick）或 'hexagram'
 * @param {object} [o]
 * @param {number} [o.per] 每段采样数（L 段用 1 就够，Q 段 10 左右足以在 400px 下无折线感）
 * @returns {{ pts: number[][], d: string, segs: number, kind: string }}
 */
export function starOutline(cross = 'equal', o = {}) {
  const key = `${cross}:${o.per ?? 10}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;

  let raw;
  let d = '';
  let kind = 'star';
  if (cross === 'hexagram') {
    raw = hexagramPoints(1);
    kind = 'hexagram';
  } else {
    const preset = PRESETS[cross];
    if (!preset) throw new Error(`未知截面：${cross}`);
    d = starPath(preset);
    const segs = pathSegments(d);
    const straight = segs.every((s) => !s.c);
    raw = sampleSegments(segs, straight ? 1 : (o.per ?? 10));
  }

  /* SVG 的 y 向下 → 翻成 3D 的 y 向上；再规整到逆时针、外接半径 1 */
  let pts = raw.map(([x, y]) => [x, -y]);
  if (signedArea(pts) < 0) pts = pts.slice().reverse();
  let maxR = 0;
  for (const [x, y] of pts) maxR = Math.max(maxR, Math.hypot(x, y));
  pts = pts.map(([x, y]) => [x / maxR, y / maxR]);

  const res = { pts, d, segs: raw.length, kind, r: 1 };
  outlineCache.set(key, res);
  return res;
}

/* 自检：把解析出来的点序列和浏览器自己沿那条 path 走的点对回来。
   判据是「每个栅格化采样点到我们这条折线的最短距离」的最大值。 */
export function verifyOutline(cross = 'equal', sizePx = 200) {
  const { pts } = starOutline(cross);
  const preset = PRESETS[cross];
  if (!preset) return { ok: false, reason: '这是自造截面，没有 path 可比' };
  const d = starPath(preset);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-12 -12 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  const total = p.getTotalLength();
  const N = 720;
  const ref = [];
  for (let i = 0; i < N; i++) {
    const q = p.getPointAtLength((i / N) * total);
    ref.push([q.x, -q.y]);
  }
  svg.remove();

  /* 归一化用的 maxR 与 starOutline 里同一口径 */
  let maxR = 0;
  for (const [x, y] of ref) maxR = Math.max(maxR, Math.hypot(x, y));

  const distToRing = (x, y) => {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const L = vx * vx + vy * vy || 1;
      let t = ((x - a[0]) * vx + (y - a[1]) * vy) / L;
      t = Math.max(0, Math.min(1, t));
      const dx = a[0] + vx * t - x;
      const dy = a[1] + vy * t - y;
      const dd = dx * dx + dy * dy;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };

  let max = 0;
  for (const [x, y] of ref) max = Math.max(max, distToRing(x / maxR, y / maxR));
  return {
    ok: max < 0.004,
    cross,
    vertices: pts.length,
    maxDev: +max.toFixed(5),
    at200px: +(max * sizePx).toFixed(2),
  };
}

/* ── 几何装配 ─────────────────────────────────────────────── */

/** 三角面收集器：每个三角形独立顶点 ⇒ 平面法线（computeVertexNormals 逐面算） */
function triSink() {
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const quad = (a, b, c, d) => { push(a, b, c); push(a, c, d); };
  const done = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  };
  return { push, quad, done };
}

/** 一层环：把截面按 s 缩放、放到 z 上 */
function ring(outline, s, z) {
  return outline.map(([x, y]) => V(x * s, y * s, z));
}

/** 两环之间的一条带（外法线朝外；环必须逆时针，且 a 在 b 下方） */
function band(sink, a, b) {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sink.quad(a[i], a[j], b[j], b[i]);
  }
}

/** 环 → 尖点（圆锥帽）。apexZ > 环的 z 时朝上，否则朝下。 */
function cone(sink, ringPts, apexZ, up) {
  const apex = V(0, 0, apexZ);
  const n = ringPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (up) sink.push(ringPts[i], ringPts[j], apex);
    else sink.push(ringPts[j], ringPts[i], apex);
  }
}

/** 平盖：从形心铺三角扇（截面相对形心是星形，扇有效；比从某个尖点铺更稳） */
function cap(sink, ringPts, z, up) {
  const c = V(0, 0, z);
  const n = ringPts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (up) sink.push(c, ringPts[i], ringPts[j]);
    else sink.push(c, ringPts[j], ringPts[i]);
  }
}

/* ── 六种给厚度的方式 ─────────────────────────────────────── */

/**
 * @param {string} kind  slab | bevel | bipyramid | pointed | dished | hexagram
 * @param {object} p
 * @param {number} p.thick   总厚度 / 宽度（0.12 = 12%）。内部半厚 h = thick（截面外接半径 1，宽度 2）
 * @param {number} p.bevelW  倒角占宽度比例（相对外接半径）
 * @param {number} p.bevelD  倒角在 z 方向吃掉多深（相对半厚，0–1）
 * @param {number} p.bevelSteps 倒角带分几档（1 = 单条斜面，>1 = 圆滑过渡）
 * @param {number} p.apex    双锥 / 单面尖的出尖高度（相对外接半径）
 * @param {number} p.girdle  双锥的腰带宽（相对半厚）
 * @param {number} p.dish    内凹深度（相对外接半径）
 */
export function buildGeometry(kind, p = {}) {
  const P = {
    cross: 'equal',
    thick: 0.14,
    bevelW: 0.1,
    bevelD: 0.55,
    bevelSteps: 1,
    apex: 0.5,
    girdle: 0.18,
    dish: 0.34,
    per: 10,
    ...p,
  };
  const { pts } = starOutline(P.cross, { per: P.per });
  const h = P.thick; /* 半厚：thick 是「厚度 / 宽度」，宽度 = 2 */
  const sink = triSink();

  if (kind === 'slab') {
    const lo = ring(pts, 1, -h);
    const hi = ring(pts, 1, h);
    band(sink, lo, hi);
    cap(sink, lo, -h, false);
    cap(sink, hi, h, true);
  } else if (kind === 'bevel' || kind === 'hexagram') {
    /* 双面倒角：最宽一圈在 z = 0（腰带），两面各缩 bevelW 收到台面。
       bevelD 是倒角在 z 方向占掉半厚的比例：1.0 时没有竖直腰带，等于一枚透镜。 */
    const bd = h * Math.min(1, Math.max(0.05, P.bevelD));
    const tableS = 1 - P.bevelW;
    const steps = Math.max(1, Math.round(P.bevelSteps));
    const rs = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      rs.push(1 - P.bevelW * t);
    }
    /* 下半：从台面到腰带 */
    const loFace = ring(pts, rs[steps], -h);
    let prev = loFace;
    for (let i = steps - 1; i >= 0; i--) {
      const t = i / steps;
      const z = -h + bd * (1 - t);
      const next = ring(pts, rs[i], z);
      band(sink, prev, next);
      prev = next;
    }
    /* 竖直腰带 z = -h+bd → h-bd */
    const girdleHi = ring(pts, 1, h - bd);
    band(sink, prev, girdleHi);
    /* 上半：从腰带回到台面 */
    prev = girdleHi;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const z = h - bd + bd * t;
      const next = ring(pts, rs[i], z);
      band(sink, prev, next);
      prev = next;
    }
    cap(sink, loFace, -h, false);
    cap(sink, prev, h, true);
  } else if (kind === 'bipyramid') {
    const g = h * Math.min(1, Math.max(0.02, P.girdle));
    const lo = ring(pts, 1, -g);
    const hi = ring(pts, 1, g);
    band(sink, lo, hi);
    cone(sink, hi, h + P.apex, true);
    cone(sink, lo, -h - P.apex, false);
  } else if (kind === 'pointed') {
    const lo = ring(pts, 1, -h);
    const hi = ring(pts, 1, h);
    band(sink, lo, hi);
    cap(sink, lo, -h, false);
    cone(sink, hi, h + P.apex, true);
  } else if (kind === 'dished') {
    const lo = ring(pts, 1, -h);
    const hi = ring(pts, 1, h);
    band(sink, lo, hi);
    cap(sink, lo, -h, false);
    /* 正面凹成一只碟：台面留在 z = h 的一圈边上，往里收一道环，再收到中心的底。
       每片法线都不同 —— 于是正面不是一个调子，而是一串台阶。 */
    const steps = 3;
    const inner = 1 - Math.min(0.6, P.dish * 1.4);
    let prev = hi;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const s = 1 - (1 - inner) * t;
      const z = h - P.dish * (t * t);
      const next = ring(pts, s, z);
      band(sink, prev, next);
      prev = next;
    }
    cap(sink, prev, h - P.dish, true);
  } else {
    throw new Error(`未知几何：${kind}`);
  }

  return sink.done();
}

/* ── 候选表 ───────────────────────────────────────────────── */

const DEFAULT_P = { thick: 0.14, bevelW: 0.1, bevelD: 0.55, apex: 0.5, dish: 0.34 };

export const CANDIDATES = {
  slab: {
    kind: 'slab',
    label: '厚板（直挤出）',
    note: '平面星沿法线拉出厚度，两面平行',
    p: { ...DEFAULT_P },
  },
  bevel: {
    kind: 'bevel',
    label: '倒角厚板',
    note: '双面倒角，最宽一圈留在腰上，边缘成一条吃光的带',
    p: { ...DEFAULT_P, bevelW: 0.1, bevelD: 0.55, bevelSteps: 2 },
  },
  bipyramid: {
    kind: 'bipyramid',
    label: '双锥',
    note: '前后各出一个尖 —— favicon 那一族套在四芒星截面上',
    p: { ...DEFAULT_P, apex: 0.5, girdle: 0.18 },
  },
  pointed: {
    kind: 'pointed',
    label: '单面尖 · 平底',
    note: '正面出尖、背面是一张平底，像一枚胸针',
    p: { ...DEFAULT_P, apex: 0.55 },
  },
  dished: {
    kind: 'dished',
    label: '内凹厚板',
    note: '正面凹成碟，棱面法线散开，正面是一串台阶',
    p: { ...DEFAULT_P, dish: 0.34 },
  },
  hexagram: {
    kind: 'hexagram',
    label: '六角星柱',
    note: '六芒星（两枚三角叠成）作截面 —— 这才是真正的六尖',
    p: { ...DEFAULT_P, cross: 'hexagram', bevelW: 0.09, bevelD: 0.5, bevelSteps: 2 },
  },
};

export const CAND_ORDER = ['slab', 'bevel', 'bipyramid', 'pointed', 'dished', 'hexagram'];

const GEO_CACHE = new Map();

/** 取几何（带缓存）。key = 候选名 + 覆盖参数。 */
export function geometryOf(candKey, over = {}) {
  const c = CANDIDATES[candKey];
  const p = { ...c.p, ...over };
  const key = `${c.kind}|${JSON.stringify(p)}`;
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, buildGeometry(c.kind, p));
  return GEO_CACHE.get(key);
}

/** 任意（kind + 参数）的几何，给「厚度与倒角」那一节用 */
export function geometryAny(kind, over = {}) {
  const p = { ...DEFAULT_P, ...over };
  const key = `${kind}|${JSON.stringify(p)}`;
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, buildGeometry(kind, p));
  return GEO_CACHE.get(key);
}

const EDGE_CACHE = new Map();
function edgesOf(geo, angle = 24) {
  if (!EDGE_CACHE.has(geo.uuid)) EDGE_CACHE.set(geo.uuid, new THREE.EdgesGeometry(geo, angle));
  return EDGE_CACHE.get(geo.uuid);
}

/* ── 程序化环境贴图 ───────────────────────────────────────── */
/**
 * 一张 1024×512 的等距柱面图：天顶白 → 地平线亮 → **地面压到 #454e5c**，
 * 中间撒两扇亮窗和几面暗墙。
 *
 * 浅底（#f0f3f6）上的近白晶面唯一的进出通道就是「有几张脸亮、有几张脸暗」，
 * 而那个明暗只能来自环境本身。全是亮面的环境里，白晶体 = 白纸上的白纸 ——
 * 上一版原型第一处翻车就在这里。
 */
function buildEnvMap(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#ffffff');
  sky.addColorStop(0.2, '#f7f9fc');
  sky.addColorStop(0.4, '#dee5ef');
  sky.addColorStop(0.5, '#ffffff');
  sky.addColorStop(0.6, '#c4cdda');
  sky.addColorStop(0.76, '#8d97a6');
  sky.addColorStop(0.9, '#565f6d');
  sky.addColorStop(1.0, '#454e5c');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);

  const blob = (x, y, r, color, alpha) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = alpha;
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };
  blob(258, 120, 205, '#ffffff', 1.0); /* 窗 1 */
  blob(768, 100, 148, '#ffffff', 0.95); /* 窗 2 */
  blob(120, 246, 150, '#ffffff', 0.5);
  blob(548, 292, 240, '#cfc7e4', 0.48); /* 一点薄暮紫（--dream） */
  blob(906, 212, 180, '#5f6979', 0.58); /* 暗墙 */
  blob(388, 236, 140, '#727c8c', 0.44);
  blob(30, 430, 300, '#3b4450', 0.7); /* 暗脚 */

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return rt;
}

/* ── 材质三档 ─────────────────────────────────────────────── */

/* 边缘光：把 fresnel 加到自发光项上。浅底上这是让剪影有「一道边」的最省办法。 */
function patchRim(mat, color, power, strength) {
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('vViewPosition')) return;
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimPow = { value: power };
    shader.uniforms.uRimStr = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'uniform vec3 uRimColor;\nuniform float uRimPow;\nuniform float uRimStr;\nvoid main() {',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize( vViewPosition );
          float rimF = 1.0 - clamp( dot( normal, vdir ), 0.0, 1.0 );
          totalEmissiveRadiance += uRimColor * pow( rimF, uRimPow ) * uRimStr;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${power}-${strength}`;
  return mat;
}

export const MAT_ORDER = ['resin', 'crystal', 'edge'];
export const MAT_LABEL = {
  resin: '着色树脂',
  crystal: '近白晶体',
  edge: '淡体 + 棱线',
};

export function wantsEdges(mat) {
  return mat === 'edge';
}

export function makeMaterial(key) {
  if (key === 'resin') {
    /* 着色半透明树脂 —— 站点自己的材质语言。
       不用 transmission（非零即全价，见 star-crystal/notes.md），用 opacity 拿同一个观感。

       浅底这一档有个反直觉的点：色要压得比想象中深。环境贴图里那几扇亮窗会把近白的
       体一路提亮到跟 #f0f3f6 差不多，于是「一块浅色的东西」在白纸上等于没有。
       基色取到 --umber 与 --dream 之间，靠环境自己把它照回来 —— 亮面亮、暗面沉，
       明暗差才是这颗星立得住的唯一凭据。 */
    return patchRim(
      new THREE.MeshPhysicalMaterial({
        color: 0xbdb5d2,
        metalness: 0,
        roughness: 0.44,
        transparent: true,
        opacity: 0.72,
        ior: 1.45,
        clearcoat: 0.5,
        clearcoatRoughness: 0.38,
        sheen: 0.8,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color(0xe6e2f2),
        envMapIntensity: 1.15,
        side: THREE.FrontSide,
        depthWrite: true,
      }),
      0xe8e4f4,
      2.2,
      0.5,
    );
  }
  if (key === 'edge') {
    /* 淡彩体 + 一圈发丝棱线：站点在 2D 里造晶体的老办法
       （Ave.astro 的直边 clip-path 外面加一道细描边）。体压深一点，线交给 LineSegments。 */
    return patchRim(
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe4ee,
        metalness: 0,
        roughness: 0.24,
        transparent: true,
        opacity: 0.97,
        clearcoat: 0.8,
        clearcoatRoughness: 0.18,
        envMapIntensity: 1.05,
        side: THREE.FrontSide,
      }),
      0xc3cbdb,
      2.6,
      0.32,
    );
  }
  /* crystal：近白、极低粗糙、清漆、很轻的虹彩。
     虹彩压到 0.16 —— 全站只有一个异质色（薄暮紫），它只能当棱边偏冷，不能自己长彩虹。 */
  return new THREE.MeshPhysicalMaterial({
    color: 0xfbfcff,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.16,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [180, 520],
    specularIntensity: 1,
    envMapIntensity: 1.3,
    side: THREE.FrontSide,
  });
}

/** 棱线：一条 --umber 的发丝线 */
function makeLineMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0x4f4a66,
    transparent: true,
    opacity: 0.36,
    depthTest: true,
  });
}

/* ── 定格时钟 ─────────────────────────────────────────────── */

const schedCache = new Map();

export function schedule(steps, holdMs) {
  const key = `${steps}:${holdMs}`;
  let s = schedCache.get(key);
  if (s) return s;
  const holds = new Array(steps).fill(holdMs);
  holds[steps - 1] = holdMs * BREATH;
  const starts = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    starts.push(t);
    t += holds[i];
  }
  s = { steps, holdMs, holds, starts, total: t };
  schedCache.set(key, s);
  return s;
}

export function stepAt(s, elapsed) {
  const e = ((elapsed % s.total) + s.total) % s.total;
  let k = 0;
  for (let i = s.steps - 1; i >= 0; i--) {
    if (e >= s.starts[i]) { k = i; break; }
  }
  return { k, left: s.starts[k] + s.holds[k] - e };
}

/* ── 姿态 ─────────────────────────────────────────────────── */

const Y_UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/* 基准俯仰：板要让人看见面，也要让人看见厚度 —— 14° 是让「面」仍然读得成星、
   同时上沿倒角露出一条带的那一格。 */
export const BASE_PITCH = 14;
/* 面内自转用的俯仰：再压下去一点（24°），倒角带才在整圈里都看得见，
   而 cos(24°) = 0.91，星仍然读得成星。 */
export const FACE_PITCH = 24;
/* 静止对照用的三分之四视：pitch 16 / yaw 24，面与侧边同时可见 */
export const STILL_PITCH = 16;
export const STILL_YAW = 24;
/* 往返轴的单边摆幅 */
export const OSC_AMP = 34;
/* 面内自转走多少度。四芒星绕自己的法线有 90° 的旋转对称 —— 转满 90° 与原样重合，
   所以只转四分之一圈，让整圈里每一格都不重样。 */
export const FACE_SWEEP = 90;

export const AXES = {
  face: {
    label: '面内自转',
    hint: `绕板自己的法线转 ${FACE_SWEEP}°。正面整圈朝着观者，是唯一一格都不塌的转法`,
  },
  y: { label: '竖轴自转', hint: '绕世界竖直轴转一整圈 —— 面长时间朝着观者，但每圈有两次侧过去' },
  x: { label: '横轴翻面', hint: '绕屏幕水平轴翻一整圈 —— 像一件东西在自己翻面' },
  osc: { label: '往返', hint: `在 −${OSC_AMP}° 与 +${OSC_AMP}° 之间来回，转不满一整圈` },
};

export const AXIS_ORDER = ['face', 'y', 'x', 'osc'];

/**
 * 某一格的总姿态。
 * @param {object} o
 * @param {number} [o.k]        第几格（不给就用 elapsed 推）
 * @param {number} [o.elapsed]
 * @param {number} [o.steps=12]
 * @param {number} [o.holdMs=120]
 * @param {string} [o.axis='y'] y | x | osc
 * @param {string} [o.base]     'spin'（绕轴转）| 'still'（固定的三分之四视）
 */
export function poseQuat(o = {}, out = new THREE.Quaternion()) {
  const steps = o.steps ?? 12;
  const holdMs = o.holdMs ?? 120;
  /* 显式角度优先：拆解那一节要指名道姓地摆几个姿态 */
  if (o.pitchDeg != null || o.yawDeg != null) {
    return out.setFromEuler(
      new THREE.Euler((o.pitchDeg ?? STILL_PITCH) * DEG, (o.yawDeg ?? STILL_YAW) * DEG, 0, 'YXZ'),
    );
  }
  if (o.base === 'still') {
    return out.setFromEuler(new THREE.Euler(STILL_PITCH * DEG, STILL_YAW * DEG, 0, 'YXZ'));
  }
  let k = o.k;
  if (k == null) k = stepAt(schedule(steps, holdMs), o.elapsed ?? 0).k;
  const axis = o.axis || 'y';
  const qBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(BASE_PITCH * DEG, 0, 0, 'YXZ'));
  if (axis === 'face') {
    /* 绕板自己的法线转：所有厚度都跟着面走，正面一直朝着观者。
       俯仰压在 FACE_PITCH（24°）而不是 BASE_PITCH：一圈里倒角带才始终看得见。
       这是「定格」最省的一种转法 —— 每一格都还是那颗星，只是朝向变了。 */
    const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(FACE_PITCH * DEG, 0, 0, 'YXZ'));
    const a = (k * FACE_SWEEP) / steps;
    return out.copy(qFace).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, a * DEG));
  }
  if (axis === 'osc') {
    /* 三角波：0 → 1 → 0，映射到 −A … +A … −A。首尾各停在一处好姿态上，
       一个来回算一轮，末格照例加长。永远不走满一整圈。 */
    const u = steps > 1 ? k / (steps - 1) : 0;
    const f = 1 - Math.abs(2 * u - 1);
    const a = (OSC_AMP * (2 * f - 1)) * DEG;
    return out.copy(new THREE.Quaternion().setFromAxisAngle(Y_UP, a)).multiply(qBase);
  }
  const spin = (k * 360) / steps;
  const ax = axis === 'x' ? AXIS_X : Y_UP;
  return out.copy(new THREE.Quaternion().setFromAxisAngle(ax, spin * DEG)).multiply(qBase);
}

/**
 * 姿态的可读性读数（纯数学，不渲染）：
 *   face   —— 正面法线与视线的夹角余弦（1 = 正面正对观者，0 = 完全侧过去）
 *   aspect —— 剪影在屏幕上的 高/宽
 * 用来回答「哪个轴让正面读得久」。
 */
export function poseReadout(o = {}) {
  const steps = o.steps ?? 12;
  const rows = [];
  const q = new THREE.Quaternion();
  const n = new THREE.Vector3();
  const corners = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let k = 0; k < steps; k++) {
    poseQuat({ ...o, k }, q);
    n.set(0, 0, 1).applyQuaternion(q);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of corners) {
      const v = new THREE.Vector3(x, y, 0).applyQuaternion(q);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    rows.push({
      k,
      face: +Math.abs(n.z).toFixed(3),
      w: +((maxX - minX) / 2).toFixed(3),
      h: +((maxY - minY) / 2).toFixed(3),
      aspect: +((maxY - minY) / (maxX - minX)).toFixed(2),
    });
  }
  const mean = rows.reduce((a, r) => a + r.face, 0) / rows.length;
  /* 「还认得出是星吗」：星有四支，横两支与竖两支的长度都不能被压掉。
     取横竖两个方向的投影长度里较短的那个 —— 它掉到 0.45 以下时，四芒星会塌成
     一枚横向或纵向的透镜，那就不是星了。 */
  const shortSide = Math.min(...rows.map((r) => Math.min(r.w, r.h)));
  return {
    axis: o.axis || 'y',
    rows,
    meanFace: +mean.toFixed(3),
    readable: rows.filter((r) => r.face >= 0.6).length,
    minFace: +Math.min(...rows.map((r) => r.face)).toFixed(3),
    minShort: +shortSide.toFixed(3),
    /* 整圈里「四芒星还成立」的格数：横竖两向都还有 0.62 以上 */
    stillStar: rows.filter((r) => Math.min(r.w, r.h) >= 0.62).length,
    collapses: rows.filter((r) => Math.min(r.w, r.h) < 0.45).length,
    collapsedDir: rows.filter((r) => r.w < 0.45).length > rows.filter((r) => r.h < 0.45).length ? '横' : '纵',
  };
}

/**
 * 边缘份额：在给定姿态下，**不朝正面**的那些面占剪影面积多少。
 *
 * 这是「它什么时候不再是一块板」的直接量：板越薄，这个数越接近 0（只剩剪影一圈）；
 * 越厚，侧壁在投影里占的面积越大。同时它也是倒角板的判据 —— 倒角带若太窄，
 * 它在 200px 下的面积小到看不出，这个数会告诉你「薄了」还是「只是看不见」。
 *
 * @param {string} kind
 * @param {object} p      同 buildGeometry 的参数
 * @param {number} pitch  视角俯仰（度）
 * @param {number} yaw    视角偏航（度）
 */
export function edgeShare(kind, p = {}, pitch = STILL_PITCH, yaw = STILL_YAW) {
  const geo = buildGeometry(kind, p);
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitch * DEG, yaw * DEG, 0, 'YXZ'),
  );
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const local = new THREE.Vector3();
  let front = 0;
  let edge = 0;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    /* 局部法线：用它判「这张脸朝不朝正面」—— 与视角无关，是形体自己的属性 */
    local.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const area = local.length() / 2;
    if (area < 1e-12) continue;
    local.normalize();
    /* 投影到屏幕上占的面积：法线转到视空间后取 |z| */
    const proj = Math.abs(local.clone().applyQuaternion(q).z) * area;
    if (Math.abs(local.z) > 0.985) front += proj;
    else edge += proj;
  }
  const total = front + edge || 1;
  return {
    kind,
    frontShare: +(front / total).toFixed(3),
    edgeShare: +(edge / total).toFixed(3),
    tris: pos.count / 3,
  };
}

/**
 * 四支在屏幕上还剩多长 —— 精确解，不渲染。
 *
 * 截面那四个尖端在局部坐标里就是 (0,±1)、(±1,0)。把它们逐个转到视空间，
 * 量「投影到屏幕上、离形心的距离」：这就是那一支还剩多长。
 * 一块板侧过去时，两条尖端必然被压短 —— 短到某个比例以下，四芒星就退成透镜了。
 * 这条比「数剪影上有几个尖」准，因为透镜的两端也是尖，数法会被它骗过去。
 */
export function tipSpans(o = {}) {
  const steps = o.steps ?? 12;
  const q = new THREE.Quaternion();
  const rows = [];
  for (let k = 0; k < steps; k++) {
    poseQuat({ ...o, k }, q);
    const d = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([x, y]) => {
      const v = new THREE.Vector3(x, y, 0).applyQuaternion(q);
      return +Math.hypot(v.x, v.y).toFixed(3);
    });
    const sorted = d.slice().sort((a, b) => a - b);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    rows.push({
      k,
      face: +Math.abs(n.z).toFixed(3),
      tips: d,
      /* 最短的一支 / 最长的一支 */
      ratio: +(sorted[0] / sorted[3]).toFixed(2),
      /* 「四条边都还在」的判据：最短那一支还有最长的 72% 以上，四支读起来才是一样长 */
      even: sorted[0] / sorted[3] >= 0.72,
    });
  }
  const minRatio = Math.min(...rows.map((r) => r.ratio));
  return {
    axis: o.axis || 'y',
    rows,
    meanFace: +(rows.reduce((a, r) => a + r.face, 0) / rows.length).toFixed(3),
    minRatio: +minRatio.toFixed(2),
    evenSteps: rows.filter((r) => r.even).length,
    /* 比几何读数更硬的一条 —— 最短那一支被压到 45% 以下时，检验一下它到底还剩多长 */
    crushed: rows.filter((r) => r.ratio < 0.45).length,
    meanRatio: +(rows.reduce((a, r) => a + r.ratio, 0) / rows.length).toFixed(2),
  };
}

/** 倒角带在指定像素尺寸下有多宽（星宽 2 占画格的 86.8%） */
export function bevelBandPx(bevelW, sizePx) {
  return +(bevelW * sizePx * 0.868).toFixed(1);
}

/* ── 剪影测量：四支还在不在 ───────────────────────────────
   「这个姿态还读得成四芒星吗」不能看包围盒 —— 一块板侧过去时包围盒还很宽，
   但那已经是一条横线了。也不能只看四条边的墨（尖端那么细，边带里的面积本来就少）。
   真正的问题是**剪影上有几个尖**：四芒星有四个，侧过去的板只有两个（透镜），
   面内自转时四个尖换了方向但仍然是四个。

   做法：从剪影的包围盒中心出发，每 1° 采一次径向长度 r(θ)，取局部极大、
   且超过 0.8·max(r) 的那些 —— 它们的个数就是「剪影上数得出的尖」。 */

export function measureSilhouette(candKey, poses, { size = 160, bg = 'light', mat = 'resin', thresh = 10 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const stage = new Stage(canvas, { alpha: false });
  stage.renderer.setPixelRatio(1);
  stage.renderer.setSize(size, size, false);
  const gl = stage.renderer.getContext();
  const geo = geometryOf(candKey);
  const q = new THREE.Quaternion();
  const [br, bgg, bb] = [(PAGE_HEX[bg] >> 16) & 255, (PAGE_HEX[bg] >> 8) & 255, PAGE_HEX[bg] & 255];
  const w = size;
  const h = size;
  const px = new Uint8Array(w * h * 4);

  const out = poses.map((p) => {
    poseQuat(p, q);
    stage.paint([0, 0, size, size], { geo, mat, bg, q });
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

    /* 掩码：与底色差多少（不透明画布的 alpha 恒为 255，不能用 alpha 判） */
    const mask = new Uint8Array(w * h);
    let minX = w; let maxX = -1; let minY = h; let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((h - 1 - y) * w + x) * 4; /* WebGL 原点在左下 */
        const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bgg) + Math.abs(px[i + 2] - bb);
        if (d > thresh) {
          mask[y * w + x] = 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return { k: p.k, tips: 0, tips_: [], ratio: 0 };
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const N = 180;
    const prof = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      const th = (a / N) * Math.PI * 2;
      const dx = Math.cos(th);
      const dy = Math.sin(th);
      let r = 0;
      /* 走到出界或掉出掩码为止 */
      for (let t = 1; t < size; t++) {
        const x = Math.round(cx + dx * t);
        const y = Math.round(cy + dy * t);
        if (x < 0 || y < 0 || x >= w || y >= h) break;
        if (mask[y * w + x]) r = t;
      }
      prof[a] = r;
    }
    const rmax = Math.max(...prof);
    /* 局部极大 + 高度阈值：弱一点的尖（被压缩的）也要数进来，所以阈值放在 0.55 */
    const peaks = [];
    for (let a = 0; a < N; a++) {
      const v = prof[a];
      const pv = prof[(a - 1 + N) % N];
      const nv = prof[(a + 1) % N];
      if (v >= pv && v >= nv && v >= rmax * 0.55) peaks.push(v);
    }
    /* 相邻 3° 内的重复峰合并（栅格台阶会让一个尖数出好几个峰） */
    const merged = [];
    for (const v of peaks) {
      if (merged.length && Math.abs(merged[merged.length - 1] - v) < rmax * 0.012) {
        merged[merged.length - 1] = Math.max(merged[merged.length - 1], v);
      } else merged.push(v);
    }
    const radii = merged.slice().sort((a, b) => b - a);
    return {
      k: p.k,
      tips: radii.length,
      radii: radii.map((v) => +(v / rmax).toFixed(2)),
      /* 最弱的尖 / 最强的尖：四个尖等长时接近 1，被压扁时趋 0 */
      ratio: radii.length > 1 ? +(radii[radii.length - 1] / radii[0]).toFixed(2) : 0,
      aspect: +((maxX - minX + 1) / (maxY - minY + 1)).toFixed(2),
    };
  });

  stage.dispose();
  canvas.remove();
  return out;
}

/* ── 一个 WebGL 上下文画 N 格 ─────────────────────────────── */

export class Stage {
  constructor(canvas, { alpha = false } = {}) {
    this.opaque = !alpha;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(alpha ? 0 : 1);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.envRT = buildEnvMap(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.environment = this.envRT.texture;

    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
    /* 半视高 1.16：外接半径 1 的截面正好占满 ~86% 的画格，留一点给倒角与投影 */
    this.camera.position.set(0, 0, 5.42);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3.2, 4.4, 4.6);
    const fill = new THREE.DirectionalLight(0xdce4f2, 0.8);
    fill.position.set(-4.2, -1.6, 2.4);
    const rim = new THREE.DirectionalLight(0x9a86c4, 0.85);
    rim.position.set(-1.6, 2.2, -4.4);
    this.scene.add(key, fill, rim);

    this.materials = {};
    for (const k of MAT_ORDER) this.materials[k] = makeMaterial(k);
    this.lineMat = makeLineMaterial();

    this.mesh = new THREE.Mesh(geometryOf('bevel'), this.materials.resin);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMat);
    this.lines.visible = false;
    this.scene.add(this.mesh, this.lines);
    this.calls = 0;
  }

  /**
   * 画一格。
   * @param {number[]} rect [x, y(左下), w, h] 设备像素
   * @param {object} cell { geo, mat, bg, q }
   */
  paint(rect, cell) {
    const r = this.renderer;
    const [x, y, w, h] = rect;
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    r.setClearColor(PAGE_HEX[cell.bg] ?? PAGE_HEX.light, 1);
    this.mesh.geometry = cell.geo;
    this.mesh.material = this.materials[cell.mat] || this.materials.crystal;
    this.mesh.quaternion.copy(cell.q);
    const useLines = wantsEdges(cell.mat);
    this.lines.visible = useLines;
    if (useLines) {
      this.lines.geometry = edgesOf(cell.geo, cell.edgeAngle ?? 24);
      this.lines.quaternion.copy(cell.q);
    }
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    this.calls = r.info.render.calls;
  }

  done() {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height);
  }

  /**
   * 逐格读回「与这一格底色差多少」。判据必须是「像素和底色差多少」而不是 alpha：
   * 不透明画布的 alpha 恒为 255，用 alpha 会得到「全都画上了」的假阳性。
   */
  probe(cells) {
    const gl = this.renderer.getContext();
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const srgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const out = [];
    for (const { rect, bg } of cells) {
      const [x0, y0, cw, ch] = rect.map((v) => Math.round(v));
      const [br, bgg, bb] = srgb(bg ?? PAGE_HEX.light);
      let lit = 0;
      let peak = 0;
      let minX = cw; let maxX = -1; let minY = ch; let maxY = -1;
      for (let yy = 0; yy < ch; yy++) {
        for (let xx = 0; xx < cw; xx++) {
          const i = ((y0 + yy) * w + (x0 + xx)) * 4;
          const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bgg) + Math.abs(px[i + 2] - bb);
          if (d > 10) {
            lit++;
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
            if (yy < minY) minY = yy;
            if (yy > maxY) maxY = yy;
          }
          if (d > peak) peak = d;
        }
      }
      out.push({
        coverage: +(lit / (cw * ch)).toFixed(3),
        contrast: Math.round(peak),
        box: maxX >= 0 ? [minX, ch - 1 - maxY, maxX - minX + 1, maxY - minY + 1] : null,
      });
    }
    return { buffer: `${w}x${h}`, calls: this.calls, cells: out };
  }

  dispose() {
    for (const m of Object.values(this.materials)) m.dispose();
    this.lineMat.dispose();
    this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ── 方格表 ───────────────────────────────────────────────── */
/**
 * rows: [{ cells: [{ geo|spec, mat, bg, size, k?, steps?, holdMs?, axis?, base? }] }]
 * cell.geo 若给 { cand, over } 就直接用候选表里的参数。
 */
export function mountGrid(canvas, spec) {
  const { rows, gap = 16, pad = 0, labelRoom = 0 } = spec;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let layout = [];
  let stage = null;

  const layoutOf = (rowsNow) => {
    const rowW = rowsNow.map((row) => row.cells.reduce((a, c) => a + c.size, 0) + gap * (row.cells.length - 1));
    const width = Math.max(...rowW) + pad * 2;
    const heights = rowsNow.map((row) => Math.max(...row.cells.map((c) => c.size)));
    /* labelRoom 是每行下面预留给标注的两行字高 —— 不给的话下一行的格子会压在上一行的字上 */
    const height = heights.reduce((a, h) => a + h + labelRoom, 0) + gap * (rowsNow.length - 1) + pad * 2;
    const out = [];
    let cy = pad;
    rowsNow.forEach((row, ri) => {
      let cx = pad;
      for (const c of row.cells) {
        out.push({ ...c, left: cx, top: cy, offsetY: (heights[ri] - c.size) / 2 });
        cx += c.size + gap;
      }
      cy += heights[ri] + labelRoom + gap;
    });
    return { width, height, out };
  };

  const geoOf = (c) => {
    if (c.geo instanceof THREE.BufferGeometry) return c.geo;
    if (c.geo && c.geo.cand) return geometryOf(c.geo.cand, c.geo.over || {});
    if (c.kind) return geometryAny(c.kind, c.over || {});
    return geometryOf('bevel');
  };

  const paint = () => {
    if (!stage) return;
    const q = new THREE.Quaternion();
    for (const c of layout) {
      poseQuat(c, q);
      const gy = H - (c.top + c.offsetY) - c.size;
      c.rect = [c.left * dpr, gy * dpr, c.size * dpr, c.size * dpr];
      stage.paint(c.rect, { ...c, geo: geoOf(c), q });
    }
    stage.done();
  };

  const apply = (rowsNow) => {
    const l = layoutOf(rowsNow);
    W = l.width;
    H = l.height;
    layout = l.out;
    if (!stage) stage = new Stage(canvas, { alpha: false });
    stage.renderer.setPixelRatio(dpr);
    stage.renderer.setSize(W, H, false);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    paint();
  };

  apply(rows);

  return {
    get stage() { return stage; },
    get layout() { return layout; },
    get width() { return W; },
    get height() { return H; },
    redraw: paint,
    update(rowsNow) { apply(rowsNow); },
    /* 只重画、不重新布局（改材质/姿态时用） */
    repaint(mutate) {
      if (mutate) mutate(layout);
      paint();
    },
    probe() {
      paint();
      const res = stage.probe(layout.map((c) => ({ rect: c.rect, bg: PAGE_HEX[c.bg] ?? PAGE_HEX.light })));
      paint();
      return {
        ...res,
        boxes: res.cells.map((c) => c.box),
      };
    },
    dispose() { if (stage) stage.dispose(); stage = null; },
  };
}

/* ── 单个活动层（定格 / 连续对照）────────────────────────── */

export class SlabLayer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = {
      cand: 'bevel',
      over: {},
      mat: 'resin',
      bg: 'light',
      steps: 12,
      holdMs: 120,
      axis: 'y',
      base: 'spin',
      mode: 'step',
      size: 200,
      ...opts,
    };
    this.stage = new Stage(canvas, { alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.elapsed = 0;
    this.running = false;
    this.timer = 0;
    this.raf = 0;
    this.t0 = 0;
    this.applySize(this.opts.size);
    this.draw(0);
  }

  applySize(size) {
    this.opts.size = size;
    this.stage.renderer.setPixelRatio(this.dpr);
    this.stage.renderer.setSize(size, size, false);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
  }

  draw(elapsed) {
    this.elapsed = elapsed;
    const q = poseQuat(this.opts, new THREE.Quaternion());
    const px = this.opts.size * this.dpr;
    this.stage.paint([0, 0, px, px], {
      ...this.opts,
      geo: geometryOf(this.opts.cand, this.opts.over),
      q,
    });
    this.stage.done();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now() - this.elapsed;
    this.restart();
  }

  restart() {
    this.stopTimer();
    if (!this.running) return;
    if (this.opts.mode === 'smooth') {
      const loop = (now) => {
        if (!this.running) return;
        this.draw(now - this.t0);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
      return;
    }
    /* 定格：不用 rAF。每格画一次，下一次唤醒按这一格还剩多久排。 */
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const s = schedule(this.opts.steps, this.opts.holdMs);
      const { left } = stepAt(s, now - this.t0);
      this.draw(now - this.t0);
      this.timer = setTimeout(tick, Math.max(8, left + 6));
    };
    tick();
  }

  stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.timer = 0;
    this.raf = 0;
  }

  stop() {
    this.running = false;
    this.stopTimer();
  }

  freeze(k) {
    this.stop();
    this.draw(schedule(this.opts.steps, this.opts.holdMs).starts[k] ?? 0);
  }

  dispose() { this.stop(); this.stage.dispose(); }
}

/* ── 测算 ─────────────────────────────────────────────────── */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 三档材质 × 有代表性的一把几何，各跑几轮，分开记 CPU 提交与（含 gl.finish 的）GPU 耗时。
 * 尺寸与 star-crystal / star-v-gem 的测法对齐：480×480 缓冲、DPR 1。
 *
 * 每条读数跑 ROUNDS 轮，取**最小值**。最小值是最不受污染的估计量：
 * 计时环里任何一次意外的 GC、着色器补编译、系统抢占都只会让某一轮变慢，
 * 不会让某一轮变快。第一版只跑一轮、且预热不等 programs 稳定，同一档重复三次差到 70 倍。
 */
export async function measureCost({ size = 480, cpuMs = 420, gpuMs = 320, rounds = 3 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const stage = new Stage(canvas, { alpha: false });
  stage.renderer.setPixelRatio(1);
  stage.renderer.setSize(size, size, false);
  stage.renderer.setClearColor(PAGE_HEX.light, 1);
  const gl = stage.renderer.getContext();
  const rows = [];
  const combos = [];
  for (const mat of MAT_ORDER) combos.push({ cand: 'bevel', mat });
  combos.push({ cand: 'hexagram', mat: 'crystal' });
  combos.push({ cand: 'dished', mat: 'crystal' });
  combos.push({ cand: 'slab', mat: 'resin' });

  for (const { cand, mat } of combos) {
    const geo = geometryOf(cand);
    /* 预热必须等到 programs 数不再变 —— 否则着色器编译会算进计时里。 */
    let prev = -1;
    let stable = 0;
    for (let i = 0; i < 400; i++) {
      const q = poseQuat({ base: 'still' }, new THREE.Quaternion());
      stage.paint([0, 0, size, size], { geo, mat, bg: 'light', q });
      gl.finish();
      const n = stage.renderer.info.programs.length;
      stable = n === prev ? stable + 1 : 0;
      prev = n;
      if (stable >= 4 && i > 12) break;
      await nextFrame();
    }
    for (let i = 0; i < 20; i++) {
      const q = poseQuat({ base: 'still' }, new THREE.Quaternion());
      stage.paint([0, 0, size, size], { geo, mat, bg: 'light', q });
    }
    gl.finish();
    await nextFrame();
  }

  /* 轮次在外、档位在里：每一轮里所有档位都测一遍，取每档的**最小值**。
     温度、GPU 降频、系统抢占这一类漂移因此在同一轮里对所有档位一样，
     取最小之后被抹掉 —— 上一版把档位放外层，后测的几档永远偏高。 */
  const acc = combos.map((c) => ({ ...c, cpu: Infinity, gpu: Infinity, calls: 0, tris: 0, programs: 0 }));
  for (let round = 0; round < rounds; round++) {
    acc.forEach((row, idx) => {
      const geo = geometryOf(row.cand);
      const a0 = performance.now();
      let n = 0;
      let budget = 0;
      while (performance.now() - a0 < cpuMs) {
        const t = performance.now();
        const q = poseQuat({ elapsed: t - a0, steps: 12, holdMs: 120, axis: 'face' }, new THREE.Quaternion());
        stage.paint([0, 0, size, size], { geo, mat: row.mat, bg: 'light', q });
        budget += performance.now() - t;
        n++;
      }
      row.cpu = Math.min(row.cpu, budget / n);
      row.calls = stage.renderer.info.render.calls;
      row.tris = stage.renderer.info.render.triangles;
      row.programs = Math.max(row.programs, stage.renderer.info.programs.length);
    });
    gl.finish();
    await nextFrame();
    acc.forEach((row, idx) => {
      const geo = geometryOf(row.cand);
      const b0 = performance.now();
      let m = 0;
      let bsum = 0;
      while (performance.now() - b0 < gpuMs) {
        const t = performance.now();
        const q = poseQuat({ elapsed: t - b0, steps: 12, holdMs: 120, axis: 'face' }, new THREE.Quaternion());
        stage.paint([0, 0, size, size], { geo, mat: row.mat, bg: 'light', q });
        gl.finish();
        bsum += performance.now() - t;
        m++;
      }
      row.gpu = Math.min(row.gpu, bsum / m);
    });
    await nextFrame();
  }
  stage.done();
  for (const r of acc) {
    rows.push({
      cand: r.cand,
      mat: r.mat,
      cpu: +r.cpu.toFixed(3),
      gpu: +r.gpu.toFixed(3),
      calls: r.calls,
      tris: r.tris,
      programs: r.programs,
      rounds,
    });
  }

  const holdPlan = [80, 110, 120, 160].map((holdMs) => {
    const row = rows.find((r) => r.cand === 'bevel' && r.mat === 'resin');
    return {
      holdMs,
      drawsPerSec: +(1000 / holdMs).toFixed(1),
      msPerSec: +((row.gpu * 1000) / holdMs).toFixed(2),
    };
  });

  stage.dispose();
  canvas.remove();
  return { rows, holdPlan, size };
}

/* ── 三角面数（写进 notes 用）────────────────────────────── */
export function triCount(candKey, over = {}) {
  const g = geometryOf(candKey, over);
  return g.getAttribute('position').count / 3;
}

export { BREATH };