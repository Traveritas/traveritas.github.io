/* ─────────────────────────────────────────────────────────────
   六芒 · 花相 —— 六重生长之形（原型）

   上一次的失败：六根针沿 ±x ±y ±z 伸出（八面体对称）。在任意角度看，
   它投影成一个含混的多刺球体，没有任何一个面朝向观者 —— 问题出在几何本身，
   不在材质、不在光。这一稿换掉的是「六根轴」这个前提：

     六重的形不一定是「六个方向各有一支」，也可以是「一株六次生长的东西」。

   所以这里的候选全部从生长里来：花瓣、雪片、半成的冰晶、六瓣环、
   霜壳、透镜叶。它们的共同点是**有一个面**（花心 / 冰晶的面 / 环的内侧），
   观者总能看到一个面，而不是被六根刺指着。

   材质：白底 #f0f3f6 上的磨砂树脂。三条硬规矩（见笔记）：
     · transmission 一律不用（star-crystal 实测：非零即全价，且透明画布上塌成死白）
     · 明暗只能来自程序化环境贴图 —— 地平线亮、地面压暗
     · 剪影靠「暗的发丝边」交代：掠射角处 body 压向 --umber、alpha 提到接近 1

   运动：定格。姿态量化到 360/steps 的格子，每格保持 holdMs 静止；
   一整轮之后那一格 ×3.2（同 brand.ts 的「7 步轮转 + 3 秒停歇」）。
   因为是离散姿态，用 setTimeout 链而不是 rAF。

   一切尺寸按 CSS px 喂，DPR 封顶 2。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const BREATH = 3.2;

export const PAGE_BG = 0xf0f3f6;
export const DARK_BG = 0x2a2b38;

/* 站点令牌（照抄 src/styles/tokens.css） */
const C_UMBER = 0x4f4a66;
const C_DREAM = 0x9389ae;
const C_WAKE = 0xa7b1ba;
const C_AMBER = 0x9a86c4;

/* ── 小工具 ──────────────────────────────────────────────── */

const lerp = (a, b, t) => a + (b - a) * t;

/** 确定性随机：同一 seed 每次都长成同一个样子 */
function prng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 六角星波形，0..1，n 个尖：θ 每隔 2π/n 回到 1 */
function starWave(theta, n) {
  return Math.pow(Math.abs(Math.cos((n * theta) / 2)), 1);
}

/** 带锐度的星形波形：sharp>1 尖更锐，<1 更圆 */
const starWaveP = (theta, n, sharp) => Math.pow(Math.abs(Math.cos((n * theta) / 2)), sharp);

/** 极淡的站点色阶：近白兑一点 --wake / --dream */
const pale = (hex, t) => new THREE.Color(0xf3f6f9).lerp(new THREE.Color(hex), t);

/* ── 累面器：按指定外向参考决定绕序 ─────────────────────────
   每个三角面都拿一个「外向参考向量」判一下绕序，
   所以哪块面朝外是确定的，不靠手算索引顺序。 */
class Surf {
  constructor() {
    this.pts = [];
    this.idx = [];
    this.flatPos = null;
  }
  add(p) {
    this.pts.push(p);
    return this.pts.length - 1;
  }
  _order(a, b, c, outN) {
    const A = this.pts[a];
    const B = this.pts[b];
    const C = this.pts[c];
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    return n.dot(outN) < 0;
  }
  tri(a, b, c, outN) {
    if (this._order(a, b, c, outN)) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }
  quad(a, b, c, d, outN) {
    if (this._order(a, b, c, outN)) this.idx.push(a, c, b, a, d, c);
    else this.idx.push(a, b, c, a, c, d);
  }
  build({ flat = false } = {}) {
    const g = new THREE.BufferGeometry();
    if (flat) {
      const arr = new Float32Array(this.idx.length * 3);
      for (let i = 0; i < this.idx.length; i++) {
        const p = this.pts[this.idx[i]];
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    } else {
      const arr = new Float32Array(this.pts.length * 3);
      this.pts.forEach((p, i) => {
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      });
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.setIndex(this.idx);
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 通用参数曲面 → 薄壳。
 * fn(u,v) 给点；orient(u,v) 给「这一侧应该朝哪边」的参考，法线据此定向。
 * thickness>0 时做出有厚度的闭合薄壳（上下两面 + 一圈边），
 * 边是这个材质最要紧的地方：掠射角上一道细边，白底上的剪影就靠它。
 */
function sheet(fn, nu, nv, opts = {}) {
  const {
    thickness = 0,
    closedV = false,
    orient = () => new THREE.Vector3(0, 1, 0),
    flat = false,
  } = opts;

  const cols = closedV ? nv : nv + 1;
  const P = [];
  for (let i = 0; i <= nu; i++) {
    const row = [];
    for (let j = 0; j <= nv; j++) row.push(fn(i / nu, j / nv, i, j));
    P.push(row);
  }
  const at = (i, j) => {
    const ii = Math.min(Math.max(i, 0), nu);
    let jj = j;
    if (closedV) jj = ((j % nv) + nv) % nv;
    else jj = Math.min(Math.max(j, 0), nv);
    return P[ii][jj];
  };
  const nrm = (i, j) => {
    const du = new THREE.Vector3().subVectors(at(i + 1, j), at(i - 1, j));
    const dv = new THREE.Vector3().subVectors(at(i, j + 1), at(i, j - 1));
    const n = new THREE.Vector3().crossVectors(du, dv);
    if (n.lengthSq() < 1e-14) return orient(i / nu, j / nv).clone().normalize();
    n.normalize();
    if (n.dot(orient(i / nu, j / nv)) < 0) n.negate();
    return n;
  };
  const N = [];
  for (let i = 0; i <= nu; i++) {
    const row = [];
    for (let j = 0; j <= nv; j++) row.push(nrm(i, j));
    N.push(row);
  }

  const s = new Surf();
  const h = thickness / 2;

  /* 上下面 */
  const top = [];
  const bot = [];
  for (let i = 0; i <= nu; i++) {
    const rt = [];
    const rb = [];
    for (let j = 0; j <= nv; j++) {
      const p = P[i][j];
      const n = N[i][j];
      rt.push(s.add(new THREE.Vector3().copy(p).addScaledVector(n, h)));
      rb.push(s.add(new THREE.Vector3().copy(p).addScaledVector(n, -h)));
    }
    top.push(rt);
    bot.push(rb);
  }
  const nAt = (i, j) => N[Math.min(i, nu)][Math.min(j, nv)];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const ref = nAt(i, j).clone().add(nAt(i + 1, j)).add(nAt(i, j + 1)).add(nAt(i + 1, j + 1)).normalize();
      s.quad(top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1], ref);
      s.quad(bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1], ref.clone().negate());
    }
  }

  /* 一圈边：沿边界走一遍，把上下两片缝起来 */
  if (thickness > 0) {
    const loop = [];
    if (closedV) {
      /* 闭合的环域：外缘正走一圈，内缘倒走一圈，首尾相接 */
      for (let j = 0; j < nv; j++) loop.push([nu, j]);
      for (let j = nv - 1; j >= 0; j--) loop.push([0, j]);
      loop.push(loop[0]);
    } else {
      for (let i = 0; i <= nu; i++) loop.push([i, 0]);
      for (let j = 1; j <= nv; j++) loop.push([nu, j]);
      for (let i = nu - 1; i >= 0; i--) loop.push([i, nv]);
      for (let j = nv - 1; j >= 1; j--) loop.push([0, j]);
      loop.push(loop[0]);
    }
    const centre = new THREE.Vector3();
    P.forEach((row) => row.forEach((p) => centre.add(p)));
    centre.multiplyScalar(1 / ((nu + 1) * (nv + 1)));
    for (let k = 0; k < loop.length - 1; k++) {
      const [i0, j0] = loop[k];
      const [i1, j1] = loop[k + 1];
      const a = top[i0][j0];
      const b = top[i1][j1];
      const c = bot[i1][j1];
      const d = bot[i0][j0];
      const mid = new THREE.Vector3().copy(P[i0][j0]).add(P[i1][j1]).multiplyScalar(0.5).sub(centre);
      if (mid.lengthSq() < 1e-12) mid.set(0, 1, 0);
      s.quad(a, b, c, d, mid.normalize());
    }
  }
  return s.build({ flat });
}

/* ── 花瓣：有厚度、有开合轴的曲面壳 ───────────────────────── */

/**
 * 花瓣壳。基点在 (baseR,0,0)，沿 +x 伸出，中线先上扬再外翻（百合式的翻瓣）。
 * @param {object} o
 * @param {number} o.length    瓣长
 * @param {number} o.width     最宽处的半宽
 * @param {number} o.lift0     基部的抬角（度）
 * @param {number} o.lift1     尖端的抬角（度，负值＝外翻下垂）
 * @param {number} o.bow       横截面的碗形（正＝中线向外鼓，两侧向后收）
 * @param {number} o.twist     沿瓣长的扭转（度）
 * @param {number} o.thickness 壳厚 —— 这个数决定边有多亮
 */
function petalGeometry(o = {}) {
  const {
    length = 1,
    width = 0.42,
    baseR = 0.07,
    lift0 = 62,
    lift1 = -14,
    bow = 0.36,
    curl = 0.16,
    twist = 12,
    thickness = 0.022,
    wave = 0.03,
    nu = 18,
    nv = 8,
    seed = 1,
  } = o;
  const rnd = prng(seed);

  const mid = [];
  const tan = [];
  const lat = [];
  const nor = [];
  const ang = (u) => lerp(lift0, lift1, Math.pow(u, 0.82)) * DEG;
  const ds = length / nu;
  let x = baseR;
  let y = 0;
  mid.push(new THREE.Vector3(x, y, 0));
  for (let i = 1; i <= nu; i++) {
    const am = ang((i - 0.5) / nu);
    x += Math.cos(am) * ds;
    y += Math.sin(am) * ds;
    mid.push(new THREE.Vector3(x, y, 0));
  }
  for (let i = 0; i <= nu; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(mid[1], mid[0]);
    else if (i === nu) t.subVectors(mid[nu], mid[nu - 1]);
    else t.subVectors(mid[i + 1], mid[i - 1]);
    t.normalize();
    const u = i / nu;
    const L = new THREE.Vector3(0, 0, 1).applyAxisAngle(t, twist * DEG * Math.pow(u, 1.3));
    const N = new THREE.Vector3().crossVectors(L, t).normalize();
    tan.push(t);
    lat.push(L);
    nor.push(N);
  }
  const phase = rnd() * Math.PI * 2;
  /* 瓣形：基部窄、中段最宽、尖端收成一点 —— 但不能收到零，
     收成零会让尖端那一圈顶点的法线散开，边上出现脏噪。
     所以留一线宽，靠 alpha 与那道边收口。 */
  const widthAt = (u) => {
    /* 0.36 处最宽，之后沿一条凹坡收到尖端：百合的瓣不是椭圆，
       但收得太直会变成三角星（第一版就是这样），所以用 ^0.85 让中段多留一点肉。 */
    const rise = Math.min(1, u / 0.36);
    const fall = Math.max(0, (u - 0.36) / 0.64);
    let w = Math.sin((rise * Math.PI) / 2) * Math.pow(1 - fall, 0.85);
    w *= 1 + wave * Math.sin(u * 7.5 + phase);
    return Math.max(width * w, width * 0.030);
  };

  /* 横截面。第一版用 vv² 的碗形，六片读成六个枕头 —— 太平、太鼓、没有龙骨。
     第二版把龙骨做过头，六片又成了六把折扇。现在取中间：
     中央一条脊、两侧落到沟，深度约瓣宽的 1/4，边缘再极轻地翻起一线。 */
  const profile = (vv) => {
    const ridge = Math.cos(Math.PI * vv); /* 中心 +1 → 边缘 -1 */
    const lip = Math.pow(Math.abs(vv), 5) * 0.55; /* 边缘的一线翻起 */
    return ridge + lip;
  };

  const fn = (u, v) => {
    const i = Math.round(u * nu);
    const vv = v * 2 - 1;
    const w = widthAt(u);
    const p = new THREE.Vector3().copy(mid[i]);
    p.addScaledVector(lat[i], vv * w);
    /* 脊与沟 */
    p.addScaledVector(nor[i], bow * w * (profile(vv) - 1));
    /* 边缘向内抱：两侧不是平的，而是微微卷向花心，光在瓣面上会拐弯 */
    p.addScaledVector(nor[i], curl * w * Math.pow(Math.abs(vv), 3));
    return p;
  };
  const orient = (u) => {
    const i = Math.round(u * nu);
    return nor[i];
  };
  return sheet(fn, nu, nv, { thickness, orient });
}

/** 六片花瓣 + 一颗小核 */
function buildFlower(opts = {}) {
  const {
    count = 6,
    petal = {},
    jitter = 0.14,
    seed = 7,
    coreSize = 0.085,
  } = opts;
  const rnd = prng(seed);
  const group = new THREE.Group();
  const parts = { hinges: [], arms: [] };
  const geos = [];
  const N = count;

  for (let i = 0; i < N; i++) {
    const alt = i % 2 === 0 ? 1 : -1;
    const jL = 1 + (rnd() - 0.5) * jitter * 2;
    const jW = 1 + (rnd() - 0.5) * jitter * 2;
    const jLift = (rnd() - 0.5) * jitter * 46;
    const jTwist = (rnd() - 0.5) * jitter * 60;
    const g = petalGeometry({
      length: petal.length * jL * (alt > 0 ? 1 : 0.9),
      width: petal.width * jW * (alt > 0 ? 1 : 1.08),
      baseR: petal.baseR,
      lift0: petal.lift0 + jLift + (alt > 0 ? 0 : 7),
      lift1: petal.lift1 + jLift * 0.6,
      bow: petal.bow * (1 + (rnd() - 0.5) * 0.5),
      twist: petal.twist + jTwist,
      thickness: petal.thickness,
      wave: petal.wave,
      seed: seed + i * 31,
    });
    geos.push(g);
    const holder = new THREE.Group();
    holder.rotation.y = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.10;
    const mesh = new THREE.Mesh(g);
    mesh.userData.role = 'petal';
    mesh.userData.openAxis = 'z';
    mesh.userData.lift0 = petal.lift0 * DEG;
    holder.add(mesh);
    group.add(holder);
    parts.hinges.push({ mesh, phase: (i / N) * Math.PI * 2 });
  }

  /* 小核：六棱的低面数球，晶体的一点芯 */
  const core = new THREE.Mesh(new THREE.SphereGeometry(coreSize, 6, 4), null);
  core.rotation.y = 12 * DEG;
  core.userData.role = 'core';
  group.add(core);
  parts.core = core;

  return { group, parts, geos };
}

/* ── 透镜叶：闭合的薄壳，两轮三片合成一朵未开的花 ──────────── */

function lensGeometry(o = {}) {
  const {
    length = 1,
    width = 0.24,
    thick = 0.085,
    baseR = 0.045,
    lift0 = 74,
    lift1 = 26,
    bend = 0.18,
    nu = 16,
    nv = 14,
    seed = 3,
  } = o;
  const rnd = prng(seed);
  const ang = (u) => lerp(lift0, lift1, u) * DEG;
  const ds = length / nu;
  const mid = [];
  let x = baseR;
  let y = 0;
  mid.push(new THREE.Vector3(x, y, 0));
  for (let i = 1; i <= nu; i++) {
    const am = ang((i - 0.5) / nu);
    x += Math.cos(am) * ds;
    y += Math.sin(am) * ds;
    mid.push(new THREE.Vector3(x, y, 0));
  }
  const tan = [];
  const lat = [];
  const nor = [];
  for (let i = 0; i <= nu; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(mid[1], mid[0]);
    else if (i === nu) t.subVectors(mid[nu], mid[nu - 1]);
    else t.subVectors(mid[i + 1], mid[i - 1]);
    t.normalize();
    const L = new THREE.Vector3(0, 0, 1).applyAxisAngle(t, (rnd() - 0.5) * 6 * DEG);
    const N = new THREE.Vector3().crossVectors(L, t).normalize();
    tan.push(t);
    lat.push(L);
    nor.push(N);
  }
  const wAt = (u) => {
    const s = Math.sin(Math.PI * Math.pow(u, 0.62));
    const t = Math.sin(Math.PI * Math.pow(u, 0.85));
    return {
      /* 两端各留一线宽度：收成绝对的零会让顶点法线在那儿散开 */
      w: Math.max(width * Math.pow(Math.max(s, 0), 0.72), width * 0.004),
      d: Math.max(thick * Math.pow(Math.max(t, 0), 0.8), thick * 0.006),
    };
  };
  const fn = (u, v) => {
    const i = Math.round(u * nu);
    const a = v * Math.PI * 2;
    const { w, d } = wAt(u);
    const p = new THREE.Vector3().copy(mid[i]);
    p.addScaledVector(lat[i], Math.cos(a) * w);
    p.addScaledVector(nor[i], Math.sin(a) * d);
    /* 叶身一点点横向弯：不是直槽，弧面才吃得到光 */
    p.addScaledVector(nor[i], bend * w * Math.cos(a) * Math.cos(a));
    return p;
  };
  const orient = (u, v) => {
    const i = Math.round(u * nu);
    const a = v * Math.PI * 2;
    return new THREE.Vector3()
      .copy(lat[i])
      .multiplyScalar(Math.cos(a))
      .addScaledVector(nor[i], Math.sin(a));
  };
  return sheet(fn, nu, nv, { closedV: true, orient });
}

/** 两轮三片：3 片外、3 片内，错 60°，一朵还没开的花 */
function buildLensBud(opts = {}) {
  const { seed = 11, jitter = 0.12 } = opts;
  const rnd = prng(seed);
  const group = new THREE.Group();
  const parts = { hinges: [], arms: [] };
  const geos = [];
  const rings = [
    { n: 3, off: 0, lift0: 68, lift1: 14, len: 0.98, wid: 0.235, tilt: 0 },
    { n: 3, off: Math.PI / 3, lift0: 78, lift1: 30, len: 0.82, wid: 0.19, tilt: 0.03 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const jLift = (rnd() - 0.5) * jitter * 60;
      const g = lensGeometry({
        length: ring.len * (1 + (rnd() - 0.5) * jitter * 2),
        width: ring.wid * (1 + (rnd() - 0.5) * jitter * 2),
        thick: 0.075 * (1 + (rnd() - 0.5) * 0.3),
        lift0: ring.lift0 + jLift,
        lift1: ring.lift1 + jLift * 0.5,
        bend: 0.2 * (rnd() > 0.5 ? 1 : -0.7),
        seed: seed + geos.length * 17,
      });
      geos.push(g);
      const holder = new THREE.Group();
      holder.rotation.y = ring.off + (i / ring.n) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
      holder.position.y = ring.tilt;
      const mesh = new THREE.Mesh(g);
      mesh.userData.role = 'petal';
      mesh.userData.lift0 = ring.lift0 * DEG;
      holder.add(mesh);
      group.add(holder);
      parts.hinges.push({ mesh, phase: (i / ring.n) * Math.PI * 2 });
    }
  }
  return { group, parts, geos };
}

/* ── 薄板：多边形沿 Y 挤出（雪片 / 冰晶的构件）───────────────
   ExtrudeGeometry 自己算外向法线，但要求多边形逆时针 —— 这里统一校正。 */

function plate(poly2D, t, { y = 0, rotY = 0 } = {}) {
  const pts = poly2D.map(([x, z]) => [x, z]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    area += x0 * z1 - x1 * z0;
  }
  if (area < 0) pts.reverse();
  /* shape 在 (x,y) 平面，y 取 -z；挤出后 rotateX(-90°) 把 y 摆成世界 z */
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  if (rotY) g.rotateY(rotY);
  g.deleteAttribute('uv');
  return g;
}

const at = (pts, a, b) => pts.map(([pa, pb]) => [pa, pb]);

/** 一支臂的多边形（局部坐标：a 沿臂，b 沿横） */
function armPoly({ a0 = 0, a1 = 1, w0 = 0.12, w1 = 0.05, tip = 0.08, notch = 0 }) {
  const pts = [];
  if (notch > 0) {
    /* 断口：末端斜切一刀，不是收成尖 —— 冰晶长到一半停下的样子 */
    pts.push([a0, -w0], [a1, -w1], [a1 + notch, -w1 * 0.15], [a1 + notch * 0.4, w1 * 0.8], [a0, w0]);
    return pts;
  }
  pts.push([a0, -w0], [a1, -w1], [a1 + tip, 0], [a1, w1], [a0, w0]);
  return pts;
}

function rot2(pts, ang, ox = 0, oz = 0) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return pts.map(([a, b]) => [ox + a * c - b * s, oz + a * s + b * c]);
}

/* ── 雪片 · A：枝状（dendrite）────────────────────────────── */

function buildFlakeDendrite(opts = {}) {
  const { seed = 21, R = 1, thick = 0.052 } = opts;
  const rnd = prng(seed);
  const parts = [];
  const push = (poly, t, y) => parts.push(plate(poly, t, { y }));

  /* 中心的六边形板 */
  const hex = (r, rot = 0) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = rot + (i / 6) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  push(hex(R * 0.30), thick * 1.35, -thick * 0.675);

  for (let i = 0; i < 6; i++) {
    const base = (i / 6) * Math.PI * 2;
    const wob = (rnd() - 0.5) * 3.2 * DEG;
    const ang = base + wob;
    const L = R * (0.94 + (rnd() - 0.5) * 0.05);
    push(rot2(armPoly({ a0: R * 0.16, a1: L * 0.9, w0: 0.155, w1: 0.055, tip: R * 0.09 }), ang), thick, -thick / 2);

    /* 侧枝：两对，±60°，长度递减 —— 真实雪片的枝是这样的 */
    const spurs = [
      { s: 0.44, len: 0.30, w: 0.042, ts: 0.036 },
      { s: 0.66, len: 0.22, w: 0.034, ts: 0.032 },
    ];
    spurs.forEach((sp, si) => {
      for (const sgn of [-1, 1]) {
        const a = ang + sgn * 60 * DEG + (rnd() - 0.5) * 4 * DEG;
        const ox = Math.cos(ang) * L * sp.s;
        const oz = Math.sin(ang) * L * sp.s;
        push(
          rot2(
            armPoly({
              a0: 0.02,
              a1: L * sp.len,
              w0: sp.w,
              w1: sp.w * 0.45,
              tip: L * sp.len * 0.32,
            }),
            a,
            ox,
            oz,
          ),
          sp.ts,
          -sp.ts / 2 + (si === 0 ? 0.004 : -0.004),
        );
      }
    });

    /* 中脊：一条窄的高台，让枝有厚度而不是一片纸 */
    push(
      rot2(armPoly({ a0: R * 0.2, a1: L * 0.92, w0: 0.028, w1: 0.008, tip: R * 0.05 }), ang),
      thick * 0.75,
      thick / 2,
    );

    /* 枝端的小六角：一点点冰的堆积，也是剪影上的六个亮点 */
    push(hex(R * 0.055, ang), thick * 0.9, -thick * 0.45);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g);
  mesh.userData.role = 'petal';
  group.add(mesh);
  return { group, parts: { hinges: [], arms: [] }, geo: g };
}

/* ── 雪片 · B：带齿的板（sectored plate）──────────────────── */

function buildFlakePlate(opts = {}) {
  const { seed = 33, R = 1, thick = 0.05 } = opts;
  const rnd = prng(seed);
  const parts = [];
  const push = (poly, t, y) => parts.push(plate(poly, t, { y }));
  const hex = (r, rot = 0) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = rot + (i / 6) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });

  /* 一片大的中心板，六条棱脊从中心放射出去 */
  push(hex(R * 0.52, 0), thick, -thick / 2);

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + (rnd() - 0.5) * 2.4 * DEG;
    const L = R * (0.96 + (rnd() - 0.5) * 0.04);
    push(rot2(armPoly({ a0: R * 0.4, a1: L * 0.93, w0: 0.20, w1: 0.075, tip: R * 0.07 }), ang), thick * 0.86, -thick * 0.43);
    /* 三对短齿，从主枝两侧斜出一小截 */
    [0.3, 0.52, 0.72].forEach((s, si) => {
      for (const sgn of [-1, 1]) {
        const a = ang + sgn * 62 * DEG;
        const ox = Math.cos(ang) * L * s;
        const oz = Math.sin(ang) * L * s;
        const len = L * (0.26 - si * 0.05);
        push(rot2(armPoly({ a0: 0.01, a1: len, w0: 0.05, w1: 0.02, tip: len * 0.35 }), a, ox, oz), thick * 0.62, -thick * 0.31);
      }
    });
    /* 脊 */
    push(rot2(armPoly({ a0: R * 0.05, a1: L * 0.95, w0: 0.045, w1: 0.012, tip: R * 0.04 }), ang), thick * 0.7, thick / 2);
    /* 尖端一小块六角板 */
    push(hex(R * 0.085, ang), thick * 1.1, -thick * 0.55);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g));
  return { group, parts: { hinges: [], arms: [] }, geo: g };
}

/* ── 冰晶生长：一根六棱柱，六条臂从它的六条竖棱上长出去 ───────
   刻意不齐：一长、一短、一截断、一条只冒了个头。
   「重复但不规律」这句是文档里写明的偏好。
   第一版把臂摆在柱子的中截面、又让柱子在原点，结果整枚读成一片
   躺着的星 —— 柱子在俯视里被臂盖掉了。现在柱子立起来、有高度，
   臂从竖棱上略微上扬地伸出去，俯视时有厚度，侧视时成柱。 */

function buildGrowth(opts = {}) {
  const { seed = 5, R = 0.62, thick = 0.05 } = opts;
  const rnd = prng(seed);
  const group = new THREE.Group();
  const parts = { hinges: [], arms: [] };

  /* 六棱柱：立着，六条竖棱正对六个方向 */
  const prismH = 0.78;
  const prismR = 0.20;
  const pg = new THREE.CylinderGeometry(prismR * 0.90, prismR, prismH, 6, 1, false);
  pg.rotateY(Math.PI / 6);
  const prism = new THREE.Mesh(pg, null);
  prism.userData.role = 'prism';
  group.add(prism);
  parts.prism = prism;

  /* 柱顶与柱底各叠一层更薄的六角板：读成冰的分层，而不是一根管子 */
  const capPoly = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return [Math.cos(a) * prismR * 1.06, Math.sin(a) * prismR * 1.06];
  });
  const cap = new THREE.Mesh(plate(capPoly, thick * 0.7), null);
  cap.position.y = prismH / 2 + thick * 0.7;
  cap.userData.role = 'cap';
  group.add(cap);
  parts.cap = cap;

  const base = new THREE.Mesh(plate(capPoly, thick * 0.7), null);
  base.position.y = -prismH / 2;
  base.userData.role = 'cap';
  group.add(base);
  parts.base = base;

  /* 六条臂：从六条竖棱的中段伸出，略微上扬 */
  const arms = [
    { len: 1.00, w: 0.075, wob: 1.4, broken: 0, tilt: 6 },
    { len: 0.72, w: 0.062, wob: -2.6, broken: 0, tilt: 9 },
    { len: 0.34, w: 0.050, wob: 3.4, broken: 0, tilt: 4 },
    { len: 0.58, w: 0.060, wob: -1.2, broken: 1, tilt: 7 },
    { len: 0.13, w: 0.042, wob: 5.0, broken: 0, tilt: -3 },
    { len: 0.64, w: 0.058, wob: 2.2, broken: 0, tilt: 5 },
  ];
  /* 臂的挂法：三级 —— pivot 绕竖轴转到该去的方向；tiltSleeve 绕 z 抬起；
   几何本身沿 +x 长。生长动画只动最里面那片的 scale.x，所以方向不会被搅乱。 */
  const hangArm = (g, ang, tilt, lift) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = -ang;
    const sleeve = new THREE.Group();
    sleeve.rotation.z = tilt;
    sleeve.position.y = lift;
    const mesh = new THREE.Mesh(g, null);
    mesh.userData.role = 'arm';
    mesh.userData.ang = ang;
    sleeve.add(mesh);
    pivot.add(sleeve);
    group.add(pivot);
    return { pivot, sleeve, mesh };
  };

  arms.forEach((a, i) => {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6 + a.wob * DEG;
    const L = R * 1.55 * a.len;
    const poly = armPoly({
      a0: prismR * 0.7,
      a1: L,
      w0: a.w * 1.7,
      w1: a.w * 0.55,
      tip: L * 0.17,
      notch: a.broken ? L * 0.11 : 0,
    });
    const g = plate(poly, thick, { y: 0 });
    const { mesh } = hangArm(g, ang, a.tilt * DEG, 0);
    mesh.userData.len = L;
    parts.arms.push({
      mesh,
      len: L,
      phase: (i / 6) * Math.PI * 2,
      delay: i * 0.11,
    });
  });

  /* 上排：错开 30° 的一圈更短的臂，一根歪的 —— 像冰在长第二排 */
  const upper = [
    { len: 0.34, w: 0.05, off: 0, tilt: 18 },
    { len: 0.22, w: 0.042, off: 1, tilt: 26 },
    { len: 0.28, w: 0.046, off: 3, tilt: 10 },
  ];
  upper.forEach((u, i) => {
    const ang = (u.off / 6) * Math.PI * 2 + Math.PI / 6 + 30 * DEG;
    const L = R * 1.55 * u.len;
    const poly = armPoly({ a0: prismR * 0.6, a1: L, w0: u.w * 1.6, w1: u.w * 0.5, tip: L * 0.2 });
    const g = plate(poly, thick * 0.8, { y: 0 });
    const { mesh } = hangArm(g, ang, u.tilt * DEG, prismH * 0.26);
    parts.arms.push({ mesh, len: L, phase: ang, delay: 0.5 + i * 0.07 });
  });

  return { group, parts };
}

/* ── 星形环面：六角星的截面扫成环，六条脊绕一圈 ─────────────
   截面不是圆管，是一片六角星形的板（六个尖、六个凹）；把它绕着一根
   中心的轴扫一圈，就是一个「有六个尖的环」。脊带一点螺旋，
   所以那六个尖不会在环上排成一条死板的直线。 */

function buildStarTorus(opts = {}) {
  const {
    R = 0.66,      /* 环的中心半径 */
    rOut = 0.235,  /* 尖到截面中心 */
    rIn = 0.105,   /* 凹到截面中心 */
    n = 6,
    seg = 108,
    twist = 30,    /* 沿环走一圈，截面转多少度 */
    squash = 0.82, /* 竖向压扁一点，环才有「躺着的形状」 */
  } = opts;
  const s = new Surf();
  const nv = n * 2;
  const rows = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    const er = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const ey = new THREE.Vector3(0, 1, 0);
    const row = [];
    for (let j = 0; j < nv; j++) {
      const jj = j % nv;
      const ph = (jj / nv) * Math.PI * 2 + twist * DEG * (i / seg);
      const rr = jj % 2 === 0 ? rOut : rIn;
      /* 凹处沿环稍收，尖处稍放：脊因此在环上有起伏，不是一根等粗的管 */
      const depth = jj % 2 === 0 ? 1.0 : 0.86;
      const p = new THREE.Vector3()
        .addScaledVector(er, R + rr * Math.cos(ph) * depth)
        .addScaledVector(ey, rr * Math.sin(ph) * squash * depth);
      row.push(s.add(p));
    }
    rows.push(row);
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < nv; j++) {
      const j2 = (j + 1) % nv;
      const th = ((i + 0.5) / seg) * Math.PI * 2;
      const er = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
      const ph = ((j + 0.5) / nv) * Math.PI * 2 + twist * DEG * ((i + 0.5) / seg);
      const out = new THREE.Vector3()
        .addScaledVector(er, Math.cos(ph))
        .addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(ph) * squash);
      s.quad(rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j], out);
    }
  }
  const g = s.build({ flat: true });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g);
  mesh.userData.role = 'ring';
  group.add(mesh);
  return { group, parts: { hinges: [], arms: [] }, geo: g };
}

/* ── 霜花薄壳：六角星轮廓的薄穹面 ─────────────────────────── */

function buildFrostShell(opts = {}) {
  const {
    R = 0.98,
    lobes = 0.42,
    sharp = 1.7,
    dome = 0.20,
    crest = 0.16,
    t = 0.028,
    nu = 14,
    nth = 180,
    u0 = 0.03,
  } = opts;
  const rOut = (th) => R * (1 - lobes + lobes * starWaveP(th, 6, sharp));
  /* 心不要收到一个点：留一点圆芯，穹面在那里才不会有退化三角形 */
  const fn = (u, v) => {
    const uu = lerp(u0, 1, u);
    const th = v * Math.PI * 2;
    const r = rOut(th) * uu;
    const z =
      dome * (1 - Math.pow(uu, 1.65)) +
      crest * starWaveP(th, 6, sharp) * Math.pow(uu, 1.75) -
      crest * 0.45 * Math.pow(uu, 6);
    return new THREE.Vector3(Math.cos(th) * r, z, Math.sin(th) * r);
  };
  const g = sheet(fn, nu, nth, {
    thickness: t,
    closedV: true,
    orient: () => new THREE.Vector3(0, 1, 0),
  });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g);
  mesh.userData.role = 'shell';
  group.add(mesh);
  return { group, parts: { hinges: [], arms: [] }, geo: g };
}

/* ── 材质 ─────────────────────────────────────────────────
   三档都要在 #f0f3f6 上活下来。这里的关键不是「更透明」，是**更暗**：
   白纸上的一枚白东西只有比纸略暗才看得见体量，全亮的环境贴图会把
   任何 albedo 都推到纸的亮度之上，于是形体整个化掉。
   所以环境贴图刻意压到中调（天顶 #cfd7e2、地面 #22262e），
   body 因此落在纸面之下，靠这几样重新长出结构：
     · 掠射角把 body 压向 --umber、alpha 提到近 1 → 剪影上一道暗发丝边
     · 掠射角加一层极淡的辉光 → 磨砂玻璃的边
     · 一道明确的主光 + 一道背光，让花瓣的碗形有明暗过渡 */

function patchBody(mat, cfg) {
  const {
    edgeColor = C_UMBER,
    edgeAmt = 0.5,
    edgeLo = 0.5,
    edgeHi = 1.0,
    edgeAlpha = 0.55,
    rimColor = 0xf8fbff,
    rimPow = 2.6,
    rimStr = 0.34,
    aoAmt = 0,
    aoPow = 1.2,
  } = cfg || {};
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeColor = { value: new THREE.Color(edgeColor) };
    shader.uniforms.uEdgeAmt = { value: edgeAmt };
    shader.uniforms.uEdgeLo = { value: edgeLo };
    shader.uniforms.uEdgeHi = { value: edgeHi };
    shader.uniforms.uEdgeA = { value: edgeAlpha };
    shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) };
    shader.uniforms.uRimPow = { value: rimPow };
    shader.uniforms.uRimStr = { value: rimStr };
    shader.uniforms.uAoAmt = { value: aoAmt };
    shader.uniforms.uAoPow = { value: aoPow };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uEdgeColor;
         uniform float uEdgeAmt;
         uniform float uEdgeLo;
         uniform float uEdgeHi;
         uniform float uEdgeA;
         uniform vec3 uRimColor;
         uniform float uRimPow;
         uniform float uRimStr;
         uniform float uAoAmt;
         uniform float uAoPow;
         void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fres = 1.0 - abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) );
        float edgeK = smoothstep( uEdgeLo, uEdgeHi, fres );
        /* dao：朝向环境上方（世界 +y）的面提亮、朝下压暗。
           vNormal 是视空间的，所以先把 +y 世界轴送到视空间再点积。 */
        vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
        float upK = 0.5 + 0.5 * dot( normalize( vNormal ), upV );
        float dao = mix( 1.0, 0.42 + 1.05 * upK, uAoAmt );
        diffuseColor.rgb *= mix( 1.0, dao, uAoPow );
        diffuseColor.rgb = mix( diffuseColor.rgb, uEdgeColor, edgeK * uEdgeAmt );
        diffuseColor.a = mix( diffuseColor.a, 0.97, edgeK * uEdgeA );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uRimColor * pow( edgeK, uRimPow ) * uRimStr;`,
      );
  };
  mat.customProgramCacheKey = () =>
    `flora-${edgeAmt}-${edgeLo}-${edgeHi}-${rimPow}-${rimStr}-${edgeColor}-${aoAmt}-${aoPow}`;
  return mat;
}

export const MATERIAL_KEYS = ['frost', 'ice', 'edge'];
export const MATERIAL_LABELS = {
  frost: '磨砂树脂',
  ice: '近白薄冰',
  edge: '描边冰',
};

/* 各档的参数集中在这里：scene 与基线共用同一份数值，
   调一处就能影响全部候选，不会出现「这一档亮、那一档死白」 */
const MAT_SPEC = {
  frost: {
    color: 0xccd6e4,
    roughness: 0.60,
    opacity: 0.72,
    envMapIntensity: 0.85,
    sheen: 0.9,
    sheenRoughness: 0.7,
    sheenColor: 0xdfe5ef,
    clearcoat: 0.2,
    clearcoatRoughness: 0.68,
    iridescence: 0.1,
    patch: { edgeAmt: 0.62, edgeLo: 0.42, edgeHi: 1.0, edgeAlpha: 0.62, rimStr: 0.22, rimPow: 2.6, aoAmt: 0.34, aoPow: 1.0 },
  },
  ice: {
    color: 0xd6e0ee,
    roughness: 0.13,
    opacity: 0.80,
    envMapIntensity: 1.0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.16,
    patch: { edgeAmt: 0.5, edgeLo: 0.5, edgeHi: 0.98, edgeAlpha: 0.66, rimStr: 0.3, rimPow: 2.2, aoAmt: 0.4, aoPow: 1.15 },
  },
  edge: {
    color: 0xd0d9e7,
    roughness: 0.42,
    opacity: 0.62,
    envMapIntensity: 0.78,
    sheen: 0.5,
    sheenRoughness: 0.8,
    sheenColor: 0xe8ecf3,
    clearcoat: 0.4,
    clearcoatRoughness: 0.4,
    patch: { edgeAmt: 0.86, edgeLo: 0.3, edgeHi: 0.9, edgeAlpha: 0.9, rimStr: 0.08, rimPow: 3.0, aoAmt: 0.24, aoPow: 0.9 },
  },
};

function makeMaterial(key) {
  const s = MAT_SPEC[key] || MAT_SPEC.frost;
  const mat = new THREE.MeshPhysicalMaterial({
    color: s.color,
    metalness: 0,
    roughness: s.roughness,
    transparent: true,
    opacity: s.opacity,
    ior: 1.47,
    clearcoat: s.clearcoat ?? 0,
    clearcoatRoughness: s.clearcoatRoughness ?? 0.5,
    sheen: s.sheen ?? 0,
    sheenRoughness: s.sheenRoughness ?? 0.8,
    sheenColor: new THREE.Color(s.sheenColor ?? 0xe6ebf3),
    iridescence: s.iridescence ?? 0,
    iridescenceIOR: 1.28,
    iridescenceThicknessRange: [190, 470],
    specularIntensity: 1,
    envMapIntensity: s.envMapIntensity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return patchBody(mat, s.patch);
}


/* ── 程序化环境贴图（无下载）────────────────────────────────
   这里和 star-crystal 那一稿的取向不同，是这一稿最要紧的一处修正。
   那一稿要的是「水晶」——天顶纯白、地平线纯白，于是棱面在纸上发亮。
   这一稿是**磨砂树脂**：白纸上的一枚白东西，如果环境全是亮的，
   它就会整个化进纸里（第一版实测就是这样，见 notes）。所以这里反过来：
   环境整体压到纸面亮度之下（天顶 #cfd7e2、地面 #20242b），
   再用两三块亮斑和暗墙制造方向感。形体因此比纸**略暗**，
   在 #f0f3f6 上才站得住。 */
let envCanvas = null;
let envTone = 'dim';
function buildEnvCanvas(tone = 'dim') {
  if (envCanvas && envTone === tone) return envCanvas;
  envTone = tone;
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512);
  if (tone === 'bright') {
    /* 对照：那一稿的口径（全亮环境），留在这里是为了「为什么不能用它」 */
    sky.addColorStop(0.0, '#ffffff');
    sky.addColorStop(0.22, '#f7f9fc');
    sky.addColorStop(0.44, '#dde4ee');
    sky.addColorStop(0.52, '#ffffff');
    sky.addColorStop(0.64, '#c3ccd9');
    sky.addColorStop(0.80, '#8b96a6');
    sky.addColorStop(1.0, '#454e5c');
  } else {
    sky.addColorStop(0.0, '#cfd7e2');
    sky.addColorStop(0.20, '#e3e9f1');
    sky.addColorStop(0.38, '#aab4c3');
    sky.addColorStop(0.50, '#b9c3d1');
    sky.addColorStop(0.62, '#8d97a7');
    sky.addColorStop(0.78, '#5b6472');
    sky.addColorStop(1.0, '#20242b');
  }
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
  /* 两块窗光、一块薄暮紫、两块暗墙、一片压暗的地脚 */
  blob(250, 132, 190, '#ffffff', 0.95);
  blob(742, 96, 140, '#f4f8ff', 0.85);
  blob(120, 268, 160, '#ffffff', 0.35);
  blob(566, 300, 250, '#b9b3ce', 0.4);
  blob(906, 208, 190, '#39404c', 0.6);
  blob(404, 244, 150, '#565f6d', 0.45);
  blob(20, 440, 330, '#171a20', 0.85);
  envCanvas = cv;
  return cv;
}

function makeEnvMap(renderer, tone = 'dim') {
  const tex = new THREE.CanvasTexture(buildEnvCanvas(tone));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return rt;
}

/* ── 形：建造表 ───────────────────────────────────────────── */

/* 每个形式：build(params) → { group, parts }；base 是它要的那个视角；
   articulate 处理开合 / 生长。params 让同一个形能按参数长成变体
   （花瓣厚度扫描就是这么做的 —— 同一套几何，只换厚度与弧度）。 */
export const FORMS = {
  flower: {
    label: '六瓣花体',
    note: '六片带碗形曲面的花瓣，两两错开长短与开角，从一颗小核里散开。',
    build: (p = {}) =>
      buildFlower({
        petal: {
          length: 1.16,
          width: 0.28,
          baseR: 0.055,
          lift0: 72,
          lift1: -20,
          bow: p.bow ?? 0.62,
          twist: 14,
          thickness: p.thickness ?? 0.024,
          wave: 0.035,
        },
        jitter: 0.16,
        coreSize: 0.075,
      }),
    base: { rx: 6, ry: 18, s: 1 },
    articulate: (parts, p) => {
      const open = p.open ?? 1;
      parts.hinges.forEach((h, i) => {
        const wob = Math.sin(i * 1.7) * 3 * DEG;
        h.mesh.rotation.z = -(1 - open) * 46 * DEG + wob;
        h.mesh.rotation.x = Math.cos(i * 2.3) * 4 * DEG * (1 - open * 0.4);
      });
    },
    coreOf: (parts) => parts.core,
  },
  bud: {
    label: '双轮透镜叶',
    note: '两轮各三片闭合的透镜薄壳，错 60°，含着一颗还没散开的心。',
    build: () => buildLensBud({}),
    base: { rx: 8, ry: 24, s: 1 },
    articulate: (parts, p) => {
      const open = p.open ?? 1;
      parts.hinges.forEach((h, i) => {
        h.mesh.rotation.z = -(1 - open) * 26 * DEG + Math.sin(i * 2.1) * 2.5 * DEG;
      });
    },
  },
  flakeD: {
    label: '雪片 · 枝状',
    note: '一枚薄板，六条主枝各带两对 ±60° 的侧枝，脊抬高一线。',
    build: () => buildFlakeDendrite({}),
    base: { rx: 58, ry: 12, s: 1 },
  },
  flakeS: {
    label: '雪片 · 板状',
    note: '同一枚六重，换成厚板 + 三对短齿 + 六块端板，讲的是同一件事的另一种密度。',
    build: () => buildFlakePlate({}),
    base: { rx: 58, ry: -8, s: 1 },
  },
  growth: {
    label: '冰晶生长',
    note: '一根六棱柱，六条臂长短不一，一条是断的，一条刚冒头。长到一半停在那里。',
    build: () => buildGrowth({}),
    base: { rx: 52, ry: 16, s: 1 },
    articulate: (parts, p) => {
      const gr = p.grow ?? 1;
      parts.arms.forEach((a, i) => {
        const t = Math.min(1, Math.max(0, (gr - a.delay) / (1 - a.delay)));
        const e = t * t * (3 - 2 * t);
        a.mesh.visible = e > 0.02;
        if (a.lump) a.mesh.scale.setScalar(0.4 + 0.6 * e);
        else a.mesh.scale.set(0.12 + 0.88 * e, 1, 1); /* 沿臂伸长（臂在局部 x 上） */
      });
    },
  },
  torus: {
    label: '星形环面',
    note: '六角星的截面扫成一圈，六条脊绕环走；脊带一点螺旋，所以不是规规矩矩的齿轮。',
    build: () => buildStarTorus({}),
    base: { rx: 26, ry: 0, s: 1 },
  },
  shell: {
    label: '霜花薄壳',
    note: '一枚六角星的薄穹面，六个尖微微翘起，中间薄得能看见底下的光。',
    build: () => buildFrostShell({}),
    base: { rx: 62, ry: 10, s: 1 },
  },
};

export const FORM_KEYS = Object.keys(FORMS);

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
    if (e >= s.starts[i]) {
      k = i;
      break;
    }
  }
  return { k, left: s.starts[k] + s.holds[k] - e };
}

/* 四种运动。姿态都是离散的：一圈 steps 格，最后一格多停 BREATH 倍。 */
export const MOTIONS = ['rev', 'breath', 'bloom', 'grow'];
export const MOTION_LABELS = {
  rev: '整圈 · 定格',
  breath: '两姿之间呼吸',
  bloom: '开合',
  grow: '长成一次',
};
export const MOTION_CFG = {
  rev: { steps: 12, holdMs: 118, once: false },
  breath: { steps: 12, holdMs: 150, once: false },
  bloom: { steps: 8, holdMs: 190, once: false },
  grow: { steps: 9, holdMs: 170, once: true },
};

/**
 * 这一格该摆成什么样。
 * @returns {{yaw:number, pitch:number, roll:number, scale:number, open:number, grow:number}}
 */
export function poseFor(motion, k, steps) {
  const t = steps <= 1 ? 0 : k / (steps - 1);
  const pose = { yaw: 0, pitch: 0, roll: 0, scale: 1, open: 1, grow: 1 };
  if (motion === 'rev') {
    pose.yaw = (k * 360) / steps;
    /* 整圈里俯仰走一点点，免得十二格都停在同一个高度 */
    pose.pitch = 5 * Math.sin((k / steps) * Math.PI * 2);
    pose.roll = 2.5 * Math.sin((k / steps) * Math.PI * 2 + 1.1);
  } else if (motion === 'breath') {
    /* 两个好姿态之间来回：量化后的正弦，两端各自停一拍 */
    const a = Math.sin((k / steps) * Math.PI * 2 - Math.PI / 2);
    pose.yaw = 17 * a;
    pose.pitch = -6 + 6 * a;
    pose.scale = 1 + 0.006 * a;
  } else if (motion === 'bloom') {
    const a = 0.5 - 0.5 * Math.cos((k / steps) * Math.PI * 2);
    pose.open = 0.85 + 0.15 * a;
    pose.scale = 0.985 + 0.015 * a;
    pose.yaw = 8 * a;
  } else if (motion === 'grow') {
    pose.grow = Math.pow(t, 0.85);
    pose.open = 0.86 + 0.14 * Math.pow(t, 0.8);
    pose.scale = 0.9 + 0.1 * Math.pow(t, 0.9);
    pose.yaw = -10 + 14 * t;
    pose.pitch = -4 + 4 * t;
  }
  return pose;
}

/* ── 离屏 → 2D canvas 的拷贝 ─────────────────────────────────
   为什么不用 drawImage：驱动上那张 WebGL canvas 的像素带 alpha，
   `alpha:false` 也不一定被尊重。只要有一格是半透明的，页面纸色就会透上来，
   深底那一组会变成一块灰 —— 第一版就撞了这个，而且只有一半格子出问题，
   非常难判断。所以这里绕开合成：直接 readPixels，把 alpha 一律写成 255，
   再翻转行序（GL 原点在左下）putImageData 过去。
   代价是一次 GPU 同步读回，在定格（每格才画一次）下无关紧要。 */
let SCRATCH = null;
function blitGL(glCanvas, ctx, dx, dy) {
  const gl = glCanvas.__gl || (glCanvas.__gl = glCanvas.getContext('webgl2'));
  const w = glCanvas.width;
  const h = glCanvas.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  if (!SCRATCH) SCRATCH = document.createElement('canvas');
  if (SCRATCH.width !== w || SCRATCH.height !== h) {
    SCRATCH.width = w;
    SCRATCH.height = h;
  }
  const sctx = SCRATCH.getContext('2d');
  const img = sctx.createImageData(w, h);
  const dst = img.data;
  const row = w * 4;
  for (let y = 0; y < h; y++) {
    const s = (h - 1 - y) * row;
    const d = y * row;
    dst.set(px.subarray(s, s + row), d);
    for (let i = 0; i < row; i += 4) dst[d + i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  ctx.drawImage(SCRATCH, 0, 0, w, h, dx, dy, w, h);
}

/* ── 一层形 ─────────────────────────────────────────────────
   ⚠ 这一页上的格子远多于 Chrome 允许的 WebGL 上下文数（约 16 个）。
   第一版给每格一张自己的 canvas 与自己的 WebGLRenderer，结果整页全白 ——
   上下文用尽后，先建的那些被回收，画布上什么都没有，控制台也不报错。
   所以改成：**全站共用一个离屏 WebGL 渲染器**，每格是一张普通的 2D canvas，
   画完之后把离屏画布 drawImage 过去。代价是一次 GPU→CPU 的拷贝，
   在定格模式（每格 holdMs 才画一次）下完全可以接受。 */

let SHARED = null;
export function sharedGL() {
  if (SHARED) return SHARED;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  const envRT = makeEnvMap(renderer);
  /* blitGL 需要直接拿到这个上下文做 readPixels */
  canvas.__gl = renderer.getContext();
  SHARED = { canvas, renderer, envRT, scene: null, camera: null, lights: null };
  return SHARED;
}

export class FormView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = {
      fov: 26,
      dist: 5.2,
      dprCap: 2,
      fill: 0.82,
      ground: PAGE_BG,
      ...opts,
    };
    const S = sharedGL();
    this.renderer = S.renderer;
    this.envRT = S.envRT;

    this.scene = new THREE.Scene();
    this.scene.environment = S.envRT.texture;

    this.camera = new THREE.PerspectiveCamera(this.opts.fov, 1, 0.1, 60);
    this.camera.position.set(0, 0, this.opts.dist);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3.0, 4.6, 4.4);
    const fill = new THREE.DirectionalLight(0xc4cfe0, 0.35);
    fill.position.set(-4.4, -1.4, 2.2);
    const rim = new THREE.DirectionalLight(C_AMBER, 0.30);
    rim.position.set(-1.2, 2.6, -4.6);
    this.scene.add(key, fill, rim);

    this.materials = {};
    MATERIAL_KEYS.forEach((k) => {
      this.materials[k] = makeMaterial(k);
    });

    this.cacheGroups = new Map();
    this.current = null;
    this.curKey = null;
    this.curMat = null;
    this.pose = { yaw: 0, pitch: 0, roll: 0, scale: 1, open: 1, grow: 1 };
    this.running = false;
    this.timer = 0;
    this.t0 = 0;
    this.elapsed = 0;
    this.motion = 'rev';
    this.lastCalls = 0;

    this._setupSize();
  }

  _setupSize() {
    const w = this.opts.width || this.canvas.clientWidth || 240;
    const h = this.opts.height || this.canvas.clientHeight || w;
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.dprCap);
    /* 这一张是 2D 的：自己算缓冲尺寸 */
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.W = w;
    this.H = h;
    this.dpr = dpr;
  }

  setSize(w, h) {
    this.opts.width = w;
    this.opts.height = h;
    this._setupSize();
  }

  /** 换材质档：每片各有一份自己的实例（每片一个自己的 tint），这里只换引用 */
  setMaterial(key) {
    if (this.curMat === key) return;
    this.curMat = key;
    this._applyMaterials();
  }

  /** 取出（或首次建）某个形的组，挂进场景。
 *  formKey 可以是 'flower'，也可以是 'flower@thickness=0.045,bow=0.9' 这样的参数变体
 *  —— 花瓣厚度扫描就是同一套几何换参数长出来的，缓存键把参数带上即可。 */
  show(formKey) {
    if (this.curKey === formKey && this.current) return this.current;
    if (this.current) this.scene.remove(this.current.group);
    let entry = this.cacheGroups.get(formKey);
    if (!entry) {
      const [base, spec] = String(formKey).split('@');
      const params = {};
      if (spec) {
        spec.split(',').forEach((kv) => {
          const [k, v] = kv.split('=');
          if (k && v != null) params[k] = Number(v);
        });
      }
      const def = FORMS[base];
      if (!def) throw new Error(`unknown form ${base}`);
      const built = def.build(params);
      const group = built.group;
      const bsphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
      const fits =
        (this.opts.fill * this.opts.dist * Math.tan((this.opts.fov / 2) * DEG)) /
        Math.max(bsphere.radius, 1e-4);
      /* 每片一个自己的材质实例（带一枚极淡的站点色偏）：
         透明物体由 three 按距离排序，所以「哪片在前」是自动的，
         这也是为什么花瓣/枝要分片而不要合并成一份几何。 */
      let idx = 0;
      group.traverse((o) => {
        if (!o.isMesh) return;
        const palette = [0xffffff, C_DREAM, C_WAKE];
        const tint = pale(palette[idx % 3], 0.035 + (idx % 3) * 0.022);
        o.userData.tint = tint;
        idx++;
      });
      entry = {
        def,
        group,
        parts: built.parts || { hinges: [], arms: [] },
        fits,
        base: def.base,
      };
      this.cacheGroups.set(formKey, entry);
    }
    this.current = entry;
    this.curKey = formKey;
    this.scene.add(entry.group);
    entry.group.traverse((o) => {
      if (o.isMesh) o.userData.mats = null;
    });
    this._applyMaterials();
    return entry;
  }

  _applyMaterials() {
    const e = this.current;
    if (!e) return;
    const mats = this.materials;
    const key = this.curMat || 'frost';
    e.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.mats) o.userData.mats = {};
      let m = o.userData.mats[key];
      if (!m) {
        m = mats[key].clone();
        if (o.userData.tint) m.color = o.userData.tint.clone();
        o.userData.mats[key] = m;
      }
      o.material = m;
    });
  }

  setGround(hex) {
    this.opts.ground = hex;
  }

  applyPose(pose) {
    const e = this.current;
    if (!e) return;
    Object.assign(this.pose, pose);
    const b = e.base;
    const g = e.group;
    /* pose.rx / ry 是「绝对视角」：给了就盖掉这个形的基准视角（调参用） */
    const rx = pose.rx != null ? pose.rx : b.rx + this.pose.pitch;
    const ry = pose.ry != null ? pose.ry : b.ry + this.pose.yaw;
    g.rotation.set(rx * DEG, ry * DEG, (this.pose.roll ?? 0) * DEG);
    g.scale.setScalar(e.fits * (b.s ?? 1) * (this.pose.scale ?? 1));
    if (e.def.articulate) e.def.articulate(e.parts, this.pose);
  }

  /** 离屏渲染一整格的尺寸，再拷到这张 2D canvas 上 */
  draw() {
    const r = this.renderer;
    const gl = r.domElement;
    const pw = this.W * this.dpr;
    const ph = this.H * this.dpr;
    r.setPixelRatio(this.dpr);
    r.setSize(this.W, this.H, false);
    if (r.getClearColor(new THREE.Color()).getHex() !== this.opts.ground || r.getClearAlpha() !== 1) {
      r.setClearColor(this.opts.ground, 1);
    }
    r.setClearAlpha(1);
    this.camera.aspect = this.W / this.H;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
    this.lastCalls = r.info.render.calls;
    const ctx = this.ctx;
    ctx.fillStyle = '#' + this.opts.ground.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    blitGL(gl, ctx, 0, 0);
  }

  /* 定格：每格画一次，下一格按剩余时间唤醒 */
  start(motion = 'rev') {
    this.stop();
    this.motion = motion;
    const cfg = MOTION_CFG[motion];
    if (motion === 'grow') {
      /* 长成一次：走完就停在最后一格，之后一次都不再提交 */
      this.elapsed = 0;
      this.t0 = performance.now();
      const s = schedule(cfg.steps, cfg.holdMs);
      const tick = () => {
        if (!this.running) return;
        const now = performance.now();
        const e = now - this.t0;
        if (e >= s.total) {
          this.applyPose(poseFor('grow', cfg.steps - 1, cfg.steps));
          this.draw();
          this.running = false;
          delete this.timer;
          return;
        }
        const { k, left } = stepAt(s, e);
        this.applyPose(poseFor('grow', k, cfg.steps));
        this.draw();
        this.timer = setTimeout(tick, Math.max(8, left + 6));
      };
      this.running = true;
      tick();
      return;
    }
    this.elapsed = 0;
    this.t0 = performance.now();
    const s = schedule(cfg.steps, cfg.holdMs);
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const e = now - this.t0;
      this.elapsed = e;
      const { k, left } = stepAt(s, e);
      this.applyPose(poseFor(motion, k, cfg.steps));
      this.draw();
      this.timer = setTimeout(tick, Math.max(8, left + 6));
    };
    this.running = true;
    tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
  }

  /** 钉住第 k 格（截图用） */
  freeze(k, motion = 'rev') {
    this.stop();
    this.motion = motion;
    const cfg = MOTION_CFG[motion];
    this.applyPose(poseFor(motion, Math.min(k, cfg.steps - 1), cfg.steps));
    this.draw();
  }

  dispose() {
    this.stop();
    this.cacheGroups.forEach((e) => {
      e.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.userData.mats) Object.values(o.userData.mats).forEach((m) => m.dispose());
        }
      });
    });
    Object.values(this.materials).forEach((m) => m.dispose());
    /* 渲染器与环境贴图是共享的，这里不能 dispose */
  }
}

/* ── 静态格子表：逐格渲染、逐格拷位 ────────────────────────
   共享渲染器上没法用 scissor 把很多格一次画进一张大画布（会互相清掉），
   所以这里就是「一格一格渲染，然后把离屏画布 drawImage 到目标位置」。
   cells: [{ x, y, size, form, mat, pose, ground, only }] */
export function paintGrid(view, cells, { width, height } = {}) {
  const W = width ?? view.W;
  const H = height ?? view.H;
  const canvas = view.canvas;
  const ctx = view.ctx;
  const dpr = view.dpr;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  view.W = view.opts.width;
  view.H = view.opts.height;
  ctx.fillStyle = '#f0f3f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const r = view.renderer;
  const gl = r.domElement;

  for (const c of cells) {
    if (c.blank) continue;
    /* 把离屏缓冲改成这一格的尺寸 */
    r.setPixelRatio(dpr);
    r.setSize(c.size, c.size, false);
    r.setClearColor(c.ground ?? PAGE_BG, 1);
    r.setClearAlpha(1);
    view.camera.aspect = 1;
    view.camera.updateProjectionMatrix();

    view.setMaterial(c.mat || 'frost');
    const entry = view.show(c.form);
    entry.group.traverse((o) => {
      if (o.isMesh) o.visible = c.only ? c.only.includes(o.userData.role) : true;
    });
    const m = c.motion || 'rev';
    const cfg = MOTION_CFG[m];
    view.applyPose(c.pose || poseFor(m, c.k ?? 0, cfg.steps));
    const fov = c.fov ?? view.opts.fov;
    if (view.camera.fov !== fov) {
      view.camera.fov = fov;
      view.camera.updateProjectionMatrix();
    }
    r.render(view.scene, view.camera);
    view.lastCalls = r.info.render.calls;
    /* 先把这一格的底铺实，再把离屏画面盖上去 */
    ctx.fillStyle = '#' + (c.ground ?? PAGE_BG).toString(16).padStart(6, '0');
    ctx.fillRect(
      Math.round(c.x * dpr),
      Math.round(c.y * dpr),
      Math.round(c.size * dpr),
      Math.round(c.size * dpr),
    );
    blitGL(
      gl,
      ctx,
      Math.round(c.x * dpr),
      Math.round(c.y * dpr),
    );
  }
  /* 恢复成这张 canvas 自己的尺寸，后面的 draw() 才不会错位 */
  view.W = view.opts.width || W;
  view.H = view.opts.height || H;
  r.setSize(view.W, view.H, false);
}

/* ── 网格排版助手 ──────────────────────────────────────────── */
export function gridLayout({ cols, rows, size, gap = 16, pad = 0 }) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: pad + c * (size + gap),
        y: pad + r * (size + gap),
        size,
      });
    }
  }
  return {
    cells,
    width: pad * 2 + cols * size + (cols - 1) * gap,
    height: pad * 2 + rows * size + (rows - 1) * gap,
  };
}

/* ── 测算 ─────────────────────────────────────────────────── */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 两件事：
 *  1) 各形在定格模式下的一次提交 / 合成成本（480×480 缓冲）
 *  2) 数字帧：定格每 holdMs 画一次，其余时间零提交
 */
export async function measure({ size = 480, cpuMs = 420, gpuMs = 360 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const view = new FormView(canvas, { width: size, height: size, dprCap: 1 });
  const r = view.renderer;
  const gl = r.getContext();
  const rows = [];
  for (const key of FORM_KEYS) {
    view.setMaterial('frost');
    view.show(key);
    view.applyPose(poseFor('rev', 3, 12));
    view.draw();
    gl.finish();
    await nextFrame();
    const a0 = performance.now();
    let n = 0;
    let budget = 0;
    while (performance.now() - a0 < cpuMs) {
      const t = performance.now();
      view.draw();
      budget += performance.now() - t;
      n++;
    }
    const cpu = budget / n;
    const calls = view.renderer.info.render.calls;
    const tris = view.renderer.info.render.triangles;
    const b0 = performance.now();
    let m = 0;
    let bsum = 0;
    while (performance.now() - b0 < gpuMs) {
      const t = performance.now();
      view.draw();
      gl.finish();
      bsum += performance.now() - t;
      m++;
    }
    rows.push({
      form: key,
      label: FORMS[key].label,
      cpu: +cpu.toFixed(3),
      gpu: +(bsum / m).toFixed(3),
      calls,
      tris,
      programs: view.renderer.info.programs.length,
    });
    await nextFrame();
  }
  /* 材质三档（同一个形） */
  const matRows = [];
  view.show('flower');
  for (const mat of MATERIAL_KEYS) {
    view.setMaterial(mat);
    view.applyPose(poseFor('rev', 3, 12));
    view.draw();
    gl.finish();
    await nextFrame();
    const b0 = performance.now();
    let m = 0;
    let bsum = 0;
    while (performance.now() - b0 < gpuMs) {
      const t = performance.now();
      view.draw();
      gl.finish();
      bsum += performance.now() - t;
      m++;
    }
    matRows.push({
      mat,
      label: MATERIAL_LABELS[mat],
      gpu: +(bsum / m).toFixed(3),
      calls: view.renderer.info.render.calls,
      tris: view.renderer.info.render.triangles,
    });
    await nextFrame();
  }
  view.stop();
  view.dispose();
  canvas.remove();
  return { rows, matRows, size };
}









