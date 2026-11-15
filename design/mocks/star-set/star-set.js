/* 星 · 三轴晶体星（design/mocks/star-set）
   ±x ±y ±z 六支，就是左下角工具栏那颗星的真立体版：停在 yaw 45° / pitch 35.264°，
   六支投影成间隔 60° 的六芒。一体成形：24 片风筝形刻面，没有单独的芯；粗细三档。
   材质：只画平面刻面。背面一遍（出射折射、三通道色散、全反射），正面一遍（菲涅耳反射 +
   薄膜虹彩 + 一点正面折射 + 棱线）。环境是程序化影棚：淡彩亮箱 + 暗卡。
   运动：几根轴同时转、叠成一条曲线；时间上先快后慢；位姿只在节拍上跳（定格）。落地与起点全同。 */

import * as THREE from '/three/three.module.js';

/* ───────────── 几何：由多边形刻面拼成，平面法线 + 棱线遮罩 ───────────── */

function buildGeometry(polys) {
  const pos = [], nor = [], bar = [], msk = [];
  for (const poly of polys) {
    let p = poly.map((v) => new THREE.Vector3(...v));
    const c = p.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / p.length);
    const n = new THREE.Vector3();
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      n.x += (a.y - b.y) * (a.z + b.z);
      n.y += (a.z - b.z) * (a.x + b.x);
      n.z += (a.x - b.x) * (a.y + b.y);
    }
    n.normalize();
    if (n.dot(c) < 0) { p = p.reverse(); n.negate(); } // 星形体：刻面中心总在原点外侧
    for (let i = 1; i < p.length - 1; i++) {
      const tri = [p[0], p[i], p[i + 1]];
      const m = [1, i + 1 === p.length - 1 ? 1 : 0, i === 1 ? 1 : 0];
      const bs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      tri.forEach((v, k) => {
        pos.push(v.x, v.y, v.z);
        nor.push(n.x, n.y, n.z);
        bar.push(...bs[k]);
        msk.push(...m);
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bar, 3));
  g.setAttribute('emask', new THREE.Float32BufferAttribute(msk, 3));
  return g;
}

/** 一体：每支的四个刻面直接延伸进卦限里的凹点 V，中间不再有一块单独的芯。
    每个卦限里是三片风筝形，交在 V 上；全身只剩两种线——支上的棱（尖 → E）与凹槽（E → V）。
    V 取在让风筝形恰好平整的那一点：v = wL / (2L − w)。 */
function onePolys({ L = 1, w = 0.15 } = {}) {
  const v = (w * L) / (2 * L - w);
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const V = [v * sx, v * sy, v * sz];
    const tx = [L * sx, 0, 0], ty = [0, L * sy, 0], tz = [0, 0, L * sz];
    const exy = [w * sx, w * sy, 0], eyz = [0, w * sy, w * sz], ezx = [w * sx, 0, w * sz];
    out.push([tx, exy, V, ezx], [ty, eyz, V, exy], [tz, ezx, V, eyz]);
  }
  return out;
}

const VARIANTS = {
  thin: { w: 0.12 },
  mid: { w: 0.155 },
  thick: { w: 0.2 },
};
const GEO = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, buildGeometry(onePolys(v))]));

/* ───────────── 材质 ───────────── */

const VS = /* glsl */ `
attribute vec3 bary;
attribute vec3 emask;
varying vec3 vN;
varying vec3 vP;
varying vec3 vB;
varying vec3 vM;
varying float vR;
void main() {
  vR = length(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vB = bary;
  vM = emask;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FS = /* glsl */ `
uniform float uPass;   // 0 背面出射，1 正面
uniform float uDream;  // 0 醒 1 梦
uniform float uIor;
uniform float uColor;  // 彩：0 淡 → 1 浓
uniform float uAlpha;  // 体的不透明度
uniform float uDark;   // 深底
varying vec3 vN;
varying vec3 vP;
varying vec3 vB;
varying vec3 vM;
varying float vR;

float box(vec3 d, vec3 c, float w, float h, float soft) {
  c = normalize(c);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 u = cross(c, r);
  float k = dot(d, c);
  if (k <= 0.05) return 0.0;
  vec2 p = vec2(dot(d, r), dot(d, u)) / k;
  return (1.0 - smoothstep(w, w + soft, abs(p.x))) * (1.0 - smoothstep(h, h + soft, abs(p.y)));
}

vec3 env(vec3 d) {
  vec3 top = mix(vec3(0.92, 0.93, 0.98), vec3(0.95, 0.90, 0.97), uDream);
  vec3 hor = vec3(1.0, 0.985, 0.98);
  vec3 bot = mix(vec3(0.66, 0.65, 0.74), vec3(0.66, 0.58, 0.72), uDream);
  vec3 c = d.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.7, d.y)) : mix(hor, bot, smoothstep(0.0, 0.45, -d.y));
  vec3 ink = mix(vec3(0.42, 0.42, 0.52), vec3(0.46, 0.38, 0.54), uDream);
  float cs = 0.5 + 0.9 * uColor; // 淡彩亮箱的饱和度
  vec3 ice = mix(vec3(1.0), vec3(0.70, 0.86, 1.0), cs);
  vec3 rose = mix(vec3(1.0), vec3(1.0, 0.74, 0.86), cs);
  vec3 mint = mix(vec3(1.0), vec3(0.76, 1.0, 0.90), cs);
  vec3 peach = mix(vec3(1.0), vec3(1.0, 0.86, 0.72), cs);
  vec3 lilac = mix(vec3(1.0), vec3(0.84, 0.76, 1.0), cs);
  c = mix(c, ink * 0.85, box(d, vec3(-0.95, -0.15, 0.35), 0.4, 0.8, 0.06));
  c = mix(c, ink, box(d, vec3(0.35, -0.25, -0.9), 0.45, 0.25, 0.10) * 0.7);
  c = mix(c, ink * 1.2, box(d, vec3(0.9, 0.55, 0.2), 0.12, 0.6, 0.04) * 0.7);
  c = mix(c, vec3(1.25) * lilac, box(d, vec3(-0.45, 0.7, 0.6), 0.45, 0.3, 0.03));
  c = mix(c, vec3(1.15) * ice, box(d, vec3(0.85, 0.05, 0.55), 0.09, 0.8, 0.02));
  c = mix(c, vec3(1.1) * rose, box(d, vec3(-0.25, 0.35, -0.9), 0.5, 0.25, 0.05));
  c = mix(c, vec3(1.05) * mint, box(d, vec3(-0.6, -0.55, -0.6), 0.35, 0.3, 0.06));
  c = mix(c, vec3(1.05) * peach, box(d, vec3(0.6, 0.6, -0.5), 0.25, 0.25, 0.10));
  c = mix(c, vec3(1.1) * ice, box(d, vec3(0.1, -0.8, 0.6), 0.5, 0.15, 0.05) * 0.8);
  return c;
}

// 薄膜虹彩：随视角走一圈淡彩
vec3 film(float x) {
  return 0.5 + 0.5 * cos(6.2832 * (x * 1.7 + vec3(0.0, 0.33, 0.67)));
}

float edge() {
  vec3 fw = fwidth(vB);
  vec3 eb = smoothstep(vec3(0.0), fw * 1.3, vB);
  vec3 em = mix(vec3(1.0), eb, vM);
  return 1.0 - min(min(em.x, em.y), em.z);
}

void main() {
  vec3 I = normalize(vP - cameraPosition);
  vec3 N = normalize(vN);
  vec3 tint = mix(vec3(0.96, 0.96, 1.0), vec3(0.99, 0.94, 1.0), uDream);
  float e = edge();
  float disp = mix(0.012, 0.045, uColor) * (1.0 + 0.6 * uDream);

  if (uPass < 0.5) {
    vec3 n = -N;
    vec3 col;
    for (int i = 0; i < 3; i++) {
      float eta = uIor + (float(i) - 1.0) * disp;
      vec3 o = refract(I, n, eta);
      vec3 s = dot(o, o) < 1e-4 ? env(reflect(I, n)) * 0.85 : env(o);
      col[i] = i == 0 ? s.r : (i == 1 ? s.g : s.b);
    }
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, mix(0.55, 1.0, uColor));
    col *= tint;
    float a = uAlpha;
    gl_FragColor = vec4(col * a, a);
    return;
  }

  float ndv = max(dot(-I, N), 0.0);
  float F = 0.06 + 0.94 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(I, N);
  vec3 refl = env(R) * mix(vec3(1.0), film(ndv), 0.15 + 0.4 * uColor);
  vec3 refr = env(refract(I, N, 1.0 / uIor)) * tint;
  float k = 0.12;
  vec3 col = refl * F + refr * k * (1.0 - F);
  float a = F + k * (1.0 - F);
  float spec = pow(max(dot(R, normalize(vec3(-0.45, 0.7, 0.6))), 0.0), 600.0) * 1.6;
  col += vec3(spec); a += spec;
  // 棱线：浅底上是一道淡薄暮灰（白棱在白底上会断），深底上是亮棱
  vec3 ec = mix(vec3(0.58, 0.56, 0.70), vec3(1.0), uDark);
  float ew = e * 0.42 * smoothstep(0.14, 0.5, vR); // 中心不画线：一体，由刻面明暗自己读出来
  col = col * (1.0 - ew) + ec * ew; a = a * (1.0 - ew) + ew;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

function makeMaterial(pass, side, colorWrite = true) {
  return new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    side,
    transparent: true,
    depthTest: true,
    depthWrite: pass !== 'front',
    depthFunc: pass === 'front' ? THREE.LessEqualDepth : THREE.LessDepth,
    colorWrite,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uPass: { value: pass === 'back' ? 0 : 1 },
      uDream: { value: 0 },
      uIor: { value: 1.6 },
      uColor: { value: 0.5 },
      uAlpha: { value: 0.55 },
      uDark: { value: 0 },
    },
  });
}
const MAT = {
  back: makeMaterial('back', THREE.BackSide),
  depth: makeMaterial('depth', THREE.FrontSide, false),
  front: makeMaterial('front', THREE.FrontSide),
};

/* ───────────── 渲染：一张共享的 WebGL 画布，逐格画完拷进各自的 2D 画布 ───────────── */

const MAX = 1200;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
renderer.setPixelRatio(1);
renderer.setSize(MAX, MAX, false);
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);
const camera = new THREE.PerspectiveCamera(16, 1, 0.1, 50);
camera.position.set(0, 0, 1.04 / Math.tan(THREE.MathUtils.degToRad(8)));
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

function renderSlot(slot) {
  const px = Math.min(MAX, Math.round(slot.size * slot.dpr));
  slot.mesh.updateMatrixWorld(true);
  renderer.setViewport(0, 0, px, px);
  renderer.setScissor(0, 0, px, px);
  renderer.setScissorTest(true);
  renderer.clear(true, true);
  for (const m of Object.values(MAT)) {
    m.uniforms.uDream.value = state.dream;
    m.uniforms.uColor.value = state.color;
    m.uniforms.uAlpha.value = state.alpha;
    m.uniforms.uDark.value = slot.dark ? 1 : 0;
  }
  for (const pass of ['back', 'depth', 'front']) {
    slot.mesh.material = MAT[pass];
    renderer.render(slot.scene, camera);
  }
  slot.ctx.clearRect(0, 0, px, px);
  slot.ctx.drawImage(renderer.domElement, 0, MAX - px, px, px, 0, 0, px, px);
}

/* ───────────── 姿态与转法 ───────────── */

const D = THREE.MathUtils.degToRad;
const qAxis = (x, y, z, deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), D(deg));
const PITCH = 35.264; // 与 yaw 45° 合起来，正好沿体对角线看过去：六支投影成正六芒
/** 本体姿态：先绕 y 支转 yaw，再整体仰 PITCH —— 与 toolstar.ts 的 drawStar() 同一套角。 */
const pose = (yaw) => qAxis(1, 0, 0, PITCH).multiply(qAxis(0, 1, 0, 45 + yaw));

/* 转动是一条曲线，不是一根轴：同时绕几根轴各转一个角度，按同一个进度 s 叠起来——
     q(s) = rest · Rx(θx·s) · Ry(θy·s) · Rz(θz·s) · Rd(θd·s)
   x / y / z 是三支，θ 取 90° 的整数倍；d 是体对角线 (1,1,1)，θd 取 120° 的整数倍。
   每一项单独到 s = 1 时都是星的自身对称，乘起来也是 —— 所以落地与起点全同，
   而中途转轴一直在变，走的是一条弯的路。 */
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 1, 1).normalize()];
const pick = (xs) => xs[(Math.random() * xs.length) | 0];
function planCurve() {
  for (;;) {
    // 一到一圈半：两三项、合计 270–450°（再多就成了陀螺）
    const th = [pick([0, 90, 180]), pick([0, 90, 180, 270]), pick([0, 90, 180]), pick([0, 0, 120])]
      .map((d) => d * (Math.random() < 0.5 ? -1 : 1));
    const live = th.filter((d) => d).length;
    const sum = th.reduce((a, d) => a + Math.abs(d), 0);
    if (live >= 2 && live <= 3 && sum >= 270 && sum <= 450) return th;
  }
}
const REST = pose(0);
const q1 = new THREE.Quaternion();
function curveAt(th, s, out) {
  out.copy(REST);
  th.forEach((d, i) => d && out.multiply(q1.setFromAxisAngle(AX[i], D(d * s))));
  return out;
}

/** 先快后慢 */
const EASE = {
  cubic: (t) => 1 - Math.pow(1 - t, 3),
  quart: (t) => 1 - Math.pow(1 - t, 4),
  expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t)) / (1 - Math.pow(2, -9)),
};

/* ───────────── 时钟 ───────────── */

const state = {
  fps: 10,       // 0 = 连续；否则位姿只在节拍上更新（定格）
  dur: 2,        // 一次转动的秒数
  ease: 'quart',
  dream: 0,
  color: 0.9,    // 浓
  alpha: 0.38,   // 很透
  auto: true,
};
const slots = [];

export function mount(el, variant, opts = {}) {
  const size = opts.size || 200;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(MAX, Math.round(size * dpr));
  canvas.style.width = canvas.style.height = size + 'px';
  el.appendChild(canvas);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(GEO[variant], MAT.front);
  mesh.quaternion.copy(REST);
  scene.add(mesh);
  const slot = {
    el, canvas, ctx: canvas.getContext('2d'), scene, mesh, size, dpr,
    dark: !!opts.dark, anim: null, dirty: true,
    nextAuto: performance.now() + 1200 + Math.random() * 4000,
    autoEvery: opts.autoEvery ?? 5000,
    noAuto: !!opts.noAuto,
    onDone: null,
  };
  if (opts.hidden) mesh.scale.setScalar(0.001);
  canvas.addEventListener('click', () => spin(slot));
  slots.push(slot);
  return slot;
}

export function unmount(slot) {
  const i = slots.indexOf(slot);
  if (i >= 0) slots.splice(i, 1);
  slot.canvas.remove();
}

/** entry：进场——同一条曲线，同时从小长到原大（长大比转快，前 45% 就长完）。
    exit：退场——反过来，先慢后快地转走，后 45% 缩没。done 在落地 / 缩没那一拍调用。 */
export function spin(slot, { entry = false, exit = false, done = null } = {}) {
  if (slot.anim && !entry && !exit) return;
  slot.anim = { t0: performance.now(), th: planCurve(), entry, exit, beat: -1 };
  slot.onDone = done;
  if (entry) { slot.mesh.scale.setScalar(0.001); slot.dirty = true; }
}

function apply(s, a, t) {
  if (a.exit) {
    const e = 1 - EASE[state.ease](1 - t); // 镜像：先慢后快
    curveAt(a.th, e, s.mesh.quaternion);
    s.mesh.scale.setScalar(Math.max(0.001, 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2)));
    return;
  }
  const e = EASE[state.ease](t);
  curveAt(a.th, e, s.mesh.quaternion);
  if (a.entry) s.mesh.scale.setScalar(Math.max(0.001, EASE.cubic(Math.min(1, t / 0.45))));
}

function tick(now) {
  for (const s of slots) {
    if (state.auto && !s.noAuto && !s.anim && now > s.nextAuto) {
      spin(s);
      s.nextAuto = now + s.autoEvery * (0.7 + Math.random() * 0.6);
    }
    const a = s.anim;
    if (a) {
      const el = (now - a.t0) / 1000;
      let t;
      if (state.fps) {
        // 第一拍立刻动；之后每拍跳一次。先快后慢，所以越到后面每拍挪得越少
        const beat = Math.floor(el * state.fps) + 1;
        if (beat !== a.beat) { a.beat = beat; t = Math.min(1, beat / state.fps / state.dur); }
      } else {
        t = Math.min(1, el / state.dur);
      }
      if (t !== undefined) {
        apply(s, a, t);
        if (t >= 1) {
          s.mesh.quaternion.copy(REST);
          s.mesh.scale.setScalar(a.exit ? 0.001 : 1);
          s.anim = null;
          const cb = s.onDone; s.onDone = null; cb && cb();
        }
        s.dirty = true;
      }
    }
    if (s.dirty) { renderSlot(s); s.dirty = false; }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

export function set(key, val) {
  state[key] = val;
  slots.forEach((s) => (s.dirty = true));
}
export { state };

/* 截图用：?t=0.2 让每一颗停在各自曲线的时间 20% 处（已过缓动） */
const qs = new URLSearchParams(location.search);
if (qs.get('t') !== null) {
  state.auto = false;
  setTimeout(() => slots.forEach((s) => { apply(s, { th: planCurve() }, +qs.get('t')); s.dirty = true; }), 50);
}
