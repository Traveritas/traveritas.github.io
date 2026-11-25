/* ─────────────────────────────────────────────────────────────
   3D 晶体六芒星 · 定格翻动（原型）
   候选：浮在将来某个对话框之上的一层。

   几何：六支四棱锥共心，沿 ±x ±y ±z 伸出；每支的底是过原点的正方形，
   于是每对相对的两支合成一枚「双锥」，三枚双锥共有同一个核心。
   横截面用八角形（正方形切角）而不是正方形 —— 八个面片天然被窄斜边分开，
   棱线因此能吃到光，这就是「chamfer」。
   六个锥体的底环互相埋在别的锥体内部：深度缓冲会把它们挡掉，不必做布尔并集。

   材质三档：
     cheap   —— 虹彩 + 清漆 + 低粗糙度 + 程序化 PMREM 环境贴图（无下载）
     refract —— transmission 1 / ior 1.72（文档说默认不用，这里照实测）
     resin   —— 站点自己的材质语言：磨砂半透明 + 强边缘光

   运动：定格。姿态量化到 360/steps 的格子上，每格保持 holdMs 不动；
   一整圈之后的那个保持格外长（呼吸停歇，同 brand.ts 的「7 步轮转 + 3 秒停歇」）。
   因为姿态是离散的，这里根本不用 rAF —— setTimeout 链在每一格渲染一次，
   同样的时钟也能推出「现在该是第几格」，所以标签页被藏起来再回来不会错格。

   一切尺寸都按 CSS px 喂，DPR 封顶 2。
   ───────────────────────────────────────────────────────────── */

import * as THREE from 'three';

const DEG = Math.PI / 180;

/* 一整圈的保持格数之后那次加长的倍数：同 brand.ts「7 步轮转 + 3 秒呼吸」的 3× */
const BREATH = 3.2;
/* 每转满一圈，yaw 只走这么多度。刻意不取 90 的倍数：
   这颗星是八面体对称群，绕 x 转 90° 会与自身重合 —— 若 yaw 也不动，
   steps=8 的一圈里就只有 2 个不重样的姿态。偏一点，四个四分之一圈才各自不同。 */
const YAW_PER_REV = 46;
/* 基准视：正等轴（与 toolstar.ts drawStar 的 yaw 45° / pitch 35.264° 同一角度） */
const BASE_PITCH = 35.264;
const BASE_YAW = 45;

export const VARIANTS = ['cheap', 'refract', 'resin'];
export const STEPS_CHOICES = [8, 12, 16, 24];
export const HOLD_CHOICES = [60, 90, 110, 160];

/* ── 几何 ─────────────────────────────────────────────────── */

const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

/** 正方形（半边长 w）切角 c 之后的 8 个点，逆时针 */
function octagon(w, c) {
  const k = Math.max(0, w - c);
  return [
    [w, k], [k, w], [-k, w], [-w, k],
    [-w, -k], [-k, -w], [k, -w], [w, -k],
  ];
}

/**
 * 六芒星实体。
 *
 * 每支的轮廓（沿轴 z 从 0 到 tip）刻意做成「鼓腹 + 利尖」：
 *   腰部在 38% 处最粗，之后一路收细到 tip —— 如果从 0 线性收到尖端，
 *   六支就是六根针，白底上读不出「星」而读成一团平面的尖角。
 *   腹腰插值用 (1-t)^0.55：靠近根部收得慢，靠近尖端收得快，尖端附近因此锐利。
 *
 * @param {object} o
 * @param {number} o.tip       尖端到中心的距离
 * @param {number} o.waist     腹部最粗处的半径（相对 tip）
 * @param {number} o.belly     腹部所在的轴向位置（0–1）
 * @param {number} o.chamfer   切角占边长比例（切八角 → 每个棱面都被一条窄斜边分开）
 * @param {number} o.joint     根部半径（相对 waist）：各支在此处窄一些，接缝才像水晶的收腰
 */
export function buildStarGeometry({
  tip = 1,
  waist = 0.175,
  belly = 0.28,
  waistBelly = 1.08,
  chamfer = 0.24,
  joint = 0.42,
} = {}) {
  const pos = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ref = new THREE.Vector3();

  const tri = (p0, p1, p2, axisPoint) => {
    a.copy(p1).sub(p0);
    b.copy(p2).sub(p0);
    n.crossVectors(a, b);
    ref.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3).sub(axisPoint);
    if (ref.lengthSq() < 1e-12) ref.set(0, 0, 0).sub(p0);
    if (n.dot(ref) < 0) {
      pos.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
    } else {
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  };

  for (const axis of AXES) {
    for (const sign of [1, -1]) {
      const zdir = axis.clone().multiplyScalar(sign);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), zdir);
      const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const at = (u, v, z) => new THREE.Vector3()
        .addScaledVector(ex, u)
        .addScaledVector(ey, v)
        .addScaledVector(zdir, z);

      /* 一串沿轴的环：根部(joint) → 腹部(waist) → 尖端前的一个小环，然后收成尖点 */
      const stations = [
        { z: 0.0, r: waist * joint },
        { z: belly * tip, r: waist * waistBelly },
        { z: 0.72 * tip, r: waist * 0.34 },
        { z: 0.9 * tip, r: waist * 0.12 },
      ];
      const rings = stations.map((s) => octagon(s.r, s.r * chamfer).map(([u, v]) => at(u, v, s.z)));
      const tipPoint = at(0, 0, tip);
      const axisMid = zdir.clone().multiplyScalar(tip * 0.5);

      for (let s = 0; s < rings.length - 1; s++) {
        const A = rings[s];
        const B = rings[s + 1];
        for (let i = 0; i < 8; i++) {
          const j = (i + 1) % 8;
          tri(A[i], B[i], B[j], axisMid);
          tri(A[i], B[j], A[j], axisMid);
        }
      }
      const last = rings[rings.length - 1];
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        tri(tipPoint, last[i], last[j], axisMid);
      }
      /* 根部：六支的根在原点附近互相穿插，这层封口会被别的支挡掉，但能保证没有漏光 */
      const first = rings[0];
      const centre = at(0, 0, 0);
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        tri(centre, first[j], first[i], axisMid);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ── 程序化环境贴图（无下载）─────────────────────────────── */

function buildEnvMap(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const g = cv.getContext('2d');

  /* 竖切面：天顶白 → 地平线亮 → 地面压暗。
     地面这一段是必需的 —— 全是亮面的环境里，一颗白的晶体在白底上等于看不见。
     晶体之所以是晶体，靠的是「有几张脸亮、有几张脸暗」，那个明暗必须来自环境本身。
     所以这里不是一圈均匀的白，而是亮斑 / 灰面 / 暗脚三档混在一起。 */
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0.0, '#ffffff');
  sky.addColorStop(0.22, '#f7f9fc');
  sky.addColorStop(0.42, '#dde4ee');
  sky.addColorStop(0.52, '#ffffff');
  sky.addColorStop(0.62, '#c3ccd9');
  sky.addColorStop(0.78, '#8b96a6');
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
  /* 三个亮斑（窗）＋ 几块压暗的墙 —— 棱面经过它们时会一亮一暗地扫过去，这就是「折射感」 */
  blob(268, 132, 210, '#ffffff', 1.0);
  blob(760, 96, 150, '#ffffff', 0.9);
  blob(120, 250, 170, '#ffffff', 0.55);
  blob(560, 300, 260, '#d6cfe6', 0.5); /* 一点薄暮紫，取自 --dream */
  blob(900, 210, 190, '#6e7a8b', 0.55); /* 暗墙 */
  blob(400, 236, 150, '#7b8494', 0.42);
  blob(20, 420, 300, '#3f4854', 0.7); /* 暗脚 */

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

/* ── 材质 ─────────────────────────────────────────────────── */

/* 边缘光：把 fresnel 加到自发光项上。resin 档靠它把磨砂体积的边缘提出来，
   否则半透明树脂在浅底上会糊成一团。 */
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

/* 站点底色：不透明档把画布清成这个色，画布与页面之间就没有接缝 */
export const PAGE_BG = 0xf0f3f6;

function makeMaterial(variant) {
  if (variant === 'refract') {
    /* 折射在透明画布上是一块死白 —— 它「折射」的是同一个场景里的东西，
       而透明画布的场景里什么也没有，背板是空的。实测（.refract2.html / notes.md）：
       只有画布不透明、且清屏色就是页面底色时，棱面之间才有被弯折的明暗差。
       代价是这个元素不再是「透明图层」，它会挖掉一个方形。 */
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.06,
      transmission: 1,
      ior: 1.72,
      thickness: 1.15,
      attenuationColor: new THREE.Color(0xdfe7f3),
      attenuationDistance: 2.2,
      iridescence: 0.35,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [180, 520],
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      specularIntensity: 1,
      envMapIntensity: 1.2,
      /* 双面：折射档是薄壳，背面不画会露出空心 */
      side: THREE.DoubleSide,
    });
  }
  if (variant === 'resin') {
    /* 磨砂半透明树脂 —— 站点自己的材质语言。
       这一档刻意 transmission: 0：实测（notes.md）只要 transmission 非零，
       three 就开一遍完整的 transmissive pass —— 2 个 draw call、768 个三角形，
       与 refract 一档同价；而我们只想要 24% 的透。用 opacity 拿到同一观感，
       代价是 1 个 draw call。这半价是白捡的，没有理由不捡。 */
    return patchRim(
      new THREE.MeshPhysicalMaterial({
        color: 0xe9edf3,
        metalness: 0,
        roughness: 0.46,
        transparent: true,
        opacity: 0.78,
        ior: 1.45,
        iridescence: 0.26,
        iridescenceIOR: 1.25,
        clearcoat: 0.4,
        clearcoatRoughness: 0.5,
        sheen: 0.7,
        sheenRoughness: 0.75,
        sheenColor: new THREE.Color(0xdfe4ee),
        envMapIntensity: 0.92,
        side: THREE.DoubleSide,
      }),
      0xdfe6f0,
      2.4,
      0.5,
    );
  }
  /* cheap：文档点名的平价组合 —— 透明/低粗糙度/环境贴图/虹彩，不碰 transmission。
     虹彩压到 0.30（原型初期用 0.85 时会泛出一层明确的粉紫）：站点只有一个异质色，
     虹彩在这里只能当「棱边的高光偏冷」用，不能自己长出一道彩虹。 */
  return new THREE.MeshPhysicalMaterial({
    color: 0xf7f9fc,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.30,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [180, 520],
    specularIntensity: 1,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}

/* 这一档能不能活在透明画布上 */
export function needsOpaqueCanvas(variant) {
  return variant === 'refract';
}

/* ── 定格时钟 ─────────────────────────────────────────────── */

const schedCache = new Map();

/**
 * 一圈的保持时长表：最后一格之后多停 BREATH 倍（呼吸停歇）。
 * 返回值还能回答「经过 elapsed 毫秒时应是第几格、这一格还剩多久」。
 */
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

/** elapsed → { k, left }：第 k 格，这一格还剩 left 毫秒 */
export function stepAt(s, elapsed) {
  const e = ((elapsed % s.total) + s.total) % s.total;
  let k = 0;
  for (let i = s.steps - 1; i >= 0; i--) {
    if (e >= s.starts[i]) { k = i; break; }
  }
  return { k, left: s.starts[k] + s.holds[k] - e };
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_DIAG = new THREE.Vector3(1, 1, 0).normalize();

export function axisVector(name) {
  return name === 'diag' ? AXIS_DIAG : AXIS_X;
}

/* ── 一层星 ───────────────────────────────────────────────── */

/* 画布读回：不透明档的 alpha 恒为 255，所以判据必须是「这个像素和清屏色差多少」
   而不是「alpha 是不是 0」。两种档统一用同一条判据。 */
function readCoverage(renderer) {
  const gl = renderer.getContext();
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const opaque = renderer.getClearAlpha() > 0.5;
  /* 清屏色的 sRGB 分量（three 的 clearColor 是线性的，这里只需要一个粗糙参照） */
  const cc = renderer.getClearColor(new THREE.Color());
  const bg = [
    Math.round(Math.pow(cc.r, 1 / 2.2) * 255),
    Math.round(Math.pow(cc.g, 1 / 2.2) * 255),
    Math.round(Math.pow(cc.b, 1 / 2.2) * 255),
  ];
  let lit = 0;
  let maxA = 0;
  let peak = 0;
  let minX = w;
  let maxX = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = px[i + 3];
      if (a > maxA) maxA = a;
      let d;
      if (opaque) {
        d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
      } else {
        d = a;
      }
      if (d > 8) {
        lit++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (d > peak) peak = d;
    }
  }
  return {
    buffer: `${w}x${h}`,
    opaque,
    coverage: +(lit / (w * h)).toFixed(3),
    maxAlpha: maxA,
    contrast: peak,
    spanX: maxX >= 0 ? [minX, maxX] : null,
  };
}

export class StarLayer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = {
      variant: 'cheap',
      steps: 12,
      holdMs: 110,
      axis: 'x',
      mode: 'step',
      size: 240,
      ...opts,
    };
    this.elapsed = 0;
    this.frozen = null;
    this.running = false;
    this.timer = 0;
    this.raf = 0;
    this.t0 = 0;
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
    this.renderer.toneMappingExposure = 1.02;

    this.envRT = buildEnvMap(this.renderer);
    this.scene = new THREE.Scene();
    this.scene.environment = this.envRT.texture;

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    this.camera.position.set(0, 0, 5.4);
    this.camera.lookAt(0, 0, 0);

    /* 三盏灯：主光在左上、冷补光在右下、薄暮紫的背光勾一道边 */
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3.2, 4.4, 4.6);
    const fill = new THREE.DirectionalLight(0xdce4f2, 0.85);
    fill.position.set(-4.2, -1.6, 2.4);
    const rim = new THREE.DirectionalLight(0x9a86c4, 0.8);
    rim.position.set(-1.6, 2.2, -4.4);
    this.scene.add(key, fill, rim);

    this.geometry = buildStarGeometry();
    this.materials = {
      cheap: makeMaterial('cheap'),
      refract: makeMaterial('refract'),
      resin: makeMaterial('resin'),
    };
    this.mesh = new THREE.Mesh(this.geometry, this.materials[this.opts.variant]);
    this.scene.add(this.mesh);

    this.applyOpaqueness();
    this.applySize(this.opts.size);
    this.draw(0);
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
    let needDraw = false;
    if (partial.size != null && partial.size !== prev.size) {
      this.applySize(partial.size);
      needDraw = true;
    }
    Object.assign(this.opts, partial);
    if (partial.variant && partial.variant !== prev.variant) {
      this.mesh.material = this.materials[partial.variant];
      /* 换上折射档时画布必须变成不透明的，否则整颗星塌成一片死白 */
      this.applyOpaqueness();
      needDraw = true;
    }
    if (partial.steps || partial.holdMs || partial.axis || partial.mode) needDraw = true;
    if (needDraw && this.running) this.restart();
    else if (needDraw) this.draw(this.elapsed);
  }

  applyOpaqueness() {
    /* canvasMode 用来把「强制透明」摆出来做对照：
       折射档在透明画布上会塌成一片死白，那条失败轨迹本身是要被看见的。 */
    const mode = this.opts.canvasMode || 'auto';
    const opaque = mode === 'opaque' ? true : mode === 'alpha' ? false : needsOpaqueCanvas(this.opts.variant);
    this.opaque = opaque;
    if (opaque) {
      this.renderer.setClearColor(PAGE_BG, 1);
      this.renderer.setClearAlpha(1);
      this.canvas.style.background = '#f0f3f6';
    } else {
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setClearAlpha(0);
      this.canvas.style.background = 'transparent';
    }
  }

  poseFor(elapsed) {
    const { steps, holdMs, axis, mode } = this.opts;
    const s = schedule(steps, holdMs);
    let tumble;
    let yaw;
    if (mode === 'smooth') {
      const f = (((elapsed % s.total) + s.total) % s.total) / s.total;
      tumble = f * 360;
      yaw = f * YAW_PER_REV;
    } else {
      const { k } = stepAt(s, elapsed);
      tumble = (k * 360) / steps;
      yaw = (k * YAW_PER_REV) / steps;
    }
    return { tumble, yaw };
  }

  applyPose(elapsed) {
    const { tumble, yaw } = this.poseFor(elapsed);
    const qBase = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(BASE_PITCH * DEG, BASE_YAW * DEG, 0, 'YXZ'),
    );
    const qTumble = new THREE.Quaternion().setFromAxisAngle(axisVector(this.opts.axis), tumble * DEG);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(Y_UP, yaw * DEG);
    this.mesh.quaternion.copy(qYaw).multiply(qTumble).multiply(qBase);
  }

  draw(elapsed) {
    this.elapsed = elapsed;
    this.applyPose(elapsed);
    this.renderer.render(this.scene, this.camera);
    this.lastCalls = this.renderer.info.render.calls;
  }

  /* ── 驱动器 ── */
  start() {
    if (this.running || this.frozen != null) return;
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
    /* 定格：不用 rAF。每一格画一次，下一次唤醒按这一格剩余时间排。 */
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

  /* 截图 / 静帧：钉死在第 k 格 */
  freeze(k) {
    this.stop();
    this.frozen = k;
    const s = schedule(this.opts.steps, this.opts.holdMs);
    this.draw(s.starts[k] ?? 0);
  }

  unfreeze() {
    if (this.frozen == null) return;
    this.frozen = null;
    this.elapsed = 0;
  }

  probe() {
    this.draw(this.elapsed);
    return { variant: this.opts.variant, calls: this.lastCalls, ...readCoverage(this.renderer) };
  }

  dispose() {
    this.stop();
    this.geometry.dispose();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.envRT.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/* ── 方格表：一张 canvas、一个渲染器、若干 viewport ──
   用于两件事：静止帧条（一行六格）与小尺寸/少步数的粒度矩阵（多行不同尺寸）。
   每格都由「第 k 格」的时刻算出姿态，所以格子之间是严格的定格序列，不是随手摆的。 */

export function mountGrid(canvas, opts = {}) {
  const cfg = {
    rows: [{ steps: 12, size: 240 }],
    variant: 'cheap',
    holdMs: 110,
    axis: 'x',
    gap: 14,
    pad: 0,
    animate: false,
    ...opts,
  };

  const maxCount = Math.max(...cfg.rows.map((r) => (r.poses ? r.poses.length : r.steps)));
  const slot = Math.max(...cfg.rows.map((r) => r.size)) + cfg.gap;
  const W = cfg.pad * 2 + maxCount * slot - cfg.gap;
  const H = cfg.pad * 2 + cfg.rows.reduce((a, r) => a + r.size + cfg.gap, 0) - cfg.gap;

  const layer = new StarLayer(canvas, { size: Math.max(...cfg.rows.map((r) => r.size)), mode: 'step' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  layer.renderer.setPixelRatio(dpr);
  layer.renderer.setSize(W, H, false);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  /* 每格的 CSS 左上角，给页面上的标注用 */
  const cells = [];
  let y = cfg.pad;
  for (const row of cfg.rows) {
    const poses = row.poses ?? [...Array(row.steps).keys()];
    poses.forEach((k, i) => {
      cells.push({
        k,
        size: row.size,
        left: cfg.pad + i * slot + (slot - cfg.gap - row.size) / 2,
        top: y,
        steps: row.steps,
      });
    });
    y += row.size + cfg.gap;
  }

  const paint = () => {
    const r = layer.renderer;
    r.setScissorTest(true);
    y = cfg.pad;
    for (const row of cfg.rows) {
      const poses = row.poses ?? [...Array(row.steps).keys()];
      const holdMs = row.holdMs ?? cfg.holdMs;
      const s = schedule(row.steps, holdMs);
      /* 姿态由 layer.opts 推出来，所以把这一行的参数装进去再画 */
      layer.opts.steps = row.steps;
      layer.opts.holdMs = holdMs;
      layer.opts.axis = row.axis ?? cfg.axis;
      layer.opts.mode = 'step';
      layer.opts.variant = row.variant ?? cfg.variant;
      /* 表格里每一格都自带一块底：折射档必须有底可折，否则一格一片白 */
      layer.opts.canvasMode = 'opaque';
      layer.mesh.material = layer.materials[layer.opts.variant];
      layer.applyOpaqueness();
      const gy = H - y - row.size; /* WebGL 原点在左下 */
      poses.forEach((k, i) => {
        const x = cfg.pad + i * slot + (slot - cfg.gap - row.size) / 2;
        r.setViewport(x, gy, row.size, row.size);
        r.setScissor(x, gy, row.size, row.size);
        r.clear();
        layer.draw(s.starts[k] ?? 0);
      });
      y += row.size + cfg.gap;
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  };

  paint();

  return {
    layer,
    cells,
    width: W,
    height: H,
    set(partial) {
      Object.assign(cfg, partial);
      paint();
    },
    redraw: paint,
    /* 读回整张格子表的覆盖率。
       读之前必须先 paint（保证内容在），读完再 paint 一次把画面还原 ——
       layer.draw 会把 viewport 铺满整张 canvas，不还原就会留下一颗盖住全表的巨星。 */
    probe() {
      paint();
      const res = readCoverage(layer.renderer);
      paint();
      return { ...res, calls: layer.lastCalls };
    },
    dispose() { layer.dispose(); },
  };
}

/* ── 测算 ─────────────────────────────────────────────────── */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * 三档材质各跑一段可见时长，分开记 CPU 提交与（含 gl.finish 的）GPU 合成耗时。
 * 默认总时长约 3 秒。
 */
export async function measureVariants({ size = 480, cpuMs = 500, gpuMs = 420 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText = `position:fixed;left:-4000px;top:0;width:${size}px;height:${size}px`;
  document.body.appendChild(canvas);
  const layer = new StarLayer(canvas, { size, mode: 'smooth' });
  const gl = layer.renderer.getContext();
  const rows = [];

  for (const variant of VARIANTS) {
    layer.set({ variant, mode: 'smooth' });
    for (let i = 0; i < 8; i++) layer.draw(i * 41);
    gl.finish();
    await nextFrame();

    const a0 = performance.now();
    let n = 0;
    let budget = 0;
    let max = 0;
    while (performance.now() - a0 < cpuMs) {
      const t = performance.now();
      layer.draw(t - a0);
      const d = performance.now() - t;
      budget += d;
      if (d > max) max = d;
      n++;
    }
    const cpu = budget / n;
    const calls = layer.renderer.info.render.calls;
    const tris = layer.renderer.info.render.triangles;
    const programs = layer.renderer.info.programs.length;

    const b0 = performance.now();
    let m = 0;
    let bsum = 0;
    while (performance.now() - b0 < gpuMs) {
      const t = performance.now();
      layer.draw(t - b0);
      gl.finish();
      bsum += performance.now() - t;
      m++;
    }
    const gpu = bsum / m;

    rows.push({
      variant,
      opaque: !!layer.opaque,
      cpu: +cpu.toFixed(3),
      cpuMax: +max.toFixed(2),
      gpu: +gpu.toFixed(3),
      calls,
      tris,
      programs,
      samples: n + m,
    });
    await nextFrame();
  }

  /* 定格一档的实际占用：每 holdMs 画一次，其余时间完全不提交 */
  const stepPlan = [60, 90, 110, 160].map((holdMs) => {
    const cheapRow = rows.find((r) => r.variant === 'cheap');
    const refractRow = rows.find((r) => r.variant === 'refract');
    return {
      holdMs,
      cheapPerSec: +((cheapRow.gpu * 1000) / holdMs).toFixed(2),
      refractPerSec: +((refractRow.gpu * 1000) / holdMs).toFixed(2),
      drawsPerSec: +(1000 / holdMs).toFixed(1),
    };
  });

  layer.dispose();
  canvas.remove();
  return { rows, stepPlan, size, dpr: layer.dpr };
}