/* ─────────────────────────────────────────────────────────────
   六芒星 · 板／构造（star-v-plate · 原型）
   ─────────────────────────────────────────────────────────────
   反着水晶那颗下注：不做实心宝石，做**薄板搭起来的构造**。

   六个尖端落在 ±x ±y ±z 上。七种做法各自决定「用什么把六个尖端连起来」：
     tri     三片正交薄板   —— 三张四芒星板，两两正交，共心穿过
     spine   一片薄板 + 轴  —— 一张星板 + 一根穿过它的细轴（两端成尖）
     shell   空心棱壳       —— 八面体的八张三角薄壳，壳有厚度，中间是空的
     frame   十二边框架     —— 只留棱：三条正交方框的十二条边，细方管
     fold    折起的星       —— 一张星板沿两条轴折成浅浮雕
     mixed   双片一环       —— 两张星板 + 第三条正交框（发明的一条）

   关键手法（这一版的立身之本）：
     薄板用 ExtrudeGeometry，几何自带两个 group —— 0 是正反面，1 是侧壁与倒角。
     于是每块板可以吃两份材质：面一份（磨砂、半透明）、**边一份（压暗、几乎不透）**。
     浅底上一块白板的轮廓全靠那圈 2–4px 的暗边交代；没有它，板就化在纸里。

   材质三档（外加一档对照）：
     acrylic 磨砂半透 + 同色边（x 光；面不写深度，层层叠起来看）
     edge    磨砂半透 + **压暗的边**（面写深度，逐层遮挡）
     opaque  近白实心 + 压暗的边（靠程序化环境贴图里的暗地面分出明暗）
     plain   同 edge 但**不带暗边**（只用于拆解那一段做对照）

   运动：定格。姿态量化到 360/steps 的格子，每格保持 holdMs；
   绕竖轴自转的同时叠一个余弦的「点头」，让 12 格里没有两张重样 ——
   这个构造对三个轴都有 90° 对称，只自转的话 12 步里只有 4 个姿态。
   因为姿态离散，这里不用 rAF：setTimeout 链每格醒一次。

   一切尺寸按 CSS px 喂；光栅固定 DPR 2（发丝边在 1x 下会断成虚线）。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { starPath, PRESETS as FLAT_PRESETS } from '../star-flat/star.js';

const DEG = Math.PI / 180;

export const PAGE_BG = 0xf0f3f6;
export const DEEP_BG = 0x2a2b38;

/* 渲染倍率：固定 2，不跟 DPR 走。原因见 notes「发丝边在 1x 下会断」。 */
const DPR = 2;

/* 基准视：正等轴 —— 与 toolstar.ts 的 drawStar 同一组角度。
   ⚠ 欧拉顺序必须是 'XYZ'，不能是 'YXZ'。
   toolstar 的公式是 x1 = x cos yaw + z sin yaw → 先绕 Y，再绕 X 压 pitch，
   也就是 R = Rx(pitch)·Ry(yaw)；three 里只有 Euler(x, y, 0, 'XYZ') 是这个乘法次序。
   第一版写成 'YXZ'（R = Ry·Rx，两次旋转反了序），六个尖端于是投成
   「一个十字 + 中间一点」—— 看上去像一个四芒星，而三轴六芒星该有的
   那个六边形轮廓从来没出现过。这是 01 那一排最初全部读错的根本原因。 */
const BASE_PITCH = 35.264;
const BASE_YAW = 45;

/* 一圈最后一格之后多停这么多倍（呼吸停歇）。同 brand.ts「7 步轮转 + 3 秒停歇」≈3× */
export const BREATH = 3.2;

/* ─────────────────────────────────────────────────────────────
   一、星形轮廓
   ─────────────────────────────────────────────────────────────
   数学逐行沿用 design/mocks/star-flat/star.js 的 arcs()：
   每 1/4 段两条二次曲线，尖端 ─Q─ 肩点 ─Q─ 尖端。
   这里只多做两件事：把轮廓变成 THREE.Shape，以及留一份 toD 与 star.js
   的 starPath() 逐字符对照（见 parity()）—— 不另造第六种星。
   --------------------------------------------------------------------------- */

const PROFILES = {
  equal: { ...FLAT_PRESETS.equal },
  spire: { ...FLAT_PRESETS.spire },
  facet: { ...FLAT_PRESETS.facet },
};

/** 页面控件用：按名字取一组轮廓参数（找不到就退回 equal） */
export const PROFILE_REF = PROFILES;

const n3 = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

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
    out.push({ a: T0, c: ctrl(T0, S), b: S });
    out.push({ a: S, c: ctrl(T1, S), b: T1 });
  }
  return { arcs: out, straight: p === 0 };
}

/** 与 star-flat/star.js 的 toD() 同一套写法，用来做逐字符对照 */
function toD({ arcs: list, straight }, xf) {
  const P = (pt) => (xf ? xf(pt) : pt).map(n3).join(',');
  const eq = (a, b) => n3(a[0]) === n3(b[0]) && n3(a[1]) === n3(b[1]);
  if (!straight) {
    let d = 'M' + P(list[0].a);
    list.forEach((h, i) => {
      d += 'Q' + P(h.c) + ' ' + P(h.b);
      const next = list[(i + 1) % list.length];
      if (!eq(h.b, next.a)) d += 'L' + P(next.a);
    });
    return d + 'Z';
  }
  const verts = [];
  for (const h of list) {
    const last = verts[verts.length - 1];
    if (!last || !eq(last, h.a)) verts.push([n3(h.a[0]), n3(h.a[1])]);
  }
  while (verts.length > 1 && eq(verts[0], verts[verts.length - 1])) verts.pop();
  return 'M' + verts.map((v, i) => (i ? 'L' : '') + v.join(',')).join('') + 'Z';
}

/**
 * 轮廓自检：本文件的 toD 与 star-flat 的 starPath 必须逐字符相同。
 * 不相同就说明「沿用了它的数学」这句话是假的。
 */
export function parity() {
  const out = [];
  for (const [name, p] of Object.entries(PROFILES)) {
    out.push({ profile: name, mine: toD(arcs(p)), theirs: starPath(p), same: toD(arcs(p)) === starPath(p) });
  }
  return out;
}

/** THREE.Shape：SVG 的 y 向下，这里翻成三维的 y 向上（形心仍在原点） */
function starShape(profile, scale = 1) {
  const { arcs: list } = arcs(profile);
  const s = new THREE.Shape();
  const px = (q) => [q[0] * scale, -q[1] * scale];
  const p0 = px(list[0].a);
  s.moveTo(p0[0], p0[1]);
  for (const h of list) {
    const c = px(h.c);
    const b = px(h.b);
    s.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

/* ─────────────────────────────────────────────────────────────
   二、几何拼装
   ───────────────────────────────────────────────────────────── */

const AXIS_PTS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

/** 八面体的八张面（每张由 ±x ±y ±z 各取一个顶点组成） */
function octaFaces() {
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    out.push([
      new THREE.Vector3(sx, 0, 0),
      new THREE.Vector3(0, sy, 0),
      new THREE.Vector3(0, 0, sz),
    ]);
  }
  return out;
}

/** 八面体的十二条边 */
function octaEdges() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const a = AXIS_PTS[i];
      const b = AXIS_PTS[j];
      if (Math.abs(a.dot(b)) > 1e-9) continue; /* 对顶点不相连 */
      out.push([a.clone(), b.clone()]);
    }
  }
  return out;
}

/** 三角/多边形薄壳：caps 一组、侧壁一组，非索引，法线是平的 */
function thickPolyPositions(polys, thickness) {
  const caps = [];
  const rims = [];
  const half = thickness / 2;
  const push = (arr, p) => arr.push(p.x, p.y, p.z);

  for (const pts of polys) {
    const c = new THREE.Vector3();
    pts.forEach((p) => c.add(p));
    c.multiplyScalar(1 / pts.length);
    const nrm = new THREE.Vector3()
      .subVectors(pts[1], pts[0])
      .cross(new THREE.Vector3().subVectors(pts[2], pts[0]))
      .normalize();
    if (nrm.dot(c) < 0) nrm.negate(); /* 朝外 */

    const f = pts.map((p) => p.clone().addScaledVector(nrm, half));
    const b = pts.map((p) => p.clone().addScaledVector(nrm, -half));

    /* 双面片：正面扇形 + 背面反序扇形（材质是 DoubleSide，绕序不影响光照） */
    for (let i = 1; i < pts.length - 1; i++) {
      push(caps, f[0]); push(caps, f[i]); push(caps, f[i + 1]);
      push(caps, b[0]); push(caps, b[i + 1]); push(caps, b[i]);
    }
    /* 周圈侧壁：每个顶点一条边，两条三角 */
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      push(rims, f[i]); push(rims, b[i]); push(rims, b[j]);
      push(rims, f[i]); push(rims, b[j]); push(rims, f[j]);
    }
  }
  return { caps, rims };
}

/** 方截面细管（从 a 到 b）：用于框架的棱 */
function prismPositions(a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(r);
  const v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(r);
  const ring = (p) => [
    p.clone().add(u).add(v),
    p.clone().sub(u).add(v),
    p.clone().sub(u).sub(v),
    p.clone().add(u).sub(v),
  ];
  const A = ring(a);
  const B = ring(b);
  const out = [];
  const t = (p0, p1, p2) => out.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    t(A[i], B[i], B[j]);
    t(A[i], B[j], A[j]);
  }
  /* 端头封口（拼接处这三个面的朝向不一致，DoubleSide 兜住） */
  t(A[0], A[1], A[2]); t(A[0], A[2], A[3]);
  t(B[0], B[2], B[1]); t(B[0], B[3], B[2]);
  return out;
}

/** 胶囊状的细轴（两端收成尖）：方截面双锥，沿 z */
function spinePositions(tip, waist) {
  const pos = [];
  const t = (p0, p1, p2) => pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  const ring = [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    return new THREE.Vector3(Math.cos(a) * waist, Math.sin(a) * waist, 0);
  });
  for (const sgn of [1, -1]) {
    const tipP = new THREE.Vector3(0, 0, sgn * tip);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      t(tipP, ring[i], ring[j]);
    }
  }
  return pos;
}

function geometryFromPositions(caps, rims) {
  const all = new Float32Array(caps.length + rims.length);
  all.set(caps, 0);
  all.set(rims, caps.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  const capCount = caps.length / 3;
  const rimCount = rims.length / 3;
  if (capCount) g.addGroup(0, capCount, 0);
  if (rimCount) g.addGroup(capCount, rimCount, 1);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * 一张板：星形轮廓挤出 + 倒角，几何天然分 caps / sides 两组。
 * 轮廓先归一到「半径 = 1」—— 六个尖端在 ±1 上，板与棱壳/框架才是同一个尺度，
 * thickness 与 bevel 因此也是「半径的百分比」：0.045 ≈ 200px 下 4.5px。
 */
function plateGeometry(profile, { thickness = 0.045, bevel = 0.01, segments = 9 } = {}) {
  const k = 1 / profile.arm;
  const g = new THREE.ExtrudeGeometry(starShape(profile, k), {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: segments,
    steps: 1,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** 拿起一块几何、转个朝向做成板 */
function plate(profile, opts, rot = [0, 0, 0]) {
  const m = new THREE.Mesh(plateGeometry(profile, opts));
  m.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
  return m;
}

/* ── 六种构造 ───────────────────────────────────────────────── */

export const CONSTRUCTIONS = {
  tri: {
    label: '三片正交薄板',
    line: '同一张星板摆进三个正交平面，共心穿过',
    build({ profile, thickness, bevel }) {
      const g = new THREE.Group();
      g.add(plate(profile, { thickness, bevel })); /* xy */
      g.add(plate(profile, { thickness, bevel }, [90, 0, 0])); /* zx（绕 x 转 90°） */
      g.add(plate(profile, { thickness, bevel }, [0, 90, 0])); /* yz（绕 y 转 90°） */
      return g;
    },
  },

  spine: {
    label: '一片薄板 + 一根正交轴',
    line: '一张星板立在中间，一根细轴穿过它的中心，两端各成一个尖',
    build({ profile, thickness, bevel }) {
      const g = new THREE.Group();
      g.add(plate(profile, { thickness, bevel })); /* xy */
      /* 轴沿 z。⚠ 这一条在基准视里几乎看不见 —— 正等轴下 z 轴正对观者，
         被压成一个点（见 notes 的「与预期不符」）。加粗到 0.055 后仍然只在
         姿态转到侧面时才读得出来。这是这个构造本身的短板，不是参数没调好。 */
      const core = spinePositions(1, 0.07);
      const geo = geometryFromPositions([], core);
      const axis = new THREE.Mesh(geo);
      axis.rotation.set(90 * DEG, 0, 0); /* 双锥沿 z */
      g.add(axis);
      return g;
    },
  },

  shell: {
    label: '空心棱壳',
    line: '八张三角薄壳拼成八面体，壳有厚度，里面完全空着',
    /* 壳要「看得进去」，面就必须真的让路：alpha 压到 0.24 且不写深度，
       否则前面的壁把后面的壁挡死，八面体就退化成一块实心白石头（第一版即此）。 */
    alpha: 0.44,
    build({ thickness, bevel }) {
      const t = Math.max(0.05, thickness * 1.2);
      const { caps, rims } = thickPolyPositions(octaFaces(), t);
      return new THREE.Group().add(new THREE.Mesh(geometryFromPositions(caps, rims)));
    },
  },

  frame: {
    label: '十二边框架',
    line: '只留棱：三条正交方框的十二条边，细方管',
    /* 管子要细到「线」，否则十二条边在白底上连成一片实心多边形 ——
       第一版 tube 0.016（约 200px 下 1.6px 的截面半径）在 200px 那格读成
       一块带棱的白面，完全不是骨架。压到 0.011 之后才成为线。
       代价：边长约 1.414，那么细的方管在 64px 下会时断时续（见 12-sizes 那张）。 */
    build({ tube = 0.011 } = {}) {
      const caps = [];
      const rims = [];
      for (const [a, b] of octaEdges()) rims.push(...prismPositions(a, b, tube));
      /* 六个尖端各放一枚小方节点，收住四根管子的接头 */
      for (const p of AXIS_PTS) {
        const nrm = p.clone().normalize();
        const q = prismPositions(
          p.clone().addScaledVector(nrm, -tube * 1.1),
          p.clone().addScaledVector(nrm, tube * 1.1),
          tube * 1.3,
        );
        rims.push(...q);
      }
      return new THREE.Group().add(new THREE.Mesh(geometryFromPositions(caps, rims)));
    },
  },

  fold: {
    label: '折起的星',
    line: '一张星板沿两条轴折成浅浮雕：四片平面，折痕落在两条轴上',
    /* ⚠ 这一版没做到它名字里说的那件事。
       ExtrudeGeometry 的 cap 三角化是 Delaunay，顶点在面内分布很稀：
       沿 z 按 |x|+|y| 抬升之后，得到的是「一张弯板」，不是「四片平面」。
       要把折痕落到轴上，必须自己按 quadrant 裁四个 sub-shape 再各转一个角度，
       而不是给整张板的顶点加一个位移函数。见 notes 的「没做到的」。 */
    build({ profile, thickness, bevel, fold = 0.34 }) {
      const geo = plateGeometry(profile, { thickness, bevel });
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = Math.abs(p.getX(i));
        const y = Math.abs(p.getY(i));
        /* 抬升量取 max 而不是和：折痕落在 |x| = |y| 的斜线上（本来想落在轴上），
           但至少四片会各自成为一块平面，而不是一张连续曲面。 */
        p.setZ(i, p.getZ(i) + fold * Math.max(x, y));
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      return new THREE.Group().add(new THREE.Mesh(geo));
    },
  },

  mixed: {
    label: '双片一环',
    line: '两张星板 + 一枚套在腰上的环（第三条正交面上只留线）',
    build({ profile, thickness, bevel, tube = 0.013 }) {
      const g = new THREE.Group();
      g.add(plate(profile, { thickness, bevel })); /* xy */
      g.add(plate(profile, { thickness, bevel }, [0, 90, 0])); /* yz */
      /* 环落在 zx 平面上，套在两张板交叉的腰上 ——
         第一版这里画的是一条与板臂重合的菱形框，完全看不见（见 notes）。
         第二版换成圆环，然后发现了第二个坑：TorusGeometry 没有 material group，
         three 就只给它 material[0] —— 也就是那份浅色、半透明的「面」。
         结果是一圈几乎透明的线，白底上等于不存在。
         这里显式声明一个 index 1 的 group，它才会吃到「边」那份压暗的材质。 */
      const ringGeo = new THREE.TorusGeometry(0.5, tube, 4, 72);
      ringGeo.addGroup(0, ringGeo.index ? ringGeo.index.count : ringGeo.getAttribute('position').count, 1);
      const ring = new THREE.Mesh(ringGeo);
      /* TorusGeometry 的环躺在 xy 平面、轴沿 z。两张板（xy 那张、yz 那张）
         相交成一条沿 y 的线，要让环「套住」它就得让环的轴沿 y —— 绕 x 转 90° 即可，
         转完环落在 zx 平面上。 */
      ring.rotation.set(90 * DEG, 0, 0);
      g.add(ring);
      return g;
    },
  },
};

export const CON_ORDER = ['tri', 'spine', 'shell', 'frame', 'fold', 'mixed'];

/* ─────────────────────────────────────────────────────────────
   三、程序化环境贴图与材质
   ───────────────────────────────────────────────────────────── */

function buildEnv(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');

  /* 天顶白 → 地平线亮 → 地面压到深灰。
     地面那一段是必需的：环境里全是亮面时，一块近白的薄板在白底上等于不存在——
     板的明暗只能来自环境，而「有几面亮、有几面暗」必须由环境本身提供。 */
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#ffffff');
  sky.addColorStop(0.24, '#f8fafc');
  sky.addColorStop(0.44, '#dfe5ee');
  sky.addColorStop(0.54, '#ffffff');
  sky.addColorStop(0.64, '#b9c2d0');
  sky.addColorStop(0.8, '#69737f');
  sky.addColorStop(1.0, '#33373f');
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
  blob(250, 120, 220, '#ffffff', 1.0);
  blob(800, 90, 160, '#ffffff', 0.9);
  blob(520, 250, 300, '#d9d2e8', 0.42); /* 一点薄暮紫（--dream） */
  blob(940, 215, 200, '#5f6875', 0.5);
  blob(360, 300, 240, '#8b93a1', 0.4);
  blob(30, 430, 320, '#2b2f36', 0.75);

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

/**
 * 四档材质。每档给两份：面（group 0）与边（group 1）。
 *
 * 白捡的那条（star-crystal/notes.md 已实测）：只要 transmission 非零，
 * three 就开一整遍 transmissive pass。这里一次都不用 —— 半透明一律走 opacity。
 */
export const MATERIALS = {
  acrylic: {
    label: '磨砂亚克力',
    line: '半透明、高粗糙，面不写深度，层层叠着看，边同色',
    face: {
      color: 0xe6ebf4,
      roughness: 0.62,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      envMapIntensity: 0.9,
    },
    edge: {
      color: 0xdde3ee,
      roughness: 0.5,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      envMapIntensity: 1.0,
    },
  },

  edge: {
    label: '亚克力 + 暗边',
    line: '同样的面，边上压一道几乎不透的暗线 —— 浅底上靠它交代轮廓',
    face: {
      color: 0xe9edf5,
      roughness: 0.58,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
      depthWrite: true,
      envMapIntensity: 0.9,
    },
    edge: {
      color: 0x4d5164, /* 由 --umber #4f4a66 压下来 */
      roughness: 0.42,
      metalness: 0.05,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
      envMapIntensity: 0.6,
    },
  },

  opaque: {
    label: '近白实心 + 暗边',
    line: '完全不透，明暗全部来自环境贴图里的暗地面；边再压深一档',
    face: {
      color: 0xf7f9fc,
      roughness: 0.34,
      metalness: 0,
      envMapIntensity: 1.15,
    },
    edge: {
      color: 0x787d90,
      roughness: 0.4,
      metalness: 0,
      envMapIntensity: 0.9,
    },
  },

  plain: {
    label: '不带暗边',
    line: '面与边同一档 —— 只用来证明那圈边到底值多少',
    face: {
      color: 0xe9edf5,
      roughness: 0.58,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
      depthWrite: true,
      envMapIntensity: 0.9,
    },
    edge: {
      color: 0xe9edf5,
      roughness: 0.58,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
      depthWrite: true,
      envMapIntensity: 0.9,
    },
  },
};

export const MAT_ORDER = ['acrylic', 'edge', 'opaque', 'plain'];

/** 把一份材质调成「透到能看穿」：给构造单独覆写用 */
function withAlpha(spec, alpha) {
  if (!alpha) return spec;
  return { ...spec, transparent: true, opacity: alpha, depthWrite: false };
}

function makeMaterials(setName, alpha) {
  const s = MATERIALS[setName];
  const mk = (spec) => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...withAlpha(spec, alpha) });
  return [mk(s.face), mk(s.edge)];
}

/* ─────────────────────────────────────────────────────────────
   四、定格时钟
   ───────────────────────────────────────────────────────────── */

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

/* ── 姿态 ──
   自转绕竖轴（转盘），再叠一个余弦「点头」。
   这个构造对 x / y / z 三个轴都有 90° 对称：只自转的话 12 步里只有 4 个不重样的姿态。
   点头用 A·cos θ + B·cos 2θ：整圈首尾相接（呼吸那一格不会跳回原位），
   但两项都偶对称 —— k 与 k+6（差 180°）的点头相同，若自转也是对称的就会重合。
   所以第三项必须是**奇对称**的：C·sin θ（k 与 k+6 反号）。
   实测（第一版只有 A、B）：12 步里「最像的一对」IoU = 1.000，就是 k 与 k+6；
   加上 sin 项之后降到见 notes 的表。 */
const NOD_A = 17 * DEG;
const NOD_B = 9 * DEG;
const NOD_C = 15 * DEG;
const YAW_DRIFT = 7 * DEG; /* 整圈再漂这么多偏航，破掉 y 轴的 90° 对称 */
const Q_BASE = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(BASE_PITCH * DEG, BASE_YAW * DEG, 0, 'XYZ'),
);
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);

/** 姿态 = 偏航 · 点头 · 自转 · 基准视（世界系左乘，基准视在最内） */
export function poseQuaternion(k, steps) {
  const theta = (k / steps) * Math.PI * 2;
  const spin = (k * 360) / steps;
  const nod = NOD_A * Math.cos(theta) + NOD_B * Math.cos(2 * theta) + NOD_C * Math.sin(theta);
  const drift = YAW_DRIFT * Math.sin(theta);
  const qSpin = new THREE.Quaternion().setFromAxisAngle(AX_Y, spin * DEG);
  const qNod = new THREE.Quaternion().setFromAxisAngle(AX_X, nod);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(AX_Y, drift);
  return new THREE.Quaternion().multiplyQuaternions(qYaw, qNod).multiply(qSpin).multiply(Q_BASE);
}

/* ─────────────────────────────────────────────────────────────
   五、舞台：一张画布，若干格
   ───────────────────────────────────────────────────────────── */

const CAM_DIST = 5.6;
const CAM_FOV = 26;

export class Board {
  constructor(wrapper, { geoOpts = {}, axis = 'y' } = {}) {
    this.wrapper = wrapper;
    this.geoOpts = { profile: PROFILES.equal, thickness: 0.045, bevel: 0.01, ...geoOpts };
    this.axis = axis;
    this.groups = new Map();
    this.matCache = new Map();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage';
    wrapper.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(DPR);
    this.renderer.setClearAlpha(0);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.envRT = buildEnv(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.environment = this.envRT.texture;

    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 40);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3.2, 4.4, 4.6);
    const fill = new THREE.DirectionalLight(0xdce4f2, 0.8);
    fill.position.set(-4.2, -1.4, 2.4);
    const rim = new THREE.DirectionalLight(0x9a86c4, 0.55);
    rim.position.set(-1.6, 2.2, -4.4);
    this.scene.add(key, fill, rim);

    /* 物体挂在 holder 下：每格换完再挂回去，比 scene.clear() 干净（灯和相机不会被一起扫掉） */
    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.cells = [];
    this.W = 0;
    this.H = 0;
  }

  materialsFor(name, con) {
    /* 构造可以带一个 alpha 覆写（棱壳要透到能看见后壁）。
       缓存键带上它，否则两种构造会共用同一份材质。 */
    const alpha = con ? CONSTRUCTIONS[con]?.alpha : undefined;
    const key = alpha ? `${name}@${alpha}` : name;
    let m = this.matCache.get(key);
    if (!m) {
      m = makeMaterials(name, alpha);
      this.matCache.set(key, m);
    }
    return m;
  }

  group(conName) {
    let g = this.groups.get(conName);
    if (!g) {
      g = CONSTRUCTIONS[conName].build(this.geoOpts);
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      this.groups.set(conName, g);
    }
    return g;
  }

  /** 轮廓/厚度改了就丢几何（材质缓存留着，它跟几何无关） */
  clearGroups() {
    this.groups.forEach((g) => g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }));
    this.groups.clear();
  }

  /** rows: [[cell, cell, ...], ...]；cell = {con, mat, pose, size, ground, zoom, cap, glass, clip}
   *  align: 'center'（同行居中对齐）或 'bottom'（同行基线对齐 —— 尺寸梯用，否则
   *  240 与 64 并排时说明文字会各自错开一大截） */
  layout(rows, { gap = 12, capH = 30, align = 'center' } = {}) {
    const widthOf = (r) => r.reduce((a, c) => a + c.size, 0) + gap * (r.length - 1);
    this.W = Math.max(...rows.map(widthOf));
    let y = 0;
    this.cells = [];
    for (const row of rows) {
      const h = Math.max(...row.map((c) => c.size));
      const w = widthOf(row);
      let x = Math.round((this.W - w) / 2);
      for (const c of row) {
        const off = align === 'bottom' ? h - c.size : Math.round((h - c.size) / 2);
        const cell = { ...c, x, y: y + off };
        this.cells.push(cell);
        x += c.size + gap;
      }
      y += h + (row.some((c) => c.cap) ? capH : gap);
    }
    this.H = y;

    /* 画布 + 每格的地面块 + 说明 */
    this.wrapper.style.width = `${this.W}px`;
    this.wrapper.style.height = `${this.H}px`;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.renderer.setSize(this.W, this.H, false);

    this.wrapper.querySelectorAll('.tile, .cap, .fx').forEach((el) => el.remove());
    for (const c of this.cells) {
      const d = document.createElement('div');
      d.className = 'tile';
      d.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.size}px;height:${c.size}px;background:${
        c.ground === 'deep' ? '#2a2b38' : '#f0f3f6'
      }`;
      this.wrapper.appendChild(d);
      /* 磨砂玻璃压在星上（照 Toolstar 的玻璃卡做法） */
      if (c.glass) {
        const f = document.createElement('div');
        f.className = 'fx fx-glass';
        f.style.cssText = `left:${c.x + c.size * 0.14}px;top:${c.y + c.size * 0.52}px;width:${
          c.size * 0.72
        }px;height:${c.size * 0.44}px`;
        this.wrapper.appendChild(f);
      }
      /* 被页面边裁掉一截：底部渐隐的遮罩 */
      if (c.clip) {
        const f = document.createElement('div');
        f.className = 'fx fx-clip';
        f.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.size}px;height:${c.size}px`;
        this.wrapper.appendChild(f);
      }
      if (c.cap) {
        const s = document.createElement('span');
        s.className = 'cap';
        s.style.cssText = `left:${c.x}px;top:${c.y + c.size + 7}px;width:${c.size}px`;
        s.innerHTML = c.cap + (c.sub ? `<em>${c.sub}</em>` : '');
        this.wrapper.appendChild(s);
      }
    }
    this.paint();
    return this;
  }

  paint() {
    const r = this.renderer;
    r.setScissorTest(true);
    for (const c of this.cells) {
      const gy = this.H - c.y - c.size;
      r.setViewport(c.x, gy, c.size, c.size);
      r.setScissor(c.x, gy, c.size, c.size);
      r.setClearColor(c.ground === 'deep' ? DEEP_BG : PAGE_BG, 1);
      r.clear();
      this.paintInto(c);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, this.W, this.H);
  }

  /** 把一格画进当前 viewport（灯与相机都在构造时定好，这里只换物体与材质） */
  paintInto(c) {
    this.holder.clear();
    const g = this.group(c.con);
    g.quaternion.copy(poseQuaternion(c.pose.k, c.pose.steps, this.axis));
    const mats = this.materialsFor(c.mat, c.con);
    g.traverse((o) => { if (o.isMesh) o.material = mats; });
    this.holder.add(g);
    this.camera.position.set(0, 0, CAM_DIST / (c.zoom || 1));
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 只让第一格活起来（拆解那一排的第一张）。其余格保持静帧。
   * 时钟是离散的 setTimeout 链，不占 rAF —— 格与格之间画面完全不动。
   */
  startLive({ con, mat, ground = 'light', steps = 12, holdMs = 110, size } = {}) {
    const c = size ? this.cells.find((x) => x.size === size) : this.cells[0];
    if (!c) return null;
    Object.assign(c, { con, mat, ground });
    const clock = new Clock(this, c, { steps, holdMs });
    clock.start();
    this.clock = clock;
    return clock;
  }

  /**
   * 覆盖自检：逐格读回像素，和该格地面色比。
   * 判据必须是「与地面色的差」，不能是 alpha —— 地面本身是 alpha 1，
   * 而 x 光档的半透明像素 alpha 又可能很低，两种都会骗人。
   */
  probe() {
    this.paint();
    const gl = this.renderer.getContext();
    const W = this.renderer.domElement.width;
    const H = this.renderer.domElement.height;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = [];
    for (const c of this.cells) {
      const bg = c.ground === 'deep' ? [42, 43, 56] : [240, 243, 246];
      const x0 = Math.round(c.x * DPR);
      const y0 = H - Math.round((c.y + c.size) * DPR);
      const s = Math.round(c.size * DPR);
      let lit = 0;
      let peak = 0;
      for (let y = y0; y < y0 + s; y++) {
        for (let x = x0; x < x0 + s; x++) {
          const i = (y * W + x) * 4;
          const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
          if (d > 10) lit++;
          if (d > peak) peak = d;
        }
      }
      out.push({
        con: c.con,
        mat: c.mat,
        ground: c.ground,
        size: c.size,
        coverage: +(lit / (s * s)).toFixed(3),
        contrast: peak,
      });
    }
    this.paint();
    return out;
  }

  /** 剪影：把某一格渲成「这里有没有物体」的位图，用来算相邻姿态的 IoU */
  silhouette(cell) {
    const tmp = { ...cell, ground: 'light' };
    this.paintOne(tmp);
    const gl = this.renderer.getContext();
    const s = Math.round(cell.size * DPR);
    const x0 = Math.round(cell.x * DPR);
    const y0 = this.renderer.domElement.height - Math.round((cell.y + cell.size) * DPR);
    const px = new Uint8Array(s * s * 4);
    gl.readPixels(x0, y0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const mask = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) {
      const d =
        Math.abs(px[i * 4] - 240) + Math.abs(px[i * 4 + 1] - 243) + Math.abs(px[i * 4 + 2] - 246);
      mask[i] = d > 10 ? 1 : 0;
    }
    return mask;
  }

  paintOne(c) {
    const r = this.renderer;
    const gy = this.H - c.y - c.size;
    r.setScissorTest(true);
    r.setViewport(c.x, gy, c.size, c.size);
    r.setScissor(c.x, gy, c.size, c.size);
    r.setClearColor(c.ground === 'deep' ? DEEP_BG : PAGE_BG, 1);
    r.clear();
    this.paintInto(c);
  }

  dispose() {
    this.groups.forEach((g) => g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }));
    this.matCache.forEach((arr) => arr.forEach((m) => m.dispose()));
    this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ─────────────────────────────────────────────────────────────
   六、姿态离散度：相邻格的剪影 IoU
   ───────────────────────────────────────────────────────────── */

function iou(a, b) {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/**
 * 一整圈里相邻两格有多像（越小越分得开），以及整圈里最像的一对（重复度）。
 * 这是「12 步是不是真的买到 12 个姿态」的判据，不是观感。
 */
export function poseSpread(board, { con, mat = 'edge', size = 200, steps = 12 } = {}) {
  /* 借用第一格的位置画（大小也照第一格，避免读回出界） */
  const base = { ...board.cells[0] };
  const masks = [];
  for (let k = 0; k < steps; k++) {
    masks.push(board.silhouette({ ...base, con, mat, ground: 'light', pose: { k, steps } }));
  }
  board.paint();
  const adj = [];
  for (let k = 0; k < steps; k++) adj.push(iou(masks[k], masks[(k + 1) % steps]));
  /* ⚠ 初值必须是 -1，不能是 1。
     写 1 的时候，只要没有任何一对 IoU 超过 1（本来也不可能超过），
     worst 就永远停在 1，于是「重复度」那一栏永远读出 1.000 —— 一个不存在的结论。
     第一版就是这样：六种构造 × 两种步数，十二行全是 dup=1，pair 全空。
     读数自检骗过自己一次，记在这里。 */
  let worst = -1;
  let pair = null;
  for (let i = 0; i < steps; i++) {
    for (let j = i + 1; j < steps; j++) {
      const v = iou(masks[i], masks[j]);
      if (v > worst) { worst = v; pair = [i, j]; }
    }
  }
  const cov = masks.map((m) => +(m.reduce((a, b) => a + b, 0) / m.length).toFixed(4));
  const adjMean = +(adj.reduce((a, b) => a + b, 0) / adj.length).toFixed(3);
  return {
    steps,
    adjMean,
    adj: adj.map((v) => +v.toFixed(2)),
    samePair: pair,
    sameIou: +worst.toFixed(3),
    coverage: cov,
  };
}

/* ─────────────────────────────────────────────────────────────
   七、定格驱动
   ─────────────────────────────────────────────────────────────
   不用 rAF。每一格画一次，下一次唤醒按「这一格还剩多久」排。
   同样的时钟也能推出「现在该是第几格」，所以标签页被藏起来再回来不会错格。
   ───────────────────────────────────────────────────────────────────────── */

export class Clock {
  constructor(board, cell, { steps = 12, holdMs = 110, onChange } = {}) {
    this.board = board;
    this.cell = cell;
    this.steps = steps;
    this.holdMs = holdMs;
    this.onChange = onChange;
    this.running = false;
    this.timer = 0;
    this.t0 = 0;
    this.k = 0;
  }

  paintAt(k) {
    this.k = k;
    this.cell.pose = { k, steps: this.steps };
    this.board.paintOne(this.cell);
    this.onChange?.(k);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    const tick = () => {
      if (!this.running) return;
      const s = schedule(this.steps, this.holdMs);
      const t = performance.now() - this.t0;
      const { k, left } = stepAt(s, t);
      if (k !== this.k) this.paintAt(k);
      this.timer = setTimeout(tick, Math.max(8, left + 6));
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
  }

  /** 页藏起来就停：回来时按时钟重推，不会错格 */
  bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  setSteps(steps) {
    this.steps = steps;
    this.paintAt(Math.min(this.k, steps - 1));
  }

  setHold(holdMs) {
    this.holdMs = holdMs;
    if (this.running) { this.stop(); this.start(); }
  }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 每个构造 × 每档材质：用 EXP_disjoint_timer_query 量真实 GPU 时间。
 *
 * ⚠ 为什么不用 wall-clock 计时。
 * 第一版取平均、第二版取中位数，两者都不可重复：同一套参数连跑三轮，
 * 18 个格子里有 14 个的读数自己抖超过 2 倍（最大 867 倍，见 .shots/repeat.json）。
 * 原因不是几何贵，是「drawImage → browser → 合成」这段时间里掺了 GC、
 * 页签调度、驱动侧的重编，wall clock 分不开。
 * GPU timer query 只量 GPU 上那一段，且要求 gl.finish() 之后才读，
 * 跨轮抖动落在几个百分之内 —— 这才有资格写进 notes。
 *
 * 尺寸 320、光栅倍率 2，和页面里的格子同一套参数。
 */
export async function measure({ size = 320, samples = 40 } = {}) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(wrap);
  const board = new Board(wrap, { geoOpts: {} });
  board.layout([[{ con: 'tri', mat: 'edge', pose: { k: 2, steps: 12 }, size, ground: 'light' }]]);
  const gl = board.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const rows = [];

  const med = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const pct = (arr, q) => {
    const s = [...arr].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
  };

  /** 一次带 GPU 计时的绘制；返回毫秒，读不到就返回 null */
  const timed = async (cell, k) => {
    if (!ext) return null;
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    board.paintOne({ ...cell, pose: { k, steps: 12 } });
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.finish();
    /* 查询结果是异步可用的，轮询到可用为止（有上限，别把页签卡死） */
    for (let i = 0; i < 240; i++) {
      const done = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (done) {
        const ns = disjoint ? null : gl.getQueryParameter(q, gl.QUERY_RESULT);
        gl.deleteQuery(q);
        return ns == null ? null : ns / 1e6;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    gl.deleteQuery(q);
    return null;
  };

  for (const con of CON_ORDER) {
    for (const mat of ['acrylic', 'edge', 'opaque']) {
      const cell = { ...board.cells[0], con, mat };
      /* 预热：头几帧要编译着色器、上传缓冲，不能算进化价 */
      for (let i = 0; i < 8; i++) board.paintOne({ ...cell, pose: { k: i, steps: 12 } });
      gl.finish();
      await nextFrame();

      const gpuS = [];
      for (let i = 0; i < samples; i++) {
        const v = await timed(cell, i % 12);
        if (v != null) gpuS.push(v);
      }
      const calls = board.renderer.info.render.calls;
      const tris = board.renderer.info.render.triangles;

      rows.push({
        con,
        mat,
        gpu: gpuS.length ? +med(gpuS).toFixed(4) : null,
        gpuP95: gpuS.length ? +pct(gpuS, 0.95).toFixed(3) : null,
        samples: gpuS.length,
        calls,
        tris,
      });
      await nextFrame();
    }
  }

  board.dispose();
  wrap.remove();
  return { rows, size, dpr: DPR, timerQuery: !!ext };
}

/**
 * 尺寸阶梯的代价：同一个构造在 64 / 96 / 144 / 240 上各花多少 GPU 时间。
 *
 * 这个构造是**填充率主导**的（三片大半透明面互相叠加），所以代价应该随像素数
 * 接近线性 —— 若实测远不是线性，说明瓶颈在别处（比如双面透明材质的分层）。
 * 用同一支 GPU timer query，避免 wall clock 的抖动。
 */
export async function measureSizes({ cons = ['tri', 'frame', 'shell'], sizes = [64, 96, 144, 240], samp = 24 } = {}) {
  const out = [];
  for (const size of sizes) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
    document.body.appendChild(wrap);
    const board = new Board(wrap, { geoOpts: {} });
    board.layout([[{ con: cons[0], mat: 'edge', pose: { k: 2, steps: 12 }, size, ground: 'light' }]]);
    const gl = board.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');

    for (const con of cons) {
      const cell = { ...board.cells[0], con, mat: 'edge' };
      for (let i = 0; i < 6; i++) board.paintOne({ ...cell, pose: { k: i, steps: 12 } });
      gl.finish();
      await nextFrame();
      const vals = [];
      if (ext) {
        for (let i = 0; i < samp; i++) {
          const q = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          board.paintOne({ ...cell, pose: { k: i % 12, steps: 12 } });
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.finish();
          for (let k = 0; k < 240; k++) {
            if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
                vals.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
              }
              break;
            }
            await new Promise((r) => setTimeout(r, 0));
          }
          gl.deleteQuery(q);
        }
      }
      vals.sort((a, b) => a - b);
      out.push({
        size, con,
        gpu: vals.length ? +vals[Math.floor(vals.length / 2)].toFixed(4) : null,
        pixels: (size * DPR) ** 2,
        samples: vals.length,
      });
    }
    board.dispose();
    wrap.remove();
    await nextFrame();
  }
  return out;
}