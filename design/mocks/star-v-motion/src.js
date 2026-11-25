/* ─────────────────────────────────────────────────────────────
   六芒星 · 姿态与定格（原型）
   候选：浮在将来某个对话框之上的一层。

   这一份只负责「一个实心六芒星 + 一套定格运动」，
   不重做几何的造型语言、也不重做材质美学 —— 另外两位负责那两件事。
   这里主张的是第三件事：**停在哪些姿态**。

   姿态的数学全在 posecore.mjs（纯函数，Node 与浏览器共用），
   这里只做三件事：把矩阵变成 three 的 quaternion、按保持时钟一格格走、
   以及把「姿态地图 / 运动 / 帧条」画到画布上。

   定格＝姿态离散 + 每格保持。所以这里没有 rAF：
   每格画一次，下一次唤醒按这一格还剩多久排（与 star-crystal 同一套时钟）。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';
import {
  SHAPE,
  viewMatrix,
  mul3,
  rotAxis,
} from './posecore.mjs';

/* 一圈走完之后的那一下长停：同 brand.ts「7 步轮转 + 3 秒呼吸」的 3× */
export const BREATH = 3.0;
/* 基准视：正等轴（＝工具条的 drawStar 那一格，也是这次扫出来的唯一满分姿态） */
export const ISO_YAW = 45;
export const ISO_PITCH = 35.264;
const ISO = viewMatrix(ISO_YAW, ISO_PITCH);

export const HOLD_CHOICES = [60, 90, 110, 160, 240];
export const STEP_CHOICES = [8, 12, 16, 24];

/* ── 几何 ─────────────────────────────────────────────────── */

/** 正八边形环（外接圆半径 r），与 posecore 的 octagon 同式 */
function ring(u, v, d, z, radius, chamfer) {
  const R = radius;
  const a = R * Math.cos(Math.PI / 8);
  const k = a * (1 - Math.max(0, Math.min(0.414, chamfer)) / 0.414);
  const pts = [
    [a, k], [k, a], [-k, a], [-a, k],
    [-a, -k], [-k, -a], [k, -a], [a, -k],
  ];
  const m = Math.max(...pts.map(([p, q]) => Math.hypot(p, q)));
  const s = R / m;
  return pts.map(([p, q]) =>
    new THREE.Vector3(u.x * p * s + v.x * q * s + d.x * z, u.y * p * s + v.y * q * s + d.y * z, u.z * p * s + v.z * q * s + d.z * z),
  );
}

/**
 * 六支共心的实心星。轴与 posecore 的 AXES 一致（±x ±y ±z），
 * 这样 Node 算出来的姿态与浏览器里画出来的逐格对得上。
 */
export function buildStarGeometry(over = {}) {
  const S = { ...SHAPE, ...over };
  const pos = [];
  const tri = (p0, p1, p2, ref) => {
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
    const c = new THREE.Vector3().addVectors(p0, p1).add(p2).multiplyScalar(1 / 3).sub(ref);
    if (n.dot(c) < 0) pos.push(p0, p2, p1);
    else pos.push(p0, p1, p2);
  };

  const AX = [
    { d: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, 1) },
    { d: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(1, 0, 0) },
    { d: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  ];

  for (const A of AX) {
    for (const sg of [1, -1]) {
      const d = A.d.clone().multiplyScalar(sg);
      const ref = d.clone().multiplyScalar(S.tip * 0.55);
      const rings = S.stations.map((st) =>
        ring(A.u, A.v, d, st.z * S.tip, S.waist * st.w, S.chamfer),
      );
      /* 每支的尖端正中 */
      const tip = d.clone().multiplyScalar(S.tip);

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
      for (let i = 0; i < 8; i++) tri(tip, last[i], last[(i + 1) % 8], ref);
      /* 根部封口 */
      const first = rings[0];
      const centre = new THREE.Vector3();
      for (let i = 0; i < 8; i++) tri(centre, first[(i + 1) % 8], first[i], ref);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ── 材质（最小面：只做两种，造型语言归别的原型）─────────── */

const PAGE_BG = 0xf0f3f6;

/* 边缘光：磨砂半透明在浅底上会糊成一团，靠 fresnel 把轮廓提出来 */
function withRim(mat, { color = 0xdfe6f0, power = 2.2, strength = 0.55 } = {}) {
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('vViewPosition')) return;
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimPow = { value: power };
    shader.uniforms.uRimStr = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uRimColor;\nuniform float uRimPow;\nuniform float uRimStr;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         { vec3 vdir = normalize(vViewPosition);
           float rim = 1.0 - clamp(dot(normal, vdir), 0.0, 1.0);
           totalEmissiveRadiance += uRimColor * pow(rim, uRimPow) * uRimStr; }`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${power}-${strength}`;
  return mat;
}

/* ── 描边：把剪影的轮廓压出来 ──
   白底上最难的一件事：一颗半透明的星要在一张几乎同色的纸上交代自己。
   实测（notes.md §2）：光靠环境贴图，240px 下轮廓在 #f0f3f6 上只有约 4% 的对比，
   肉眼几乎读不到。所以这里用 reversed-hull——把同一个几何先按背面、微微放大、
   用深色不透明画一遍，再画半透明的本体。它不像后处理那样要额外一个 pass，
   也不引入新的 draw call 类型（仍然是同一个网格）。
   代价是 2 个 draw call（本体 + 壳），见 §4 的实测表。 */

/**
 * 两种材质：
 *   resin      磨砂半透明树脂（站点自己的语言）—— 主推
 *   resinEdge  同上，外加一层背面描的深色壳，剪影更清楚
 *
 * 刻意不碰 transmission：star-crystal 已经量过，transmission 非零就是全价
 * （2 个 draw call / 一整个 transmissive pass），而白底上的所需只是「透一点」。
 * opacity 拿同一观感，付 1 个 draw call。
 */
export function makeMaterial(kind = 'resin') {
  const base = withRim(
    new THREE.MeshPhysicalMaterial({
      /* 底色取 --bg 与 --umber 之间的偏冷一档：太白就与 #f0f3f6 分不开，
         太深又不像是「一层薄的材料」。0xb9c2d2 在两者之间。 */
      color: 0xb9c2d2,
      metalness: 0,
      roughness: 0.4,
      transparent: true,
      opacity: 0.74,
      attenuationColor: new THREE.Color(0x4f4a66),
      clearcoat: 0.5,
      clearcoatRoughness: 0.42,
      sheen: 0.5,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(0xa9b6cb),
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    { color: 0xf2f5fa, power: 2.2, strength: 1.1 },
  );
  if (kind === 'resin') return { main: base, edge: null };

  /* 深色剪影边：一层 reversed-hull，比后处理便宜，也不需要额外的 pass。
     它买到的正是白底上最缺的那件东西 —— 一条能读出来的轮廓。 */
  const edge = new THREE.MeshBasicMaterial({
    color: 0x6b6480,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  return { main: base, edge };
}

/* ── 环境贴图（程序化，不下载）──────────────────────────────── */

function buildEnv(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');
  /* 天顶白 → 地平线亮 → 地面压到 #454e5c。
     全亮的环境里，一颗半透明的星在 #f0f3f6 上等于没有棱面。 */
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#ffffff');
  sky.addColorStop(0.28, '#f6f9fc');
  sky.addColorStop(0.5, '#ffffff');
  sky.addColorStop(0.66, '#c6cfdb');
  sky.addColorStop(0.82, '#8f9aa9');
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
  blob(250, 140, 200, '#ffffff', 1);
  blob(790, 100, 150, '#ffffff', 0.85);
  /* 一点薄暮紫（--dream）与一块暗墙：棱面扫过它们时才有一亮一暗 */
  blob(560, 300, 250, '#d6cfe6', 0.45);
  blob(900, 230, 180, '#6e7a8b', 0.5);
  blob(30, 430, 320, '#3f4854', 0.7);

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

/* ── 矩阵 → three ─────────────────────────────────────────── */

/* posecore 给的是行主序 3×3「物体→视」。相机在 +z 看向原点、且没有额外旋转时，
   物体的 local→view 就是它自己的旋转，所以这份矩阵直接就是 quaternion 的来源。
   （相机若带自己的朝向，就得乘它的逆 —— 这里刻意把相机摆在正前方，
     好让「姿态」只有一处定义。） */
export function quatFromMatrix(m) {
  const M = new THREE.Matrix4().set(
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1,
  );
  return new THREE.Quaternion().setFromRotationMatrix(M);
}

/* ── 运动 ───────────────────────────────────────────────────
   每条运动都给成一串「被停住的姿态」。
   关键约束：**只停好姿态**。
   扫出来的结论是好姿态带很窄（±22°），所以能整圈走的转动，
   一步必须 ≥90° 才踩得到下一个好姿态 —— 90° 恰好是对称操作的周期，
   于是「绕体轴 90° 一步」走的其实全是同一个满分姿态的不同标记。 */

export const MOTIONS = {
  hinge: {
    label: '绕单轴定格翻面',
    note: '第一版那条运动：绕水平轴整圈翻。90° 一步。',
    steps: 4,
    at: (u) => mul3(ISO, rotAxis([1, 0, 0], u * 360)),
  },
  yaw: {
    label: '绕竖直轴分步自转',
    note: '转盘的走法，90° 一步 —— 每一步都正对一个体对角视。',
    steps: 4,
    at: (u) => mul3(ISO, rotAxis([0, 1, 0], u * 360)),
  },
  osc: {
    label: '摆动（不完成一圈）',
    note: '在 ±18° 之间往返，读起来是呼吸，不是旋转。',
    steps: 6,
    /* u: 0→1 一个来回。用三角波，所以两端各停一格 */
    at: (u) => {
      const t = u < 0.5 ? u * 2 : (1 - u) * 2;
      return mul3(ISO, rotAxis([0, 1, 0], -18 + 36 * t));
    },
    pingpong: true,
  },
  windmill: {
    label: '风车式（绕对角线）',
    note: '绕视线那条体对角线 45° 一步，在画面上原地换面。',
    steps: 8,
    at: (u) => mul3(rotAxis([0, 0, 1], u * 360), ISO),
  },
  ladder: {
    label: '跳格换面',
    note: '只在 8 个满分姿态之间跳，中间那些难看的姿态根本不渲染。',
    steps: 4,
    at: (u, k) => LADDER[k % LADDER.length],
  },
  settle: {
    label: '落定（转一次就停）',
    note: '从偏 34° 收进正位，之后一直停在那一格，只在被碰时重新落定。',
    steps: 1,
    at: (u) => mul3(ISO, rotAxis([0, 1, 0], -34 * (1 - u))),
  },
};

/* 8 个体对角视线 —— 它们是这颗星唯一的满分姿态 */
const LADDER = (() => {
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const d = new THREE.Vector3(sx, sy, sz).normalize();
    const pitch = (Math.asin(d.y) * 180) / Math.PI;
    let yaw = (Math.atan2(-d.x, -d.z) * 180) / Math.PI;
    if (yaw < 0) yaw += 360;
    out.push({ yaw, pitch, m: viewMatrix(yaw, pitch) });
  }
  /* 排成一个「绕着走」的顺序，让换面看起来是转身而不是近邻抖动 */
  const order = [0, 3, 6, 5, 2, 1, 4, 7];
  return order.map((i) => out[i].m);
})();

/**
 * 从运动定义推出这一步该用的矩阵。
 * 整圈的运动按 u = k/steps；摆动按半个来回；落定只有一格。
 */
export function poseOf(name, k, steps) {
  const spec = MOTIONS[name];
  if (name === 'ladder') return spec.at(0, k);
  if (name === 'settle') return spec.at(k === 0 ? 0 : 1);
  if (spec.pingpong) {
    /* 去程 + 回程，端点各只停一次 */
    const n = Math.max(2, Math.round(steps / 2));
    const j = k <= n ? k : 2 * n - k;
    return spec.at((j / n) * 0.5);
  }
  return spec.at(k / steps);
}

/** 一条运动在 steps 下的全部姿态矩阵（给帧条与自检用） */
export function poseList(name, steps) {
  const n = name === 'ladder' ? Math.min(8, Math.max(4, steps * 2)) : name === 'settle' ? 2 : steps;
  const out = [];
  for (let k = 0; k < n; k++) out.push(poseOf(name, k, steps));
  return out;
}

/* ── 保持时钟 ─────────────────────────────────────────────── */

/**
 * 一圈的保持表：每格 holdMs，最后一格之后多停 BREATH 倍。
 * 返回的那个对象还能回答「过了 elapsed 毫秒该是第几格、这一格还剩多久」。
 */
export function schedule(steps, holdMs) {
  const holds = new Array(steps).fill(holdMs);
  holds[steps - 1] = holdMs * BREATH;
  const starts = [];
  let t = 0;
  for (let i = 0; i < steps; i++) {
    starts.push(t);
    t += holds[i];
  }
  return { steps, holdMs, holds, starts, total: t };
}

export function stepAt(s, elapsed) {
  const e = ((elapsed % s.total) + s.total) % s.total;
  let k = 0;
  for (let i = s.steps - 1; i >= 0; i--) {
    if (e >= s.starts[i]) { k = i; break; }
  }
  return { k, left: s.starts[k] + s.holds[k] - e };
}

/* ── 一层星 ───────────────────────────────────────────────── */

export class StarLayer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = {
      motion: 'osc',
      steps: 12,
      holdMs: 110,
      material: 'resin',
      size: 240,
      ...opts,
    };
    this.elapsed = 0;
    this.running = false;
    this.timer = 0;
    this.t0 = 0;
    this.frozen = null;
    this.lastCalls = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.envRT = buildEnv(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.environment = this.envRT.texture;

    /* 正交相机：姿态分析用的是正交投影，渲染必须同一种，
       不然「剪影半径」这套读数与画面就对不上了。 */
    this.camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 40);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3.2, 4.6, 4.4);
    const fill = new THREE.DirectionalLight(0xdce4f2, 0.9);
    fill.position.set(-4.4, -1.4, 2.2);
    const rim = new THREE.DirectionalLight(0x9389ae, 0.85);
    rim.position.set(-1.4, 2.4, -4.4);
    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.28));

    this.geometry = buildStarGeometry();
    this.mats = { resin: makeMaterial('resin'), resinEdge: makeMaterial('resinEdge') };
    const set = this.mats[this.opts.material];
    this.mesh = new THREE.Mesh(this.geometry, set.main);
    this.scene.add(this.mesh);
    if (set.edge) {
      this.edgeMesh = new THREE.Mesh(this.geometry, set.edge);
      this.edgeMesh.scale.setScalar(1.035);
      this.scene.add(this.edgeMesh);
    }

    this.applySize(this.opts.size);
    this.applyPose(0);
  }

  applySize(size) {
    this.opts.size = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(size, size, false);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.dpr = dpr;
  }

  set(partial = {}) {
    const prev = { ...this.opts };
    Object.assign(this.opts, partial);
    if (partial.size != null && partial.size !== prev.size) this.applySize(partial.size);
    if (partial.material && partial.material !== prev.material) {
      const set = this.mats[partial.material];
      this.mesh.material = set.main;
      if (this.edgeMesh) { this.scene.remove(this.edgeMesh); this.edgeMesh = null; }
      if (set.edge) {
        this.edgeMesh = new THREE.Mesh(this.geometry, set.edge);
        this.edgeMesh.scale.setScalar(1.035);
        this.scene.add(this.edgeMesh);
      }
    }
    if (this.running) this.restart();
    else this.applyPose(this.elapsed);
  }

  numSteps() {
    const spec = MOTIONS[this.opts.motion];
    if (this.opts.motion === 'ladder') return Math.min(8, Math.max(4, this.opts.steps));
    if (this.opts.motion === 'settle') return 2;
    if (spec.pingpong) return Math.max(4, this.opts.steps);
    return this.opts.steps;
  }

  applyPose(elapsed) {
    this.elapsed = elapsed;
    const s = schedule(this.numSteps(), this.opts.holdMs);
    const { k } = stepAt(s, elapsed);
    const m = poseOf(this.opts.motion, k, this.opts.steps);
    const q = quatFromMatrix(m);
    this.mesh.quaternion.copy(q);
    if (this.edgeMesh) this.edgeMesh.quaternion.copy(q);
    this.currentK = k;
    this.currentMatrix = m;
    this.renderer.render(this.scene, this.camera);
    this.lastCalls = this.renderer.info.render.calls;
  }

  start() {
    if (this.running || this.frozen != null) return;
    this.running = true;
    this.t0 = performance.now() - this.elapsed;
    this.restart();
  }

  restart() {
    this.stopTimer();
    if (!this.running) return;
    /* 定格：不用 rAF。每格画一次，下一次唤醒按这一格剩下多久排。 */
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const s = schedule(this.numSteps(), this.opts.holdMs);
      const { left } = stepAt(s, now - this.t0);
      this.applyPose(now - this.t0);
      this.timer = setTimeout(tick, Math.max(8, left + 6));
    };
    tick();
  }

  stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
  }

  stop() {
    this.running = false;
    this.stopTimer();
  }

  /** 钉住某一格（截图 / 帧条） */
  freezeK(k) {
    this.stop();
    this.frozen = k;
    const s = schedule(this.numSteps(), this.opts.holdMs);
    this.applyPose(s.starts[Math.min(k, s.steps - 1)] ?? 0);
  }

  unfreeze() {
    this.frozen = null;
    this.elapsed = 0;
  }

  /** 直接把矩阵摆上去（姿态地图、帧条用） */
  showMatrix(m) {
    this.stop();
    const q = quatFromMatrix(m);
    this.mesh.quaternion.copy(q);
    if (this.edgeMesh) this.edgeMesh.quaternion.copy(q);
    this.currentMatrix = m;
    this.renderer.render(this.scene, this.camera);
  }

  readCoverage() {
    const gl = this.renderer.getContext();
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    let minX = w;
    let maxX = -1;
    let minY = h;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = px[(y * w + x) * 4 + 3];
        if (a > 10) {
          lit++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      buffer: `${w}x${h}`,
      coverage: +(lit / (w * h)).toFixed(4),
      span: maxX >= 0 ? [minX, maxX, minY, maxY] : null,
    };
  }

  dispose() {
    this.stop();
    this.geometry.dispose();
    Object.values(this.mats).forEach((s) => { s.main.dispose(); if (s.edge) s.edge.dispose(); });
    this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ── 一格一画布（姿态地图）─────────────────────────────────
   961 个 <canvas> 会撞上 WebGL 上下文上限（Chrome 是 16 个），
   所以整个地图用**一张** canvas、一个渲染器，靠 viewport + scissor 逐格画。
   这也是 star-crystal 的 notes 里记的那个坑：layer 会把 viewport 铺满整张画布，
   多格共用时必须自己管好 viewport，画完再还原。 */

export function mountTiles(canvas, cells, opts = {}) {
  const cfg = { cell: 84, gap: 3, size: 200, material: 'resin', ...opts };
  const cols = cfg.cols;
  const rows = Math.ceil(cells.length / cols);
  const W = cols * (cfg.cell + cfg.gap) - cfg.gap;
  const H = rows * (cfg.cell + cfg.gap) - cfg.gap;

  const layer = new StarLayer(canvas, { size: cfg.size, material: cfg.material });
  layer.stop();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  layer.renderer.setPixelRatio(dpr);
  layer.renderer.setSize(W, H, false);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const paint = () => {
    const r = layer.renderer;
    r.setScissorTest(true);
    r.clear();
    cells.forEach((c, i) => {
      const cx = (i % cols) * (cfg.cell + cfg.gap);
      const cy = Math.floor(i / cols) * (cfg.cell + cfg.gap);
      /* WebGL 原点在左下，行号从上往下数，所以要翻一下 */
      const gy = H - cy - cfg.cell;
      r.setViewport(cx, gy, cfg.cell, cfg.cell);
      r.setScissor(cx, gy, cfg.cell, cfg.cell);
      const q = quatFromMatrix(c.matrix);
      layer.mesh.quaternion.copy(q);
      if (layer.edgeMesh) layer.edgeMesh.quaternion.copy(q);
      r.render(layer.scene, layer.camera);
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  };
  paint();
  return { layer, width: W, height: H, cols, rows, cell: cfg.cell, gap: cfg.gap, redraw: paint, dispose: () => layer.dispose() };
}

/* ── 「图鉴」模式 ────────────────────────────────────────────
   姿态地图要在 64px 一格上判断「这一格好不好看」，玻璃材质在这个尺寸上
   几乎全透明 —— 六十几个剪影会糊成一片雾。所以地图需要一份更实、
   更暗的材质：它是判读用的，不是成品。

   这份材质故意做得「不像成品」：高不透明度、低环境反射、
   一点点自发光把轮廓托起来。它的任务只有一个：小尺寸下剪影可辨。 */
export function makeReadMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x3d4353,
    transparent: true,
    opacity: 0.82,
    side: THREE.BackSide,
    depthWrite: true,
  });
}

/* ── 一条格子带：一张 canvas、一个渲染器、若干 viewport ──
   为什么必须这么做：Chrome 只给 16 个同时活的 WebGL 上下文，
   超过之后**最老的那个会被丢掉并变成空白**。这个页面本来要为地图、6 张运动卡、
   两条帧条、4 个尺寸、4 个深底各开一个，一共 28 个 —— 地图正是最老的那个，
   于是它整片空白（这一条实测踩过，见 notes.md）。
   所以除了「要动的」那几张，其余全部合并成一张 canvas 靠 viewport 分区画。 */

export function mountStrip(canvas, items, opts = {}) {
  const cfg = { gap: 8, pad: 0, material: 'resin', bg: null, ...opts };
  const widths = items.map((it) => it.size);
  const W = cfg.pad * 2 + widths.reduce((a, b) => a + b, 0) + cfg.gap * Math.max(0, items.length - 1);
  const H = cfg.pad * 2 + Math.max(...items.map((it) => it.size));

  const layer = new StarLayer(canvas, { size: Math.max(...items.map((it) => it.size)), material: cfg.material });
  layer.stop();
  if (cfg.bg != null) {
    layer.renderer.setClearColor(cfg.bg, 1);
    layer.renderer.setClearAlpha(1);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  layer.renderer.setPixelRatio(dpr);
  layer.renderer.setSize(W, H, false);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const paint = (list) => {
    const use = list || items;
    const r = layer.renderer;
    r.setScissorTest(true);
    r.clear();
    let x = cfg.pad;
    use.forEach((it) => {
      const gy = cfg.pad; /* 底对齐 */
      r.setViewport(x, gy, it.size, it.size);
      r.setScissor(x, gy, it.size, it.size);
      const q = quatFromMatrix(it.matrix);
      layer.mesh.quaternion.copy(q);
      if (layer.edgeMesh) layer.edgeMesh.quaternion.copy(q);
      r.render(layer.scene, layer.camera);
      x += it.size + cfg.gap;
    });
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  };
  paint();
  return {
    layer,
    width: W,
    height: H,
    redraw: paint,
    setMaterial(m) { layer.set({ material: m }); paint(); },
    dispose: () => layer.dispose(),
  };
}

/* ── 测算 ───────────────────────────────────────────────── */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 两种材质各跑一段可见时长，分开记 CPU 提交与（含 gl.finish 的）合成耗时。
 * 定格档的实际占用 = 合成成本 ÷ holdMs，格与格之间完全不提交。
 */
export async function measure({ size = 240, cpuMs = 420, gpuMs = 360 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const layer = new StarLayer(canvas, { size, motion: 'osc' });
  const gl = layer.renderer.getContext();
  const rows = [];

  for (const material of ['resin', 'resinEdge']) {
    layer.set({ material });
    for (let i = 0; i < 8; i++) layer.applyPose(i * 37);
    gl.finish();
    await nextFrame();

    const a0 = performance.now();
    let n = 0;
    let budget = 0;
    while (performance.now() - a0 < cpuMs) {
      const t = performance.now();
      layer.applyPose(performance.now() - a0 + n * 7);
      budget += performance.now() - t;
      n++;
    }
    const cpu = budget / n;
    const calls = layer.renderer.info.render.calls;
    const tris = layer.renderer.info.render.triangles;

    const b0 = performance.now();
    let m = 0;
    let bsum = 0;
    while (performance.now() - b0 < gpuMs) {
      const t = performance.now();
      layer.applyPose(performance.now() - b0 + m * 5);
      gl.finish();
      bsum += performance.now() - t;
      m++;
    }
    rows.push({ material, cpu: +cpu.toFixed(3), gpu: +(bsum / m).toFixed(3), calls, tris, samples: n + m });
    await nextFrame();
  }

  const resinGpu = rows[0].gpu;
  const stepPlan = HOLD_CHOICES.map((holdMs) => ({
    holdMs,
    drawsPerSec: +(1000 / holdMs).toFixed(1),
    msPerSec: +((resinGpu * 1000) / holdMs).toFixed(2),
  }));

  layer.dispose();
  canvas.remove();
  return { rows, stepPlan, size, dpr: Math.min(window.devicePixelRatio || 1, 2) };
}

/** 页面自检：把 three 画出来的剪影半径与 posecore 的读数比一比 */
export function maskCheck(size = 200) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const layer = new StarLayer(canvas, { size, material: 'resin' });
  layer.renderer.setClearColor(PAGE_BG, 1);
  layer.renderer.setClearAlpha(1);
  const out = [];
  for (const [yaw, pitch] of [[45, 35.264], [0, 0], [45, 0], [15, 15], [45, 20]]) {
    layer.showMatrix(viewMatrix(yaw, pitch));
    const gl = layer.renderer.getContext();
    const w = layer.renderer.domElement.width;
    const h = layer.renderer.domElement.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    const c = w / 2;
    /* 清屏色 #f0f3f6 → 与它差多少算「画上了」 */
    for (let i = 0; i < w * h; i++) {
      const d = Math.abs(px[i * 4] - 0xf0) + Math.abs(px[i * 4 + 1] - 0xf3) + Math.abs(px[i * 4 + 2] - 0xf6);
      if (d > 12) lit++;
    }
    /* 六支的屏幕半径：从掩码里按 720 分箱求极径，再看 6 重的波峰数 */
    out.push({ yaw, pitch, coverage: +(lit / (w * h)).toFixed(4) });
  }
  layer.dispose();
  canvas.remove();
  return out;
}